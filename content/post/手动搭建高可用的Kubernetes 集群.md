---
title: 手动搭建高可用的kubernetes 集群
date: 2017-11-06
tags: ["kubernetes", "高可用", "集群", "docker"]
keywords: ["kubernetes", "安装", "二进制", "高可用", "集群", "docker", "kubectl", "Haproxy", "Keepalived"]
slug: manual-install-high-available-kubernetes-cluster
gitcomment: true
toc: true
bigimg: [{src: "/img/posts/23164024_304744326693830_684783048734015488_n.jpg", desc: "Foggy weather on the coast + a chance encounter with wild horses"}]
category: "kubernetes"
---

之前按照[和我一步步部署 kubernetes 集群](https://github.com/opsnull/follow-me-install-kubernetes-cluster)的步骤一步一步的成功的使用二进制的方式安装了`kubernetes`集群，在该文档的基础上重新部署了最新的`v1.8.2`版本，实现了`kube-apiserver`的高可用、`traefik ingress` 的部署、在`kubernetes`上安装`docker`的私有仓库`harbor`、容器化`kubernetes`部分组建、使用阿里云日志服务收集日志。

部署完成后，你将理解系统各组件的交互原理，进而能快速解决实际问题，所以本文档主要适合于那些有一定`kubernetes`基础，想通过一步步部署的方式来学习和了解系统配置、运行原理的人。

本系列系文档适用于 `CentOS 7`、`Ubuntu 16.04` 及以上版本系统，由于启用了 `TLS` 双向认证、`RBAC` 授权等严格的安全机制，建议**从头开始部署**，否则可能会认证、授权等失败！

<!--more-->

> 有人问我为什么这么长的文章不分拆成几篇文章啊？这样阅读起来也方便啊，然而在我自己学习的过程中，这种整个一篇文章把一件事情从头到尾讲清楚的形式是最好的，能给读者提供一种`沉浸式`的学习体验，阅读完整个文章后有种`酣畅淋漓`的感觉，所以我选择这种一篇文章的形式。

另外我录制了[基于1.9版本手动搭建高可用Kubernetes集群的视频教程](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)，对视频感兴趣的同学可以观看视频：​
[![视频教程](/img/posts/k8s-install-pay-course.jpeg)](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

## 1. 组件版本 && 集群环境<a id="init-env"></a>

### 组件版本

* Kubernetes 1.8.2(1.9.x版本也可以，只有细微的差别)
* Docker 17.10.0-ce
* Etcd 3.2.9
* Flanneld
* TLS 认证通信（所有组件，如etcd、kubernetes master 和node）
* RBAC 授权
* kubelet TLS Bootstrapping
* kubedns、dashboard、heapster等插件
* harbor，使用nfs后端存储

### etcd 集群 && k8s master 机器 && k8s node 机器

* master01：192.168.1.137
* master02：192.168.1.138
* master03/node03：192.168.1.170
* 由于机器有限，所以我们将master03 也作为node 节点，后续有新的机器增加即可
* node01: 192.168.1.161
* node02: 192.168.1.162

### 集群环境变量

后面的嗯部署将会使用到的全局变量，定义如下（根据自己的机器、网络修改）：

```shell
# TLS Bootstrapping 使用的Token，可以使用命令 head -c 16 /dev/urandom | od -An -t x | tr -d ' ' 生成
BOOTSTRAP_TOKEN="8981b594122ebed7596f1d3b69c78223"

# 建议使用未用的网段来定义服务网段和Pod 网段
# 服务网段(Service CIDR)，部署前路由不可达，部署后集群内部使用IP:Port可达
SERVICE_CIDR="10.254.0.0/16"
# Pod 网段(Cluster CIDR)，部署前路由不可达，部署后路由可达(flanneld 保证)
CLUSTER_CIDR="172.30.0.0/16"

# 服务端口范围(NodePort Range)
NODE_PORT_RANGE="30000-32766"

# etcd集群服务地址列表
ETCD_ENDPOINTS="https://192.168.1.137:2379,https://192.168.1.138:2379,https://192.168.1.170:2379"

# flanneld 网络配置前缀
FLANNEL_ETCD_PREFIX="/kubernetes/network"

# kubernetes 服务IP(预先分配，一般为SERVICE_CIDR中的第一个IP)
CLUSTER_KUBERNETES_SVC_IP="10.254.0.1"

# 集群 DNS 服务IP(从SERVICE_CIDR 中预先分配)
CLUSTER_DNS_SVC_IP="10.254.0.2"

# 集群 DNS 域名
CLUSTER_DNS_DOMAIN="cluster.local."

# MASTER API Server 地址
MASTER_URL="k8s-api.virtual.local"
```

将上面变量保存为: **env.sh**，然后将脚本拷贝到所有机器的`/usr/k8s/bin`目录。

为方便后面迁移，我们在集群内定义一个域名用于访问`apiserver`，在每个节点的`/etc/hosts`文件中添加记录：**192.168.1.137 k8s-api.virtual.local k8s-api**

其中`192.168.1.137`为master01 的IP，暂时使用该IP 来做apiserver 的负载地址

> 如果你使用的是阿里云的ECS 服务，强烈建议你先将上述节点的安全组配置成允许所有访问，不然在安装过程中会遇到各种访问不了的问题，待集群配置成功以后再根据需要添加安全限制。

## 2. 创建CA 证书和密钥<a id="create-ca"></a>

`kubernetes` 系统各个组件需要使用`TLS`证书对通信进行加密，这里我们使用`CloudFlare`的PKI 工具集[cfssl](https://github.com/cloudflare/cfssl) 来生成Certificate Authority(CA) 证书和密钥文件， CA 是自签名的证书，用来签名后续创建的其他TLS 证书。

### 安装 CFSSL

```shell
$ wget https://pkg.cfssl.org/R1.2/cfssl_linux-amd64
$ chmod +x cfssl_linux-amd64
$ sudo mv cfssl_linux-amd64 /usr/k8s/bin/cfssl

$ wget https://pkg.cfssl.org/R1.2/cfssljson_linux-amd64
$ chmod +x cfssljson_linux-amd64
$ sudo mv cfssljson_linux-amd64 /usr/k8s/bin/cfssljson

$ wget https://pkg.cfssl.org/R1.2/cfssl-certinfo_linux-amd64
$ chmod +x cfssl-certinfo_linux-amd64
$ sudo mv cfssl-certinfo_linux-amd64 /usr/k8s/bin/cfssl-certinfo

$ export PATH=/usr/k8s/bin:$PATH
$ mkdir ssl && cd ssl
$ cfssl print-defaults config > config.json
$ cfssl print-defaults csr > csr.json
```

为了方便，将`/usr/k8s/bin`设置成环境变量，为了重启也有效，可以将上面的`export PATH=/usr/k8s/bin:$PATH`添加到`/etc/rc.local`文件中。

### 创建CA

修改上面创建的`config.json`文件为`ca-config.json`：

```shell
$ cat ca-config.json
{
    "signing": {
        "default": {
            "expiry": "87600h"
        },
        "profiles": {
            "kubernetes": {
                "expiry": "87600h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "server auth",
                    "client auth"
                ]
            }
        }
    }
}
```

* `config.json`：可以定义多个profiles，分别指定不同的过期时间、使用场景等参数；后续在签名证书时使用某个profile；
* `signing`: 表示该证书可用于签名其它证书；生成的ca.pem 证书中`CA=TRUE`；
* `server auth`: 表示client 可以用该CA 对server 提供的证书进行校验；
* `client auth`: 表示server 可以用该CA 对client 提供的证书进行验证。

修改CA 证书签名请求为`ca-csr.json`：

```shell
$ cat ca-csr.json
{
    "CN": "kubernetes",
    "key": {
        "algo": "rsa",
        "size": 2048
    },
    "names": [
        {
            "C": "CN",
            "L": "BeiJing",
            "ST": "BeiJing",
            "O": "k8s",
            "OU": "System"
        }
    ]
}
```

* `CN`: `Common Name`，kube-apiserver 从证书中提取该字段作为请求的用户名(User Name)；浏览器使用该字段验证网站是否合法；
* `O`: `Organization`，kube-apiserver 从证书中提取该字段作为请求用户所属的组(Group)；

生成CA 证书和私钥：

```shell
$ cfssl gencert -initca ca-csr.json | cfssljson -bare ca
$ ls ca*
$ ca-config.json  ca.csr  ca-csr.json  ca-key.pem  ca.pem
```

### 分发证书

将生成的CA 证书、密钥文件、配置文件拷贝到所有机器的`/etc/kubernetes/ssl`目录下面：

```shell
$ sudo mkdir -p /etc/kubernetes/ssl
$ sudo cp ca* /etc/kubernetes/ssl
```



## 3. 部署高可用etcd 集群<a id="etcd"></a>

kubernetes 系统使用`etcd`存储所有的数据，我们这里部署3个节点的etcd 集群，这3个节点直接复用kubernetes master的3个节点，分别命名为`etcd01`、`etcd02`、`etcd03`:

- etcd01：192.168.1.137
- etcd02：192.168.1.138
- etcd03：192.168.1.170

### 定义环境变量

使用到的变量如下：

```shell
$ export NODE_NAME=etcd01 # 当前部署的机器名称(随便定义，只要能区分不同机器即可)
$ export NODE_IP=192.168.1.137 # 当前部署的机器IP
$ export NODE_IPS="192.168.1.137 192.168.1.138 192.168.1.170" # etcd 集群所有机器 IP
$ # etcd 集群间通信的IP和端口
$ export ETCD_NODES=etcd01=https://192.168.1.137:2380,etcd02=https://192.168.1.138:2380,etcd03=https://192.168.1.170:2380
$ # 导入用到的其它全局变量：ETCD_ENDPOINTS、FLANNEL_ETCD_PREFIX、CLUSTER_CIDR
$ source /usr/k8s/bin/env.sh
```

### 下载etcd 二进制文件

到[https://github.com/coreos/etcd/releases](https://github.com/coreos/etcd/releases)页面下载最新版本的二进制文件：

```shell
$ wget https://github.com/coreos/etcd/releases/download/v3.2.9/etcd-v3.2.9-linux-amd64.tar.gz
$ tar -xvf etcd-v3.2.9-linux-amd64.tar.gz
$ sudo mv etcd-v3.2.9-linux-amd64/etcd* /usr/k8s/bin/
```

### 创建TLS 密钥和证书

为了保证通信安全，客户端(如etcdctl)与etcd 集群、etcd 集群之间的通信需要使用TLS 加密。

创建etcd 证书签名请求：

```shell
$ cat > etcd-csr.json <<EOF
{
  "CN": "etcd",
  "hosts": [
    "127.0.0.1",
    "${NODE_IP}"
  ],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

* `hosts` 字段指定授权使用该证书的`etcd`节点IP

生成`etcd`证书和私钥：

```shell
$ cfssl gencert -ca=/etc/kubernetes/ssl/ca.pem \
  -ca-key=/etc/kubernetes/ssl/ca-key.pem \
  -config=/etc/kubernetes/ssl/ca-config.json \
  -profile=kubernetes etcd-csr.json | cfssljson -bare etcd
$ ls etcd*
etcd.csr  etcd-csr.json  etcd-key.pem  etcd.pem
$ sudo mkdir -p /etc/etcd/ssl
$ sudo mv etcd*.pem /etc/etcd/ssl/
```

### 创建etcd 的systemd unit 文件

```shell
$ sudo mkdir -p /var/lib/etcd  # 必须要先创建工作目录
$ cat > etcd.service <<EOF
[Unit]
Description=Etcd Server
After=network.target
After=network-online.target
Wants=network-online.target
Documentation=https://github.com/coreos

[Service]
Type=notify
WorkingDirectory=/var/lib/etcd/
ExecStart=/usr/k8s/bin/etcd \\
  --name=${NODE_NAME} \\
  --cert-file=/etc/etcd/ssl/etcd.pem \\
  --key-file=/etc/etcd/ssl/etcd-key.pem \\
  --peer-cert-file=/etc/etcd/ssl/etcd.pem \\
  --peer-key-file=/etc/etcd/ssl/etcd-key.pem \\
  --trusted-ca-file=/etc/kubernetes/ssl/ca.pem \\
  --peer-trusted-ca-file=/etc/kubernetes/ssl/ca.pem \\
  --initial-advertise-peer-urls=https://${NODE_IP}:2380 \\
  --listen-peer-urls=https://${NODE_IP}:2380 \\
  --listen-client-urls=https://${NODE_IP}:2379,http://127.0.0.1:2379 \\
  --advertise-client-urls=https://${NODE_IP}:2379 \\
  --initial-cluster-token=etcd-cluster-0 \\
  --initial-cluster=${ETCD_NODES} \\
  --initial-cluster-state=new \\
  --data-dir=/var/lib/etcd
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

* 指定`etcd`的工作目录和数据目录为`/var/lib/etcd`，需要在启动服务前创建这个目录；
* 为了保证通信安全，需要指定etcd 的公私钥(cert-file和key-file)、Peers通信的公私钥和CA 证书(peer-cert-file、peer-key-file、peer-trusted-ca-file)、客户端的CA 证书(trusted-ca-file)；
* `--initial-cluster-state`值为`new`时，`--name`的参数值必须位于`--initial-cluster`列表中；

### 启动etcd 服务

```shell
$ sudo mv etcd.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable etcd
$ sudo systemctl start etcd
$ sudo systemctl status etcd
```

最先启动的etcd 进程会卡住一段时间，等待其他节点启动加入集群，在所有的etcd 节点重复上面的步骤，直到所有的机器etcd 服务都已经启动。

### 验证服务

部署完etcd 集群后，在任一etcd 节点上执行下面命令：

```shell
for ip in ${NODE_IPS}; do
  ETCDCTL_API=3 /usr/k8s/bin/etcdctl \
  --endpoints=https://${ip}:2379  \
  --cacert=/etc/kubernetes/ssl/ca.pem \
  --cert=/etc/etcd/ssl/etcd.pem \
  --key=/etc/etcd/ssl/etcd-key.pem \
  endpoint health; done
```

输出如下结果：

```shell
https://192.168.1.137:2379 is healthy: successfully committed proposal: took = 1.509032ms
https://192.168.1.138:2379 is healthy: successfully committed proposal: took = 1.639228ms
https://192.168.1.170:2379 is healthy: successfully committed proposal: took = 1.4152ms
```

可以看到上面的信息3个节点上的etcd 均为**healthy**，则表示集群服务正常。



## 4. 配置kubectl 命令行工具<a id="kubectl"></a>

`kubectl`默认从`~/.kube/config`配置文件中获取访问kube-apiserver 地址、证书、用户名等信息，需要正确配置该文件才能正常使用`kubectl`命令。

需要将下载的kubectl 二进制文件和生产的`~/.kube/config`配置文件拷贝到需要使用kubectl 命令的机器上。

> 很多童鞋说这个地方不知道在哪个节点上执行，`kubectl`只是一个和`kube-apiserver`进行交互的一个命令行工具，所以你想安装到那个节点都行，master或者node任意节点都可以，比如你先在master节点上安装，这样你就可以在master节点使用`kubectl`命令行工具了，如果你想在node节点上使用(当然安装的过程肯定会用到的)，你就把master上面的`kubectl`二进制文件和`~/.kube/config`文件拷贝到对应的node节点上就行了。

### 环境变量

```shell
$ source /usr/k8s/bin/env.sh
$ export KUBE_APISERVER="https://${MASTER_URL}:6443"
```

> 注意这里的`KUBE_APISERVER`地址，因为我们还没有安装`haproxy`，所以暂时需要手动指定使用`apiserver`的6443端口，等`haproxy`安装完成后就可以用使用443端口转发到6443端口去了。

* 变量KUBE_APISERVER 指定kubelet 访问的kube-apiserver 的地址，后续被写入`~/.kube/config`配置文件

### 下载kubectl

```shell
$ wget https://dl.k8s.io/v1.8.2/kubernetes-client-linux-amd64.tar.gz # 如果服务器上下载不下来，可以想办法下载到本地，然后scp上去即可
$ tar -xzvf kubernetes-client-linux-amd64.tar.gz
$ sudo cp kubernetes/client/bin/kube* /usr/k8s/bin/
$ sudo chmod a+x /usr/k8s/bin/kube*
$ export PATH=/usr/k8s/bin:$PATH
```

### 创建admin 证书

kubectl 与kube-apiserver 的安全端口通信，需要为安全通信提供TLS 证书和密钥。创建admin 证书签名请求：

```shell
$ cat > admin-csr.json <<EOF
{
  "CN": "admin",
  "hosts": [],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "system:masters",
      "OU": "System"
    }
  ]
}
EOF
```

* 后续`kube-apiserver`使用RBAC 对客户端(如kubelet、kube-proxy、Pod)请求进行授权
* `kube-apiserver` 预定义了一些RBAC 使用的RoleBindings，如cluster-admin 将Group `system:masters`与Role `cluster-admin`绑定，该Role 授予了调用`kube-apiserver`所有API 的权限
* O 指定了该证书的Group 为`system:masters`，kubectl使用该证书访问`kube-apiserver`时，由于证书被CA 签名，所以认证通过，同时由于证书用户组为经过预授权的`system:masters`，所以被授予访问所有API 的劝降
* hosts 属性值为空列表

生成admin 证书和私钥：

```shell
$ cfssl gencert -ca=/etc/kubernetes/ssl/ca.pem \
  -ca-key=/etc/kubernetes/ssl/ca-key.pem \
  -config=/etc/kubernetes/ssl/ca-config.json \
  -profile=kubernetes admin-csr.json | cfssljson -bare admin
$ ls admin
admin.csr  admin-csr.json  admin-key.pem  admin.pem
$ sudo mv admin*.pem /etc/kubernetes/ssl/
```

### 创建kubectl kubeconfig 文件

```shell
# 设置集群参数
$ kubectl config set-cluster kubernetes \
  --certificate-authority=/etc/kubernetes/ssl/ca.pem \
  --embed-certs=true \
  --server=${KUBE_APISERVER}
# 设置客户端认证参数
$ kubectl config set-credentials admin \
  --client-certificate=/etc/kubernetes/ssl/admin.pem \
  --embed-certs=true \
  --client-key=/etc/kubernetes/ssl/admin-key.pem \
  --token=${BOOTSTRAP_TOKEN}
# 设置上下文参数
$ kubectl config set-context kubernetes \
  --cluster=kubernetes \
  --user=admin
# 设置默认上下文
$ kubectl config use-context kubernetes
```

* `admin.pem`证书O 字段值为`system:masters`，`kube-apiserver` 预定义的 RoleBinding `cluster-admin` 将 Group `system:masters` 与 Role `cluster-admin` 绑定，该 Role 授予了调用`kube-apiserver` 相关 API 的权限
* 生成的kubeconfig 被保存到 `~/.kube/config` 文件

### 分发kubeconfig 文件

将`~/.kube/config`文件拷贝到运行`kubectl`命令的机器的`~/.kube/`目录下去。



## 5. 部署Flannel 网络<a id="flanneld"></a>

kubernetes 要求集群内各节点能通过Pod 网段互联互通，下面我们来使用Flannel 在所有节点上创建互联互通的Pod 网段的步骤。

> 需要在所有的Node节点安装。

### 环境变量

```shell
$ export NODE_IP=192.168.1.137  # 当前部署节点的IP
# 导入全局变量
$ source /usr/k8s/bin/env.sh
```

### 创建TLS 密钥和证书

etcd 集群启用了双向TLS 认证，所以需要为flanneld 指定与etcd 集群通信的CA 和密钥。

创建flanneld 证书签名请求：

```shell
$ cat > flanneld-csr.json <<EOF
{
  "CN": "flanneld",
  "hosts": [],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

生成flanneld 证书和私钥：

```shell
$ cfssl gencert -ca=/etc/kubernetes/ssl/ca.pem \
  -ca-key=/etc/kubernetes/ssl/ca-key.pem \
  -config=/etc/kubernetes/ssl/ca-config.json \
  -profile=kubernetes flanneld-csr.json | cfssljson -bare flanneld
$ ls flanneld*
flanneld.csr  flanneld-csr.json  flanneld-key.pem flanneld.pem
$ sudo mkdir -p /etc/flanneld/ssl
$ sudo mv flanneld*.pem /etc/flanneld/ssl
```

### 向etcd 写入集群Pod 网段信息

> 该步骤只需在第一次部署Flannel 网络时执行，后续在其他节点上部署Flanneld 时无需再写入该信息

```shell
$ etcdctl \
  --endpoints=${ETCD_ENDPOINTS} \
  --ca-file=/etc/kubernetes/ssl/ca.pem \
  --cert-file=/etc/flanneld/ssl/flanneld.pem \
  --key-file=/etc/flanneld/ssl/flanneld-key.pem \
  set ${FLANNEL_ETCD_PREFIX}/config '{"Network":"'${CLUSTER_CIDR}'", "SubnetLen": 24, "Backend": {"Type": "vxlan"}}'
# 得到如下反馈信息
{"Network":"172.30.0.0/16", "SubnetLen": 24, "Backend": {"Type": "vxlan"}}
```

* 写入的 Pod 网段(${CLUSTER_CIDR}，172.30.0.0/16) 必须与`kube-controller-manager` 的 `--cluster-cidr` 选项值一致；

### 安装和配置flanneld

前往[flanneld release](https://github.com/coreos/flannel/releases)页面下载最新版的flanneld 二进制文件：

```shell
$ mkdir flannel
$ wget https://github.com/coreos/flannel/releases/download/v0.9.0/flannel-v0.9.0-linux-amd64.tar.gz
$ tar -xzvf flannel-v0.9.0-linux-amd64.tar.gz -C flannel
$ sudo cp flannel/{flanneld,mk-docker-opts.sh} /usr/k8s/bin
```

创建flanneld的systemd unit 文件

```shell
$ cat > flanneld.service << EOF
[Unit]
Description=Flanneld overlay address etcd agent
After=network.target
After=network-online.target
Wants=network-online.target
After=etcd.service
Before=docker.service

[Service]
Type=notify
ExecStart=/usr/k8s/bin/flanneld \\
  -etcd-cafile=/etc/kubernetes/ssl/ca.pem \\
  -etcd-certfile=/etc/flanneld/ssl/flanneld.pem \\
  -etcd-keyfile=/etc/flanneld/ssl/flanneld-key.pem \\
  -etcd-endpoints=${ETCD_ENDPOINTS} \\
  -etcd-prefix=${FLANNEL_ETCD_PREFIX}
ExecStartPost=/usr/k8s/bin/mk-docker-opts.sh -k DOCKER_NETWORK_OPTIONS -d /run/flannel/docker
Restart=on-failure

[Install]
WantedBy=multi-user.target
RequiredBy=docker.service
EOF
```

* `mk-docker-opts.sh`脚本将分配给flanneld 的Pod 子网网段信息写入到`/run/flannel/docker` 文件中，后续docker 启动时使用这个文件中的参数值为 docker0 网桥
* flanneld 使用系统缺省路由所在的接口和其他节点通信，对于有多个网络接口的机器(内网和公网)，可以用 `--iface` 选项值指定通信接口(上面的 systemd unit 文件没指定这个选项)

### 启动flanneld

```shell
$ sudo cp flanneld.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable flanneld
$ sudo systemctl start flanneld
$ systemctl status flanneld
```

### 检查flanneld 服务

```shell
ifconfig flannel.1
```

### 检查分配给各flanneld 的Pod 网段信息

```shell
$ # 查看集群 Pod 网段(/16)
$ etcdctl \
  --endpoints=${ETCD_ENDPOINTS} \
  --ca-file=/etc/kubernetes/ssl/ca.pem \
  --cert-file=/etc/flanneld/ssl/flanneld.pem \
  --key-file=/etc/flanneld/ssl/flanneld-key.pem \
  get ${FLANNEL_ETCD_PREFIX}/config
{ "Network": "172.30.0.0/16", "SubnetLen": 24, "Backend": { "Type": "vxlan" } }
$ # 查看已分配的 Pod 子网段列表(/24)
$ etcdctl \
  --endpoints=${ETCD_ENDPOINTS} \
  --ca-file=/etc/kubernetes/ssl/ca.pem \
  --cert-file=/etc/flanneld/ssl/flanneld.pem \
  --key-file=/etc/flanneld/ssl/flanneld-key.pem \
  ls ${FLANNEL_ETCD_PREFIX}/subnets
/kubernetes/network/subnets/172.30.77.0-24
$ # 查看某一 Pod 网段对应的 flanneld 进程监听的 IP 和网络参数
$ etcdctl \
  --endpoints=${ETCD_ENDPOINTS} \
  --ca-file=/etc/kubernetes/ssl/ca.pem \
  --cert-file=/etc/flanneld/ssl/flanneld.pem \
  --key-file=/etc/flanneld/ssl/flanneld-key.pem \
  get ${FLANNEL_ETCD_PREFIX}/subnets/172.30.77.0-24
{"PublicIP":"192.168.1.137","BackendType":"vxlan","BackendData":{"VtepMAC":"62:fc:03:83:1b:2b"}}
```

### 确保各节点间Pod 网段能互联互通

在各个节点部署完Flanneld 后，查看已分配的Pod 子网段列表：

```shell
$ etcdctl \
  --endpoints=${ETCD_ENDPOINTS} \
  --ca-file=/etc/kubernetes/ssl/ca.pem \
  --cert-file=/etc/flanneld/ssl/flanneld.pem \
  --key-file=/etc/flanneld/ssl/flanneld-key.pem \
  ls ${FLANNEL_ETCD_PREFIX}/subnets

/kubernetes/network/subnets/172.30.19.0-24
/kubernetes/network/subnets/172.30.30.0-24
/kubernetes/network/subnets/172.30.77.0-24
/kubernetes/network/subnets/172.30.41.0-24
/kubernetes/network/subnets/172.30.83.0-24
```

当前五个节点分配的 Pod 网段分别是：172.30.77.0-24、172.30.30.0-24、172.30.19.0-24、172.30.41.0-24、172.30.83.0-24。



## 6. 部署master 节点<a id="master"></a>

kubernetes master 节点包含的组件有：

* kube-apiserver
* kube-scheduler
* kube-controller-manager

目前这3个组件需要部署到同一台机器上：（后面再部署高可用的master）

- `kube-scheduler`、`kube-controller-manager` 和 `kube-apiserver` 三者的功能紧密相关；
- 同时只能有一个 `kube-scheduler`、`kube-controller-manager` 进程处于工作状态，如果运行多个，则需要通过选举产生一个 leader；

master 节点与node 节点上的Pods 通过Pod 网络通信，所以需要在master 节点上部署Flannel 网络。

### 环境变量

```shell
$ export NODE_IP=192.168.1.137  # 当前部署的master 机器IP
$ source /usr/k8s/bin/env.sh
```

### 下载最新版本的二进制文件

在[kubernetes changelog](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG-1.8.md#server-binaries) 页面下载最新版本的文件：

```shell
$ wget https://dl.k8s.io/v1.8.2/kubernetes-server-linux-amd64.tar.gz
$ tar -xzvf kubernetes-server-linux-amd64.tar.gz
```

将二进制文件拷贝到`/usr/k8s/bin`目录

```shell
$ sudo cp -r server/bin/{kube-apiserver,kube-controller-manager,kube-scheduler} /usr/k8s/bin/
```

### 创建kubernetes 证书

创建kubernetes 证书签名请求：

```shell
$ cat > kubernetes-csr.json <<EOF
{
  "CN": "kubernetes",
  "hosts": [
    "127.0.0.1",
    "${NODE_IP}",
    "${MASTER_URL}",
    "${CLUSTER_KUBERNETES_SVC_IP}",
    "kubernetes",
    "kubernetes.default",
    "kubernetes.default.svc",
    "kubernetes.default.svc.cluster",
    "kubernetes.default.svc.cluster.local"
  ],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

- 如果 hosts 字段不为空则需要指定授权使用该证书的 **IP 或域名列表**，所以上面分别指定了当前部署的 master 节点主机 IP 以及apiserver 负载的内部域名
- 还需要添加 kube-apiserver 注册的名为 `kubernetes` 的服务 IP (Service Cluster IP)，一般是 kube-apiserver `--service-cluster-ip-range` 选项值指定的网段的**第一个IP**，如 "10.254.0.1"

生成kubernetes 证书和私钥：

```shell
$ cfssl gencert -ca=/etc/kubernetes/ssl/ca.pem \
  -ca-key=/etc/kubernetes/ssl/ca-key.pem \
  -config=/etc/kubernetes/ssl/ca-config.json \
  -profile=kubernetes kubernetes-csr.json | cfssljson -bare kubernetes
$ ls kubernetes*
kubernetes.csr  kubernetes-csr.json  kubernetes-key.pem  kubernetes.pem
$ sudo mkdir -p /etc/kubernetes/ssl/
$ sudo mv kubernetes*.pem /etc/kubernetes/ssl/
```

### 6.1 配置和启动kube-apiserver

#### 创建kube-apiserver 使用的客户端token 文件

kubelet 首次启动时向kube-apiserver 发送TLS Bootstrapping 请求，kube-apiserver 验证请求中的token 是否与它配置的token.csv 一致，如果一致则自动为kubelet 生成证书和密钥。

```shell
$ # 导入的 environment.sh 文件定义了 BOOTSTRAP_TOKEN 变量
$ cat > token.csv <<EOF
${BOOTSTRAP_TOKEN},kubelet-bootstrap,10001,"system:kubelet-bootstrap"
EOF
$ sudo mv token.csv /etc/kubernetes/
```

#### 创建kube-apiserver 的systemd unit文件

```shell
$ cat  > kube-apiserver.service <<EOF
[Unit]
Description=Kubernetes API Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target

[Service]
ExecStart=/usr/k8s/bin/kube-apiserver \\
  --admission-control=NamespaceLifecycle,LimitRanger,ServiceAccount,DefaultStorageClass,ResourceQuota \\
  --advertise-address=${NODE_IP} \\
  --bind-address=0.0.0.0 \\
  --insecure-bind-address=${NODE_IP} \\
  --authorization-mode=Node,RBAC \\
  --runtime-config=rbac.authorization.k8s.io/v1alpha1 \\
  --kubelet-https=true \\
  --experimental-bootstrap-token-auth \\
  --token-auth-file=/etc/kubernetes/token.csv \\
  --service-cluster-ip-range=${SERVICE_CIDR} \\
  --service-node-port-range=${NODE_PORT_RANGE} \\
  --tls-cert-file=/etc/kubernetes/ssl/kubernetes.pem \\
  --tls-private-key-file=/etc/kubernetes/ssl/kubernetes-key.pem \\
  --client-ca-file=/etc/kubernetes/ssl/ca.pem \\
  --service-account-key-file=/etc/kubernetes/ssl/ca-key.pem \\
  --etcd-cafile=/etc/kubernetes/ssl/ca.pem \\
  --etcd-certfile=/etc/kubernetes/ssl/kubernetes.pem \\
  --etcd-keyfile=/etc/kubernetes/ssl/kubernetes-key.pem \\
  --etcd-servers=${ETCD_ENDPOINTS} \\
  --enable-swagger-ui=true \\
  --allow-privileged=true \\
  --apiserver-count=2 \\
  --audit-log-maxage=30 \\
  --audit-log-maxbackup=3 \\
  --audit-log-maxsize=100 \\
  --audit-log-path=/var/lib/audit.log \\
  --audit-policy-file=/etc/kubernetes/audit-policy.yaml \\
  --event-ttl=1h \\
  --logtostderr=true \\
  --v=6
Restart=on-failure
RestartSec=5
Type=notify
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

- 如果你安装的是**1.9.x**版本的，一定要记住上面的参数`experimental-bootstrap-token-auth`，需要替换成`enable-bootstrap-token-auth`，因为这个参数在**1.9.x**里面已经废弃掉了
- kube-apiserver 1.6 版本开始使用 etcd v3 API 和存储格式
- `--authorization-mode=RBAC` 指定在安全端口使用RBAC 授权模式，拒绝未通过授权的请求
- kube-scheduler、kube-controller-manager 一般和 kube-apiserver 部署在同一台机器上，它们使用**非安全端口**和 kube-apiserver通信
- kubelet、kube-proxy、kubectl 部署在其它 Node 节点上，如果通过**安全端口**访问 kube-apiserver，则必须先通过 TLS 证书认证，再通过 RBAC 授权
- kube-proxy、kubectl 通过使用证书里指定相关的 User、Group 来达到通过 RBAC 授权的目的
- 如果使用了 kubelet TLS Boostrap 机制，则不能再指定 `--kubelet-certificate-authority`、`--kubelet-client-certificate` 和 `--kubelet-client-key` 选项，否则后续 kube-apiserver 校验 kubelet 证书时出现 ”x509: certificate signed by unknown authority“ 错误
- `--admission-control` 值必须包含 `ServiceAccount`，否则部署集群插件时会失败
- `--bind-address` 不能为 `127.0.0.1`
- `--service-cluster-ip-range` 指定 Service Cluster IP 地址段，该地址段不能路由可达
- `--service-node-port-range=${NODE_PORT_RANGE}` 指定 NodePort 的端口范围
- 缺省情况下 kubernetes 对象保存在`etcd/registry` 路径下，可以通过 `--etcd-prefix` 参数进行调整
- kube-apiserver 1.8版本后需要在`--authorization-mode`参数中添加`Node`，即：`--authorization-mode=Node,RBAC`，否则Node 节点无法注册
- 注意要开启审查日志功能，指定`--audit-log-path`参数是不够的，这只是指定了日志的路径，还需要指定一个审查日志策略文件：`--audit-policy-file`，我们也可以使用日志收集工具收集相关的日志进行分析。

审查日志策略文件内容如下：（**/etc/kubernetes/audit-policy.yaml**）
```yaml
apiVersion: audit.k8s.io/v1beta1 # This is required.
kind: Policy
# Don't generate audit events for all requests in RequestReceived stage.
omitStages:
  - "RequestReceived"
rules:
  # Log pod changes at RequestResponse level
  - level: RequestResponse
    resources:
    - group: ""
      # Resource "pods" doesn't match requests to any subresource of pods,
      # which is consistent with the RBAC policy.
      resources: ["pods"]
  # Log "pods/log", "pods/status" at Metadata level
  - level: Metadata
    resources:
    - group: ""
      resources: ["pods/log", "pods/status"]

  # Don't log requests to a configmap called "controller-leader"
  - level: None
    resources:
    - group: ""
      resources: ["configmaps"]
      resourceNames: ["controller-leader"]

  # Don't log watch requests by the "system:kube-proxy" on endpoints or services
  - level: None
    users: ["system:kube-proxy"]
    verbs: ["watch"]
    resources:
    - group: "" # core API group
      resources: ["endpoints", "services"]

  # Don't log authenticated requests to certain non-resource URL paths.
  - level: None
    userGroups: ["system:authenticated"]
    nonResourceURLs:
    - "/api*" # Wildcard matching.
    - "/version"

  # Log the request body of configmap changes in kube-system.
  - level: Request
    resources:
    - group: "" # core API group
      resources: ["configmaps"]
    # This rule only applies to resources in the "kube-system" namespace.
    # The empty string "" can be used to select non-namespaced resources.
    namespaces: ["kube-system"]

  # Log configmap and secret changes in all other namespaces at the Metadata level.
  - level: Metadata
    resources:
    - group: "" # core API group
      resources: ["secrets", "configmaps"]

  # Log all other resources in core and extensions at the Request level.
  - level: Request
    resources:
    - group: "" # core API group
    - group: "extensions" # Version of group should NOT be included.

  # A catch-all rule to log all other requests at the Metadata level.
  - level: Metadata
    # Long-running requests like watches that fall under this rule will not
    # generate an audit event in RequestReceived.
    omitStages:
      - "RequestReceived"
```
审查日志的相关配置可以查看文档了解：[https://kubernetes.io/docs/tasks/debug-application-cluster/audit/](https://kubernetes.io/docs/tasks/debug-application-cluster/audit/)

#### 启动kube-apiserver

```shell
$ sudo cp kube-apiserver.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable kube-apiserver
$ sudo systemctl start kube-apiserver
$ sudo systemctl status kube-apiserver
```

### 6.2 配置和启动kube-controller-manager

#### 创建kube-controller-manager 的systemd unit 文件

```shell
$ cat > kube-controller-manager.service <<EOF
[Unit]
Description=Kubernetes Controller Manager
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
ExecStart=/usr/k8s/bin/kube-controller-manager \\
  --address=127.0.0.1 \\
  --master=http://${MASTER_URL}:8080 \\
  --allocate-node-cidrs=true \\
  --service-cluster-ip-range=${SERVICE_CIDR} \\
  --cluster-cidr=${CLUSTER_CIDR} \\
  --cluster-name=kubernetes \\
  --cluster-signing-cert-file=/etc/kubernetes/ssl/ca.pem \\
  --cluster-signing-key-file=/etc/kubernetes/ssl/ca-key.pem \\
  --service-account-private-key-file=/etc/kubernetes/ssl/ca-key.pem \\
  --root-ca-file=/etc/kubernetes/ssl/ca.pem \\
  --leader-elect=true \\
  --v=2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

* `--address` 值必须为 `127.0.0.1`，因为当前 kube-apiserver 期望 scheduler 和 controller-manager 在同一台机器

- `--master=http://${MASTER_URL}:8080`：使用`http`(非安全端口)与 kube-apiserver 通信，需要下面的`haproxy`安装成功后才能去掉8080端口。
- `--cluster-cidr` 指定 Cluster 中 Pod 的 CIDR 范围，该网段在各 Node 间必须路由可达(flanneld保证)
- `--service-cluster-ip-range` 参数指定 Cluster 中 Service 的CIDR范围，该网络在各 Node 间必须路由不可达，必须和 kube-apiserver 中的参数一致
- `--cluster-signing-*` 指定的证书和私钥文件用来签名为 TLS BootStrap 创建的证书和私钥
- `--root-ca-file` 用来对 kube-apiserver 证书进行校验，**指定该参数后，才会在Pod 容器的 ServiceAccount 中放置该 CA 证书文件**
- `--leader-elect=true` 部署多台机器组成的 master 集群时选举产生一处于工作状态的 `kube-controller-manager` 进程

#### 启动kube-controller-manager

```shell
$ sudo cp kube-controller-manager.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable kube-controller-manager
$ sudo systemctl start kube-controller-manager
$ sudo systemctl status kube-controller-manager
```

### 6.3 配置和启动kube-scheduler

#### 创建kube-scheduler 的systemd unit文件

```shell
$ cat > kube-scheduler.service <<EOF
[Unit]
Description=Kubernetes Scheduler
Documentation=https://github.com/GoogleCloudPlatform/kubernetes

[Service]
ExecStart=/usr/k8s/bin/kube-scheduler \\
  --address=127.0.0.1 \\
  --master=http://${MASTER_URL}:8080 \\
  --leader-elect=true \\
  --v=2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

- `--address` 值必须为 `127.0.0.1`，因为当前 kube-apiserver 期望 scheduler 和 controller-manager 在同一台机器
- `--master=http://${MASTER_URL}:8080`：使用`http`(非安全端口)与 kube-apiserver 通信，需要下面的`haproxy`启动成功后才能去掉8080端口
- `--leader-elect=true` 部署多台机器组成的 master 集群时选举产生一处于工作状态的 `kube-controller-manager` 进程

#### 启动kube-scheduler

```shell
$ sudo cp kube-scheduler.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable kube-scheduler
$ sudo systemctl start kube-scheduler
$ sudo systemctl status kube-scheduler
```

### 6.4 验证master 节点

```shell
$ kubectl get componentstatuses
NAME                 STATUS    MESSAGE              ERROR
scheduler            Healthy   ok
controller-manager   Healthy   ok
etcd-1               Healthy   {"health": "true"}
etcd-2               Healthy   {"health": "true"}
etcd-0               Healthy   {"health": "true"}
```



## 7. kube-apiserver 高可用<a id="ha"></a>

按照上面的方式在`master01`与`master02`机器上安装`kube-apiserver`、`kube-controller-manager`、`kube-scheduler`，但是现在我们还是手动指定访问的6443和8080端口的，因为我们的域名`k8s-api.virtual.local`对应的`master01`节点直接通过http 和https 还不能访问，这里我们使用`haproxy` 来代替请求。

> 明白什么意思吗？就是我们需要将http默认的80端口请求转发到`apiserver`的8080端口，将https默认的443端口请求转发到`apiserver`的6443端口，所以我们这里使用`haproxy`来做请求转发。

### 安装haproxy

```shell
$ yum install -y haproxy
```

### 配置haproxy

由于集群内部有的组建是通过非安全端口访问apiserver 的，有的是通过安全端口访问apiserver 的，所以我们要配置http 和https 两种代理方式，配置文件 `/etc/haproxy/haproxy.cfg`：

```shell
listen stats
  bind    *:9000
  mode    http
  stats   enable
  stats   hide-version
  stats   uri       /stats
  stats   refresh   30s
  stats   realm     Haproxy\ Statistics
  stats   auth      Admin:Password

frontend k8s-api
    bind 192.168.1.137:443
    mode tcp
    option tcplog
    tcp-request inspect-delay 5s
    tcp-request content accept if { req.ssl_hello_type 1 }
    default_backend k8s-api

backend k8s-api
    mode tcp
    option tcplog
    option tcp-check
    balance roundrobin
    default-server inter 10s downinter 5s rise 2 fall 2 slowstart 60s maxconn 250 maxqueue 256 weight 100
    server k8s-api-1 192.168.1.137:6443 check
    server k8s-api-2 192.168.1.138:6443 check

frontend k8s-http-api
    bind 192.168.1.137:80
    mode tcp
    option tcplog
    default_backend k8s-http-api

backend k8s-http-api
    mode tcp
    option tcplog
    option tcp-check
    balance roundrobin
    default-server inter 10s downinter 5s rise 2 fall 2 slowstart 60s maxconn 250 maxqueue 256 weight 100
    server k8s-http-api-1 192.168.1.137:8080 check
    server k8s-http-api-2 192.168.1.138:8080 check
```

通过上面的配置文件我们可以看出通过`https`的访问将请求转发给apiserver 的6443端口了，http的请求转发到了apiserver 的8080端口。

### 启动haproxy

```shell
$ sudo systemctl start haproxy
$ sudo systemctl enable haproxy
$ sudo systemctl status haproxy
```

然后我们可以通过上面`9000`端口监控我们的`haproxy`的运行状态(`192.168.1.137:9000/stats`):

![haproxy stats](/img/posts/1510279991107.jpg)

### 问题

上面我们的`haproxy`的确可以代理我们的两个master 上的apiserver 了，但是还不是高可用的，如果master01 这个节点down 掉了，那么我们haproxy 就不能正常提供服务了。这里我们可以使用两种方法来实现高可用

#### 方式1：使用阿里云SLB

这种方式实际上是最省心的，在阿里云上建一个内网的SLB，将master01 与master02 添加到SLB 机器组中，转发80(http)和443(https)端口即可（注意下面的提示）

> 注意：阿里云的负载均衡是四层TCP负责，不支持后端ECS实例既作为Real Server又作为客户端向所在的负载均衡实例发送请求。因为返回的数据包只在云服务器内部转发，不经过负载均衡，所以在后端ECS实例上去访问负载均衡的服务地址是不通的。什么意思？就是如果你要使用阿里云的SLB的话，那么你不能在`apiserver`节点上使用SLB（比如在apiserver 上安装kubectl，然后将apiserver的地址设置为SLB的负载地址使用），因为这样的话就可能造成回环了，所以简单的做法是另外用两个新的节点做`HA`实例，然后将这两个实例添加到`SLB` 机器组中。

#### 方式2：使用keepalived

`KeepAlived` 是一个高可用方案，通过 VIP（即虚拟 IP）和心跳检测来实现高可用。其原理是存在一组（两台）服务器，分别赋予 Master、Backup 两个角色，默认情况下Master 会绑定VIP 到自己的网卡上，对外提供服务。Master、Backup 会在一定的时间间隔向对方发送心跳数据包来检测对方的状态，这个时间间隔一般为 2 秒钟，如果Backup 发现Master 宕机，那么Backup 会发送ARP 包到网关，把VIP 绑定到自己的网卡，此时Backup 对外提供服务，实现自动化的故障转移，当Master 恢复的时候会重新接管服务。非常类似于路由器中的虚拟路由器冗余协议（VRRP）

开启路由转发，这里我们定义虚拟IP为：**192.168.1.139**

```shell
$ vi /etc/sysctl.conf
# 添加以下内容
net.ipv4.ip_forward = 1
net.ipv4.ip_nonlocal_bind = 1

# 验证并生效
$ sysctl -p
# 验证是否生效
$ cat /proc/sys/net/ipv4/ip_forward
1
```

安装`keepalived`:

```shell
$ yum install -y keepalived
```

我们这里将master01 设置为Master，master02 设置为Backup，修改配置：

```shell
$ vi /etc/keepalived/keepalived.conf
! Configuration File for keepalived

global_defs {
   notification_email {
   }
   router_id kube_api
}

vrrp_script check_haproxy {
    # 自身状态检测
    script "killall -0 haproxy"
    interval 3
    weight 5
}

vrrp_instance haproxy-vip {
    # 使用单播通信，默认是组播通信
    unicast_src_ip 192.168.1.137
    unicast_peer {
        192.168.1.138
    }
    # 初始化状态
    state MASTER
    # 虚拟ip 绑定的网卡 （这里根据你自己的实际情况选择网卡）
    interface eth0
    # 此ID 要与Backup 配置一致
    virtual_router_id 51
    # 默认启动优先级，要比Backup 大点，但要控制量，保证自身状态检测生效
    priority 100
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass 1111
    }
    virtual_ipaddress {
        # 虚拟ip 地址
        192.168.1.139
    }
    track_script {
        check_haproxy
    }
}

virtual_server 192.168.1.139 80 {
  delay_loop 5
  lvs_sched wlc
  lvs_method NAT
  persistence_timeout 1800
  protocol TCP

  real_server 192.168.1.137 80 {
    weight 1
    TCP_CHECK {
      connect_port 80
      connect_timeout 3
    }
  }
}

virtual_server 192.168.1.139 443 {
  delay_loop 5
  lvs_sched wlc
  lvs_method NAT
  persistence_timeout 1800
  protocol TCP

  real_server 192.168.1.137 443 {
    weight 1
    TCP_CHECK {
      connect_port 443
      connect_timeout 3
    }
  }
}

```

统一的方式在master02 节点上安装keepalived，修改配置，只需要将state 更改成BACKUP，priority更改成99，unicast_src_ip 与unicast_peer 地址修改即可。

启动keepalived:

```shell
$ systemctl start keepalived
$ systemctl enable keepalived
# 查看日志
$ journalctl -f -u keepalived
```

验证虚拟IP:

```shell
# 使用ifconfig -a 命令查看不到，要使用ip addr
$ ip addr
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP qlen 1000
    link/ether 00:16:3e:00:55:c1 brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.137/24 brd 192.168.1.255 scope global dynamic eth0
       valid_lft 31447746sec preferred_lft 31447746sec
    inet 192.168.1.139/24 brd 192.168.1.255 scope global secondary eth0-vip
       valid_lft forever preferred_lft forever
```

> 到这里，我们就可以将上面的6443端口和8080端口去掉了，可以手动将`kubectl`生成的`config`文件(`~/.kube/config`)中的server 地址6443端口去掉，另外`kube-controller-manager`和`kube-scheduler`的**--master**参数中的8080端口去掉了，然后分别重启这两个组件即可。

验证apiserver：关闭master01 节点上的kube-apiserver 进程，然后查看虚拟ip是否漂移到了master02 节点。

然后我们就可以将第一步在`/etc/hosts`里面设置的域名对应的IP 更改为我们的虚拟IP了

> master01 与master 02 节点都需要安装keepalived 和haproxy，实际上我们虚拟IP的自身检测应该是检测haproxy，脚本大家可以自行更改

![kube-apiserver ha](/img/posts/apiserver-ha.png)

这样我们就实现了接入层apiserver 的高可用了，一个部分是多活的apiserver 服务，另一个部分是一主一备的haproxy 服务。

### kube-controller-manager 和kube-scheduler 的高可用

Kubernetes 的管理层服务包括`kube-scheduler`和`kube-controller-manager`。kube-scheduler和kube-controller-manager使用一主多从的高可用方案，在**同一时刻只允许一个服务**处以具体的任务。Kubernetes中实现了一套简单的选主逻辑，依赖Etcd实现scheduler和controller-manager的选主功能。如果scheduler和controller-manager在启动的时候设置了`leader-elect`参数，它们在启动后会先尝试获取leader节点身份，只有在获取leader节点身份后才可以执行具体的业务逻辑。它们分别会在Etcd中创建kube-scheduler和kube-controller-manager的endpoint，endpoint的信息中记录了当前的leader节点信息，以及记录的上次更新时间。leader节点会定期更新endpoint的信息，维护自己的leader身份。每个从节点的服务都会定期检查endpoint的信息，如果endpoint的信息在时间范围内没有更新，它们会尝试更新自己为leader节点。scheduler服务以及controller-manager服务之间不会进行通信，利用Etcd的强一致性，能够保证在分布式高并发情况下leader节点的全局唯一性。整体方案如下图所示：

![img](/img/posts/1498099870616.png)

当集群中的leader节点服务异常后，其它节点的服务会尝试更新自身为leader节点，当有多个节点同时更新endpoint时，由Etcd保证只有一个服务的更新请求能够成功。通过这种机制sheduler和controller-manager可以保证在leader节点宕机后其它的节点可以顺利选主，保证服务故障后快速恢复。当集群中的网络出现故障时对服务的选主影响不是很大，因为scheduler和controller-manager是依赖Etcd进行选主的，在网络故障后，可以和Etcd通信的主机依然可以按照之前的逻辑进行选主，就算集群被切分，Etcd也可以保证同一时刻只有一个节点的服务处于leader状态。



## 8. 部署Node 节点<a id="node"></a>

kubernetes Node 节点包含如下组件：

* flanneld
* docker
* kubelet
* kube-proxy

### 环境变量

```shell
$ source /usr/k8s/bin/env.sh
$ export KUBE_APISERVER="https://${MASTER_URL}"  // 如果你没有安装`haproxy`的话，还是需要使用6443端口的哦
$ export NODE_IP=192.168.1.170  # 当前部署的节点 IP
```

按照上面的步骤安装配置好flanneld


### 开启路由转发
修改`/etc/sysctl.conf`文件，添加下面的规则：
```shell
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-iptables=1
net.bridge.bridge-nf-call-ip6tables=1
```
执行下面的命令立即生效：
```shell
$ sysctl -p
```

### 配置docker

你可以用二进制或yum install 的方式来安装docker，然后修改docker 的systemd unit 文件：

```shell
$ cat /usr/lib/systemd/system/docker.service  # 用systemctl status docker 命令可查看unit 文件路径
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service
Wants=network-online.target

[Service]
Type=notify
# the default is not to use systemd for cgroups because the delegate issues still
# exists and systemd currently does not support the cgroup feature set required
# for containers run by docker
EnvironmentFile=-/run/flannel/docker
ExecStart=/usr/bin/dockerd --log-level=info $DOCKER_NETWORK_OPTIONS
ExecReload=/bin/kill -s HUP $MAINPID
# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
# Uncomment TasksMax if your systemd version supports it.
# Only systemd 226 and above support this version.
#TasksMax=infinity
TimeoutStartSec=0
# set delegate yes so that systemd does not reset the cgroups of docker containers
Delegate=yes
# kill only the docker process, not all processes in the cgroup
KillMode=process
# restart the docker process if it exits prematurely
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
```

- dockerd 运行时会调用其它 docker 命令，如 docker-proxy，所以需要将 docker 命令所在的目录加到 PATH 环境变量中

- flanneld 启动时将网络配置写入到 `/run/flannel/docker` 文件中的变量 `DOCKER_NETWORK_OPTIONS`，dockerd 命令行上指定该变量值来设置 docker0 网桥参数

- 如果指定了多个 `EnvironmentFile` 选项，则必须将 `/run/flannel/docker` 放在最后(确保 docker0 使用 flanneld 生成的 bip 参数)

- 不能关闭默认开启的 `--iptables` 和 `--ip-masq` 选项

- 如果内核版本比较新，建议使用 `overlay` 存储驱动

- docker 从 1.13 版本开始，可能将 **iptables FORWARD chain的默认策略设置为DROP**，从而导致 ping 其它 Node 上的 Pod IP 失败，遇到这种情况时，需要手动设置策略为 `ACCEPT`：

  ```shell
  $ sudo iptables -P FORWARD ACCEPT
  ```
  如果没有开启上面的路由转发(`net.ipv4.ip_forward=1`)，则需要把以下命令写入`/etc/rc.local`文件中，防止节点重启**iptables FORWARD chain的默认策略又还原为DROP**（下面的开机脚本我测试了几次都没生效，不知道是不是方法有误，所以最好的方式还是开启上面的路由转发功能，一劳永逸）

  ```shell
  sleep 60 && /sbin/iptables -P FORWARD ACCEPT
  ```


- 为了加快 pull image 的速度，可以使用国内的仓库镜像服务器，同时增加下载的并发数。(如果 dockerd 已经运行，则需要重启 dockerd 生效。)

  ```shell
  $ cat /etc/docker/daemon.json
  {
    "max-concurrent-downloads": 10
  }
  ```

### 启动docker

```shell
$ sudo systemctl daemon-reload
$ sudo systemctl stop firewalld
$ sudo systemctl disable firewalld
$ sudo iptables -F && sudo iptables -X && sudo iptables -F -t nat && sudo iptables -X -t nat
$ sudo systemctl enable docker
$ sudo systemctl start docker
```

- 需要关闭 firewalld(centos7)/ufw(ubuntu16.04)，否则可能会重复创建 iptables 规则
- 最好清理旧的 iptables rules 和 chains 规则
- 执行命令：docker version，检查docker服务是否正常

### 安装和配置kubelet

kubelet 启动时向kube-apiserver 发送TLS bootstrapping 请求，需要先将bootstrap token 文件中的kubelet-bootstrap 用户赋予system:node-bootstrapper 角色，然后kubelet 才有权限创建认证请求(certificatesigningrequests)：

> kubelet就是运行在Node节点上的，所以这一步安装是在所有的Node节点上，如果你想把你的Master也当做Node节点的话，当然也可以在Master节点上安装的。

```shell
$ kubectl create clusterrolebinding kubelet-bootstrap --clusterrole=system:node-bootstrapper --user=kubelet-bootstrap
```

- `--user=kubelet-bootstrap` 是文件 `/etc/kubernetes/token.csv` 中指定的用户名，同时也写入了文件 `/etc/kubernetes/bootstrap.kubeconfig`

另外1.8 版本中还需要为Node 请求创建一个RBAC 授权规则：

```shell
$ kubectl create clusterrolebinding kubelet-nodes --clusterrole=system:node --group=system:nodes
```

然后下载最新的kubelet 和kube-proxy 二进制文件（前面下载kubernetes 目录下面其实也有）：

```shell
$ wget https://dl.k8s.io/v1.8.2/kubernetes-server-linux-amd64.tar.gz
$ tar -xzvf kubernetes-server-linux-amd64.tar.gz
$ cd kubernetes
$ tar -xzvf  kubernetes-src.tar.gz
$ sudo cp -r ./server/bin/{kube-proxy,kubelet} /usr/k8s/bin/
```

### 创建kubelet bootstapping kubeconfig 文件

```shell
$ # 设置集群参数
$ kubectl config set-cluster kubernetes \
  --certificate-authority=/etc/kubernetes/ssl/ca.pem \
  --embed-certs=true \
  --server=${KUBE_APISERVER} \
  --kubeconfig=bootstrap.kubeconfig
$ # 设置客户端认证参数
$ kubectl config set-credentials kubelet-bootstrap \
  --token=${BOOTSTRAP_TOKEN} \
  --kubeconfig=bootstrap.kubeconfig
$ # 设置上下文参数
$ kubectl config set-context default \
  --cluster=kubernetes \
  --user=kubelet-bootstrap \
  --kubeconfig=bootstrap.kubeconfig
$ # 设置默认上下文
$ kubectl config use-context default --kubeconfig=bootstrap.kubeconfig
$ mv bootstrap.kubeconfig /etc/kubernetes/
```

- `--embed-certs` 为 `true` 时表示将 `certificate-authority` 证书写入到生成的 `bootstrap.kubeconfig` 文件中；
- 设置 kubelet 客户端认证参数时**没有**指定秘钥和证书，后续由 `kube-apiserver` 自动生成；

### 创建kubelet 的systemd unit 文件

```shell
$ sudo mkdir /var/lib/kubelet # 必须先创建工作目录
$ cat > kubelet.service <<EOF
[Unit]
Description=Kubernetes Kubelet
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/var/lib/kubelet
ExecStart=/usr/k8s/bin/kubelet \\
  --fail-swap-on=false \\
  --cgroup-driver=cgroupfs \\
  --address=${NODE_IP} \\
  --hostname-override=${NODE_IP} \\
  --experimental-bootstrap-kubeconfig=/etc/kubernetes/bootstrap.kubeconfig \\
  --kubeconfig=/etc/kubernetes/kubelet.kubeconfig \\
  --require-kubeconfig \\
  --cert-dir=/etc/kubernetes/ssl \\
  --cluster-dns=${CLUSTER_DNS_SVC_IP} \\
  --cluster-domain=${CLUSTER_DNS_DOMAIN} \\
  --hairpin-mode promiscuous-bridge \\
  --allow-privileged=true \\
  --serialize-image-pulls=false \\
  --logtostderr=true \\
  --v=2
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

> **请仔细阅读下面的注意事项，不然可能会启动失败**。

- `--fail-swap-on`参数，这个一定要注意，**Kubernetes 1.8开始要求关闭系统的Swap**，如果不关闭，默认配置下kubelet将无法启动，也可以通过kubelet的启动参数`–fail-swap-on=false`来避免该问题
- `--cgroup-driver`参数，kubelet 用来维护主机的的 cgroups 的，默认是`cgroupfs`，但是这个地方的值需要你根据docker 的配置来确定（`docker info |grep cgroup`）
- `-address` 不能设置为 `127.0.0.1`，否则后续 Pods 访问 kubelet 的 API 接口时会失败，因为 Pods 访问的 `127.0.0.1`指向自己而不是 kubelet
- 如果设置了 `--hostname-override` 选项，则 `kube-proxy` 也需要设置该选项，否则会出现找不到 Node 的情况
- `--experimental-bootstrap-kubeconfig` 指向 bootstrap kubeconfig 文件，kubelet 使用该文件中的用户名和 token 向 kube-apiserver 发送 TLS Bootstrapping 请求
- 管理员通过了 CSR 请求后，kubelet 自动在 `--cert-dir` 目录创建证书和私钥文件(`kubelet-client.crt` 和 `kubelet-client.key`)，然后写入 `--kubeconfig` 文件(自动创建 `--kubeconfig` 指定的文件)
- 建议在 `--kubeconfig` 配置文件中指定 `kube-apiserver` 地址，如果未指定 `--api-servers` 选项，则必须指定 `--require-kubeconfig` 选项后才从配置文件中读取 kue-apiserver 的地址，否则 kubelet 启动后将找不到 kube-apiserver (日志中提示未找到 API Server），`kubectl get nodes` 不会返回对应的 Node 信息
- `--cluster-dns` 指定 kubedns 的 Service IP(可以先分配，后续创建 kubedns 服务时指定该 IP)，`--cluster-domain` 指定域名后缀，这两个参数同时指定后才会生效

### 启动kubelet

```shell
$ sudo cp kubelet.service /etc/systemd/system/kubelet.service
$ sudo systemctl daemon-reload
$ sudo systemctl enable kubelet
$ sudo systemctl start kubelet
$ systemctl status kubelet
```

### 通过kubelet 的TLS 证书请求

kubelet 首次启动时向kube-apiserver 发送证书签名请求，必须通过后kubernetes 系统才会将该 Node 加入到集群。查看未授权的CSR 请求：

```shell
$ kubectl get csr
NAME                                                   AGE       REQUESTOR           CONDITION
node-csr--k3G2G1EoM4h9w1FuJRjJjfbIPNxa551A8TZfW9dG-g   2m        kubelet-bootstrap   Pending
$ kubectl get nodes
No resources found.
```

通过CSR 请求：

```shell
$ kubectl certificate approve node-csr--k3G2G1EoM4h9w1FuJRjJjfbIPNxa551A8TZfW9dG-g
certificatesigningrequest "node-csr--k3G2G1EoM4h9w1FuJRjJjfbIPNxa551A8TZfW9dG-g" approved
$ kubectl get nodes
NAME            STATUS    ROLES     AGE       VERSION
192.168.1.170   Ready     <none>    48s       v1.8.1
```

自动生成了kubelet kubeconfig 文件和公私钥：

```shell
$ ls -l /etc/kubernetes/kubelet.kubeconfig
-rw------- 1 root root 2280 Nov  7 10:26 /etc/kubernetes/kubelet.kubeconfig
$ ls -l /etc/kubernetes/ssl/kubelet*
-rw-r--r-- 1 root root 1046 Nov  7 10:26 /etc/kubernetes/ssl/kubelet-client.crt
-rw------- 1 root root  227 Nov  7 10:22 /etc/kubernetes/ssl/kubelet-client.key
-rw-r--r-- 1 root root 1115 Nov  7 10:16 /etc/kubernetes/ssl/kubelet.crt
-rw------- 1 root root 1675 Nov  7 10:16 /etc/kubernetes/ssl/kubelet.key
```

### 配置kube-proxy

#### 创建kube-proxy 证书签名请求：

```shell
$ cat > kube-proxy-csr.json <<EOF
{
  "CN": "system:kube-proxy",
  "hosts": [],
  "key": {
    "algo": "rsa",
    "size": 2048
  },
  "names": [
    {
      "C": "CN",
      "ST": "BeiJing",
      "L": "BeiJing",
      "O": "k8s",
      "OU": "System"
    }
  ]
}
EOF
```

- CN 指定该证书的 User 为 `system:kube-proxy`
- `kube-apiserver` 预定义的 RoleBinding `system:node-proxier` 将User `system:kube-proxy` 与 Role `system:node-proxier`绑定，该 Role 授予了调用 `kube-apiserver` Proxy 相关 API 的权限
- hosts 属性值为空列表

#### 生成kube-proxy 客户端证书和私钥

```shell
$ cfssl gencert -ca=/etc/kubernetes/ssl/ca.pem \
  -ca-key=/etc/kubernetes/ssl/ca-key.pem \
  -config=/etc/kubernetes/ssl/ca-config.json \
  -profile=kubernetes kube-proxy-csr.json | cfssljson -bare kube-proxy
$ ls kube-proxy*
kube-proxy.csr  kube-proxy-csr.json  kube-proxy-key.pem  kube-proxy.pem
$ sudo mv kube-proxy*.pem /etc/kubernetes/ssl/
```

#### 创建kube-proxy kubeconfig 文件

```shell
$ # 设置集群参数
$ kubectl config set-cluster kubernetes \
  --certificate-authority=/etc/kubernetes/ssl/ca.pem \
  --embed-certs=true \
  --server=${KUBE_APISERVER} \
  --kubeconfig=kube-proxy.kubeconfig
$ # 设置客户端认证参数
$ kubectl config set-credentials kube-proxy \
  --client-certificate=/etc/kubernetes/ssl/kube-proxy.pem \
  --client-key=/etc/kubernetes/ssl/kube-proxy-key.pem \
  --embed-certs=true \
  --kubeconfig=kube-proxy.kubeconfig
$ # 设置上下文参数
$ kubectl config set-context default \
  --cluster=kubernetes \
  --user=kube-proxy \
  --kubeconfig=kube-proxy.kubeconfig
$ # 设置默认上下文
$ kubectl config use-context default --kubeconfig=kube-proxy.kubeconfig
$ mv kube-proxy.kubeconfig /etc/kubernetes/
```

- 设置集群参数和客户端认证参数时 `--embed-certs` 都为 `true`，这会将 `certificate-authority`、`client-certificate` 和 `client-key` 指向的证书文件内容写入到生成的 `kube-proxy.kubeconfig` 文件中
- `kube-proxy.pem` 证书中 CN 为 `system:kube-proxy`，`kube-apiserver` 预定义的 RoleBinding `cluster-admin` 将User `system:kube-proxy` 与 Role `system:node-proxier` 绑定，该 Role 授予了调用 `kube-apiserver` Proxy 相关 API 的权限

#### 创建kube-proxy 的systemd unit 文件

```shell
$ sudo mkdir -p /var/lib/kube-proxy # 必须先创建工作目录
$ cat > kube-proxy.service <<EOF
[Unit]
Description=Kubernetes Kube-Proxy Server
Documentation=https://github.com/GoogleCloudPlatform/kubernetes
After=network.target

[Service]
WorkingDirectory=/var/lib/kube-proxy
ExecStart=/usr/k8s/bin/kube-proxy \\
  --bind-address=${NODE_IP} \\
  --hostname-override=${NODE_IP} \\
  --cluster-cidr=${SERVICE_CIDR} \\
  --kubeconfig=/etc/kubernetes/kube-proxy.kubeconfig \\
  --logtostderr=true \\
  --v=2
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
```

- `--hostname-override` 参数值必须与 kubelet 的值一致，否则 kube-proxy 启动后会找不到该 Node，从而不会创建任何 iptables 规则
- `--cluster-cidr` 必须与 kube-apiserver 的 `--service-cluster-ip-range` 选项值一致
- kube-proxy 根据 `--cluster-cidr` 判断集群内部和外部流量，指定 `--cluster-cidr` 或 `--masquerade-all` 选项后 kube-proxy 才会对访问 Service IP 的请求做 SNAT
- `--kubeconfig` 指定的配置文件嵌入了 kube-apiserver 的地址、用户名、证书、秘钥等请求和认证信息
- 预定义的 RoleBinding `cluster-admin` 将User `system:kube-proxy` 与 Role `system:node-proxier` 绑定，该 Role 授予了调用 `kube-apiserver` Proxy 相关 API 的权限

#### 启动kube-proxy

```shell
$ sudo cp kube-proxy.service /etc/systemd/system/
$ sudo systemctl daemon-reload
$ sudo systemctl enable kube-proxy
$ sudo systemctl start kube-proxy
$ systemctl status kube-proxy
```

### 验证集群功能

定义yaml 文件：（将下面内容保存为：nginx-ds.yaml）

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-ds
  labels:
    app: nginx-ds
spec:
  type: NodePort
  selector:
    app: nginx-ds
  ports:
  - name: http
    port: 80
    targetPort: 80
---
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: nginx-ds
  labels:
    addonmanager.kubernetes.io/mode: Reconcile
spec:
  template:
    metadata:
      labels:
        app: nginx-ds
    spec:
      containers:
      - name: my-nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```

创建 Pod 和服务：

```shell
$ kubectl create -f nginx-ds.yml
service "nginx-ds" created
daemonset "nginx-ds" created
```

执行下面的命令查看Pod 和SVC：

```shell
$ kubectl get pods -o wide
NAME             READY     STATUS    RESTARTS   AGE       IP           NODE
nginx-ds-f29zt   1/1       Running   0          23m       172.17.0.2   192.168.1.170
$ kubectl get svc
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
nginx-ds     NodePort    10.254.6.249   <none>        80:30813/TCP   24m
```

可以看到：

- 服务IP：10.254.6.249
- 服务端口：80
- NodePort端口：30813

在所有 Node 上执行：

```
$ curl 10.254.6.249
$ curl 192.168.1.170:30813
```

执行上面的命令预期都会输出nginx 欢迎页面内容，表示我们的Node 节点正常运行了。



## 9. 部署kubedns 插件<a id="kubedns"></a>

官方文件目录：[kubernetes/cluster/addons/dns](https://github.com/kubernetes/kubernetes/tree/v1.8.2/cluster/addons/dns)

使用的文件：

```shell
$ ls *.yaml *.base
kubedns-cm.yaml  kubedns-sa.yaml  kubedns-controller.yaml.base  kubedns-svc.yaml.base
```

### 系统预定义的RoleBinding

预定义的RoleBinding `system:kube-dns`将kube-system 命名空间的`kube-dns`ServiceAccount 与 `system:kube-dns` Role 绑定，该Role 具有访问kube-apiserver DNS 相关的API 权限：

```shell
$ kubectl get clusterrolebindings system:kube-dns -o yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  annotations:
    rbac.authorization.kubernetes.io/autoupdate: "true"
  creationTimestamp: 2017-11-06T10:51:59Z
  labels:
    kubernetes.io/bootstrapping: rbac-defaults
  name: system:kube-dns
  resourceVersion: "78"
  selfLink: /apis/rbac.authorization.k8s.io/v1/clusterrolebindings/system%3Akube-dns
  uid: 83a25fd9-c2e0-11e7-9646-00163e0055c1
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:kube-dns
subjects:
- kind: ServiceAccount
  name: kube-dns
  namespace: kube-system
```

* `kubedns-controller.yaml` 中定义的 Pods 时使用了 `kubedns-sa.yaml` 文件定义的 `kube-dns` ServiceAccount，所以具有访问 kube-apiserver DNS 相关 API 的权限；

### 配置kube-dns ServiceAccount

无需更改

### 配置kube-dns 服务

```shell
$ diff kubedns-svc.yaml.base kubedns-svc.yaml
30c30
<   clusterIP: __PILLAR__DNS__SERVER__
---
>   clusterIP: 10.254.0.2
```

- 需要将 spec.clusterIP 设置为集群环境变量中变量 `CLUSTER_DNS_SVC_IP` 值，这个IP 需要和 kubelet 的 `—cluster-dns` 参数值一致

### 配置kube-dns Deployment

```shell
$ diff kubedns-controller.yaml.base kubedns-controller.yaml
88c88
<         - --domain=__PILLAR__DNS__DOMAIN__.
---
>         - --domain=cluster.local
128c128
<         - --server=/__PILLAR__DNS__DOMAIN__/127.0.0.1#10053
---
>         - --server=/cluster.local/127.0.0.1#10053
160,161c160,161
<         - --probe=kubedns,127.0.0.1:10053,kubernetes.default.svc.__PILLAR__DNS__DOMAIN__,5,A
<         - --probe=dnsmasq,127.0.0.1:53,kubernetes.default.svc.__PILLAR__DNS__DOMAIN__,5,A
---
>         - --probe=kubedns,127.0.0.1:10053,kubernetes.default.svc.cluster.local,5,A
>         - --probe=dnsmasq,127.0.0.1:53,kubernetes.default.svc.cluster.local,5,A
```

- `--domain` 为集群环境变量`CLUSTER_DNS_DOMAIN` 的值
- 使用系统已经做了 RoleBinding 的 `kube-dns` ServiceAccount，该账户具有访问 kube-apiserver DNS 相关 API 的权限

### 执行所有定义文件

```
$ pwd
/home/ych/k8s-repo/kube-dns
$ ls *.yaml
kubedns-cm.yaml  kubedns-controller.yaml  kubedns-sa.yaml  kubedns-svc.yaml
$ kubectl create -f .
```

### 检查kubedns 功能

新建一个Deployment

```shell
$ cat > my-nginx.yaml<<EOF
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: my-nginx
spec:
  replicas: 2
  template:
    metadata:
      labels:
        run: my-nginx
    spec:
      containers:
      - name: my-nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
EOF
$ kubectl create -f my-nginx.yaml
deployment "my-nginx" created
```

Expose 该Deployment，生成my-nginx 服务

```shell
$ kubectl expose deploy my-nginx
$ kubectl get services
NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
kubernetes   ClusterIP   10.254.0.1      <none>        443/TCP   1d
my-nginx     ClusterIP   10.254.32.162   <none>        80/TCP    56s
```

然后创建另外一个Pod，查看`/etc/resolv.conf`是否包含`kubelet`配置的`--cluster-dns` 和`--cluster-domain`，是否能够将服务`my-nginx` 解析到上面显示的CLUSTER-IP `10.254.32.162`上

```shell
$ cat > pod-nginx.yaml<<EOF
apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
  - name: nginx
    image: nginx:1.7.9
    ports:
    - containerPort: 80
EOF
$ kubectl create -f pod-nginx.yaml
pod "nginx" created
$ kubectl exec  nginx -i -t -- /bin/bash
root@nginx:/# cat /etc/resolv.conf
nameserver 10.254.0.2
search default.svc.cluster.local. svc.cluster.local. cluster.local.
options ndots:5
root@nginx:/# ping my-nginx
PING my-nginx.default.svc.cluster.local (10.254.32.162): 48 data bytes
^C--- my-nginx.default.svc.cluster.local ping statistics ---
14 packets transmitted, 0 packets received, 100% packet loss

root@nginx:/# ping kubernetes
PING kubernetes.default.svc.cluster.local (10.254.0.1): 48 data bytes
^C--- kubernetes.default.svc.cluster.local ping statistics ---
6 packets transmitted, 0 packets received, 100% packet loss

root@nginx:/# ping kube-dns.kube-system.svc.cluster.local
PING kube-dns.kube-system.svc.cluster.local (10.254.0.2): 48 data bytes
^C--- kube-dns.kube-system.svc.cluster.local ping statistics ---
2 packets transmitted, 0 packets received, 100% packet loss
```



## 10. 部署Dashboard 插件<a id="dashboard"></a>

官方文件目录：[kubernetes/cluster/addons/dashboard](https://github.com/kubernetes/kubernetes/tree/v1.8.2/cluster/addons/dashboard)

使用的文件如下：

```shell
$ ls *.yaml
dashboard-controller.yaml  dashboard-rbac.yaml  dashboard-service.yaml
```

- 新加了 `dashboard-rbac.yaml` 文件，定义 dashboard 使用的 RoleBinding。

由于 `kube-apiserver` 启用了 `RBAC` 授权，而官方源码目录的 `dashboard-controller.yaml` 没有定义授权的 ServiceAccount，所以后续访问 `kube-apiserver` 的 API 时会被拒绝，前端界面提示：

![403](/img/posts/dashboard-403.png)

解决办法是：定义一个名为dashboard 的ServiceAccount，然后将它和Cluster Role view 绑定：

```shell
$ cat > dashboard-rbac.yaml<<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: dashboard
  namespace: kube-system
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1alpha1
metadata:
  name: dashboard
subjects:
  - kind: ServiceAccount
    name: dashboard
    namespace: kube-system
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
EOF
```

### 配置dashboard-controller

```
20a21
>       serviceAccountName: dashboard
```

- 使用名为 dashboard 的自定义 ServiceAccount

### 配置dashboard-service

```shell
$ diff dashboard-service.yaml.orig dashboard-service.yaml
10a11
>   type: NodePort
```

- 指定端口类型为 NodePort，这样外界可以通过地址 nodeIP:nodePort 访问 dashboard

### 执行所有定义文件

```shell
$ pwd
/home/ych/k8s-repo/dashboard
$ ls *.yaml
dashboard-controller.yaml  dashboard-rbac.yaml  dashboard-service.yaml
$ kubectl create -f  .
```

### 检查执行结果

查看分配的 NodePort

```shell
$ kubectl get services kubernetes-dashboard -n kube-system
NAME                   TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
kubernetes-dashboard   NodePort   10.254.104.90   <none>        80:31202/TCP   1m
```

- NodePort 31202映射到dashboard pod 80端口；

检查 controller

```shell
$ kubectl get deployment kubernetes-dashboard  -n kube-system
NAME                   DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
kubernetes-dashboard   1         1         1            1           3m

$ kubectl get pods  -n kube-system | grep dashboard
kubernetes-dashboard-6667f9b4c-4xbpz   1/1       Running   0          3m
```

### 访问dashboard

1. kubernetes-dashboard 服务暴露了 NodePort，可以使用 `http://NodeIP:nodePort` 地址访问 dashboard
2. 通过 kube-apiserver 访问 dashboard
3. 通过 kubectl proxy 访问 dashboard

![dashboard ui](/img/posts/dashboard.png)

由于缺少 Heapster 插件，当前 dashboard 不能展示 Pod、Nodes 的 CPU、内存等 metric 图形

> 注意：如果你的后端`apiserver`是高可用的集群模式的话，那么`Dashboard`的`apiserver-host`最好手动指定，不然，当你`apiserver`某个节点挂了的时候，`Dashboard`可能不能正常访问，如下配置

```yaml
image: gcr.io/google_containers/kubernetes-dashboard-amd64:v1.7.1
ports:
- containerPort: 9090
  protocol: TCP
args:
  - --apiserver-host=http://<api_server_ha_addr>:8080
```


## 11. 部署Heapster 插件<a id="heapster"></a>

到[heapster release](https://github.com/kubernetes/heapster/releases) 页面下载最新版的heapster

```shell
$ wget https://github.com/kubernetes/heapster/archive/v1.4.3.tar.gz
$ tar -xzvf v1.4.3.tar.gz
```

部署相关文件目录：`/home/ych/k8s-repo/heapster-1.4.3/deploy/kube-config`

```shell
$ ls influxdb/ && ls rbac/
grafana.yaml  heapster.yaml  influxdb.yaml
heapster-rbac.yaml
```

为方便测试访问，将`grafana.yaml`下面的服务类型设置为`type=NodePort`

### 执行所有文件

```shell
$ kubectl create -f rbac/heapster-rbac.yaml
clusterrolebinding "heapster" created
$ kubectl create -f influxdb
deployment "monitoring-grafana" created
service "monitoring-grafana" created
serviceaccount "heapster" created
deployment "heapster" created
service "heapster" created
deployment "monitoring-influxdb" created
service "monitoring-influxdb" created
```

### 检查执行结果

检查 Deployment

```shell
$ kubectl get deployments -n kube-system | grep -E 'heapster|monitoring'
heapster               1         1         1            1           2m
monitoring-grafana     1         1         1            0           2m
monitoring-influxdb    1         1         1            1           2m
```

检查 Pods

```shell
$ kubectl get pods -n kube-system | grep -E 'heapster|monitoring'
heapster-7cf895f48f-p98tk              1/1       Running            0          2m
monitoring-grafana-c9d5cd98d-gb9xn     0/1       CrashLoopBackOff   4          2m
monitoring-influxdb-67f8d587dd-zqj6p   1/1       Running            0          2m
```

我们可以看到`monitoring-grafana`的POD 是没有执行成功的，通过查看日志可以看到下面的错误信息：

> Failed to parse /etc/grafana/grafana.ini, open /etc/grafana/grafana.ini: no such file or directory

要解决这个问题([heapster issues](https://github.com/kubernetes/heapster/issues/1709))我们需要将grafana 的镜像版本更改成：`gcr.io/google_containers/heapster-grafana-amd64:v4.0.2`，然后重新执行，即可正常。

### 访问 grafana

上面我们修改grafana 的Service 为NodePort 类型：

```shell
$ kubectl get svc -n kube-system
NAME                   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)         AGE
monitoring-grafana     NodePort    10.254.34.89    <none>        80:30191/TCP    28m
```

则我们就可以通过任意一个节点加上上面的30191端口就可以访问grafana 了。

![grafana ui](/img/posts/WX20171110-141935.png)

heapster 正确安装后，我们便可以回去看我们的dashboard 是否有图表出现了：

![dashboard](/img/posts/WX20171110-105351.png)



## 12. 安装Ingress<a id="ingress"></a>

`Ingress`其实就是从`kuberenets`集群外部访问集群的一个入口，将外部的请求转发到集群内不同的Service 上，其实就相当于nginx、apache 等负载均衡代理服务器，再加上一个规则定义，路由信息的刷新需要靠`Ingress controller`来提供

`Ingress controller`可以理解为一个监听器，通过不断地与`kube-apiserver`打交道，实时的感知后端service、pod 等的变化，当得到这些变化信息后，`Ingress controller`再结合`Ingress`的配置，更新反向代理负载均衡器，达到服务发现的作用。其实这点和服务发现工具`consul`的`consul-template`非常类似。

### 部署traefik

[Traefik](https://traefik.io/)是一款开源的反向代理与负载均衡工具。它最大的优点是能够与常见的微服务系统直接整合，可以实现自动化动态配置。目前支持**Docker、Swarm、Mesos/Marathon、 Mesos、Kubernetes、Consul、Etcd、Zookeeper、BoltDB、Rest API**等等后端模型。

![traefik](/img/posts/traefik-architecture.png)

#### 创建rbac

创建文件：`ingress-rbac.yaml`，用于`service account`验证

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ingress
  namespace: kube-system
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: ingress
subjects:
  - kind: ServiceAccount
    name: ingress
    namespace: kube-system
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
```

#### DaemonSet 形式部署traefik

创建文件：`traefik-daemonset.yaml`，为保证traefik 总能提供服务，在每个节点上都部署一个traefik，所以这里使用`DaemonSet` 的形式

```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: traefik-conf
  namespace: kube-system
data:
  traefik-config: |-
    defaultEntryPoints = ["http","https"]
    [entryPoints]
      [entryPoints.http]
      address = ":80"
        [entryPoints.http.redirect]
          entryPoint = "https"
      [entryPoints.https]
      address = ":443"
        [entryPoints.https.tls]
          [[entryPoints.https.tls.certificates]]
          CertFile = "/ssl/ssl.crt"
          KeyFile = "/ssl/ssl.key"

---
kind: DaemonSet
apiVersion: extensions/v1beta1
metadata:
  name: traefik-ingress
  namespace: kube-system
  labels:
    k8s-app: traefik-ingress
spec:
  template:
    metadata:
      labels:
        k8s-app: traefik-ingress
        name: traefik-ingress
    spec:
      terminationGracePeriodSeconds: 60
      restartPolicy: Always
      serviceAccountName: ingress
      containers:
      - image: traefik:latest
        name: traefik-ingress
        ports:
        - name: http
          containerPort: 80
          hostPort: 80
        - name: https
          containerPort: 443
          hostPort: 443
        - name: admin
          containerPort: 8080
        args:
        - --configFile=/etc/traefik/traefik.toml
        - -d
        - --web
        - --kubernetes
        - --logLevel=DEBUG
        volumeMounts:
        - name: traefik-config-volume
          mountPath: /etc/traefik
        - name: traefik-ssl-volume
          mountPath: /ssl
      volumes:
      - name: traefik-config-volume
        configMap:
          name: traefik-conf
          items:
          - key: traefik-config
            path: traefik.toml
      - name: traefik-ssl-volume
        secret:
          secretName: traefik-ssl
```

注意上面的yaml 文件中我们添加了一个名为`traefik-conf`的`ConfigMap`，该配置是用来将http 请求强制跳转成https，并指定https 所需CA 文件地址，这里我们使用`secret`的形式来指定CA 文件的路径：

```shell
$ ls
ssl.crt     ssl.key
$ kubectl create secret generic traefik-ssl --from-file=ssl.crt --from-file=ssl.key --namespace=kube-system
secret "traefik-ssl" created
```

#### 创建ingress

创建文件：`traefik-ingress.yaml`，现在可以通过创建`ingress`文件来定义请求规则了，根据自己集群中的service 自己修改相应的`serviceName` 和`servicePort`

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: traefik-ingress
spec:
  rules:
  - host: traefik.nginx.io
    http:
      paths:
      - path: /
        backend:
          serviceName: my-nginx
          servicePort: 80
```

执行创建命令：

```shell
$ kubectl create -f ingress-rbac.yaml
serviceaccount "ingress" created
clusterrolebinding "ingress" created
$ kubectl create -f traefik-daemonset.yaml
configmap "traefik-conf" created
daemonset "traefik-ingress" created
$ kubectl create -f traefik-ingress.yaml
ingress "traefik-ingress" created
```

#### Traefik UI

创建文件：`traefik-ui.yaml`，

```yaml
apiVersion: v1
kind: Service
metadata:
  name: traefik-ui
  namespace: kube-system
spec:
  selector:
    k8s-app: traefik-ingress
  ports:
  - name: web
    port: 80
    targetPort: 8080
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: traefik-ui
  namespace: kube-system
spec:
  rules:
  - host: traefik-ui.local
    http:
      paths:
      - path: /
        backend:
          serviceName: traefik-ui
          servicePort: web
```

### 测试

部署完成后，在本地`/etc/hosts`添加一条配置：

```shell
# 将下面的xx.xx.xx.xx替换成任意节点IP
xx.xx.xx.xx master03 traefik.nginx.io traefik-ui.local
```

配置完成后，在本地访问：`traefik-ui.local`，则可以访问到`traefik`的`dashboard`页面：

![traefik dashboard](/img/posts/WX20171110-140151.png)

同样的可以访问`traefik.nginx.io`，得到正确的结果页面：

![WX20171110-140306](/img/posts/WX20171110-140306.png)

上面配置完成后，就可以将我们的所有节点加入到一个`SLB`中，然后配置相应的域名解析到`SLB`即可。



## 13. 日志收集<a id="log-collect"></a>

参考文章[kubernetes 日志收集方案](/post/kubernetes-logs-collect/)



## 14. 私有仓库harbor 搭建<a id="harbor"></a>

参考文章[在kubernetes 上搭建docker 私有仓库Harbor](/post/install-docker-registry-harbor-in-kubernetes/)


## 15. 问题汇总<a id="question"></a>

#### 15.1 dashboard无法显示监控图

dashboard 和heapster influxdb都部署完成后 dashboard依旧无法显示监控图 通过排查 heapster log有超时错误

```shell
$ kubectl logs -f pods/heapster-2882613285-58d9r -n kube-system

E0630 17:23:47.339987 1 reflector.go:203] k8s.io/heapster/metrics/sources/kubelet/kubelet.go:342: Failed to list *api.Node: Get http://kubernetes.default/api/v1/nodes?resourceVersion=0: dial tcp: i/o timeout E0630 17:23:47.340274 1 reflector.go:203] k8s.io/heapster/metrics/heapster.go:319: Failed to list *api.Pod: Get http://kubernetes.default/api/v1/pods?resourceVersion=0: dial tcp: i/o timeout E0630 17:23:47.340498 1 reflector.go:203] k8s.io/heapster/metrics/processors/namespace_based_enricher.go:84: Failed to list *api.Namespace: Get http://kubernetes.default/api/v1/namespaces?resourceVersion=0: dial tcp: lookup kubernetes.default on 10.254.0.2:53: dial udp 10.254.0.2:53: i/o timeout E0630 17:23:47.340563 1 reflector.go:203] k8s.io/heapster/metrics/heapster.go:327: Failed to list *api.Node: Get http://kubernetes.default/api/v1/nodes?resourceVersion=0: dial tcp: lookup kubernetes.default on 10.254.0.2:53: dial udp 10.254.0.2:53: i/o timeout E0630 17:23:47.340623 1 reflector.go:203] k8s.io/heapster/metrics/processors/node_autoscaling_enricher.go💯 Failed to list *api.Node: Get http://kubernetes.default/api/v1/nodes?resourceVersion=0: dial tcp: lookup kubernetes.default on 10.254.0.2:53: dial udp 10.254.0.2:53: i/o timeout E0630 17:23:55.014414 1 influxdb.go:150] Failed to create infuxdb: failed to ping InfluxDB server at "monitoring-influxdb:8086" - Get http://monitoring-influxdb:8086/ping: dial tcp: lookup monitoring-influxdb on 10.254.0.2:53: read udp 172.30.45.4:48955->10.254.0.2:53: i/o timeout`
```

我是docker的systemd Unit文件忘记添加

```shell
ExecStart=/root/local/bin/dockerd --log-level=error $DOCKER_NETWORK_OPTIONS
```

后边的`$DOCKER_NETWORK_OPTIONS`，导致`docker0`的网段跟`flannel.1`不一致。

#### 15.2 kube-proxy报错kube-proxy[2241]: E0502 15:55:13.889842 2241 conntrack.go:42] conntrack returned error: error looking for path of conntrack: exec: "conntrack": executable file not found in $PATH

**导致现象**：`kubedns`启动成功，运行正常，但是service 之间无法解析，`kubernetes`中的`DNS`解析异常

**解决方法**：`CentOS`中安装`conntrack-tools`包后重启kubernetes 集群即可。

#### 15.3 Unable to access kubernetes services: no route to host

**导致现象**: 在POD 内访问集群的某个服务的时候出现`no route to host`

```shell
$ curl my-nginx.nx.svc.cluster.local
curl: (7) Failed connect to my-nginx.nx.svc.cluster.local:80; No route to host
```

**解决方法**：清除所有的防火墙规则，然后重启docker 服务

```shell
$ iptables --flush && iptables -tnat --flush
$ systemctl restart docker
```

#### 15.4 使用NodePort 类型的服务，只能在POD 所在节点进行访问

**导致现象**:  使用`NodePort` 类型的服务，只能在POD 所在节点进行访问，其他节点通过NodePort 不能正常访问

**解决方法**:  `kube-proxy` 默认使用的是`proxy_model`就是`iptables`，正常情况下是所有节点都可以通过NodePort 进行访问的，我这里将阿里云的安全组限制全部去掉即可，然后根据需要进行添加安全限制。



## 参考资料<a id="link"></a>

* [和我一步步部署 kubernetes 集群](https://github.com/opsnull/follow-me-install-kubernetes-cluster)
* [keepalived 配置](http://www.rfyy.net/archives/1504.html)
* [kubernetes issue](https://github.com/kubernetes/kubernetes/issues)
* [kubernetes heapster issue](https://github.com/kubernetes/heapster/issues)


[基于1.9版本手动搭建高可用Kubernetes集群的视频教程](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)，对视频感兴趣的同学可以观看视频：
[![视频教程](/img/posts/k8s-install-pay-course.jpeg)](https://www.haimaxy.com/course/pjrqxm/?utm_source=blog)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

