---
title: Traefik 2.0 实现自动化 HTTPS
date: 2019-10-16
tags: ["traefik", "kubernetes", "ingress", "https"]
keywords:
  ["traefik", "kubernetes", "traefik 2.0", "Ingress", "TCP", "https", "acme"]
slug: automatic-https-with-traefik2
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1571181761981-0765e0328710.jpeg",
      desc: "Drying roses",
    },
  ]
category: "kubernetes"
---

上一篇文章我们实现了 [Traefik 2.0 暴露 Redis(TCP) 服务](/post/expose-redis-by-traefik2/)，我们了解到 Traefik 中使用 TCP 路由配置需要 SNI，而 SNI 又是依赖 TLS 的，所以需要配置证书才能正常访问 TCP 服务，其实 Traefik 除了支持我们手动配置 TLS 证书之外，还支持自动生成 TLS 证书，本文就来为大家介绍如何在 Traefik 2.0 中配置自动化 HTTPS 服务。

<!--more-->

同样的，前提条件还是需要提前在 Kubernetes 集群中安装好 Traefik 2.0 服务，可以参考之前我们提供的安装资源清单 [https://github.com/cnych/kubeapp](https://github.com/cnych/kubeapp/tree/master/traefik2)。里面包含 4 个文件：IngressRoute.yaml、crd.yaml、rbac.yaml、traefik.yaml，部分文件我们需要做一些变更。

我们这里就以 Traefik 的 WebUI 为例，之前我们开启了 KubernetesCRD 这个 Provider，通过创建一个 IngressRoute 对象来开启对 WebUI 的访问，资源清单如下所示：(IngressRoute.yaml)

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-webui
  namespace: kube-system
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`traefik.qikqiak.com`)
      kind: Rule
      services:
        - name: traefik
          port: 8080
```

要使用 Let's Encrypt 来进行自动化 HTTPS，就需要首先开启 ACME，开启 ACME 需要通过静态配置的方式，也就是说可以通过环境变量、启动参数等方式来提供，我们这里还是直接使用启动参数的形式来开启，在 Traefik 的部署文件中添加如下命令行参数：

```yaml
args:
  - --entrypoints.web.Address=:80
  - --entrypoints.websecure.Address=:443
  - --api.insecure=true # 开启 webui 需要该参数
  - --providers.kubernetescrd
  - --api
  - --api.dashboard=true
  - --accesslog
  # 使用 tls 验证这种方式
  - --certificatesresolvers.default.acme.tlsChallenge=true
  # 邮箱配置
  - --certificatesResolvers.default.acme.email="ych_1024@163.com"
  # 保存 ACME 证书的位置
  - --certificatesResolvers.default.acme.storage="acme.json"
  # 下面是用于测试的ca服务，如果https证书生成成功了，则移除下面参数
  - --certificatesresolvers.default.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory
```

这里我们使用的是 `tlsChallenge` 这种 ACME 验证方式，需要注意的是当使用这种验证时，Let's Encrypt 到 Traefik 443 端口必须是可达的，除了这种验证方式外，还有 `httpChallenge` 和 `dnsChallenge` 两种验证方式，更常用的是 http 这种验证方式，关于这几种验证方式的使用可以查看文档：[https://www.qikqiak.com/traefik-book/https/acme/](https://www.qikqiak.com/traefik-book/https/acme/) 了解他们之间的区别。

上面我们相当于指定了一个名为 `default` 的证书解析器，然后要注意的是，一定要将这里的 WebUI 的域名`traefik.qikqiak.com` 解析到 Traefik 的所在节点，解析完成后，重新部署 Traefik：

```yaml
$ kubectl apply -f traefik.yaml
```

<!--adsense-text-->

部署完成后，我们需要让 WebUI 的域名去监听 443 端口，因为我们这里使用的是 `tlsChallenge` 这种验证方式，在上面的 `IngressRoute.yaml` 文件中新建一个对象，用来监听 443 端口，如下所示：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-webui-tls
  namespace: kube-system
spec:
  entryPoints:
    - websecure # 注意这里是websecure这个entryPoint，监控443端口
  routes:
    - match: Host(`traefik.youdianzhishi.com`)
      kind: Rule
      services:
        - name: traefik
          port: 8080
  tls:
    certResolver: default # 使用我们配置的 default 这个解析器
```

然后更新对象：

```shell
$ kubectl apply -f IngressRoute.yaml
# 现在有两个 IngressRoute 对象
$ kubectl get ingressroutes -n kube-system
NAME                AGE
traefik-webui       28d
traefik-webui-tls   5h15m
```

这个时候如果一切正常的话我们已经可以通过 HTTPS 去访问我们的服务了：

![traefik2 webui https](https://picdn.youdianzhishi.com/images/traefik2-webui-https.png)

> Traefik 会自动跟踪其生成的 ACME 证书的到期日期。如果证书过期之前还不到 30 天了，Traefik 会尝试进行自动续订。

同样的，我们通过 HTTP 协议也是可以访问到的，但是如果需要将 HTTP 请求强制跳转到 HTTPS 的话，就需要借助 Traefik 2.0 的提供的中间件来完成了。

![traefik2 中间件](https://www.qikqiak.com/traefik-book/assets/img/middleware/overview.png)

同样，在上面的 IngressRoute.yaml 文件中添加一个 Middleware 的 CRD 对象，内容如下所示：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: redirect-https
  namespace: kube-system
spec:
  redirectScheme:
    scheme: https
```

这里我们就声明了一个名为 `redirectSchemea` 的中间件，该中间件可以将我们的请求跳转到另外的 scheme 请求，然后将该中间件配置到 HTTP 请求的服务上面：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: traefik-webui
  namespace: kube-system
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`traefik.youdianzhishi.com`)
      kind: Rule
      services:
        - name: traefik
          port: 8080
      middlewares: # 使用上面新建的中间件
        - name: redirect-https
```

然后更新对象：

```shell
$ kubectl apply -f IngressRoute.yaml
```

这样当我们通过 HTTP 去访问 WebUI 服务时，也会自动跳转到 HTTPS 上面去，同样可以查看 [中间件文件](https://www.qikqiak.com/traefik-book/middlewares/overview/) 了解更多关于中间件的信息。

本文中用到的资源清单文件可以从这里获取：[https://github.com/cnych/kubeapp/tree/master/traefik2/https](https://github.com/cnych/kubeapp/tree/master/traefik2/https)。

关于 Traefik 2.0 的更多使用，可以关注 [https://www.qikqiak.com/traefik-book]([https://www.qikqiak.com/traefik-book]) 文档。

<!--adsense-self-->
