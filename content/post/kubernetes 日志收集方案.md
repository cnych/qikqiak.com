---
title: kubernetes 日志收集方案
date: 2017-11-22
tags: ["kubernetes", "ElasticSearch", "阿里云"]
slug: kubernetes-logs-collect
keywords: ["kubernetes", "EFK", "ElasticSearch", "Kibana", "Fluentd", "阿里云"]
gitcomment: true
bigimg: [{src: "/img/posts/23734057_146614452628759_6006637352594702336_n.jpg", desc: "Cherish all moments."}]
category: "kubernetes"
---

完善的日志系统是保证系统持续稳定运行的基石，帮助提升运维、运营效率，建立大数据时代的海量日志处理等能力都需要日志系统的支持，所以搭建一套行之有效的日志系统至关重要。

本文将介绍两种kubernetes 集群下日志收集的方案：阿里云日志服务或者`EFK`方案

<!--more-->


## 阿里云日志服务

> 阿里云日志服务（Log Service，简称 Log）是针对日志类数据一站式服务，在阿里巴巴集团经历了大量大数据场景锤炼而成。用户无需开发就能快捷完成数据采集、消费、投递以及查询分析等功能，帮助提升运维、运营效率，建立 DT 时代海量日志处理能力。

实际上对于小团队自己搭建`ELK`或者`EFK`成本是很高的，特别是`ElasticSearch`本身非常消耗资源不说，能够将其性能优化到一定程度都是非常不容易的一件事情，所以对于中小团队能使用第三方的日志服务更加方便，即使你一定要使用`ES`的话，我也推荐使用阿里云的`ElasticSearch`的云服务。

同样的我们可以集成阿里云日志服务来查看和管理您的`Kubernetes`集群应用的日志。

#### 创建日志项目

首先登录[日志服务管理控制台](https://sls.console.aliyun.com/?spm=a3c0i.o55339zh.a3.1.5f5559eecVCIMa#/)，创建一个项目(Project)：`k8slog-project`

#### 创建日志收集`Agent`

直接使用阿里云提供的`fluentd`组件

```shell
$ curl http://aliacs-k8s.oss.aliyuncs.com/conf%2Flogging%2Ffluentd-pilot.yml > fluentd-pilot.yml
```

将上面yaml 文件中对应的env 环境值更改成实际的值，其中：

- **FLUENTD_OUTPUT：** 固定值 aliyun_sls，代表将日志收集到阿里云日志服务。
- **ALIYUNSLS_PROJECT：** 您第一步创建的阿里云日志服务的 project 名称.
- **ALIYUNSLS_REGION_ENDPOINT:** 日志服务的服务入口。根据您的日志服务所处的地域和网络类型填写日志服务的服务入口，参见 [日志服务服务入口](https://www.alibabacloud.com/help/zh/doc-detail/29008.htm)。
- **ALIYUNSLS_ACCESS_KEY_ID：** 您的阿里云账号的 access_key_id。
- **ALIYUNSLS_ACCESS_KEY_SECRET:** 您的阿里云账号的 access_key_secret。
- **ALIYUNSLS_NEED_CREATE_LOGSTORE:** 当 Logstore 不存在的时候是否自动创建，`true` 表示自动创建。

```yaml
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: fluentd-pilot
  namespace: kube-system
  labels:
    k8s-app: fluentd-pilot
    kubernetes.io/cluster-service: "true"
spec:
  template:
    metadata:
      labels:
        k8s-app: fluentd-es
        kubernetes.io/cluster-service: "true"
        version: v1.22
      annotations:
        scheduler.alpha.kubernetes.io/critical-pod: ''
        scheduler.alpha.kubernetes.io/tolerations: '[{"key": "node.alpha.kubernetes.io/ismaster", "effect": "NoSchedule"}]'
    spec:
      containers:
      - name: fluentd-pilot
        image: registry.cn-hangzhou.aliyuncs.com/wangbs/fluentd-pilot:latest
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        env:
          - name: "FLUENTD_OUTPUT"
            value: "aliyun_sls"
          - name: "ALIYUNSLS_PROJECT"
            value: "k8slog-project"
          - name: "ALIYUNSLS_REGION_ENDPOINT"
            value: "cn-shanghai.log.aliyuncs.com"
          - name: "ALIYUNSLS_ACCESS_KEY_ID"
            value: "xxxxxxx"
          - name: "ALIYUNSLS_ACCESS_KEY_SECRET"
            value: "xxxxxx"
          - name: "ALIYUNSLS_NEED_CREATE_LOGSTORE"
            value: "true"
        volumeMounts:
        - name: sock
          mountPath: /var/run/docker.sock
        - name: root
          mountPath: /host
          readOnly: true
      terminationGracePeriodSeconds: 30
      volumes:
      - name: sock
        hostPath:
          path: /var/run/docker.sock
      - name: root
        hostPath:
          path: /
```

创建完成后可以查看运行状态：

```shell
$ kubectl get ds -n kube-system
NAME              DESIRED   CURRENT   READY     UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
fluentd-pilot     4         4         4         4            4           <none>          5h
```

#### 收集应用日志

为了让`Fluentd`收集您的应用日志，您需要在应用的环境变量中设置参数 `aliyun_logs_fluentd=stdout` 来启用应用的日志收集功能。其中，`fluentd` 是您上面创建的日志 Project 的`Logstore`，如果该 Logstore 不存在，系统会自动为您创建该名称的 Logstore；`stdout` 代表收集标准输出的日志，您还可以配置收集文件日志，具体使用方式请参考 Fluentd-pilot。

这里我们按照上面的方式在`kubedns`上面添加环境变量：`aliyun_logs_kubedns=stuout`，然后更新`kubedns`，设置好应用后，就可以前往 [日志服务管理控制台](https://sls.console.aliyun.com/?spm=5176.2020520001.1001.148.e5PUEp#/) 查看并使用日志了。

![aliyun log server](/img/posts/WX20171114-171959.png)



## EFK 方案

参考文章：[在 Kubernetes 上搭建 EFK 日志收集系统](/post/install-efk-stack-on-k8s/)
