---
title: Prometheus3.0 全新 UI
date: 2024-09-19
tags: ["prometheus"]
slug: prometheus-3-0-new-ui
keywords: ["kubernetes", "prometheus", "ui"]
gitcomment: true
category: "prometheus"
---

Prometheus 团队在 PromCon 大会上宣布了 Prometheus 3.0 版本的发布，并在官方博客上详细介绍了所有令人兴奋的新变化和功能。Prometheus 3.0 最引人注目的亮点之一是默认启用的全新 Web UI。

<!--more-->

## 为什么需要新的用户界面?

Prometheus 之前的 UI，是一个 React 应用。它使用了过时版本的 Bootstrap CSS 框架进行样式设计，多年来积累了许多缺陷、视觉混乱和过度使用的颜色。

举个极端的例子，看看旧版 `/targets` 页面顶部的过滤器:

![旧 UI targets 页面](https://picdn.youdianzhishi.com/images/1726734286385.png)

或者 `/graph` 页面顶部的大量复选框 - 看起来并不美观:

![旧 UI graph 页面](https://picdn.youdianzhishi.com/images/1726734309900.png)

从技术角度来看，旧的用户界面在底层也变得相当过时，这使得维护和添加重要的新功能变得更具挑战性。因此，新的 UI 是完全重写的(部分代码改编自旧 UI)，主要目标是:

1. 通过重新思考和整理每个页面的布局，减少多年来积累的视觉混乱。
2. 使用基于 React 的 `Mantine UI` 组件框架而不是过时的基于 Bootstrap 的样式，创造更现代的外观和体验。
3. 添加一些主要功能，例如 `PromLens` 风格的树状视图、查询解释选项卡以及指标和标签资源管理器。
4. 通过在底层使用更现代的技术栈和模式，实现更好的未来开发和维护。

虽然新的 UI 添加了一些新功能，但这里的想法并不是构建任何完全不同的东西，比如完整的 Dashboard 构建器，Prometheus 仍然将该领域留给 Grafana 或 Perses 等工具。

## 关于新 UI 风格的总体说明

在深入细节之前，让我们先看看新用户界面的整体外观和感觉。

### 改进的菜单结构

以下是新的菜单结构:

![新 UI 菜单布局](https://picdn.youdianzhishi.com/images/1726734467620.png)

正如您所看到的，大多数页面仍然像以前一样还在，只是进行了轻微的重命名并添加了图标。最重要的是，`Graph` 页面已重命名为 `Query`，因为这更符合实际(并非每个查询都以图表形式呈现)。您还会注意到 `Status` 菜单是分段的，其标题将显示您当前所在的页面，就像这里的目标页面一样:

![新 UI 状态页面，菜单中显示标题](https://picdn.youdianzhishi.com/images/1726734552752.png)

### 减少混乱，提高页面间的一致性

您还会发现整体上减少了混乱，在面板和过滤器方面，各个页面之间有了更多的视觉一致性。不同页面的样式和布局仍然略有不同，因为它们服务于不同的需求并呈现不同类型的数据。但我尽最大努力使这些差异不那么突兀。一些不常用的设置和开关已从各自的页面中移除，但仍可以在全局设置菜单中找到:

![新 UI 全局设置菜单](https://picdn.youdianzhishi.com/images/1726734578406.png)

### 查询页面之外的 PromQL 高亮显示

如果您查看新 UI 中的告警或规则页面，现在您将看到规则 PromQL 表达式以语法高亮的方式呈现，而不是尝试将整个规则渲染为 YAML，以下是新告警页面的示例:

![新 UI 告警页面](https://picdn.youdianzhishi.com/images/1726734618771.png)

### 暗黑模式

就像旧 UI 一样，新 UI 也有暗黑模式，您可以通过顶部菜单中的开关进行切换。希望新的暗黑模式现在看起来更具吸引力:

![新 UI 暗模式示例](https://picdn.youdianzhishi.com/images/1726734660043.png)

## 突出的新功能

让我们来看看新 UI 中一些最令人兴奋的新功能!

### 指标和标签浏览器

Prometheus 3.0 带来了一个新的指标浏览器，允许您搜索所有可用的指标，以及每个指标的已知元数据:

![新 UI 指标浏览器](https://picdn.youdianzhishi.com/images/1726734684406.png)

这个浏览器还允许您深入查看特定指标名称的标签名称和值:

![新 UI 标签浏览器](https://picdn.youdianzhishi.com/images/1726734700439.png)

这有助于您快速了解某个指标上可用的标签、它们各自的基数以及它们产生的系列数量。标签浏览器还允许您逐步添加标签匹配过滤器来缩小结果范围。最后，您可以将构建的选择器插入到文本输入中。

### PromLens 风格的查询树视图

借鉴自 `PromLens`，新 UI 现在允许您将任何 PromQL 查询显示为子表达式树:

![新 UI PromQL 树视图](https://picdn.youdianzhishi.com/images/1726734730447.png)

树状视图显示了每个节点评估的序列数量，以及每个子表达式中存在的标签数据。通过悬停在标签名称上，您可以看到它的一些示例标签值:

![新 UI 树视图中的标签值](https://picdn.youdianzhishi.com/images/1726734764981.png)

您还可以点击任何树节点，以表格或图表形式查看其完整数据。

### "Explain"选项卡

结合树状视图，新的 `Explain` 选项卡现在将为任何选定的树节点提供对应的解释和行为洞察，例如，点击一个函数调用将显示该函数的文档:

![新 UI 显示函数文档](https://picdn.youdianzhishi.com/images/1726734824819.png)

`Explain` 选项卡在理解和调试两个向量之间的二元运算符中的向量匹配行为时特别有用。例如，这里您可以看到两个输入向量之间成功的多对一向量匹配被图示说明:

![新 UI 解释成功的二元运算匹配](https://picdn.youdianzhishi.com/images/1726734859620.png)

这里您可以看到一个错误的向量匹配尝试，以及对出错原因的解释和可视化:

![新 UI 解释错误的二元运算匹配](https://picdn.youdianzhishi.com/images/1726734874342.png)

我希望这些新功能能够为人们的 PromQL 构建体验带来更多乐趣。

## 功能完整性、稳定性和切换回旧版

虽然新 UI 带来了许多新的优势，但新 UI 中仍有一些小功能缺失，我们计划会尽快添加，两个最突出的是:

1. 将直方图显示为热图。
2. 在图表视图中显示示例数据。

这两个功能在使用新的 `uPlot` 图表库时实现起来都比较棘手，该库取代了旧 UI 中过时且基本上不再维护的 `Flot` 图表库。

如果您依赖这些特定功能，或者遇到新 UI 的任何其他问题，您仍然可以通过使用 `old-ui` 功能标志暂时切换回旧 UI:

```bash
./prometheus --enable-feature=old-ui [...]
```

由于新 UI 尚未经过实战检验，因此您很可能仍会遇到 bug 或性能问题。如果遇到，请在 [GitHub 上报告](https://github.com/prometheus/prometheus/issues/new?assignees=&labels=&projects=&template=bug_report.yml)，以便我查看。

## 立即尝试!

要试用新 UI，可以立即安装 Prometheus 3.0 beta 版本，但如果您只想在不安装任何东西的情况下试用新 UI，可以看看这个临时的 Prometheus 3.0 演示服务：[https://demo-new.promlabs.com/query?g0.expr=%23+The+ratios+of+individual+request+rates+as+compared+to+their+instance%27s+total+traffic.%0Arate%28demo_api_request_duration_seconds_count%7Bjob%3D%22demo%22%7D%5B5m%5D%29+%2F+on%28instance%29+group_left+sum+by%28instance%29+%28rate%28demo_api_request_duration_seconds_count%7Bjob%3D%22demo%22%7D%5B5m%5D%29%29&g0.show_tree=1&g0.tab=explain&g0.range_input=1h&g0.res_type=auto&g0.res_density=medium&g0.display_mode=lines&g0.show_exemplars=0](https://demo-new.promlabs.com/query?g0.expr=%23+The+ratios+of+individual+request+rates+as+compared+to+their+instance%27s+total+traffic.%0Arate%28demo_api_request_duration_seconds_count%7Bjob%3D%22demo%22%7D%5B5m%5D%29+%2F+on%28instance%29+group_left+sum+by%28instance%29+%28rate%28demo_api_request_duration_seconds_count%7Bjob%3D%22demo%22%7D%5B5m%5D%29%29&g0.show_tree=1&g0.tab=explain&g0.range_input=1h&g0.res_type=auto&g0.res_density=medium&g0.display_mode=lines&g0.show_exemplars=0)。

## 结语

如上所述，Prometheus 3.0 中的新 UI 不仅为用户提供了更现代、更简洁的体验，还在 PromQL 查询构建和理解方面添加了有价值的新功能。我希望您喜欢这个新界面，我们也期待着随时间推移不断改进它!

> 原文链接：https://promlabs.com/blog/2024/09/11/a-look-at-the-new-prometheus-3-0-ui/
