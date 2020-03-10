---
title: 带时光机的 Kubernetes Dashboard - Kubevious
date: 2020-03-10
tags: ["kubernetes", "kubevious"]
keywords: ["kubernetes", "kubevious", "时光机", "", "Time Machine", "Dashboard"]
slug: k8s-ui-kubevious
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310130608.png", desc: "https://unsplash.com/photos/v9MpHbQimqY"}]
category: "kubernetes"
---

[Kubevious](https://github.com/kubevious/kubevious) 是一个开源的 Kubernetes Dashboard，但是和我们主流的 Dashboard 却不太一样，可以说非常有特色，他将应用程序相关得所有配置都集中在一起，这可以大大节省操作人员得时间，其实这都不是最主要的，主要的是他具有一个 `Time Machine`（时光机）功能，允许我们回到之前的时间去查看应用的错误信息。

<!--more-->

## 特点
其实大部分 Kubernetes 的 Dashboard 功能都是大同小异的，那么 `Kubevious` 又具有哪些特点呢？

### 以应用为中心的可视化方式
我们知道在 Kubernetes 中即使是一个简单的 Hello World 程序，也会产生很多资源对象，要获取和应用程序相关的配置是相对比较麻烦的。Kubevious 以应用程序为中心的 UI 方式来呈现整个 Kubernetes 集群的配置，他会标识应用相关的 Deployments、ReplicaSets、Pods、Services、Ingresses、Volumes、ConfigMaps 等等资源对象，并和应用程序的一个 Box 一起显示。

![应用为中心的可视化方式](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310122618.png)

主屏幕使用很多 Box 渲染，每个 Box 都可以选中，也可以通过双击进行展开，会在右侧面板显示每个 Box 关联的属性和配置。

### 错误配置检测
Kubernetes 各个组件和资源对象都是独立配置的，所以很有可能在使用组件的时候出现一些类似于拼写错误。Kubevious 就可以识别许多错误，比如标签错误、端口丢失等等，红色圆圈包含了子节点内的错误数量。

![错误配置检测](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310123246.png)


### 识别级联配置
Kubernetes 中的配置是高度可重用的，微小的变化可能都会导致意想不到的后果。Kubevious 可以标识共享配置，并显示其他从属对象，这样就可以一目了然，确保更改的级联效应。

![识别级联配置](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310123610.png)

### 支持全文搜索
当 Kubernetes 集群对象非常多的时候，要想找到一个特定的配置也是非常浪费时间的，Kubevious 就是支持整个集群的全文搜索。

![支持全文搜索](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310123757.png)

### 容量规划和资源使用优化
直接通过 Kubevious 可以清楚地确定每个容器、Pod、Deployment、DaemonSet、命名空间等占用了多少资源。Kubevious 不仅呈现绝对资源请求值，还呈现每个节点，名称空间和整个集群的相对使用情况。确定哪些应用占用命名空间内的大部分资源。

![容量规划和资源使用优化](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310123941.png)

<!--adsense-text-->

### 权限标识
将过多的控制权授予应用不仅增加了被黑客入侵的风险，而且还影响了节点和整个集群的稳定性。Kubevious 会将应用及其相应的命名空间标记为`radioactive`（放射性），具体来说就是它会检查特权容器、hostPID、hostNetwork、hostIPC 等标志，以及 mount 到一些敏感的宿主机位置上，比如 `docker.sock`文件等。

![权限标识](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310124124.png)

### 时光机
这可能是我觉得最有意思的一个特性了，因为我们知道随着应用的不断变化，要想去跟踪应用的各种问题是非常困难的，而 Kubevious 就可以通过时光机功能允许我们回到之前的时间点去查看应用的配置和错误信息。

![时光机](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310124511.png)


## 安装
Kubevious 可以在任何 Kubernetes 发现版本上进行安装，可以使用 Helm 来快速安装，关于 Helm 的使用可以查看我们前面的相关文章。

```shell
$ kubectl create namespace kubevious
$ git clone https://github.com/kubevious/deploy.git kubevious-deploy.git
$ cd kubevious-deploy.git/kubernetes
$ helm template kubevious \
    --namespace kubevious \
    -f kubevious/values.latest.yaml \
    > kubevious.yaml
```

直接将 Chart 模板渲染成 Kubernetes 资源对象，渲染过后的资源对象还需要做点小小的改动，由于 Kubevious 是依赖 MySQL 的，所以我们要为 MySQL 提供一个存储，最好的方式是在 `volumeClaimTemplates` 里面提供一个可用的 `StorageClass` 对象，这样就可以自动创建 PV 了，然后直接创建上面的资源对象即可：
```shell
$ kubectl apply -f kubevious.yaml
```

在安装使用的过程中可能会出现数据库和数据库表没有自动创建的问题，我们可以进入到数据库中手动创建数据库，然后将 `kubevious-mysql-init-script` 这个 ConfigMap 下面的 SQL 语句执行一次来手动创建表。如果遇到连接数据库的时候出现权限问题，同样可以登录到数据库中重新配置下权限：
```shell
$ kubectl exec -it kubevious-mysql-0 /bin/bash -n kubevious
root@kubevious-mysql-0:/# mysql -uroot -p
Enter password: 
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 838
Server version: 5.7.29-log MySQL Community Server (GPL)

Copyright (c) 2000, 2020, Oracle and/or its affiliates. All rights reserved.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY '' WITH GRANT OPTION;
Query OK, 0 rows affected, 1 warning (0.11 sec)
mysql> FLUSH PRIVILEGES; 
```

正常安装完成后我们可以查看对应的资源对象：
```shell
$ kubectl get pods -n kubevious
NAME                            READY   STATUS    RESTARTS   AGE
kubevious-8467486674-252wl      1/1     Running   0          57m
kubevious-mysql-0               1/1     Running   1          77m
kubevious-ui-786b6d68df-jp829   1/1     Running   0          66m
$ kubectl get svc -n kubevious
NAME                  TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
kubevious-mysql-svc   ClusterIP   None            <none>        3306/TCP         3h8m
kubevious-svc         NodePort    10.104.101.24   <none>        4000:31651/TCP   3h8m
kubevious-ui-svc      NodePort    10.96.43.12     <none>        3000:32367/TCP   3h8m
```

默认创建的是 `NodePort` 类型的 `Service`，这个时候我们就可以通过 `http://<nodeIP:32367>` 访问到 Kubevious 了。

![kubevious](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200310130013.png)

不过 `Kubevious` 也是有一个比较大的缺陷是使用的 `MySQL` 数据库来做的集群快照，对于小规模的集群问题不大，对于大规模的集群来说应该性能和容量就会慢慢成为瓶颈了，项目毕竟还处于早期阶段，未来还是可期的。

<!--adsense-self-->
