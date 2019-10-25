---
title: Traefik 2.0 实现灰度发布
date: 2019-10-25
tags: ["traefik", "kubernetes", "ingress", "灰度"]
keywords: ["traefik", "kubernetes", "traefik 2.0", "Ingress", "TCP", "灰度", "金丝雀"]
slug: canary-with-traefik2
gitcomment: true
notoc: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/toa-heftiba-6Y6gaGnVrr4-unsplash.jpg", desc: "https://unsplash.com/photos/6Y6gaGnVrr4"}]
category: "kubernetes"
---

前面的文章中我们已经使用 Traefik2.0 实现了 [暴露 Redis(TCP) 服务](/post/expose-redis-by-traefik2) 以及 [自动化 HTTPS](/post/automatic-https-with-traefik2) 得功能，在 [Traefik2.0 发布的特性](/post/traefik2-ga/) 中我们了解到除了这些基础功能之外，还支持一些其他的特性，本文就将来实现灰度发布的高级功能。

<!--more-->

> Traefik 的官方文档实在是有点混乱，特别是在 Kubernetes 下面的使用更不详细，我在业余时间已经在尝试对官方文档进行翻译，地址：[https://www.qikqiak.com/traefik-book](https://www.qikqiak.com/traefik-book/)，去掉了一些多余的文档，增加一些在 Kubernetes 下面的使用案例。

需要注意的是，目前的最新版本是 v2.0.2，截止该版本，要实现上面的灰度发布、流量复制这些高级功能，只能通过 `File Provider` 来实现，所以我们不能直接使用前面的 `KubernetesCRD Provider` 了。

灰度发布我们有时候也会称为金丝雀发布（Canary），主要就是让一部分测试的服务也参与到线上去，经过测试观察看是否符号上线要求。

![canary deployment](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/RvcM4f.jpg)

比如现在我们有两个名为 appv1 和 appv2 的 Nginx 服务，我们希望通过 Traefik 来控制我们的流量，将 3/4 的流量路由到 appv1，1/4 的流量路由到 appv2 去，这个时候就可以利用 Traefik2.0 中提供的带权重的轮询（WRR）来实现该功能，首先在 Kubernetes 集群中部署上面的两个服务。

appv1 服务的资源清单如下所示：（appv1.yaml）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: appv1
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: appv1
  template:
    metadata:
      labels:
        use: test
        app: appv1
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
          name: portv1

---

apiVersion: v1
kind: Service
metadata:
  name: appv1
  namespace: kube-system
spec:
  selector:
    app: appv1
  ports:
  - name: http
    port: 80
    targetPort: portv1
```

appv2 服务的资源清单如下所示：（appv2.yaml）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: appv2
  namespace: kube-system
spec:
  selector:
    matchLabels:
      app: appv2
  template:
    metadata:
      labels:
        use: test
        app: appv2
    spec:
      containers:
      - name: nginx
        image: nginx
        ports:
        - containerPort: 80
          name: portv2

---

apiVersion: v1
kind: Service
metadata:
  name: appv2
  namespace: kube-system
spec:
  selector:
    app: appv2
  ports:
  - name: http
    port: 80
    targetPort: portv2
```

直接创建上面两个服务：

```shell
$ kubectl apply -f appv1.yaml
$ kubectl apply -f appv2.yaml
# 通过下面的命令可以查看服务是否运行成功
$ kubectl get pods -l use=test -n kube-system
NAME                     READY   STATUS    RESTARTS   AGE
appv1-684f8cbc7-b9zm9    1/1     Running   0          2m27s
appv2-645d7666b5-qjrjs   1/1     Running   0          37s
```

<!--adsense-text-->

由于 WRR 这个功能目前只支持 `File Provider`，所以我们需要开启该 Provider 才能使用，这里需要注意的是由于需要开启 `File Provider`，所以我们需要提供一个文件用于该 Provider 的配置，我们这里是用在 Kubernetes 集群中的，所以可以通过一个 ConfigMap 对象，将配置文件内容挂载到 Traefik 的 Pod 中去，如下所示，我们通过将一个名为 traefik-dynamic-conf 的 ConfigMap 对象挂载到了 `/config` 目录下面去，然后通过 `--providers.file.filename`参数指定配置文件开启 `File Provider`，另外添加 `- --providers.file.watch=true` 参数可以让 Traefik 动态更新配置：

```yaml
......
      volumes:
      - name: config
        configMap:
          name: traefik-dynamic-conf
      containers:
      - image: traefik:v2.0.2
        name: traefik-ingress-lb
        volumeMounts:
        - name: config
          mountPath: /config
        ports:
        - name: web
          containerPort: 80
          hostPort: 80
        - name: admin
          containerPort: 8080
          hostPort: 8080
        args:
        - --entrypoints.web.Address=:80
        - --api.insecure=true
        - --providers.file.watch=true
        - --providers.file.filename=/config/traefik-dynamic.toml
        - --api
        - --api.debug=true
        - --api.dashboard=true
        - --accesslog
```

> 完整的 YAML 文件可以前往 [https://github.com/cnych/kubeapp/tree/master/traefik2/canary](https://github.com/cnych/kubeapp/tree/master/traefik2/canary) 获取。


上面是开启 `File Provider` 的配置，接下来需要创建对应的 ConfigMap 对象，首先创建一个名为 `traefik-dynamic.toml` 的文件，内容如下所示：

```toml
[http]
  [http.routers]
    [http.routers.Router0]
      entryPoints = ["web"]
      service = "app"
      rule = "Host(`nginx.qikqiak.com`)"

  [http.services]
    [http.services.app]

      [[http.services.app.weighted.services]]
        name = "appv1"
        weight = 3

      [[http.services.app.weighted.services]]
        name = "appv2"
        weight = 1

    [http.services.appv1]
      [http.services.appv1.loadBalancer]
        [[http.services.appv1.loadBalancer.servers]]
          url = "http://appv1/"

    [http.services.appv2]
      [http.services.appv2.loadBalancer]
        [[http.services.appv2.loadBalancer.servers]]
          url = "http://appv2/"
```

上面这个配置文件就是我们需要配置的灰度发布的规则，创建一个名为 `Router0` 的路由，在 `web` 这个入口点上面监听 `Host=nginx.qikqiak.com` 这样的请求，将请求路由给名为 `app` 的服务，而该服务则将请求路由给了 `appv1` 这个服务，权重为 3，另外一部分请求路由给了 `appv2` 这个服务，权重为 1，也就是有 3/4 的请求会被路由到 `http://appv1/` 这个真实的服务上，这个地址也就是我们 Kubernetes 集群中的 appv1 这个 Service 对象的 FQDN 地址，当然我们也可以用全路径（`http://appv1.kube-system.svc.cluster.local:80`）表示，因为都在 `kube-system` 这个命名空间下面，所以直接用服务名也是可以的，同样的另外的 1/4 请求会被路由到 `http://appv2/` 这个真实的服务上。

现在通过上面的配置文件来创建对应的 ConfigMap 对象：

```shell
$ kubectl create configmap traefik-dynamic-conf --from-file=traefik-dynamic.toml -n kube-system
```

创建完成后，再更新 Traefik2.0，就可以将配置文件通过 ConfigMap 挂载到 Traefik Pod 的 `/config/traefik-dynamic.toml` 路径下面去了。

然后将域名 `nginx.qikqiak.com` 解析到 Traefik 所在的 Pod，这个时候我们打开两个终端，分别去观察 appv1 和 appv2 两个应用的日志。

在浏览器中连续访问 `nginx.qikqiak.com` 4 次，我们可以观察到 appv1 这应用会收到 3 次请求，而 appv2 这个应用只收到 1 次请求，符合上面我们的 `3:1` 的权重配置。

![traefik2 wrr demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik2-wrr-demo.png)


> 不知道是否是 Traefik 的 BUG，同时将 KubernetesCRD Provider 和 File Provider 开启的时候，识别不了 File Provider 中的配置，该问题还有待验证。


<!--adsense-self-->
