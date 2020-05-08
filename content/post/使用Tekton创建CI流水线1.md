---
title: 使用 Tekton 创建 CI/CD 流水线（1/2）
date: 2020-05-06
tags: ["kubernetes", "tekton"]
slug: create-ci-pipeline-with-tekton-1
keywords: ["kubernetes", "tekton", "github", "git", "流水线"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200506160638.png", desc: "https://unsplash.com/photos/hkJsoE-_0vo"}]
category: "kubernetes"
---

[Tekton](https://tekton.dev/) 是一款功能非常强大而灵活的 CI/CD 开源的云原生框架。Tekton 的前身是 Knative 项目的 build-pipeline 项目，这个项目是为了给 build 模块增加 pipeline 的功能，但是随着不同的功能加入到 Knative build 模块中，build 模块越来越变得像一个通用的 CI/CD 系统，于是，索性将 build-pipeline 剥离出 Knative，就变成了现在的 Tekton，而 Tekton 也从此致力于提供全功能、标准化的云原生 CI/CD 解决方案。

本文将通过一个简单的示例来创建一个构建流水线，在流水线中将运行应用程序的单元测试、[构建 Docker 镜像然后推送到 Docker Hub](/post/create-ci-pipeline-with-tekton-2/)。

<!--more-->

### 安装
当然前提条件是需要一个可用的 Kubernetes 集群，我们这里使用的是 v1.16.2 版本的集群，安装 Tekton 非常简单，可以直接通过 [tektoncd/pipeline](https://github.com/tektoncd/pipeline) 的 GitHub 仓库中的 `release.yaml` 文件进行安装，如下所示的命令：
```shell
$ kubectl apply -f https://github.com/tektoncd/pipeline/releases/download/v0.12.0/release.yaml
```

由于官方使用的镜像是 gcr 的镜像，所以正常情况下我们是获取不到的，如果你的集群由于某些原因获取不到镜像，可以使用下面的资源清单文件，我已经将镜像替换成了 Docker Hub 上面的镜像：
```shell
$ kubectl apply -f https://raw.githubusercontent.com/cnych/qikqiak.com/master/data/manifests/tekton/release.yaml
```

上面的资源清单文件安装后，会创建一个名为 `tekton-pipelines` 的命名空间，在该命名空间下面会有大量和 tekton 相关的资源对象，我们可以通过在该命名空间中查看 Pod 并确保它们处于 Running 状态来检查安装是否成功：
```shell
$ kubectl get pods -n tekton-pipelines
NAME                                           READY   STATUS    RESTARTS   AGE
tekton-pipelines-controller-67f4dc98d8-pgxrq   1/1     Running   0          9m46s
tekton-pipelines-webhook-59df55445c-jw76v      1/1     Running   0          9m45s
```

Tekton 安装完成后，我们还可以选择是否安装 CLI 工具，有时候可能 Tekton 提供的命令行工具比 kubectl 管理这些资源更加方便，当然这并不是强制的，我这里是 Mac 系统，所以可以使用常用的 `Homebrew` 工具来安装：
```shell
$ brew tap tektoncd/tools
$ brew install tektoncd/tools/tektoncd-cli
```

安装完成后可以通过如下命令验证 CLI 是否安装成功：
```shell
$ tkn version
Client version: 0.9.0
Pipeline version: v0.12.0
```

### 概念
Tekton 为 Kubernetes 提供了多种 CRD 资源对象，可用于定义我们的流水线，主要有以下几个资源对象：

* Task：表示执行命令的一系列步骤，task 里可以定义一系列的 steps，例如编译代码、构建镜像、推送镜像等，每个 step 实际由一个 Pod 执行。
* TaskRun：task 只是定义了一个模版，taskRun 才真正代表了一次实际的运行，当然你也可以自己手动创建一个 taskRun，taskRun 创建出来之后，就会自动触发 task 描述的构建任务。
* Pipeline：一组任务，表示一个或多个 task、PipelineResource 以及各种定义参数的集合。
* PipelineRun：类似 task 和 taskRun 的关系，pipelineRun 也表示某一次实际运行的 pipeline，下发一个 pipelineRun CRD 实例到 Kubernetes后，同样也会触发一次 pipeline 的构建。
* PipelineResource：表示 pipeline 输入资源，比如 github 上的源码，或者 pipeline 输出资源，例如一个容器镜像或者构建生成的 jar 包等。

### 示例
在这里我们使用一个简单的 Golang 应用，可以在仓库 [https://github.com/cnych/tekton-demo](https://github.com/cnych/tekton-demo) 下面获取应用程序代码，测试以及 Dockerfile 文件。

首先第一个任务就是 Clone 应用程序代码进行测试，创建一个 `task-test.yaml` 的资源文件，内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: test
spec:
  resources:
    inputs:
    - name: repo
      type: git
  steps:
  - name: run-test
    image: golang:1.14-alpine
    workingDir: /workspace/repo
    command: ["go"]
    args: ["test"]
```

其中 `resources` 定义了我们的任务中定义的步骤所需的输入内容，这里我们的步骤需要 Clone 一个 Git 仓库作为 `go test` 命令的输入。

Tekton 内置了一种 git 资源类型，它会自动将代码仓库 Clone 到 `/workspace/$input_name` 目录中，由于我们这里输入被命名成 `repo`，所以代码会被 Clone 到 `/workspace/repo` 目录下面。

然后下面的 `steps` 就是来定义执行运行测试命令的步骤，这里我们直接在代码的根目录中运行 `go test` 命令即可，需要注意的是命令和参数需要分别定义。

定义完成后直接使用 kubectl 创建该任务：
```shell
$ kubectl apply -f task-test.yaml
task.tekton.dev/test created
```

现在我们定义完成了一个建的 Task 任务，但是该任务并不会立即执行，我们必须创建一个 TaskRun 引用它并提供所有必需输入的数据才行。这里我们就需要将 git 代码库作为输入，我们必须先创建一个 PipelineResource 对象来定义输入信息，创建一个名为 `pipelineresource.yaml` 的资源清单文件，内容如下所示：
```yaml
apiVersion: tekton.dev/v1alpha1
kind: PipelineResource
metadata:
  name: cnych-tekton-example
spec:
  type: git
  params:
    - name: url
      value: https://github.com/cnych/tekton-demo
    - name: revision
      value: master
```

直接创建上面的资源对象即可：
```shell
$ kubectl apply -f pipelineresource.yaml
pipelineresource.tekton.dev/cnych-tekton-example created
```

接下来我们就创建 TaskRun 对象了，创建一个名为 `taskrun.yaml` 的文件，内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: TaskRun
metadata:
  name: testrun
spec:
  taskRef:
    name: test
  resources:
    inputs:
    - name: repo
      resourceRef:
        name: cnych-tekton-example
```

这里通过 `taskRef` 引用上面定义的 Task 和 git 仓库作为输入，`resourceRef` 也是引用上面定义的 `PipelineResource` 资源对象。现在我们创建这个资源对象过后，就会开始运行了：
```shell
$ kubectl apply -f taskrun.yaml
taskrun.tekton.dev/testrun created
```
<!--adsense-text-->
创建后，我们可以通过查看 TaskRun 资源对象的状态来查看构建状态：
```shell
$ kubectl get taskrun
NAME      SUCCEEDED   REASON    STARTTIME   COMPLETIONTIME
testrun   Unknown     Pending   21s    
$ kubectl get pods   
NAME                             READY   STATUS     RESTARTS   AGE
testrun-pod-mw9bt                0/2     Init:1/2   0          59s
$ kubectl describe pod testrun-pod-mw9bt
......
                 node.kubernetes.io/unreachable:NoExecute for 300s
Events:
  Type    Reason     Age        From                 Message
  ----    ------     ----       ----                 -------
  Normal  Scheduled  <unknown>  default-scheduler    Successfully assigned default/testrun-pod-mw9bt to ydzs-node5
  Normal  Pulling    4m20s      kubelet, ydzs-node5  Pulling image "busybox@sha256:a2490cec4484ee6c1068ba3a05f89934010c85242f736280b35343483b2264b6"
  Normal  Pulled     4m13s      kubelet, ydzs-node5  Successfully pulled image "busybox@sha256:a2490cec4484ee6c1068ba3a05f89934010c85242f736280b35343483b2264b6"
  Normal  Created    4m13s      kubelet, ydzs-node5  Created container working-dir-initializer
  Normal  Started    4m13s      kubelet, ydzs-node5  Started container working-dir-initializer
  Normal  Pulling    4m12s      kubelet, ydzs-node5  Pulling image "cnych/tekton-entrypoint:v0.12.0"
  Normal  Pulled     2m13s      kubelet, ydzs-node5  Successfully pulled image "cnych/tekton-entrypoint:v0.12.0"
  Normal  Created    2m13s      kubelet, ydzs-node5  Created container place-tools
  Normal  Started    2m12s      kubelet, ydzs-node5  Started container place-tools
  Normal  Pulling    2m12s      kubelet, ydzs-node5  Pulling image "cnych/tekton-git-init:v0.12.0"
  Normal  Pulled     33s        kubelet, ydzs-node5  Successfully pulled image "cnych/tekton-git-init:v0.12.0"
  Normal  Created    32s        kubelet, ydzs-node5  Created container step-git-source-cnych-tekton-example-d6mcz
  Normal  Started    32s        kubelet, ydzs-node5  Started container step-git-source-cnych-tekton-example-d6mcz
  Normal  Pulling    32s        kubelet, ydzs-node5  Pulling image "golang:1.14-alpine"
```

我们可以通过 `kubectl describe` 命令来查看任务运行的过程，首先就是通过 initContainer 中的一个 busybox 镜像将代码 Clone 下来，然后使用任务中定义的镜像来执行命令。

当任务执行完成后， Pod 就会变成 `Completed` 状态了：
```shell
$ kubectl get pods
NAME                READY   STATUS      RESTARTS   AGE
testrun-pod-mw9bt   0/2     Completed   0          4m27s
$ kubectl get taskrun
NAME      SUCCEEDED   REASON      STARTTIME   COMPLETIONTIME
testrun   True        Succeeded   70s         57s
```


我们可以查看容器的日志信息来了解任务的执行结果信息：
```shell
$ kubectl logs testrun-pod-mw9bt --all-containers
{"level":"info","ts":1588751895.779908,"caller":"git/git.go:136","msg":"Successfully cloned https://github.com/cnych/tekton-demo @ f840e0c390be9a1a6edad76abbde64e882047f05 (grafted, HEAD, origin/master) in path /workspace/repo"}
{"level":"info","ts":1588751895.8844209,"caller":"git/git.go:177","msg":"Successfully initialized and updated submodules in path /workspace/repo"}
PASS
ok      _/workspace/repo        0.006s
```

我们可以看到我们的测试已经通过了，当然我们也可以使用 `Tekton CLI` 工具来运行这个任务。Tekton CLI 提供了一种更快、更方便的方式来运行任务。

我们不用手动编写 TaskRun 资源清单，可以运行以下命令来执行，该命令引用我们的任务（名为 test），生成一个 TaskRun 资源对象并显示其日志：
```shell
$ tkn task start test --inputresource repo=cnych-tekton-example --showlog
Taskrun started: test-run-z56lj
Waiting for logs to be available...
[git-source-cnych-tekton-example-8q268] {"level":"info","ts":1588752677.350016,"caller":"git/git.go:136","msg":"Successfully cloned https://github.com/cnych/tekton-demo @ f840e0c390be9a1a6edad76abbde64e882047f05 (grafted, HEAD, origin/master) in path /workspace/repo"}
[git-source-cnych-tekton-example-8q268] {"level":"info","ts":1588752677.453426,"caller":"git/git.go:177","msg":"Successfully initialized and updated submodules in path /workspace/repo"}

[run-test] PASS
[run-test] ok  	_/workspace/repo	0.007s

```

### 总结
我们已经在 Kubernetes 集群上成功安装了 Tekton，定义了一个 Task，并通过 YAML 清单和 Tekton CLI 创建 TaskRun 对其进行了测试。在下一部发我们将创建一个任务来构建一个 Docker 镜像，并将其推送到 Docker Hub。最后，我们将创建一个流水线，按顺序运行我们的两个任务（运行应用程序测试，构建和推送）。


参考资料：

* [tekton.dev](https://tekton.dev/)
* [Creating CI Pipelines with Tekton](https://www.arthurkoziel.com/creating-ci-pipelines-with-tekton-part-1/)

<!--adsense-self-->
