---
title: 如何修改 Kubernetes 节点 IP 地址?
date: 2022-05-13
tags: ["kubernetes", "kubeadm"]
keywords: ["kubernetes", "kubeadm", "IP", "修改IP地址"]
slug: how-to-change-k8s-node-ip
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200424115708.png", desc: "https://unsplash.com/photos/SGeLqzloJaw"}]
category: "kubernetes"
---

昨天网络环境出了点问题，本地的虚拟机搭建的 Kubernetes 环境没有固定 IP，结果节点 IP 变了，当然最简单的方式是将节点重新固定回之前的 IP 地址，但是自己头铁想去修改下集群的 IP 地址，结果一路下来踩了好多坑，压根就没那么简单~

<!--more-->

## 环境

首先看下之前的环境：

```shell
➜  ~ cat /etc/hosts
192.168.0.111 master1
192.168.0.109 node1
192.168.0.110 node2
```

新的 IP 地址：

```shell
➜  ~ cat /etc/hosts
192.168.0.106 master1
192.168.0.101 node1
192.168.0.105 node2
```

所以我们需要修改所有节点的 IP 地址。

## 操作

首先将所有节点的 `/etc/hosts` 更改为新的地址。

> 提示：在操作任何文件之前**强烈建议先备份**。

### master 节点

1. 备份 `/etc/kubernetes` 目录。

```shell
➜ cp -Rf /etc/kubernetes/ /etc/kubernetes-bak
```


2. 替换 `/etc/kubernetes` 中所有配置文件的 APIServer 地址。

```shell
➜ oldip=192.168.0.111
➜ newip=192.168.0.106
# 查看之前的
➜ find . -type f | xargs grep $oldip
# 替换IP地址
➜ find . -type f | xargs sed -i "s/$oldip/$newip/"
# 检查更新后的
➜ find . -type f | xargs grep $newip
```

3. 识别 `/etc/kubernetes/pki` 中以旧的 IP 地址作为 `alt name` 的证书。

```shell
➜ cd /etc/kubernetes/pki
➜ for f in $(find -name "*.crt"); do
  openssl x509 -in $f -text -noout > $f.txt;
done
➜ grep -Rl $oldip .
➜ for f in $(find -name "*.crt"); do rm $f.txt; done
```

4. 找到 `kube-system` 命名空间中引用旧 IP 的 ConfigMap。

```shell
# 获取所有的 kube-system 命名空间下面所有的 ConfigMap
➜ configmaps=$(kubectl -n kube-system get cm -o name | \
  awk '{print $1}' | \
  cut -d '/' -f 2)

# 获取所有的ConfigMap资源清单
➜ dir=$(mktemp -d)
➜ for cf in $configmaps; do
  kubectl -n kube-system get cm $cf -o yaml > $dir/$cf.yaml
done

# 找到所有包含旧 IP 的 ConfigMap
➜ grep -Hn $dir/* -e $oldip

# 然后编辑这些 ConfigMap，将旧 IP 替换成新的 IP
➜ kubectl -n kube-system edit cm kubeadm-config
➜ kubectl -n kube-system edit cm kube-proxy
```

这一步非常非常重要，我在操作的时候忽略了这一步，导致 Flannel CNI 启动不起来，一直报错，类似下面的日志信息：

```shell
➜ kubectl logs -f kube-flannel-ds-pspzf -n kube-system
I0512 14:46:26.044229       1 main.go:205] CLI flags config: {etcdEndpoints:http://127.0.0.1:4001,http://127.0.0.1:2379 etcdPrefix:/coreos.com/network etcdKeyfile: etcdCertfile: etcdCAFile: etcdUsername: etcdPassword: version:false kubeSubnetMgr:true kubeApiUrl: kubeAnnotationPrefix:flannel.alpha.coreos.com kubeConfigFile: iface:[ens33] ifaceRegex:[] ipMasq:true subnetFile:/run/flannel/subnet.env publicIP: publicIPv6: subnetLeaseRenewMargin:60 healthzIP:0.0.0.0 healthzPort:0 iptablesResyncSeconds:5 iptablesForwardRules:true netConfPath:/etc/kube-flannel/net-conf.json setNodeNetworkUnavailable:true}
W0512 14:46:26.044617       1 client_config.go:614] Neither --kubeconfig nor --master was specified.  Using the inClusterConfig.  This might not work.
E0512 14:46:56.142921       1 main.go:222] Failed to create SubnetManager: error retrieving pod spec for 'kube-system/kube-flannel-ds-pspzf': Get "https://10.96.0.1:443/api/v1/namespaces/kube-system/pods/kube-flannel-ds-pspzf": dial tcp 10.96.0.1:443: i/o timeout
```

其实就是连不上 apiserver，排查了好久才想起来查看 `kube-proxy` 的日志，其中出现了如下所示的错误信息：

```shell
E0512 14:53:03.260817       1 reflector.go:138] k8s.io/client-go/informers/factory.go:134: Failed to watch *v1.EndpointSlice: failed to list *v1.EndpointSlice: Get "https://192.168.0.111:6443/apis/discovery.k8s.io/v1/endpointslices?labelSelector=%21service.kubernetes.io%2Fheadless%2C%21service.kubernetes.io%2Fservice-proxy-name&limit=500&resourceVersion=0": dial tcp 192.168.0.111:6443: connect: no route to host
```

这就是因为 kube-proxy 的 ConfigMap 中配置的 apiserver 地址是旧的 IP 地址，所以一定要将其替换成新的。

5. 删除第3步中 grep 出的证书和私钥，重新生成这些证书。

```shell
➜ cd /etc/kubernetes/pki
➜ rm apiserver.crt apiserver.key
➜ kubeadm init phase certs apiserver

➜ rm etcd/peer.crt etcd/peer.key
➜ kubeadm init phase certs etcd-peer
```

当然也可以全部重新生成：
```shell
➜ kubeadm init phase certs all
```

6. 生成新的 kubeconfig 文件。

```shell
➜ cd /etc/kubernetes
➜ rm -f admin.conf kubelet.conf controller-manager.conf scheduler.conf
➜ kubeadm init phase kubeconfig all
I0513 15:33:34.404780   52280 version.go:255] remote version is much newer: v1.24.0; falling back to: stable-1.22
[kubeconfig] Using kubeconfig folder "/etc/kubernetes"
[kubeconfig] Writing "admin.conf" kubeconfig file
[kubeconfig] Writing "kubelet.conf" kubeconfig file
[kubeconfig] Writing "controller-manager.conf" kubeconfig file
[kubeconfig] Writing "scheduler.conf" kubeconfig file
# 覆盖默认的 kubeconfig 文件
➜ cp /etc/kubernetes/admin.conf $HOME/.kube/config
```

7. 重启 kubelet。

```shell
➜ systemctl restart containerd
➜ systemctl restart kubelet
```

正常现在可以访问的 Kubernetes 集群了。

```shell
➜ kubectl get nodes
NAME      STATUS     ROLES                  AGE   VERSION
master1   Ready      control-plane,master   48d   v1.22.8
node1     NotReady   <none>                 48d   v1.22.8
node2     NotReady   <none>                 48d   v1.22.8
```

### node 节点

虽然现在可以访问集群了，但是我们可以看到 Node 节点现在处于 `NotReady` 状态，我们可以去查看 node2 节点的 kubelet 日志：

```shell
➜ journalctl -u kubelet -f
......
May 13 15:47:55 node2 kubelet[1194]: E0513 15:47:55.470896    1194 kubelet.go:2412] "Error getting node" err="node \"node2\" not found"
May 13 15:47:55 node2 kubelet[1194]: E0513 15:47:55.531695    1194 reflector.go:138] k8s.io/client-go/informers/factory.go:134: Failed to watch *v1.Service: failed to list *v1.Service: Get "https://192.168.0.111:6443/api/v1/services?limit=500&resourceVersion=0": dial tcp 192.168.0.111:6443: connect: no route to host
May 13 15:47:55 node2 kubelet[1194]: E0513 15:47:55.571958    1194 kubelet.go:2412] "Error getting node" err="node \"node2\" not found"
May 13 15:47:55 node2 kubelet[1194]: E0513 15:47:55.673379    1194 kubelet.go:2412] "Error getting node" err="node \"node2\" not found"
```

可以看到仍然是在访问之前的 APIServer 地址，那么在什么地方会明确使用 APIServer 的地址呢？我们可以通过下面的命令来查看 kubelet 的启动参数：

```shell
➜ systemctl status kubelet
● kubelet.service - kubelet: The Kubernetes Node Agent
   Loaded: loaded (/usr/lib/systemd/system/kubelet.service; enabled; vendor preset: disabled)
  Drop-In: /usr/lib/systemd/system/kubelet.service.d
           └─10-kubeadm.conf
   Active: active (running) since Fri 2022-05-13 14:37:31 CST; 1h 13min ago
     Docs: https://kubernetes.io/docs/
 Main PID: 1194 (kubelet)
    Tasks: 15
   Memory: 126.9M
   CGroup: /system.slice/kubelet.service
           └─1194 /usr/bin/kubelet --bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kub...

May 13 15:51:08 node2 kubelet[1194]: E0513 15:51:08.787677    1194 kubelet.go:2412] "Error getting node" err="node \"node2... found"
May 13 15:51:08 node2 kubelet[1194]: E0513 15:51:08.888194    1194 kubelet.go:2412] "Error getting node" err="node \"node2... found"
......
```

其核心配置文件为 `/usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf`，内容如下所示：

```shell
➜ cat /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
# Note: This dropin only works with kubeadm and kubelet v1.11+
[Service]
Environment="KUBELET_KUBECONFIG_ARGS=--bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf"
Environment="KUBELET_CONFIG_ARGS=--config=/var/lib/kubelet/config.yaml"
# This is a file that "kubeadm init" and "kubeadm join" generates at runtime, populating the KUBELET_KUBEADM_ARGS variable dynamically
EnvironmentFile=-/var/lib/kubelet/kubeadm-flags.env
# This is a file that the user can use for overrides of the kubelet args as a last resort. Preferably, the user should use
# the .NodeRegistration.KubeletExtraArgs object in the configuration files instead. KUBELET_EXTRA_ARGS should be sourced from this file.
EnvironmentFile=-/etc/sysconfig/kubelet
ExecStart=
ExecStart=/usr/bin/kubelet $KUBELET_KUBECONFIG_ARGS $KUBELET_CONFIG_ARGS $KUBELET_KUBEADM_ARGS $KUBELET_EXTRA_ARGS
```

其中有一个配置 `KUBELET_KUBECONFIG_ARGS=--bootstrap-kubeconfig=/etc/kubernetes/bootstrap-kubelet.conf --kubeconfig=/etc/kubernetes/kubelet.conf`，这里提到了两个配置文件 `bootstrap-kubelet.conf` 与 `kubelet.conf`，其中第一个文件不存在：

```shell
➜ cat /etc/kubernetes/bootstrap-kubelet.conf
cat: /etc/kubernetes/bootstrap-kubelet.conf: No such file or directory
```

而第二个配置文件就是一个 kubeconfig 文件的格式，这个文件中就指定了 APIServer 的地址，可以看到还是之前的 IP 地址：

```shell
➜ cat /etc/kubernetes/kubelet.conf
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: <......>
    server: https://192.168.0.111:6443
  name: default-cluster
contexts:
- context:
    cluster: default-cluster
    namespace: default
    user: default-auth
  name: default-context
current-context: default-context
kind: Config
preferences: {}
users:
- name: default-auth
  user:
    client-certificate: /var/lib/kubelet/pki/kubelet-client-current.pem
    client-key: /var/lib/kubelet/pki/kubelet-client-current.pem
```

所以我们最先想到的肯定就是去将这里的 APIServer 地址修改成新的 IP 地址，但是这显然是有问题的，因为相关证书还是以前的，需要重新生成，那么要怎样重新生成该文件呢？

首先备份 kubelet 工作目录：

```shell
➜ cp /etc/kubernetes/kubelet.conf /etc/kubernetes/kubelet.conf.bak
➜ cp -rf /var/lib/kubelet/ /var/lib/kubelet-bak
```

删除 kubelet 客户端证书：

```shell
➜ rm /var/lib/kubelet/pki/kubelet-client*
```

然后在 master1 节点（具有 `/etc/kubernetes/pki/ca.key` 文件的节点）去生成 kubelet.conf 文件：

```shell
# 在master1节点
➜ kubeadm kubeconfig user --org system:nodes --client-name system:node:node2 --config kubeadm.yaml > kubelet.conf
```

然后将 kubelet.conf 文件复制到 node2 节点 `/etc/kubernetes/kubelet.conf`，然后重新启动 node2 节点上的 kubelet，并等待 `/var/lib/kubelet/pki/kubelet-client-current.pem` 重新创建。

```shell
➜ systemctl restart kubelet
# 重启后等待重新生成 kubelet 客户端证书
➜ ll /var/lib/kubelet/pki/
total 12
-rw------- 1 root root 1106 May 13 16:32 kubelet-client-2022-05-13-16-32-35.pem
lrwxrwxrwx 1 root root   59 May 13 16:32 kubelet-client-current.pem -> /var/lib/kubelet/pki/kubelet-client-2022-05-13-16-32-35.pem
-rw-r--r-- 1 root root 2229 Mar 26 14:39 kubelet.crt
-rw------- 1 root root 1675 Mar 26 14:39 kubelet.key
```

最好我们可以通过手动编辑 `kubelet.conf` 的方式来指向轮转的 kubelet 客户端证书，将文件中的 `client-certificate-data` 和 `client-key-data` 替换为 `/var/lib/kubelet/pki/kubelet-client-current.pem`：

```shell
client-certificate: /var/lib/kubelet/pki/kubelet-client-current.pem
client-key: /var/lib/kubelet/pki/kubelet-client-current.pem
```

再次重启 kubelet，正常现在 node2 节点就会变成 `Ready` 状态了，用同样的方法再次去配置 node1 节点即可。

```shell
➜ kubectl get nodes
NAME      STATUS   ROLES                  AGE   VERSION
master1   Ready    control-plane,master   48d   v1.22.8
node1     Ready    <none>                 48d   v1.22.8
node2     Ready    <none>                 48d   v1.22.8
```

## 推荐操作

上面的操作方式虽然可以正常完成我们的需求，但是需要我们对相关证书有一定的了解。除了这种方式之外还有一种更简单的操作。
<!--adsense-text-->
首先停止 kubelet 并备份要操作的目录：

```shell
➜ systemctl stop kubelet
➜ mv /etc/kubernetes /etc/kubernetes-bak
➜ mv /var/lib/kubelet/ /var/lib/kubelet-bak
```

将 pki 证书目录保留下来：

```shell
➜ mkdir -p /etc/kubernetes
➜ cp -r /etc/kubernetes-bak/pki /etc/kubernetes
➜ rm /etc/kubernetes/pki/{apiserver.*,etcd/peer.*}
rm: remove regular file ‘/etc/kubernetes/pki/apiserver.crt’? y
rm: remove regular file ‘/etc/kubernetes/pki/apiserver.key’? y
rm: remove regular file ‘/etc/kubernetes/pki/etcd/peer.crt’? y
rm: remove regular file ‘/etc/kubernetes/pki/etcd/peer.key’? y
```

现在我们使用下面的命令来重新初始化控制平面节点，但是最重要的一点是要**使用 etcd 的数据目录**，可以通过 `--ignore-preflight-errors=DirAvailable--var-lib-etcd` 标志来告诉 kubeadm 使用预先存在的 etcd 数据。

```shell
➜ kubeadm init --config kubeadm.yaml --ignore-preflight-errors=DirAvailable--var-lib-etcd
[init] Using Kubernetes version: v1.22.8
[preflight] Running pre-flight checks
        [WARNING DirAvailable--var-lib-etcd]: /var/lib/etcd is not empty
[preflight] Pulling images required for setting up a Kubernetes cluster
[preflight] This might take a minute or two, depending on the speed of your internet connection
[preflight] You can also perform this action in beforehand using 'kubeadm config images pull'
[certs] Using certificateDir folder "/etc/kubernetes/pki"
[certs] Using existing ca certificate authority
[certs] Generating "apiserver" certificate and key
[certs] apiserver serving cert is signed for DNS names [api.k8s.local kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local master1] and IPs [10.96.0.1 192.168.0.106]
[certs] Using existing apiserver-kubelet-client certificate and key on disk
[certs] Using existing front-proxy-ca certificate authority
[certs] Using existing front-proxy-client certificate and key on disk
[certs] Using existing etcd/ca certificate authority
[certs] Using existing etcd/server certificate and key on disk
[certs] Generating "etcd/peer" certificate and key
[certs] etcd/peer serving cert is signed for DNS names [localhost master1] and IPs [192.168.0.106 127.0.0.1 ::1]
[certs] Using existing etcd/healthcheck-client certificate and key on disk
[certs] Using existing apiserver-etcd-client certificate and key on disk
[certs] Using the existing "sa" key
[kubeconfig] Using kubeconfig folder "/etc/kubernetes"
[kubeconfig] Writing "admin.conf" kubeconfig file
[kubeconfig] Writing "kubelet.conf" kubeconfig file
[kubeconfig] Writing "controller-manager.conf" kubeconfig file
[kubeconfig] Writing "scheduler.conf" kubeconfig file
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Starting the kubelet
[control-plane] Using manifest folder "/etc/kubernetes/manifests"
[control-plane] Creating static Pod manifest for "kube-apiserver"
[control-plane] Creating static Pod manifest for "kube-controller-manager"
[control-plane] Creating static Pod manifest for "kube-scheduler"
[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"
[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods from directory "/etc/kubernetes/manifests". This can take up to 4m0s
[apiclient] All control plane components are healthy after 12.003599 seconds
[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[kubelet] Creating a ConfigMap "kubelet-config-1.22" in namespace kube-system with the configuration for the kubelets in the cluster
[upload-certs] Skipping phase. Please see --upload-certs
[mark-control-plane] Marking the node master1 as control-plane by adding the labels: [node-role.kubernetes.io/master(deprecated) node-role.kubernetes.io/control-plane node.kubernetes.io/exclude-from-external-load-balancers]
[mark-control-plane] Marking the node master1 as control-plane by adding the taints [node-role.kubernetes.io/master:NoSchedule]
[bootstrap-token] Using token: abcdef.0123456789abcdef
[bootstrap-token] Configuring bootstrap tokens, cluster-info ConfigMap, RBAC Roles
[bootstrap-token] configured RBAC rules to allow Node Bootstrap tokens to get nodes
[bootstrap-token] configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstrap-token] configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstrap-token] configured RBAC rules to allow certificate rotation for all node client certificates in the cluster
[bootstrap-token] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[kubelet-finalize] Updating "/etc/kubernetes/kubelet.conf" to point to a rotatable kubelet client certificate and key
[addons] Applied essential addon: CoreDNS
[addons] Applied essential addon: kube-proxy

Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

Alternatively, if you are the root user, you can run:

  export KUBECONFIG=/etc/kubernetes/admin.conf

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 192.168.0.106:6443 --token abcdef.0123456789abcdef \
        --discovery-token-ca-cert-hash sha256:27993cae9c76d18a1b82b800182c4c7ebc7a704ba1093400ed886f65e709ec04
```

上面的操作和我们平时去初始化集群的时候几乎是一样的，唯一不同的地方是加了一个 `--ignore-preflight-errors=DirAvailable--var-lib-etcd` 参数，意思就是使用之前 etcd 的数据。然后我们可以验证下 APIServer 的 IP 地址是否变成了新的地址：

```shell
➜ cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
cp: overwrite ‘/root/.kube/config’? y
➜ kubectl cluster-info
Kubernetes control plane is running at https://192.168.0.106:6443
CoreDNS is running at https://192.168.0.106:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

对于 node 节点我们可以 reset 后重新加入到集群即可：
```shell
# 在node节点操作
➜ kubeadm reset
```

重置后重新 join 集群即可：

```shell
# 在node节点操作
➜ kubeadm join 192.168.0.106:6443 --token abcdef.0123456789abcdef \
        --discovery-token-ca-cert-hash sha256:27993cae9c76d18a1b82b800182c4c7ebc7a704ba1093400ed886f65e709ec04
```

这种方式比上面的方式要简单很多。正常操作后集群也正常了。

```shell
➜ kubectl get nodes
NAME      STATUS   ROLES                  AGE     VERSION
master1   Ready    control-plane,master   48d     v1.22.8
node1     Ready    <none>                 48d     v1.22.8
node2     Ready    <none>                 4m50s   v1.22.8
```

## 总结

对于 Kubernetes 集群节点的 IP 地址最好使用静态 IP，避免 IP 变动对业务产生影响，如果不是静态 IP，也强烈建议增加一个自定义域名进行签名，这样当 IP 变化后还可以直接重新映射下这个域名即可，只需要在 kubeadm 配置文件中通过 `ClusterConfiguration` 配置 `apiServer.certSANs` 即可，如下所示：

```yaml
apiVersion: kubeadm.k8s.io/v1beta3
apiServer:
  timeoutForControlPlane: 4m0s
  certSANs:
  - api.k8s.local
  - master1
  - 192.168.0.106
kind: ClusterConfiguration
......
```

将需要进行前面的地址加入到 `certSANs` 中，比如这里我们额外添加了一个 `api.k8s.local` 的地址，这样即使以后 IP 变了可以直接将这个域名映射到新的 IP 地址即可，同样如果你想通过外网访问 IP 访问你的集群，那么你也需要将你的外网 IP 地址加进来进行签名认证。
<!--adsense-self-->
