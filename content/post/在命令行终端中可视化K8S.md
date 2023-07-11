---
title: 在命令行终端中可视化 Kubernetes
date: 2020-03-12
tags: ["kubernetes", "kui"]
keywords: ["kubernetes", "terminal", "终端", "可视化", "kui", "krew"]
slug: navigate-k8s-with-kui
gitcomment: true
draft: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1564760055775-d63b17a55c44.jpeg",
      desc: "https://unsplash.com/photos/j4ocWYAP_cs",
    },
  ]
category: "kubernetes"
---

[Kui](https://github.com/IBM/kui) 是一个带有 GUI 的命令行终端程序，本质上 Kui 是 ASCII 终端，用命令行的方式和应用进行交互，此外 Kui 还用图形方式增强了许多命令的显示方式，这里我们来介绍下如何使用 Kui 和 Kubernetes 集群进行可视化的交互。

## 安装

要安装 Kui 很简单，根据 Kui 安装页面 [https://github.com/IBM/kui/blob/master/docs/installation.md](https://github.com/IBM/kui/blob/master/docs/installation.md) 的介绍下载对应的安装包即可，比如我们这里是 Mac 系统，就下载对应的安装包 [https://macos-tarball.kui-shell.org/] 即可，下载完成后直接解压后就可以得到 `Kui.app` 应用，直接双击即可打开运行了，对于 Mac 的习惯是将应用放置在 Applications 下面去，就和普通的应用没什么区别了。

> 如果你网络比较给力，可以执行命令 `curl -sL https://raw.githubusercontent.com/IBM/kui/master/tools/install.sh | sh` 进行一键安装。

Kui 默认就会读取本地的 `kubeconfig` 文件，所以我们可以直接在 Kui 里面访问我们的 Kubernetes 集群，还有多种主题可以切换。

![Kui](https://picdn.youdianzhishi.com/images/20200312170004.png)

默认情况下 Kui 下面可以使用命令 `k` 来代替 `kubectl`，往往平时我们使用的时候也会为 `kubectl` 添加一个别名，提高操作效率。

![command k](https://picdn.youdianzhishi.com/images/20200312170300.png)

通过命令获取的 K8S 资源对象同样我们可以通过点击在右侧展示对象的详细信息：

![object detail](https://picdn.youdianzhishi.com/images/20200312170637.png)

另外还提供了一个比较贴心的截图功能。

## 插件

有的读者可能觉得这个和我们平时用的命令行终端也没有太大的差别，而且还是一个独立的终端应用，如果我还是习惯使用以前的命令行终端，那么有什么办法能够使用 `Kui` 的这些功能吗？这个时候就需要使用到 kubectl 的插件功能了，我们可以做一个插件去调用 `Kui`，
