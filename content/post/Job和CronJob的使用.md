---
title: Job和CronJob 的使用方法
date: 2018-06-09
tags: ["kubernetes", "Pod", "Job", "CronJob"]
slug: use-job-cronjob
keywords: ["kubernetes", "job", "cronjob", "pod"]
gitcomment: true
bigimg: [{src: "/img/posts/photo-1503863937795-62954a3c0f05.jpeg", desc: "Morning glory"}]
category: "kubernetes"
---

上节课我们学习了`Pod`自动伸缩的方法，我们使用到了`HPA`这个资源对象，我们在后面的课程中还会和大家接触到`HPA`的。今天我们来给大家介绍另外一类资源对象：Job，我们在日常的工作中经常都会遇到一些需要进行批量数据处理和分析的需求，当然也会有按时间来进行调度的工作，在我们的`Kubernetes`集群中为我们提供了`Job`和`CronJob`两种资源对象来应对我们的这种需求。

<!--more-->

* `Job`负责处理任务，即仅执行一次的任务，它保证批处理任务的一个或多个`Pod`成功结束
* `CronJob`则就是在`Job`上加上了时间调度。


### Job

我们用`Job`这个资源对象来创建一个任务，我们定一个`Job`来执行一个倒计时的任务，定义`YAML`文件：
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: job-demo
spec:
  template:
    metadata:
      name: job-demo
    spec:
      restartPolicy: Never
      containers:
      - name: counter
        image: busybox
        command:
        - "bin/sh"
        - "-c"
        - "for i in 9 8 7 6 5 4 3 2 1; do echo $i; done"
```

注意`Job`的`RestartPolicy`仅支持`Never`和`OnFailure`两种，不支持`Always`，我们知道`Job`就相当于来执行一个批处理任务，执行完就结束了，如果支持`Always`的话是不是就陷入了死循环了？

然后来创建该`Job`，保存为`job-demo.yaml`：
```shell
$ kubectl create -f job.yaml
job "job-demo" created
```

然后我们可以查看当前的`Job`资源对象：
```shell
$ kubectl get jobs
NAME       DESIRED   SUCCESSFUL   AGE
job-demo   1         1            1m
```

注意查看我们的`Pod`的状态，同样我们可以通过`kubectl logs`来查看当前任务的执行结果。
```shell
$ kubectl get pods
NAME                  READY     STATUS             RESTARTS   AGE
job-demo-p6zst        0/1       Completed          0          14h
$ kubectl logs job-demo-p6zst
9
8
7
6
5
4
3
2
1
```

### CronJob

`CronJob`其实就是在`Job`的基础上加上了时间调度，我们可以：在给定的时间点运行一个任务，也可以周期性地在给定时间点运行。这个实际上和我们`Linux`中的`crontab`就非常类似了。

一个`CronJob`对象其实就对应中`crontab`文件中的一行，它根据配置的时间格式周期性地运行一个`Job`，格式和`crontab`也是一样的。

`crontab`的格式如下：

> **分 时 日 月 星期 要运行的命令**
  第1列分钟0～59
  第2列小时0～23）
  第3列日1～31
  第4列月1～12
  第5列星期0～7（0和7表示星期天）
  第6列要运行的命令


现在，我们用`CronJob`来管理我们上面的`Job`任务，

```yaml
apiVersion: batch/v2alpha1
kind: CronJob
metadata:
  name: cronjob-demo
spec:
  successfulJobsHistoryLimit: 10
  failedJobsHistoryLimit: 10
  schedule: "*/1 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: hello
            image: busybox
            args:
            - "bin/sh"
            - "-c"
            - "for i in 9 8 7 6 5 4 3 2 1; do echo $i; done"
```

我们这里的`Kind`是`CronJob`了，要注意的是`.spec.schedule`字段是必须填写的，用来指定任务运行的周期，格式就和`crontab`一样，另外一个字段是`.spec.jobTemplate`, 用来指定需要运行的任务，格式当然和`Job`是一致的。还有一些值得我们关注的字段`.spec.successfulJobsHistoryLimit`和`.spec.failedJobsHistoryLimit`，表示历史限制，是可选的字段。它们指定了可以保留多少完成和失败的`Job`，默认没有限制，所有成功和失败的`Job`都会被保留。然而，当运行一个`Cron Job`时，`Job`可以很快就堆积很多，所以一般推荐设置这两个字段的值。如果设置限制的值为 0，那么相关类型的`Job`完成后将不会被保留。

接下来我们来创建这个`cronjob`
```shell
$ kubectl create -f cronjob-demo.yaml
cronjob "cronjob-demo" created
```

当然，也可以用`kubectl run`来创建一个`CronJob`：
```shell
$ kubectl run hello --schedule="*/1 * * * *" --restart=OnFailure --image=busybox -- /bin/sh -c "date; echo Hello from the Kubernetes cluster"
cronjob.batch "hello" created
$ kubectl get cronjob
NAME      SCHEDULE      SUSPEND   ACTIVE    LAST SCHEDULE   AGE
hello     */1 * * * *   False     0         <none>          13s
$ kubectl get jobs
NAME               DESIRED   SUCCESSFUL   AGE
hello-1528533240   1         1            1m
hello-1528533300   1         0            1s
$ pods=$(kubectl get pods --selector=job-name=hello-1528533240 --output=jsonpath={.items..metadata.name})
$ kubectl logs $pods
Sat Jun  9 08:34:19 UTC 2018
Hello from the Kubernetes cluster
```

一旦不再需要 Cron Job，简单地可以使用 kubectl 命令删除它：
```shell
$ kubectl delete cronjob hello
cronjob.batch "hello" deleted
```

这将会终止正在创建的 Job 也会把当前 Cron Job 下面的 Job 清空。然而，运行中的 Job 将不会被终止，不会删除 Job 或 它们的 Pod。

> 一旦 Job 被删除，由 Job 创建的 Pod 也会被删除。


本文节选自视频教程[从 Docker 到 Kubernetes 进阶](https://www.haimaxy.com/course/6n8xd6/)
[![docker-k8s](/img/posts/docker-k8s.png)](https://www.haimaxy.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

