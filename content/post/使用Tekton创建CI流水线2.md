---
title: 使用 Tekton 创建 CI/CD 流水线（2/4）
date: 2020-05-08
tags: ["kubernetes", "tekton"]
slug: create-ci-pipeline-with-tekton-2
keywords: ["kubernetes", "tekton", "github", "git", "流水线"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200508114921.png", desc: "https://unsplash.com/photos/YXQ_vYDcMIg"}]
category: "kubernetes"
---
[在前面文章中](/post/create-ci-pipeline-with-tekton-1/)，我们在 Kubernetes 集群中安装了 Tekton，通过 Tekton 克隆 GitHub 代码仓库并执行了应用测试命令。接着前面的内容，本文我们将创建一个新的 Task 来构建一个 Docker 镜像并将其推送到 Docker Hub，最后，我们将这些任务组合成一个流水线。

<!--more-->

### Docker Hub 配置
为了能够构建 Docker 镜像，一般来说我们需要使用 Docker 来进行，我们这里是容器，所以可以使用 Docker In Docker 模式，但是这种模式安全性不高，除了这种方式之外，我们还可以使用 Google 推出的 [Kaniko](https://github.com/GoogleContainerTools/kaniko) 工具来进行构建，该工具可以在 Kubernetes 集群中构建 Docker 镜像而无需依赖 Docker 守护进程。

使用 Kaniko 构建镜像和 Docker 命令基本上一致，所以我们可以提前设置下 Docker Hub 的登录凭证，方便后续将镜像推送到镜像仓库。登录凭证可以保存到 Kubernetes 的 Secret 资源对象中，创建一个名为 secret.yaml 的文件，内容如下所示:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: docker-auth
  annotations:
    tekton.dev/docker-0: https://index.docker.io/v1/
type: kubernetes.io/basic-auth
stringData:
    username: myusername
    password: mypassword
```

> 记得将 myusername 和 mypassword 替换成你的 Docker Hub 登录凭证。

我们这里在 Secret 对象中添加了一个 `tekton.dev/docker-0` 的 annotation，该注解信息是用来告诉 Tekton 这些认证信息所属的 Docker 镜像仓库。

然后创建一个 ServiceAccount 对象来使用上面的 `docker-auth` 这个 Secret 对象，创建一个名为 `serviceaccount.yaml` 的文件，内容如下所示：
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: build-sa
secrets:
- name: docker-auth
```

然后直接创建上面两个资源对象即可：
```shell
$ kubectl apply -f secret.yaml 
secret/docker-auth created
$ kubectl apply -f serviceaccount.yaml 
serviceaccount/build-sa created
```

创建完成后，我们就可以在运行 Tekton 的任务或者流水线的时候使用上面的 build-sa 这个 ServiceAccount 对象来进行 Docker Hub 的登录认证了。


### 创建镜像任务
现在我们创建一个 Task 任务来构建并推送 Docker 镜像，我们这里使用的示例应用 [https://github.com/cnych/tekton-demo](https://github.com/cnych/tekton-demo) 中根目录下面已经包含了一个 Dockerfile 文件了，所以我们直接 Clone 代码就可以获得：
```Dockerfile
FROM golang:1.14-alpine

WORKDIR /go/src/app
COPY . .

RUN go get -d -v ./...
RUN go install -v ./...

CMD ["app"]
```

创建一个名为 `task-build-push.yaml` 的文件，文件内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: build-and-push
spec:
  resources:
    inputs:
    - name: repo
      type: git
  steps:
  - name: build-and-push
    image: cnych/kaniko-executor:v0.22.0
    env:
    - name: DOCKER_CONFIG
      value: /tekton/home/.docker
    command:
    - /kaniko/executor
    - --dockerfile=Dockerfile
    - --context=/workspace/repo
    - --destination=cnych/tekton-test:latest
```

和前文的任务类似，这里我们同样将 git 作为输入，也只定义了一个名为 `build-and-push` 的步骤，Kaniko 会在同一个命令中构建并推送，所以不需要多个步骤了，执行的命令就是 `/kaniko/executor`，通过 `--dockerfile` 指定 Dockerfile 路径，`--context` 指定构建上下文，我们这里当然就是项目的根目录了，然后 `--destination` 参数指定最终我们的镜像名称。其实 Tekton 也支持[参数化](https://github.com/tektoncd/pipeline/blob/master/docs/pipelines.md#specifying-parameters)的形式，这样就可以避免我们这里直接写死了，不过由于我们都还是初学者，为了避免复杂，我们直接就直接硬编码了。

此外我们定义了一个名为 `DOCKER_CONFIG` 的环境变量，这个变量是用于 Kaniko 去[查找 Docker 认证信息](https://github.com/tektoncd/pipeline/pull/706)的。

同样直接创建上面的资源对象即可：
```shell
$ kubectl apply -f task-build-push.yaml 
task.tekton.dev/build-and-push created
```

创建了 Task 任务过后，要想真正去执行这个任务，我们就需要创建一个对应的 TaskRun 资源对象，当然通过 kubectl 或者 tkn 都是可以的，在第一部分文章中我们就已经演示过了。

### 执行任务
和前面一样，现在我们来创建一个 TaskRun 对象来触发任务，不同之处在于我们需要指定 Task 时需要的 ServiceAccount 对象。创建一个名为 `taskrun-build-push.yaml` 的文件，内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: TaskRun
metadata:
  name: build-and-push
spec:
  serviceAccountName: build-sa
  taskRef:
    name: build-and-push
  resources:
    inputs:
    - name: repo
      resourceRef:
        name: cnych-tekton-example
```

注意这里我们通过 `serviceAccountName` 属性指定了 Docker 认证信息的 ServiceAccount 对象，然后通过 `taskRef` 引用我们的任务，以及下面的 `resourceRef` 关联第一部分我们声明的输入资源。

然后直接创建这个资源对象即可：
```shell
$ kubectl apply -f taskrun-build-push.yaml 
taskrun.tekton.dev/build-and-push created
```

创建完成后就会触发任务执行了，我们可以通过查看 Pod 对象状态来了解进度：
```shell
$ kubectl get pods 
NAME                             READY   STATUS      RESTARTS   AGE
build-and-push-pod-pv6mv         0/2     Init:0/2    0          32s
$ kubectl get taskrun
NAME             SUCCEEDED   REASON      STARTTIME   COMPLETIONTIME
build-and-push   Unknown     Pending     108s
```

现在任务执行的 Pod 还在初始化容器阶段，我们可以看到 TaskRun 的状态处于 `Pending`，隔一会儿正常构建就会成功了，我们可以查看构建任务的 Pod 日志信息：
```shell
$ kubectl get pods
NAME                             READY   STATUS      RESTARTS   AGE
build-and-push-pod-pv6mv         0/2     Completed   0          16m
$  kubectl logs -f build-and-push-pod-pv6mv --all-containers
{"level":"info","ts":1588907241.1187525,"caller":"creds-init/main.go:44","msg":"Credentials initialized."}
{"level":"info","ts":1588907420.917656,"caller":"git/git.go:136","msg":"Successfully cloned https://github.com/cnych/tekton-demo @ f840e0c390be9a1a6edad76abbde64e882047f05 (grafted, HEAD, origin/master) in path /workspace/repo"}
{"level":"info","ts":1588907421.0128217,"caller":"git/git.go:177","msg":"Successfully initialized and updated submodules in path /workspace/repo"}
INFO[0010] Retrieving image manifest golang:1.14-alpine
INFO[0016] Retrieving image manifest golang:1.14-alpine
INFO[0020] Built cross stage deps: map[]
INFO[0020] Retrieving image manifest golang:1.14-alpine
INFO[0023] Retrieving image manifest golang:1.14-alpine
INFO[0029] Executing 0 build triggers
INFO[0029] Unpacking rootfs as cmd COPY . . requires it.
INFO[0259] WORKDIR /go/src/app
INFO[0259] cmd: workdir
INFO[0259] Changed working directory to /go/src/app
INFO[0259] Creating directory /go/src/app
INFO[0259] Resolving 1 paths
INFO[0259] Taking snapshot of files...
INFO[0259] COPY . .
INFO[0259] Resolving 56 paths
INFO[0259] Taking snapshot of files...
INFO[0259] RUN go get -d -v ./...
INFO[0259] Taking snapshot of full filesystem...
INFO[0265] Resolving 11667 paths
INFO[0272] cmd: /bin/sh
INFO[0272] args: [-c go get -d -v ./...]
INFO[0272] Running: [/bin/sh -c go get -d -v ./...]
INFO[0272] Taking snapshot of full filesystem...
INFO[0275] Resolving 11667 paths
INFO[0280] RUN go install -v ./...
INFO[0280] cmd: /bin/sh
INFO[0280] args: [-c go install -v ./...]
INFO[0280] Running: [/bin/sh -c go install -v ./...]
app
INFO[0281] Taking snapshot of full filesystem...
INFO[0284] Resolving 11666 paths
INFO[0288] CMD ["app"]
$ kubectl get taskrun
NAME             SUCCEEDED   REASON      STARTTIME   COMPLETIONTIME
build-and-push   True        Succeeded   15m         2m24s
```

我们可以看到 TaskRun 任务已经执行成功了。 这个时候其实我们可以在 Docker Hub 上找到我们的镜像了，当然也可以直接使用这个镜像进行测试：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200508112033.png)


### 创建流水线
到这里前面我们的两个任务 test 和 build-and-push 都已经完成了，我们还可以创建一个流水线来将这两个任务组织起来，首先运行 test 任务，如果通过了再执行后面的 build-and-push 这个任务。

创建一个名为 `pipeline.yaml` 的文件，内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: test-build-push
spec:
  resources:
  - name: repo
    type: git
  tasks:
  # 运行应用测试
  - name: test
    taskRef:
      name: test
    resources:
      inputs:
      - name: repo      # Task 输入名称 
        resource: repo  # Pipeline 资源名称
  # 构建并推送 Docker 镜像
  - name: build-and-push
    taskRef:
      name: build-and-push
    runAfter:
    - test              # 测试任务执行之后
    resources:
      inputs:
      - name: repo      # Task 输入名称 
        resource: repo  # Pipeline 资源名称
```

首先我们需要定义流水线需要哪些资源，可以是输入或者输出的资源，在这里我们只有一个输入，那就是命名为 repo 的应用程序源码的 GitHub 仓库。接下来定义任务，每个任务都通过 `taskRef` 进行引用，并传递任务需要的输入参数。

同样直接创建这个资源对象即可：
```shell
$ kubectl apply -f pipeline.yaml 
pipeline.tekton.dev/test-build-push created
```

前面我们提到过和通过创建 TaskRun 去触发 Task 任务类似，我们可以通过创建一个 PipelineRun 对象来运行流水线，当然同样可以用 kubectl 或者 Tekton CLI 工具来完成。

这里我们创建一个名为 `pipelinerun.yaml` 的 PipelineRun 对象来运行流水线，文件内容如下所示：
```yaml
apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  name: test-build-push-run
spec:
  serviceAccountName: build-sa
  pipelineRef:
    name: test-build-push
  resources:
  - name: repo
    resourceRef:
      name: cnych-tekton-example
```

定义方式和 TaskRun 几乎一样，通过 `serviceAccountName` 属性指定 ServiceAccount 对象，`pipelineRef` 关联流水线对象。同样直接创建这个资源，创建后就会触发我们的流水线任务了：
```shell
$ kubectl apply -f pipelinerun.yaml 
pipelinerun.tekton.dev/test-build-push-run created
$ kubectl get pods | grep test-build-push-run
test-build-push-run-build-and-push-xl7wp-pod-hdnbl   0/2     Completed   0          5m27s
test-build-push-run-test-4s6qh-pod-tkwzk             0/2     Completed   0          6m5s
$ kubectl logs -f test-build-push-run-build-and-push-xl7wp-pod-hdnbl --all-containers
{"level":"info","ts":1588908934.442572,"caller":"git/git.go:136","msg":"Successfully cloned https://github.com/cnych/tekton-demo @ f840e0c390be9a1a6edad76abbde64e882047f05 (grafted, HEAD, origin/master) in path /workspace/repo"}
{"level":"info","ts":1588908934.577377,"caller":"git/git.go:177","msg":"Successfully initialized and updated submodules in path /workspace/repo"}
{"level":"info","ts":1588908927.469531,"caller":"creds-init/main.go:44","msg":"Credentials initialized."}
INFO[0004] Retrieving image manifest golang:1.14-alpine
......
app
INFO[0281] Taking snapshot of full filesystem...
INFO[0287] Resolving 11666 paths
INFO[0291] CMD ["app"]
$ kubectl get taskrun |grep test-build-push-run
test-build-push-run-build-and-push-xl7wp   True        Succeeded   6m21s       65s
test-build-push-run-test-4s6qh             True        Succeeded   6m58s       6m21s
```

到这里证明我们的流水线执行成功了。

### 总结
在前文中，我们将 Tekton 安装在 Kubernetes 集群上，定义了一个 Task，并通过 YAML 清单和 Tekton CLI 创建 TaskRun 对其进行了测试。在这一部分中，我们创建了由两个任务组成的 Tektok 流水线，第一个任务是从 GitHub 克隆代码并运行应用程序测试，第二个任务是构建一个 Docker 镜像并将其推送到Docker Hub 上。到这里我们就完成了使用 Tekton 创建 CI/CD 流水线的一个简单示例，关于 Tekton 更多的使用可以查看官方文档学习。


参考资料：

* [tekton.dev](https://tekton.dev/)
* [Creating CI Pipelines with Tekton 1](https://www.arthurkoziel.com/creating-ci-pipelines-with-tekton-part-1/)
* [Creating CI Pipelines with Tekton 2](https://www.arthurkoziel.com/creating-ci-pipelines-with-tekton-part-2/)

<!--adsense-self-->
