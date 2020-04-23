---
title: 在 Kubernetes 集群中使用 NodeLocal DNSCache
date: 2020-04-23
tags: ["kubernetes", "coredns"]
keywords: ["kubernetes", "coredns", "NodeLocal", "DNSCache"]
slug: use-nodelocal-dns-cache
gitcomment: true
notoc: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200423130200.png", desc: "Cairns City QLD, Australia"}]
category: "kubernetes"
---
之前在解决 CoreDNS 的5秒超时问题的时候，除了通过 `dnsConfig` 去强制使用 tcp 方式解析之外，我们提到过使用 `NodeLocal DNSCache` 来解决这个问题。`NodeLocal DNSCache` 通过在集群节点上运行一个 DaemonSet 来提高 clusterDNS 性能和可靠性。处于 `ClusterFirst` 的 DNS 模式下的 Pod 可以连接到 `kube-dns` 的 serviceIP 进行 DNS 查询。通过 `kube-proxy` 组件添加的 `iptables` 规则将其转换为 `CoreDNS` 端点。通过在每个集群节点上运行 DNS 缓存，NodeLocal DNSCache 可以缩短 DNS 查找的延迟时间、使 DNS 查找时间更加一致，以及减少发送到 kube-dns 的 DNS 查询次数。

<!--more-->

在集群中运行 NodeLocal DNSCache 有如下几个好处：

* 如果本地没有 CoreDNS 实例，则具有最高 DNS QPS 的 Pod 可能必须到另一个节点进行解析，使用 NodeLocal DNSCache 后，拥有本地缓存将有助于改善延迟
* 跳过 iptables DNAT 和连接跟踪将有助于减少 `conntrack` 竞争并避免 UDP DNS 条目填满 `conntrack` 表（常见的5s超时问题就是这个原因造成的）
* 从本地缓存代理到 kube-dns 服务的连接可以升级到 TCP，TCP conntrack 条目将在连接关闭时被删除，二 UDP 条目必须超时([默认 nf_conntrack_udp_timeout 是 30 秒](https://www.kernel.org/doc/Documentation/networking/nf_conntrack-sysctl.txt))
* 将 DNS 查询从 UDP 升级到 TCP 将减少归因于丢弃的 UDP 数据包和 DNS 超时的尾部等待时间，通常长达 30 秒（3 次重试+ 10 秒超时）


![NodeLocal DNSCache](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200423111434.png)

要安装 NodeLocal DNSCache 也非常简单，直接获取官方的资源清单即可：
```shell
$ wget https://github.com/kubernetes/kubernetes/raw/master/cluster/addons/dns/nodelocaldns/nodelocaldns.yaml
```

该资源清单文件中包含几个变量，其中：

* `__PILLAR__DNS__SERVER__` ：表示 `kube-dns` 这个 Service 的 ClusterIP，可以通过命令 `kubectl get svc -n kube-system | grep kube-dns | awk '{ print $3 }'` 获取
* `__PILLAR__LOCAL__DNS__`：表示 DNSCache 本地的 IP，默认为 169.254.20.10
* `__PILLAR__DNS__DOMAIN__`：表示集群域，默认就是 `cluster.local`

另外还有两个参数 `__PILLAR__CLUSTER__DNS__` 和 `__PILLAR__UPSTREAM__SERVERS__`，这两个参数会通过镜像 `1.15.6` 版本以上的去进行配置，对应的值来源于 kube-dns 的 ConfigMap 和定制的 Upstream Server 配置。直接执行如下所示的命令即可安装：
```shell
$ sed 's/k8s.gcr.io/cnych/g
s/__PILLAR__DNS__SERVER__/10.96.0.10/g
s/__PILLAR__LOCAL__DNS__/169.254.20.10/g
s/__PILLAR__DNS__DOMAIN__/cluster.local/g' nodelocaldns.yaml |
kubectl apply -f -
```

可以通过如下命令来查看对应的 Pod 是否已经启动成功：
```shell
$ kubectl get pods -n kube-system | grep node-local-dns
node-local-dns-8zm2f                    1/1     Running     0          9m54s
node-local-dns-dd4xg                    1/1     Running     0          9m54s
node-local-dns-hs8qq                    1/1     Running     0          9m54s
node-local-dns-pxfxn                    1/1     Running     0          9m54s
node-local-dns-stjm9                    1/1     Running     0          9m54s
node-local-dns-wjxvz                    1/1     Running     0          9m54s
node-local-dns-wn5wc                    1/1     Running     0          7m49s
```

> 需要注意的是这里使用 DaemonSet 部署 node-local-dns 使用了 `hostNetwork=true`，会占用宿主机的 8080 端口，所以需要保证该端口未被占用。

但是到这里还没有完，如果 kube-proxy 组件使用的是 ipvs 模式的话我们还需要修改 kubelet 的 `--cluster-dns` 参数，将其指向 `169.254.20.10`，Daemonset 会在每个节点创建一个网卡来绑这个 IP，Pod 向本节点这个 IP 发 DNS 请求，缓存没有命中的时候才会再代理到上游集群 DNS 进行查询。
`iptables` 模式下 Pod 还是向原来的集群 DNS 请求，节点上有这个 IP 监听，会被本机拦截，再请求集群上游 DNS，所以不需要更改 `--cluster-dns` 参数。

<!--adsense-text-->

由于我这里使用的是 kubeadm 安装的 1.16 版本的集群，所以我们只需要替换节点上 `/var/lib/kubelet/config.yaml` 文件中的 `clusterDNS` 这个参数值，然后重启即可，我们也可以完全在官方的 DaemonSet 资源对象中添加一个 initContainer 来完成这个工作：
```yaml
initContainers:  # ipvs模式下需要修改dns配置，重启kubelet
  - name: setup
    image: alpine
    tty: true
    stdin: true
    securityContext:
      privileged: true
    command:
    - nsenter
    - --target
    - "1"
    - --mount
    - --uts
    - --ipc
    - --net
    - --pid
    - --
    - bash
    - -c
    - |
      # 确保 kubelet --cluster-dns 被设置为 169.254.20.10
      echo "Configuring kubelet --cluster-dns=169.254.20.10"
      sed -i 's/10.96.0.10/169.254.20.10/g' /var/lib/kubelet/config.yaml
      systemctl daemon-reload && systemctl restart kubelet
```

但是需要注意的是对于线上环境还是不推荐用上面的方式，因为它会优先将 kubelet 的 `cluster-dns` 参数进行修改，然后再去安装 `NodeLocal`，这中间毕竟有一段真空期，我们完全可以手动去一个节点一个节点验证：
```shell
$ sed -i 's/10.96.0.10/169.254.20.10/g' /var/lib/kubelet/config.yaml
$ systemctl daemon-reload && systemctl restart kubelet
```

待 `node-local-dns` 安装配置完成后，我们可以部署一个新的 Pod 来验证下：(test-node-local-dns.yaml)
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-node-local-dns
spec:
  containers:
  - name: local-dns
    image: busybox
    command: ["/bin/sh", "-c", "sleep 60m"]
```

直接部署：
```shell
$ kubectl apply -f test-node-local-dns.yaml
$ kubectl exec -it pod-b /bin/sh
/ # cat /etc/resolv.conf
nameserver 169.254.20.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

我们可以看到 `nameserver` 已经变成 `169.254.20.10` 了，当然对于之前的历史 Pod 要想使用 `node-local-dns` 则需要重建，当然如果要想去跟踪 DNS 的解析过程的话可以去通过抓包来观察。

<!--adsense-self-->
