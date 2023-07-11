---
title: Helm Chart 模板开发技巧
date: 2019-04-29
tags: ["kubernetes", "helm", "golang"]
keywords: ["kubernetes", "helm", "chart", "template", "golang", "模板"]
slug: helm-chart-tips-and-tricks
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/bxf3k.jpeg",
      desc: "https://unsplash.com/photos/gfaxAiOgxSc",
    },
  ]
category: "kubernetes"
---

[Helm](/tags/helm/) Chart 在我们使用的时候非常方便的，但是对于开发人员来说 Helm Chart 模板就并不一定显得那么友好了，本文主要介绍了 Helm Chart 模板开发人员在构建生产级的 Chart 包时的一些技巧和窍门。

<!--more-->

### 了解你的模板功能

[Helm](/tags/helm/) 使用[Go Template](https://godoc.org/text/template)来模板化资源文件。在 Go 提供的内置函数基础上，还添加了许多其他功能。

首先，添加了[Sprig 库](https://godoc.org/github.com/Masterminds/sprig)中的几乎所有函数，出于安全原因，删除了两个函数：`env`和`expandenv`（这会让 Chart 模板开发者访问到 Tiller 的环境）。

<!--adsense-text-->

另外还添加了两个特殊的模板函数：`include`和`required`，`include`函数允许你引入另一个模板，然后将结果传递给其他模板函数。

例如，下面的模板片段中引用了一个名为`mytpl`的模板，然后将结果转成小写，并用双引号包装起来：

```go
value: {{ include "mytpl" . | lower | quote }}
```

`required`函数允许你根据模板的需要声明特定的值，如果值为空，则默认渲染的时候会报错。下面的这个示例被声明为 .Values.who 是必须的，为空的时候会打印出一段错误提示信息：

```go
value: {{required "A valid .Values.who entry required!" .Values.who }}
```

### 引用字符串，不要引用整数

当你使用字符串数据的时候，为了安全考虑应该总是使用字符串而不是直接暴露出来：露：

```go
name: {{ .Values.MyName | quote }}
```

当使用整数时，不要直接引用这些值，在很多情况下，可能会导致 [Kubernetes](/tags/kubernetes/) 内部的解析错误。

```go
port: {{ .Values.Port }}
```

### 使用 include 功能

Go 提供了一种使用内置`template`指令将一个模板包含在另外一个模板中的方法。但是，内置函数不能用于 Go 模板管道。为了能够包含模板，然后对该模板的输出执行操作，Helm 提供了特殊的`include`功能：

```go
{{ include "toYaml" $value | indent 2}}
```

上面包含一个名为`toYaml`的模板，然后将值`$value`传递给模板，最后将该模板的输出传递给`indent`函数。

由于 YAML 对于缩进级别和空格的重要性，所以这是包含代码片段的一种很好的方法，但是需要在相关的上下文中处理缩进。

### 使用 tpl 函数

`tpl`函数运行允许开发人员将字符串计算为模板内的模板，这对于将模板字符串作为值传递给 Chart 或者呈现外部配置文件很有用：`{{ tpl TEMPLATE_STRING VALUES }}`

例子：

```go
# values
template: "{{ .Values.name }}"
name: "Tom"

# template
{{ tpl .Values.template . }}

# output
Tom
```

渲染外部配置文件：

```go
# external configuration file conf/app.conf
firstName={{ .Values.firstName }}
lastName={{ .Values.lastName }}

# values
firstName: Peter
lastName: Parker

# template
{{ tpl (.Files.Get "conf/app.conf") . }}

# output
firstName=Peter
lastName=Parker
```

### 创建 imagePullSecret

`imagePullSecret`基本上是`registry、用户名和密码`的组合，我们在使用私有仓库的时候需要使用到，需要用`base64`对这些数据进行编码，我们可以编写一个模板来生成这个配置文件：

首先，假设我们在`values.yaml`中定义如下：

```yaml
imageCredentials:
  registry: quay.io
  username: someone
  password: sillyness
```

然后我们可以这样来定义模板：

```go
{{- define "imagePullSecret" }}
{{- printf "{\"auths\": {\"%s\": {\"auth\": \"%s\"}}}" .Values.imageCredentials.registry (printf "%s:%s" .Values.imageCredentials.username .Values.imageCredentials.password | b64enc) | b64enc }}
{{- end }}
```

最后，我们在 Secret 模板中使用上面定义的模板来创建对象：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myregistrykey
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: { { template "imagePullSecret" . } }
```

### ConfigMap 或者 Secret 更改时自动更新

ConfigMap 或者 Secret 通常作为配置文件注入到容器中，如果后面使用`helm upgrade`来升级更新这些应用程序，则可能需要重新启动，但如果部署的资源清单数据没有改变则应用程序还会继续使用旧的配置，从而导致部署不一致。

`sha256sum`函数可用于确保在另一个文件更改时更新部署的 annotations 部分：

```yaml
kind: Deployment
spec:
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
[...]
```

更多的信息我们可以查看`helm upgrade --recreate-pods`命令来了解这个问题的其他信息。

<!--adsense-->

### 告诉 Tiller 不要删除资源

有的时候在运行`helm delete`命令后有些资源不应该被删除。Chart 开发者可以在资源对象中添加一个 annotation 来保护资源不被删除：

```yaml
kind: Secret
metadata:
  annotations:
    "helm.sh/resource-policy": keep
[...]
```

> 注意引号是必须的

`"helm.sh/resource-policy": keep`这个 annotation 用来指示 Tiller 在删除一个 realease 的时候跳过当前这个资源。但是需要注意的是，这样这个资源就变成了`孤儿`，Helm 将不会再管理它了，如果在已经删除但是仍然还保留了部分资源的 realese 上面使用`helm install --replace`命令可能就会出现问题了。

### 使用`Partials`

有时候可能你想要在 Chart 中创建一些可重复使用的片段，无论是一块还是模板的一部分，通常将它们保存在自己的文件中会更清晰。

在`templates/`目录下面，任何以下划线(\_)开头的文件都不会被输出到 Kubernetes 资源清单文件中去，按照惯例，帮助模板一般放在`_helpers.tpl`文件中。

### 有需要依赖的复杂 Chart

官方的 Chart 仓库中有许多 Chart 都是用于创建更加高级的应用程序的“构建块”。但是 Chart 也可以用于创建大型应用程序。在这种情况下，单个 Chart 可能需要包含多个子 Chart，每个子 Chart 作为整体的一部分。

对于复杂的应用程序当前最佳的实践方式是创建一个顶级的 Chart，然后使用`charts`子目录嵌入每个组件。

下面是两个复杂的项目使用案例：

**SAP 的 OpenStack Chart：**这个 Chart 包用于在 Kubernetes 上安装一套完整的`OpenStack IaaS`系统，所有的 Charts 包都在这个 Github 仓库中：[openstack-helm](https://github.com/sapcc/helm-charts)

**Deis 的 Workflow：**这个 Chart 包使用一个 Chart 安装整个 Deis PaaS 系统，但是它与`SAP Chart`的不同之处在于，每个子 Chart 都是独立的，都在不同的 Git 仓库中进行托管的，查看`requirements.yaml`文件，可以了解该 Chart 是如何通过他的 CI/CD pipeline 构建的。仓库地址：[Workflow](https://github.com/deis/workflow/tree/master/charts/workflow)

这两个 Chart 都说明了使用 Helm 构建复杂环境是很成熟的技术。

### YAML 是 JSON 的超集

根据 YAML 的规范，YAML 是 JSON 的超集，这意味着任何有效的 JSON 结构在 YAML 中都是有效的。

所以有时候可能我们去使用 JSON 的语法来表达数据结构更容易，而不是去处理 YAML 的空白。

当然作为最佳实践，模板应该遵循 YAML 的语法，除非 JSON 语法大大降低了格式化问题的风险。

### 小心生成随机值

Helm 中有一些功能运行你生成随机数据，加密密钥等，但需要注意的是，在升级过程中，会重新执行模板渲染，当模板运行生成的数据与上次不一致时，会触发该资源的更新。

### 系统的升级版本

在安装和升级版本时使用相同的命令：

```shell
helm upgrade --install <release name> --values <values file> <chart directory>
```

### 相关链接

- https://github.com/technosophos/k8s-helm/blob/master/docs/charts_tips_and_tricks.md
- https://github.com/sapcc/helm-charts
- https://github.com/deis/workflow/tree/master/charts/workflow
- https://godoc.org/text/template
- https://godoc.org/github.com/Masterminds/sprig

<!--adsense-self-->
