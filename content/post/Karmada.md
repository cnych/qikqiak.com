---
title: Kubernetes 多集群管理系统 Karmada
date: 2024-05-20
tags: ["kubernetes", "Karmada", "多集群"]
keywords: ["kubernetes", "Karmada", "多集群", "多云", "CNCF", "华为"]
slug: kubernetes-multi-cluster-management-karmada
gitcomment: true
ads: true
category: "kubernetes"
---

Karmada（Kubernetes Armada）是 CNCF 孵化的一个 Kubernetes 管理系统，使您能够在多个 Kubernetes 集群和云中运行云原生应用程序，而无需更改应用程序。通过使用 Kubernetes 原生 API 并提供先进的调度功能，Karmada 实现了真正的开放式、多云 Kubernetes。

![Karmada（Kubernetes](https://picdn.youdianzhishi.com/images/1729952010445.png)

Karmada 旨在为多云和混合云场景下的多集群应用程序管理提供即插即用的自动化，具有集中式多云管理、高可用性、故障恢复和流量调度等关键功能。

<!--more-->

## 特性

- 兼容 K8s 原生 API

  - 从单集群到多集群的无侵入式升级
  - 现有 K8s 工具链的无缝集成

- 开箱即用

  - 针对场景内置策略集，包括：`Active-active`、`Remote DR`、`Geo Redundant` 等。
  - 在多集群上进行跨集群应用程序自动伸缩、故障转移和负载均衡。

- 避免供应商锁定

  - 与主流云提供商集成
  - 在集群之间自动分配、迁移
  - 未绑定专有供应商编排

- 集中式管理

  - 位置无关的集群管理
  - 支持公有云、本地或边缘上的集群。

- 丰富多集群调度策略

  - 集群亲和性、实例在多集群中的拆分调度/再平衡，
  - 多维 HA:区域/AZ/集群/提供商

- 开放和中立

  - 由互联网、金融、制造业、电信、云提供商等联合发起。
  - 目标是与 CNCF 一起进行开放治理。

## Karmada 架构

Karmada 的架构非常类似于单个 Kubernetes 集群，他们都有一个控制平面、一个 APIServer、一个调度器和一组控制器，而且 Karmada 完全兼容 K8s 的原生 API 操作，便于各种 K8s 集群的接入。

![Karmada 架构](https://picdn.youdianzhishi.com/images/1715771520539.png)

所以同样 Karmada 的核心是其控制平面，一个完整且可工作的 Karmada 控制平面由以下组件组成。其中 `karmada-agent` 可以是可选的，这取决于集群注册模式。

**karmada-apiserver**

APIServer 是 Karmada 控制平面的一个组件，对外暴露 Karmada API 以及 Kubernetes 原生 API，APIServer 是 Karmada 控制平面的前端。

Karmada APIServer 是直接使用 Kubernetes 的 kube-apiserver 实现的，因此 Karmada 与 Kubernetes API 自然兼容。这也使得 Karmada 更容易实现与 Kubernetes 生态系统的集成，例如允许用户使用 kubectl 来操作 Karmada、与 ArgoCD 集成、与 Flux 集成等等。

**karmada-aggregated-apiserver**

聚合 API 服务器是使用 Kubernetes API 聚合层技术实现的扩展 API 服务器。它提供了集群 API 以及相应的子资源，例如 `cluster/status` 和 `cluster/proxy`，实现了聚合 Kubernetes API Endpoint 等可以通过 `karmada-apiserver` 访问成员集群的高级功能。

**kube-controller-manager**

`kube-controller-manager` 由一组控制器组成，Karmada 只是从 Kubernetes 的官方版本中挑选了一些控制器，以保持与原生控制器一致的用户体验和行为。值得注意的是，并非所有的原生控制器都是 Karmada 所需要的。

> 注意：当用户向 Karmada APIServer 提交 Deployment 或其他 Kubernetes 标准资源时，它们只记录在 Karmada 控制平面的 etcd 中。随后，这些资源会向成员集群同步。然而，这些部署资源不会在 Karmada 控制平面集群中进行 reconcile 过程（例如创建 Pod）。

**karmada-controller-manager**

Karmada 控制器管理器运行了各种自定义控制器进程。控制器负责监视 Karmada 对象，并与底层集群的 API 服务器通信，以创建原生的 Kubernetes 资源。

**karmada-scheduler**

`karmada-scheduler` 负责将 Kubernetes 原生 API 资源对象（以及 CRD 资源）调度到成员集群。

调度器依据策略约束和可用资源来确定哪些集群对调度队列中的资源是可用的，然后调度器对每个可用集群进行打分排序，并将资源绑定到最合适的集群。

**karmada-webhook**

`karmada-webhook` 是用于接收 karmada/Kubernetes API 请求的 HTTP 回调，并对请求进行处理。你可以定义两种类型的 `karmada-webhook`，即验证性质的 webhook 和修改性质的 webhook。修改性质的准入 webhook 会先被调用。它们可以更改发送到 Karmada API 服务器的对象以执行自定义的设置默认值操作。

在完成了所有对象修改并且 Karmada API 服务器也验证了所传入的对象之后，验证性质的 webhook 会被调用，并通过拒绝请求的方式来强制实施自定义的策略。

**etcd**

一致且高可用的键值存储，用作 Karmada 的所有 Karmada/Kubernetes 资源对象数据的后台数据库。

如果你的 Karmada 使用 etcd 作为其后台数据库，请确保你针对这些数据有一份备份计划。

**karmada-agent**

Karmada 有 `Push` 和 `Pull` 两种集群注册模式，`karmada-agent` 应部署在每个 `Pull` 模式的成员集群上。它可以将特定集群注册到 Karmada 控制平面，并将工作负载清单从 Karmada 控制平面同步到成员集群。此外，它也负责将成员集群及其资源的状态同步到 Karmada 控制平面。

**插件（Addons）**

- `karmada-scheduler-estimator`

Karmada 调度估计器为每个成员集群运行精确的调度预估，它为调度器提供了更准确的集群资源信息。

> 注意：早期的 Karmada 调度器只支持根据集群资源的总量来决策可调度副本的数量。在这种情况下，当集群资源的总量足够但每个节点资源不足时，会发生调度失败。为了解决这个问题，引入了估计器组件，该组件根据资源请求计算每个节点的可调度副本的数量，从而计算出真正的整个集群的可调度副本的数量。

- `karmada-descheduler`

Karmada 重调度组件负责定时检测所有副本（默认为两分钟），并根据成员集群中副本实例状态的变化触发重新调度。

该组件是通过调用 `karmada-scheduler-estimator` 来感知有多少副本实例状态发生了变化，并且只有当副本的调度策略为动态划分时，它才会发挥作用。

- `karmada-search`

Karmada 搜索组件以聚合服务的形式，提供了在多云环境中进行全局搜索和资源代理等功能。

其中，全局搜索能力是用来跨多个集群缓存资源对象和事件，以及通过搜索 API 对外提供图形化的检索服务；资源代理能力使用户既可以访问 Karmada 控制平面所有资源，又可以访问成员集群中的所有资源。

**CLI 工具**

- `karmadactl`

Karmada 提供了一个命令行工具 `karmadactl`，用于使用 Karmada API 与 Karmada 的控制平面进行通信。

你可以使用 `karmadactl` 执行成员集群的添加/剔除，将成员集群标记/取消标记为不可调度，等等。

- `kubectl karmada`

`kubectl karmada` 以 kubectl 插件的形式提供功能，但它的实现与 `karmadactl` 完全相同。

## 安装

首先要注意我们使用 Karmada 管理的多集群包含两类：

- host 集群：即由 karmada 控制面构成的集群，接受用户提交的工作负载部署需求，将之同步到 member 集群，并从 member 集群同步工作负载后续的运行状况。
- member 集群：由一个或多个 K8s 集群构成，负责运行用户提交的工作负载

所以首先我们需要准备几个 K8s 集群用于测试，其中 host 集群就是我们要安装 Karmada 的集群，这里我们可以使用 `KinD` 部署一个 host 集群以及两个 member 集群，用于测试 Karmada 的多集群管理功能，当然首先需要在你的测试环境中安装 Docker 和 KinD。

```bash
$ docker version
Client:
 Cloud integration: v1.0.29
 Version:           20.10.21
 API version:       1.41
 Go version:        go1.18.7
 Git commit:        baeda1f
 Built:             Tue Oct 25 18:01:18 2022
 OS/Arch:           darwin/arm64
 Context:           orbstack
 Experimental:      true

Server: Docker Engine - Community
 Engine:
  Version:          25.0.5
  API version:      1.44 (minimum version 1.24)
  Go version:       go1.21.8
  Git commit:       e63daec
  Built:            Tue Mar 19 15:05:27 2024
  OS/Arch:          linux/arm64
  Experimental:     false
 containerd:
  Version:          v1.7.13
  GitCommit:        7c3aca7a610df76212171d200ca3811ff6096eb8
 runc:
  Version:          1.1.12
  GitCommit:        51d5e94601ceffbbd85688df1c928ecccbfa4685
 docker-init:
  Version:          0.19.0
  GitCommit:        de40ad0
$ kind version
kind v0.20.0 go1.20.4 darwin/arm64
```

然后我们可以使用 Karmada 官方提供的 `create-cluster.sh` 脚本来创建两个 member 集群。

```bash
$ git clone https://github.com/karmada-io/karmada.git
$ cd karmada
# 创建 host 集群
$ hack/create-cluster.sh host $HOME/.kube/host.config
$ kubectl get nodes --context host --kubeconfig /Users/cnych/.kube/host.config
NAME                 STATUS   ROLES           AGE   VERSION
host-control-plane   Ready    control-plane   63s   v1.27.3
# 创建 member1 集群
$ hack/create-cluster.sh member1 $HOME/.kube/member1.config
$ kubectl get nodes --context member1 --kubeconfig /Users/cnych/.kube/member1.config
NAME                    STATUS   ROLES           AGE    VERSION
member1-control-plane   Ready    control-plane   115s   v1.27.3
# 创建 member2 集群
$ hack/create-cluster.sh member2 $HOME/.kube/member2.config
$ kubectl get nodes --context member2 --kubeconfig /Users/cnych/.kube/member2.config
NAME                    STATUS   ROLES           AGE   VERSION
member2-control-plane   Ready    control-plane   29s   v1.27.3
```

到这里我们就准备好了一个 host 集群和两个 member 集群，接下来我们就可以在 host 集群上安装 Karmada 了。安装 Karmada 的方法有很多，可以直接使用官方的 CLI 工具，也可以使用 Helm Chart 方式，还可以使用 Operator 方式等等，如果需要定制化安装，使用 Helm Chart 的方式会更加灵活。由于官方提供的 CLI 工具并不只是用于安装 Karmada，还可以用于管理 Karmada 集群，所以无论如何我们都可以先安装 CLI 工具 - `karmadactl`，`karmadactl` 是允许你控制 Karmada 控制面的 Karmada 命令行工具，此外还提供一个 kubectl 插件 `kubectl-karmada`，尽管这两个工具的名字不同，但其关联的命令和选项完全相同，所以无论使用哪一个都是一样的，在实际使用中，你可以根据自己的需求选择一个 CLI 工具。

直接使用下面的命令即可一键安装 `karmadactl`：

```bash
$ sudo ./hack/install-cli.sh
[INFO]  Downloading metadata https://api.github.com/repos/karmada-io/karmada/releases/latest
[INFO]  Using 1.9.1 as release
[INFO]  Downloading hash https://github.com/karmada-io/karmada/releases/download/v1.9.1/karmadactl-darwin-arm64.tgz.sha256
[INFO]  Downloading binary https://github.com/karmada-io/karmada/releases/download/v1.9.1/karmadactl-darwin-arm64.tgz
[INFO]  Verifying binary download
[INFO]  Installing karmadactl to /usr/local/bin/karmadactl
$ karmadactl version
karmadactl version: version.Info{GitVersion:"v1.9.1", GitCommit:"b57bff17d6133deb26d9c319714170a915d4fa54", GitTreeState:"clean", BuildDate:"2024-04-30T02:03:53Z", GoVersion:"go1.20.11", Compiler:"gc", Platform:"darwin/arm64"}
```

安装 `kubectl-karmada` 与安装 `karmadactl` 相同，你只需要添加一个 `kubectl-karmada` 参数即可：

```bash
$ sudo ./hack/install-cli.sh kubectl-karmada
[INFO]  Downloading metadata https://api.github.com/repos/karmada-io/karmada/releases/latest
[INFO]  Using 1.9.1 as release
[INFO]  Downloading hash https://github.com/karmada-io/karmada/releases/download/v1.9.1/kubectl-karmada-darwin-arm64.tgz.sha256
[INFO]  Downloading binary https://github.com/karmada-io/karmada/releases/download/v1.9.1/kubectl-karmada-darwin-arm64.tgz
[INFO]  Verifying binary download
[INFO]  Installing kubectl-karmada to /usr/local/bin/kubectl-karmada
$ kubectl karmada version
kubectl karmada version: version.Info{GitVersion:"v1.9.1", GitCommit:"b57bff17d6133deb26d9c319714170a915d4fa54", GitTreeState:"clean", BuildDate:"2024-04-30T02:03:52Z", GoVersion:"go1.20.11", Compiler:"gc", Platform:"darwin/arm64"}
```

接下来我们就可以在 host 集群上安装 Karmada 了，我们已将 host 集群的 `kubeconfig` 文件放到了 `$HOME/.kube/config`。直接执行以下命令即可进行安装：

```bash
# --kube-image-mirror-country 用于指定镜像国内源
# --etcd-storage-mode 用于指定 etcd 存储模式，支持 emptyDir、hostPath、PVC，默认为 hostPath
$ sudo kubectl karmada init --kube-image-mirror-country=cn --etcd-storage-mode PVC --storage-classes-name standard --kubeconfig=$HOME/.kube/host.config
I0516 15:56:35.549617   98690 deploy.go:244] kubeconfig file: /Users/cnych/.kube/host.config, kubernetes: https://192.168.247.4:6443
I0516 15:56:35.586638   98690 deploy.go:264] karmada apiserver ip: [192.168.247.4]
I0516 15:56:36.330162   98690 cert.go:246] Generate ca certificate success.
I0516 15:56:36.368464   98690 cert.go:246] Generate karmada certificate success.
I0516 15:56:36.453671   98690 cert.go:246] Generate apiserver certificate success.
I0516 15:56:36.535924   98690 cert.go:246] Generate front-proxy-ca certificate success.
I0516 15:56:36.666694   98690 cert.go:246] Generate front-proxy-client certificate success.
I0516 15:56:36.716602   98690 cert.go:246] Generate etcd-ca certificate success.
I0516 15:56:36.772838   98690 cert.go:246] Generate etcd-server certificate success.
I0516 15:56:36.905275   98690 cert.go:246] Generate etcd-client certificate success.
I0516 15:56:36.905808   98690 deploy.go:360] download crds file:https://github.com/karmada-io/karmada/releases/download/v1.9.1/crds.tar.gz
Downloading...[ 100.00% ]
Download complete.
I0516 15:56:39.224167   98690 deploy.go:620] Create karmada kubeconfig success.
I0516 15:56:39.300133   98690 idempotency.go:267] Namespace karmada-system has been created or updated.
I0516 15:56:39.352865   98690 idempotency.go:291] Service karmada-system/etcd has been created or updated.
I0516 15:56:39.353105   98690 deploy.go:426] Create etcd StatefulSets
I0516 15:57:02.386423   98690 deploy.go:435] Create karmada ApiServer Deployment
I0516 15:57:02.412127   98690 idempotency.go:291] Service karmada-system/karmada-apiserver has been created or updated.
I0516 15:57:33.480629   98690 deploy.go:450] Create karmada aggregated apiserver Deployment
I0516 15:57:33.488145   98690 idempotency.go:291] Service karmada-system/karmada-aggregated-apiserver has been created or updated.
I0516 15:57:48.545482   98690 idempotency.go:267] Namespace karmada-system has been created or updated.
I0516 15:57:48.547067   98690 deploy.go:85] Initialize karmada bases crd resource `/etc/karmada/crds/bases`
I0516 15:57:48.549059   98690 deploy.go:240] Attempting to create CRD
I0516 15:57:48.569222   98690 deploy.go:250] Create CRD cronfederatedhpas.autoscaling.karmada.io successfully.
# ......省略部分输出
I0516 15:57:49.963201   98690 deploy.go:96] Initialize karmada patches crd resource `/etc/karmada/crds/patches`
I0516 15:57:50.372020   98690 deploy.go:108] Create MutatingWebhookConfiguration mutating-config.
I0516 15:57:50.379939   98690 webhook_configuration.go:362] MutatingWebhookConfiguration mutating-config has been created or updated successfully.
I0516 15:57:50.379957   98690 deploy.go:113] Create ValidatingWebhookConfiguration validating-config.
I0516 15:57:50.387416   98690 webhook_configuration.go:333] ValidatingWebhookConfiguration validating-config has been created or updated successfully.
I0516 15:57:50.387434   98690 deploy.go:119] Create Service 'karmada-aggregated-apiserver' and APIService 'v1alpha1.cluster.karmada.io'.
I0516 15:57:50.390795   98690 idempotency.go:291] Service karmada-system/karmada-aggregated-apiserver has been created or updated.
I0516 15:57:50.394479   98690 check.go:42] Waiting for APIService(v1alpha1.cluster.karmada.io) condition(Available), will try
I0516 15:57:51.506085   98690 tlsbootstrap.go:49] [bootstrap-token] configured RBAC rules to allow Karmada Agent Bootstrap tokens to post CSRs in order for agent to get long term certificate credentials
I0516 15:57:51.508289   98690 tlsbootstrap.go:63] [bootstrap-token] configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Karmada Agent Bootstrap Token
I0516 15:57:51.511340   98690 tlsbootstrap.go:77] [bootstrap-token] configured RBAC rules to allow certificate rotation for all agent client certificates in the member cluster
I0516 15:57:51.635344   98690 deploy.go:143] Initialize karmada bootstrap token
I0516 15:57:51.656584   98690 deploy.go:468] Create karmada kube controller manager Deployment
I0516 15:57:51.671152   98690 idempotency.go:291] Service karmada-system/kube-controller-manager has been created or updated.
I0516 15:57:58.728859   98690 deploy.go:482] Create karmada scheduler Deployment
I0516 15:58:10.763913   98690 deploy.go:493] Create karmada controller manager Deployment
I0516 15:58:22.787659   98690 deploy.go:504] Create karmada webhook Deployment
I0516 15:58:22.798328   98690 idempotency.go:291] Service karmada-system/karmada-webhook has been created or updated.

------------------------------------------------------------------------------------------------------
 █████   ████   █████████   ███████████   ██████   ██████   █████████   ██████████     █████████
░░███   ███░   ███░░░░░███ ░░███░░░░░███ ░░██████ ██████   ███░░░░░███ ░░███░░░░███   ███░░░░░███
 ░███  ███    ░███    ░███  ░███    ░███  ░███░█████░███  ░███    ░███  ░███   ░░███ ░███    ░███
 ░███████     ░███████████  ░██████████   ░███░░███ ░███  ░███████████  ░███    ░███ ░███████████
 ░███░░███    ░███░░░░░███  ░███░░░░░███  ░███ ░░░  ░███  ░███░░░░░███  ░███    ░███ ░███░░░░░███
 ░███ ░░███   ░███    ░███  ░███    ░███  ░███      ░███  ░███    ░███  ░███    ███  ░███    ░███
 █████ ░░████ █████   █████ █████   █████ █████     █████ █████   █████ ██████████   █████   █████
░░░░░   ░░░░ ░░░░░   ░░░░░ ░░░░░   ░░░░░ ░░░░░     ░░░░░ ░░░░░   ░░░░░ ░░░░░░░░░░   ░░░░░   ░░░░░
------------------------------------------------------------------------------------------------------
Karmada is installed successfully.

Register Kubernetes cluster to Karmada control plane.

Register cluster with 'Push' mode

Step 1: Use "kubectl karmada join" command to register the cluster to Karmada control plane. --cluster-kubeconfig is kubeconfig of the member cluster.
(In karmada)~# MEMBER_CLUSTER_NAME=$(cat ~/.kube/config  | grep current-context | sed 's/: /\n/g'| sed '1d')
(In karmada)~# kubectl karmada --kubeconfig /etc/karmada/karmada-apiserver.config  join ${MEMBER_CLUSTER_NAME} --cluster-kubeconfig=$HOME/.kube/config

Step 2: Show members of karmada
(In karmada)~# kubectl --kubeconfig /etc/karmada/karmada-apiserver.config get clusters


Register cluster with 'Pull' mode

Step 1: Use "kubectl karmada register" command to register the cluster to Karmada control plane. "--cluster-name" is set to cluster of current-context by default.
(In member cluster)~# kubectl karmada register 192.168.247.4:32443 --token rflrr9.iisxtboo8dsz8jsv --discovery-token-ca-cert-hash sha256:008fb63e3b17c3e399f9688eca0978ab3a50dbe5d5b8d4f32c6bfd1fab12a1d8

Step 2: Show members of karmada
(In karmada)~# kubectl --kubeconfig /etc/karmada/karmada-apiserver.config get clusters
```

安装正常的话会看到如上所示的输出信息。默认 Karmada 会安装在 host 集群的 `karmada-system` 命名空间中：

```bash
$ kubectl get pods -n karmada-system --kubeconfig ~/.kube/host.config
NAME                                            READY   STATUS    RESTARTS   AGE
etcd-0                                          1/1     Running   0          35m
karmada-aggregated-apiserver-5fddf66847-nnfzv   1/1     Running   0          34m
karmada-apiserver-6b6f5b45-fkbk4                1/1     Running   0          35m
karmada-controller-manager-bbdf689db-rc67z      1/1     Running   0          34m
karmada-scheduler-78f854fbd4-m24c8              1/1     Running   0          34m
karmada-webhook-77b9945cf9-mkjrk                1/1     Running   0          33m
kube-controller-manager-5c4975bf8d-6tx5r        1/1     Running   0          34m
```

如上所示 Karmada 控制平面相关 Pod 都已经正常运行，接下来我们就可以将两个 member 集群注册到 Karmada 控制平面中了，注册集群有两种方式，一种是 `Push` 模式，一种是 `Pull` 模式：

- `Push`：Karmada 控制平面将直接访问成员集群的 kube-apiserver 以获取集群状态并部署清单。
- `Pull`：Karmada 控制平面不会访问成员集群，而是将其委托给名为 `Karmada-agent` 的额外组件。

我们这里的集群都使用的 KinD 搭建的，所以使用 `Push` 模式更方便，对于无法直接访问成员集群的环境下面可以使用 `Pull` 模式。

我们可以使用 `kubectl karmada join` 命令来注册集群到 Karmada 控制平面。

```bash
sudo kubectl karmada --kubeconfig /etc/karmada/karmada-apiserver.config join member1 --cluster-kubeconfig=$HOME/.kube/member1.config
sudo kubectl karmada --kubeconfig /etc/karmada/karmada-apiserver.config join member2 --cluster-kubeconfig=$HOME/.kube/member2.config
```

注册成功后可以查看注册的集群列表：

```bash
$ sudo kubectl --kubeconfig /etc/karmada/karmada-apiserver.config get clusters
NAME      VERSION   MODE   READY   AGE
member1   v1.27.3   Push   True    12m
member2   v1.27.3   Push   True    2s
```

到这里我们就完成了 Karmada 的安装和集群注册，接下来我们就可以使用 Karmada 来管理多集群了。

## 资源分发

接下来我们创建一个 Deployment 资源，然后使用 Karmada 将其分发到 member1 和 member2 集群中。首先创建如下所示的 Deployment 资源：

```yaml
# nginx-demo.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 2
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
```

要注意我们需要使用 Karmada 控制平面的 `kubeconfig` 文件来创建资源对象，因为 Karmada 控制平面会将资源对象分发到成员集群中，所以在应用资源对象时需要使用 `--kubeconfig /etc/karmada/karmada-apiserver.config` 参数。

```bash
# karmada-apiserver 是与 Karmada 控制面交互时要使用的主要 kubeconfig
$ kubectl apply -f nginx-demo.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
$ kubectl get pods --kubeconfig ~/.kube/member1.config
No resources found in default namespace.
$ kubectl get pods --kubeconfig ~/.kube/member2.config
No resources found in default namespace.
```

现在成员集群 member1 和 member2 下面并没有对应的对象。要进行资源分发我们需要使用一个名为 `PropagationPolicy`（或者 `ClusterPropagationPolicy`）的资源对象，该资源对象定义了如何将资源分发到成员集群中。比如我们要将上面的 Deployment 对象分发到 member1 和 member2 集群中，我们可以创建如下所示的 `PropagationPolicy` 对象：

```yaml
# nginx-propagation.yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: nginx-propagation
spec:
  resourceSelectors:
    - apiVersion: apps/v1
      kind: Deployment
      name: nginx
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
    replicaScheduling:
      replicaDivisionPreference: Weighted
      replicaSchedulingType: Divided
      weightPreference:
        staticWeightList:
          - targetCluster:
              clusterNames:
                - member1
            weight: 1
          - targetCluster:
              clusterNames:
                - member2
            weight: 1
```

在上面的 `PropagationPolicy` 对象中，首先我们通过 `resourceSelectors` 属性指定了要分发的资源对象，然后通过 `placement` 字段，指定了资源对象的分发策略。

其中 `.spec.placement.clusterAffinity` 字段表示对特定集群集合的调度限制，没有该限制，任何集群都可以成为调度候选者，该字段包含以下几个属性：

- `LabelSelector`：用于选择集群的标签，`matchLabels` 和 `matchExpressions` 两种方式都支持。
- `FieldSelector`：按字段选择成员集群的过滤器。
- `ClusterNames`：直接指定所选的集群。
- `ExcludeClusters`：排除指定的集群。

比如我们这里直接通过 `clusterNames` 属性指定了 member1 和 member2 集群，这意味着 Deployment 对象 `nginx` 可以被分发到 member1 和 member2 集群中。

此外我们还可以设置 `ClusterAffinities` 字段来声明多个集群组。调度器将按照它们在规范中出现的顺序逐一评估这些组，不满足调度限制的组将被忽略，这意味着该组中的所有集群都不会被选择。如果没有一个组满足调度限制，则调度失败，这意味着不会选择任何集群。

另外还要注意 `ClusterAffinities` 不能与 `ClusterAffinity` 共存。如果 `ClusterAffinity` 和 `ClusterAffinities` 均未设置，则任何集群都可以作为调度候选者。

比如现在我们有两个分组的集群，其中本地数据中心的私有集群可以是主要的集群，云提供商提供的托管集群可以是次组。因此，Karmada 调度程序更愿意将工作负载调度到主集群组，并且只有在主组不满足限制（例如缺乏资源）的情况下才会考虑第二组集群，那么就可以配置如下所示的 `PropagationPolicy` 对象：

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: test-propagation
spec:
  #...
  placement:
    clusterAffinities: # 逐一评估这些组
      - affinityName: local-clusters
        clusterNames:
          - local-member1
          - local-member2
      - affinityName: cloud-clusters
        clusterNames:
          - public-cloud-member1
          - public-cloud-member2
    #...
```

又比如对于灾难恢复的场景，集群可以分为 `primary` 集群和 `backup` 集群，工作负载将首先调度到主集群，当主集群发生故障（例如数据中心断电）时，Karmada 调度程序可以迁移工作负载到备份集群。这种情况下可以配置如下所示的 `PropagationPolicy` 对象：

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: test-propagation
spec:
  #...
  placement:
    clusterAffinities:
      - affinityName: primary-clusters
        clusterNames:
          - member1
      - affinityName: backup-clusters
        clusterNames:
          - member1
          - member2
    #...
```

现在我们已经指定了分发的集群，那么具体应该如何调度呢？哪一个集群应该有多少副本呢？这就需要指定调度策略了。和原生 Kubernetes 类似，Karmada 支持多种调度策略，比如支持容忍污点、权重等。

通过 `.spec.placement.clusterTolerations` 字段可以设置容忍度，与 kubernetes 一样，容忍需要与集群上的污点结合使用。在集群上设置一个或多个污点后，无法在这些集群上调度或运行工作负载，除非策略明确声明可以容忍这些污点。Karmada 目前支持效果为 `NoSchedule` 和 `NoExecute` 的污点。我们可以使用 `karmadactl taint` 命令来设置集群的污点：

```bash
# 为集群 foo 设置包含键 dedicated、值 special-user 和效果 NoSchedule 的污点
# 如果具有该键和效果的污点已经存在，则其值将按指定替换
karmadactl taint clusters foo dedicated=special-user:NoSchedule
```

为了调度到上述集群，我们需要在 `PropagationPolicy` 中声明以下内容：

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: nginx-propagation
spec:
  #...
  placement:
    clusterTolerations:
      - key: dedicated
        value: special-user
        Effect: NoSchedule
```

我们常常使用 `NoExecute` 污点来实现多集群故障转移。

然后更多的时候我们需要设置副本调度策略，我们可以通过 `.spec.placement.replicaScheduling` 字段来设置副本调度策略，该字段表示将规范中具有副本的资源传播到成员集群时处理副本数量的调度策略。Karmada 一共提供了两种副本调度类型，用于确定 Karmada 传播资源时如何调度副本：

- `Duplicated`：从资源中将相同的副本复制到每个候选成员集群。
- `Divided`：根据有效候选成员集群的数量将副本划分为若干部分，每个集群的确切副本由 `ReplicaDivisionPreference` 确定。

`ReplicaDivisionPreference` 用于描述当 `ReplicaSchedulingType` 为 `Divided` 时副本如何被划分，也提供了两种副本划分方式：

- `Aggregated`：将副本尽可能少地划分到集群，同时在划分过程中尊重集群的资源可用性。
- `Weighted`：根据 `WeightPreference` 按权重划分副本，一共有两种方式。`StaticWeightList` 根据权重静态分配副本到目标集群，可以通过 `ClusterAffinity` 选择目标集群。`DynamicWeight` 指定生成动态权重列表的因子，如果指定，`StaticWeightList` 将被忽略。

上面我们创建的 Nginx 的 `PropagationPolicy` 对象中，我们指定了 `ReplicaDivisionPreference` 为 `Weighted`，`ReplicaSchedulingType` 为 `Divided`，`weightPreference` 为 `1`，表示两个集群的权重相同，这意味着副本将均匀地传播到 member1 和 member2。

我们这里直接应用传播策略资源对象即可：

```bash
$ sudo kubectl apply -f samples/nginx/propagationpolicy.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
propagationpolicy.policy.karmada.io/nginx-propagation created
$ sudo kubectl get propagationpolicy --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                AGE
nginx-propagation   31s
```

当创建 `PropagationPolicy` 对象后，Karmada 控制平面 watch 到过后就会自动将资源对象分发到成员集群中，我们可以查看 Deployment 对象的状态：

```bash
$ sudo kubectl describe deploy nginx --kubeconfig /etc/karmada/karmada-apiserver.config
# ......
Events:
  Type    Reason                  Age                    From                                Message
  ----    ------                  ----                   ----                                -------
  Normal  ApplyPolicySucceed      2m17s (x2 over 2m17s)  resource-detector                   Apply policy(default/nginx-propagation) succeed
  Normal  SyncWorkSucceed         2m17s (x3 over 2m17s)  binding-controller                  Sync work of resourceBinding(default/nginx-deployment) successful.
  Normal  ScheduleBindingSucceed  2m17s                  default-scheduler                   Binding has been scheduled successfully.
  Normal  SyncSucceed             2m17s                  execution-controller                Successfully applied resource(default/nginx) to cluster member2
  Normal  SyncSucceed             2m17s                  execution-controller                Successfully applied resource(default/nginx) to cluster member1
  Normal  AggregateStatusSucceed  2m2s (x9 over 2m17s)   resource-binding-status-controller  Update resourceBinding(default/nginx-deployment) with AggregatedStatus successfully.
```

可以看到 Deployment 对象已经成功分发到了 member1 和 member2 集群中，我们也可以查看 member1 和 member2 集群中的 Pod 对象来进行验证：

```bash
$ kubectl get pods --kubeconfig ~/.kube/member1.config
NAME                     READY   STATUS    RESTARTS   AGE
nginx-77b4fdf86c-54qhc   1/1     Running   0          2m59s
$ kubectl get pods --kubeconfig ~/.kube/member2.config
NAME                     READY   STATUS    RESTARTS   AGE
nginx-77b4fdf86c-9x98b   1/1     Running   0          3m24s
```

和我们声明的副本调度策略一样，两个 Pod 对象均匀地分布在 member1 和 member2 集群中。

## 分发 CRD

除了内置的资源对象之外，Karmada 还支持分发自定义资源对象（CRD）。这里我们以 Karmada 仓库中的 `guestbook` 为例进行说明。

首先进入 Karmada 仓库的 guestbook 目录下：

```bash
➜  cd samples/guestbook
➜  guestbook git:(master) ll
total 48
-rw-r--r--  1 cnych  staff   1.8K May 16 11:26 README.md
-rw-r--r--  1 cnych  staff   135B May 16 11:26 guestbook.yaml
-rw-r--r--  1 cnych  staff   353B May 16 11:26 guestbooks-clusterpropagationpolicy.yaml
-rw-r--r--  1 cnych  staff   2.7K May 16 11:26 guestbooks-crd.yaml
-rw-r--r--  1 cnych  staff   455B May 16 11:26 guestbooks-overridepolicy.yaml
-rw-r--r--  1 cnych  staff   255B May 16 11:26 guestbooks-propagationpolicy.yaml
```

然后在 Karmada 的控制平面上创建 Guestbook CRD：

```bash
sudo kubectl apply -f guestbooks-crd.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

该 CRD 应该被应用到 `karmada-apiserver`。

然后我们可以创建一个 `ClusterPropagationPolicy` 对象，将 Guestbook CRD 分发到 member1，如下所示：

```yaml
# guestbooks-clusterpropagationpolicy.yaml
apiVersion: policy.karmada.io/v1alpha1
kind: ClusterPropagationPolicy
metadata:
  name: example-policy
spec:
  resourceSelectors:
    - apiVersion: apiextensions.k8s.io/v1
      kind: CustomResourceDefinition
      name: guestbooks.webapp.my.domain
  placement:
    clusterAffinity:
      clusterNames:
        - member1
```

需要注意的是 `CustomResourceDefinition` 是全局资源，所以我们使用 `ClusterPropagationPolicy` 对象来分发，该对象的配置和 `PropagationPolicy` 对象类似，注意 `resourceSelectors` 字段中的 `apiVersion` 和 `kind` 需要设置为 `apiextensions.k8s.io/v1` 和 `CustomResourceDefinition`，`name` 字段需要设置为 Guestbook CRD 的名称。

然后我们直接创建 `ClusterPropagationPolicy` 对象即可：

```bash
sudo kubectl apply -f guestbooks-clusterpropagationpolicy.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

应用后正常就会将 Guestbook CRD 对象分发到 member1 集群中。

```bash
$ sudo kubectl karmada get crd --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                          CLUSTER   CREATED AT             ADOPTION
guestbooks.webapp.my.domain   member1   2024-05-18T11:56:10Z   Y
$ kubectl get crd --kubeconfig ~/.kube/member1.config
NAME                          CREATED AT
guestbooks.webapp.my.domain   2024-05-18T11:56:10Z
$ kubectl get crd --kubeconfig ~/.kube/member2.config
No resources found
```

接下来我们就可以部署分发 Guestbook CRD 对象了，我们可以创建一个 Guestbook CR 对象：

```yaml
# guestbook.yaml
apiVersion: webapp.my.domain/v1
kind: Guestbook
metadata:
  name: guestbook-sample
spec:
  size: 2
  configMapName: test
  alias: Name
```

同样在 Karmada 控制平面上应用该 Guestbook CR 对象即可：

```bash
$ sudo kubectl apply -f guestbook.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

然后就可以创建 `PropagationPolicy` 对象，将 `guestbook-sample` 分发到 member1 集群：

```yaml
# guestbooks-propagationpolicy.yaml
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: example-policy
spec:
  resourceSelectors:
    - apiVersion: webapp.my.domain/v1
      kind: Guestbook
  placement:
    clusterAffinity:
      clusterNames:
        - member1
```

上面的 `PropagationPolicy` 对象和我们之前创建的类似，只是这里的 `resourceSelectors` 字段中的 `apiVersion` 和 `kind` 需要设置为 `webapp.my.domain/v1` 和 `Guestbook`（我们自己的 CRD）。同样直接应用该 `PropagationPolicy` 对象即可：

```bash
$ sudo kubectl apply -f guestbooks-propagationpolicy.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

应用后就可以将 `guestbook-sample` 这个 Guestbook CR 对象分发到 member1 集群中了。

```bash
$ kubectl get guestbook --kubeconfig ~/.kube/member1.config
NAME               AGE
guestbook-sample   39s
```

可以看到 CRD 的分发和普通资源对象的分发原理是一样的，只是需要先将 CRD 对象分发到成员集群中。

有的时候我们可能需要对分发的资源到不同集群进行一些覆盖操作，这个时候我们就可以使用 `OverridePolicy` 和 `ClusterOverridePolicy` 对象，用于声明资源传播到不同集群时的覆盖规则。

比如我们创建一个 `OverridePolicy` 对象，用于覆盖 member1 中 `guestbook-sample` 的 size 字段，如下所示：

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: OverridePolicy
metadata:
  name: guestbook-sample
spec:
  resourceSelectors:
    - apiVersion: webapp.my.domain/v1
      kind: Guestbook
  overrideRules:
    - targetCluster:
        clusterNames:
          - member1
      overriders:
        plaintext:
          - path: /spec/size
            operator: replace
            value: 4
          - path: /metadata/annotations
            operator: add
            value: { "OverridePolicy": "test" }
```

上面的对象中通过 `resourceSelectors` 字段指定了要覆盖的资源对象，然后通过 `overrideRules` 字段指定了覆盖规则，`targetCluster` 字段指定了目标集群，`overriders` 字段指定了覆盖规则，这里我们将 `guestbook-sample` 的 size 字段覆盖为 4，同时添加了一个 `OverridePolicy: test` 的注解。

我们直接应用该 `OverridePolicy` 对象即可：

```bash
$ sudo kubectl apply -f guestbooks-overridepolicy.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

创建完成后可以查看 member1 集群中的 `guestbook-sample` 对象来进行验证：

```bash
$ kubectl get guestbook guestbook-sample --kubeconfig ~/.kube/member1.config -oyaml
apiVersion: webapp.my.domain/v1
kind: Guestbook
metadata:
  annotations:
    OverridePolicy: test
# ......
  name: guestbook-sample
  namespace: default
  resourceVersion: "82669"
  uid: 5893b85d-3946-44a0-b210-d67bd021cb65
spec:
  alias: Name
  configMapName: test
  size: 4
```

可以看到 `guestbook-sample` 对象的 `size` 字段已经被覆盖为 4，同时添加了一个 `OverridePolicy: test` 的注解，证明覆盖操作成功。

Karmada 提供了多种声明覆盖规则的方案：

- `ImageOverrider`：覆盖工作负载的镜像。
- `CommandOverrider`：覆盖工作负载的命令。
- `ArgsOverrider`：覆盖工作负载的参数。
- `LabelsOverrider`：覆盖工作负载的标签。
- `AnnotationsOverrider`：覆盖工作负载的注释。
- `PlaintextOverrider`：用于覆盖任何类型资源的通用工具。

**PlaintextOverrider**

上面我们使用的是 `PlaintextOverrider` 覆盖规则，可以覆盖任何类型资源的字段。`PlaintextOverrider` 可以根据路径、运算符和值覆盖目标字段，就像 `kubectl patch` 一样。允许的操作如下：

- `add`：向资源追加一个或多个元素。
- `remove`：从资源中删除一个或多个元素。
- `replace`：替换资源中的一个或多个元素。

**ImageOverrider**

`ImageOverrider` 用于覆盖工作负载的镜像，用于覆盖格式为 `[registry/]repository[:tag|@digest]`（例如 `/spec/template/spec/containers/0/image` ）的镜像。允许的操作如下：

- `add`：将注册表、存储库或 tag/digest 附加到容器中的镜像。
- `remove`：从容器中的镜像中删除注册表、存储库或 tag/digest。
- `replace`：替换容器中镜像的注册表、存储库或 tag/digest。

比如我们需要创建一个如下所示的 Deployment 对象：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  #...
spec:
  template:
    spec:
      containers:
        - image: myapp:1.0.0
          name: myapp
```

当工作负载传播到特定集群时添加注册表，可以使用如下所示的 `OverridePolicy` 对象：

```yaml
apiVersion: policy.karmada.io/v1alpha1
kind: OverridePolicy
metadata:
  name: example
spec:
  #...
  overrideRules:
    - overriders:
        imageOverrider:
          - component: Registry
            operator: add
            value: test-repo
```

上面的覆盖规则表示添加 `test-repo` 这个镜像仓库到 `myapp` 的镜像中，这样在传播到集群时就会变成 `test-repo/myapp:1.0.0`。

```yaml
containers:
  - image: test-repo/myapp:1.0.0
    name: myapp
```

`replace` 和 `remove` 操作也是类似的，只是分别用于替换和删除镜像中的某些字段。

## 跨集群弹性伸缩

在 Karmada 中，我们可以使用 `FederatedHPA` 来实现跨多个集群扩展/缩小工作负载的副本，旨在根据需求自动调整工作负载的规模。

![FederatedHPA](https://picdn.youdianzhishi.com/images/1716076457941.png)

当负载增加时，如果 Pod 的数量低于配置的最大值，则 `FederatedHPA` 扩展工作负载（例如 Deployment、StatefulSet 或其他类似资源）的副本数。当负载减少时，如果 Pod 的数量高于配置的最小值，则 `FederatedHPA` 缩小工作负载的副本数。

`FederatedHPA` 是作为 Karmada API 资源和控制器实现的，该资源确定了控制器的行为。`FederatedHPA` 控制器运行在 Karmada 控制平面中，定期调整其目标（例如 Deployment）的所需规模，以匹配观察到的指标，例如平均 CPU 利用率、平均内存利用率或任何其他自定义指标。

![FederatedHPA实现原理](https://picdn.youdianzhishi.com/images/1716076528513.png)

为了实现跨集群的自动扩缩容，Karmada 引入了 `FederatedHPA` 控制器和 `karmada-metrics-adapter`，它们的工作方式如下：

- HPA 控制器定期通过指标 API `metrics.k8s.io` 或 `custom.metrics.k8s.io` 使用标签选择器查询指标。
- `karmada-apiserver` 获取指标 API 查询结果，然后通过 API 服务注册将其路由到 `karmada-metrics-adapter`。
- `karmada-metrics-adapter` 将从目标集群（Pod 所在的集群）查询指标。收集到指标后，它会对这些指标进行聚合并返回结果。
- HPA 控制器将根据指标计算所需的副本数，并直接扩展/缩小工作负载的规模。然后，`karmada-scheduler` 将这些副本调度到成员集群中。

> 注意：要使用此功能，Karmada 版本必须为 v1.6.0 或更高版本。

下面我们就来演示如何使用 `FederatedHPA` 控制器来实现跨集群的自动扩缩容。首先至少需要两个成员集群，我们需要在成员集群中安装 `ServiceExport` 和 `ServiceImport` 来启用多集群服务。在 Karmada 控制平面上安装 `ServiceExport` 和 `ServiceImport` 后（init 安装后会自动安装），我 ​​ 们可以创建 `ClusterPropagationPolicy` 将这两个 CRD 传播到成员集群。

```yaml
# propagate-service-export-import.yaml
# propagate ServiceExport CRD
apiVersion: policy.karmada.io/v1alpha1
kind: ClusterPropagationPolicy
metadata:
  name: serviceexport-policy
spec:
  resourceSelectors:
    - apiVersion: apiextensions.k8s.io/v1
      kind: CustomResourceDefinition
      name: serviceexports.multicluster.x-k8s.io
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
---
# propagate ServiceImport CRD
apiVersion: policy.karmada.io/v1alpha1
kind: ClusterPropagationPolicy
metadata:
  name: serviceimport-policy
spec:
  resourceSelectors:
    - apiVersion: apiextensions.k8s.io/v1
      kind: CustomResourceDefinition
      name: serviceimports.multicluster.x-k8s.io
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
```

直接应用该 `ClusterPropagationPolicy` 对象即可：

```bash
$ sudo kubectl apply -f propagate-service-export-import.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

应用后就可以在 member1 和 member2 集群中创建 `ServiceExport` 和 `ServiceImport` 对象了。

另外我们还需要为成员集群安装 `metrics-server` 来提供 metrics API，通过运行以下命令来安装：

```bash
hack/deploy-k8s-metrics-server.sh $HOME/.kube/member1.config member1
hack/deploy-k8s-metrics-server.sh $HOME/.kube/member2.config member2
```

最后我们还需要在 Karmada 控制平面中安装 `karmada-metrics-adapter` 以提供指标 API，通过运行以下命令来安装它：

```bash
sudo hack/deploy-metrics-adapter.sh ~/.kube/host.config host /etc/karmada/karmada-apiserver.config karmada-apiserver
```

> 需要注意使用 `karmada init` 安装的 Karmada 控制平面，需要将 `karmada-cert` 这个 Secret 对象重新拷贝创建一个名为 `karmada-cert-secret` 的 Secret 对象。

部署后在 Karmada 控制平面中就会有 `karmada-metrics-adapter` 这个 Pod 对象。

接下来我们在 member1 和 member2 中部署 Deployment（1 个副本）和 Service 对象，如下所示：

```yaml
# nginx.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - image: nginx
          name: nginx
          resources:
            requests:
              cpu: 25m
              memory: 64Mi
            limits:
              cpu: 25m
              memory: 64Mi
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: nginx
---
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: nginx-propagation
spec:
  resourceSelectors:
    - apiVersion: apps/v1
      kind: Deployment
      name: nginx
    - apiVersion: v1
      kind: Service
      name: nginx-service
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
    replicaScheduling:
      replicaDivisionPreference: Weighted
      replicaSchedulingType: Divided
      weightPreference:
        staticWeightList:
          - targetCluster:
              clusterNames:
                - member1
            weight: 1
          - targetCluster:
              clusterNames:
                - member2
            weight: 1
```

直接应用上面的资源对象即可：

```bash
$ sudo kubectl apply -f nginx.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
deployment.apps/nginx configured
service/nginx-service created
propagationpolicy.policy.karmada.io/nginx-propagation configured
$ sudo kubectl karmada get pods --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                     CLUSTER   READY   STATUS    RESTARTS   AGE
nginx-5c54b4855f-ztmnk   member1   1/1     Running   0          43s
$ sudo kubectl karmada get svc --kubeconfig /etc/karmada/karmada-apiserver.config
NAME            CLUSTER   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE     ADOPTION
nginx-service   member2   ClusterIP   100.171.35.78    <none>        80/TCP    52s     Y
nginx-service   member1   ClusterIP   100.91.124.245   <none>        80/TCP    52s     Y
```

然后让我们在 Karmada 控制平面中部署一个 `FederatedHPA` 对象，用来自动扩缩容，如下所示：

```yaml
# nginx-federatedhpa.yaml
apiVersion: autoscaling.karmada.io/v1alpha1
kind: FederatedHPA
metadata:
  name: nginx
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
  minReplicas: 1
  maxReplicas: 10
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 10
    scaleUp:
      stabilizationWindowSeconds: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 10
```

上面的 `FederatedHPA` 对象中，我们指定了 `scaleTargetRef` 字段为 `Deployment` 对象 `nginx`，`minReplicas` 和 `maxReplicas` 分别为 1 和 10，`metrics` 字段中指定了 CPU 利用率为 10% 时进行扩缩容。同样直接应用该 `FederatedHPA` 对象即可：

```bash
$ sudo kubectl apply -f nginx-federatedhpa.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
$ sudo kubectl get fhpa --kubeconfig /etc/karmada/karmada-apiserver.config
NAME    REFERENCE-KIND   REFERENCE-NAME   MINPODS   MAXPODS   REPLICAS   AGE
nginx   Deployment       nginx            1         10        1          19s
```

我们还需要一个多集群服务将请求路由到 member1 和 member2 集群中的 pod。首先在 Karmada 控制平面上创建 `ServiceExport` 对象，然后创建 `PropagationPolicy` 以将 `ServiceExport` 对象传播到 member1 和 member2 集群。

```yaml
# nginx-serviceexport.yaml
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ServiceExport
metadata:
  name: nginx-service
---
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: serve-export-policy
spec:
  resourceSelectors:
    - apiVersion: multicluster.x-k8s.io/v1alpha1
      kind: ServiceExport
      name: nginx-service
  placement:
    clusterAffinity:
      clusterNames:
        - member1
        - member2
```

然后在 Karmada 控制平面上创建 `ServiceImport` 对象，然后创建 `PropagationPolicy` 以将 `ServiceImport` 对象传播到 member1 集群。

```yaml
# nginx-serviceimport.yaml
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ServiceImport
metadata:
  name: nginx-service
spec:
  type: ClusterSetIP
  ports:
    - port: 80
      protocol: TCP
---
apiVersion: policy.karmada.io/v1alpha1
kind: PropagationPolicy
metadata:
  name: serve-import-policy
spec:
  resourceSelectors:
    - apiVersion: multicluster.x-k8s.io/v1alpha1
      kind: ServiceImport
      name: nginx-service
  placement:
    clusterAffinity:
      clusterNames:
        - member1
```

直接应用上面的资源对象即可：

```bash
$ sudo kubectl apply -f nginx-serviceexport.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
$ sudo kubectl apply -f nginx-serviceimport.yaml --kubeconfig /etc/karmada/karmada-apiserver.config
```

部署完成后，可以查看多集群服务：

```bash
$ sudo kubectl karmada get svc --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                    CLUSTER   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE     ADOPTION
nginx-service           member2   ClusterIP   100.171.35.78    <none>        80/TCP    6m36s   Y
derived-nginx-service   member1   ClusterIP   100.91.3.68      <none>        80/TCP    17s     Y
nginx-service           member1   ClusterIP   100.91.124.245   <none>        80/TCP    6m36s   Y
```

接下来我们在 member1 集群使用 `hey` 工具来进行 http 负载测试，模拟请求增加，从而触发 Pod 的 CPU 使用率增加：

```bash
$ wget https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64
$ chmod +x hey_linux_amd64
$ docker cp hey_linux_amd64 member1-control-plane:/usr/local/bin/hey
```

然后我们可以使用 `hey` 请求多集群服务以增加 nginx pod 的 CPU 使用率。

```bash
$ docker exec member1-control-plane hey -c 1000 -z 1m http://100.91.3.68

Summary:
  Total:        61.4678 secs
  Slowest:      4.7916 secs
  Fastest:      0.0244 secs
  Average:      0.9024 secs
  Requests/sec: 1090.3758

  Total data:   41219145 bytes
  Size/request: 615 bytes

Response time histogram:
  0.024 [1]     |
  0.501 [23047] |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  0.978 [23117] |■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  1.455 [8696]  |■■■■■■■■■■■■■■■
  1.931 [5681]  |■■■■■■■■■■
  2.408 [3352]  |■■■■■■
  2.885 [1534]  |■■■
  3.361 [832]   |■
  3.838 [375]   |■
  4.315 [318]   |■
  4.792 [70]    |


Latency distribution:
  10% in 0.2733 secs
  25% in 0.4264 secs
  50% in 0.6478 secs
  75% in 1.1603 secs
  90% in 1.9114 secs
  95% in 2.3694 secs
  99% in 3.4382 secs

Details (average, fastest, slowest):
  DNS+dialup:   0.0019 secs, 0.0244 secs, 4.7916 secs
  DNS-lookup:   0.0000 secs, 0.0000 secs, 0.0000 secs
  req write:    0.0006 secs, 0.0000 secs, 0.1423 secs
  resp wait:    0.7861 secs, 0.0002 secs, 4.6641 secs
  resp read:    0.0553 secs, 0.0000 secs, 1.3870 secs

Status code distribution:
  [200] 67023 responses

```

等一会儿，副本就会开始扩容了，我们可以查看 `FederatedHPA` 对象的状态来了解副本的变化：

```bash
$ sudo kubectl describe fhpa nginx --kubeconfig /etc/karmada/karmada-apiserver.config
Name:         nginx
Namespace:    default
Labels:       <none>
Annotations:  <none>
API Version:  autoscaling.karmada.io/v1alpha1
Kind:         FederatedHPA
# ...
Spec:
  Behavior:
    Scale Down:
      Policies:
        Period Seconds:              15
        Type:                        Percent
        Value:                       100
      Select Policy:                 Max
      Stabilization Window Seconds:  10
    Scale Up:
      Policies:
        Period Seconds:              15
        Type:                        Pods
        Value:                       4
        Period Seconds:              15
        Type:                        Percent
        Value:                       100
      Select Policy:                 Max
      Stabilization Window Seconds:  10
  Max Replicas:                      10
  Metrics:
    Resource:
      Name:  cpu
      Target:
        Average Utilization:  10
        Type:                 Utilization
    Type:                     Resource
  Min Replicas:               1
  Scale Target Ref:
    API Version:  apps/v1
    Kind:         Deployment
    Name:         nginx
Status:
  Conditions:
    Last Transition Time:  2024-05-19T01:43:16Z
    Message:               recommended size matches current size
    Reason:                ReadyForNewScale
    Status:                True
    Type:                  AbleToScale
    Last Transition Time:  2024-05-19T01:43:16Z
    Message:               the HPA was able to successfully calculate a replica count from cpu resource utilization (percentage of request)
    Reason:                ValidMetricFound
    Status:                True
    Type:                  ScalingActive
    Last Transition Time:  2024-05-19T01:45:16Z
    Message:               the desired replica count is less than the minimum replica count
    Reason:                TooFewReplicas
    Status:                True
    Type:                  ScalingLimited
  Current Metrics:
    Resource:
      Current:
        Average Utilization:  0
        Average Value:        0
      Name:                   cpu
    Type:                     Resource
  Current Replicas:           1
  Desired Replicas:           1
  Last Scale Time:            2024-05-19T01:45:16Z
Events:
  Type    Reason             Age   From                     Message
  ----    ------             ----  ----                     -------
  Normal  SuccessfulRescale  2m7s  federatedHPA-controller  New size: 5; reason: cpu resource utilization (percentage of request) above target
  Normal  SuccessfulRescale  112s  federatedHPA-controller  New size: 10; reason: cpu resource utilization (percentage of request) above target
  Normal  SuccessfulRescale  67s   federatedHPA-controller  New size: 3; reason: All metrics below target
  Normal  SuccessfulRescale  52s   federatedHPA-controller  New size: 1; reason: All metrics below target
```

同时可以查看 member1 和 member2 集群中的 Pod 对象：

```bash
$ sudo kubectl karmada get pods --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                     CLUSTER   READY   STATUS    RESTARTS   AGE
nginx-5c54b4855f-4p6wq   member1   1/1     Running   0          40s
nginx-5c54b4855f-kdwpc   member1   1/1     Running   0          2m6s
nginx-5c54b4855f-l4vm4   member1   1/1     Running   0          40s
nginx-5c54b4855f-t4ghv   member1   1/1     Running   0          25s
nginx-5c54b4855f-vbj9c   member1   1/1     Running   0          25s
nginx-5c54b4855f-hx2xn   member2   1/1     Running   0          25s
nginx-5c54b4855f-kfnbh   member2   1/1     Running   0          40s
nginx-5c54b4855f-rmbv9   member2   1/1     Running   0          40s
nginx-5c54b4855f-wfd92   member2   1/1     Running   0          25s
nginx-5c54b4855f-wwsvq   member2   1/1     Running   0          25s
```

可以看到 Pod 的副本数已经扩容到 10 个了。同样当负载测试结束后，Pod 的副本数会自动缩小为 1 个副本。

```bash
$ sudo kubectl karmada get pods --kubeconfig /etc/karmada/karmada-apiserver.config
NAME                     CLUSTER   READY   STATUS    RESTARTS   AGE
nginx-5c54b4855f-kdwpc   member1   1/1     Running   0          5m25s
```

到这里我们就完成了使用 `FederatedHPA` 进行跨集群的自动扩缩容，除此之外我们还可以使用 `CronFederatedHPA` 用于定期自动缩放操作，它可以缩放具有 scale 子资源的工作负载或 Karmada FederatedHPA。典型的场景是在可预见的流量高峰到来前提前扩容工作负载。例如，如果我知道每天早上 9 点会突发流量洪峰，我们就可以提前半个小时扩容相关服务，以处理高峰负载并确保服务持续可用性。在 Karmada 控制平面内运行的 `CronFederatedHPA` 控制器根据预定义的 cron 计划来伸缩工作负载的副本或 `FederatedHPA` 的最小/最大副本数。

比如我们有一个如下所示的 `CronFederatedHPA` 对象：

```yaml
apiVersion: autoscaling.karmada.io/v1alpha1
kind: CronFederatedHPA
metadata:
  name: nginx-cronfhpa
  namespace: default
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx
  rules:
    - name: "scale-up"
      schedule: "*/1 * * * *"
      targetReplicas: 5
      suspend: false
```

其中表达式 `*/1 * * * *` 的意思是 nginx deployment 的副本应该每分钟更新为 5 个，确保了处理接下来的流量突发流量洪峰。

除了这些使用场景之外，Karmada 还有很多实践场景，比如跨集群的灾备、多集群网络、多集群服务治理、多集群 CI/CD 等等，这些场景都可以通过 Karmada 来实现，更多最佳实践方案可以参考 [Karmada 官方文档](https://karmada.io/zh/docs/)以了解更多。

> 参考链接：https://karmada.io/zh/docs/
