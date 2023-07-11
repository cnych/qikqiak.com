---
title: 使用 inlets 和 kubernetes 访问本地服务
date: 2019-09-25
tags: ["inlets", "kubernetes", "websocket"]
keywords: ["inlets", "kubernetes", "websocket", "ssh", "隧道", "Caddy"]
slug: k8s-inlets-local-endpoinsts
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1562184724-0b0833e5ba27.jpeg",
      desc: "A personal space for everyone",
    },
  ]
category: "kubernetes"
---

我们经常有在外网访问我们本地服务的需求，特别是在开发调试阶段，比如做微信登录或者微信支付的时候就需要使用外网正式的域名，然而我们很多时候都是在本地进行开发，我们不可能频繁的部署到外网环境去进行测试，因为这样效率太低了，这是我们开发会经常面临的一个问题。

<!--more-->

对于这个问题有很多常用的内网穿透方案，今天我们来为大家介绍的是一个名为 [inlets](http://github.com/alexellis/inlets) 的工具，该工具是 Go 语言编写的，之前发布的时候在 Hacker News 上非常受欢迎，现在 GitHub 上有 4000 多个 Star，接下来我们就来了解下如何使用 inlets 来访问我们的内网服务。

## 解决方案

上面我们提到了，对于该问题已经有好几种比较优秀的解决方案，他们在外部网络和我们本地环境（无论是 Raspberry Pi，还是家用电脑或者笔记本都可以）之间建立了一条隧道。

下图是 inlets 的运行原理示意图：

![inlets](https://picdn.youdianzhishi.com/images/inlets.png)

一样的 inlets 的目标是将你的本地服务暴露到 Internet 上面去。

需要的一些材料清单：

- 一个出口节点服务器 - 该这节点可以访问互联网和公网 IP，我们的用户将连接到该节点，并通过 websocket 隧道路由到防火墙内部的本地服务。
- 一个客户端 - 客户端充当反向代理或者网桥，当它监听到请求时，会代理到本地服务（比如 Django 服务器），然后发送一个相应回去。
- 使用 websocket 的隧道 - 大多数公司防火墙允许使用 CONNECT 消息在现有的 HTTP/S 代理上建立出站 TCP 链接。

出口节点上的每个 HTTP 请求都会被序列化并作为控制消息发布到 websocket 上面去，然后阻塞住。然后，客户端接收这些请求，确定其是否知道如何代理该站点，然后获取资源并将其作为序列化响应发送回 websocket。

最后，用户的 HTTP 请求将解除阻塞并将相应写入调用方，这样就完成了整个调用过程。

> 默认情况下，对于开发 inlets 是被配置为使用非加密隧道，这样的话就很容易受到攻击，我们可以启用 HTTPS 来进行通信，比如使用 Caddy。

## 使用

对于出口节点我们可以使用阿里云或者其他云服务器，甚至更便宜的 VPS 也可以，主要要求是我们必须具有带有公网 IP 的服务器即可。

![](https://picdn.youdianzhishi.com/images/inlets-run.jpg)

比如我们这里有一台公网 IP 为 1.2.3.4 的节点，使用域名 exit.qikqiak.com 来进行内网服务代理，为该域名创建一个 A 记录，解析到公网 IP 上面。

<!--adsense-text-->

inlets 控制端的安装有多种方式方法，只需要能够绑定到 80 和 443 端口即可，比如 Nginx、Caddy 都可以，我们这里使用 Kubernetes Ingress 的方式来暴露 inlets 的控制端程序。

如果你的节点上没有 Kubernetes 集群，也可以直接 Docker 运行，更多信息可以查看 [https://github.com/alexellis/inlets](https://github.com/alexellis/inlets) 了解更多信息。

首先需要保证你集群中已经安装了 Ingress Controller，并且要在我们上面的这个出口节点部署对应的 Pod，我们这里已经部署使用了 Traefik 2.0 版本。接下来就是部署 inlets 控制端程序。

- 创建一个随机的 secret

```shell
kubectl create secret generic inlets-token --from-literal token=$(head -c 16 /dev/urandom | shasum | cut -d" " -f1)
secret/inlets-token created
```

- 创建一个 Service 对象

```yaml
apiVersion: v1
kind: Service
metadata:
  name: inlets
  labels:
    app: inlets
spec:
  type: ClusterIP
  ports:
    - port: 8000
      protocol: TCP
      targetPort: 8000
  selector:
    app.kubernetes.io/name: inlets
```

- 创建一个 Deployment 对象

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: inlets
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: inlets
  template:
    metadata:
      labels:
        app.kubernetes.io/name: inlets
    spec:
      containers:
        - name: inlets
          image: alexellis2/inlets:2.3.2
          imagePullPolicy: Always
          command: ["inlets"]
          args:
            - "server"
            - "--token-from=/var/inlets/token"
          volumeMounts:
            - name: inlets-token-volume
              mountPath: /var/inlets/
      volumes:
        - name: inlets-token-volume
          secret:
            secretName: inlets-token
```

然后可以创建一个 Ingress 对象或者使用 LoadBalancer 类型的 Service 来连接到上面的 inlets 服务：

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: inlets
  annotations:
    kubernetes.io/tls-acme: "true"
spec:
  tls:
    - hosts:
        - exit.qikqiak.com
      secretName: exit-tls
  rules:
    - host: exit.qikqiak.com
      http:
        paths:
          - path: "/"
            backend:
              serviceName: inlets
              servicePort: 8000
```

我们这里使用 cert-manager 来进行自动化的 HTTPS，当然如果你不需要对通信过程加密的话，直接使用 HTTP 即可。将上面的资源对象创建成功后，接下来我们就可以在我们本地安装 inlets 客户端：

```shell
# Install to /usr/local/bin/ (recommended)
curl -sLS https://get.inlets.dev | sudo sh

# Install to local directory
curl -sLS https://get.inlets.dev | sh
```

获取上面我们创建的 Secret 对象的 Token：

```shell
$ kubectl get secret inlets-token -o jsonpath={.data.token} |base64 -d
856ef14d563221918c2d3b9c7d15af94ce9a6d63
```

然后在本地电脑上使用 inlets 客户端打开隧道：

```shell
$ inlets client \
 --remote ws://exit.qikqiak.com \
 --upstream=exit.qikqiak.com=http://127.0.0.1:8000 \
 --token=856ef14d563221918c2d3b9c7d15af94ce9a6d63
2019/09/25 16:36:26 Upstream: exit.qikqiak.com => http://127.0.0.1:8000
2019/09/25 16:36:26 Token: "856ef14d563221918c2d3b9c7d15af94ce9a6d63"
Welcome to inlets.dev! Find out more at https://github.com/alexellis/inlets

map[X-Inlets-Id:[2d17ad31e4e1446bb99b2aecc0505f23] X-Inlets-Upstream:[exit.qikqiak.com=http://127.0.0.1:8000] Authorization:[Bearer 856ef14d563221918c2d3b9c7d15af94ce9a6d63]]
INFO[0000] Connecting to proxy                           url="wss://exit.qikqiak.com/tunnel"
```

- `--token`参数使我们的客户端和出口节点进行身份验证，可以防止未经授权的访问。
- `wss://` 可以让我们使用加密隧道来防止攻击，如果你不考虑安全问题，使用`ws://`即可。

到这里，我们就可以在 Internet 上面通过访问 https://exit.qikqiak.com 来访问我本地电脑上运行在 8000 端口的服务了。

如果你本地有多个域名和多个服务需要代理，只需要更改`--upstream`参数即可，比如：

```shell
inlets client \
 --remote wss://exit.domain.com \
 --upstream=gateway.domain.com=http://127.0.0.1:8080,prometheus.domain.com=http://127.0.0.1:9090
```

我本地 8000 端口上面是一个简单 Django 服务，所以现在在公网上面访问 https://exit.qikqiak.com 即可访问到本地服务资源：

![inlets local server](https://picdn.youdianzhishi.com/images/django-inlets.png)

这样我们建立了一个完全免费的隧道，可以穿透几乎所有防火墙。也解决了我们在 Internet 上面访问我们内网服务的需求。到这里，可能很多同学想到了将自己的 Raspberry Pi 利用起来了吧？

## 参考链接

- https://github.com/alexellis/inlets
- https://blog.alexellis.io/https-inlets-local-endpoints/

<!--adsense-self-->
