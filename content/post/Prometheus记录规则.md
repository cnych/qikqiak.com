---
title: Prometheus 记录规则的使用
subtitle: PromQL 语句查询性能优化
date: 2019-12-14
tags: ["kubernetes", "prometheus", "rules"]
keywords: ["kubernetes", "prometheus", "recording", "rules", "记录规则"]
slug: recording-rules-on-prometheus
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/prometheus-recording-rules.png",
      desc: "prometheus recording rules",
    },
  ]
category: "prometheus"
---

Prometheus 作为现在最火的云原生监控工具，它的优秀表现是毋庸置疑的。但是在我们使用过程中，随着时间的推移，存储在 Prometheus 中的监控指标数据越来越多，查询的频率也在不断的增加，当我们用 Grafana 添加更多的 Dashboard 的时候，可能慢慢地会体验到 Grafana 已经无法按时渲染图表，并且偶尔还会出现超时的情况，特别是当我们在长时间汇总大量的指标数据的时候，Prometheus 查询超时的情况可能更多了，这时就需要一种能够类似于后台批处理的机制在后台完成这些复杂运算的计算，对于使用者而言只需要查询这些运算结果即可。Prometheus 提供一种**记录规则（Recording Rule）** 来支持这种后台计算的方式，可以实现对复杂查询的 PromQL 语句的性能优化，提高查询效率。

<!--more-->

## 问题

比如我们想要了解 Kubernetes 节点之间 CPU 和内存的实际利用率，我们可以通过使用 `container_cpu_usage_seconds_total` 和 `container_memory_usage_bytes` 这两个指标来查询 CPU 和内存的利用率。因为每个运行中的容器都会收集这两个指标进行，但是需要知道，对于稍微大点的线上环境，可能我们同时运行着成千上万的容器，比如现在我们以每 5 分钟的频率去查询下一周内数千个容器的数据的时候，Prometheus 就比较难以快速进行数据查询了。

比如我们用 `container_cpu_usage_seconds_total` 总数除以 `kube_node_status_allocatable_cpu_cores` 总数得出 CPU 利用率：

```
sum(rate(container_cpu_usage_seconds_total[5m])) / avg_over_time(sum(kube_node_status_allocatable_cpu_cores)[5m:5m])
Load time: 15723ms
```

使用滚动窗口将 `container_memory_usage_bytes` 总数除以 `kube_node_status_allocatable_memory_bytes` 总数来计算内存利用率：

```
avg_over_time(sum(container_memory_usage_bytes)[15m:15m]) / avg_over_time(sum(kube_node_status_allocatable_memory_bytes)[5m:5m])
Load time: 18656ms
```

## 记录规则

我们说了 Prometheus 提供了一种叫做 **记录规则（Recording Rule）**的方式可以来优化我们的查询语句，记录规则的基本思想是，它允许我们基于其他时间序列创建自定义的 meta-time 序列，如果你使用 Prometheus Operator 的话可以发现 Prometheus 中已经有了大量此类规则，比如：

```yaml
groups:
  - name: k8s.rules
    rules:
      - expr: |
          sum(rate(container_cpu_usage_seconds_total{image!="", container!=""}[5m])) by (namespace)
        record: namespace:container_cpu_usage_seconds_total:sum_rate
      - expr: |
          sum(container_memory_usage_bytes{image!="", container!=""}) by (namespace)
        record: namespace:container_memory_usage_bytes:sum
```

上面的这两个规则就完全可以执行上面我们的查询，它们会连续执行并以很小的时间序列将结果存储起来。`sum(rate(container_cpu_usage_seconds_total{job="kubelet", image!="", container_name!=""}[5m])) by (namespace)`将以预定义的时间间隔进行评估，并存储为新的指标：`namespace:container_cpu_usage_seconds_total:sum_rate`，与内存查询相同。

现在，我可以将查询更改为如下所示得出 CPU 利用率：

```
sum(namespace:container_cpu_usage_seconds_total:sum_rate) / avg_over_time(sum(kube_node_status_allocatable_cpu_cores)[5m:5m])
Load time: 1077ms
```

现在，它的运行速度提高了 14 倍！

同样的方式计算内存利用率：

```
sum(namespace:container_memory_usage_bytes:sum) / avg_over_time(sum(kube_node_status_allocatable_memory_bytes)[5m:5m])
Load time: 677ms
```

现在运行速度提高了 27 倍！

## 记录规则用法

在 Prometheus 配置文件中，我们可以通过 `rule_files` 定义 `recoding rule` 规则文件的访问路径，和定义报警规则的方式基本一致：

```yaml
rule_files: [- <filepath_glob> ...]
```

每一个规则文件通过以下格式进行定义：

```yaml
groups: [- <rule_group>]
```

一个简单的规则文件可能是这个样子的：

```yaml
groups:
  - name: example
    rules:
      - record: job:http_inprogress_requests:sum
        expr: sum(http_inprogress_requests) by (job)
```

rule_group 的具体配置项如下所示：

```yaml
# 分组的名称，在一个文件中必须是唯一的
name: <string>
# 评估分组中规则的频率
[ interval: <duration> | default = global.evaluation_interval ]
rules:
  [ - <rule> ... ]
```

与告警规则一致，一个 group 下可以包含多条规则 rule。

```yaml
# 输出的时间序列名称，必须是一个有效的 metric 名称
record: <string>
# 要计算的 PromQL 表达式，每个评估周期都是在当前时间进行评估的，结果记录为一组新的时间序列，metrics 名称由 record 设置
expr: <string>
# 添加或者覆盖的标签
labels: [<labelname>: <labelvalue>]
```

根据规则中的定义，Prometheus 会在后台完成 `expr` 中定义的 PromQL 表达式计算，并且将计算结果保存到新的时间序列 `record` 中，同时还可以通过 labels 标签为这些样本添加额外的标签。

这些规则文件的计算频率默认与告警规则计算频率一致，都通过 `global.evaluation_interval` 进行定义:

```yaml
global: [evaluation_interval: <duration> | default = 1m]
```

## 参考文档

- [DEFINING RECORDING RULES](https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/)
- [Today I Learned: Prometheus Recording Rules](https://deploy.live/blog/today-i-learned-prometheus-recording-rules/)

<!--adsense-self-->
