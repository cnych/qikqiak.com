---
title: 图解 Kubernetes Ingress
date: 2020-11-06
tags: ["kubernetes", "ingress"]
slug: visually-explained-k8s-ingress
keywords: ["kubernetes", "ingress"]
gitcomment: true
bigimg:
  [
    {
      src: "/img/posts/photo-1503863937795-62954a3c0f05.jpeg",
      desc: "Morning glory",
    },
  ]
category: "kubernetes"
---

Kubernetes Ingress 只是 Kubernetes 中的一个普通资源对象，需要一个对应的 Ingress Controller 来解析 Ingress 的规则，暴露服务到外部，比如 ingress-nginx，本质上来说它只是一个 Nginx Pod，然后将请求重定向到其他内部（ClusterIP）服务去，这个 Pod 本身也是通过 Kubernetes 服务暴露出去，最常见的方式是通过 LoadBalancer 来实现的。

同样本文希望用一个简单清晰的概述，让你来了解 Kubernetes Ingress 背后的东西，让你更容易理解使用的 Ingress。

<!--more-->

## 为什么要使用 Ingress？

我们可以使用 Ingress 来使内部服务暴露到集群外部去，它为你节省了宝贵的静态 IP，因为你不需要声明多个 LoadBalancer 服务了，此次，它还可以进行更多的额外配置。下面我们通过一个简单的示例来对 Ingress 进行一些说明吧。

## 简单 HTTP server

首先，我们先回到容器、Kubernetes 之前的时代。

之前我们更多会使用一个（Nginx）HTTP server 来托管我们的服务，它可以通过 HTTP 协议接收到一个特定文件路径的请求，然后在文件系统中检查这个文件路径，如果存在则就返回即可。

![](https://picdn.youdianzhishi.com/images/20201106093740.png)

例如，在 Nginx 中，我们可以通过下面的配置来实现这个功能。

```
location /folder {
    root /var/www/;
    index index.html;
}
```

除了上面提到的功能之外，我们可以当 HTTP server 接收到请求后，将该请求重定向到另一个服务器（意味着它作为代理）去，然后将该服务器的响应重定向到客户端去。对于客户端来说，什么都没有改变，接收到的结果仍然还是请求的文件（如果存在的话）。

![](https://picdn.youdianzhishi.com/images/20201106094218.png)

同样如果在 Nginx 中，重定向可以配置成下面的样子：

```
location /folder {
    proxy_pass http://second-nginx-server:8000;
}
```

这意味着 Nginx 可以从文件系统中提供文件，或者通过代理将响应重定向到其他服务器并返回它们的响应。

## 简单的 Kubernetes 示例

### 使用 ClusterIP 服务

在 Kubernetes 中部署应用后，我们应该先去了解 Kubernetes Service 服务（前文中讲解的）。比如我们有两个 worker 节点，有两个服务 **service-nginx** 和 **service-python**，它们指向不同的 pods。这两个服务没有被调度到任何特定的节点上，也就是在任何节点上都有可能，如下图所示：

![](https://picdn.youdianzhishi.com/images/20201106094648.png)

在集群内部我们可以通过他们的 Service 服务来请求到 Nginx pods 和 Python pods 上去，现在我们想让这些服务也能从集群外部进行访问，按照前文提到的我们就需要将这些服务转换为 LoadBalancer 服务。

### 使用 LoadBalancer 服务

当然使用 LoadBalancer 服务的前提是我们的 Kubernetes 集群的托管服务商要能支持才行，如果支持我们可以将上面的 ClusterIP 服务转换为 LoadBalancer 服务，可以创建两个外部负载均衡器，将请求重定向到我们的节点 IP，然后重定向到内部的 ClusterIP 服务。

![](https://picdn.youdianzhishi.com/images/20201106095503.png)

我们可以看到两个 LoadBalancers 都有自己的 IP，如果我们向 LoadBalancer `22.33.44.55` 发送请求，它请被重定向到我们的内部的 **service-nginx** 服务去。如果发送请求到 77.66.55.44，它将被重定向到我们的内部的 **service-python** 服务。

这个确实很方便，但是要知道 IP 地址是比较稀有的，而且价格可不便宜。想象下我们 Kubernetes 集群中不只是两个服务，有很多的话，我们为这些服务创建 LoadBalancers 成本是不是就成倍增加了。

那么是否有另一种解决方案可以让我们只使用一个 LoadBalancer 就可以把请求转发给我们的内部服务呢？我们先通过手动（非 Kubernetes）的方式来探讨下这个问题。

### 手动配置 Nginx 代理服务

我们知道 Nginx 可以作为一个代理使用，所以我们可以很容易想到运行一个 Nginx 来代理我们的服务。如下图所示，我们新增了一个名为 **service-nginx-proxy** 的新服务，它实际上是我们唯一的一个 LoadBalancer 服务。service-nginx-proxy 仍然会指向一个或多个 **Nginx-pod-endpoints**（为了简单没有在图上标识），之前的另外两个服务转换为简单的 ClusterIP 服务了。

![](https://picdn.youdianzhishi.com/images/20201106100634.png)

可以看到我们只分配了一个 IP 地址为 `11.22.33.44` 的负载均衡器，对于不同的 http 请求路径我们用黄色来进行标记，他们的目标是一致的，只是包含的不同的请求 URL。

**service-nginx-proxy** 服务会根据请求的 URL 来决定他们应该将请求重定向到哪个服务去。

在上图中我们有两个背后的服务，分别用红色和蓝色进行了标记，红色会重定向到 **service-nginx** 服务，蓝色重定向到 **service-python** 服务。对应的 Nginx 代理配置如下所示：

```
location /folder {
    proxy_pass http://service-nginx:3001;
}
location /other {
    proxy_pass http://service-python:3002;
}
```

只是目前我们需要去手动配置 **service-nginx-proxy** 服务，比如新增了一个请求路径需要路由到其他服务去，我们就需要去重新配置 Nginx 的配置让其生效，但是这个确实是一个可行的解决方案，只是有点麻烦而已。

而 Kubernetes Ingress 就是为了让我们的配置更加容易、更加智能、更容易管理出现的，所以在 Kubernetes 集群中我们会用 Ingress 来代替上面的手动配置的方式将服务暴露到集群外去。

## 使用 Kubernetes Ingress

现在我们将上面手动配置代理的方式转换为 Kubernetes Ingress 的方式，如下图所示，我们只是使用了一个预先配置好的 Nginx（Ingress），它已经为我们做了所有的代理重定向工作，这为我们节省了大量的手动配置工作了。

![](https://picdn.youdianzhishi.com/images/20201106101823.png)

这其实就已经说明了 Kubernetes Ingress 是什么，下面让我们来看看一些配置实例吧。

## 安装 Ingress 控制器

Ingress 只是 Kubernetes 的一种资源对象而已，在这个资源中我们可以去配置我们的服务路由规则，但是要真正去实现识别这个 Ingress 并提供代理路由功能，还需要安装一个对应的控制器才能实现。

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/nginx-0.24.1/deploy/mandatory.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/nginx-0.24.1/deploy/provider/cloud-generic.yaml
```

使用下面的命令，可以看到安装在命名空间 **ingress-nginx** 中的 k8s 资源。

![](https://picdn.youdianzhishi.com/images/20201106102209.png)

我们可以看到一个正常的 LoadBalancer 服务，有一个外部 IP 和一个所属的 pod，我们可以使用命令 `kubectl exec` 进入该 pod，里面包含一个预配置的 Nginx 服务器。

![](https://picdn.youdianzhishi.com/images/20201106102331.png)

其中的 `nginx.conf` 文件就包含各种代理重定向设置和其他相关配置。

## Ingress 配置示例

我们所使用的 Ingress yaml 例子可以是这样的。

```yaml
# just example, not tested
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: nginx
  namespace: default
  name: test-ingress
spec:
  rules:
    - http:
        paths:
          - path: /folder
            backend:
              serviceName: service-nginx
              servicePort: 3001
    - http:
        paths:
          - path: /other
            backend:
              serviceName: service-python
              servicePort: 3002
```

和其他资源对象一样，通过 `kubectl create -f ingress.yaml` 来创建这个资源对象即可，创建完成后这个 Ingress 对象会被上面安装的 Ingress 控制器转换为对应的 Nginx 配置。

<!--adsense-text-->

如果你的一个内部服务，即 Ingress 应该重定向到的服务，是在不同的命名空间里，怎么办？因为我们定义的 Ingress 资源是命名空间级别的。在 Ingress 配置中，**只能重定向到同一命名空间的服务**。

如果你定义了多个 Ingress yaml 配置，那么这些配置会被一个单一的 Ingress 控制器合并成一个 Nginx 配置。也就是说所有的人都在使用同一个 LoadBalancer IP。

## 配置 Ingress Nginx

有时候我们需要对 Ingress Nginx 进行一些微调配置，我们可以通过 Ingress 资源对象中的 annotations 注解来实现，比如我们可以配置各种平时直接在 Nginx 中的配置选项。

```yaml
kind: Ingress
metadata:
  name: ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "30"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "500"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "500"
    nginx.ingress.kubernetes.io/send-timeout: "500"
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-methods: "*"
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
```

此外也可以做更细粒度的规则配置，如下所示：

```yaml
nginx.ingress.kubernetes.io/configuration-snippet: |
  if ($host = 'www.qikqiak.com' ) {
    rewrite ^ https://qikqiak.com$request_uri permanent;
  }
```

这些注释都将被转换成 Nginx 配置，你可以通过手动连接(`kubectl exec`)到 nginx pod 中检查这些配置。

关于 ingress-nginx 更多的配置使用可以参考官方文档相关说明：

- [https://github.com/kubernetes/ingress-nginx/tree/master/docs/user-guide/nginx-configuration](https://github.com/kubernetes/ingress-nginx/tree/master/docs/user-guide/nginx-configuration)
- [https://github.com/kubernetes/ingress-nginx/blob/master/docs/user-guide/nginx-configuration/annotations.md#lua-resty-waf](https://github.com/kubernetes/ingress-nginx/blob/master/docs/user-guide/nginx-configuration/annotations.md#lua-resty-waf)

### 查看 ingress-nginx 日志

要排查问题，通过查看 Ingress 控制器的日志非常有帮助。

![](https://picdn.youdianzhishi.com/images/20201106103539.png)

### 使用 Curl 测试

如果我们想测试 Ingress 重定向规则，最好使用 `curl -v [yourhost.com](http://yourhost.com)` 来代替浏览器，可以避免缓存等带来的问题。

### 重定向规则

在本文的示例中我们使用 `/folder` 和 `/other/directory` 等路径来重定向到不同的服务，此外我们也可以通过主机名来区分请求，比如将 [api.myurl.com](http://api.myurl.com) 和 [site.myurl.com](http://site.myurl.com) 重定向到不同的内部 ClusterIP 服务去。

```yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: simple-fanout-example
spec:
  rules:
    - host: api.myurl.com
      http:
        paths:
          - path: /foo
            backend:
              serviceName: service1
              servicePort: 4200
          - path: /bar
            backend:
              serviceName: service2
              servicePort: 8080
    - host: website.myurl.com
      http:
        paths:
          - path: /
            backend:
              serviceName: service3
              servicePort: 3333
```

### SSL/HTTPS

可能我们想让网站使用安全的 HTTPS 服务，Kubernetes Ingress 也提供了简单的 TLS 校验，这意味着它会处理所有的 SSL 通信、解密/校验 SSL 请求，然后将这些解密后的请求发送到内部服务去。

如果你的多个内部服务使用相同（可能是通配符）的 SSL 证书，这样我们就只需要在 Ingress 上配置一次，而不需要在内部服务上去配置，Ingress 可以使用配置的 TLS Kubernetes Secret 来配置 SSL 证书。

```yaml
apiVersion: networking.k8s.io/v1beta1
kind: Ingress
metadata:
  name: tls-example-ingress
spec:
  tls:
    - hosts:
        - sslexample.foo.com
      secretName: testsecret-tls
  rules:
    - host: sslexample.foo.com
      http:
        paths:
          - path: /
            backend:
              serviceName: service1
              servicePort: 80
```

不过需要注意的是如果你在不同的命名空间有多个 Ingress 资源，那么你的 TLS secret 也需要在你使用的 Ingress 资源的所有命名空间中可用。

## 总结

这里我们简单介绍了 Kubernetes Ingress 的原理，简单来说：它不过是一种轻松配置 Nginx 服务器的方法，它可以将请求重定向到其他内部服务去。这为我们节省了宝贵的静态 IP 和 LoadBalancers 资源。

另外需要注意的是还有其他的 Kubernetes Ingress 类型，它们内部没有设置 Nginx 服务，但可能使用其他代理技术，一样也可以实现上面的所有功能。

> 原文链接： [https://codeburst.io/kubernetes-ingress-simply-visually-explained-d9cad44e4419](https://codeburst.io/kubernetes-ingress-simply-visually-explained-d9cad44e4419)

<!--adsense-self-->
