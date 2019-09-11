---
title: Kubernetes 工作流引擎：Argo（1）
date: 2019-09-10
tags: ["kubernetes", "workflow", "Argo"]
slug: argo-workflow-engine-for-k8s
keywords: ["kubernetes", "workflow", "Argo", "工作流", "依赖", "模板"]
gitcomment: true
category: "kubernetes"
---
[Argo](https://applatix.com/open-source/argo/) 是 [Applatix](https://applatix.com/) 推出的一个开源项目，为 Kubernetes 提供 container-native（工作流中的每个步骤是通过容器实现）工作流程。Argo 可以让用户用一个类似于传统的 YAML 文件定义的 DSL 来运行多个步骤的 Pipeline。该框架提供了复杂的循环、条件判断、依赖管理等功能，这有助于提高部署应用程序的灵活性以及配置和依赖的灵活性。使用 Argo，用户可以定义复杂的依赖关系，以编程方式构建复杂的工作流、制品管理，可以将任何步骤的输出结果作为输入链接到后续的步骤中去，并且可以在可视化 UI 界面中监控调度的作业任务。

[![Argo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-k8s.png)](/post/argo-workflow-engine-for-k8s/)

<!--more-->

## Argo 简介

Argo V2 版本通过 Kubernetes CRD（Custom Resource Definition）来进行实现的，所以我们可以通过 kubectl 工具来管理 Argo 工作流，当然就可以和其他 Kubernetes 资源对象直接集成了，比如 Volumes、Secrets、RBAC 等等。新版本的 Argo 更加轻量级，安装也十分简单，但是依然提供了完整的工作流功能，包括参数替换、制品、Fixture、循环和递归工作流等功能。

Argo 中的工作流自动化是通过使用 ADSL（Argo 领域特定语言）设计的 YAML 模板（因为 Kubernetes 主要也使用相同的 DSL 方式，所以非常容易使用）进行驱动的。ADSL 中提供的每条指令都被看作一段代码，并与代码仓库中的源码一起托管。Argo 支持6中不同的 YAML 结构：

* 容器模板：根据需要创建单个容器和参数
* 工作流模板：定义一个作业任务（工作流中的一个步骤可以是一个容器）
* 策略模板：触发或者调用作业/通知的规则
* 部署模板：创建一个长期运行的应用程序模板
* Fixture 模板：整合 Argo 外部的第三方资源
* 项目模板：可以在 Argo 目录中访问的工作流定义

Argo 支持几种不同的方式来定义 Kubernetes 资源清单：[Ksonnect](https://ksonnet.io/)、[Helm Chart](http://helm.io/) 以及简单的 YAML/JSON 资源清单目录。

## 安装
安装 Argo 非常简单，首先当然需要一个 Kubernetes 集群（1.9+版本），kubectl 工具以及访问集群的 kubeconfig 文件（默认位于`~/.kube/config`）。

Mac 系统：
```shell
$ brew install argoproj/tap/argo
```

Linux 系统：
```shell
$ curl -sSL -o /usr/local/bin/argo https://github.com/argoproj/argo/releases/download/v2.2.1/argo-linux-amd64
chmod +x /usr/local/bin/argo
```

安装完成后，可以使用下面命令校验是否安装成功：
```shell
$ argo version
argo: v2.3.0
  BuildDate: 2019-05-20T22:11:23Z
  GitCommit: 88fcc70dcf6e60697e6716edc7464a403c49b27e
  GitTreeState: clean
  GitTag: v2.3.0
  GoVersion: go1.11.5
  Compiler: gc
  Platform: darwin/amd64
```

然后安装控制器和 UI 界面：
```shell
$ kubectl create ns argo
$ kubectl apply -n argo -f https://raw.githubusercontent.com/argoproj/argo/v2.3.0/manifests/install.yaml
```

安装完成后，为了访问方便，我们将 argo-ui 改成 NodePort 类型的 Service（当然也可以创建 Ingress 对象通过域名进行访问）：
```shell
$ kubectl get pods -n argo
NAME                                   READY   STATUS              RESTARTS   AGE
argo-ui-76c6cf75b4-vh6w6               0/1     ContainerCreating   0          14s
workflow-controller-69f6ff7cbc-5pqbj   0/1     ContainerCreating   0          14s
$ kubectl get pods -n argo
NAME                                   READY   STATUS    RESTARTS   AGE
argo-ui-76c6cf75b4-vh6w6               1/1     Running   0          10m
workflow-controller-69f6ff7cbc-5pqbj   1/1     Running   0          10m
$ kubectl get svc -n argo
NAME      TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
argo-ui   ClusterIP   10.97.124.167   <none>        80/TCP    10m
$ kubectl edit svc argo-ui -n argo
kind: Service
metadata:
......
spec:
......
  sessionAffinity: None
  type: NodePort
......
service/argo-ui edited
$ kubectl get svc -n argo
NAME      TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
argo-ui   NodePort   10.97.124.167   <none>        80:32686/TCP   12m
$ kubectl get crd |grep argo
workflows.argoproj.io                         2019-09-10T03:27:41Z
$ kubectl api-versions |grep argo
argoproj.io/v1alpha1
```

然后我们就通过上面的 32686 端口来访问 argo-ui 了：

![argo ui empty](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-ui-empty.png)

到这里就证明 Argo 的基础环境就已经安装完成了。

## 基本的 Argo 工作流模板
下面是一个非常简单的模板，首先定义了一个工作流，创建一个带有两个容器的 Pod，其中一个容器带有 curl 命令，而另外一个容器是一个 nginx sidecar 容器，这里 curl 这个容器是“主”容器，用于轮询 nginx sidecar 容器，直到它准备好为请求提供服务为止。

![Argo 配置工作流模板](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-base-template.png)

将上面模板保存为名为 argo-base-template.yaml 的文件，然后可以使用 argo 命令来提交这个工作流：
```shell
$ argo submit argo-base-template.yaml
Name:                sidecar-nginx-ftcpf
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Tue Sep 10 12:05:53 +0800 (now)
$ argo list
NAME                  STATUS    AGE   DURATION   PRIORITY
sidecar-nginx-ftcpf   Running   15m   15m        0
```

> 当然同样的我们可以直接使用 kubectl 来进行安装，但是 Argo CLI 提供了更强大的功能，比如 YAML 校验、参数传递、重试等等功能。

![argo base template events](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-base-template-events.png)

上面就是我们定义的一个工作流，创建一个 Pod 并执行 Workflow 中定义的配置：

![argo workflow lifecycle](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-workflow-lifecycle.png)


同样可以通过`argo logs`查看容器日志，也可以通过 argo-ui 在页面上查看相关信息：

![argo dashboard views](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-ui-view.png)


## 带条件的工作流模板
前面我们提到过 Argo 支持工作流执行过程中的条件语句。Argo 提供的 [Coinflip](https://raw.githubusercontent.com/argoproj/argo/master/examples/coinflip.yaml) 示例就描述了如何在模板中使用`“when”`，其执行依赖于从父级接收的输出。

![argo workflow condition demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-workflow-condition-demo.png)

将 Coinflip 保存到本地：
```shell
$ wget https://raw.githubusercontent.com/argoproj/argo/master/examples/coinflip.yaml
```

![argo coinflip demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-coinflip-demo.png)

上面的 Worflow 运行一个随机的整数脚本，常量为 0=heads、1=tails，调用特定模板（heads 或者 tails）取决于“flip-coin”任务的输出，如上面 Workflow 图中所示，flip-coin 任务执行 heads 任务只有当 heads 模板被执行的时候。
<!--adsense-text-->
同样，使用`argo submit`来提交 Coinflip 这个 Workflow：
```shell
$ argo submit coinflip.yaml
Name:                coinflip-pr9x9
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Tue Sep 10 15:56:04 +0800 (now)
$ argo get coinflip-pr9x9
Name:                coinflip-pr9x9
Namespace:           default
ServiceAccount:      default
Status:              Failed
Message:             child 'coinflip-pr9x9-3371049263' failed
Created:             Tue Sep 10 15:56:04 +0800 (4 minutes ago)
Started:             Tue Sep 10 15:56:04 +0800 (4 minutes ago)
Finished:            Tue Sep 10 15:59:40 +0800 (51 seconds ago)
Duration:            3 minutes 36 seconds

STEP               PODNAME                    DURATION  MESSAGE
 ✖ coinflip-pr9x9                                       child 'coinflip-pr9x9-3371049263' failed
 └---⚠ flip-coin   coinflip-pr9x9-3371049263  3m        failed to save outputs: verify serviceaccount default:default has necessary privileges
```

可以看到这里出现了一个权限错误，Argo 官网上给出的解决方案是给 default:default 绑定上 admin 的 clusterrole 权限：
```shell
$ kubectl create rolebinding default-admin --clusterrole=admin --serviceaccount=default:default
```

然后删除上面的 Workflow，重新创建：
```shell
$ argo delete coinflip-pr9x9
$ argo submit coinflip.yaml
Name:                coinflip-jxmzx
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Tue Sep 10 16:30:59 +0800 (now)
``` 

![argo coinflip get](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-coinflip-get.png)


上面的 Workflow 将会创建两个容器，一个是用于执行 randomint python 脚本，另外一个是用于根据脚本的执行结果执行的 tails 模板，如下所示，tails 模板根据 randomint 脚本的结果（result==tails）被调用执行了：
```shell
$ kubectl get pods
NAME                                   READY   STATUS      RESTARTS   AGE
coinflip-jxmzx-1126897109              0/2     Completed   0          3m28s
coinflip-jxmzx-3981997132              0/2     Completed   0          3m36s
$ kubectl logs coinflip-jxmzx-3981997132 main
tails
$ kubectl logs coinflip-jxmzx-1126897109 main
it was tails
```

![argo coinflip ui view](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-coinflip-ui-view.png)

类似地，递归（递归调用模板）也可以添加到条件规范中，例如，下面的模板输出显示 flip-coin 模板执行 n 次，直到结果为 heads 为止，下载 flip-coin 递归模板示例：
```shell
$ wget https://raw.githubusercontent.com/argoproj/argo/master/examples/coinflip-recursive.yaml
```

我们可以简单对比下前面的 coinflip，基本上是一致的，唯一的区别就是 tails 模板重新指向了 coinflip，这样就形成了递归：

![argo coinflip recursive](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20190910164935.png)

然后用同样的方法来提交这个 Workflow，可以通过`argo get`命令来查看具体的执行步骤：

![argo coinflip recursive](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-coinflip-recursive.png)

我们可以看到这里递归执行了4次，最后才出现 flip-coin 的模板输出 heads，这个时候递归才退出，每一次递归调用都会产生一个 Pod，加上最后的 heads 模板，所以一共会产生 5 个 Pod：
```shell
$ kubectl get pods
NAME                                   READY   STATUS      RESTARTS   AGE
coinflip-recursive-9dpxn-1771762865    0/2     Completed   0          8m33s
coinflip-recursive-9dpxn-177901715     0/2     Completed   0          8m26s
coinflip-recursive-9dpxn-3162439927    0/2     Completed   0          8m41s
coinflip-recursive-9dpxn-3886219258    0/2     Completed   0          8m19s
coinflip-recursive-9dpxn-545668525     0/2     Completed   0          8m49s
```

同样可以在 argo-ui 中查看这个 Workflow 的调用示意图：

![argo coinflip recursive ui view](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-coinflip-recursive-ui-view.png)


## 带循环和参数的 Workflow 模板
Argo 可以很方便的迭代 Workflow 中的一组输入，也可以处理用户提供参数（比如：输入参数）。在下面的 Workflow 中，使用两个输入参数`“hello kubernetes”`和`“hello argo”`来执行 Whalesay 模板。

下载这里我们需要使用的 Workflow 示例：
```shell
$ wget https://raw.githubusercontent.com/argoproj/argo/master/examples/loops.yaml
```

不过需要注意，我们需要把 loops.yaml 文件里面的 withItems 修改成下面的参数值：
```yaml
withItems:
- hello kubernetes
- hello argo
```

完整的 YAML 文件内容如下所示：

![argo loops configuration](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-loops.png)


上面的模板包含一个单独的模板，通过使用一个 items 列表并根据提供的参数值数量来运行任务，所以，会创建两个 Pod，一个使用`“hello kubernetes”`参数，另外一个使用`“hello argo”`参数，同样使用`argo submit`命令来创建这个 Workflow：
```shell
$ argo submit loops.yaml
Name:                loops-ftm5r
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Tue Sep 10 17:33:50 +0800 (now)
```

使用`argo get`命令来查看这个 Workflow 的详细信息，可以看到迭代了两个步骤出来，当然就会产生两个 Pod：

![argo loop events](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-loops-events.png)


我们去查看生成的两个 Pod 的日志信息，里面就包含上面的传入的两个参数`“hello kubernetes”`和`“hello argo”`的信息：

![Workflow Execution with Looping Configuration](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-loops-logs.png)

类似的我们还可以完成更加复杂的循环：循环迭代一组 items，动态生成 items 列表等，具体的实现我们直接查看 Argo GitHub 仓库上面提供的 example 样例：[https://github.com/argoproj/argo/blob/master/examples/](https://github.com/argoproj/argo/blob/master/examples/)。


## 由 DAG（有向无环图）和步骤的依赖定义的多步骤工作流模板
Argo 允许用户使用简单的 Python 对象 DAG 启动多步骤的 Pipeline，还可以在工作流规范中定义多个模板（嵌套工作流）。

下载使用的示例文件：
```shell
$ wget https://raw.githubusercontent.com/argoproj/argo/master/examples/dag-diamond.yaml
```

Workflow 更详细的内容如下所示：

![DAG Dependency based Workflow Configuration](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-dag.png)

接下来我们来提交这个 Workflow：
```shell
$ argo submit dag-diamond.yaml
Name:                dag-diamond-qv45w
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Tue Sep 10 18:59:24 +0800 (now)
```

然后使用`argo get`命令来查看这个 Workflow 的详细信息：

![DAG Execution](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-dag-events.png)

同样在 argo-ui 中也可以查看到这个 Workflow 的依赖关系：

![argo dag ui view](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-dag-ui-view.png)



## 使用 Minio 进行制品管理和 Argo 集成
制品是任何工作流的一部分（比如：CI/CD 中），工作流中的步骤会生成制品，然后其他后续步骤可以使用这个制品。

我们这里使用 Minio 来作为制品仓库，Minio 是兼容 Amazon S3 API 的开源对象存储服务器。
<!--adsense-text-->
首先先安装 Minio，我们这里使用 Helm 来快速的安装，如果对 Helm 的使用还不熟悉的，可以查看前面我们的文章：[Kubernetes Helm 初体验](/post/first-use-helm-on-kubernetes/)。
```shell
$ helm install stable/minio --name minio --set service.type=NodePort --set defaultBucket.enabled=true --set defaultBucket.name=my-bucket --set persistence.enabled=false --namespace argo
```

我们这里指定了一个名为 my-bucket 的默认 Bucket，使用 NodePort 类型的 Service，另外需要注意的是我这里单纯为了测试，所以将 persistence.enabled 设置为了 false，对于线上环境一定要记得持久化数据：
```shell
$ kubectl get pods -n argo  -l app=minio
NAME                     READY   STATUS    RESTARTS   AGE
minio-7954d6976d-jjm42   1/1     Running   0          9m25s
$ kubectl get svc -n argo  -l app=minio
NAME    TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE
minio   NodePort   10.109.167.218   <none>        9000:31311/TCP   9m31s
```

到这里证明 Minio 就已经安装成功了，然后我们就可以通过 31311 这个 NodePort 端口访问 Minio 的 Dashboard 页面，我们可以使用默认的 accessKey（AKIAIOSFODNN7EXAMPLE） 和 secretKey（wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY）登录：

![minio ui](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/minio-ui.png)


然后我们需要把 Minio 和 Argo 集成在一起，通过编辑 workflow-controller configmap 来引用上面的 Minio Service 和 Secret，上面我们通过 Helm 安装 Minio 的时候会自动将默认的 accessKey 和 secretKey 添加到名为 minio 的 Secret 对象中去：
```shell
$ kubectl get secret minio -n argo -o yaml
apiVersion: v1
data:
  accesskey: QUtJQUlPU0ZPRE5ON0VYQU1QTEU=
  secretkey: d0phbHJYVXRuRkVNSS9LN01ERU5HL2JQeFJmaUNZRVhBTVBMRUtFWQ==
kind: Secret
......
type: Opaque
```

直接编辑 workflow-controller-configmap，按照如下方式添加上 Minio 相关配置：
```yaml
...
data:
  config: |
    artifactRepository:
      s3:
        bucket: my-bucket  # 默认的 bucket 名称
        endpoint: minio.argo:9000  # Minio 服务地址
        insecure: true
        # accessKeySecret 和 secretKeySecret 是 secret 中包含的，引入名为 minio 的 k8s secret 对象，这两个 key：'accesskey' 和 'secretkey', 存储 真是的 minio 认证信息。
        accessKeySecret:
          name: minio
          key: accesskey
        secretKeySecret:
          name: minio
          key: secretkey
kind: ConfigMap
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","kind":"ConfigMap","metadata":{"annotations":{},"name":"workflow-controller-configmap","namespace":"argo"}}
  creationTimestamp: "2019-09-10T03:27:43Z"
  name: workflow-controller-configmap
  namespace: argo
  resourceVersion: "1890436"
  selfLink: /api/v1/namespaces/argo/configmaps/workflow-controller-configmap
  uid: b1fd1a24-721d-4ce1-a02c-90fff0e931ee
```

编辑完成后我们就完成了 Minio 和 Argo 的集成。不过这里需要注意的是 Secret 对象是 namespace 作用域的，上面 ConfigMap 解析 Secret 对象是和我们使用的 Workflow 的 namespace 中获取 Minio Secret 的，所以如果 Minio 和 Workflow 不在同一个 namespace 下面，需要我们拷贝一份 Secret 到对应的 namespace 下面去，比如我们这里 Workflow 都在 default 这个 namespace 下面，那么我就需要在 default 下面创建相同的 Secret：(minio-secret.yaml)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio
type: Opaque
data:
  accesskey: QUtJQUlPU0ZPRE5ON0VYQU1QTEU=
  secretkey: d0phbHJYVXRuRkVNSS9LN01ERU5HL2JQeFJmaUNZRVhBTVBMRUtFWQ==
```

创建上面的 Secret 对象：
```shell
$ kubectl create -f minio-secret.yaml
```

然后下载我们这里使用到的 Workflow 示例文件：
```shell
$ wget https://raw.githubusercontent.com/argoproj/argo/master/examples/artifact-passing.yaml
```

详细的 Workflow 内容如下图所示：

![Artifactory Management Configuration](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-artifact.png)

上面 Workflow 包括两个步骤：

* 步骤1生成制品：使用 whalesay 模板生成制品
* 步骤2消费制品：使用步骤1中创建的制品并打印消息。

同样，我们使用`argo submit`命令提交这个 Workflow：
```shell
$ argo submit artifact-passing.yaml
Name:                artifact-passing-x4rhq
Namespace:           default
ServiceAccount:      default
Status:              Pending
Created:             Wed Sep 11 12:01:07 +0800 (now)
```

![argo artifact events](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/argo-artifact-events.png)

我们可以看到上面 Workflow 的两个步骤都已经成功了，然后我们去 minio-ui 上面就可以查看到上面 Workflow 生成的制品了：

![minio ui data](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/minio-ui-data.png)


上面我们创建的制品被存储在 Minio 的 my-bucket 中，消费制品的任务根据 Workflow 中的定义根据提供的配置拉取制品，Minio 类似于 S3 提供了一个可共享的链接来使用制品:

![minio ui sharedata](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/minio-ui-sharedata.png)

除了上面提到的这些用法之外，Argo Workflow 还有很多其他用法，我们可以查看 Argo 官方提供的样例了解更多使用方法：[https://github.com/argoproj/argo/tree/master/examples](https://github.com/argoproj/argo/tree/master/examples)。

本文更多的是提到 Argo Workflow 的一些基本使用方法，下一篇文章我们再通过一个完整的示例来演示下 Argo Workflow 的实际用途。

## 参考链接

* [Argo Getting Started](https://argoproj.github.io/docs/argo/demo.html)
* [Argo: Workflow Engine for Kubernetes](https://itnext.io/argo-workflow-engine-for-kubernetes-7ae81eda1cc5)
* [Argo examples](https://github.com/argoproj/argo/tree/master/examples)

<!--adsense-self-->

