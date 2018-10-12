---
title: kubernetes PodPreset 的使用
date: 2018-01-23
tags: ["kubernetes", "PodPreset"]
keywords: ["kubernetes", "PodPreset", "用法"]
slug: how-to-use-podpreset-in-kubernetes
gitcomment: true
bigimg: [{src: "/img/posts/photo-1498637841888-108c6b723fcb.jpeg", desc: "Transfagarasan by Drone"}]
category: "kubernetes"
---

最近在`kubernetes`上安装 [sentry](https://github.com/cnych/k8s-repo/tree/master/sentry) 的时候，我将`sentry`需要运行的3个服务放到同一个**POD**中的，WEB、Celery Worker、Crontab 分别用一个独立的容器来运行的，但是这三个容器需要用到环境变量基本上都是一样的，比如数据库的配置、消息队列的配置，这样就造成一个问题是我需要把完全一模一样的环境配置复制3份，因为3个容器都需要使用，这样如果需要更改的话也要改3个地方。幸好`kubernetes`给我们提供了一种新的特性：**PodPreset**，该对象用来在 Pod 创建的时候向 Pod 中注入某些特定信息，可以包括 secret、volume、volume mount 和环境变量等。

<!--more-->

> 注意：`PodPreset`资源对象只有**kubernetes 1.8**以上版本才支持。

## PodPreset
`PodPreset`是用来在 Pod 被创建的时候向其中注入额外的信息的API 资源。您可以使用`label selector` 来匹配为哪些 Pod 应用`PodPreset`。

`kubernetes`提供了一个准入控制器（PodPreset），当启用后，`PodPreset`会将应用创建请求传入到该控制器上。当有 Pod 创建请求发生时，系统将执行以下操作：

* 检索所有可用的`PodPresets`
* 检查有`PodPreset`的标签选择器上的标签与正在创建的Pod 上的标签是否匹配。
* 尝试将由`PodPreset`定义的各种资源合并到正在创建的Pod 中。
* 出现错误时，在该 Pod 上引发记录合并错误的事件，PodPreset 不会注入任何资源到创建的 Pod 中。
* 注释刚生成的修改过的 Pod spec，以表明它已被 PodPreset 修改过。注释的格式为 `podpreset.admission.kubernetes.io/podpreset-<pod-preset name>": "<resource version>"`。

每个 Pod 可以匹配零个或多个 PodPrestet；并且每个 PodPreset 可以应用于零个或多个 Pod。 PodPreset 应用于一个或多个 Pod 时，Kubernetes 会修改 Pod Spec。对于 Env、EnvFrom 和 VolumeMounts 的更改，Kubernetes 修改 Pod 中所有容器的容器 spec；对于 Volume 的更改，Kubernetes 修改 Pod Spec。

可能在某些情况下，您希望 Pod 不会被任何 Pod Preset 突变所改变。在这些情况下，您可以在 Pod 的 Pod Spec 中添加注释：`podpreset.admission.kubernetes.io/exclude："true"`。


## 启用 PodPreset
要启用`PodPreset`功能，需要确保你使用的是`kubernetes 1.8`版本以上，然后需要在准入控制中加入`PodPreset`，另外为了定义`PodPreset`对象，还需要其中`podpreset`的API 类型：

* ---admission-control=NamespaceLifecycle,LimitRanger,ServiceAccount,DefaultStorageClass,ResourceQuota,`PodPreset`
* ---runtime-config=rbac.authorization.k8s.io/v1alpha1=true,`settings.k8s.io/v1alpha1=true`

注意上面的`kube-apiserver`中的启动参数(前面是两个**-**)，参数修改完成后，重启`kube-apiserver`即可。

## 示例
比如我们将我们上面的`sentry`的环境变量定义成一个`PodPreset`对象：(sentry-podpreset.yaml)
```yaml
apiVersion: settings.k8s.io/v1alpha1
kind: PodPreset
metadata:
  name: sentry-env
  namespace: kube-ops
spec:
  selector:
    matchLabels:
      app: sentry
  env:
  - name: C_FORCE_ROOT
    value: "true"
  - name: SENTRY_REDIS_HOST
    value: "redis"
  - name: SENTRY_REDIS_PORT
    value: "6379"
  - name: SENTRY_REDIS_DB
    value: "2"
  - name: SENTRY_RABBITMQ_HOST
    value: "rabbitmq:5672"
  - name: SENTRY_RABBITMQ_USERNAME
    value: "root"
  - name: SENTRY_RABBITMQ_PASSWORD
    value: "root"
  - name: SENTRY_SECRET_KEY
    value: "xxxxxxxxxxxxx"
  - name: SENTRY_POSTGRES_HOST
    value: "postgresql"
  - name: SENTRY_POSTGRES_PORT
    value: "5432"
  - name: SENTRY_DB_NAME
    value: "sentry"
  - name: SENTRY_DB_USER
    value: "sentry"
  - name: SENTRY_DB_PASSWORD
    value: "sentry321"
```

我们可以看到定义的`PodPreset`匹配了一个标签：`app: sentry`，所有带有该标签的 POD 都会被注入上面的环境变量。

然后我们的`sentry`的部署文件就可以简化成这样了：(sentry-deployment.yaml)
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  labels:
    app: sentry
  name: sentry
  namespace: kube-ops
spec:
  template:
    metadata:
      labels:
        app: sentry
    spec:
      containers:
      - image: sentry:8.22.0
        imagePullPolicy: Always
        name: sentry
        ports:
        - containerPort: 9000
          name: web
      - image: sentry:8.22.0
        imagePullPolicy: Always
        name: sentry-worker
        command: ["sentry", "run", "worker"]
      - image: sentry:8.22.0
        imagePullPolicy: Always
        name: sentry-cron
        command: ["sentry", "run", "cron"]
```
然后执行命令：
```shell
$ kubectl create -f sentry-podpreset.yaml
$ kubectl create -f sentry-deployment.yaml
```

然后我们可以去 dashboard 中或者通过 kubectl 命令查看创建的 sentry POD已经被注入了所有的环境变量了。

## 参考资料

* [https://kubernetes.io/docs/tasks/inject-data-application/podpreset/](https://kubernetes.io/docs/tasks/inject-data-application/podpreset/)


扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)


