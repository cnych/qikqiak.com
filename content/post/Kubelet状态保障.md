---
title: Kubelet 状态更新机制
date: 2019-04-18
tags: ["kubernetes", "kubelet"]
keywords: ["kubernetes", "kubelet", "状态", "同步", "apiserver"]
slug: kubelet-sync-node-status
gitcomment: true
bigimg: [{src: "https://ws3.sinaimg.cn/large/006tKfTcgy1g1aj3z02c3j315o0rs120.jpg", desc: "STEP"}]
category: "kubernetes"
draft: true
---

1. Kubelet 会定期更新状态到 apiserver，通过参数`--node-status-update-frequency`指定上报频率，默认是10s上报一次
2. kube-controller-manager 会每隔`--node-monitor-period`时间去检查 kubelet 的状态，默认是5s。
3. 当 node 失联一段时间后，kubernetes判定node为notready状态，通过`--node-monitor-grace-period`配置，默认40s
4. 当node失联一段时间后，kubernetes判定node为unhealthy，通过`--node-startup-grace-period`配置，默认1m0s
5. 当node失联一段时间后，kubernetes开始删除原node上的pod，通过`--pod-eviction-timeout`配置，默认5m0s
3. 如果状态在`--node-monitor-grace-period`内更新了，kube-controller-manager 会考虑 Kubelet 的健康状态，默认时间是40s。

> kube-controller-manager 和 kubelet 是异步工作的，这意味着延迟可能包括任何的网络延迟、apiserver 的延迟、etcd 延迟，一个节点上的负载引起的延迟等等。因此，如果`--node-status-update-frequency`设置为5s，那么当etcd无法将数据提交到仲裁节点时，它可能会在6-7s内出现在etcd中，甚至更长时间。


## 失败
Kubelet在更新状态失败时，会进行`nodeStatusUpdateRetry`次重试，目前nodeStatusUpdateRetry被设置成5。

Kubelet 会在函数`tryUpdateNodeStatus`中尝试进行状态更新。Kubelet 使用了 Golang 中的`http.Client()`方法，但是没有指定超时时间，因此，如果 API Server 过载时，当建立 TCP 连接时可能会出现一些故障。

因此，`nodeStatusUpdateRetry` * `--node-status-update-frequency`会尝试去设置节点的状态。

同事，Kubernetes 的 controller manager 将尝试每`--node-monitor-period`时间检查`nodeStatusUpdateRetry`次。在`--node-monitor-grace-period`之后，会认为节点 unhealthy，然后会在`--pod-eviction-timeout`后删除 Pod。

kube proxy 有一个 watcher API，一旦 Pod 被驱逐了，kube proxy 将会通知更新节点的 iptables 规则，将 Pod 从 Service 的 Endpoints 中移除，这样就不会访问到来自故障节点的 Pod 了。

## 配置
### 快速更新和快速反应
如果`--node-status-update-frequency`被设置为4s（默认为10s），`--node-monitor-period`设置为2s（默认为5s），`--node-monitor-grace-period`设置为20s（默认为40s），`--pod-eviction-timeout`设置为30s（默认为5m）。

在这种情况下，Pod 将在 50s 内被驱逐，因为该节点在20s后被视为Down掉了，`--pod-eviction-timeout`在30s之后发生，但是，这种情况会给etcd产生很大的开销，因为每个节点都会尝试每2s更新一次状态。

如果环境有1000个节点，那么每分钟将有15000个节点更新，这可能需要大型etcd容器甚至是etcd的专用节点。

如果我们计算尝试次数，则除法将给出5，但实际上每次尝试的nodeStatusUpdateRetry尝试将从3到5。 由于所有组件的延迟，尝试总次数将在15到25之间变化。



