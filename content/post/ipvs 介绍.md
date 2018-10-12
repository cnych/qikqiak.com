---
title: ipvs 基本介绍
subtitle: 如何在 kubernetes 中启用 ipvs
date: 2018-08-23
keywords: ["ipvs", "iptables", "kubernetes", "kube-proxy"]
tags: ["ipvs", "iptables", "kubernetes", "kubeadm"]
slug: how-to-use-ipvs-in-kubernetes
gitcomment: true
bigimg: [{src: "/img/posts/photo-1534939023197-ee1747a69141.jpeg", desc: "Sittin’ On The Dock Of The Bay"}]
category: "kubernetes"
---

**ipvs (IP Virtual Server)** 实现了传输层负载均衡，也就是我们常说的4层`LAN`交换，作为 Linux 内核的一部分。`ipvs`运行在主机上，在真实服务器集群前充当负载均衡器。`ipvs`可以将基于`TCP`和`UDP`的服务请求转发到真实服务器上，并使真实服务器的服务在单个 IP 地址上显示为虚拟服务。

<!--more-->

## ipvs vs. iptables
我们知道`kube-proxy`支持 iptables 和 ipvs 两种模式， 在`kubernetes` v1.8 中引入了 ipvs 模式，在 v1.9 中处于 beta 阶段，在 v1.11 中已经正式可用了。iptables 模式在 v1.1 中就添加支持了，从 v1.2 版本开始 iptables 就是 kube-proxy 默认的操作模式，ipvs 和 iptables 都是基于`netfilter`的，那么 ipvs 模式和 iptables 模式之间有哪些差异呢？

* ipvs 为大型集群提供了更好的可扩展性和性能
* ipvs 支持比 iptables 更复杂的复制均衡算法（最小负载、最少连接、加权等等）
* ipvs 支持服务器健康检查和连接重试等功能

### ipvs 依赖 iptables
ipvs 会使用 iptables 进行包过滤、SNAT、masquared(伪装)。具体来说，ipvs 将使用`ipset`来存储需要`DROP`或`masquared`的流量的源或目标地址，以确保 iptables 规则的数量是恒定的，这样我们就不需要关心我们有多少服务了

下表就是 ipvs 使用的 ipset 集合：

| set name                       | members                                  | usage                                    |
| :----------------------------- | ---------------------------------------- | ---------------------------------------- |
| KUBE-CLUSTER-IP                | All service IP + port                    | Mark-Masq for cases that `masquerade-all=true` or `clusterCIDR` specified |
| KUBE-LOOP-BACK                 | All service IP + port + IP               | masquerade for solving hairpin purpose   |
| KUBE-EXTERNAL-IP               | service external IP + port               | masquerade for packages to external IPs  |
| KUBE-LOAD-BALANCER             | load balancer ingress IP + port          | masquerade for packages to load balancer type service  |
| KUBE-LOAD-BALANCER-LOCAL       | LB ingress IP + port with `externalTrafficPolicy=local` | accept packages to load balancer with `externalTrafficPolicy=local` |
| KUBE-LOAD-BALANCER-FW          | load balancer ingress IP + port with `loadBalancerSourceRanges` | package filter for load balancer with `loadBalancerSourceRanges` specified |
| KUBE-LOAD-BALANCER-SOURCE-CIDR | load balancer ingress IP + port + source CIDR | package filter for load balancer with `loadBalancerSourceRanges` specified |
| KUBE-NODE-PORT-TCP             | nodeport type service TCP port           | masquerade for packets to nodePort(TCP)  |
| KUBE-NODE-PORT-LOCAL-TCP       | nodeport type service TCP port with `externalTrafficPolicy=local` | accept packages to nodeport service with `externalTrafficPolicy=local` |
| KUBE-NODE-PORT-UDP             | nodeport type service UDP port           | masquerade for packets to nodePort(UDP)  |
| KUBE-NODE-PORT-LOCAL-UDP       | nodeport type service UDP port with `externalTrafficPolicy=local` | accept packages to nodeport service with `externalTrafficPolicy=local` |

在以下情况下，ipvs 将依赖于 iptables:

**1. kube-proxy 配置参数 --masquerade-all=true**

如果 kube-proxy 配置了`--masquerade-all=true`参数，则 ipvs 将伪装所有访问 Service 的 Cluster IP 的流量，此时的行为和 iptables 是一致的，由 ipvs 添加的 iptables 规则如下：
```shell
# iptables -t nat -nL

Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */

Chain KUBE-MARK-MASQ (2 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x4000

Chain KUBE-POSTROUTING (1 references)
target     prot opt source               destination
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service traffic requiring SNAT */ mark match 0x4000/0x4000
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOOP-BACK dst,dst,src

Chain KUBE-SERVICES (2 references)
target     prot opt source               destination
KUBE-MARK-MASQ  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-CLUSTER-IP dst,dst
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-CLUSTER-IP dst,dst
```

**2. 在 kube-proxy 启动时指定集群 CIDR**

如果 kube-proxy 配置了`--cluster-cidr=<cidr>`参数，则 ipvs 会伪装所有访问 Service Cluster IP 的外部流量，其行为和 iptables 相同，假设 kube-proxy 提供的集群 CIDR 值为：**10.244.16.0/24**，那么 ipvs 添加的 iptables 规则应该如下所示：
```shell
# iptables -t nat -nL

Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */

Chain KUBE-MARK-MASQ (3 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x4000

Chain KUBE-POSTROUTING (1 references)
target     prot opt source               destination
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service traffic requiring SNAT */ mark match 0x4000/0x4000
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOOP-BACK dst,dst,src

Chain KUBE-SERVICES (2 references)
target     prot opt source               destination
KUBE-MARK-MASQ  all  -- !10.244.16.0/24       0.0.0.0/0            match-set KUBE-CLUSTER-IP dst,dst
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-CLUSTER-IP dst,dst
```

**3. Load Balancer 类型的 Service**

对于`loadBalancer`类型的服务，ipvs 将安装匹配 KUBE-LOAD-BALANCER 的 ipset 的 iptables 规则。特别当服务的 LoadBalancerSourceRanges 被指定或指定 externalTrafficPolicy=local 的时候，ipvs 将创建 ipset 集合`KUBE-LOAD-BALANCER-LOCAL`/`KUBE-LOAD-BALANCER-FW`/`KUBE-LOAD-BALANCER-SOURCE-CIDR`，并添加相应的 iptables 规则，如下所示规则：
```shell
# iptables -t nat -nL

Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */

Chain KUBE-FIREWALL (1 references)
target     prot opt source               destination
RETURN     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOAD-BALANCER-SOURCE-CIDR dst,dst,src
KUBE-MARK-DROP  all  --  0.0.0.0/0            0.0.0.0/0

Chain KUBE-LOAD-BALANCER (1 references)
target     prot opt source               destination
KUBE-FIREWALL  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOAD-BALANCER-FW dst,dst
RETURN     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOAD-BALANCER-LOCAL dst,dst
KUBE-MARK-MASQ  all  --  0.0.0.0/0            0.0.0.0/0

Chain KUBE-MARK-DROP (1 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x8000

Chain KUBE-MARK-MASQ (2 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x4000

Chain KUBE-POSTROUTING (1 references)
target     prot opt source               destination
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service traffic requiring SNAT */ mark match 0x4000/0x4000
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOOP-BACK dst,dst,src

Chain KUBE-SERVICES (2 references)
target     prot opt source               destination
KUBE-LOAD-BALANCER  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOAD-BALANCER dst,dst
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOAD-BALANCER dst,dst
```

**4. NodePort 类型的 Service**

对于 NodePort 类型的服务，ipvs 将添加匹配`KUBE-NODE-PORT-TCP/KUBE-NODE-PORT-UDP`的 ipset 的iptables 规则。当指定`externalTrafficPolicy=local`时，ipvs 将创建 ipset 集`KUBE-NODE-PORT-LOCAL-TC/KUBE-NODE-PORT-LOCAL-UDP`并安装相应的 iptables 规则，如下所示：(假设服务使用 TCP 类型 nodePort)
```shell
Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */

Chain KUBE-MARK-MASQ (2 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x4000

Chain KUBE-NODE-PORT (1 references)
target     prot opt source               destination
RETURN     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-NODE-PORT-LOCAL-TCP dst
KUBE-MARK-MASQ  all  --  0.0.0.0/0            0.0.0.0/0

Chain KUBE-POSTROUTING (1 references)
target     prot opt source               destination
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service traffic requiring SNAT */ mark match 0x4000/0x4000
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOOP-BACK dst,dst,src

Chain KUBE-SERVICES (2 references)
target     prot opt source               destination
KUBE-NODE-PORT  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-NODE-PORT-TCP dst
```

**5. 指定 externalIPs 的 Service**

对于指定了`externalIPs`的 Service，ipvs 会安装匹配`KUBE-EXTERNAL-IP` ipset 集的 iptables 规则，假设我们有指定了 externalIPs 的 Service，则 iptables 规则应该如下所示：
```shell
Chain PREROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain OUTPUT (policy ACCEPT)
target     prot opt source               destination
KUBE-SERVICES  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service portals */

Chain POSTROUTING (policy ACCEPT)
target     prot opt source               destination
KUBE-POSTROUTING  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes postrouting rules */

Chain KUBE-MARK-MASQ (2 references)
target     prot opt source               destination
MARK       all  --  0.0.0.0/0            0.0.0.0/0            MARK or 0x4000

Chain KUBE-POSTROUTING (1 references)
target     prot opt source               destination
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            /* kubernetes service traffic requiring SNAT */ mark match 0x4000/0x4000
MASQUERADE  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-LOOP-BACK dst,dst,src

Chain KUBE-SERVICES (2 references)
target     prot opt source               destination
KUBE-MARK-MASQ  all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-EXTERNAL-IP dst,dst
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-EXTERNAL-IP dst,dst PHYSDEV match ! --physdev-is-in ADDRTYPE match src-type !LOCAL
ACCEPT     all  --  0.0.0.0/0            0.0.0.0/0            match-set KUBE-EXTERNAL-IP dst,dst ADDRTYPE match dst-type LOCAL
```

## kube-proxy 使用 ipvs 模式
目前，本地化脚本、GCE 脚本和`kubeadm`支持通过导入环境变量或者指定标志来切换 ipvs 代理模式

### 要求
确保 ipvs 需要的内核模块，需要下面几个模块：ip_vs、ip_vs_rr、ip_vs_wrr、ip_vs_sh、nf_conntrack_ipv4

已编译到节点内核中的，可以使用如下命令检查：
```shell
$ grep -e ipvs -e nf_conntrack_ipv4 /lib/modules/$(uname -r)/modules.builtin
# 如果相关内核模块已经编译到内核中，可以得到如下结果：
kernel/net/ipv4/netfilter/nf_conntrack_ipv4.ko
kernel/net/netfilter/ipvs/ip_vs.ko
kernel/net/netfilter/ipvs/ip_vs_rr.ko
kernel/net/netfilter/ipvs/ip_vs_wrr.ko
kernel/net/netfilter/ipvs/ip_vs_lc.ko
kernel/net/netfilter/ipvs/ip_vs_wlc.ko
kernel/net/netfilter/ipvs/ip_vs_fo.ko
kernel/net/netfilter/ipvs/ip_vs_ovf.ko
kernel/net/netfilter/ipvs/ip_vs_lblc.ko
kernel/net/netfilter/ipvs/ip_vs_lblcr.ko
kernel/net/netfilter/ipvs/ip_vs_dh.ko
kernel/net/netfilter/ipvs/ip_vs_sh.ko
kernel/net/netfilter/ipvs/ip_vs_sed.ko
kernel/net/netfilter/ipvs/ip_vs_nq.ko
kernel/net/netfilter/ipvs/ip_vs_ftp.ko
```

已经加载。
```shell
# 加载模块 <module_name>
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack_ipv4

# 检查加载的模块
lsmod | grep -e ipvs -e nf_conntrack_ipv4
# 或者
cut -f1 -d " "  /proc/modules | grep -e ip_vs -e nf_conntrack_ipv4
```

在使用 ipvs 模式之前，还应在节点上安装`ipset`相关的软件包，如果不满足需求 kube-proxy 会回退到 iptables 的模式。

### 本地集群
在[本地集群](https://github.com/kubernetes/community/blob/master/contributors/devel/running-locally.md)中 kube-proxy 默认会运行 iptables 的模式。
要使用 ipvs 模式，在[启动集群](https://github.com/kubernetes/community/blob/master/contributors/devel/running-locally.md#starting-the-cluster)之前需要导入`KUBE_PROXY_MODE=ipvs`的环境变量：
```shell
# 运行脚本 hack/local-up-cluster.sh 之前
export KUBE_PROXY_MODE=ipvs
```

### GCE 集群
和本地集群一样，[GCE 集群](https://kubernetes.io/docs/getting-started-guides/gce/)中的 kube-proxy 默认也是 iptables 模式，在[启动集群](https://kubernetes.io/docs/getting-started-guides/gce/#starting-a-cluster)之前同样需要导入环境变量`KUBE_PROXY_MODE=ipvs`:
```shell
# 运行前选择下面的一条命令启动集群:
# curl -sS https://get.k8s.io | bash
# wget -q -O - https://get.k8s.io | bash
# cluster/kube-up.sh
export KUBE_PROXY_MODE=ipvs
```

### 使用 kubeadm 搭建的集群
通过[kubeadm]((https://kubernetes.io/docs/setup/independent/create-cluster-kubeadm/))部署的集群中 kube-proxy 同样默认是 iptables 模式。

如果你是通过[配置文件](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/#config-file)来使用的 kubeadm，则可以在`kubeProxy`属性下面添加`SupportIPVSProxyMode: true`来启用 ipvs 模式：
```yaml
kind: MasterConfiguration
apiVersion: kubeadm.k8s.io/v1alpha1
...
kubeProxy:
  config:
    mode: ipvs
...
```

然后执行初始化命令即可：
```shell
$ kubeadm init --config <path_to_configuration_file>
```

如果你使用的是 v1.8 版本的 kubernetes，你也可以在`kubeadm init`命令中增加`--feature-gates=SupportIPVSProxyMode=true`标志来来启用 ipvs 模式：
```$
$ kubeadm init --feature-gates=SupportIPVSProxyMode=true
```

> 注意该参数在 v1.9 后已经弃用掉了

### 注意
如果成功启用了 ipvs 模式，你应该可以使用`ipvsadm`之类的工具看到如下的一些 ipvs 代理规则：
```shell
 # ipvsadm -ln
IP Virtual Server version 1.2.1 (size=4096)
Prot LocalAddress:Port Scheduler Flags
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  10.0.0.1:443 rr persistent 10800
  -> 192.168.0.1:6443             Masq    1      1          0
```

或者在 kube-proxy 日志中可以看到如下的一些日志信息：
```
Using ipvs Proxier.
```

当没有这些 ipvs 代理规则或者出现了下面的这些日志信息的时候表明 kube-proxy 的 ipvs 模式启用失败了：
```
Can't use ipvs proxier, trying iptables proxier
Using iptables Proxier.
```

可以参考下面的调试方法进行错误信息排查

## 调试

### 检查 ipvs 代理规则
用户可以使用`ipvsadm`工具检查 kube-proxy 是否维护正确的 ipvs 规则，比如，我们在集群中有以下一些服务：
```shell
$ kubectl get svc --all-namespaces
NAMESPACE     NAME         TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)         AGE
default       kubernetes   ClusterIP   10.0.0.1     <none>        443/TCP         1d
kube-system   kube-dns     ClusterIP   10.0.0.10    <none>        53/UDP,53/TCP   1d
```

我们可以得到如下的一些 ipvs 代理规则：
```shell
 # ipvsadm -ln
IP Virtual Server version 1.2.1 (size=4096)
Prot LocalAddress:Port Scheduler Flags
  -> RemoteAddress:Port           Forward Weight ActiveConn InActConn
TCP  10.0.0.1:443 rr persistent 10800
  -> 192.168.0.1:6443             Masq    1      1          0
TCP  10.0.0.10:53 rr
  -> 172.17.0.2:53                Masq    1      0          0
UDP  10.0.0.10:53 rr
  -> 172.17.0.2:53                Masq    1      0          0
```

### 为什么 kube-proxy 无法启动 ipvs模式
可以使用下面的一些方法来帮助我们解决这些问题：

**1. 启用 ipvs feature gate**

对于 kubernetes v1.10 版本之后，feature gate `SupportIPVSProxyMode`已经被默认设置为`true`了，但是如果你是 v1.10 之前的版本，你需要手动设置`--feature-gates=SupportIPVSProxyMode=true`来启用该 feature。

**2. 指定 proxy-mode=ipvs**

检查 kube-proxy 的 model 是否被设置为了`ipvs`。

**3. 安装需要的内核模块和软件包**

检查 ipvs 需要的内核模块是否已经被编译进内核模块中，以及需要的软件包（可以参考前面的环境要求部分）


扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

