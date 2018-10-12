---
title: 手摸手教你写 Kubernetes 的 golang 服务
date: 2018-02-08
tags: ["kubernetes", "docker", "golang"]
keywords: ["kubernetes", "docker", "golang", "服务"]
slug: write-kubernets-golang-service-step-by-step
gitcomment: true
bigimg: [{src: "/img/posts/photo-1508922450598-2f5b1193950a.jpeg", desc: "Lake Wakatipu, New Zealand"}]
category: "kubernetes"
---

我们前面介绍了很多关于`kubernetes`本身的操作，但是对于如何写一个完整的`kubernetes`应用还没有介绍过。在这篇文章中我们将介绍如何一步一步的写一个`kubernetes`的`golang`服务。

<!--more-->

## golang
对于 golang 的安装和配置，我们这里就不详细说明了，因为这也不是我们的重点，我相信这一步你是能够自己独立完成的。

> 一个令人比较兴奋的事情是现在国内用户访问`golang`网站可以不用梯子了，我们可以自由的访问[https://golang.google.cn/](https://golang.google.cn/)网站了。

新建项目文件夹**goappk8s**，然后在该目录下面新建一个**src**目录
```shell
$ mkdir goappk8s && cd goappk8s
$ mkdir src
```

在**goappk8s**目录下新建一个设置`GOPATH`的脚本：(`setup-gopath.sh`)
```bash
#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GOPATH="$DIR"
```

然后我们执行上面的脚本，设置`GOPATH`为当前工程目录：
```shell
$ source setup-gopath.sh
$ echo $GOPATH
/Users/ych/devs/workspace/yidianzhishi/goappk8s
```

我们可以看到`GOPATH`已经设置为当前项目根目录了。然后在**src**目录下面添加 golang 代码：
```shell
$ mkdir -p github.com/cnych/goappk8s && cd github.com/cnych/goappk8s
$ touch main.go
```

我们添加一个最简单的`golang`服务，提供了一个 ping 接口：
```golang
package main

import (
    "github.com/gin-gonic/gin"
    "net/http"
)

func main() {
    router := gin.Default()
    router.GET("/ping", func(c *gin.Context) {
        c.String(http.StatusOK, "PONG")
    })
    router.Run(":8080")
}
```
我们可以看到上面的服务中依赖了一个第三方包`github.com/gin-gonic/gin`，你可以手动将该依赖包下载下来放置到`GOPATH`下面，我们这里为了使用`govendor`来进行管理，当然你可以使用其他的包管理工具，比如：dep、glide 等等。在`github.com/cnych/goappk8s`目录下面执行下面的操作：
```shell
$ govendor init
$ govendor fetch github.com/gin-gonic/gin
```

> 注意上面的包需要拉取一些墙外的包。

然后我们切换到项目根目录，也就是`GOPATH`的路径，执行以下命令：
```shell
$ go install github.com/cnych/goappk8s && ./bin/goappk8s
[GIN-debug] [WARNING] Creating an Engine instance with the Logger and Recovery middleware already attached.

[GIN-debug] [WARNING] Running in "debug" mode. Switch to "release" mode in production.
 - using env:   export GIN_MODE=release
 - using code:  gin.SetMode(gin.ReleaseMode)

[GIN-debug] GET    /ping                     --> main.main.func1 (3 handlers)
[GIN-debug] Listening and serving HTTP on :8080
```
我们可以看到我们的`golang`服务已经运行起来了，然后我们浏览器中打开链接[http://127.0.0.1:8080/ping](http://127.0.0.1:8080/ping)，可以看到页面上打印出了`PONG`，证明我们的服务已经正常启动了。

## Docker
根据上一篇文章 [Docker 的多阶段构建](/post/multi-stage-build-for-docker)我们可以很容易的为上面的`golang`服务写一个`Dockerfile`文件：（与**main.go**同目录）
```Dockerfile
FROM golang AS build-env
ADD . /go/src/app
WORKDIR /go/src/app
RUN go get -u -v github.com/kardianos/govendor
RUN govendor sync
RUN GOOS=linux GOARCH=386 go build -v -o /go/src/app/app-server

FROM alpine
RUN apk add -U tzdata
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai  /etc/localtime
COPY --from=build-env /go/src/app/app-server /usr/local/bin/app-server
EXPOSE 8080
CMD [ "app-server" ]
```

然后构建`Docker`镜像：
```shell
$ docker build -t cnych/goappk8s:v1.0.0 .
.......(省略了)
Successfully built 00751f94d8a9
Successfully tagged cnych/goappk8s:v1.0.0
$ docker push cnych/goappk8s:v1.0.0
```
上面的操作可以将我们本地的镜像`cnych/goappk8s:v1.0.0`推送到公共的`dockerhub`上面去（当然前提是你得先注册了）。

到这里的话其实我们已经可以利用上面的镜像很容易的跑一个容器了，下面我们介绍下如何将服务部署到`kubernetes`上去。

## Kubernetes
当然首先你得有一套可用的`kubernetes`环境，如果你对这部分还不熟悉的话，建议你可以先看下我们前面的[相关文章](/tags/kubernetes/)。
在`Dockerfile`同目录下面新建文件用于描述`kubernetes`的部署方式：（**k8s.yaml**）
```yaml
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: goapp-deploy
  namespace: kube-apps
  labels:
    k8s-app: goappk8s
spec:
  replicas: 2
  revisionHistoryLimit: 10
  minReadySeconds: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 1
  template:
    metadata:
      labels:
        k8s-app: goappk8s
    spec:
      containers:
      - image: cnych/goappk8s:v1.0.0
        imagePullPolicy: Always
        name: goappk8s
        ports:
        - containerPort: 8080
          protocol: TCP
        resources:
          limits:
            cpu: 100m
            memory: 100Mi
          requests:
            cpu: 50m
            memory: 50Mi
        livenessProbe:
          tcpSocket:
            port: 8080
          initialDelaySeconds: 10
          timeoutSeconds: 3
        readinessProbe:
          httpGet:
            path: /ping
            port: 8080
          initialDelaySeconds: 10
          timeoutSeconds: 2

---
apiVersion: v1
kind: Service
metadata:
  name: goapp-svc
  namespace: kube-apps
  labels:
    k8s-app: goappk8s
spec:
  ports:
    - name: api
      port: 8080
      protocol: TCP
      targetPort: 8080
  selector:
    k8s-app: goappk8s

---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: goapp-ingress
  namespace: kube-apps
spec:
  rules:
  - host: goappk8s.local
    http:
      paths:
      - path: /
        backend:
          serviceName: goapp-svc
          servicePort: api
```
上面的`k8s.yaml`文件中，我们定义了3类资源：`Deployment`、`Service`、`Ingress`，如果对`YAML`文件还不太了解的同学，可以查看前面的文章[使用YAML 文件创建 Kubernetes Deployment](/post/use-yaml-create-kubernetes-deployment/)，其中我们设置了`replicas: 2`，表示我们会运行两个`POD`，下面还定义了`strategy`的滚动策略为`RollingUpdate`，`resources`区域定义了我们一个`POD`的资源限制，通过`livenessProbe`和`readinessProbe`设置了健康检查。然后我们用`kubectl`执行下面的命令：

```shell
$ kubectl apply -f k8s.yaml
deployment "goapp-deploy" created
service "goapp-svc" created
ingress "goapp-ingress" created
```
我们可以看到上面定义的三种资源都创建成功了。然后查看资源状态：
```shell
$ kubectl get deployments -n kube-apps |grep goapp
goapp-deploy     2         2         2            2           57s
$ kubectl get svc -n kube-apps |grep goapp
goapp-svc      ClusterIP   10.254.109.69    <none>        8080/TCP                         1m
$ kubectl get ingress -n kube-apps |grep goapp
goapp-ingress   goappk8s.local              80        1m
$ kubectl get pods -n kube-apps |grep goapp
goapp-deploy-84bb6979c-59qkl                             1/1       Running   0          2m
goapp-deploy-84bb6979c-mgg2r                             1/1       Running   0          2m
```
我们可以看到在`kubernetes`集群中已经有两个`POD`在运行了，然后我们可以本地`/etc/hosts`中定义上面`Ingress`中定义的域名：
```bash
你的k8s集群节点IP goappk8s.local
```
然后我们在浏览器中访问链接[http://goappk8s.local/ping](http://goappk8s.local/ping)，可以看到页面上已经打印出来**PONG**。
![PONG](/img/posts/WX20180208-171124.png)

最后整理下代码，将我们的代码提交到[github](https://github.com/cnych/goappk8s)去吧。

最后我们还可以结合`CI/CD`，增加持续集成功能，做到我们更新代码后，自动更新我们的`kubernetes`应用，这部分我们后面再单独进行说明。


最后不要忘记加微信好友哦~~~

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)


