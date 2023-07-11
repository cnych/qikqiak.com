---
title: 使用 KinD 加速 CI/CD 流水线
date: 2020-10-08
tags: ["kubernetes", "docker", "KinD"]
keywords: ["kubeadm", "kubernetes", "docker", "KinD", "github", "CI/CD"]
slug: accelerate-ci-cd-pipelines-with-kind
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20201008113942.png",
      desc: "Photo by Krish Gandhi on Unsplash",
    },
  ]
category: "kubernetes"
---

现在安装 Kubernetes 集群已经变得越来越简单了，出现了很多方案，各种方案都有自己适合的使用场景。虽然我们可以很快速在云环境下面启动一个 Kubernetes 集群，但是对于开发人员通常更喜欢能够快速上手的东西，[Kubernetes in Docker（KinD）](https://kind.sigs.k8s.io/)这个工具就可以通过创建容器来作为 Kubernetes 的节点，我们只需要在机器上安装 Docker 就可以使用，它允许我们在很短的时间内就启动一个多节点的集群，而不依赖任何其他工具或云服务商，这就使得它不仅对本地开发非常有用，而且对 CI/CD 也很有帮助。

<!--more-->

## KinD 架构

KinD 使用 Docker-in-Docker 的方法来运行 Kubernetes 集群，它启动多个 Docker 容器来作为 Kubernetes 的节点。Docker 容器将 docker.sock 卷挂载到你的节点上运行的 Docker 上，这样就可以与底层的容器运行时进行交互了。

![KinD 架构](https://picdn.youdianzhishi.com/images/20201008102134.png)

KinD 架构

KinD 是使用 kubeadm 工具来启动管理集群，也通过了一致性测试和 CNCF 的认证，当然它也会为你生成访问集群的 kubeconfig 文件，这样我们同样就可以使用 kubectl 来和集群进行交互了。其他 Kubernetes 组件，比如 Helm、Istio 也同样可以在 KinD 集群内正常工作。

KinD 有一个缺点是它不能使用 LoadBalancer 的 Service，所以我们需要使用 NodePort 来对外暴露服务。

另外 DinD 也不是一个非常安全的解决方案，所以除了本地开发机和 CI/CD 流水线之外，最好不要在其他环境使用 KinD 集群，特别是生产环境中。

## 安装

KinD 是一个简单的命令行工具，可以直接下载放置到 PATH 路径上，然后就可以使用 kind 命令与 KinD 进行交互了，当然前提是要先安装上 Docker：

```bash
$ sudo curl -sL https://kind.sigs.k8s.io/dl/v0.9.0/kind-linux-amd64 -o /usr/local/bin/kind
$ sudo chmod +x /usr/local/bin/kind
$ kind version
kind v0.9.0 go1.15.2 linux/amd64
```

安装完成后你可以使用下面的命令创建你的集群：

```bash
$ kind create cluster --wait 10m
```

该命令会创建一个单节点集群，如果你想定义一个多节点集群，你可以使用类似下面的集群配置文件进行创建：

```yaml
# kind-config.yaml
# 3个节点(两个node)集群配置
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

然后使用上面的配置文件创建集群：

```bash
$ kind create cluster --wait 10m --config kind-config.yaml
```

我们也可以在 `nodes` 属性部分指定多个控制平面角色来创建多控制平面集群。由于 KinD 会自动创建一个 kubeconfig 文件，所以我们可以像使用其他集群一样使用 kubectl 命令。
要想删除 KinD 集群也很简单，直接使用如下所示的命令即可：

```bash
$ kind delete cluster
```

## 测试

接下来我们来体验一次使用 KinD 的 CI/CD 流水线，这里为了方便我们将使用 GitHub Actions 作为我们的 CI/CD 工具，任何可以访问 GitHub 的人都可以使用。

<!--adsense-text-->

我们来构建一个简单的 NGINX 应用并显示 "Hello World"，我们需要做如下一些工作：

- 创建应用的开发版本
- 在 KinD 集群中运行一个组件来测试
- 如果测试成功，我们将镜像升级到 release 版本，并推送到 Docker Hub 上去。

首先我们需要一个 GitHub 和 Docker Hub 帐号，然后：

- Fork 测试仓库：[https://github.com/cnych/kind-nginx](https://github.com/cnych/kind-nginx)
- 进入代码仓库，创建两个 secrets：DOCKER_USER 和 DOCKER_PW，分别表示你的 Docker Hub 的用户名和密码。
- 跳转到 GitHub Actions 并重新执行任务，当然我们也可以修改仓库代码来推送触发这个任务。

![配置 Secrets](https://picdn.youdianzhishi.com/images/20201008105538.png)

我们可以先查看下 GitHub Actions 的流水线配置文件 `build-pipeline.yml`：

```yaml
name: Docker Image CI

on:
  [push]
  # 工作流程中所有 job 和 step 都可使用的环境变量
env: # 或者作为环境变量
  docker_username: ${{ secrets.DOCKER_USER }}
  docker_password: ${{ secrets.DOCKER_PW }}

jobs:
  build-docker-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: Build the Docker image
        run: docker build -t $docker_username/nginx:dev .
      - name: Login to Docker
        run: echo "$docker_password" | docker login -u "$docker_username" --password-stdin
      - name: Push the docker image
        run: docker push $docker_username/nginx:dev

  kubernetes-component-test:
    runs-on: ubuntu-latest
    needs: build-docker-image
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: Run KIND Test
        run: sudo sh build-test.sh $docker_username

  promote-and-push-docker-image:
    runs-on: ubuntu-latest
    needs: kubernetes-component-test
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0
      - name: Pull the Docker image
        run: docker pull $docker_username/nginx:dev
      - name: Tag the Docker image
        run: docker tag $docker_username/nginx:dev $docker_username/nginx:release
      - name: Login to Docker
        run: echo "$docker_password" | docker login -u "$docker_username" --password-stdin
      - name: Push the docker image
        run: docker push $docker_username/nginx:release
```

从上面的流水线文件中可以看到构建流水线中有 3 个作业：

1. `build-docker-image` 作业会构建开发版本的 Docker 镜像，并在构建成功后将其推送到 Docker Hub，我们可以在这个任务中运行单元测试。
2. `kubernetes-component-test` 作业设置了一个 KinD 集群，并为应用程序运行组件进行测试。
3. `promote-and-push-docker-image` 作业拉取开发版本的镜像，将其重新标记为 release 版本，并将 release 版本推送到 Docker Hub。

我们来看看应用的 Dockerfile 文件来了解它的构建内容：

```docker
FROM nginx
RUN echo 'Hello World' > /usr/share/nginx/html/index.html
```

第二步是整个流水线的关键所在，运行一个 [buid-test.sh](http://buid-test.sh) 的 shell 脚本，接下来我们来查看下该脚本的实现：

```bash
#! /bin/bash
docker_username=$1
set -xe

curl -sL https://kind.sigs.k8s.io/dl/v0.9.0/kind-linux-amd64 -o /usr/local/bin/kind
chmod 755 /usr/local/bin/kind

curl -sL https://storage.googleapis.com/kubernetes-release/release/v1.17.4/bin/linux/amd64/kubectl -o /usr/local/bin/kubectl
chmod 755 /usr/local/bin/kubectl

curl -LO https://get.helm.sh/helm-v3.1.2-linux-amd64.tar.gz
tar -xzf helm-v3.1.2-linux-amd64.tar.gz
mv linux-amd64/helm /usr/local/bin/
rm -rf helm-v3.1.2-linux-amd64.tar.gz

kind version
kubectl version --client=true
helm version

kind create cluster --wait 10m --config kind-config.yaml

kubectl get nodes

docker build -t $docker_username/nginx:dev .
kind load docker-image $docker_username/nginx:dev

kubectl apply -f nginx-deployment.yaml
kubectl apply -f nginx-service.yaml

NODE_IP=$(kubectl get node -o wide|tail -1|awk {'print $6'})
NODE_PORT=$(kubectl get svc nginx-service -o go-template='{{range.spec.ports}}{{if .nodePort}}{{.nodePort}}{{"\n"}}{{end}}{{end}}')
sleep 60
SUCCESS=$(curl $NODE_IP:$NODE_PORT)
if [[ "${SUCCESS}" != "Hello World" ]];
then
 kind -q delete cluster
 exit 1;
else
 kind -q delete cluster
 echo "Component test succesful"
fi
```

上面的 shell 脚本实现了一系列的功能：

1. 在 CI 服务器中下载并安装 kind、kubectl、helm 工具
2. 使用 kind-config.yaml 文件创建了一个多节点的集群
3. 使用 `docker build` 命令构建 dev 版本的镜像
4. 加载 KinD 集群中的 Docker 镜像，这样可以确保镜像对所有 KinD 节点都可用，就不需要从 Docker Hub 中去拉取镜像了
5. 使用 Deployment 方式部署应用，并通过 NodePort 的 Service 暴露服务
6. 获取节点 IP 和服务端口，并运行测试，检查应用程序是否返回"Hello World"
7. 如果测试成功，则删除 KinD 集群，打印 "Component test succesful"，并返回一个成功状态码；如果测试失败，则删除 KinD 集群，并返回失败的状态码。

![GitHub Actions 流水线](https://picdn.youdianzhishi.com/images/20201008112251.png)

## 总结

当我们触发流水线管道时，GitHub Actions 会自动运行整个流水线。我们这里就完成了利用 Docker 和 Kubernetes 进行持续集成和部署的无缝方式，Docker 中的 Kubernetes 不仅简化了我们进行本地开发的方式，而且也是 CI/CD 的优秀工具。

> 原文链接：https://medium.com/better-programming/accelerate-your-ci-cd-pipelines-with-kubernetes-in-docker-kind-109a67b39c82

<!--adsense-self-->
