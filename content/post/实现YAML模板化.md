---
title: 自己动手写一个 Kubernetes YAML 模板化工具
date: 2020-11-08
tags: ["kubernetes", "yaml", "go", "helm", "kustomize"]
slug: code-k8s-yaml-templating
keywords: ["kubernetes", "yaml", "go", "helm", "kustomize", "模板"]
gitcomment: true
notoc: true
category: "kubernetes"
---
![自己动手写一个 Kubernetes YAML 模板化工具](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/use-go-code-k8s-yaml-template.png)

我们在使用 Kubernetes 编写资源清单文件的时候，往往会使用类似于 `Helm` 或者 `Kustomize` 这样的工具来进行模板化处理，一来是提高了资源清单的灵活性，另一方面也确实降低了我们安装复杂的 Kubernetes 应用的门槛。本文我们尝试自己使用 Golang 来实现一个 YAML 资源清单文件模板化的方案。

<!--more-->

## Golang 的模板化

Golang 中有一个支持模板文本文件的标准库 `text/template`，这个库允许我们运行函数、赋值等操作，并可以执行一些逻辑来替换一些源文本中的模板值，我们可以从文件中读取这些文本，也可以从一个字符串去进行解析。由于我们想要模板化 YAML 文件，所以会从文件中去读取，这样我们就可以用如下所示的代码来进行处理：

```go
package templates

import (
    "bytes"
    "path/filepath"
    "text/template"
    ...
)

func Read(filePath string) ([]byte, error) {
    tmpl, err := template.New(filepath.Base(filePath)).
    Funcs(availableFunctions).
    ParseFiles(filePath)
    if err != nil {
        return nil, err
    }
    var buf bytes.Buffer
    if err := tmpl.Execute(&buf, availableData); err != nil {
        return nil, err
    }
    return buf.Bytes(), nil
}
```

上面的代码读取一个位于 filePath 的文件，并将其作为模板，使用 `availableFunctions` 中的函数和 `availableData` 中的数据来填充所有的模板值。比如我们读取的是一个 ConfigMap 的 YAML 文件。

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
  namespace: {{ .Namespace }}
  labels:
    app: myapp
data:
  USER: admin
  PASSWORD: {{ GeneratePassword }}
```

然后我们把 `availableData` 和 `availableFunctions` 定义成如下所示的代码。

```go
var availableData = map[string]string{
    "Namespace": "my-namespace",
}
var availableFunctions = template.FuncMap{
    "GeneratePassword": GeneratePasswordFunc,
}

func GeneratePasswordFunc() (string, error) {
...
}
```

这样上面定义的 Read 函数调用后的输出结果如下所示。

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-configmap
  namespace: my-namespace
  labels:
    app: myapp
data:
  USER: admin
  PASSWORD: s0m3p455w0rd # 依赖你的 GeneratePassword 函数
```

## 在程序中使用 YAML

当我们使用 kubectl 这样的 CLI 工具的时候，在 Kubernetes 中使用 YAML 非常简单：

```bash
kubectl create -f myfile.yaml
```

但是如果要我们自己去编写代码来应用 YAML 文件的话，一般情况下会去使用 `client-go` 这个客户端工具包，但是 client-go 是针对静态类型的，而 YAML 文件中是没有对应的信息的，但是我们还可以通过下面两种方案来解决这个问题。

- 使用 YAML 中的 **Kind** 和 **Version** 反序列化为静态类型，然后使用它的类型化 REST 客户端进行通信。
- 使用 **Discovery** 功能，Discovery 允许我们动态地查找给定类型的 REST 客户端，而不是通过静态类型去访问，下面我们就使用这种方式来进行演示。

<!--adsense-text-->

首先我们需要像往常一样与 APIServer 通信创建一个 **ClientSet** 对象，如果我们从一个可以使用 kubectl 的系统执行代码，就意味着有一个可用的 `kubeconfig` 文件可以使用，通常这个文件为 `$HOME/.kube/config` 文件，如下所示：

```go
import (
    "k8s.io/client-go/tools/clientcmd"
    "k8s.io/client-go/kubernetes"
)
...
// 使用本地 ~/.kube/config 创建配置
kubeConfigPath := os.ExpandEnv("$HOME/.kube/config")
config, err := clientcmd.BuildConfigFromFlags("", kubeConfigPath)
if err != nil {
    log.Fatal(err)
}
// 使用上面的配置获取连接
c, err := kubernetes.NewForConfig(config)
if err != nil {
    log.Fatal(err)
}
```

**ClientSet** 相当于和 K8S 集群通信的网关，使用它我们可以获取对象来给我们提供发现接口。对于我们想要实现的功能，需要能够查询给定资源的类型，并与该类型的 REST 客户端进行通信，所以我们分别需要一个 **Discovery REST mapper** 和一个**动态的 REST 接口**，代码如下所示：

```go
import (
    "k8s.io/client-go/restmapper"
    "k8s.io/client-go/dynamic"
)
...
// 获取支持的资源类型列表
resources, err := restmapper.GetAPIGroupResources(c.Discovery())
if err != nil {
    log.Fatal(err)
}
// 创建 'Discovery REST Mapper'，获取查询的资源的类型
mapper:= restmapper.NewDiscoveryRESTMapper(resourcesAvailable)
// 获取 'Dynamic REST Interface'，获取一个指定资源类型的 REST 接口
dynamicREST, err := dynamic.NewForConfig(config)
if err != nil {
    log.Fatal(err)
}
```

接下来我们去查找 YAML 文件中所代表的对象类型，并得到一个支持它的 REST 客户端是不是就可以去操作这个资源对象了？

首先调用前面的 **Read** 函数读取并执行一个模板：

```go
finalYAML, err := templates.Read(myFilePath)
if err != nil {
    log.Fatal(err)
}
```

为了使用我们的 **Discovery** **REST mapper** 和**动态 REST 接口**，我们需要将 YAML 文件的内容 decode 成一个 `runtime.Objects` 对象。

首先将 YAML 文件内容根据 `---` 进行分割（一个 YAML 文件中可能有多个资源对象）：

```go
objectsInYAML := bytes.Split(yamlBytes, []byte("---"))
if len(objectsInYAML) == 0 {
    return nil, nil
}
```

然后在每个片段上使用 **k8s.io** 的反序列化功能输出得到 **runtime.Object** 对象，以及一个持有 **Group**、**Version** 和 **Kind** 信息的结构体。

```go
import(
    "k8s.io/apimachinery/pkg/runtime/serializer/yaml"
)
...
for _, objectInYAML := range objectsInYAML {
    runtimeObject, groupVersionAndKind, err := 
    yaml.
        NewDecodingSerializer(unstructured.UnstructuredJSONScheme).
        Decode(objectInYAML.Raw, nil, nil)
    if err != nil {
        log.Fatal(err)
    }
...
```

现在我们可以回头去使用我们的 RESTMapper，通过上面得到的 **GVK** 来获取一个映射：

```go
// 查找 Group/Version/Kind 的 REST 映射
mapping, err := d.mapper.RESTMapping(groupVersionAndKind.GroupKind(), groupVersionAndKind.Version)
if err != nil {
    log.Fatal(err)
}
```

有了资源类型，我们就可以使用前面的动态 REST 接口获取特定资源对象的客户端了：

```go
unstructuredObj := runtimeObject.(*unstructured.Unstructured)
var resourceREST dynamic.ResourceInterface
// 需要为 namespace 范围内的资源提供不同的接口
if mapping.Scope.Name() == meta.RESTScopeNameNamespace {
    if unstructuredObj.GetNamespace() == "" {
        unstructuredObj.SetNamespace("default")
    }
    resourceREST = 
    d.
      dynamicREST.
      Resource(mapping.Resource).
      Namespace(unstructuredObj.GetNamespace())
} else {
    resourceREST = d.dynamicREST.Resource(mapping.Resource)
}
```

到这里我们就可以在 Kubernetes 中使用得到的 client 对象来执行创建删除等操作了！

```go
import (
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)
// 创建对象
_, err = resourceREST.Create(unstructuredObj, metav1.CreateOptions{})
if err != nil {
    log.Fatal(err)
}
// 删除对象
prop := metav1.DeletePropagationForeground
err = resourceREST.Delete(unstructuredObj.GetName(),
    &metav1.DeleteOptions{
       PropagationPolicy: &prop,
    })
if err != nil {
   log.Fatal(err)
}
```

到这里我们就使用 Golang 完成了一个轻量级的 YAML 模板处理工具了。

<!--adsense-self-->
