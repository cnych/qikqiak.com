---
title: Prometheus 监控 Kubernetes Job 资源误报的坑
date: 2022-03-06
tags: ["kubernetes", "prometheus", "alertmanager", "promql"]
keywords:
  [
    "kubernetes",
    "job",
    "cronjob",
    "prometheus",
    "alertmanager",
    "promql",
    "误报",
  ]
slug: prometheus-monitor-k8s-job-trap
gitcomment: true
notoc: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20220306100118.png",
      desc: "https://unsplash.com/photos/_LXb4Yw-iVA",
    },
  ]
category: "kubernetes"
---

昨天在 Prometheus 课程辅导群里面有同学提到一个问题，是关于 Prometheus 监控 Job 任务误报的问题，大概的意思就 CronJob 控制的 Job，前面执行失败了，监控会触发报警，解决后后面生成的新的 Job 可以正常执行了，但是还是会收到前面的报警：

![问题描述](https://picdn.youdianzhishi.com/images/20220305200158.png)

这是因为一般在执行 Job 任务的时候我们会保留一些历史记录方便排查问题，所以如果之前有失败的 Job 了，即便稍后会变成成功的，那么之前的 Job 也会继续存在，而大部分直接使用 kube-prometheus 安装部署的话使用的默认报警规则是`kube_job_status_failed > 0`，这显然是不准确的，只有我们去手动删除之前这个失败的 Job 任务才可以消除误报，当然这种方式是可以解决问题的，但是不够自动化，一开始没有想得很深入，想去自动化删除失败的 Job 来解决，但是这也会给运维人员带来问题，就是不方便回头去排查问题。下面我们来重新整理下思路解决下这个问题。

<!--more-->

`CronJob` 会在计划的每个执行时间创建一个 Job 对象，可以通过 `.spec.successfulJobsHistoryLimit` 和 `.spec.failedJobsHistoryLimit` 属性来保留多少已完成和失败的 Job，默认分别为 3 和 1，比如下面声明一个 `CronJob` 的资源对象：

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: hello
spec:
  schedule: "*/1 * * * *"
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: hello
              image: busybox
              imagePullPolicy: IfNotPresent
              command:
                - /bin/sh
                - -c
                - date;
          restartPolicy: OnFailure
```

根据上面的资源对象规范，Kubernetes 将只保留一个失败的 Job 和一个成功的 Job：

```shell
NAME               COMPLETIONS   DURATION   AGE
hello-4111706356   0/1           2m         10d
hello-4111706356   1/1           5s         5s
```

要解决上面的误报问题，同样还是需要使用到 `kube-state-metrics` 这个服务，它通过监听 Kubernetes APIServer 并生成有关对象状态的指标，它并不关注单个 Kubernetes 组件的健康状况，而是关注内部各种对象的健康状况，例如 Deployment、Node、Job、Pod 等资源对象的状态。这里我们将要使用到以下几个指标：

- `kube_job_owner`：用来查找 Job 和触发它的 CronJob 之间的关系
- `kube_job_status_start_time`：获取 Job 被触发的时间
- `kube_job_status_failed`：获取执行失败的任务
- `kube_cronjob_spec_suspend`：过滤掉挂起的作业

下面是一个指标示例，其中包含 CronJob 触发运行的`hello` 任务生成的标签：

```shell
kube_job_owner{job_name="hello-1604875860", namespace="myNamespace", owner_is_controller="true", owner_kind="CronJob", owner_name="hello"} 1
kube_job_status_start_time{job_name="hello-1604875860", namespace="myNamespace"} 1604875874
kube_job_status_failed{job_name="hello-1604875860", namespace="myNamespace", reason="BackoffLimitExceeded"} 1
kube_cronjob_spec_suspend{cronjob="hello",job="kube-state-metrics", namespace="myNamespace"} 0
```

要想做到监控报警准确，其实我们只需要去**获取同一个 CronJob 触发的一组 Job 的最后一次任务，只有该 Job 在执行失败的时候才触发报警**即可。

<!--adsense-text-->

由于 `kube_job_status_failed` 和 `kube_job_status_start_time` 指标中并不包含所属 CronJob 的标签，所以第一步需要加入这个标签，而 `kube_job_owner` 指标中的 `owner_name` 就是我们需要的，可以用下面的 promql 语句来进行合并：

```shell
max(
  kube_job_status_start_time
  * ON(job_name, namespace) GROUP_RIGHT()
  kube_job_owner{owner_name != ""}
  )
BY (job_name, owner_name, namespace)
```

这里我们使用 `max` 函数是因为我们可能会因为 HA 运行多个 kube-state-metrics，所以用 max 函数来返回每个 Job 任务的一个结果即可。假设我们的 Job 历史记录包含 2 个任务（一个失败，另一个成功），结果将如下所示：

```shell
{job_name="hello-1623578940", namespace="myNamespace", owner_name="hello"} 1623578959
{job_name="hello-1617667200", namespace="myNamespace", owner_name="hello"} 1617667204
```

现在我们知道每个 Job 的所有者了，接着我们需要找出最后执行的任务，我们可以通过按 `owner_name` 标签聚合结果来实现这一点：

```shell
max(
  kube_job_status_start_time
  * ON(job_name,namespace) GROUP_RIGHT()
  kube_job_owner{owner_name!=""}
)
BY (owner_name)
```

上面这条语句会找到每个 owner（也就是 CronJob）最新的任务开始时间，然后再和上面的语句进行合并，保留开始时间相同的记录即为最新执行的 Job 任务了：

```shell
max(
 kube_job_status_start_time
 * ON(job_name,namespace) GROUP_RIGHT()
 kube_job_owner{owner_name!=""}
)
BY (job_name, owner_name, namespace)
== ON(owner_name) GROUP_LEFT()
max(
 kube_job_status_start_time
 * ON(job_name,namespace) GROUP_RIGHT()
 kube_job_owner{owner_name!=""}
)
BY (owner_name)
```

结果将显示每个 CronJob 最后执行的作业，并且仅显示最后一个：

```shell
{job_name="hello-1623578940", namespace="myNamespace", owner_name="hello"} 1623578959
```

为了增加可读性我们还可以将 job_name、owner_name 标签替换为 job 和 cronjob，这样更容易看明白：

```shell
label_replace(
  label_replace(
    max(
      kube_job_status_start_time
      * ON(job_name,namespace) GROUP_RIGHT()
      kube_job_owner{owner_name!=""}
    )
    BY (job_name, owner_name, namespace)
    == ON(owner_name) GROUP_LEFT()
    max(
      kube_job_status_start_time
      * ON(job_name,namespace) GROUP_RIGHT()
      kube_job_owner{owner_name!=""}
    )
    BY (owner_name),
  "job", "$1", "job_name", "(.+)"),
"cronjob", "$1", "owner_name", "(.+)")
```

现在将会看到类似于下面的结果：

```shell
{job="hello-1623578940", cronjob="hello", job_name="hello-1623578940", namespace="myNamespace", owner_name="hello"} 1623578959
```

由于上面的查询语句比较复杂，如果每次报警评估的时候都去进行一次实时计算会对 Prometheus 产生非常大的压力，这里我们可以借助记录规则来实现类离线计算的方式，大大提高效率，创建如下所示的记录规则，用来表示获取每个 CronJob 最后执行的作业记录：

```yaml
- record: job:kube_job_status_start_time:max
  expr: |
    label_replace(
      label_replace(
        max(
          kube_job_status_start_time
          * ON(job_name,namespace) GROUP_RIGHT()
          kube_job_owner{owner_name!=""}
        )
        BY (job_name, owner_name, namespace)
        == ON(owner_name) GROUP_LEFT()
        max(
          kube_job_status_start_time
          * ON(job_name,namespace) GROUP_RIGHT()
          kube_job_owner{owner_name!=""}
        )
        BY (owner_name),
      "job", "$1", "job_name", "(.+)"),
    "cronjob", "$1", "owner_name", "(.+)")
```

现在我们知道了 CronJob 最近开始执行的 Job 了，那么想要过滤出失败的，则再使用 `kube_job_status_failed` 指标就可以了：

```yaml
- record: job:kube_job_status_failed:sum
  expr: |
    clamp_max(job:kube_job_status_start_time:max, 1)
      * ON(job) GROUP_LEFT()
      label_replace(
        (kube_job_status_failed > 0),
        "job", "$1", "job_name", "(.+)"
      )
```

这里使用 `clamp_max` 函数将 `job:kube_job_status_start_time:max` 的结果转换为一组上限为 1 的时间序列，使用它来通过乘法过滤失败的作业，得到包含一组最近失败的 Job 任务，这里我们也添加到名为 `kube_job_status_failed:sum` 的记录规则中。

最后一步就是直接为失败的 Job 任务添加报警规则，如下所示：

```yaml
- alert: CronJobStatusFailed
  expr: |
    job:kube_job_status_failed:sum
    * ON(cronjob, namespace) GROUP_LEFT()
    (kube_cronjob_spec_suspend == 0)
```

为避免误报，我们已将挂起的任务排除在外了。到这里我们就解决了 Prometheus 监控 CronJob 的任务误报的问题，虽然 kube-prometheus 为我们内置了大量的监控报警规则，但是也不能完全迷信，有时候并不一定适合实际的需求。

最后也为大家推荐下我们全新制作的 Prometheus 课程正在上新促销中，内容丰富、价格优惠，扫描下方海报二维码前往购买：

![Prometheus](https://picdn.youdianzhishi.com/images/20220306095902.png)
