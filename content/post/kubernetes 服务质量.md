---
title: Kubernetes 服务质量 Qos 解析
subtitle: Pod 资源 requests 和 limits 如何配置?
date: 2018-09-07
tags: ["kubernetes", "Qos"]
keywords: ["kubernetes", "Qos"]
slug: kubernetes-qos-usage
gitcomment: true
bigimg: [{src: "/img/posts/photo-1536236155319-1edab471917c.jpeg", desc: "Studio, Warsaw"}]
category: "kubernetes"
---

`QoS`是 Quality of Service 的缩写，即**服务质量**。为了实现资源被有效调度和分配的同时提高资源利用率，`kubernetes`针对不同服务质量的预期，通过 QoS（Quality of Service）来对 pod 进行服务质量管理。对于一个 pod 来说，服务质量体现在两个具体的指标：`CPU 和内存`。当节点上内存资源紧张时，kubernetes 会根据预先设置的不同 QoS 类别进行相应处理。

<!--more-->

QoS 主要分为`Guaranteed、Burstable 和 Best-Effort`三类，优先级从高到低。

## Guaranteed(有保证的)
属于该级别的pod有以下两种：

* Pod中的所有容器都且仅设置了 CPU 和内存的 limits
* pod中的所有容器都设置了 CPU 和内存的 requests 和 limits ，且单个容器内的`requests==limits`（requests不等于0）

pod中的所有容器都且仅设置了limits：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
  name: bar
    resources:
      limits:
        cpu: 100m
        memory: 100Mi
```

pod 中的所有容器都设置了 requests 和 limits，且单个容器内的`requests==limits`：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
      requests:
        cpu: 10m
        memory: 1Gi

  name: bar
    resources:
      limits:
        cpu: 100m
        memory: 100Mi
      requests:
        cpu: 100m
        memory: 100Mi
```

容器foo和bar内resources的requests和limits均相等，该pod的QoS级别属于`Guaranteed`。


## Burstable(不稳定的)
pod中只要有一个容器的requests和limits的设置不相同，该pod的QoS即为`Burstable`。

容器foo指定了resource，而容器bar未指定：
```yaml
containers:
  name: foo
    resources:
      limits:
        cpu: 10m
        memory: 1Gi
      requests:
        cpu: 10m
        memory: 1Gi

  name: bar
```

容器foo设置了内存limits，而容器bar设置了CPU limits：
```yaml
containers:
  name: foo
    resources:
      limits:
        memory: 1Gi

  name: bar
    resources:
      limits:
        cpu: 100m
```

注意：若容器指定了requests而未指定limits，则limits的值等于节点resource的最大值；若容器指定了limits而未指定requests，则requests的值等于limits。

## Best-Effort(尽最大努力)
如果Pod中所有容器的resources均未设置requests与limits，该pod的QoS即为`Best-Effort`。

容器foo和容器bar均未设置requests和limits：
```yaml
containers:
  name: foo
    resources:
  name: bar
    resources:
```

## 根据QoS进行资源回收策略
Kubernetes 通过`cgroup`给pod设置QoS级别，当资源不足时先`kill`优先级低的 pod，在实际使用过程中，通过`OOM`分数值来实现，`OOM`分数值范围为0-1000。OOM 分数值根据`OOM_ADJ`参数计算得出。

对于`Guaranteed`级别的 Pod，OOM_ADJ参数设置成了**-998**，对于`Best-Effort`级别的 Pod，OOM_ADJ参数设置成了**1000**，对于`Burstable`级别的 Pod，OOM_ADJ参数取值**从2到999**。

对于 kuberntes 保留资源，比如kubelet，docker，OOM_ADJ参数设置成了**-999**，表示不会被OOM kill掉。OOM_ADJ参数设置的越大，计算出来的OOM分数越高，表明该pod优先级就越低，当出现资源竞争时会越早被kill掉，对于OOM_ADJ参数是-999的表示kubernetes永远不会因为OOM将其kill掉。

## QoS pods被kill掉场景与顺序

* Best-Effort pods：系统用完了全部内存时，该类型 pods 会最先被kill掉。
* Burstable pods：系统用完了全部内存，且没有 Best-Effort 类型的容器可以被 kill 时，该类型的 pods 会被 kill 掉。
* Guaranteed pods：系统用完了全部内存，且没有 Burstable 与 Best-Effort 类型的容器可以被 kill 时，该类型的 pods 会被 kill 掉。

## QoS使用建议
如果资源充足，可将 QoS pods 类型均设置为`Guaranteed`。用计算资源换业务性能和稳定性，减少排查问题时间和成本。如果想更好的提高资源利用率，业务服务可以设置为Guaranteed，而其他服务根据重要程度可分别设置为Burstable或Best-Effort。

## 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://www.haimaxy.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://www.haimaxy.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
