---
title: 本地集群使用 OpenELB 实现 Load Balancer 负载均衡
date: 2022-04-10
tags: ["kubernetes", "openelb"]
keywords: ["kubernetes", "metalb", "openelb", "LoadBalancer", "负载均衡"]
sluearg: service-use-openelb
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20220410201040.png",
      desc: "OpenELB & CNCF",
    },
  ]
category: "kubernetes"
---

为了方便测试，准备为 Ingress 控制器配置一个 LoadBalaner 类型的 Service，由于我这是本地私有环境，所以需要部署一个支持该服务类型的负载均衡器，在社区中目前最流行的应该是 [MetalLB](https://metallb.universe.tf/) 这个项目，现在也属于 CNCF 沙箱项目，该项目在 2017 年底发起，经过 4 年的发展已经在社区被广泛采用，但是我这边在测试使用过程中一直表现不稳定，经常需要重启控制器才能生效。所以将目光转向了最近国内青云开源的另外一个负载均衡器 OpenELB。

<!--more-->

OpenELB 之前叫 PorterLB，是为物理机（Bare-metal）、边缘（Edge）和私有化环境设计的负载均衡器插件，可作为 Kubernetes、K3s、KubeSphere 的 LB 插件对集群外暴露 LoadBalancer 类型的服务，现阶段是 CNCF 沙箱项目，核心功能包括：

- 基于 BGP 与 Layer 2 模式的负载均衡
- 基于路由器 ECMP 的负载均衡
- IP 地址池管理
- 使用 CRD 进行 BGP 配置

![openelb](https://picdn.youdianzhishi.com/images/20220410164822.png)

## 与 MetaLB 对比

OpenELB 作为后起之秀，采用了更加 Kubernetes-native 的实现方式，可以直接通过 CRD 进行配置管理，下面是关于 OpenELB 与 MetaLB 的简单对比。

**云原生架构**

在 OpenELB 中，不管是地址管理，还是 BGP 配置管理，你都可以使用 CRD 来配置。对于习惯了 Kubectl 的用户而言， OpenELB 十分友好，在 MetalLB 中，需通过 ConfigMap 来配置，感知它们的状态需要通过查看监控或者日志。

**灵活的地址管理**

OpenELB 通过 EIP 这个自定义资源对象来管理地址，它定义子资源 Status 来存储地址分配状态，这样就不会存在分配地址时各副本发生冲突的情况。

**使用 gobgp 发布路由**

不同于 MetalLB 自己实现 BGP 协议， OpenELB 采用标准的 gobgp 来发布路由，这样做的好处如下：

- 开发成本低，且有 gobgp 社区支持
- 可以利用 gobgp 丰富特性
- 通过 BgpConf/BgpPeer CRD 动态配置 gobgp，用户无需重启 OpenELB 即可动态加载最新的配置信息
- gobgp 作为 lib 使用时， 社区提供了基于 protobuf 的 API，OpenELB 在实现 BgpConf/BgpPeer CRD 时也是参照该 API，并保持兼容
- OpenELB 也提供 status 用于查看 BGP neighbor 配置，状态信息丰富

**架构简单，资源占用少**

OpenELB 目前只用部署 Deployment 即可，通过多副本实现高可用，部分副本崩溃后并不会影响已建立的正常连接。

BGP 模式下， Deployment 不同副本都会与路由器建立连接用于发布等价路由，所以正常情况下我们部署两个副本即可。在 Layer 2 模式下，不同副本之间通过 Kubernetes 提供的 Leader Election 机制选举 Leader，进而应答 ARP/NDP。

## 安装

在 Kubernetes 集群中，您只需要安装一次 OpenELB。安装完成后，集群中会安装一个 openelb-manager Deployment，其中包含一个 openelb-manager Pod。 openelb-manager Pod 为整个 Kubernetes 集群实现了 OpenELB 的功能。
安装完成后，可以扩展 openelb-manager Deployment，将多个 OpenELB 副本（openelb-manager Pods）分配给多个集群节点，保证高可用。有关详细信息，请参阅配置多个 OpenELB 副本。

<!--adsense-text-->

要安装使用 OpenELB 非常简单，直接使用下面的命令即可一键安装：

```shell
# 注意如果不能获取k8s.gcr.io镜像，需要替换其中的镜像
☸ ➜ kubectl apply -f https://raw.githubusercontent.com/openelb/openelb/master/deploy/openelb.yaml
```

上面的资源清单会部署一个名为 `openelb-manager` 的 Deployment 资源对象，openelb-manager 的 Pod 为整个 Kubernetes 集群实现了 OpenELB 的功能，为保证高可用，可以将该控制器扩展为两个副本。第一次安装的时候还会为 admission webhook 配置 https 证书，安装完成后查看 Pod 的状态是否正常：

```shell
☸ ➜ kubectl get pods -n openelb-system
NAME                                READY   STATUS      RESTARTS      AGE
openelb-admission-create--1-cf857   0/1     Completed   0             58m
openelb-admission-patch--1-dhgrq    0/1     Completed   2             58m
openelb-manager-848495684-nppkr     1/1     Running     1 (35m ago)   48m
openelb-manager-848495684-svn7z     1/1     Running     1 (35m ago)   48m
☸ ➜ kubectl get validatingwebhookconfiguration
NAME                                      WEBHOOKS   AGE
openelb-admission                         1          62m
☸ ➜ kubectl get mutatingwebhookconfigurations
NAME                                    WEBHOOKS   AGE
openelb-admission                       1          62m
```

此外还会安装几个相关的 CRD 用户 OpenELB 配置：

```shell
☸ ➜ kubectl get crd |grep kubesphere
bgpconfs.network.kubesphere.io           2022-04-10T08:01:18Z
bgppeers.network.kubesphere.io           2022-04-10T08:01:18Z
eips.network.kubesphere.io               2022-04-10T08:01:18Z
```

## 配置

接下来我们来演示下如何使用 layer2 模式的 OpenELB，首先需要保证所有 Kubernetes 集群节点必须在同一个二层网络（在同一个路由器下），我测试的环境一共 3 个节点，节点信息如下所示：

```shell
☸ ➜ kubectl get nodes -o wide
NAME      STATUS   ROLES                  AGE   VERSION   INTERNAL-IP     EXTERNAL-IP   OS-IMAGE                KERNEL-VERSION                CONTAINER-RUNTIME
master1   Ready    control-plane,master   15d   v1.22.8   192.168.0.111   <none>        CentOS Linux 7 (Core)   3.10.0-1160.25.1.el7.x86_64   containerd://1.5.5
node1     Ready    <none>                 15d   v1.22.8   192.168.0.110   <none>        CentOS Linux 7 (Core)   3.10.0-1160.25.1.el7.x86_64   containerd://1.5.5
node2     Ready    <none>                 15d   v1.22.8   192.168.0.109   <none>        CentOS Linux 7 (Core)   3.10.0-1160.25.1.el7.x86_64   containerd://1.5.5
```

3 个节点 IP 地址分别为 192.168.0.109、192.168.0.110、192.168.0.111。

首先需要为 kube-proxy 启用 `strictARP`，以便 Kubernetes 集群中的所有网卡停止响应其他网卡的 ARP 请求，而由 OpenELB 处理 ARP 请求。

```shell
☸ ➜ kubectl edit configmap kube-proxy -n kube-system
......
ipvs:
  strictARP: true
......
```

然后执行下面的命令重启 kube-proxy 组件即可：

```shell
☸ ➜ kubectl rollout restart daemonset kube-proxy -n kube-system
```

如果安装 OpenELB 的节点有多个网卡，则需要指定 OpenELB 在二层模式下使用的网卡，如果节点只有一个网卡，则可以跳过此步骤，假设安装了 OpenELB 的 master1 节点有两个网卡（eth0 192.168.0.2 和 ens33 192.168.0.111），并且 eth0 192.168.0.2 将用于 OpenELB，那么需要为 master1 节点添加一个 annotation 来指定网卡：

```shell
☸ ➜ kubectl annotate nodes master1 layer2.openelb.kubesphere.io/v1alpha1="192.168.0.2"
```

接下来就可以创建一个 Eip 对象来充当 OpenELB 的 IP 地址池了，创建一个如下所示的资源对象：

```yaml
apiVersion: network.kubesphere.io/v1alpha2
kind: Eip
metadata:
  name: eip-pool
spec:
  address: 192.168.0.100-192.168.0.108
  protocol: layer2
  disable: false
  interface: ens33
```

这里我们通过 `address` 属性指定了 IP 地址池，可以填写一个或多个 IP 地址（要注意不同 Eip 对象中的 IP 段不能重叠），将被 OpenELB 使用。值格式可以是：

- IP 地址，例如 192.168.0.100
- IP 地址/子网掩码，例如 192.168.0.0/24
- IP 地址 1-IP 地址 2，例如 192.168.0.91-192.168.0.100

`protocol` 属性用来指定 Eip 对象用于哪种 OpenELB 模式，可以配置为 layer2 或 bgp，默认为 bgp 模式，我们这里想使用 layer2 模式，所以需要显示指定
`interface` 是用来指定 OpenELB 监听 ARP 或 NDP 请求的网卡，该字段仅在协议设置为 layer2 时有效，我这里的环境是 ens33 网卡
`disable` 表示是否禁用 Eip 对象

创建完成 Eip 对象后可以通过 Status 来查看该 IP 池的具体状态：

```shell
☸ ➜ kubectl get eip
NAME       CIDR                          USAGE   TOTAL
eip-pool   192.168.0.100-192.168.0.108   0       9
☸ ➜ kubectl get eip eip-pool -oyaml
apiVersion: network.kubesphere.io/v1alpha2
kind: Eip
metadata:
  finalizers:
  - finalizer.ipam.kubesphere.io/v1alpha1
  name: eip-pool
spec:
  address: 192.168.0.100-192.168.0.108
  interface: ens33
  protocol: layer2
status:
  firstIP: 192.168.0.100
  lastIP: 192.168.0.108
  poolSize: 9
  ready: true
  v4: true
```

到这里 LB 的地址池就准备好了，接下来我们创建一个简单的服务，通过 LB 来进行暴露，如下所示：

```yaml
# openelb-nginx.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
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
```

这里部署一个简单的 nginx 服务：

```shell
☸ ➜ kubectl apply -f openelb-nginx.yaml
☸ ➜ kubectl get pods
NAME                     READY   STATUS    RESTARTS      AGE
nginx-7848d4b86f-zmm8l   1/1     Running   0             42s
```

然后创建一个 `LoadBalancer` 类型的 Service 来暴露我们的 nginx 服务，如下所示：

```yaml
# openelb-nginx-svc.yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx
  annotations:
    lb.kubesphere.io/v1alpha1: openelb
    protocol.openelb.kubesphere.io/v1alpha1: layer2
    eip.openelb.kubesphere.io/v1alpha2: eip-pool
spec:
  selector:
    app: nginx
  type: LoadBalancer
  ports:
    - name: http
      port: 80
      targetPort: 80
```

注意这里我们为 Service 添加了几个 annotations 注解：

- `lb.kubesphere.io/v1alpha1: openelb` 用来指定该 Service 使用 OpenELB
- `protocol.openelb.kubesphere.io/v1alpha1: layer2` 表示指定 OpenELB 用于 Layer2 模式
- `eip.openelb.kubesphere.io/v1alpha2: eip-pool` 用来指定了 OpenELB 使用的 Eip 对象，如果未配置此注解，OpenELB 会自动使用与协议匹配的第一个可用 Eip 对象，此外也可以删除此注解并添加 `spec:loadBalancerIP` 字段（例如 spec:loadBalancerIP: 192.168.0.108）以将特定 IP 地址分配给 Service。

同样直接创建上面的 Service：

```shell
☸ ➜ kubectl apply -f openelb-nginx-svc.yaml
service/nginx created
☸ ➜ kubectl get svc nginx
NAME    TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)        AGE
nginx   LoadBalancer   10.100.126.91   192.168.0.101   80:31555/TCP   4s
```

创建完成后可以看到 Service 服务被分配了一个 `EXTERNAL-IP`，然后我们就可以通过该地址来访问上面的 nginx 服务了：

```shell
☸ ➜ curl 192.168.0.101
<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
```

此外 OpenElb 还支持 BGP 模式以及集群多路由的场景，更新使用方法可以查看官方文档 [https://openelb.github.io/docs/](https://openelb.github.io/docs/) 了解更多相关信息。

## 参考文档

- <https://openelb.github.io/docs/>
- <https://kubesphere.io/zh/blogs/openelb-joins-cncf-sandbox-project/>
- <https://mp.weixin.qq.com/s/uFwYaPE7cVolLWxYHcgZdQ>

<!--adsense-self-->
