---
title: Gloo 1.0 正式版发布
subtitle: 基于 Envoy 的 API 网关
date: 2019-11-15
tags: ["Envoy", "Gloo", "kubernetes"]
keywords: ["Envoy", "Gloo", "kubernetes", "ingress"]
slug: gloo-1.0-release
gitcomment: true
notoc: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/gloo-release.png", desc: "Gloo V1.0 Release"}]
category: "kubernetes"
---
[Gloo](http://www.solo.io/gloo) 是一个基于 `Envovy` 代理构建的下一代 API 网关和 Kubernetes Ingress 控制器，具有 Kubernetes 原生架构，也可以支持非 Kubernetes 环境。Gloo 是一个控制平面，可以轻松管理 Envovy 的配置，保护传入的流量并将其路由到应用程序。

<!--more-->

## 介绍

Gloo 的核心原则是`连接、安全、和控制所有应用流量`。下面我们来重点介绍下 1.0 版本的一些最新功能：

* TCP 代理：Gloo 现在除了 HTTP 之外还支持 TCP 代理，可以安全访问数据库、缓存和消息队列等服务，可以和云服务商的负载均衡器集成。

* Web 应用防火墙：Gloo 具有内置 WAF 功能的 API 网关，可以在进入你的环境之前对其进行检查并过滤掉可能有害的流量，为此，Gloo 管理了一个定制的 Envoy 过滤器 来调用 ModSecurity。

* 认证和授权：Gloo 在授予对应用服务的访问权限之前，可以配置并强制执行请求的身份验证和授权。可以通过 Envovy 的过滤器在 Gloo 中自己手动不是，更高级的功能在企业版中提供，比如 JWT，LDAP，OAuth，OIDC 等。

* 委托：Gloo 支持几种模型，用于安全地分配路由配置的所有权。管理员可以拥有一组路由，并将特定子路径的管理委派给其他用户，这样，团队可以快速部署和重新配置服务，而不会影响其他团队。

* 数据丢失保护：Gloo 通过对请求和响应的自定义和强大的转换功能来扩展 Envoy。Gloo 利用这些功能开始支持 Data Loss Prevention，以保护敏感数据离开网关。

* WebAssembly：WebAssembly 提到会降低 Web 开发的门槛，对于 Gloo 意味着可以更轻松地用任何变成语言构建自定义的 Envoy 和 Gloo 扩展，WebAssembly 仍然是一种新兴的技术，但是 Gloo 已经开始将其作为实验性功能来支持它了。

* 限速：Gloo 允许你配置到应用程序的传入流量数量来维持服务性能，并防止故障或恶意攻击。

* 管理控制台：Gloo Web 控制台简化了可观察性和操作，并在出现问题时可以快速查看运行状态、性能和报警信息等。

![gloo structrue](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/gloo-structrue.png)

## 安装
我们这里以 Ingress Controller 的形式来安装 Gloo。所以提前准备好 Kubernetes 集群，我们这里演示的环境为 v1.16.2 版本。

首先我们需要先安装 `glooctl` 命令行工具，该工具提供了安装、配置和调试 Gloo 的一些功能，直接执行下面的命令安装即可：
```shell
$ curl -sL https://run.solo.io/gloo/install | sh
$ export PATH=$HOME/.gloo/bin:$PATH
```

当然我们也可以直接到 GitHub release 页面下载 glooctl，然后一样把下载的文件路径配置到系统的 `PATH` 路径下面即可。

完成后我们可以通过如下命令来验证 CLI 工具是否安装成功：
```shell
$ glooctl version
Client: {"version":"1.0.0"}
Server: version undefined, could not find any version of gloo running
```

该命令会返回客户端的版本，由于还没有安装 Gloo，所以不会显示服务端信息。

然后可以直接运行下面的命令来部署 Gloo Ingress Controller，默认会安装到 `gloo-system` 命名空间下面：
```shell
$ glooctl install ingress
```

由于我们这里只有 master 节点可以上外网，所以需要对 Ingress Controller 做一些限制，可以加上 `--dry-run` 参数来获取安装的资源清单：
```shell
$ glooctl install ingress --dry-run > gloo.yaml
$ vi gloo.yaml
......
# apiVersion: v1
# kind: Service
# metadata:
#   labels:
#     app: gloo
#     gloo: ingress-proxy
#     installationId: 4hxyhvE5MjAF2tm34Bmz
#   name: ingress-proxy
#   namespace: gloo-system
# spec:
#   ports:
#   - port: 80
#     protocol: TCP
#     name: http
#   - port: 443
#     protocol: TCP
#     name: https
#   selector:
#     gloo: ingress-proxy
#   type: LoadBalancer
......
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    app: gloo
    gloo: ingress-proxy
    installationId: 4hxyhvE5MjAF2tm34Bmz
  name: ingress-proxy
  namespace: gloo-system
spec:
  replicas: 1
  selector:
    matchLabels:
      gloo: ingress-proxy
  template:
    metadata:
      labels:
        gloo: ingress-proxy
    spec:
      tolerations:
      - operator: "Exists"
      nodeSelector:
        kubernetes.io/hostname: ydzs-master 
      containers:
      ......
        ports:
        - containerPort: 80
          name: http
          hostPort: 80
          protocol: TCP
        - containerPort: 443
          name: https
          hostPort: 443
          protocol: TCP
      ......
......

```

将 ingress-proxy 固定在 master 节点上，加上上面的容忍和 nodeSelector，由于默认的 ingress-proxy 的服务代理方式是 LoadBalancer，由于我这里不是云环境，所以将该 Service 注释掉，然后给 ingress-proxy 的服务设置成 hostPort 模式，然后直接安装即可：
```shell
$ kubectl apply -f gloo.yaml
customresourcedefinition.apiextensions.k8s.io/settings.gloo.solo.io created
customresourcedefinition.apiextensions.k8s.io/gateways.gateway.solo.io created
customresourcedefinition.apiextensions.k8s.io/virtualservices.gateway.solo.io created
customresourcedefinition.apiextensions.k8s.io/routetables.gateway.solo.io created
customresourcedefinition.apiextensions.k8s.io/proxies.gloo.solo.io created
customresourcedefinition.apiextensions.k8s.io/upstreams.gloo.solo.io created
customresourcedefinition.apiextensions.k8s.io/upstreamgroups.gloo.solo.io created
customresourcedefinition.apiextensions.k8s.io/authconfigs.enterprise.gloo.solo.io created
namespace/gloo-system created
serviceaccount/gloo created
serviceaccount/discovery created
clusterrole.rbac.authorization.k8s.io/gloo-role-ingress created
clusterrolebinding.rbac.authorization.k8s.io/gloo-role-binding-ingress-gloo-system created
configmap/ingress-envoy-config created
configmap/gloo-usage created
service/ingress-proxy created
service/gloo created
deployment.apps/gloo created
deployment.apps/ingress created
deployment.apps/ingress-proxy created
deployment.apps/discovery created
unable to recognize "gloo.yaml": no matches for kind "Gateway" in version "gateway.solo.io/v1"
unable to recognize "gloo.yaml": no matches for kind "Gateway" in version "gateway.solo.io/v1"
unable to recognize "gloo.yaml": no matches for kind "Settings" in version "gloo.solo.io/v1"
```

该资源清单文件中声明了大量的资源，如果出现上面的错误信息，再重新执行一次上面的 apply 命令即可，这是因为 CRD 声明的先后顺序问题造成的。

<!--adsense-text-->

除了上面这种安装方式之外，还可以用 Helm 来快速安装：
```shell
$ helm repo add gloo https://storage.googleapis.com/solo-public-helm
$ helm fetch --untar=true --untardir=. gloo/gloo
$ helm install gloo --namespace gloo-system -f gloo/values-ingress.yaml
```

最后安装完成后，我们可以通过查看 gloo-system 命名空间下面的资源对象来验证是否安装成功：
```shell
$ kubectl get all -n gloo-system
NAME                                 READY   STATUS    RESTARTS   AGE
pod/discovery-7f7dc9cb78-ftcd4       1/1     Running   0          9m31s
pod/gloo-654dbd7f58-x5njx            1/1     Running   0          9m32s
pod/ingress-86dcd7b99-x7trl          1/1     Running   0          9m31s
pod/ingress-proxy-58cb9fd886-pz4nq   1/1     Running   0          21s

NAME           TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                      AGE
service/gloo   ClusterIP   10.103.174.129   <none>        9977/TCP,9988/TCP,9966/TCP   9m32s

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/discovery       1/1     1            1           9m32s
deployment.apps/gloo            1/1     1            1           9m33s
deployment.apps/ingress         1/1     1            1           9m32s
deployment.apps/ingress-proxy   1/1     1            1           9m32s

NAME                                       DESIRED   CURRENT   READY   AGE
replicaset.apps/discovery-7f7dc9cb78       1         1         1       9m32s
replicaset.apps/gloo-654dbd7f58            1         1         1       9m33s
replicaset.apps/ingress-86dcd7b99          1         1         1       9m32s
replicaset.apps/ingress-proxy-57c579c885   0         0         0       9m32s
replicaset.apps/ingress-proxy-58cb9fd886   1         1         1       22s
```

## 示例
比如我们创建一个如下的 Nginx 服务：（nginx-demo）
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: 
  name: nginx-demo
spec:
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
        image: nginx
        ports:
        - containerPort: 80

---

apiVersion: v1
kind: Service
metadata:
  name: nginx-demo
spec:
  ports:
  - name: http
    port: 80
  selector:
    app: nginx
```

直接创建：
```shell
$ kubectl apply -f nginx.yaml
deployment.apps/nginx-demo created
service/nginx-demo created
```

然后创建一个如下的 Ingress 对象：（nginx-demo-ingrss.yaml）
```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
 name: nginx-demo
 annotations:
    # 设置成 gloo
    kubernetes.io/ingress.class: gloo
spec:
  rules:
  - host: gloo.example.com
    http:
      paths:
      - path: /
        backend:
          serviceName: nginx-demo
          servicePort: 80
```

直接创建：
```shell
$ kubectl apply -f nginx-demo-ingrss.yaml
ingress.extensions/nginx-demo created
$ kubectl get ingress nginx-demo
NAME         HOSTS              ADDRESS   PORTS   AGE
nginx-demo   gloo.example.com             80      65s
```

然后我们在本地的 `/etcd/hosts` 里面加上域名 `gloo.example.com` 的映射，然后直接在浏览器中访问：

![gloo ingress](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/gloo-ingress-demo.png)

关于 Gloo 的更多使用可以查看文档 [https://docs.solo.io/gloo](https://docs.solo.io/gloo/latest/)。

<!--adsense-self-->
