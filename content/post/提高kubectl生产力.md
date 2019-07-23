---
title: 提高 kubectl 使用生产力[译]
date: 2019-07-22
tags: ["kubernetes", "kubectl"]
keywords: ["kubernetes", "docker", "kubectl", "效率"]
slug: boosting-kubeclt-productivity
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1563713665854-e72327bf780e.jpeg", desc: "https://unsplash.com/photos/pwkHJXr01bQ"}]
category: "kubernetes"
---

我们知道在使用 Kubernetes 的过程中，kubectl 工具可能是最常用的工具了（可能还没有之一），所以当我们花费大量的时间在使用 kubectl 上面的时候，那么我们就非常有必要去了解下如何高效的使用它了。

本文包含一系列提示和技巧，可以让你更加高效的使用 kubectl，同时还可以加深你对 Kubernetes 各方面工作原理的理解。

<!--more-->

## 什么是 kubectl?
在学习如何更高效地使用 kubectl 之前，我们应该去了解下 kubectl 是什么已经它是如何工作的。

从用户角度来说，kubectl 就是控制 Kubernetes 的驾驶舱，它允许你执行所有可能的 Kubernetes 操作；从技术角度来看，kubectl 就是 Kubernetes API 的一个客户端而已。

Kubernetes API 是一个 HTTP REST API 服务，该 API 服务才是 Kubernetes 的真正的用户接口，Kubernetes 通过该 API 进行实际的控制。这也就意味着每个 Kubernetes 的操作都会通过 API 端点暴露出去，当然也就可以通过对这些 API 端口进行 HTTP 请求来执行相应的操作。

所以，kubectl 最主要的工作就是执行 Kubernetes API 的 HTTP 请求：

![kubernetes kubectl](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubernetes-kubectl.svg)

> Kubernetes 是一个完全以资源为中的系统，Kubernetes 维护资源的内部状态，所有 Kubernetes 的操作都是对这些资源的 [CRUD 操作](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.15/#resource-operations)，你可以通过操作这些资源来完全控制 Kubernetes（Kubernetes 会根据当前的资源状态来确定需要做什么）。

比如下面的例子。

假如现在我们想要创建一个 ReplicaSet 的资源，然后创建一个名为 replicaset.yaml 的资源文件来定义 ReplicaSet，然后运行下面的命令：
```shell
$ kubectl create -f replicaset.yaml
```

这个命令执行后会在 Kubernetes 中创建一个 ReplicaSet 的资源，但是这幕后发生了什么呢？

Kubernetes 具有创建 ReplicaSet 的操作，并且和其他 Kubernetes 操作一样的，也是通过 API 端点暴露出来的，上面的操作会通过指定的 API 端口进行如下的操作：
```shell
POST /apis/apps/v1/namespaces/{namespace}/replicasets
```

> 我们可以在 [API 文档](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.15)中找到所有 Kubernetes 操作的 API Endpoint（包括[上面的端点](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.15/#create-replicaset-v1-apps)），要向 Endpoint 发起实际的请求，我们需要将 APIServer 的 URL 添加到 API 文档中列出的 Endpoint 路径中。

所以，当我们执行上面的命令时，kubectl 会向上面的 API Endpoint 发起一个 HTTP POST 请求，ReplicaSet 的定义（replicaset.yaml 文件中的内容）通过请求的 body 进行传递。这就是 kubectl 与 Kubernetes 集群交互的命令如何工作的。

> 我们也完全可以使用 curl 等工具手动的向 Kubernetes API 发起 HTTP 请求，kubectl 只是让我们更加容易地使用 Kubernetes API 了。

这些是 kubectl 的最基础的知识点，但是每个 kubectl 操作者还有很多 Kubernetes API 的知识点需要了解，所以我们这里再简要介绍一下 Kubernetes 的内部结构。
<!--adsense-text-->
### Kubernetes 架构
Kubernetes 由一组独立的组件组成，这些组件在集群的节点上作为单独的进行运行，有些组件在 Master 节点上运行，有一些组件在 Node 节点上运行，每个组件都有一些特定的功能。

Master 节点上最主要的组件有下面几个：

* **etcd**: 存储后端，整个集群的资源信息都存在 etcd 里面
* **kube-apiserver**: 提供给整个集群的 API 服务，是唯一一个直接和 etcd 进行交互的组件
* **kube-controller-manager**: 控制器，主要是确保资源状态符合期望值
* **kube-scheduler**: 调度器，将 Pod 调度到工作节点

Node 节点上最重要的组件：

* **kubelet**: 管理工作节点上的容器

为了了解这些组件之间是如何协同工作的，我们再来看下上面的例子，假如我们执行了上面的`kubectl create -f replicaset.yaml`命令，kubectl 对创建 ReplicaSet 的 API Endpoint 发起了一个 HTTP POST 请求，这个时候我们的集群有什么变化呢？看下面的演示：

{{% demo src="https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs1.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs2.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs3.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs4.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs5.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs6.svg&https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-post-rs7.svg" desc="在执行 kubectl create -f replicaset.yaml 命令之后，APIServer 将 ReplicaSet 的资源清单保存在了 etcd 中。&然后触发 controller manager 中的 ReplicaSet 控制器，该控制器会监听资源的创建、更新和删除。&ReplicaSet 控制器为 ReplicaSet 的每个副本创建一个 Pod （根据资源清单中的 Pod 模板），并将它们保存在 etcd 中。&然后此时调度器会会监听尚未绑定节点的 Pod，准备为这些 Pod 选择合适的工作节点。&调度器会为每个 Pod 选择一个合适的工作节点，并将该信息更新到 etcd 中的 Pod 对象中。&然后工作节点监听到有新的 Pod 被绑定到当前节点，触发节点的控制器进行 Pod 创建。&kubelet这时通过 APIServer 读取 Pod 的资源定义，然后调用容器运行时（比如 docker）在节点上运行容器。" %}}

经过上面的几个步骤 ReplicaSet 就可以运行起来了。

### Kubernetes API 的作用
从上面的示例中我们可以看出，Kubernetes 组件（APIServer 和 etcd 除外）都是通过监听后端的资源变化来工作的。但是这些组件是不会直接访问 etcd 的，只能通过 APIServer 去访问 etcd。我们再回顾下上面的资源创建过程：

* ReplicaSet 控制器使用 ReplicaSets API 的 List 操作和 watch 参数来监听 ReplicaSet 资源的变化。
* ReplicaSet 控制器使用 create Pod API 来创建 Pod。
* 调度器通过 patch Pod API 来更新 Pod 和工作节点相关的信息。

我们使用 kubectl 来操作也是使用这些相同的 API 的。有了这些知识点后，我们就可以总结出 Kubernetes 的工作原理了：

* 存储后端（etcd）存储 Kubernetes 的资源。
* APIServer 通过 Kubernetes API 的形式提供存储后端的相关接口。
* 所有其他组件和外部用户都是通过 Kubernetes API 来读取、监听和操作 Kubernetes 的资源。

> 熟悉这些基本概念将会有助于我们更好地理解 kubectl。

接下来就让我们来看一看 kubectl 的一系列具体的使用技巧，以帮助我们提供 kubectl 的使用生产力。

## 1.命令自动补全
命令补全是提高生产力最有用但也是经常被忽略的技巧之一。命令补全允许你使用 tab 键自动补全 kubectl 的相关命令，包括子命令、选项和参数，以及资源名称等一些复杂的内容。

在下图中我们可以看到使用 kubectl 命令自动补全的相关演示：

![kubectl 自动补全](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/kubectl-cmd-complete.gif)

命令补全可用于 [Bash](https://www.gnu.org/software/bash/) 和 [Zsh](https://www.zsh.org/) shell 终端。

官方文档中就包含了一些关于命令补全的相关说明，当然也可以参考下面我们为你提供的一些内容。

### 命令补全的工作原理
一般来说，命令补全是通过执行一个补全脚本的 shell 功能，补全脚本也是一个 shell 脚本，用于定义特定命令的补全功能。

kubectl 在 Bash 和 Zsh 下可以使用下面的命令自动生成并打印出补全脚本：
```shell
$ kubectl completion bash
# 或者
$ kubectl completion zsh
```

理论上在合适的 shell 中 source 上面命令的输出就可以开启 kubectl 的命令补全功能了。但是，在实际使用的时候，Bash（包括 Linux 和 Mac 之间的差异）和 Zsh 有一些细节上的差异，下面是关于这些差异的相关说明。
<!--adsense-text-->
### Bash on Linux
Bash 的命令补全脚本依赖[bash-completion](https://github.com/scop/bash-completion)项目，所以需要先安装该项目。

我们可以使用各种包管理器来安装bash-completion，例如：
```shell
$ sudo apt-get install bash-completion
# 或者
$ yum install bash-completion
```

安装完成后可以使用一下命令测试是否安装成功了：
```shell
$ type _init_completion
```

如果输出一段 shell 函数，则证明已经安装成功了，如果输出未找到的相关错误，则可以将下面的语句添加到你的`~/.bashrc`文件中去：
```shell
source /usr/share/bash-completion/bash_completion
```

> 是否必须将上面内容添加到`~/.bashrc`文件中，这取决于你使用的包管理工具，对于 apt-get 来说是必须的，yum 就不需要了。

一旦 bash-completion 安装完成后，我们就需要进行一些配置来让我们在所有的 shell 会话中都可以获取 kubectl 补全脚本。

一种方法是将下面的内容添加到`~/.bashrc`文件中：
```shell
source <(kubectl completion bash)
```

另一种方法是将 kubectl 补全脚本添加到`/etc/bash_completion.d`目录（如果不存在则新建）：
```shell
$ kubectl completion bash >/etc/bash_completion.d/kubectl
```

> `/etc/bash_completion.d`目录下面的所有补全脚本都会由 bash-completion 自动获取。

上面两种方法都是可行的，重新加载 shell 后，kubectl 的自动补全功能应该就可以正常使用了！

### Bash on MacOS
在 Mac 下面，就稍微复杂一点点了，因为 Mac 上的 Bash 默认版本是3.2，已经过时了，kubectl 的自动补全脚本至少需要 Bash 4.1 版本。

所以要在 Mac 上使用 kubectl 自动补全功能，你就需要安装新版本的 Bash，更新 Bash 是很容易的，可以查看这篇文章：[Upgrading Bash on macOS](https://itnext.io/upgrading-bash-on-macos-7138bd1066ba)，这里我们就不详细说明了。

在继续向下之前，请确保你的 Bash 版本在 4.1 以上。和 Linux 中一样，Bash 的补全脚本依赖 bash-completion 项目，所以我们也必须要安装它。

我们可以使用 Homebrew 工具来安装：
```shell
$ brew install bash-completion@2
```

> `@2`代表 bash-completion v2 版本，kubectl 命令补全脚本需要 v2 版本，而 v2 版本至少需要 Bash 4.1 版本，所以这就是不能在低于4.1的 Bash 下面使用 kubectl 的补全脚本的原因。

brew 安装命令完成会输出一段提示信息，其中包含将下面内容添加到`~/.bash_profile`文件中的说明：
```shell
export BASH_COMPLETION_COMPAT_DIR=/usr/local/etc/bash_completion.d
[[ -r "/usr/local/etc/profile.d/bash_completion.sh" ]] && . "/usr/local/etc/profile.d/bash_completion.sh"
```

这样就完成了 bash-completion 的安装，但是建议将上面这一行信息添加到`~/.bashrc`当中，这样可以在子 shell 中也可以使用 bash-completion。

重新加载 shell 后，可以使用以下命令测试是否正确安装了 bash-completion:
```shell
$ type _init_completion
```

如果输出一个 shell 函数，证明安装成功了。然后就需要进行一些配置来让我们在所有的 shell 会话中都可以获取 kubectl 补全脚本。

一种方法是将下面的内容添加到`~/.bashrc`文件中：
```shell
source <(kubectl completion bash)
```

另外一种方法是添加 kubectl 补全脚本到`/usr/local/etc/bash_completion.d`目录下面：
```shell
$ kubectl completion bash >/usr/local/etc/bash_completion.d/kubectl
```

> 使用 Homebrew 安装 bash-completion 时上面的方法才会生效。

如果你还是使用 Homebrew 安装的 kubectl 的话，上面的步骤都可以省略，因为补全脚本已经被自动放置到`/usr/local/etc/bash_completion.d`目录中去了，这种情况，kubectl 命令补全应该在安装完 bash-completion 后就可以正常使用了。

最后，重新加载 shell 后，kubectl 自动提示应该就可以正常工作了。

### Zsh
Zsh 的补全脚本没有任何依赖，所以我们要做的就是设置让所有的 shell 会话中都可以自动补全即可。

可以在`~/.zshrc`文件中添加下面的内容来完成配置：
```shell
source <(kubectl completion zsh)
```

然后重新加载 shell 即可生效，如果重新加载 shell 后出现了`compdef error`错误，则需要开启`compdef builtin`， 可以在`~/.zshrc`文件的开头添加下面的内容来实现：
```shell
autoload -Uz compinit
compinit
```

## 2. 快速查找资源

todo

## 参考文档

* [Boosting your kubectl productivity](https://learnk8s.io/blog/kubectl-productivity/)

<!--adsense-self-->
