---
title: 基于 Drone 的 CI/CD（二）
subtitle: 使用 Drone Pipeline 构建 Docker 镜像
date: 2019-08-05
tags: ["kubernetes", "drone", "CI", "CD", "github", "helm"]
keywords: ["kubernetes", "drone", "CI", "CD", "github", "动态", "helm"]
slug: drone-with-k8s-2
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1565010505255-cd05a670b436.jpeg", desc: "Drone Shot of a bridge over a river"}]
category: "kubernetes"
---

本文是 [Drone 系列文章](/tags/drone/)的第二篇，在[第一篇文章中我们介绍了如何在 Kubernetes 集群中使用 Helm 来快速安装 Drone](/post/drone-with-k8s-1/)，并且用 [cert-manager](/post/automatic-kubernetes-ingress-https-with-lets-encrypt/) 给 Drone 应用做了自动化 HTTPS。

本文我们将创建一个简单的 Golang 应用，通过 Drone 的 Pipeline 来自动化构建 Docker 镜像。

<!--more-->

## Go 项目
我们这里使用 Go 语言中流行的 web 框架 gin 创建一个简单的 web 服务，在 GitHub 上创建一个名为 drone-k8s-demo 的代码仓库，Clone 到本地，添加名为 main.go 的文件，内容如下：
```go
package main

import (
  "net/http"

  "github.com/gin-gonic/gin"
  "github.com/sirupsen/logrus"
)

func main() {
  r := gin.Default()

  r.GET("/health", func(c *gin.Context) {
    c.JSON(http.StatusOK, gin.H {
      "health": true,
    })
  })

  if err := r.Run(":8080"); err != nil {
    logrus.WithError(err).Fatal("Couldn't listen")
  }

}
```

该服务监听在 8080 端口，提供了一个简单的`/health`路由，返回一个简单的 JSON 消息表示应用状态状态，本地我们使用的是 go1.11.4 版本，所以可以通过 Go Modules 来管理应用的依赖，在项目目录下面执行 mod init：
```shell
$ go mod init dronek8s
```

如果你对 Go Modules 的使用还不是很熟悉，可以查看我们前面的文章[Go Modules 基本使用](/post/go-modules-usage/)。

> 项目完整代码可以在 GitHub 上获得：[https://github.com/cnych/drone-k8s-demo](https://github.com/cnych/drone-k8s-demo)

## Docker 镜像
现在我们需要为项目添加用于 Docker 镜像构建的 Dockerfile 文件，当然我们可以使用多阶段构建来将项目的构建和打包工作放在同一个 Dockerfile 文件中，我们这里为了演示 Drone 的 Pipeline 使用就将这两个步骤分开，在项目根目录下面创建 Dockerfile 文件，内容如下：
```shell
FROM alpine

WORKDIR /home

# 修改alpine源为阿里云
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories && \
  apk update && \
  apk upgrade && \
  apk add ca-certificates && update-ca-certificates && \
  apk add --update tzdata && \
  rm -rf /var/cache/apk/*

COPY demo-app /home/

ENV TZ=Asia/Shanghai

EXPOSE 8080

ENTRYPOINT ./demo-app
```

可以看到我们这里是通过将 demo-app 文件拷贝到镜像中去执行来构建镜像的，那么我们就得在项目中将应用构建成一个名为 demo-app 的应用，在根目录下面执行 go build 命令：
```shell
$ CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o demo-app
$ ls
Dockerfile README.md  demo-app   go.mod     go.sum     main.go
```

这个时候我们就可以在本地来构建 Docker 镜像了：
```shell
$ docker build -t cnych/drone-k8s-demo .
...
Successfully built 85a88c8e944a 
$ docker images
cnych/drone-k8s-demo    latest  85a88c8e944a    43 hours ago    31.1MB
```

这样我们就将 Golang 项目打包成 Docker 镜像了，然后可以在本地运行容器来验证：
```shell
$ docker run --rm --name drone-k8s-demo -p 8080:8080 cnych/drone-k8s-demo
[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.

[GIN-debug] [WARNING] Running in "debug" mode. Switch to "release" mode in production.
 - using env:	export GIN_MODE=release
 - using code:	gin.SetMode(gin.ReleaseMode)

[GIN-debug] GET    /health                   --> main.main.func1 (3 handlers)
[GIN-debug] Listening and serving HTTP on 127.0.0.1:8080
```

访问 health 接口：
```shell
$ curl http://127.0.0.1:8080/health
{"health":true}
```

看到这里就证明我们的 Docker 镜像构建成功了。


## Pipeline
上面我们用手动的方法实现了 Golang 项目打包成 Docker 镜像的过程，如果到这里就结束了的话似乎就和 Drone 没有什么关系了，那么我们可以利用 Drone 来做什么呢？简单来说就是将上面我们手动的过程自动化。Drone 的工作方式和 Travis CI、GitLab CI 都比较类似，我们需要在项目根目录下面创建一个名为`.drone.yml`的文件，我们需要在该文件中来编写用于自动化打包镜像的 Pipeline，内容如下：
```yaml
kind: pipeline
name: default

steps:
  - name: linter
    image: golang:latest
    environment:
      GOPROXY: https://mirrors.aliyun.com/goproxy/
    commands:
      - go get -u github.com/golangci/golangci-lint/cmd/golangci-lint
      - golangci-lint run

  - name: build
    image: golang:latest
    environment:
      GOPROXY: https://mirrors.aliyun.com/goproxy/
    commands:
      - CGO_ENABLED=0 go build -o demo-app

  - name: docker
    image: plugins/docker
    settings:
      repo: cnych/drone-k8s-demo
      use_cache: true
      username:
        from_secret: docker_username
      password:
        from_secret: docker_password
    tags:
      - latest
    when:
      event: push
      branch: master
```

我们定义了一个 pipeline，其中构建过程有3个步骤，linter、build、docker，当然对于一般的项目来说应该还需要有单元测试的步骤，在每一个步骤中都是通过一个镜像去进行任务构建的，比如 linter 和 build 都是在一个`golang:latest`的镜像中执行任务，在 build 阶段中就是执行上面我们手动的 go build 命令，然后在 docker 阶段是使用的是`plugins/docker`这个官方插件，在该镜像中可以指定 Dockerfile 的路径，镜像的 tag，以及镜像仓库的用户名和密码。
<!--adsense-text-->
我们这里的 username 和 password 并没有名为提供，而是通过 secret 的方式，`username.from_secret=docker_username，password.from_secret=docker_password`。这两个 secret 我们可以通过 drone cli 来创建，也可以直接通过 Drone 的网页来进行配置。

将项目推送到 GitHub，然后在 Drone 页面上启用项目，在项目设置项下面添加 Pipeline 中需要使用到的 Secret：

![drone add secret](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/drone-add-secret.png)

这样用于构建的 Drone Pipeline 就编写完成了，这个时候我们只需要将`.drone.yml`文件推送到 GitHub 仓库中去，正常就会触发自动构建了：

![drone pipeline](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/drone-pipeline.png)

在 Drone 的页面中可以看到我们在 Pipeline 中定义的每一个步骤的构建日志以及时长，如果出现了错误就可以对应的去排查即可。

此外，由于我们的 Drone 是部署在 Kubernetes 集群中，而且我们没有启动 Agent，所以当 Drone 有任务需要构建的时候会自动的启动一个 Job 对象来构建：
```shell
$ kubectl get job -n kube-ops
NAME                             COMPLETIONS   DURATION   AGE
......
drone-job-26-lo6kxn8f4dde6t8n5   1/1           7m1s       22h
drone-job-27-aibtb6jahfq8dg88t   1/1           6m14s      11m
drone-job-28-lgwtvdybpxwwgxwxl   0/1           12s        12s
$ kubectl get pods -n kube-ops
......
drone-job-28-lgwtvdybpxwwgxwxl-hs28f          1/1     Running     0          2m3s
drone-job-26-lo6kxn8f4dde6t8n5-bbw8t          0/1     Completed   0          22h
drone-job-27-aibtb6jahfq8dg88t-qkmn5          0/1     Completed   0          12m
```

Job 在 Drone 的任务构建完成后并不会自动销毁，Pod 的状态只会变成 Completed 状态，所以需要我们手动的去删除这些已经构建完成的 Job 资源对象。

> 如果想要自动删除这些完成的 Job 资源对象的话，我们可以在 APIServer 中启用 `TTLAfterFinished` 这个 [Feature Gates](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/) 也是可以的。

到这里我们就实现了使用 Drone Pipeline 来自动将我们的项目打包成 Docker 镜像，并推送到了 DockerHub，下篇文章我们再来和大家学习如何使用 Helm 将应用部署到 Kubernetes 集群中去。

<!--adsense-self-->
