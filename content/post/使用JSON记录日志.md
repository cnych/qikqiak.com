---
title: 请使用 JSON 格式记录日志[译]
date: 2020-05-14
tags: ["kubernetes", "efk", "elk"]
slug: record-log-as-json
keywords: ["kubernetes", "efk", "elk", "logstash", "json"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200514091130.png",
      desc: "https://unsplash.com/photos/yZTCvnOTpms",
    },
  ]
category: "kubernetes"
---

日志和监控就像 Tony Stark 和他的 Iron Man 西装一样，两者需要一起使用才能发挥最大的威力，因为它们可以很好互补。

日志一直是应用程序和基础框架性能和故障诊断的重要手段，但是现在我们已经意识到日志不仅可以用于故障诊断，还可以用于大数据分析以及业务的一些可视化和性能分析等等。

所以，记录应用程序日志是非常非常重要的。

<!--more-->

## 为什么使用 JSON 格式

为了了解 JSON 日志记录的优越性，我们先来了解下 Anuj（系统工程师）和 Kartik（业务分析师）之间的一次对话。

![](https://picdn.youdianzhishi.com/images/20200514085021.png)

但是几天后 Kartik 发现 Web 接口挂掉了，Anuj 摸了摸头，看了看日志，发现是开发人员在日志中添加了一个额外的字段，这破坏了他自定义的日志解析器。

我相信很多童鞋都可能遇到过类似的情况吧？

在这种情况下，如果开发人员将应用程序设计为 JSON 格式的日志，那么 Anuj 定义的解析器就非常简单了，然后基于 JSON 的 key 搜索字段就可以了，而不需要关心是否在日志中修改了新的字段。

使用 JSON 格式的日志最大的好处就是它本身就是结构化的，这样我们去分析应用日志就非常方便了，不仅可以方便读取日志，还可以通过每个字段进行日志查询，而且几乎所有编程语言都可以很轻松的解析它。

## JSON 日志魔法

最近我们创建了一个 Golang 示例应用程序，来获取代码构建、测试和部署阶段的一些相关信息，我们就采用了使用 JSON 格式的日志进行记录。

采集的日志样本如下所示：

![](https://picdn.youdianzhishi.com/images/20200514085908.png)

在使用 ELK 进行日志收集的时候，我们只需要在 Logstash 中添加如下所示的日志解析即可：

```shell
filter {
  json {
    source => "message"
  }
}
```

我们不需要任何额外的解析步骤，即使在日志中添加了新的字段。采集到的日志如下图所示：

![](https://picdn.youdianzhishi.com/images/20200514090054.png)

我们可以看到在 Kibana 中已经将 JSON 日志的 key 自动解析为了 ES 的属性，比如 employee_name、employee_city 等字段，我们完全不需要在 Logstash 或者其他工具中去添加一些非常复杂的解析，现在我们使用这些数据去创建一些 Dashboard 进行数据分析就非常容易了。

## 结论

从文本日志迁移到 JSON 日志格式并不会花费太长时间，大部分编程语言都有对应的 JSON 日志库，我非常确信 JSON 日志格式会为你当前的日志收集系统提供更大的灵活性。

下面是一些支持 JSON 日志格式的流行的库：

- Golang - https://github.com/sirupsen/logrus
- Python - https://github.com/thangbn/json-logging-python
- Java - https://howtodoinjava.com/log4j2/log4j-2-json-configuration-example/
- PHP - https://github.com/nekonomokochan/php-json-logger

希望现在大家对 JSON 格式日志有一个更好的了解。

> 原文链接：[https://blog.opstree.com/2019/12/31/log-everything-as-json/](https://blog.opstree.com/2019/12/31/log-everything-as-json/)

<!--adsense-self-->
