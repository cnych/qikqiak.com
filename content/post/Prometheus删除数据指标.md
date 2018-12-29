---
title: Prometheus 删除数据指标
date: 2018-12-29
tags: ["Prometheus"]
slug: prometheus-delete-metrics
keywords: ["Prometheus", "删除", "数据指标", "metrics"]
gitcomment: true
bigimg: [{src: "https://ws3.sinaimg.cn/large/006tNbRwgy1fynh878dk1j315o0rsjvw.jpg", desc: "kiss"}]
category: "kubernetes"
---

有的时候我们可能希望从 Prometheus 中删除一些不需要的数据指标，或者只是单纯的想要释放一些磁盘空间。Prometheus 中的时间序列只能通过 HTTP API 来进行管理。

<!--more-->

默认情况下，管理时间序列的 API 是被禁用的，要启用它，我们需要在 Prometheus 的启动参数中添加`--web.enable-admin-api`这个参数，比如我们前面的文章中通过 Kubernetes Pod 来部署的，则同样需要添加上这个参数：
```yaml
command:
- "/bin/prometheus"
args:
- "--config.file=/etc/prometheus/prometheus.yml"
- "--storage.tsdb.path=/prometheus"
- "--storage.tsdb.retention=24h"
- "--web.enable-admin-api"  # 控制对admin HTTP API的访问，其中包括删除时间序列等功能
- "--web.enable-lifecycle"  # 支持热更新，直接执行localhost:9090/-/reload立即生效
```

> 如果你使用的是 Prometheus Operator 部署的话，貌似官方没有给出这个参数的配置，可以通过编辑对应的 Staefulset 资源对象来添加该参数。

## 删除时间序列指标
控制管理 API 启用后，可以使用下面的语法来删除与某个标签匹配的所有时间序列指标：
```shell
$ curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={kubernetes_name="redis"}'
```

> 将 localhost 替换成你自己的 Prometheus 的访问地址即可。

上面命令就可以用于删除具有标签`kubernetes_name="redis"`的时间序列指标。


如果要删除一些 job 任务或者 instance 的数据指标，则可以使用下面的命令：
```shell
$ curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={job="kubernetes-service-endpoints"}'
$ curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={instance="10.244.2.158:9090"}'
```

要从 Prometheus 中删除所有的数据，可以使用如下命令：
```shell
$ curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]={__name__=~".+"}'
```

不过需要注意的是上面的 API 调用并不会立即删除数据，实际数据任然还存在磁盘上，会在后面进行数据清理。

要确定何时删除旧数据，可以使用`--storage.tsdb.retention`参数进行配置（默认情况下，Prometheus 会将数据保留15天）。


## 推荐
最后打个广告，给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
