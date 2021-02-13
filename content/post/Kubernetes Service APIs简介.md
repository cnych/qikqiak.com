---
title: Kubernetes Service APIs 简介
date: 2020-12-23
tags: ["kubernetes", "traefik", "Service API"]
keywords: ["网络", "kubernetes", "ingress", "ingressroute", "Service API"]
slug: kubernetes-service-apis-intro
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210213101637.png", desc: "https://unsplash.com/photos/UPWuKzAcuUI"}]
category: "kubernetes"
---

Kubernetes 服务 APIs（Service APIs）是由 `SIG-NETWORK` 社区管理的开源项目，项目地址：[https://github.com/kubernetes-sigs/service-apis](https://github.com/kubernetes-sigs/service-apis)。该项目的目标是在 Kubernetes 生态系统中发展服务网络API，服务 API提供了暴露 Kubernetes 应用的接口 - Services、Ingress 等。


<!--more-->

## 服务 API 的目标是什么？

服务 API 是通过提供可表达的、可扩展的、面向角色的接口来改善服务网络，这些接口由许多厂商实现，并得到了广泛的行业支持。

服务 API 是一个 API 资源的集合--Service、GatewayClass、Gateway、HTTPRoute、TCPRoute 等，这些资源共同为各种网络用例构建模型。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201231093733.png)

服务 API 如何改进当前的标准，如 Ingress？

- **更具表现力** - 表达更多的核心功能，比如它们针对诸如基于 header 的匹配、流量权重以及其他仅在 Ingress 中通过自定义方式才可能实现的功能。
- **更具扩展性** - 它们允许将自定义资源链接到 API 的各个层，这就允许在 API 结构的适当位置进行更精细的定制。
- **面向角色** - 它们被分成不同的 API 资源，这些资源映射到 Kubernetes 上运行应用程序的常见角色。
- **通用性** - 就像 Ingress 是一个具有众多[实现的通用规范](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/)一样，服务 API 被设计成一个由许多实现支持的可移植规范。

其他一些显著的功能包括...

- **共享网关** - ****通过允许独立的路由资源绑定到同一个网关，从而实现共享负载均衡器和 VIP，这使得团队可以安全地共享基础设施，而不需要直接协调。
- **类型化后端引用** - 通过类型化后端引用，路由（Routes）可以引用Kubernetes Services，也可以引用任何一种被设计为网关（Gateway）后端的 Kubernetes 资源。
- **跨命名空间引用** - 跨不同命名空间的路由（Routes）可以绑定
到网关（Gateway），尽管有命名空间，但仍允许共享网络基础设施。
- **类** - GatewayClasses 将负载均衡实现的类型形式化，这些类使用户可以很容易而明确地了解作为资源模型本身有什么样的能力。

## 相关概念

在服务 API 中有3个主要的角色。

- 基础设施提供者
- 集群运维
- 应用开发人员

在某些用例中，可能会有第四个角色应用程序管理员。

服务 API 的相关资源最初将作为 CRD 定义在 `networking.x-k8s.io` API 组中。在我们的资源模型中，有3种主要类型的对象：

- `GatewayClass` 定义了一组具有共同配置和行为的网关。
- `Gateway` 网关请求一个可以将流量转换到集群内服务的点。
- `Routes` 路由描述了通过网关而来的流量如何映射到服务。

### GatewayClass

`GatewayClass` 定义了一组共享共同配置和行为的网关，每个GatewayClass 将由一个控制器处理，尽管控制器可以处理多个GatewayClass。

GatewayClass 是一个集群范围的资源，必须定义至少一个GatewayClass 才能提供 Gateways 功能。实现 Gateway API 的控制器通过提供相关联的 GatewayClass 资源来实现，用户可以从他们的Gateway 中引用该资源。

这类似于 Ingress 的 `IngressClass` 和 `PersistentVolumes` 的`StorageClass`。在 Ingress v1beta1 中，最接近 GatewayClass 的是 `ingress-class` 注解，而在 IngressV1 中，最接近的就是 `IngressClass` 对象。

### Gateway

Gateway 网关描述了如何将流量路由到集群内的服务。也就是说，它定义了将流量从不了解 Kubernetes 的地方路由到 Kubernetes 的地方的方法请求。例如，由云负载均衡器、集群内代理或外部硬件负载均衡器发送到 Kubernetes 服务的流量，虽然许多用例的客户端流量源自集群的 "外部"，但这并不是强制要求的。

它定义了对实现 GatewayClass 配置和行为协定的特定负载均衡器配置的请求。该资源可以由运维人员直接创建，也可以由处理 GatewayClass 的控制器创建。

由于 Gateway 规范声明了用户意图，因此它可能不包含规范中所有属性的完整规范。例如，用户可以省略地址、端口、TLS 等字段，这使得管理 GatewayClass 的控制器可以为用户提供这些设置，从而使规范更具可移植性，使用 GatewayClass Status 对象将使此行为更清楚。
<!--adsense-text-->
一个 Gateway 可以包含一个或多个 *Route 引用，这些引用的作用是将一个子集的流量路由到一个特定的服务上。

### {HTTP,TCP,Foo}Route

Route 对象定义了特定协议的规则，用于将请求从网关映射到 Kubernetes 服务。

`HTTPRoute` 和 `TCPRoute` 是目前唯一定义的Route对象，未来可能会添加其他特定协议的 Route 对象。

### BackendPolicy

BackendPolicy 提供了一种配置网关和后端之间连接的方法。在这个 API 中，后端是指路由可以转发流量的任何资源。这个级别的配置目前仅限于 TLS，但将来会扩展到支持更高级的策略，如健康检查。

一些后端配置可能会根据针对后端的 Route 而有所不同。在这些情况下，配置字段将放在 Routes 上，而不是 BackendPolicy 上，有关该资源未来可能配置的更多信息，请参考相关的 [GitHub Issue](https://github.com/kubernetes-sigs/service-apis/issues/196)。

### Combined types

GatewayClass、Gateway、xRoute 和 Service 的组合将定义一个可实现的负载均衡器，下图说明了这些资源之间的关系。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201231104024.png)

## 请求流程

使用反向代理实现的网关的一个典型的客户端/网关 API 请求流程如下所示：

1. 客户端向 [http://foo.example.com](http://foo.example.com/) 发出请求
2. DNS 将该名称解析为网关地址。
3. 反向代理在 Listener 上接收请求，并使用 Host 头来匹配 HTTPRoute。
4. （可选）反向代理可以根据 HTTPRoute 的匹配规则执行请求头`和/或` 路径匹配。
5. （可选）反向代理可以根据 HTTPRoute 的过滤规则修改请求，即添加/删除头。
6. 最后，反向代理可以根据 HTTPRoute 的 forwardTo 规则，将请求转发到集群中的一个或多个对象，即 Service。

## 扩展点

API 中提供了一些扩展点，以灵活处理大量通用 API 无法处理的用例。

以下是 API 中扩展点的摘要。

- **XRouteMatch.ExtensionRef**：这个扩展点应该用来扩展特定核心 Route 的匹配语义。这是一个实验性的扩展点，未来会根据反馈进行迭代。
- **XForwardTo.BackendRef**：这个扩展点应该用于将流量转发到核心Kubernetes 服务资源以外的网络端点。例如 S3 bucket、Lambda 函数、文件服务器等。
- **HTTPRouteFilter**：HTTPRoute 中的这一 API 类型提供了一种方法，可以 hook HTTP 请求的请求/响应生命周期。
- **自定义 Routes**：如果上述扩展点都不能满足用例的需求，实现者可以选择为目前 API 中不支持的协议创建自定义路由资源。

## Traefik

在最新的 `traefikv2.4.0-rc1` 版本中已经新增了一个 Kubernetes Gateway  的 Provider，该 Provider 是 Kubernetes SIGs 的服务 APIs 规范的 Traefik 实现。这个提供者是作为实验性功能提出的，部分支持服务 APIs  v0.1.0 规范。

具体使用示例可以参考文档：[https://doc.traefik.io/traefik/v2.4/providers/kubernetes-gateway/](https://doc.traefik.io/traefik/v2.4/providers/kubernetes-gateway/) 了解更多信息。

<!--adsense-self-->
