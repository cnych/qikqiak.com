---
title: Kubernetes翻船事故汇总
date: 2019-04-27
tags: ["kubernetes", "iptables", "Netfilter", "tcpdump"]
keywords: ["kubernetes", "Netfilter", "网络", "Linux", "iptables", "tcpdump", "防火墙"]
slug: troubleshooting-k8s-network
gitcomment: true
notoc: true
draft: true
category: "kubernetes"
---

有人建了一个 [GitHub](https://github.com/hjacobs/kubernetes-failure-stories) 仓库，专门汇总使用 Kubernetes 失败的案例。Kubernetes 是一个相当复杂的系统，它有许多组件，生态在不断发展，并且还在添加更多层，比如 Service Mesh。而在这样的情况下，似乎业内缺乏真实而引人注意的 Kubernetes 失败案例给大家相互借鉴。于是创建了这么一个仓库，希望这些惨痛的经历可以给包括 SRE、Ops、平台与基础设施团队在内的 Kubernetes 操作人员一些学习的机会，减少在生产中运行 Kubernetes 的风险。

目前项目已经更新了 30 余篇文章，涉及内容包括配置改变、数据被清空、GKE 集群升级事故、模板线行为误解、集群中 DNS 掉线与应用迁移中断等，具体内容查看：https://k8s.af

你使用 Kubernetes 有没有过翻船经历，欢迎留言分享。


## 翻船案例

1. 用 Kubernetes 砸自己脚的10种方法，＃9会让你大吃一惊 -  Datadog  -  KubeCon Barcelona 2019：[https://www.youtube.com/watch?v=QKI-JRs2RIE](https://www.youtube.com/watch?v=QKI-JRs2RIE)
涉及：CoreDNS，ndots:5，IPVS conntrack，imagePullPolicy: Always，DaemonSet，NAT实例，最新标签，API服务器OOMKill，kube2iam，cluster-autoscaler，PodPriority，审计日志，spec.replicas，AWS ASG重新平衡，CronJob，Pod容错 ，zombies，readinessProbe.exec，cgroup freeze，kubectl
影响：unknown，AP server 中断，pending pod，deployments 非常缓慢

2. How Spotify Accidentally Deleted All its Kube Clusters with No User Impact - Spotify - KubeCon Barcelona 2019
involved: GKE, cluster deletion, browser tabs, Terraform, global state file, git PRs, GCP permissions
impact: no impact on end users