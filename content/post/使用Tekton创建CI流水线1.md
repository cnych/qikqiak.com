---
title: 使用 Tekton 创建 CI 流水线（1/2）
date: 2020-05-06
tags: ["kubernetes", "tekton"]
slug: create-ci-pipeline-with-tekton-1
keywords: ["kubernetes", "tekton", "github", "git", "流水线"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1571208756906-92fea1cc1087.jpeg", desc: "Photo of the Day
 by Kevin Mueller"}]
category: "kubernetes"
---

[Tekton](https://tekton.dev/) 是一款功能非常强大而灵活的 CI/CD 开源的云原生框架。本文通过一个简单的示例来创建一个构建流水线，流水线中将运行应用程序的单元测试、构建 Docker 镜像然后推送到 DockerHub。

<!--more-->

### 安装 Tekton
当然前提条件是需要一个可用的 Kubernetes 集群，我们这里使用的是 v1.16.2 版本的集群，安装 Tekton 非常简单，可以直接通过 [tektoncd/pipeline](https://github.com/tektoncd/pipeline) 的 GitHub 仓库中的 `release.yaml` 文件进行安装，如下所示的命令：

```shell
$ kubectl apply -f https://github.com/tektoncd/pipeline/releases/download/v0.12.0/release.yaml
```

由于官方使用的镜像是 gcr 的镜像，所以正常情况下我们是获取不到的，如果你的集群由于某些原因获取不到镜像，可以使用下面的资源清单文件，我已经将镜像替换成了 Docker Hub 上面的镜像：
```shell
$ 
```