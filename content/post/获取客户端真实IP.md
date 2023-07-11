---
title: 获取客户端访问真实 IP
date: 2020-03-03
tags: ["kubernetes", "docker"]
keywords: ["kubernetes", "docker", "镜像"]
slug: get-client-realip
gitcomment: true
category: "kubernetes"
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200303153403.png",
      desc: "https://unsplash.com/photos/EfIcvL2R5Ac",
    },
  ]
---

通常，当集群内的客户端连接到服务的时候，是支持服务的 Pod 可以获取到客户端的 IP 地址的，但是，当通过节点端口接收到连接时，由于对数据包执行了源网络地址转换（SNAT），因此数据包的源 IP 地址会发生变化，后端的 Pod 无法看到实际的客户端 IP，对于某些应用来说是个问题，比如，nginx 的请求日志就无法获取准确的客户端访问 IP 了。

<!--more-->

比如下面我们的应用：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.7.9
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
  selector:
    app: nginx
  type: NodePort
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```

直接创建后可以查看 nginx 服务被自动分配了一个 32761 的 NodePort 端口：

```shell
$ kubectl get svc
NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
kubernetes   ClusterIP   10.96.0.1        <none>        443/TCP        28d
nginx        NodePort    10.106.190.194   <none>        80:32761/TCP   48m
$ kubectl get pods -o wide
NAME                              READY   STATUS    RESTARTS   AGE     IP             NODE         NOMINATED NODE   READINESS GATES
nginx-54f57cf6bf-nwtjp            1/1     Running   0          3m      10.244.3.15    ydzs-node3   <none>           <none>
nginx-54f57cf6bf-ptvgs            1/1     Running   0          2m59s   10.244.2.13    ydzs-node2   <none>           <none>
nginx-54f57cf6bf-xhs8g            1/1     Running   0          2m59s   10.244.1.16    ydzs-node1   <none>           <none>
```

我们可以看到这 3 个 Pod 被分配到了 3 个不同的节点，这个时候我们通过 master 节点的 NodePort 端口来访问下我们的服务，因为我这里只有 master 节点可以访问外网，这个时候我们查看 nginx 的 Pod 日志可以看到其中获取到的 clientIP 是 10.151.30.11，其实是 master 节点的内网 IP，并不是我们期望的真正的浏览器端访问的 IP 地址：

```shell
$ kubectl logs -f nginx-54f57cf6bf-xhs8g
10.151.30.11 - - [07/Dec/2019:16:44:38 +0800] "GET / HTTP/1.1" 200 612 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36" "-"
```

这个是因为我们 master 节点上并没有对应的 Pod，所以通过 master 节点去访问应用的时候必然需要额外的网络跳转才能到达其他节点上 Pod，在跳转过程中由于对数据包进行了 SNAT，所以看到的是 master 节点的 IP。这个时候我们可以在 Service 设置 externalTrafficPolicy 来减少网络跳数：

```yaml
spec:
  externalTrafficPolicy: Local
```

如果 Service 中配置了 `externalTrafficPolicy=Local`，并且通过服务的节点端口来打开外部连接，则 Service 会代理到本地运行的 Pod，如果本地没有本地 Pod 存在，则连接将挂起，比如我们这里设置上该字段更新，这个时候我们去通过 master 节点的 NodePort 访问应用是访问不到的，因为 master 节点上并没有对应的 Pod 运行，所以需要确保负载均衡器将连接转发给至少具有一个 Pod 的节点。

<!--adsense-text-->

但是需要注意的是使用这个参数有一个缺点，通常情况下，请求都是均匀分布在所有 Pod 上的，但是使用了这个配置的话，情况就有可能不一样了。比如我们有两个节点上运行了 3 个 Pod，假如节点 A 运行一个 Pod，节点 B 运行两个 Pod，如果负载均衡器在两个节点间均衡分布连接，则节点 A 上的 Pod 将接收到所有请求的 50%，但节点 B 上的两个 Pod 每个就只接收 25% 。

由于增加了 `externalTrafficPolicy: Local` 这个配置后，接收请求的节点和目标 Pod 都在一个节点上，所以没有额外的网络跳转（不执行 SNAT），所以就可以拿到正确的客户端 IP，如下所示我们把 Pod 都固定到 master 节点上：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name:  nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      tolerations:
      - operator: "Exists"
      nodeSelector:
        kubernetes.io/hostname: ydzs-master
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
spec:
 externalTrafficPolicy: Local
  selector:
    app: nginx
  type: NodePort
  ports:
  - protocol: TCP
    port: 80
    targetPort: 80
```

更新服务后，然后再通过 NodePort 访问服务可以看到拿到的就是正确的客户端 IP 地址了：

```shell
$ kubectl logs -f nginx-ddc8f997b-ptb7b
182.149.166.11 - - [07/Dec/2019:17:03:43 +0800] "GET / HTTP/1.1" 200 612 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36" "-"
```

<!--adsense-self-->
