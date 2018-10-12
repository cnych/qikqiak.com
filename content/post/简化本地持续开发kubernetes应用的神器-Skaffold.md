---
title: Skaffold-简化本地开发kubernetes应用的神器
subtitle: 墙裂推荐kubernetes应用开发者使用的工具
date: 2018-03-27
tags: ["kubernetes", "skaffold", "CI/CD"]
keywords: ["kubernetes", "skaffold", "持续开发", "神器", "CI/CD"]
slug: skaffold-simple-local-develop-k8s-app-tools
gitcomment: true
bigimg: [{src: "/img/posts/photo-1509565840034-3c385bbe6451.jpeg", desc: "nothing"}]
category: "kubernetes"
---

在我们开发`kubernetes`应用的过程中，一般情况下是我们在本地开发调试测试完成以后，再通过`CI/CD`的方式部署到`kubernetes`的集群中，这个过程首先是非常繁琐的，而且效率非常低下，因为你想验证你的每次代码修改，就得提交代码重新走一遍`CI/CD`的流程，我们知道编译打包成镜像这些过程就是很耗时的，即使我们在自己本地搭建一套开发`kubernetes`集群，也同样的效率很低。在实践中，若不在本地运行那些服务，调试将变得颇具挑战。就在几天前，我遇到了`Skaffold`，它是一款命令行工具，旨在促进`kubernetes`应用的持续开发，`Skaffold`可以将构建、推送及向`kubernetes`集群部署应用程序的过程自动化，听上去是不是很舒服呀~~~

<!--more-->

## 介绍
`Skaffold`是一款命令行工具，旨在促进`Kubernetes`应用的持续开发。你可以在本地迭代应用源码，然后将其部署到本地或者远程`Kubernetes`集群中。`Skaffold`会处理构建、上传和应用部署方面的工作流。它通用可以在自动化环境中使用，例如`CI/CD`流水线，以实施同样的工作流，并作为将应用迁移到生产环境时的工具 —— `Skaffold`官方文档

`Skaffold`的特点：

 * 没有服务器端组件，所以不会增加你的集群开销
 * 自动检测源代码中的更改并自动构建/推送/部署
 * 自动更新镜像**TAG**，不要担心手动去更改`kubernetes`的 manifest 文件
 * 一次性构建/部署/上传不同的应用，因此它对于微服务同样完美适配
 * 支持开发环境和生产环境，通过仅一次运行manifest，或者持续观察变更

另外`Skaffold`是一个可插拔的架构，允许开发人员选择自己最合适的工作流工具
![Skaffold](/img/posts/plugability.png)

我们可以通过下面的 gif 图片来了解`Skaffold`的使用
![skaffold-demo](https://my-oss-testing.oss-cn-beijing.aliyuncs.com/blog/intro.gif)

## 使用
要使用`Skaffold`最好是提前在我们本地安装一套单节点的`kubernetes`集群，比如`minikube`或者`Docker for MAC/Windows`的**Edge**版

### 安装
您将需要安装以下组件后才能开始使用`Skaffold`：

#### 1. skaffold
下载最新的`Linux`版本，请运行如下命令：
 ```shell
$ curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-linux-amd64 && chmod +x skaffold && sudo mv skaffold /usr/local/bin
```
下载最新的`OSX`版本，请运行：
```shell
$ curl -Lo skaffold https://storage.googleapis.com/skaffold/releases/latest/skaffold-darwin-amd64 && chmod +x skaffold && sudo mv skaffold /usr/local/bin
```
当然如果由于某些原因你不能访问上面的链接的话，则可以前往`Skaffold`的[github release](https://github.com/GoogleCloudPlatform/skaffold/releases)页面下载相应的安装包。

#### 2. Kubernetes集群
其中[Minikube](https://kubernetes.io/docs/tasks/tools/install-minikube/)， [GKE](https://cloud.google.com/kubernetes-engine/docs/how-to/creating-a-container-cluster)， [Docker for Mac（Edge）](https://docs.docker.com/docker-for-mac/install/)和[Docker for Windows（Edge）](https://docs.docker.com/docker-for-windows/install/) 已经过测试，但任何`kubernetes`群集都是可以使用，为了简单起见，我这里使用的是`Docker for Mac（Edge）`

#### 3. kubectl
要使用`kubernetes`那么肯定`kubectl`也是少不了的，在本地配置上你的目标群集的当前上下文进行开发

#### 4. Docker
这个应该不用多说了吧？

#### 5. Docker 镜像仓库
如果你有私有的镜像仓库，则要先配置上相关的登录认证之类的。我这里为了方便，就直接使用`Docker Hub`，当然要往上面推送镜像的话，你得提前去[docker hub](https://hub.docker.com)注册一个帐号


### 开发
我们可以在本地开发一个非常简单的应用程序，然后通过`Skaffold`来进行迭代开发，这里我们直接使用`Skaffold`的官方示例，首先**clone**代码：
```shell
$ git clone https://github.com/GoogleCloudPlatform/skaffold
```

然后我们定位到`examples/getting-started`目录下去：
```shell
$ cd examples/getting-started
$ tree .
.
├── Dockerfile
├── k8s-pod.yaml
├── main.go
├── skaffold-gcb.yaml
└── skaffold.yaml

0 directories, 5 files
```
该目录下面有一个非常简单的`golang`程序:（main.go）
```golang
package main
import (
    "fmt"
    "time"
)

func main() {
    for {
        fmt.Println("Hello Skaffold!")
        time.Sleep(time.Second * 2)
    }
}
```
其中`skaffold-gcb.yaml`文件我们可以暂时忽略，这个文件是和google cloud结合使用的，我们可以看下`skaffold.yaml`文件内容，这里我已经将镜像名称改成了我自己的了（cnych/skaffold-example），如下：
```yaml
apiVersion: skaffold/v1alpha1
kind: Config
build:
  artifacts:
  - imageName: cnych/skaffold-example
    workspace: .
  local: {}
deploy:
  kubectl:
    manifests:
    - paths:
      - k8s-*
      parameters:
        IMAGE_NAME: cnych/skaffold-example
```
然后我们可以看到`k8s-pod.yaml`文件，其中的镜像名称是一个`IMAGE_NAME`的参数，这个地方`Skaffold`会自动帮我们替换成正在的镜像地址的，所以不用我们做任何更改了，如下：
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: getting-started
spec:
  containers:
  - name: getting-started
    image: IMAGE_NAME
```

然后我们就可以在`getting-started`目录下面执行`skaffold dev`命令了：
```shell
$ skaffold dev
Starting build...
Found minikube or Docker for Desktop context, using local docker daemon.
Sending build context to Docker daemon  6.144kB
Step 1/5 : FROM golang:1.9.4-alpine3.7
 ---> fb6e10bf973b
Step 2/5 : WORKDIR /go/src/github.com/GoogleCloudPlatform/skaffold/examples/getting-started
 ---> Using cache
 ---> e6ae5322ee52
Step 3/5 : CMD ["./app"]
 ---> Using cache
 ---> bac5f3fd392e
Step 4/5 : COPY main.go .
 ---> Using cache
 ---> 47fa1e536263
Step 5/5 : RUN go build -o app main.go
 ---> Using cache
 ---> f1470fe9f398
Successfully built f1470fe9f398
Successfully tagged a250d03203f9a5df267d8ad63bae8dba:latest
Successfully tagged cnych/skaffold-example:f1470fe9f3984775f5dea87b5f720d67b6c2eeaaf2ca5efd1ca3c3ec7c4d4cce
Build complete.
Starting deploy...
Deploying k8s-pod.yaml...
Deploy complete.
Dependencies may be incomplete.
[getting-started getting-started] Hello Skaffold!
[getting-started getting-started] Hello Skaffold!
```
`Skaffold`已经帮我们做了很多事情了：

 * 用本地源代码构建 Docker 镜像
 * 用它的`sha256`值作为镜像的标签
 * 设置`skaffold.yaml`文件中定义的 kubernetes manifests 的镜像地址
 * 用`kubectl apply -f`命令来部署 kubernetes 应用

部署完成后，我们可以看到 pod 打印出了如下的信息：
```shell
[getting-started getting-started] Hello Skaffold!
[getting-started getting-started] Hello Skaffold!
[getting-started getting-started] Hello Skaffold!
```

同样的，我们可以通过`kubectl`工具查看当前部署的 POD：
```shell
$ kubectl get pods
NAME              READY     STATUS    RESTARTS   AGE
getting-started   1/1       Running   3          1h
```
然后我们可以打印出上面的 POD 的详细信息：
```shell
$ kubectl get pod getting-started  -o yaml
...
spec:
  containers:
  - image: cnych/skaffold-example:f1470fe9f3984775f5dea87b5f720d67b6c2eeaaf2ca5efd1ca3c3ec7c4d4cce
    imagePullPolicy: IfNotPresent
    name: getting-started
...
```
我们可以看到我们部署的 POD 的镜像地址，和我们已有的 docker 镜像地址和标签是一样的：
```shell
$ docker images |grep skaffold
cnych/skaffold-example                                    f1470fe9f3984775f5dea87b5f720d67b6c2eeaaf2ca5efd1ca3c3ec7c4d4cce   f1470fe9f398        8 minutes ago       271MB
```

现在，我们来更改下我们的`main.go`文件：
```golang
package main
import (
    "fmt"
    "time"
)

func main() {
    for {
        fmt.Println("Hello blog.qikqiak.com!")
        time.Sleep(time.Second * 2)
    }
}
```
当我们保存该文件后，观察 POD 的输出信息：
```shell
[getting-started getting-started] Hello Skaffold!
[getting-started getting-started] Hello Skaffold!
[getting-started getting-started] Hello blog.qikqiak.com!
[getting-started getting-started] Hello blog.qikqiak.com!
[getting-started getting-started] Hello blog.qikqiak.com!
[getting-started getting-started] Hello blog.qikqiak.com!
[getting-started getting-started] Hello blog.qikqiak.com!
```
是不是立刻就变成了我们修改的结果了啊，同样我们可以用上面的样式去查看下 POD 里面的镜像标签是已经更改过了。

## 总结
我这里为了说明`Skaffold`的使用，可能描述显得有点拖沓，但是当你自己去使用的时候，就完全能够感受到`Skaffold`为开发`kubernetes`应用带来的方便高效，大大的提高了我们的生产力。
另外在`kubernetes`开发自动化工具领域，还有一些其他的选择，比如`Azure`的[Draft](https://draft.sh/)、Datawire 的 Forge 以及 Weavework 的 Flux，大家都可以去使用一下，其他微软的`Draft`是和`Helm`结合得非常好，不过`Skaffold`当然也是支持的，工具始终是工具，能为我们提升效率的就是好工具，不过从开源的角度来说，信 Google 准没错。

## 参考资料

* [https://github.com/GoogleCloudPlatform/skaffold](https://github.com/GoogleCloudPlatform/skaffold)
* [https://draft.sh/](https://draft.sh/)

