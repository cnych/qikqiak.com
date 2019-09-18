---
title: Traefik 2.0 正式版发布
date: 2019-09-18
tags: ["traefik", "kubernetes", "ingress"]
keywords: ["traefik", "kubernetes", "traefik 2.0", "Ingress", "TCP"]
slug: traefik2-ga
gitcomment: true
category: "kubernetes"
---
[![traefik 2.0](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik2.png)](/post/traefik2-ga/)

寄予厚望的 [Traefik 2.0](https://traefik.io/) 经过了一年的等待，今天终于正式发布了，此次大版本的更新添加了许多新功能，特别是大家都期望的支持 TCP 的功能。接下来我们就来探索下 Traefik 2.0 中有哪些新增的功能呢？

<!--more-->

> 在 Kubernetes 集群上安装 Traefik 2.0 可以参考我这里的资源清单文件：[https://github.com/cnych/kubeapp](https://github.com/cnych/kubeapp/tree/master/traefik2)。

## 支持 SNI 路由和多协议端口的 TCP

![traefik tcp](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-tcp.png)

在之前 [2.0 alpha 声明](https://blog.containo.us/back-to-traefik-2-0-2f9aa17be305)中就讨论过这个最重要的功能，但实际上这个功能是第10个 [feature request](https://github.com/containous/traefik/issues/10)，所以花了很长时间来讨论并实现这个新功能。

下面是一个简单的示例配置 - 使用最新支持的 YAML 文件格式，将请求路由到一个数据库上面去：
```yaml
tcp:
  routers:
    to-database:
      entrypoints:
      - database-entrypoint
      rule: HostSNI(`*`)
      service: database-service
  services:     
    database-service:
      loadBalancer:
        servers:
        - address: xx.xx.xx.xx:xx
```

上面这个配置示例表示每个以 database-entrypoint 结尾的请求都将被路由到 database-service 这个服务上去。
<!--adsense-text-->
此外通过 TLS，Traefik 还可以根据 SNI 来路由 TCP 请求。在下面示例中，Traefik 就将根据 SNI 将请求路由到两个数据库：
```yaml
tcp:
  routers:
    to-db-1:
      entrypoints:
      - web-secure
      rule: "HostSNI(`db1.domain`)"
      service: "db1"
      tls: {} 
    to-db-2:
      entrypoints:
      - web-secure
      rule: "HostSNI(`db2.domain`)"
      service: "db2"
      tls: {}
```

另外 Traefik 还是支持 HTTP 和 TCP 在同一个端口上，如果你希望获得相同的入口的同时获取 HTTP 和 TCP 请求，那么 Traefik 可以很完美的来处理它。
```yaml
tcp:
  routers:
    to-db-1:
      entrypoints:
      - web-secure
      rule: "HostSNI(`db1.domain`)"
      service: "db-1"
      tls: {}
http:
  routers:
    to-db1-dashboard:
      entrypoints:
      - web-secure
      rule: "Host(`dashboard.db1.domain`)"
      service: "db1-dashboard"
      tls: {}
```

比如上面这个示例中，`dashboard.db1.domain` 上的 HTTP 请求将路由到数据库的 Dashboard 服务上，而上面的 `db1.domain` 上的 TCP 请求将路由到数据库上面去，这个功能是不是非常赞👍🏻。

## 使用中间件完全自定义路由
![traefik middleware](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-middleware.png)

在 Traefik 2.0 中还引入了[中间件](https://docs.traefik.io/v2.0/middlewares/overview/)功能，可以用于将请求路由到目的地之前或之后来调整请求。

首先我们可以声明一个中间件，在任意数量的路由上面都可以重用它们。下面我们来演示下如何配置中间件，声明一个 [BasicAuth 中间件](https://docs.traefik.io/v2.0/middlewares/basicauth/)来控制对我们服务的访问（这次使用 TOML 来配置）：
```toml
# 为两个用户声明一个 basicauth 的中间件
[http.middlewares.test-auth.basicAuth]
  users = ["user1:hashed", "user2:hashed"]
# 将上面的中间件应用到路由上面去
[http.routers.my-router.to-service]
  rule = "host(`my-protected.domain`)"
  middlewares = ["test-auth"]
  service = "service1"
```

此外可以声明一个链来组合绑定这些中间件，并反复使用它们，对于 Kubernetes 用户来说，还可以使用 Traefik 的新 CRD 来进行更加清晰明了的配置，而不需要复杂的注解。（可以在文档中找到有关 [IngressRoute 对象](https://docs.traefik.io/v2.0/providers/kubernetes-crd/#traefik-ingressroute-definition)的更多信息。）如下所示：
```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: test
  namespace: default
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`mydomain`)
      kind: Rule
      services:
        - name: whoami
          port: 80
      middlewares:
        - name: secured
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: secured
spec:
  chain:
    middlewares:
    - name: https-only
    - name: known-ips
    - name: auth-users
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: auth-users
spec:
  basicAuth:
    secret: secretUsers # 兼容 K8S secrets 对象
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: https-only
spec:
  redirectScheme:
    scheme: https
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: known-ips
spec:
  ipWhiteList:
    sourceRange:
    - 192.168.1.7
    - 127.0.0.1/32
```

上面示例中 secured 这个中间件就是有 https-only、know-ips、auth-users 这3个中间件组成的一个链式中间件。

而且在 Traefik 中内置了[许多中间件](https://docs.traefik.io/v2.0/middlewares/overview/)：路径操作、多种身份验证机制、缓冲、断路器、重试、压缩、错误处理、headers、IP 白名单、限速、重定向等。此外官方还重新设计了代码架构，可以让开发者更加容易提供第三方的中间件。


## 全新的 Dashboard
设计了全新的 WebUI，目标是向用户一目了然地展示集群上信息，还希望显示可以启用的哪些功能特性。

![traefik webui](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-webui.png)

由于和之前版本的使用流程发生了很大变化，所以希望能够在 WebUI 上面可以显示服务的详细配置信息。

![traefik webui path](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-webui-path.png)


## 金丝雀发布
![traefik canary](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-cannay.png)

另外一个期待已久的功能特性 - 金丝雀发布、A/B 测试，现在在 Traefik 2.0 中以服务负载均衡的形式进行了支持。可以将服务负载均衡器看成负责将请求转发到实际服务的虚拟服务，下面让我们来看一个经典的场景，现在有一个路由到一个 API：
```yaml
http:
  routers:
    my-route:
      rule: "Host(`my.domain`)"
      service: my-api-v1
  services:
    my-api-v1:
      loadBalancer:
        servers:
        - url: "http://private-ip-server-1/"
```

现在我们要部署该服务的一个新版本，但是希望可以逐步部署，比如先部署大约1/3的请求。我们这里就需要使用一个新的 ID（这里可以用 my-api-v2）来部署一个新的服务:
```yaml
http:
  services:
    my-api-v2:
      loadBalancer:
        servers:
        - url: "http://private-ip-server-2/"
```

然后我们需要定义一个服务负载均衡器（我们这里叫 cannary-api），并定义每个版本的比例，而不是直接指向新版本：
```yaml
http:
  services:
    canary-api:
      weighted:
        services:
        - name: my-api-v1
          weight: 3
        - name: my-api-v2
          weight: 1
```

最后，记得把路由指向这个 canary-api 服务：
```yaml
http:
  routers:
    my-route:
      rule: "Host(`my.domain`)"
      service: canary-api
```

之后，我们不需要重新部署真正的服务就可以更新权重，当然还可以对它们进行扩容，这都不会对金丝雀部署本身产生任何的影响。


## 流量复制
![traefik mirror](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-mirror.png)

金丝雀部署并不是服务系列功能中唯一的一种可以使用的功能，Traefik 2.0 还引入了镜像服务，一种可以将[流入流量复制](https://github.com/containous/traefik/issues/2989)并同时将其发送给其他服务的方法，镜像服务可以获得给定百分比的请求同时也会忽略这部分请求的响应:
```yaml
[http.services.mirrored-api]
    [http.services.mirrored-api.mirroring]
      service = "api"
    [[http.services.mirrored-api.mirroring.mirrors]]
      name = "api-v2"
      percent = 10
[http.services.api]
    [http.services.api.loadBalancer]
      [[http.services.api.loadBalancer.servers]]
        url = "http://private-ip-server-1/"
[http.services.api-v2]
    [http.services.api-v2.loadBalancer]
      [[http.services.api-v2.loadBalancer.servers]]
        url = "http://private-ip-server-2/"
```

上面这个示例中，我们就可以复制10%的请求发送给镜像。

当然除了上面提到的这些新特性之外，Traefik 2.0 还有很多新的特性和增强功能，我们这里就不一一列举了，更多的信息我们可以查看官方文档了解更多：[https://docs.traefik.io/v2.0/](https://docs.traefik.io/v2.0/)。

## 迁移
Traefik 2.0 有了这么多的新功能和增强功能，为了帮助用户可以从 1.x 版本过渡到新版本，官方提供了一个迁移指南，地址：[https://docs.traefik.io/v2.0/migration/v1-to-v2/](https://docs.traefik.io/v2.0/migration/v1-to-v2/)。

对于 Kubernetes 用户，还提供了一个迁移工具来帮助你将 Ingress 对象转换成新的 IngressRoute 格式，工具地址：[https://github.com/containous/traefik-migration-tool](https://github.com/containous/traefik-migration-tool)。


## 相关链接

* Traefik [documentation](https://docs.traefik.io/v2.0/), [website](https://traefik.io/) & [Github page](https://github.com/containous/traefik)
* [Containous website](https://containo.us/)
* [Community forum](https://community.containo.us/)
* [Traefik 2.0](https://blog.containo.us/traefik-2-0-6531ec5196c2)

<!--adsense-self-->