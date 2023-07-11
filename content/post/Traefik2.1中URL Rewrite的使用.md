---
title: Traefik2.X 版本 中 URL Rewrite 的使用
date: 2020-01-10
tags: ["kubernetes", "traefik", "ingress"]
keywords: ["kubernetes", "traefik", "ingress", "rewrite", "中间件"]
slug: url-rewrite-on-traefik2.X
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1578612818852-d6b85c0c0ef6.jpeg",
      desc: "https://unsplash.com/photos/U1WVDMEjwGE",
    },
  ]
category: "kubernetes"
---

前面我们介绍了在 [ingress-nginx 中 URL Rewrite 的使用](https://www.qikqiak.com/post/url-rewrite-on-ingress-nginx/)，其中重写路径大部分还是和传统的 nginx 方式差不多，如果我们使用的是比较云原生的 Traefik 来作为我们的网关的话，在遇到有 URL Rewrite 需求的时候又改怎么做呢？前面我们用一篇文章 [一文搞懂 Traefik2.1 的使用](https://www.qikqiak.com/post/traefik-2.1-101/) 介绍了 Traefik2.1 的基本的功能，唯独没有提到 URL Rewrite 这一点，在 Traefik2.1 中我们依然可以很方便的用中间件的方式来完成这个功能。

<!--more-->

比如我们现在在 Kubernetes 集群中部署了一个 Nexus 应用，和其他应用一样，我们通过 IngressRoute 来暴露服务，对应的资源清单如下所示：(nexus.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nexus
  labels:
    app: nexus
spec:
  selector:
    matchLabels:
      app: nexus
  template:
    metadata:
      labels:
        app: nexus
    spec:
      containers:
        - image: cnych/nexus:3.20.1
          imagePullPolicy: IfNotPresent
          name: nexus
          ports:
            - containerPort: 8081

---
apiVersion: v1
kind: Service
metadata:
  labels:
    app: nexus
  name: nexus
spec:
  ports:
    - name: nexusport
      port: 8081
      targetPort: 8081
  selector:
    app: nexus

---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: nexus
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`nexus.qikqiak.com`)
      services:
        - kind: Service
          name: nexus
          port: 8081
```

当然前提条件是需要先在集群中部署上 Traefik2.1 这个 Ingress Controller，还没有部署的可以参考前面的 [一文搞懂 Traefik2.1 的使用](https://www.qikqiak.com/post/traefik-2.1-101/) 这篇文章，直接部署上面的应用即可:

```shell
$ kubectl apply -f nexus.yaml
$ kubectl get ingressroute
NAME                AGE
nexus               19h
$ kubectl get pods
NAME                                      READY   STATUS    RESTARTS   AGE
nexus-f9f8c77b5-vvvvw                     1/1     Running   0          20h
$ kubectl get svc
NAME            TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)          AGE
kubernetes      ClusterIP   10.96.0.1        <none>        443/TCP          62d
nexus           NodePort    10.96.175.87     <none>        8081:30776/TCP   20h
```

部署完成后，我们根据 `IngressRoute` 对象中的配置，只需要将域名 `nexus.qikqiak.com` 解析到 Traefik 的节点即可访问：

![nexus url](https://picdn.youdianzhishi.com/images/nexus-normal-url.png)

到这里我们都可以很简单的来完成，同样的现在我们有一个需求是目前我们只有一个域名可以使用，但是我们有很多不同的应用需要暴露，这个时候我们就只能通过 PATH 路径来进行区分了，比如我们现在希望当我们访问 `http:/nexus.qikqiak.com/foo` 的时候就是访问的我们的 Nexus 这个应用，当路径是 `/bar` 开头的时候是其他应用，这种需求是很正常的，这个时候我们就需要来做 URL Rewrite 了。

<!--adsense-text-->

首先我们使用 [StripPrefix](https://www.qikqiak.com/traefik-book/middlewares/stripprefix/) 这个中间件，这个中间件的功能是**在转发请求之前从路径中删除前缀**，在使用中间件的时候我们只需要理解中间件操作的都是我们直接的请求即可，并不是真实的应用接收到请求过后来进行修改。

![traefik2 middleware](https://www.qikqiak.com/traefik-book/assets/img/middleware/overview.png)

现在我们添加一个如下的中间件：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: strip-foo-path
spec:
  stripPrefix:
    prefixes:
      - /foo
```

然后现在我们就需要从 `http:/nexus.qikqiak.com/foo` 请求中去匹配 `/foo` 的请求，把这个路径下面的请求应用到上面的中间件中去，因为最终我们的 Nexus 应用接收到的请求是不会带有 `/foo` 路径的，所以我们需要在请求到达应用之前将这个前缀删除，更新 IngressRoute 对象：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: nexus
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`nexus.qikqiak.com`) && PathPrefix(`/foo`) # 匹配 /foo 路径
      middlewares:
        - name: strip-foo-path
      services:
        - kind: Service
          name: nexus
          port: 8081
```

创建中间件更新完成上面的 IngressRoute 对象后，这个时候我们前往浏览器中访问 `http:/nexus.qikqiak.com/foo`，这个时候发现我们的页面任何样式都没有了：

![nexus rewrite url error](https://picdn.youdianzhishi.com/images/nexus-rewrite-url-error.png)

我们通过 Chrome 浏览器的 Network 可以查看到 `/foo` 路径的请求是 200 状态码，但是其他的静态资源对象确全都是 404 了，这是为什么呢？我们仔细观察上面我们的 IngressRoute 资源对象，我们现在是不是只匹配了 `/foo` 的请求，而我们的静态资源是 `/static` 路径开头的，当然就匹配不到了，所以就出现了 404，所以我们只需要加上这个 `/static` 路径的匹配就可以了，同样更新 IngressRoute 对象：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: nexus
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`nexus.qikqiak.com`) && PathPrefix(`/foo`)
      middlewares:
        - name: strip-foo-path
      services:
        - kind: Service
          name: nexus
          port: 8081
    - kind: Rule
      match: Host(`nexus.qikqiak.com`) && PathPrefix(`/static`) # 匹配 /static 的请求
      services:
        - kind: Service
          name: nexus
          port: 8081
```

然后更新 IngressRoute 资源对象，这个时候再次去访问应用，可以发现页面样式已经正常了，也可以正常访问应用了：

![nexus rewrite url error2](https://picdn.youdianzhishi.com/images/nexus-rewrite-url-error2.png)

但进入应用后发现还是有错误提示信息，通过 Network 分析发现还有一些 `/service` 开头的请求是 404，当然我们再加上这个前缀的路径即可：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: nexus
spec:
  entryPoints:
    - web
  routes:
    - kind: Rule
      match: Host(`nexus.qikqiak.com`) && PathPrefix(`/foo`)
      middlewares:
        - name: replace-path
      services:
        - kind: Service
          name: nexus
          port: 8081
    - kind: Rule
      match: Host(`nexus.qikqiak.com`) && (PathPrefix(`/static`) || PathPrefix(`/service`)) # 匹配 /static 和 /service 的请求
      services:
        - kind: Service
          name: nexus
          port: 8081
```

更新后，再次访问应用就已经完全正常了：

![nexus rewrite url ok](https://picdn.youdianzhishi.com/images/nexus-rewrite-url-ok.png)

Traefik2.X 版本中的中间件功能非常强大，基本上官方提供的系列中间件可以满足我们大部分需求了，其他中间件的用法，可以参考文档：[https://www.qikqiak.com/traefik-book/middlewares/overview/](https://www.qikqiak.com/traefik-book/middlewares/overview/)。

<!--adsense-self-->
