---
title: Traefik 2.0 暴露 Redis(TCP) 服务
date: 2019-10-14
tags: ["traefik", "kubernetes", "ingress", "tcp"]
keywords: ["traefik", "kubernetes", "traefik 2.0", "Ingress", "TCP", "redis"]
slug: expose-redis-by-traefik2
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1570997491915-47ade51fed9f.jpeg", desc: "https://unsplash.com/photos/77AW8rM9KGg"}]
category: "kubernetes"
---

前面我们已经提到了 [Traefik2.0 已经正式发布了](/post/traefik2-ga/)，Traefik2.0 已经支持了 TCP 服务的，但是 Traefik 的官方文档实在是有点混乱，特别是在 Kubernetes 下面的使用更不详细，我在业余时间已经在尝试对官方文档进行翻译，地址：[https://www.qikqiak.com/traefik-book](https://www.qikqiak.com/traefik-book/)，去掉了一些多余的文档，增加一些在 Kubernetes 下面的使用案例。

<!--more-->

本文是来演示如何在 Kubernetes 下面通过 Traefik 暴露一个 TCP 服务的，这里我们以 Redis 为例。首先需要保证 Traefik 2.0 已经安装到了 Kubernetes 集群之中，可以参考之前我们提供的安装资源清单 [https://github.com/cnych/kubeapp](https://github.com/cnych/kubeapp/tree/master/traefik2)。

## 部署 Redis 
为了演示方便，我们这里只部署单节点的 Redis，对于 Redis 集群模式并不是我们这里的重点，下面是我们部署使用的资源清单文件：（redis.yaml）

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: redis
spec:
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:3.2.11
        ports:
        - containerPort: 6379
          protocol: TCP

---

apiVersion: v1
kind: Service
metadata:
  name: redis
spec:
  ports:
  - port: 6379
    targetPort: 6379
  selector:
    app: redis
```

直接创建即可：

```shell
$ kubectl apply -f redis.yaml
```

## 暴露 TCP 服务
由于 Traefik 中使用 TCP 路由配置需要 SNI，而 SNI 又是依赖 TLS 的，所以我们需要配置证书才行，但是如果没有证书的话，我们可以使用通配符 `*` 进行配置，我们这里创建一个 IngressRouteTCP 类型的 CRD 对象（前面我们就已经安装了对应的 CRD 资源）：(ingressroute-redis.yaml)

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRouteTCP
metadata:
  name: redis
spec:
  entryPoints:
    - redis
  routes:
  - match: HostSNI(`*`)
    services:
    - name: redis
      port: 6379
```

<!--adsense-text-->

要注意的是这里的`entryPoints`部分，是根据我们启动的 Traefik 的静态配置中的 entryPoints 来决定的，比如我们可以自己添加一个用于 Redis 的专门的入口点：

```yaml
containers:
- image: traefik:v2.0
  name: traefik-ingress-lb
  ports:
  - name: web
    containerPort: 80
    hostPort: 80
  - name: websecure
    containerPort: 443
    hostPort: 443
  - name: redis
    containerPort: 6379
    hostPort: 6379
  - name: admin
    containerPort: 8080
  args:
  - --entrypoints.web.Address=:80
  - --entrypoints.websecure.Address=:443
  - --entrypoints.redis.Address=:6379
  - --api.insecure=true
  - --providers.kubernetescrd
  - --api
  - --api.dashboard=true
  - --accesslog
```

这里给入口点添加 hostPort 是为了能够通过节点的端口访问到服务，关于 `entryPoints` 入口点的更多信息，可以查看文档 [entrypoints](https://www.qikqiak.com/traefik-book/routing/entrypoints/) 了解更多信息。

然后直接创建上面的 IngressRouteTCP 对象：

```shell
$ kubectl apply -f ingressroute-redis.yaml
```

创建完成后，同样我们可以去 Traefik 的 Dashboard 页面上查看是否生效：

![traefik redis service](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-redis-tcp.jpg)

然后我们配置一个域名解析到 Traefik 所在的节点，然后通过 6379 端口来连接 Redis 服务：

```shell
$ redis-cli -h redis.youdianzhishi.com -p 6379
redis.youdianzhishi.com:6379> ping
PONG
redis.youdianzhishi.com:6379> set hello world
OK
redis.youdianzhishi.com:6379> get hello
"world"
redis.youdianzhishi.com:6379>
```

到这里我们就完成了将 Redis（TCP）服务暴露给外部用户了。本文中用到的资源清单文件可以从这里获取：[https://github.com/cnych/kubeapp/tree/master/traefik2/redis](https://github.com/cnych/kubeapp/tree/master/traefik2/redis)。

关于 Traefik 2.0 的更多使用，可以关注 [https://www.qikqiak.com/traefik-book]([https://www.qikqiak.com/traefik-book]) 文档。

<!--adsense-self-->
