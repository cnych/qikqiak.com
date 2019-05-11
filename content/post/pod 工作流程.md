---
title: Kubernetes Pod 工作流
date: 2018-05-15
tags: ["kubernetes", "Pod"]
keywords: ["kubernetes", "Pod", "workflow", "工作流"]
slug: pod-workflow
gitcomment: true
bigimg: [{src: "/img/posts/photo-1497864149936-d3163f0c0f4b.jpeg", desc: "Coloured pencils"}]
category: "kubernetes"
---

我们知道`Pod`是`Kubernetes`中最小的调度单元，平时我们操作`Pod`的时间也是最多的，那么你知道`Pod`是怎样被创建出来的吗？知道他的工作流程吗？

<!--more-->

## 组件之间的通信
我们知道在`Kubernetes`集群中`apiserver`是整个集群的控制入口，`etcd`在集群中充当数据库的作用，只有`apiserver`才可以直接去操作`etcd`集群，而我们的`apiserver`无论是对内还是对外都提供了统一的`REST API`服务，包括一个**8080**端口的非安全服务和**6443**端口的安全服务。组件之间当然也是通过`apiserver`进行通信的，其中`kube-controller-manager`、`kube-scheduler`、`kubelet`是通过`apiserver watch API`来监控我们的资源变化，并且对资源的相关状态更新操作也都是通过`apiserver`进行的，所以说白了组件之间的通信就是通过`apiserver REST API`和`apiserver watch API`进行的。

## Pod 工作流
那么我们创建`Pod`的时候到底发生了什么呢？是怎样创建成功`Pod`的呢？

下面图示就是一个非常典型的`Pod`工作流程图：
![workflow](/img/posts/pod-workflow.png)

和上面的组件通信一致：

* 第一步通过`apiserver REST API`创建一个`Pod`
* 然后`apiserver`接收到数据后将数据写入到`etcd`中
* 由于`kube-scheduler`通过`apiserver watch API`一直在监听资源的变化，这个时候发现有一个新的`Pod`，但是这个时候该`Pod`还没和任何`Node`节点进行绑定，所以`kube-scheduler`就经过一系列复杂的调度策略，选择出一个合适的`Node`节点，将该`Pod`和该目标`Node`进行绑定，当然也会更新到`etcd`中去的
* 这个时候一样的目标`Node`节点上的`kubelet`通过`apiserver watch API`检测到有一个新的`Pod`被调度过来了，他就将该`Pod`的相关数据传递给后面的容器运行时(`container runtime`)，比如`Docker`，让他们去运行该`Pod`
* 而且`kubelet`还会通过`container runtime`获取`Pod`的状态，然后更新到`apiserver`中，当然最后也是写入到`etcd`中去的。

这样一个典型的`Pod`工作流就完成了，通过这个流程我们可以看出整个过程中最重要的就是`apiserver watch API`和`kube-scheduler`的调度策略。

<!--adsense-self-->
