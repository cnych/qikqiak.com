---
title: 在 Windows 下使用 WSL2 搭建 Kubernetes 集群
date: 2020-06-10
tags: ["kubernetes", "wsl", "kind"]
slug: deploy-k8s-on-win-use-wsl2
keywords: ["kubernetes", "windows", "wsl", "kind", "minikube"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/0_ELInjYSqoY9iKX1W.jpeg",
      desc: "Windows WSL2",
    },
  ]
category: "kubernetes"
---

本文我们将介绍如何在 Windows10 下使用 WSL2 和 KinD 来搭建一套 Kubernetes 集群。在过去几年，Kubernetes 已经成为了容器编排领域事实上的标准。虽然现在已经有各种各样的 Kubernetes 发行版本和安装程序来部署 Kubernetes 环境了，除了云环境或者裸机环境下面之外，我们仍然需要在本地部署和运行 Kubernetes 集群，特别是对于相关的开发人员。

但是 Kubernetes 最开始是被设计在 Linux 环境中来部署和使用的，然而还是有不少用户平时工作还是使用的是 Windows 操作系统，为了降低 Windows 用户使用 Linux 的困难程度，微软推出了 WSL (Windows Subsystem for Linux)，该工具相当于一个运行在 Windows 下面的 Linux 子系统，这让 Windows 和 Linux 之间的环境界限变得更加不明显了，特别是 WSL2 版本推出以后，完全具有了在 WSL2 中运行 Docker 的能力了，所以现在我们几乎可以无缝地在 WSL2 上面运行 Kubernetes。

<!--more-->

下面我们就来简要介绍下在 Windows10 下面如何安装和配置 WSL2 以及 Kubernetes 集群。

# 安装 WSL2

首先我们需要先启用"适用于 Linux 的 Windows 子系统"这个功能，然后才能在 Windows 上安装 Linux 发行版。以管理员身份打开 PowerShell 运行如下所示的命令：

```bash
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

如果我们只是安装 WSL1 的话，执行完上面的命令重启计算机然后安装对应的 Linux 发行版即可，如果需要安装到 WSL2 则需要执行下面的其他额外操作。

## 环境准备

### 操作系统版本

如果要更新到 WSL2，首先需要满足下面的条件：

- Windows 10 操作系统（[已更新到版本 2004](ms-settings:windowsupdate)  的**内部版本 19041**  或更高版本）
- 通过按 Windows 徽标键 + R，检查你的 Windows 版本，然后键入  **winver**，选择“确定”。 （或者在 Windows 命令提示符下输入  `ver`  命令）。  如果内部版本低于 19041，请[更新到最新的 Windows 版本](ms-settings:windowsupdate)。

![windows 版本](https://picdn.youdianzhishi.com/images/20200610124047.png)

> 升级 Windows 可以使用官方的更新助手，非常方便，地址：[https://www.microsoft.com/zh-cn/software-download/windows10](https://www.microsoft.com/zh-cn/software-download/windows10)

### **启用“虚拟机平台”可选组件**

安装 WSL 2 之前，还必须启用“虚拟机平台”可选功能。以管理员身份打开 PowerShell 并运行如下所示命令：

```bash
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

**重新启动**计算机，以完成 WSL 安装并更新到 WSL2。

> 还有一个前提条件是需要开启硬件层面的虚拟化，可以通过 BIOS 进入开启。

### **将 WSL2 设置为默认版本**

安装新的 Linux 分发版时，请在 Powershell 中运行以下命令，以将 WSL 2 设置为默认版本：

```bash
wsl --set-default-version 2
```

## **安装配置 Linux 发行版**

1. 打开  [Microsoft Store](https://aka.ms/wslstore)，搜索 Terminal，安装 Windows Terminal，用于后面和 WSL 子系统交互。

   ![安装 windows terminal](https://picdn.youdianzhishi.com/images/20200610124851.png)

2. 搜索 Ubuntu，选择安装。

   ![安装 Ubuntu](https://picdn.youdianzhishi.com/images/20200610125008.png)

安装完成后，第一次打开 Ubuntu 的时候，将打开一个控制台窗口，会等待几分钟来进行配置，启动完成后为 Ubuntu 创建一个用户和密码。

然后我们就可以使用 Windows Terminal 来操作 Ubuntu 系统了，在 Windows Terminal 中选择 Ubuntu 发行版就可以跳转到 Ubuntu 终端中，使用上面我们配置的用户名和密码登录即可：

![Powershell](https://picdn.youdianzhishi.com/images/20200610125458.png)

由于默认情况下我们不知道 root 用户的密码，所以如果我们想要使用 root 用户的话可以使用 passwd 命令为 root 用户设置一个新的密码。

### 配置 Linux

然后可以将 Ubuntu 的软件源更换成阿里云的源：

```bash
root@k8s:~# cp /etc/apt/sources.list /etc/apt/sources.list.bak
root@k8s:~# echo "deb http://mirrors.aliyun.com/ubuntu/ focal main restricted
deb http://mirrors.aliyun.com/ubuntu/ focal-updates main restricted
deb http://mirrors.aliyun.com/ubuntu/ focal universe
deb http://mirrors.aliyun.com/ubuntu/ focal-updates universe
deb http://mirrors.aliyun.com/ubuntu/ focal multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-updates multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-backports main restricted universe multiverse
deb http://mirrors.aliyun.com/ubuntu/ focal-security main restricted
deb http://mirrors.aliyun.com/ubuntu/ focal-security universe
deb http://mirrors.aliyun.com/ubuntu/ focal-security multiverse" > /etc/apt/sources.list
root@k8s:~#
```

然后执行更新即可：

```bash
root@k8s:~# apt update && apt upgrade -y
```

此外我们还可以对终端进行配置，比如将终端替换成 zsh：

```bash
# 安装 zsh
root@k8s:~# apt-get install zsh
```

`oh-my-zsh`可以用于快速配置`zsh`，进入[官网](https://ohmyz.sh/)或者 [Github](https://github.com/ohmyzsh/ohmyzsh) 可以了解其基本使用及其丰富的主题使用，安装只需要执行下面代码即可：

```bash
root@k8s:~# sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

安装`zsh-syntax-higlighting`语法高亮插件：

```bash
root@k8s:~# git clone https://github.com/zsh-users/zsh-syntax-highlighting.git
# 移动到 plugins 文件夹中
root@k8s:~# mv zsh-syntax-highlighting $ZSH_CUSTOM/plugins
# 配置环境变量
root@k8s:~# cd ~
root@k8s:~# vim .zshrc
#在 plugins 一列中添加 zsh-syntax-highlighting，如下
plugins=(git sh-syntax-highlighting)
# 在文件最后添加
root@k8s:~# source $ZSH_CUSTOM/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
# 配置生效
root@k8s:~# source ~/.zshrc
```

配置完成之后，Terminal 的最终效果如下图所示。

![zsh config](https://picdn.youdianzhishi.com/images/20200610131555.png)

### 配置 Systemd

由于默认情况下 WSL 中不能使用 systemd，所以很多应用程序没办法启动，不过还是有一些大神解决了这个问题，我们可以在 [https://forum.snapcraft.io/t/running-snaps-on-wsl2-insiders-only-for-now/13033](https://forum.snapcraft.io/t/running-snaps-on-wsl2-insiders-only-for-now/13033) 链接下面找到启动 SystemD 的方法。

首先安装 Systemd 相关的依赖应用：

```bash
apt install -yqq fontconfig daemonize
```

然后创建一个如下所示的脚本文件：

```bash
# Create the starting script for SystemD
vi /etc/profile.d/00-wsl2-systemd.sh
SYSTEMD_PID=$(ps -ef | grep '/lib/systemd/systemd --system-unit=basic.target$' | grep -v unshare | awk '{print $2}')

if [ -z "$SYSTEMD_PID" ]; then
   sudo /usr/bin/daemonize /usr/bin/unshare --fork --pid --mount-proc /lib/systemd/systemd --system-unit=basic.target
   SYSTEMD_PID=$(ps -ef | grep '/lib/systemd/systemd --system-unit=basic.target$' | grep -v unshare | awk '{print $2}')
fi

if [ -n "$SYSTEMD_PID" ] && [ "$SYSTEMD_PID" != "1" ]; then
    exec sudo /usr/bin/nsenter -t $SYSTEMD_PID -a su - $LOGNAME
fi
```

上面的脚本放置在 /etc/profile.d 目录下面，所以要让脚本生效，我们需要退出当前 session，重新进入即可。

![wsl2 systemd](https://picdn.youdianzhishi.com/images/20200610141914.png)

到这里我们就完成了 WSL2 的安装和配置。

# 安装 Docker

其实现在我们已经可以直接在 WSL 中去安装 Docker 了，和平时在 Linux 下面操作方式是一样的。但实际上 Docker 也专门开发了可以使用  `WSL2`  中的  `Docker`  守护进程的桌面管理程序, 打开  [Docker Desktop WSL2 backend](https://docs.docker.com/docker-for-windows/wsl-tech-preview/)  页面，下载最新的 Docker Desktop for Windows 程序 ，安装之后，打开程序做如下设置

- 启用基于`WSL2`的引擎复选框（`Use the WSL 2 based engine）`

  ![docker use wsl2](https://picdn.youdianzhishi.com/images/20200610142842.png)

  这个时候在 WSL 里面执行 docker 命令还是找不到的：

  ![select wsl2](https://picdn.youdianzhishi.com/images/WX20200610-102450@2x.png)

- 我们还需要在 Resources 中设置要从哪个 WSL2 发行版中访问 Docker，如下图使用的是 Ubuntu-20.04：

  ![wsl2](https://picdn.youdianzhishi.com/images/WX20200610-102506@2x.png)

- 然后记住重启 Docker for Windows，重启完成后我们就可以在 WSL 里面使用 docker 命令了：

  ![docker cli](https://picdn.youdianzhishi.com/images/WX20200610-103321@2x.png)

到这里 Docker 和 WSL2 的基本配置就完成了，接下来我们来安装 Kubernetes 集群。

<!--adsense-text-->

# 安装 Kubernetes

安装 Kubernetes 集群有很多成熟的方案，在本地搭建也有 minikube、microk8s 等等，我们这里选择使用 KinD：在容器中来运行 Kubernetes 的一种简单方式。这里我们将安装 KinD 官方网站的说明（[https://kind.sigs.k8s.io/docs/user/quick-start/](https://kind.sigs.k8s.io/docs/user/quick-start/)）来进行操作。

```bash
# 下载 KinD 二进制文件
curl -Lo ./kind https://github.com/kubernetes-sigs/kind/releases/download/v0.8.1/kind-$(uname)-amd64
# 标记为可执行文件
chmod +x ./kind
# 移动到 PATH 目录下去
mv ./kind /usr/local/bin/
# TODO，记得提前下载安装 kubectl 二进制文件
```

![https://picdn.youdianzhishi.com/images/WX20200610-104349@2x.png](https://picdn.youdianzhishi.com/images/WX20200610-104349@2x.png)

KinD 获取后，我们就可以来创建 Kubernetes 集群了

```bash
# 检查是否设置了 KUBECONFIG 环境变量
echo $KUBECONFIG
# 检查是否存在 .kube 目录，不需要手动创建
ls $HOME/.kube
# 使用 kind 命令创建一个名为 wslk8s 的集群
kind create cluster --name wslk8s
# 创建后检查 .kube 目录
ls $HOME/.kube
```

![KinD 安装](https://picdn.youdianzhishi.com/images/WX20200610-104843@2x.png)

到这里集群就创建成功了，我们也可以在 Windows 的浏览器中打开上面的 `Kubernetes master` 地址：

![k8s master](https://picdn.youdianzhishi.com/images/WX20200610-104934@2x.png)

这就是 Docker Desktop for Windows 与 WSL2 后台结合的真正优势，比之前 Docker 默认的方式性能要好很多。

到这里我们就成功创建了一个单节点的 Kubernetes 集群：

```bash
# 检查节点
kubectl get nodes
# 获取所有 namespace 下面的资源对象
kubectl get all --all-namespaces
```

![k8s 资源](https://picdn.youdianzhishi.com/images/WX20200610-110237@2x.png)

对于大部分使用者来说，本地运行一个节点的集群已经足够了，当然如果只需要一个节点，我们也完全可以使用 minikube。同样我们也可以使用 KinD 来创建一个多节点的集群：

```bash
# 删除现在的集群
kind delete cluster --name wslk8s
# 创建一个3节点集群的配置文件
cat << EOF > kind-3nodes.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
# 使用配置文件创建新的集群
kind create cluster --name wslkindmultinodes --config ./kind-3nodes.yaml
# 获取集群节点
kubectl get nodes
```

![k8s 集群](https://picdn.youdianzhishi.com/images/WX20200610-111246@2x.png)

可以看到我们这里就成功运行了 3 个 v1.18.2 版本的 Kubernetes 节点，而且这些节点都是运行在 Docker 容器中的，我们可以通过 docker ps 命令查看，就类似于 Kubernetes 运行在 Docker 容器中，所以叫做 KinD：

![docker ps](https://picdn.youdianzhishi.com/images/20200610145436.png)

现在我们也可以去查看下整个集群的资源对象：

![k8s 资源](https://picdn.youdianzhishi.com/images/WX20200610-111438@2x.png)

当然同样我们也可以在集群中部署应用，比如安装一个 Kubernetes Dashboard：

```bash
# 在集群中安装 Dashboard
kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.1/aio/deploy/recommended.yaml
# 获取 dashboard 的资源对象
kubectl get all -n kubernetes-dashboard
```

安装成功后，我们可以使用如下命令创建一个临时的代理：

```bash
$ kubectl proxy
```

然后在 Windows 浏览器中我们可以通过如下地址来访问 Dashboard 服务：

```bash
http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

![k8s dashboard](https://picdn.youdianzhishi.com/images/WX20200610-115328@2x.png)

然后我们使用官方推荐的 RBAC 方式来创建一个 Token 进行登录，重新打开一个 WSL2 终端，执行如下所示命令：

```bash
# 创建一个新的 ServiceAccount
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin-user
  namespace: kubernetes-dashboard
EOF
# 将上面的 SA 绑定到系统的 cluster-admin 这个集群角色上
kubectl apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: admin-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: admin-user
  namespace: kubernetes-dashboard
EOF
```

然后接下来我们可以通过上面创建的 ServiceAccount 来获取 Token 信息：

```bash
kubectl -n kubernetes-dashboard describe secret $(kubectl -n kubernetes-dashboard get secret | grep admin-user | awk '{print $1}')
# 拷贝上面命令获取到的 Token 数据
```

![获取 Token](https://picdn.youdianzhishi.com/images/20200610150610.png)

将上面获取到的 token 数据拷贝到 Dashboard 登录页面进行登录即可：

![k8s dashboard](https://picdn.youdianzhishi.com/images/WX20200610-115823@2x.png)

到这里我们就完成了在 Windows 系统下面使用 WSL2 + KinD 来搭建 Kubernetes 集群，对于本地开发测试来说非常方便。当然 WSL2 目前还是有一些小问题，比如不能通过局域网访问到 WSL2 里面的服务，当然也有一些解决方案，但是都不优雅，每次重启机器过后 WSL2 的 IP 都会变化，所以有时候也非常不方便，不过整体来说 WSL2 还是非常香的。

<!--adsense-self-->
