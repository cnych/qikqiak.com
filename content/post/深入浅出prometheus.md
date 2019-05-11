---
title: 《深入浅出Prometheus》
subtitle: 原理、应用、源码与拓展详解
date: 2019-04-01
tags: ["kubernetes", "prometheus"]
keywords: ["kubernetes", "prometheus", "书籍", "深入浅出"]
slug: prometheus-book
gitcomment: true
category: "kubernetes"
---

千呼万唤始出来，国内第一本全方位讲解`Prometheus`的书籍`《深入浅出Prometheus》`终于出版了，非常荣幸能和陈晓宇、陈啸两位老师参与本书的编写，这也是我参与的第一本严格意义上的书籍，另外两位老师对于`Prometheus`研究的深度让我非常佩服，在编写本书的过程中也学习到了很多专业的知识，特别是关于`Prometheus`原理和源码方面的认识，之前都只是局限于应用层面，在了解了原理过后显然可以让我们更加有信心去使用`Prometheus`。

<!--more-->

## 内容简介
Prometheus 是由 SoundCloud 开源的监控系统，是 Google BorgMon 监控系统的开源版本。伴随着容器及`Kubernetes`技术的兴起，Prometheus 越来越受到大家的关注。

![prometheus book](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/hdK2Su.jpg)

本书系统讲解了 Prometheus 的原理、应用、源码和拓展，图文并茂、讲解全面。原理篇主要介绍了 Prometheus 的整体架构及与其他监控系统的对比和优势，让读者从整体上把握 Prometheus 的相关概念。应用篇从传统应用监控和 Kubernetes 监控两方面讲解 Prometheus 的安装、配置及优秀实践，着重介绍 Redis、MySQL server 等常用中间件监控，并结合 Kubernetes，详细讲解如何通过 Prometheus 监控容器集群，还对每个操作都进行了非常详尽的记录。源码与拓展篇从整体到局部详细剖析 Prometheus 的源码架构，并且结合实际生产环境二次定制 Prometheus 的部分功能，可加深读者对 Prometheus 的理解，也能很好地帮助读者提升 Prometheus 开发技能。

Prometheus 将会成为监控运维方面最锋利的瑞士军刀。无论是对于运维工程师、软件架构师、研发工程师，还是对于资深IT人士来说，《深入浅出Prometheus：原理、应用、源码与拓展详解》都能带来一些新的思路和方式。

## 内容目录
Prometheus 是一个Go语言编写的高性能监控系统，采用拉取的方式获取被监控对象监控信息并提供了多维度数据模型和灵活的查询接口。Prometheus 不仅可以通过静态文件配置监控对象，还支持自动发现机制，能够通过 Kubernetes、Consul、DNS 等多种方式动态获取监控对象。在数据采集方面，借助 Go 语言的高并发特性单机 Prometheus 支持数百个节点监控数据的采集。数据存储方面，本地时序数据库不断优化，支持单机每秒一千万个指标的采集。如果需要存储大量历史监控数据，Prometheus 还可以支持远端存储，更好的扩展 Prometheus 的数据存储。

本书共分为4篇12章，分别讲解了 Prometheus 原理、传统应用监控和 Kubernetes 中的监控应用，以及源码和拓展，具体目录如下：

* 1. 主要介绍监控系统概念和架构设计，剖析监控系统内部结构。从程序运行的角度逐一分析，介绍了基础资源监控、中间件监控、应用程序监控和日志监控，然后对比了多种监控系统优缺点，并指出 Prometheus 独特的优势。
* 2. 首先介绍 Prometheus 相关概念，包括数据指标的定义和分类。接着介绍了 Prometheus 总体架构和工作原理，包括指标采集、监控数据存储以及基于监控数据的告警。最后概要介绍了 Prometheus 联邦以及 Thanos 原理。
* 3. 主要介绍 Prometheus 数据存储，首先介绍了本地时序数据库（Prometheus TSDB），从台的历史演进、设计理念、实现原理多个方面详细介绍本地熟悉数据库，接着介绍了远端存储的使用方式和实现原理，通过 Influxdb 为例，详细分析 Adapter 的工作原理。
* 4. 主要介绍 Prometheus exporter背景、使用方式和工作原理，首先介绍了几个常用的 exporter，包括 MySQL server exporter、Redis exporter、Node exporter 的内部构造，最后通过源码角度解析 exporter，并编写一个简单的 exporter。
* 5. 主要介绍了 Kubernetes 集群常用的一些监控方案，包括 Heapster、kube-state-metrics、metrics-server，最后介绍了 Prometheus 在 Kubernetes 集群中监控的优点。
* 6. 主要介绍了 Prometheus 在 Kubernetes 集群中的安装配置，首先介绍了如何用常规的手动方式在 Kubernetes 集群中安装 Prometheus，然后介绍了 Kubernetes 中另外一种更加高级的监控方案 Prometheus Operator 的安装使用，包括添加自定义监控项、添加自定义报警、自动发现配置、数据持久化配置等。
* 7. 主要介绍了 Prometheus 监控 Kubernetes 集群服务的一些配置方法，首先介绍了手动的静态配置方法，然后介绍了如何使用 Prometheus 中的服务发现配置来自动发现 Kubernetes 中的 Service 服务。
* 8. 主要介绍了 Promethues 监控 Kubernetes 集群的一些常用监控对象，包括使用 cAdvisor 进行容器监控、apiserver 的监控、Service 的监控、kube-state-metrics 在 Kubernetes 集群中的监控应用，最后介绍了如何使用 node-exporter 监控 Kubernetes 集群的节点。
* 9. 主要介绍了 Prometheus 监控 Kubernetes 集群的数据展示，首先介绍了在 Kubernetes 集群中安装 Grafana 的方法，然后介绍了 Grafana 配置 Prometheus 数据源以及一些常用的 Dashboard 的配置方法，还介绍了 Grafana 针对 Kubernetes 集群监控的一个常用插件 grafana-kuberentes-app 的安装使用，最后介绍了如何使用 Grafana 报警，包括邮件、钉钉报警等。
* 10. 主要介绍了 Prometheus 监控 Kubernetes 集群的报警功能，首先介绍了如何在 Kubernetes 集群中安装 Prometheus 的报警模块 Alertmanager，然后介绍了如何通过 Configmap 资源对象配置报警规则，最后介绍了如何写一个 webhook 接收器来处理 Alertmanager 报警数据。
* 11. 主要对 Prometheus 源码进行分析，包括 Prometheus 初始化、数据采集、通知管理、规则管理和查询引擎五个部分，以二次开发实战的方式加深对 Prometheus 程序结构的理解。
* 12. 主要对 AlertManager 源码进行分析，包括接受告警、告警调度、告警匹配、告警处理和告警通知五个部分，结合配置文件中的配置项，从源码角度理解告警分组、告警频次控制、告警路由、告警抑制和告警静默功能的实现。

## 送书活动
现在天猫和京东都是预售（离发货也很快了），我这里第一时间获得了4本现货书籍，为了回馈`k8s技术圈`社区的朋友，特意赠送给大家。活动规则：`转发此文到朋友圈，明天(4月2日)晚上10点前截图发送到【k8s技术圈】公众号后台，截图中点赞数量最多的四人将每人免费获得一本该书籍。`当然没有获得免费赠送的也可以通过下面的链接参与购买。

转发链接：[https://mp.weixin.qq.com/s?__biz=MzU4MjQ0MTU4Ng==&mid=2247484172&idx=1&sn=890f5ab2ad4e9359505d7958166d8f49&chksm=fdb90c11cace850784971962b34ab959be09479781ccc5b0e3cd15db79f6a2a347cf2cd446e1&token=2048854271](https://mp.weixin.qq.com/s?__biz=MzU4MjQ0MTU4Ng==&mid=2247484172&idx=1&sn=890f5ab2ad4e9359505d7958166d8f49&chksm=fdb90c11cace850784971962b34ab959be09479781ccc5b0e3cd15db79f6a2a347cf2cd446e1&token=2048854271)

## 购买链接

* 天猫预售地址：[https://detail.tmall.com/item.htm?spm=a212k0.12153887.0.0.64a3687dQ6nSzh&id=590161370307](https://detail.tmall.com/item.htm?spm=a212k0.12153887.0.0.64a3687dQ6nSzh&id=590161370307)
* 京东购买地址：[https://item.jd.com/44066787013.html](https://item.jd.com/44066787013.html)
* 在天猫/京东中搜索`prometheus`

<!--adsense-self-->
