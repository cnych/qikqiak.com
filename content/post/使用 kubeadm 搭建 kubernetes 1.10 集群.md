---
title: 使用kubeadm搭建kubernetes1.10集群
date: 2018-04-14
tags: ["kubernetes", "kubeadm"]
keywords: ["kubernetes", "kubeadm"]
slug: use-kubeadm-install-kubernetes-1.10
gitcomment: true
bigimg: [{src: "/img/posts/photo-1496072298559-ee7eacbd1b39.jpeg", desc: "Kings Mountain"}]
category: "kubernetes"
---

`kubeadm`是`Kubernetes`官方提供的用于快速安装 Kubernetes 集群的工具，通过将集群的各个组件进行容器化安装管理，通过`kubeadm`的方式安装集群比二进制的方式安装要方便不少，但是目录`kubeadm`还处于`beta`状态，还不能用于生产环境，[Using kubeadm to Create a Cluster](https://kubernetes.io/docs/setup/independent/create-cluster-kubeadm/)文档中已经说明`kubeadm`将会很快能够用于生产环境了。

所以现在来了解下`kubeadm`的使用方式的话还是很有必要的，对于现阶段想要用于生产环境的，建议还是参考我们前面的文章：[手动搭建高可用的kubernetes 集群](https://blog.qikqiak.com/post/manual-install-high-available-kubernetes-cluster/)或者[视频教程](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)。

<!--more-->

## 环境
我们这里准备两台`Centos7`的主机用于安装，后续节点可以根究需要添加即可：
```shell
$ cat /etc/hosts
10.151.30.57 ydzs-master1
10.151.30.62 evjfaxic
```

禁用防火墙：
```shell
$ systemctl stop firewalld
$ systemctl disable firewalld
```

禁用SELINUX：
```shell
$ setenforce 0
$ cat /etc/selinux/config
SELINUX=disabled
```

创建`/etc/sysctl.d/k8s.conf`文件，添加如下内容：
```shell
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
```

执行如下命令使修改生效：
```shell
$ modprobe br_netfilter
$ sysctl -p /etc/sysctl.d/k8s.conf
```

## 镜像
如果你的节点上面有科学上网的工具，可以忽略这一步，我们需要提前将所需的`gcr.io`上面的镜像下载到节点上面，当然前提条件是你已经成功安装了`docker`。

`master`节点，执行下面的命令：
```shell
docker pull cnych/kube-apiserver-amd64:v1.10.0
docker pull cnych/kube-scheduler-amd64:v1.10.0
docker pull cnych/kube-controller-manager-amd64:v1.10.0
docker pull cnych/kube-proxy-amd64:v1.10.0
docker pull cnych/k8s-dns-kube-dns-amd64:1.14.8
docker pull cnych/k8s-dns-dnsmasq-nanny-amd64:1.14.8
docker pull cnych/k8s-dns-sidecar-amd64:1.14.8
docker pull cnych/etcd-amd64:3.1.12
docker pull cnych/flannel:v0.10.0-amd64
docker pull cnych/pause-amd64:3.1

docker tag cnych/kube-apiserver-amd64:v1.10.0 k8s.gcr.io/kube-apiserver-amd64:v1.10.0
docker tag cnych/kube-scheduler-amd64:v1.10.0 k8s.gcr.io/kube-scheduler-amd64:v1.10.0
docker tag cnych/kube-controller-manager-amd64:v1.10.0 k8s.gcr.io/kube-controller-manager-amd64:v1.10.0
docker tag cnych/kube-proxy-amd64:v1.10.0 k8s.gcr.io/kube-proxy-amd64:v1.10.0
docker tag cnych/k8s-dns-kube-dns-amd64:1.14.8 k8s.gcr.io/k8s-dns-kube-dns-amd64:1.14.8
docker tag cnych/k8s-dns-dnsmasq-nanny-amd64:1.14.8 k8s.gcr.io/k8s-dns-dnsmasq-nanny-amd64:1.14.8
docker tag cnych/k8s-dns-sidecar-amd64:1.14.8 k8s.gcr.io/k8s-dns-sidecar-amd64:1.14.8
docker tag cnych/etcd-amd64:3.1.12 k8s.gcr.io/etcd-amd64:3.1.12
docker tag cnych/flannel:v0.10.0-amd64 quay.io/coreos/flannel:v0.10.0-amd64
docker tag cnych/pause-amd64:3.1 k8s.gcr.io/pause-amd64:3.1
```
可以将上面的命令保存为一个`shell`脚本，然后直接执行即可。这些镜像是在`master`节点上需要使用到的镜像，一定要提前下载下来。


其他`Node`，执行下面的命令：
```shell
docker pull cnych/kube-proxy-amd64:v1.10.0
docker pull cnych/flannel:v0.10.0-amd64
docker pull cnych/pause-amd64:3.1
docker pull cnych/kubernetes-dashboard-amd64:v1.8.3
docker pull cnych/heapster-influxdb-amd64:v1.3.3
docker pull cnych/heapster-grafana-amd64:v4.4.3
docker pull cnych/heapster-amd64:v1.4.2
docker pull cnych/k8s-dns-kube-dns-amd64:1.14.8
docker pull cnych/k8s-dns-dnsmasq-nanny-amd64:1.14.8
docker pull cnych/k8s-dns-sidecar-amd64:1.14.8

docker tag cnych/flannel:v0.10.0-amd64 quay.io/coreos/flannel:v0.10.0-amd64
docker tag cnych/pause-amd64:3.1 k8s.gcr.io/pause-amd64:3.1
docker tag cnych/kube-proxy-amd64:v1.10.0 k8s.gcr.io/kube-proxy-amd64:v1.10.0

docker tag cnych/k8s-dns-kube-dns-amd64:1.14.8 k8s.gcr.io/k8s-dns-kube-dns-amd64:1.14.8
docker tag cnych/k8s-dns-dnsmasq-nanny-amd64:1.14.8 k8s.gcr.io/k8s-dns-dnsmasq-nanny-amd64:1.14.8
docker tag cnych/k8s-dns-sidecar-amd64:1.14.8 k8s.gcr.io/k8s-dns-sidecar-amd64:1.14.8

docker tag cnych/kubernetes-dashboard-amd64:v1.8.3 k8s.gcr.io/kubernetes-dashboard-amd64:v1.8.3
docker tag cnych/heapster-influxdb-amd64:v1.3.3 k8s.gcr.io/heapster-influxdb-amd64:v1.3.3
docker tag cnych/heapster-grafana-amd64:v4.4.3 k8s.gcr.io/heapster-grafana-amd64:v4.4.3
docker tag cnych/heapster-amd64:v1.4.2 k8s.gcr.io/heapster-amd64:v1.4.2
```
上面的这些镜像是在`Node`节点中需要用到的镜像，在`join`节点之前也需要先下载到节点上面。


## 安装 kubeadm、kubelet、kubectl
在确保`docker`安装完成后，上面的相关环境配置也完成了，对应所需要的镜像(如果可以科学上网可以跳过这一步)也下载完成了，现在我们就可以来安装`kubeadm`了，我们这里是通过指定`yum`源的方式来进行安装的：
```shell
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=1
repo_gpgcheck=1
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg
        https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF
```
当然了，上面的`yum`源也是需要科学上网的，如果不能科学上网的话，我们可以使用阿里云的源进行安装：
```shell
cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=http://mirrors.aliyun.com/kubernetes/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=0
repo_gpgcheck=0
gpgkey=http://mirrors.aliyun.com/kubernetes/yum/doc/yum-key.gpg
        http://mirrors.aliyun.com/kubernetes/yum/doc/rpm-package-key.gpg
EOF
```
目前阿里云的源最新版本已经是1.10版本，所以可以直接安装。`yum`源配置完成后，执行安装命令即可：
```shell
$ yum makecache fast && yum install -y kubelet kubeadm kubectl
```
正常情况我们可以都能顺利安装完成上面的文件。

> 由于我之前安装的时候最新版本是1.10版本，所以我上面对应的镜像都是1.10版本对应的镜像，现在阿里云对应的版本最新是1.10.3了，所以需要安装指定的版本，不然镜像会对应不上的

```shell
$ yum makecache fast && yum install -y kubelet-1.10.0-0 kubeadm-1.10.0-0 kubectl-1.10.0-0
```

## 配置 kubelet
安装完成后，我们还需要对`kubelet`进行配置，因为用`yum`源的方式安装的`kubelet`生成的配置文件将参数`--cgroup-driver`改成了`systemd`，而`docker`的`cgroup-driver`是`cgroupfs`，这二者必须一致才行，我们可以通过`docker info`命令查看：
```shell
$ docker info |grep Cgroup
Cgroup Driver: cgroupfs
```

修改文件`kubelet`的配置文件`/etc/systemd/system/kubelet.service.d/10-kubeadm.conf`，将其中的`KUBELET_CGROUP_ARGS`参数更改成`cgroupfs`：
```shell
Environment="KUBELET_CGROUP_ARGS=--cgroup-driver=cgroupfs"
```

另外还有一个问题是关于交换分区的，之前我们在[手动搭建高可用的kubernetes 集群](https://blog.qikqiak.com/post/manual-install-high-available-kubernetes-cluster/)一文中已经提到过，`Kubernetes`从1.8开始要求关闭系统的 Swap ，如果不关闭，默认配置的`kubelet`将无法启动，我们可以通过 kubelet 的启动参数`--fail-swap-on=false`更改这个限制，所以我们需要在上面的配置文件中增加一项配置(在`ExecStart`之前)：
```shell
Environment="KUBELET_EXTRA_ARGS=--fail-swap-on=false"
```
当然最好的还是将`swap`给关掉，这样能提高`kubelet`的性能。修改完成后，重新加载我们的配置文件即可：
```shell
$ systemctl daemon-reload
```

## 集群安装
### 初始化
到这里我们的准备工作就完成了，接下来我们就可以在`master`节点上用`kubeadm`命令来初始化我们的集群了：
```shell
$ kubeadm init --kubernetes-version=v1.10.0 --pod-network-cidr=10.244.0.0/16 --apiserver-advertise-address=10.151.30.57
```
命令非常简单，就是`kubeadm init`，后面的参数是需要安装的集群版本，因为我们这里选择`flannel`作为 Pod 的网络插件，所以需要指定`–pod-network-cidr=10.244.0.0/16`，然后是`apiserver`的通信地址，这里就是我们`master`节点的IP 地址。执行上面的命令，如果出现
`running with swap on is not supported. Please disable swap`之类的错误，则我们还需要增加一个参数`–ignore-preflight-errors=Swap`来忽略`swap`的错误提示信息：
```shell
$ kubeadm init \
   --kubernetes-version=v1.10.0 \
   --pod-network-cidr=10.244.0.0/16 \
   --apiserver-advertise-address=10.151.30.57 \
   --ignore-preflight-errors=Swap
[init] Using Kubernetes version: v1.10.0
[init] Using Authorization modes: [Node RBAC]
[preflight] Running pre-flight checks.
    [WARNING FileExisting-crictl]: crictl not found in system path
Suggestion: go get github.com/kubernetes-incubator/cri-tools/cmd/crictl
[preflight] Starting the kubelet service
[certificates] Generated ca certificate and key.
[certificates] Generated apiserver certificate and key.
[certificates] apiserver serving cert is signed for DNS names [ydzs-master1 kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local] and IPs [10.96.0.1 10.151.30.57]
[certificates] Generated apiserver-kubelet-client certificate and key.
[certificates] Generated etcd/ca certificate and key.
[certificates] Generated etcd/server certificate and key.
[certificates] etcd/server serving cert is signed for DNS names [localhost] and IPs [127.0.0.1]
[certificates] Generated etcd/peer certificate and key.
[certificates] etcd/peer serving cert is signed for DNS names [ydzs-master1] and IPs [10.151.30.57]
[certificates] Generated etcd/healthcheck-client certificate and key.
[certificates] Generated apiserver-etcd-client certificate and key.
[certificates] Generated sa key and public key.
[certificates] Generated front-proxy-ca certificate and key.
[certificates] Generated front-proxy-client certificate and key.
[certificates] Valid certificates and keys now exist in "/etc/kubernetes/pki"
[kubeconfig] Wrote KubeConfig file to disk: "/etc/kubernetes/admin.conf"
[kubeconfig] Wrote KubeConfig file to disk: "/etc/kubernetes/kubelet.conf"
[kubeconfig] Wrote KubeConfig file to disk: "/etc/kubernetes/controller-manager.conf"
[kubeconfig] Wrote KubeConfig file to disk: "/etc/kubernetes/scheduler.conf"
[controlplane] Wrote Static Pod manifest for component kube-apiserver to "/etc/kubernetes/manifests/kube-apiserver.yaml"
[controlplane] Wrote Static Pod manifest for component kube-controller-manager to "/etc/kubernetes/manifests/kube-controller-manager.yaml"
[controlplane] Wrote Static Pod manifest for component kube-scheduler to "/etc/kubernetes/manifests/kube-scheduler.yaml"
[etcd] Wrote Static Pod manifest for a local etcd instance to "/etc/kubernetes/manifests/etcd.yaml"
[init] Waiting for the kubelet to boot up the control plane as Static Pods from directory "/etc/kubernetes/manifests".
[init] This might take a minute or longer if the control plane images have to be pulled.
[apiclient] All control plane components are healthy after 22.007661 seconds
[uploadconfig] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[markmaster] Will mark node ydzs-master1 as master by adding a label and a taint
[markmaster] Master ydzs-master1 tainted and labelled with key/value: node-role.kubernetes.io/master=""
[bootstraptoken] Using token: 8xomlq.0cdf2pbvjs2gjho3
[bootstraptoken] Configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstraptoken] Configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstraptoken] Configured RBAC rules to allow certificate rotation for all node client certificates in the cluster
[bootstraptoken] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[addons] Applied essential addon: kube-dns
[addons] Applied essential addon: kube-proxy

Your Kubernetes master has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

You can now join any number of machines by running the following on each node
as root:

  kubeadm join 10.151.30.57:6443 --token 8xomlq.0cdf2pbvjs2gjho3 --discovery-token-ca-cert-hash sha256:92802317cb393682c1d1356c15e8b4ec8af2b8e5143ffd04d8be4eafb5fae368
```

上面的信息记录了`kubeadm`初始化整个集群的过程，生成相关的各种证书、`kubeconfig`文件、`bootstraptoken`等等，后边是使用`kubeadm join`往集群中添加节点时用到的命令，下面的命令是配置如何使用`kubectl`访问集群的方式：
  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config
最后给出了将节点加入集群的命令：
```shell
kubeadm join 10.151.30.57:6443 --token 8xomlq.0cdf2pbvjs2gjho3 --discovery-token-ca-cert-hash sha256:92802317cb393682c1d1356c15e8b4ec8af2b8e5143ffd04d8be4eafb5fae368
```
我们根据上面的提示配置好`kubectl`后，就可以使用`kubectl`来查看集群的信息了：
```shell
$ kubectl get cs
NAME                 STATUS    MESSAGE              ERROR
scheduler            Healthy   ok
controller-manager   Healthy   ok
etcd-0               Healthy   {"health": "true"}
$ kubectl get csr
NAME                                                   AGE       REQUESTOR                 CONDITION
node-csr-8qygb8Hjxj-byhbRHawropk81LHNPqZCTePeWoZs3-g   1h        system:bootstrap:8xomlq   Approved,Issued
$ kubectl get nodes
NAME           STATUS    ROLES     AGE       VERSION
ydzs-master1   Ready     master    3h        v1.10.0
```
如果你的集群安装过程中遇到了其他问题，我们可以使用下面的命令来进行重置：
```shell
$ kubeadm reset
$ ifconfig cni0 down && ip link delete cni0
$ ifconfig flannel.1 down && ip link delete flannel.1
$ rm -rf /var/lib/cni/
```

### 安装 Pod Network
接下来我们来安装`flannel`网络插件，很简单，和安装普通的`POD`没什么两样：
```shell
$ wget https://raw.githubusercontent.com/coreos/flannel/master/Documentation/kube-flannel.yml
$ kubectl apply -f  kube-flannel.yml
clusterrole.rbac.authorization.k8s.io "flannel" created
clusterrolebinding.rbac.authorization.k8s.io "flannel" created
serviceaccount "flannel" created
configmap "kube-flannel-cfg" created
daemonset.extensions "kube-flannel-ds" created
```
另外需要注意的是如果你的节点有多个网卡的话，需要在`kube-flannel.yml`中使用`--iface`参数指定集群主机内网网卡的名称，否则可能会出现dns无法解析。`flanneld`启动参数加上`--iface=<iface-name>`
```yaml
args:
- --ip-masq
- --kube-subnet-mgr
- --iface=eth0
```

安装完成后使用`kubectl get pods`命令可以查看到我们集群中的组件运行状态，如果都是`Running`状态的话，那么恭喜你，你的`master`节点安装成功了。
```shell
$ kubectl get pods --all-namespaces
NAMESPACE     NAME                                   READY     STATUS    RESTARTS   AGE
kube-system   etcd-ydzs-master1                      1/1       Running   0          10m
kube-system   kube-apiserver-ydzs-master1            1/1       Running   0          10m
kube-system   kube-controller-manager-ydzs-master1   1/1       Running   0          10m
kube-system   kube-dns-86f4d74b45-f5595              3/3       Running   0          10m
kube-system   kube-flannel-ds-qxjs2                  1/1       Running   0          1m
kube-system   kube-proxy-vf5fg                       1/1       Running   0          10m
kube-system   kube-scheduler-ydzs-master1            1/1       Running   0          10m
```

`kubeadm`初始化完成后，默认情况下`Pod`是不会被调度到`master`节点上的，所以现在还不能直接测试普通的`Pod`，需要添加一个工作节点后才可以。

### 添加节点
同样的上面的环境配置、docker 安装、kubeadmin、kubelet、kubectl 这些都在Node(10.151.30.62)节点安装配置好过后，我们就可以直接在 Node 节点上执行`kubeadm join`命令了（上面初始化的时候有），同样加上参数`--ignore-preflight-errors=Swap`:
```shell
$ kubeadm join 10.151.30.57:6443 --token 8xomlq.0cdf2pbvjs2gjho3 --discovery-token-ca-cert-hash sha256:92802317cb393682c1d1356c15e8b4ec8af2b8e5143ffd04d8be4eafb5fae368 --ignore-preflight-errors=Swap
[preflight] Running pre-flight checks.
    [WARNING Swap]: running with swap on is not supported. Please disable swap
    [WARNING FileExisting-crictl]: crictl not found in system path
Suggestion: go get github.com/kubernetes-incubator/cri-tools/cmd/crictl
[discovery] Trying to connect to API Server "10.151.30.57:6443"
[discovery] Created cluster-info discovery client, requesting info from "https://10.151.30.57:6443"
[discovery] Requesting info from "https://10.151.30.57:6443" again to validate TLS against the pinned public key
[discovery] Cluster info signature and contents are valid and TLS certificate validates against pinned roots, will use API Server "10.151.30.57:6443"
[discovery] Successfully established connection with API Server "10.151.30.57:6443"

This node has joined the cluster:
* Certificate signing request was sent to master and a response
  was received.
* The Kubelet was informed of the new secure connection details.

Run 'kubectl get nodes' on the master to see this node join the cluster.
```
我们可以看到该节点已经加入到集群中去了，然后我们把`master`节点的`~/.kube/config`文件拷贝到当前节点对应的位置即可使用`kubectl`命令行工具了。
```shell
$ kubectl get nodes
NAME           STATUS    ROLES     AGE       VERSION
evjfaxic       Ready     <none>    1h        v1.10.0
ydzs-master1   Ready     master    3h        v1.10.0
```

到这里就算我们的集群部署成功了，接下来就可以根据我们的需要安装一些附加的插件，比如 Dashboard、Heapster、Ingress-Controller等等，这些插件的安装方法就和我们之前手动安装集群的方式方法一样了，这里就不在重复了，有问题可以在下面留言讨论。

![kubeadm-dashboard](/img/posts/kubeadm-dashboard.png)


## 参考资料

* [https://kubernetes.io/docs/setup/independent/install-kubeadm/](https://kubernetes.io/docs/setup/independent/install-kubeadm/)
* [https://niuhp.github.io/k8s/kubeadm.html](https://niuhp.github.io/k8s/kubeadm.html)



下面是[基于1.9版本手动搭建高可用Kubernetes集群的视频教程](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)，对视频感兴趣的同学可以观看视频：
[![视频教程](/img/posts/k8s-install-pay-course.jpeg)](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)



