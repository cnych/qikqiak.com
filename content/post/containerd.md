---
title: 一文搞懂容器运行时 Containerd
date: 2021-08-12
tags: ["kubernetes", "docker", "containerd"]
slug: containerd-usage
keywords: ["kubernetes", "docker", "containerd", "容器运行时", "OCI", "CRI", "runc"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210812213346.png", desc: "https://unsplash.com/photos/ZXnhTNY94Zs"}]
category: "kubernetes"
---

在学习 Containerd 之前我们有必要对 Docker 的发展历史做一个简单的回顾，因为这里面牵涉到的组件实战是有点多，有很多我们会经常听到，但是不清楚这些组件到底是干什么用的，比如 `libcontainer`、`runc`、`containerd`、`CRI`、`OCI` 等等。

<!--more-->

## Docker

从 Docker 1.11 版本开始，Docker 容器运行就不是简单通过 Docker Daemon 来启动了，而是通过集成 containerd、runc 等多个组件来完成的。虽然 Docker Daemon 守护进程模块在不停的重构，但是基本功能和定位没有太大的变化，一直都是 CS 架构，守护进程负责和 Docker Client 端交互，并管理 Docker 镜像和容器。现在的架构中组件 containerd 就会负责集群节点上容器的生命周期管理，并向上为 Docker Daemon 提供 gRPC 接口。

![docker 架构](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210809154608.png)

当我们要创建一个容器的时候，现在 Docker Daemon 并不能直接帮我们创建了，而是请求 `containerd` 来创建一个容器，containerd 收到请求后，也并不会直接去操作容器，而是创建一个叫做 `containerd-shim` 的进程，让这个进程去操作容器，我们指定容器进程是需要一个父进程来做状态收集、维持 stdin 等 fd 打开等工作的，假如这个父进程就是 containerd，那如果 containerd 挂掉的话，整个宿主机上所有的容器都得退出了，而引入 `containerd-shim` 这个垫片就可以来规避这个问题了。

然后创建容器需要做一些 namespaces 和 cgroups 的配置，以及挂载 root 文件系统等操作，这些操作其实已经有了标准的规范，那就是 OCI（开放容器标准），`runc` 就是它的一个参考实现（Docker 被逼无耐将 `libcontainer` 捐献出来改名为 `runc` 的），这个标准其实就是一个文档，主要规定了容器镜像的结构、以及容器需要接收哪些操作指令，比如 create、start、stop、delete 等这些命令。`runc` 就可以按照这个 OCI 文档来创建一个符合规范的容器，既然是标准肯定就有其他 OCI 实现，比如 Kata、gVisor 这些容器运行时都是符合 OCI 标准的。

所以真正启动容器是通过 `containerd-shim` 去调用 `runc` 来启动容器的，`runc` 启动完容器后本身会直接退出，`containerd-shim` 则会成为容器进程的父进程, 负责收集容器进程的状态, 上报给 containerd, 并在容器中 pid 为 1 的进程退出后接管容器中的子进程进行清理, 确保不会出现僵尸进程。

而 Docker 将容器操作都迁移到 `containerd` 中去是因为当前做 Swarm，想要进军 PaaS 市场，做了这个架构切分，让 Docker Daemon 专门去负责上层的封装编排，当然后面的结果我们知道 Swarm 在 Kubernetes 面前是惨败，然后 Docker 公司就把 `containerd` 项目捐献给了 CNCF 基金会，这个也是现在的 Docker 架构。

## CRI

我们知道 Kubernetes 提供了一个 CRI 的容器运行时接口，那么这个 CRI 到底是什么呢？这个其实也和 Docker 的发展密切相关的。

在 Kubernetes 早期的时候，当时 Docker 实在是太火了，Kubernetes 当然会先选择支持 Docker，而且是通过硬编码的方式直接调用 Docker API，后面随着 Docker 的不断发展以及 Google 的主导，出现了更多容器运行时，Kubernetes 为了支持更多更精简的容器运行时，Google 就和红帽主导推出了 CRI 标准，用于将 Kubernetes 平台和特定的容器运行时（当然主要是为了干掉 Docker）解耦。

`CRI`（Container Runtime Interface 容器运行时接口）本质上就是 Kubernetes 定义的一组与容器运行时进行交互的接口，所以只要实现了这套接口的容器运行时都可以对接到 Kubernetes 平台上来。不过 Kubernetes 推出 CRI 这套标准的时候还没有现在的统治地位，所以有一些容器运行时可能不会自身就去实现 CRI 接口，于是就有了 `shim（垫片）`， 一个 shim 的职责就是作为适配器将各种容器运行时本身的接口适配到 Kubernetes 的 CRI 接口上，其中 `dockershim` 就是 Kubernetes 对接 Docker 到 CRI 接口上的一个垫片实现。

![cri shim](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210809172030.png)

Kubelet 通过 gRPC 框架与容器运行时或 shim 进行通信，其中 kubelet 作为客户端，CRI shim（也可能是容器运行时本身）作为服务器。

CRI 定义的 API(https://github.com/kubernetes/kubernetes/blob/release-1.5/pkg/kubelet/api/v1alpha1/runtime/api.proto) 主要包括两个 gRPC 服务，`ImageService` 和 `RuntimeService`，`ImageService` 服务主要是拉取镜像、查看和删除镜像等操作，`RuntimeService` 则是用来管理 Pod 和容器的生命周期，以及与容器交互的调用（exec/attach/port-forward）等操作，可以通过 kubelet 中的标志 `--container-runtime-endpoint` 和 `--image-service-endpoint` 来配置这两个服务的套接字。

![kubelet cri](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210809173134.png)

不过这里同样也有一个例外，那就是 Docker，由于 Docker 当时的江湖地位很高，Kubernetes 是直接内置了 `dockershim` 在 kubelet 中的，所以如果你使用的是 Docker 这种容器运行时的话是不需要单独去安装配置适配器之类的，当然这个举动似乎也麻痹了 Docker 公司。

![dockershim](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210809173555.png)

现在如果我们使用的是 Docker 的话，当我们在 Kubernetes 中创建一个 Pod 的时候，首先就是 kubelet 通过 CRI 接口调用 `dockershim`，请求创建一个容器，kubelet 可以视作一个简单的 CRI Client, 而 dockershim 就是接收请求的 Server，不过他们都是在 kubelet 内置的。

`dockershim` 收到请求后, 转化成 Docker Daemon 能识别的请求, 发到 Docker Daemon 上请求创建一个容器，请求到了 Docker Daemon 后续就是 Docker 创建容器的流程了，去调用 `containerd`，然后创建 `containerd-shim` 进程，通过该进程去调用 `runc` 去真正创建容器。

其实我们仔细观察也不难发现使用 Docker 的话其实是调用链比较长的，真正容器相关的操作其实 containerd 就完全足够了，Docker 太过于复杂笨重了，当然 Docker 深受欢迎的很大一个原因就是提供了很多对用户操作比较友好的功能，但是对于 Kubernetes 来说压根不需要这些功能，因为都是通过接口去操作容器的，所以自然也就可以将容器运行时切换到 containerd 来。

![切换到containerd](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810094948.png)

切换到 containerd 可以消除掉中间环节，操作体验也和以前一样，但是由于直接用容器运行时调度容器，所以它们对 Docker 来说是不可见的。 因此，你以前用来检查这些容器的 Docker 工具就不能使用了。

你不能再使用 `docker ps` 或 `docker inspect` 命令来获取容器信息。由于不能列出容器，因此也不能获取日志、停止容器，甚至不能通过 `docker exec` 在容器中执行命令。

当然我们仍然可以下载镜像，或者用 `docker build` 命令构建镜像，但用 Docker 构建、下载的镜像，对于容器运行时和 Kubernetes，均不可见。为了在 Kubernetes 中使用，需要把镜像推送到镜像仓库中去。

从上图可以看出在 containerd 1.0 中，对 CRI 的适配是通过一个单独的 `CRI-Containerd` 进程来完成的，这是因为最开始 containerd 还会去适配其他的系统（比如 swarm），所以没有直接实现 CRI，所以这个对接工作就交给 `CRI-Containerd` 这个 shim 了。

然后到了 containerd 1.1 版本后就去掉了 `CRI-Containerd` 这个 shim，直接把适配逻辑作为插件的方式集成到了 containerd 主进程中，现在这样的调用就更加简洁了。

![containerd cri](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810095546.png)

与此同时 Kubernetes 社区也做了一个专门用于 Kubernetes 的 CRI 运行时 [CRI-O](https://cri-o.io/)，直接兼容 CRI 和 OCI 规范。

![cri-o](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810100752.png)

这个方案和 containerd 的方案显然比默认的 dockershim 简洁很多，不过由于大部分用户都比较习惯使用 Docker，所以大家还是更喜欢使用 `dockershim` 方案。

但是随着 CRI 方案的发展，以及其他容器运行时对 CRI 的支持越来越完善，Kubernetes 社区在2020年7月份就开始着手移除 dockershim 方案了：https://github.com/kubernetes/enhancements/tree/master/keps/sig-node/2221-remove-dockershim，现在的移除计划是在 1.20 版本中将 kubelet 中内置的 dockershim 代码分离，将内置的 dockershim 标记为`维护模式`，当然这个时候仍然还可以使用 dockershim，目标是在 1.23/1.24 版本发布没有 dockershim 的版本（代码还在，但是要默认支持开箱即用的 docker 需要自己构建 kubelet，会在某个宽限期过后从 kubelet 中删除内置的 dockershim 代码）。
<!--adsense-text-->
那么这是否就意味这 Kubernetes 不再支持 Docker 了呢？当然不是的，这只是废弃了内置的 `dockershim` 功能而已，Docker 和其他容器运行时将一视同仁，不会单独对待内置支持，如果我们还想直接使用 Docker 这种容器运行时应该怎么办呢？可以将 dockershim 的功能单独提取出来独立维护一个 `cri-dockerd` 即可，就类似于 containerd 1.0 版本中提供的 `CRI-Containerd`，当然还有一种办法就是 Docker 官方社区将 CRI 接口内置到 Dockerd 中去实现。

但是我们也清楚 Dockerd 也是去直接调用的 Containerd，而 containerd 1.1 版本后就内置实现了 CRI，所以 Docker 也没必要再去单独实现 CRI 了，当 Kubernetes 不再内置支持开箱即用的 Docker 的以后，最好的方式当然也就是直接使用 Containerd 这种容器运行时，而且该容器运行时也已经经过了生产环境实践的，接下来我们就来学习下 Containerd 的使用。

## Containerd

我们知道很早之前的 Docker Engine 中就有了 containerd，只不过现在是将 containerd 从 Docker Engine 里分离出来，作为一个独立的开源项目，目标是提供一个更加开放、稳定的容器运行基础设施。分离出来的 containerd 将具有更多的功能，涵盖整个容器运行时管理的所有需求，提供更强大的支持。

containerd 是一个工业级标准的容器运行时，它强调**简单性**、**健壮性**和**可移植性**，containerd 可以负责干下面这些事情：

* 管理容器的生命周期（从创建容器到销毁容器）
* 拉取/推送容器镜像
* 存储管理（管理镜像及容器数据的存储）
* 调用 runc 运行容器（与 runc 等容器运行时交互）
* 管理容器网络接口及网络

## 架构

containerd 可用作 Linux 和 Windows 的守护程序，它管理其主机系统完整的容器生命周期，从镜像传输和存储到容器执行和监测，再到底层存储到网络附件等等。

![containerd 架构](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810134700.png)

上图是 containerd 官方提供的架构图，可以看出 containerd 采用的也是 C/S 架构，服务端通过 unix domain socket 暴露低层的 gRPC API 接口出去，客户端通过这些 API 管理节点上的容器，每个 containerd 只负责一台机器，Pull 镜像，对容器的操作（启动、停止等），网络，存储都是由 containerd 完成。具体运行容器由 runc 负责，实际上只要是符合 OCI 规范的容器都可以支持。

为了解耦，containerd 将系统划分成了不同的组件，每个组件都由一个或多个模块协作完成（Core 部分），每一种类型的模块都以插件的形式集成到 Containerd 中，而且插件之间是相互依赖的，例如，上图中的每一个长虚线的方框都表示一种类型的插件，包括 Service Plugin、Metadata Plugin、GC Plugin、Runtime Plugin 等，其中 Service Plugin 又会依赖 Metadata Plugin、GC Plugin 和 Runtime Plugin。每一个小方框都表示一个细分的插件，例如 Metadata Plugin 依赖 Containers Plugin、Content Plugin 等。比如:

* `Content Plugin`: 提供对镜像中可寻址内容的访问，所有不可变的内容都被存储在这里。
* `Snapshot Plugin`: 用来管理容器镜像的文件系统快照，镜像中的每一层都会被解压成文件系统快照，类似于 Docker 中的 graphdriver。

总体来看 containerd 可以分为三个大块：Storage、Metadata 和 Runtime。

![containerd 架构2](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810145929.png)

### 安装

这里我使用的系统是 `Linux Mint 20.2`，首先需要安装 `seccomp` 依赖：

```shell
➜  ~ apt-get update
➜  ~ apt-get install libseccomp2 -y
```

由于 containerd 需要调用 runc，所以我们也需要先安装 runc，不过 containerd 提供了一个包含相关依赖的压缩包 `cri-containerd-cni-${VERSION}.${OS}-${ARCH}.tar.gz`，可以直接使用这个包来进行安装。首先从 [release 页面](https://github.com/containerd/containerd/releases)下载最新版本的压缩包，当前为 1.5.5 版本：

```shell
➜  ~ wget https://github.com/containerd/containerd/releases/download/v1.5.5/cri-containerd-cni-1.5.5-linux-amd64.tar.gz
# 如果有限制，也可以替换成下面的 URL 加速下载
# wget https://download.fastgit.org/containerd/containerd/releases/download/v1.5.5/cri-containerd-cni-1.5.5-linux-amd64.tar.gz
```

可以通过 tar 的 `-t` 选项直接看到压缩包中包含哪些文件：

```shell
➜  ~ tar -tf cri-containerd-cni-1.4.3-linux-amd64.tar.gz
etc/
etc/cni/
etc/cni/net.d/
etc/cni/net.d/10-containerd-net.conflist
etc/crictl.yaml
etc/systemd/
etc/systemd/system/
etc/systemd/system/containerd.service
usr/
usr/local/
usr/local/bin/
usr/local/bin/containerd-shim-runc-v2
usr/local/bin/ctr
usr/local/bin/containerd-shim
usr/local/bin/containerd-shim-runc-v1
usr/local/bin/crictl
usr/local/bin/critest
usr/local/bin/containerd
usr/local/sbin/
usr/local/sbin/runc
opt/
opt/cni/
opt/cni/bin/
opt/cni/bin/vlan
opt/cni/bin/host-local
opt/cni/bin/flannel
opt/cni/bin/bridge
opt/cni/bin/host-device
opt/cni/bin/tuning
opt/cni/bin/firewall
opt/cni/bin/bandwidth
opt/cni/bin/ipvlan
opt/cni/bin/sbr
opt/cni/bin/dhcp
opt/cni/bin/portmap
opt/cni/bin/ptp
opt/cni/bin/static
opt/cni/bin/macvlan
opt/cni/bin/loopback
opt/containerd/
opt/containerd/cluster/
opt/containerd/cluster/version
opt/containerd/cluster/gce/
opt/containerd/cluster/gce/cni.template
opt/containerd/cluster/gce/configure.sh
opt/containerd/cluster/gce/cloud-init/
opt/containerd/cluster/gce/cloud-init/master.yaml
opt/containerd/cluster/gce/cloud-init/node.yaml
opt/containerd/cluster/gce/env
```

直接将压缩包解压到系统的各个目录中：

```shell
➜  ~ tar -C / -xzf cri-containerd-cni-1.5.5-linux-amd64.tar.gz
```

当然要记得将 `/usr/local/bin` 和 `/usr/local/sbin` 追加到 `~/.bashrc` 文件的 `PATH` 环境变量中：

```shell
export PATH=$PATH:/usr/local/bin:/usr/local/sbin
```

然后执行下面的命令使其立即生效：

```shell
➜  ~ source ~/.bashrc
```

containerd 的默认配置文件为 `/etc/containerd/config.toml`，我们可以通过如下所示的命令生成一个默认的配置：

```shell
➜  ~ mkdir /etc/containerd
➜  ~ containerd config default > /etc/containerd/config.toml
```

由于上面我们下在的 containerd 压缩包中包含一个 `etc/systemd/system/containerd.service` 的文件，这样我们就可以通过 systemd 来配置 containerd 作为守护进程运行了，内容如下所示：

```shell
➜  ~ cat /etc/systemd/system/containerd.service
[Unit]
Description=containerd container runtime
Documentation=https://containerd.io
After=network.target local-fs.target

[Service]
ExecStartPre=-/sbin/modprobe overlay
ExecStart=/usr/local/bin/containerd

Type=notify
Delegate=yes
KillMode=process
Restart=always
RestartSec=5
# Having non-zero Limit*s causes performance problems due to accounting overhead
# in the kernel. We recommend using cgroups to do container-local accounting.
LimitNPROC=infinity
LimitCORE=infinity
LimitNOFILE=1048576
# Comment TasksMax if your systemd version does not supports it.
# Only systemd 226 and above support this version.
TasksMax=infinity
OOMScoreAdjust=-999

[Install]
WantedBy=multi-user.target
```

这里有两个重要的参数：

* `Delegate`: 这个选项允许 containerd 以及运行时自己管理自己创建容器的 cgroups。如果不设置这个选项，systemd 就会将进程移到自己的 cgroups 中，从而导致 containerd 无法正确获取容器的资源使用情况。
* `KillMode`: 这个选项用来处理 containerd 进程被杀死的方式。默认情况下，systemd 会在进程的 cgroup 中查找并杀死 containerd 的所有子进程。KillMode 字段可以设置的值如下。

    * `control-group`（默认值）：当前控制组里面的所有子进程，都会被杀掉
    * `process`：只杀主进程
    * `mixed`：主进程将收到 SIGTERM 信号，子进程收到 SIGKILL 信号
    * `none`：没有进程会被杀掉，只是执行服务的 stop 命令

我们需要将 KillMode 的值设置为 process，这样可以确保升级或重启 containerd 时不杀死现有的容器。

现在我们就可以启动 containerd 了，直接执行下面的命令即可：

```shell
➜  ~ systemctl enable containerd --now
```

启动完成后就可以使用 containerd 的本地 CLI 工具 `ctr` 了，比如查看版本：

![ctr version](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210810164519.png)

### 配置

我们首先来查看下上面默认生成的配置文件 `/etc/containerd/config.toml`：

```toml
disabled_plugins = []
imports = []
oom_score = 0
plugin_dir = ""
required_plugins = []
root = "/var/lib/containerd"
state = "/run/containerd"
version = 2

[cgroup]
  path = ""

[debug]
  address = ""
  format = ""
  gid = 0
  level = ""
  uid = 0

[grpc]
  address = "/run/containerd/containerd.sock"
  gid = 0
  max_recv_message_size = 16777216
  max_send_message_size = 16777216
  tcp_address = ""
  tcp_tls_cert = ""
  tcp_tls_key = ""
  uid = 0

[metrics]
  address = ""
  grpc_histogram = false

[plugins]

  [plugins."io.containerd.gc.v1.scheduler"]
    deletion_threshold = 0
    mutation_threshold = 100
    pause_threshold = 0.02
    schedule_delay = "0s"
    startup_delay = "100ms"

  [plugins."io.containerd.grpc.v1.cri"]
    disable_apparmor = false
    disable_cgroup = false
    disable_hugetlb_controller = true
    disable_proc_mount = false
    disable_tcp_service = true
    enable_selinux = false
    enable_tls_streaming = false
    ignore_image_defined_volumes = false
    max_concurrent_downloads = 3
    max_container_log_line_size = 16384
    netns_mounts_under_state_dir = false
    restrict_oom_score_adj = false
    sandbox_image = "k8s.gcr.io/pause:3.5"
    selinux_category_range = 1024
    stats_collect_period = 10
    stream_idle_timeout = "4h0m0s"
    stream_server_address = "127.0.0.1"
    stream_server_port = "0"
    systemd_cgroup = false
    tolerate_missing_hugetlb_controller = true
    unset_seccomp_profile = ""

    [plugins."io.containerd.grpc.v1.cri".cni]
      bin_dir = "/opt/cni/bin"
      conf_dir = "/etc/cni/net.d"
      conf_template = ""
      max_conf_num = 1

    [plugins."io.containerd.grpc.v1.cri".containerd]
      default_runtime_name = "runc"
      disable_snapshot_annotations = true
      discard_unpacked_layers = false
      no_pivot = false
      snapshotter = "overlayfs"

      [plugins."io.containerd.grpc.v1.cri".containerd.default_runtime]
        base_runtime_spec = ""
        container_annotations = []
        pod_annotations = []
        privileged_without_host_devices = false
        runtime_engine = ""
        runtime_root = ""
        runtime_type = ""

        [plugins."io.containerd.grpc.v1.cri".containerd.default_runtime.options]

      [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]

        [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
          base_runtime_spec = ""
          container_annotations = []
          pod_annotations = []
          privileged_without_host_devices = false
          runtime_engine = ""
          runtime_root = ""
          runtime_type = "io.containerd.runc.v2"

          [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
            BinaryName = ""
            CriuImagePath = ""
            CriuPath = ""
            CriuWorkPath = ""
            IoGid = 0
            IoUid = 0
            NoNewKeyring = false
            NoPivotRoot = false
            Root = ""
            ShimCgroup = ""
            SystemdCgroup = false

      [plugins."io.containerd.grpc.v1.cri".containerd.untrusted_workload_runtime]
        base_runtime_spec = ""
        container_annotations = []
        pod_annotations = []
        privileged_without_host_devices = false
        runtime_engine = ""
        runtime_root = ""
        runtime_type = ""

        [plugins."io.containerd.grpc.v1.cri".containerd.untrusted_workload_runtime.options]

    [plugins."io.containerd.grpc.v1.cri".image_decryption]
      key_model = "node"

    [plugins."io.containerd.grpc.v1.cri".registry]
      config_path = ""

      [plugins."io.containerd.grpc.v1.cri".registry.auths]

      [plugins."io.containerd.grpc.v1.cri".registry.configs]

      [plugins."io.containerd.grpc.v1.cri".registry.headers]

      [plugins."io.containerd.grpc.v1.cri".registry.mirrors]

    [plugins."io.containerd.grpc.v1.cri".x509_key_pair_streaming]
      tls_cert_file = ""
      tls_key_file = ""

  [plugins."io.containerd.internal.v1.opt"]
    path = "/opt/containerd"

  [plugins."io.containerd.internal.v1.restart"]
    interval = "10s"

  [plugins."io.containerd.metadata.v1.bolt"]
    content_sharing_policy = "shared"

  [plugins."io.containerd.monitor.v1.cgroups"]
    no_prometheus = false

  [plugins."io.containerd.runtime.v1.linux"]
    no_shim = false
    runtime = "runc"
    runtime_root = ""
    shim = "containerd-shim"
    shim_debug = false

  [plugins."io.containerd.runtime.v2.task"]
    platforms = ["linux/amd64"]

  [plugins."io.containerd.service.v1.diff-service"]
    default = ["walking"]

  [plugins."io.containerd.snapshotter.v1.aufs"]
    root_path = ""

  [plugins."io.containerd.snapshotter.v1.btrfs"]
    root_path = ""

  [plugins."io.containerd.snapshotter.v1.devmapper"]
    async_remove = false
    base_image_size = ""
    pool_name = ""
    root_path = ""

  [plugins."io.containerd.snapshotter.v1.native"]
    root_path = ""

  [plugins."io.containerd.snapshotter.v1.overlayfs"]
    root_path = ""

  [plugins."io.containerd.snapshotter.v1.zfs"]
    root_path = ""

[proxy_plugins]

[stream_processors]

  [stream_processors."io.containerd.ocicrypt.decoder.v1.tar"]
    accepts = ["application/vnd.oci.image.layer.v1.tar+encrypted"]
    args = ["--decryption-keys-path", "/etc/containerd/ocicrypt/keys"]
    env = ["OCICRYPT_KEYPROVIDER_CONFIG=/etc/containerd/ocicrypt/ocicrypt_keyprovider.conf"]
    path = "ctd-decoder"
    returns = "application/vnd.oci.image.layer.v1.tar"

  [stream_processors."io.containerd.ocicrypt.decoder.v1.tar.gzip"]
    accepts = ["application/vnd.oci.image.layer.v1.tar+gzip+encrypted"]
    args = ["--decryption-keys-path", "/etc/containerd/ocicrypt/keys"]
    env = ["OCICRYPT_KEYPROVIDER_CONFIG=/etc/containerd/ocicrypt/ocicrypt_keyprovider.conf"]
    path = "ctd-decoder"
    returns = "application/vnd.oci.image.layer.v1.tar+gzip"

[timeouts]
  "io.containerd.timeout.shim.cleanup" = "5s"
  "io.containerd.timeout.shim.load" = "5s"
  "io.containerd.timeout.shim.shutdown" = "3s"
  "io.containerd.timeout.task.state" = "2s"

[ttrpc]
  address = ""
  gid = 0
  uid = 0
```

这个配置文件比较复杂，我们可以将重点放在其中的 `plugins` 配置上面，仔细观察我们可以发现每一个顶级配置块的命名都是 `plugins."io.containerd.xxx.vx.xxx"` 这种形式，每一个顶级配置块都表示一个插件，其中 `io.containerd.xxx.vx` 表示插件的类型，`vx` 后面的 `xxx` 表示插件的 ID，我们可以通过 `ctr` 查看插件列表：

```shell
➜  ~ ctr plugin ls
ctr plugin ls
TYPE                            ID                       PLATFORMS      STATUS
io.containerd.content.v1        content                  -              ok
io.containerd.snapshotter.v1    aufs                     linux/amd64    ok
io.containerd.snapshotter.v1    btrfs                    linux/amd64    skip
io.containerd.snapshotter.v1    devmapper                linux/amd64    error
io.containerd.snapshotter.v1    native                   linux/amd64    ok
io.containerd.snapshotter.v1    overlayfs                linux/amd64    ok
io.containerd.snapshotter.v1    zfs                      linux/amd64    skip
io.containerd.metadata.v1       bolt                     -              ok
io.containerd.differ.v1         walking                  linux/amd64    ok
io.containerd.gc.v1             scheduler                -              ok
io.containerd.service.v1        introspection-service    -              ok
io.containerd.service.v1        containers-service       -              ok
io.containerd.service.v1        content-service          -              ok
io.containerd.service.v1        diff-service             -              ok
io.containerd.service.v1        images-service           -              ok
io.containerd.service.v1        leases-service           -              ok
io.containerd.service.v1        namespaces-service       -              ok
io.containerd.service.v1        snapshots-service        -              ok
io.containerd.runtime.v1        linux                    linux/amd64    ok
io.containerd.runtime.v2        task                     linux/amd64    ok
io.containerd.monitor.v1        cgroups                  linux/amd64    ok
io.containerd.service.v1        tasks-service            -              ok
io.containerd.internal.v1       restart                  -              ok
io.containerd.grpc.v1           containers               -              ok
io.containerd.grpc.v1           content                  -              ok
io.containerd.grpc.v1           diff                     -              ok
io.containerd.grpc.v1           events                   -              ok
io.containerd.grpc.v1           healthcheck              -              ok
io.containerd.grpc.v1           images                   -              ok
io.containerd.grpc.v1           leases                   -              ok
io.containerd.grpc.v1           namespaces               -              ok
io.containerd.internal.v1       opt                      -              ok
io.containerd.grpc.v1           snapshots                -              ok
io.containerd.grpc.v1           tasks                    -              ok
io.containerd.grpc.v1           version                  -              ok
io.containerd.grpc.v1           cri                      linux/amd64    ok
```

顶级配置块下面的子配置块表示该插件的各种配置，比如 cri 插件下面就分为 containerd、cni 和 registry 的配置，而 containerd 下面又可以配置各种 runtime，还可以配置默认的 runtime。比如现在我们要为镜像配置一个加速器，那么就需要在 cri 配置块下面的 `registry` 配置块下面进行配置 `registry.mirrors`：

```toml
[plugins."io.containerd.grpc.v1.cri".registry]
  [plugins."io.containerd.grpc.v1.cri".registry.mirrors]
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."docker.io"]
      endpoint = ["https://bqr1dr1n.mirror.aliyuncs.com"]
    [plugins."io.containerd.grpc.v1.cri".registry.mirrors."k8s.gcr.io"]
      endpoint = ["https://registry.aliyuncs.com/k8sxio"]
```

* `registry.mirrors."xxx"`: 表示需要配置 mirror 的镜像仓库，例如 `registry.mirrors."docker.io"` 表示配置 docker.io 的 mirror。
* `endpoint`: 表示提供 mirror 的镜像加速服务，比如我们可以注册一个阿里云的镜像服务来作为 docker.io 的 mirror。

另外在默认配置中还有两个关于存储的配置路径：

```toml
root = "/var/lib/containerd"
state = "/run/containerd"
```

其中 `root` 是用来保存持久化数据，包括 Snapshots, Content, Metadata 以及各种插件的数据，每一个插件都有自己单独的目录，Containerd 本身不存储任何数据，它的所有功能都来自于已加载的插件。
<!--adsense-text-->
而另外的 `state` 是用来保存运行时的临时数据的，包括 sockets、pid、挂载点、运行时状态以及不需要持久化的插件数据。

### 使用

我们知道 Docker CLI 工具提供了需要增强用户体验的功能，containerd 同样也提供一个对应的 CLI 工具：`ctr`，不过 ctr 的功能没有 docker 完善，但是关于镜像和容器的基本功能都是有的。接下来我们就先简单介绍下 `ctr` 的使用。

**帮助**

直接输入 `ctr` 命令即可获得所有相关的操作命令使用方式：

```shell
➜  ~ ctr
NAME:
   ctr -
        __
  _____/ /______
 / ___/ __/ ___/
/ /__/ /_/ /
\___/\__/_/

containerd CLI


USAGE:
   ctr [global options] command [command options] [arguments...]

VERSION:
   v1.5.5

DESCRIPTION:

ctr is an unsupported debug and administrative client for interacting
with the containerd daemon. Because it is unsupported, the commands,
options, and operations are not guaranteed to be backward compatible or
stable from release to release of the containerd project.

COMMANDS:
   plugins, plugin            provides information about containerd plugins
   version                    print the client and server versions
   containers, c, container   manage containers
   content                    manage content
   events, event              display containerd events
   images, image, i           manage images
   leases                     manage leases
   namespaces, namespace, ns  manage namespaces
   pprof                      provide golang pprof outputs for containerd
   run                        run a container
   snapshots, snapshot        manage snapshots
   tasks, t, task             manage tasks
   install                    install a new package
   oci                        OCI tools
   shim                       interact with a shim directly
   help, h                    Shows a list of commands or help for one command

GLOBAL OPTIONS:
   --debug                      enable debug output in logs
   --address value, -a value    address for containerd's GRPC server (default: "/run/containerd/containerd.sock") [$CONTAINERD_ADDRESS]
   --timeout value              total timeout for ctr commands (default: 0s)
   --connect-timeout value      timeout for connecting to containerd (default: 0s)
   --namespace value, -n value  namespace to use with commands (default: "default") [$CONTAINERD_NAMESPACE]
   --help, -h                   show help
   --version, -v                print the version
```

#### 镜像操作

**拉取镜像**

拉取镜像可以使用 `ctr image pull` 来完成，比如拉取 Docker Hub 官方镜像 `nginx:alpine`，需要注意的是镜像地址需要加上 `docker.io` Host 地址：

```shell
➜  ~ ctr image pull docker.io/library/nginx:alpine
docker.io/library/nginx:alpine:                                                   resolved       |++++++++++++++++++++++++++++++++++++++|
index-sha256:bead42240255ae1485653a956ef41c9e458eb077fcb6dc664cbc3aa9701a05ce:    exists         |++++++++++++++++++++++++++++++++++++++|
manifest-sha256:ce6ca11a3fa7e0e6b44813901e3289212fc2f327ee8b1366176666e8fb470f24: done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:9a6ac07b84eb50935293bb185d0a8696d03247f74fd7d43ea6161dc0f293f81f:    done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:e82f830de071ebcda58148003698f32205b7970b01c58a197ac60d6bb79241b0:    done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:d7c9fa7589ae28cd3306b204d5dd9a539612593e35df70f7a1d69ff7548e74cf:    done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:bf2b3ee132db5b4c65432e53aca69da4e609c6cb154e0d0e14b2b02259e9c1e3:    done           |++++++++++++++++++++++++++++++++++++++|
config-sha256:7ce0143dee376bfd2937b499a46fb110bda3c629c195b84b1cf6e19be1a9e23b:   done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:3c1eaf69ff492177c34bdbf1735b6f2e5400e417f8f11b98b0da878f4ecad5fb:    done           |++++++++++++++++++++++++++++++++++++++|
layer-sha256:29291e31a76a7e560b9b7ad3cada56e8c18d50a96cca8a2573e4f4689d7aca77:    done           |++++++++++++++++++++++++++++++++++++++|
elapsed: 11.9s                                                                    total:  8.7 Mi (748.1 KiB/s)
unpacking linux/amd64 sha256:bead42240255ae1485653a956ef41c9e458eb077fcb6dc664cbc3aa9701a05ce...
done: 410.86624ms
```

也可以使用 `--platform` 选项指定对应平台的镜像。当然对应的也有推送镜像的命令 `ctr image push`，如果是私有镜像则在推送的时候可以通过 `--user` 来自定义仓库的用户名和密码。

**列出本地镜像**

```shell
➜  ~ ctr image ls
REF                            TYPE                                                      DIGEST                                                                  SIZE    PLATFORMS                                                                                LABELS
docker.io/library/nginx:alpine application/vnd.docker.distribution.manifest.list.v2+json sha256:bead42240255ae1485653a956ef41c9e458eb077fcb6dc664cbc3aa9701a05ce 9.5 MiB linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64/v8,linux/ppc64le,linux/s390x -
➜  ~ ctr image ls -q
docker.io/library/nginx:alpine
```

使用 `-q（--quiet）` 选项可以只打印镜像名称。

**检测本地镜像**

```shell
➜  ~ ctr image check
REF                            TYPE                                                      DIGEST                                                                  STATUS         SIZE            UNPACKED
docker.io/library/nginx:alpine application/vnd.docker.distribution.manifest.list.v2+json sha256:bead42240255ae1485653a956ef41c9e458eb077fcb6dc664cbc3aa9701a05ce complete (7/7) 9.5 MiB/9.5 MiB true
```

主要查看其中的 `STATUS`，`complete` 表示镜像是完整可用的状态。

**重新打标签**

同样的我们也可以重新给指定的镜像打一个 Tag：

```shell
➜  ~ ctr image tag docker.io/library/nginx:alpine harbor.k8s.local/course/nginx:alpine
harbor.k8s.local/course/nginx:alpine
➜  ~ ctr image ls -q
docker.io/library/nginx:alpine
harbor.k8s.local/course/nginx:alpine
```

**删除镜像**

不需要使用的镜像也可以使用 `ctr image rm` 进行删除：

```shell
➜  ~ ctr image rm harbor.k8s.local/course/nginx:alpine
harbor.k8s.local/course/nginx:alpine
➜  ~ ctr image ls -q
docker.io/library/nginx:alpine
```

加上 `--sync` 选项可以同步删除镜像和所有相关的资源。

**将镜像挂载到主机目录**

```shell
➜  ~ ctr image mount docker.io/library/nginx:alpine /mnt
sha256:c3554b2d61e3c1cffcaba4b4fa7651c644a3354efaafa2f22cb53542f6c600dc
/mnt
➜  ~ tree -L 1 /mnt
/mnt
├── bin
├── dev
├── docker-entrypoint.d
├── docker-entrypoint.sh
├── etc
├── home
├── lib
├── media
├── mnt
├── opt
├── proc
├── root
├── run
├── sbin
├── srv
├── sys
├── tmp
├── usr
└── var

18 directories, 1 file
```

**将镜像从主机目录上卸载**

```shell
➜  ~ ctr image unmount /mnt
/mnt
```

**将镜像导出为压缩包**

```shell
➜  ~ ctr image export nginx.tar.gz docker.io/library/nginx:alpine
```

**从压缩包导入镜像**

```shell
➜  ~ ctr image import nginx.tar.gz
```

#### 容器操作

容器相关操作可以通过 `ctr container` 获取。

**创建容器**

```shell
➜  ~ ctr container create docker.io/library/nginx:alpine nginx
```

**列出容器**

```shell
➜  ~ ctr container ls
CONTAINER    IMAGE                             RUNTIME
nginx        docker.io/library/nginx:alpine    io.containerd.runc.v2
```

同样可以加上 `-q` 选项精简列表内容：

```shell
➜  ~ ctr container ls -q
nginx
```

**查看容器详细配置**

类似于 `docker inspect` 功能。

```shell
➜  ~ ctr container info nginx
{
    "ID": "nginx",
    "Labels": {
        "io.containerd.image.config.stop-signal": "SIGQUIT"
    },
    "Image": "docker.io/library/nginx:alpine",
    "Runtime": {
        "Name": "io.containerd.runc.v2",
        "Options": {
            "type_url": "containerd.runc.v1.Options"
        }
    },
    "SnapshotKey": "nginx",
    "Snapshotter": "overlayfs",
    "CreatedAt": "2021-08-12T08:23:13.792871558Z",
    "UpdatedAt": "2021-08-12T08:23:13.792871558Z",
    "Extensions": null,
    "Spec": {
......
```

**删除容器**

```shell
➜  ~ ctr container rm nginx
➜  ~ ctr container ls
CONTAINER    IMAGE    RUNTIME
```

除了使用 `rm` 子命令之外也可以使用 `delete` 或者 `del` 删除容器。

#### 任务

上面我们通过 `container create` 命令创建的容器，并没有处于运行状态，只是一个静态的容器。一个 container 对象只是包含了运行一个容器所需的资源及相关配置数据，表示 namespaces、rootfs 和容器的配置都已经初始化成功了，只是用户进程还没有启动。

一个容器真正运行起来是由 Task 任务实现的，Task 可以为容器设置网卡，还可以配置工具来对容器进行监控等。

Task 相关操作可以通过 `ctr task` 获取，如下我们通过 Task 来启动容器：

```shell
➜  ~ ctr task start -d nginx
/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration
/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/
```

启动容器后可以通过 `task ls` 查看正在运行的容器：

```shell
➜  ~ ctr task ls
TASK     PID     STATUS
nginx    3630    RUNNING
```

同样也可以使用 `exec` 命令进入容器进行操作：

```shell
➜  ~ ctr task exec --exec-id 0 -t nginx sh
/ #
```

不过这里需要注意必须要指定 `--exec-id` 参数，这个 id 可以随便写，只要唯一就行。

暂停容器，和 `docker pause` 类似的功能：

```shell
➜  ~ ctr task pause nginx
```

暂停后容器状态变成了 `PAUSED`：

```shell
➜  ~ ctr task ls
TASK     PID     STATUS
nginx    3630    PAUSED
```

同样也可以使用 `resume` 命令来恢复容器：

```shell
➜  ~ ctr task resume nginx
➜  ~ ctr task ls
TASK     PID     STATUS
nginx    3630    RUNNING
```

不过需要注意 ctr 没有 stop 容器的功能，只能暂停或者杀死容器。杀死容器可以使用 `task kill` 命令:

```shell
➜  ~ ctr task kill nginx
➜  ~ ctr task ls
TASK     PID     STATUS
nginx    3630    STOPPED
```

杀掉容器后可以看到容器的状态变成了 `STOPPED`。同样也可以通过 `task rm` 命令删除 Task：

```shell
➜  ~ ctr task rm nginx
➜  ~ ctr task ls
TASK    PID    STATUS
```

除此之外我们还可以获取容器的 cgroup 相关信息，可以使用 `task metrics` 命令用来获取容器的内存、CPU 和 PID 的限额与使用量。

```shell
# 重新启动容器
➜  ~ ctr task metrics nginx
ID       TIMESTAMP
nginx    2021-08-12 08:50:46.952769941 +0000 UTC

METRIC                   VALUE
memory.usage_in_bytes    8855552
memory.limit_in_bytes    9223372036854771712
memory.stat.cache        0
cpuacct.usage            22467106
cpuacct.usage_percpu     [2962708 860891 1163413 1915748 1058868 2888139 6159277 5458062]
pids.current             9
pids.limit               0
```

还可以使用 `task ps` 命令查看容器中所有进程在宿主机中的 PID：

```shell
➜  ~ ctr task ps nginx
PID     INFO
3984    -
4029    -
4030    -
4031    -
4032    -
4033    -
4034    -
4035    -
4036    -
➜  ~ ctr task ls
TASK     PID     STATUS
nginx    3984    RUNNING
```

其中第一个 PID `3984` 就是我们容器中的1号进程。

#### 命名空间

另外 Containerd 中也支持命名空间的概念，比如查看命名空间：

```shell
➜  ~ ctr ns ls
NAME    LABELS
default
```

如果不指定，ctr 默认使用的是 `default` 空间。同样也可以使用 `ns create` 命令创建一个命名空间：

```shell
➜  ~ ctr ns create test
➜  ~ ctr ns ls
NAME    LABELS
default
test
```

使用 `remove` 或者 `rm` 可以删除 namespace：

```shell
➜  ~ ctr ns rm test
test
➜  ~ ctr ns ls
NAME    LABELS
default
```

有了命名空间后就可以在操作资源的时候指定 namespace，比如查看 test 命名空间的镜像，可以在操作命令后面加上 `-n test` 选项：

```shell
➜  ~ ctr -n test image ls
REF TYPE DIGEST SIZE PLATFORMS LABELS
```

我们知道 Docker 其实也是默认调用的 containerd，事实上 Docker 使用的 containerd 下面的命名空间默认是 `moby`，而不是 `default`，所以假如我们有用 docker 启动容器，那么我们也可以通过 `ctr -n moby` 来定位下面的容器：

```shell
➜  ~ ctr -n moby container ls
```

同样 Kubernetes 下使用的 containerd 默认命名空间是 `k8s.io`，所以我们可以使用 `ctr -n k8s.io` 来查看 Kubernetes 下面创建的容器。后续我们再介绍如何将 Kubernetes 集群的容器运行时切换到 `containerd`。

<!--adsense-self-->
