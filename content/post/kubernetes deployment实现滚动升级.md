---
title: Kubernetes Deployment滚动升级
date: 2017-10-18
publishdate: 2017-10-18
tags: ["kubernetes", "deployment"]
keywords: ["kubernetes", "deployment", "滚动", "升级", "回滚", "更新"]
bigimg: [{src: "/img/posts/22280765_1473377219422921_7316093626113589248_n.jpg", desc: "峨眉山@四川 Sep 30,2017"}]
slug: kubernetes-rollout-update
category: "kubernetes"
gitcomment: true
---

我们`k8s`集群使用的是1.7.7版本的，该版本中官方已经推荐使用`Deployment`代替`Replication Controller`(rc)了，`Deployment`继承了rc的全部功能外，还可以查看升级详细进度和状态，当升级出现问题的时候，可以使用回滚操作回滚到指定的版本，每一次对Deployment的操作，都会保存下来，变能方便的进行回滚操作了，另外对于每一次升级都可以随时暂停和启动，拥有多种升级方案：`Recreate`删除现在的`Pod`，重新创建；`RollingUpdate`滚动升级，逐步替换现有`Pod`，对于生产环境的服务升级，显然这是一种最好的方式。

<!--more-->

## 创建Deployment
![Deployment结构](/img/posts/deployment.png)
可以看出一个Deployment拥有多个Replica Set，而一个Replica Set拥有一个或多个Pod。一个Deployment控制多个rs主要是为了支持回滚机制，每当Deployment操作时，Kubernetes会重新生成一个Replica Set并保留，以后有需要的话就可以回滚至之前的状态。
下面创建一个Deployment，它创建了一个Replica Set来启动3个nginx pod，yaml文件如下：
```yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: nginx-deploy
  labels:
    k8s-app: nginx-demo
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.7.9
        ports:
        - containerPort: 80
```
将上面内容保存为: nginx-deployment.yaml，执行命令:
```shell
$ kubectl create -f nginx-deployment.yaml
deployment "nginx-deploy" created
```

然后执行一下命令查看刚刚创建的Deployment:
```shell
$ kubectl get deployments
NAME           DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-deploy   3         0         0            0           1s
```
隔一会再次执行上面命令：
```shell
$ kubectl get deployments
NAME           DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-deploy   3         3         3            3           4m
```
我们可以看到Deployment已经创建了3个Replica Set了，执行下面的命令查看rs和pod:
```shell
$ kubectl get rs
NAME                     DESIRED   CURRENT   READY     AGE
nginx-deploy-431080787   3         3         3         6m
```
```shell
$ kubectl get pod --show-labels
NAME                           READY     STATUS    RESTARTS   AGE       LABELS
nginx-deploy-431080787-53z8q   1/1       Running   0          7m        app=nginx,pod-template-hash=431080787
nginx-deploy-431080787-bhhq0   1/1       Running   0          7m        app=nginx,pod-template-hash=431080787
nginx-deploy-431080787-sr44p   1/1       Running   0          7m        app=nginx,pod-template-hash=431080787
```
上面的Deployment的yaml文件中的`replicas:3`将会保证我们始终有3个POD在运行。


## 滚动升级Deployment

现在我们将刚刚保存的yaml文件中的nginx镜像修改为`nginx:1.13.3`，然后在spec下面添加滚动升级策略：
```yaml
minReadySeconds: 5
strategy:
  # indicate which strategy we want for rolling update
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 1
```

* minReadySeconds:
  * Kubernetes在等待设置的时间后才进行升级
  * 如果没有设置该值，Kubernetes会假设该容器启动起来后就提供服务了
  * 如果没有设置该值，在某些极端情况下可能会造成服务服务正常运行
* maxSurge:
  * 升级过程中最多可以比原先设置多出的POD数量
  * 例如：maxSurage=1，replicas=5,则表示Kubernetes会先启动1一个新的Pod后才删掉一个旧的POD，整个升级过程中最多会有5+1个POD。
* maxUnavaible:
  * 升级过程中最多有多少个POD处于无法提供服务的状态
  * 当`maxSurge`不为0时，该值也不能为0
  * 例如：maxUnavaible=1，则表示Kubernetes整个升级过程中最多会有1个POD处于无法服务的状态。


 然后执行命令：
```shell
$ kubectl apply -f nginx-deployment.yaml
deployment "nginx-deploy" configured
```

然后我们可以使用`rollout`命令：

* 查看状态：
```shell
$ kubectl rollout status deployment/nginx-deploy
Waiting for rollout to finish: 1 out of 3 new replicas have been updated..
deployment "nginx-deploy" successfully rolled out
```

* 暂停升级
```shell
$ kubectl rollout pause deployment <deployment>
```

* 继续升级
```shell
$ kubectl rollout resume deployment <deployment>
```

升级结束后，继续查看rs的状态：
```shell
$ kubectl get rs
NAME                      DESIRED   CURRENT   READY     AGE
nginx-deploy-2078889897   0         0         0         47m
nginx-deploy-3297445372   3         3         3         42m
nginx-deploy-431080787    0         0         0         1h
```
根据AGE我们可以看到离我们最近的当前状态是：3，和我们的yaml文件是一致的，证明升级成功了。用`describe`命令可以查看升级的全部信息：
```shell
Name:     nginx-deploy
Namespace:    default
CreationTimestamp:  Wed, 18 Oct 2017 16:58:52 +0800
Labels:     k8s-app=nginx-demo
Annotations:    deployment.kubernetes.io/revision=3
      kubectl.kubernetes.io/last-applied-configuration={"apiVersion":"apps/v1beta1","kind":"Deployment","metadata":{"annotations":{},"labels":{"k8s-app":"nginx-demo"},"name":"nginx-deploy","namespace":"defa...
Selector:   app=nginx
Replicas:   3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:   RollingUpdate
MinReadySeconds:  0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
Pod Template:
  Labels: app=nginx
  Containers:
   nginx:
    Image:    nginx:1.13.3
    Port:   80/TCP
    Environment:  <none>
    Mounts:   <none>
  Volumes:    <none>
Conditions:
  Type    Status  Reason
  ----    ------  ------
  Progressing   True  NewReplicaSetAvailable
  Available   True  MinimumReplicasAvailable
OldReplicaSets: <none>
NewReplicaSet:  nginx-deploy-3297445372 (3/3 replicas created)
Events:
  FirstSeen LastSeen  Count From      SubObjectPath Type    Reason      Message
  --------- --------  ----- ----      ------------- --------  ------      -------
  50m   50m   1 deployment-controller     Normal    ScalingReplicaSet Scaled up replica set nginx-deploy-2078889897 to 1
  45m   45m   1 deployment-controller     Normal    ScalingReplicaSet Scaled down replica set nginx-deploy-2078889897 to 0
  45m   45m   1 deployment-controller     Normal    ScalingReplicaSet Scaled up replica set nginx-deploy-3297445372 to 1
  39m   39m   1 deployment-controller     Normal    ScalingReplicaSet Scaled down replica set nginx-deploy-431080787 to 2
  39m   39m   1 deployment-controller     Normal    ScalingReplicaSet Scaled up replica set nginx-deploy-3297445372 to 2
  38m   38m   1 deployment-controller     Normal    ScalingReplicaSet Scaled down replica set nginx-deploy-431080787 to 1
  38m   38m   1 deployment-controller     Normal    ScalingReplicaSet Scaled up replica set nginx-deploy-3297445372 to 3
  38m   38m   1 deployment-controller     Normal    ScalingReplicaSet Scaled down replica set nginx-deploy-431080787 to 0
```

## 回滚Deployment
我们已经能够滚动平滑的升级我们的Deployment了，但是如果升级后的POD出了问题该怎么办？我们能够想到的最好最快的方式当然是回退到上一次能够提供正常工作的版本，Deployment就为我们提供了回滚机制。

首先，查看Deployment的升级历史：
```shell
$ kubectl rollout history deployment nginx-deploy
deployments "nginx-deploy"
REVISION  CHANGE-CAUSE
1   <none>
2   <none>
3   kubectl apply --filename=Desktop/nginx-deployment.yaml --record=true
```

从上面的结果可以看出在执行Deployment升级的时候最好带上`record`参数，便于我们查看历史版本信息。同样我们可以使用下面的命令查看单个REVISION的信息：
```shell
$ kubectl rollout history deployment nginx-deploy --revision=3
deployments "nginx-deploy" with revision #3
Pod Template:
  Labels: app=nginx
  pod-template-hash=3297445372
  Annotations:  kubernetes.io/change-cause=kubectl apply --filename=nginx-deployment.yaml --record=true
  Containers:
   nginx:
    Image:  nginx:1.13.3
    Port: 80/TCP
    Environment:  <none>
    Mounts: <none>
  Volumes:  <none>
```

假如现在要直接回退到当前版本的前一个版本：
```shell
$ kubectl rollout undo deployment nginx-deploy
deployment "nginx-deploy" rolled back
```
当然也可以用`revision`回退到指定的版本：
```shell
$ kubectl rollout undo deployment nginx-deploy --to-revision=2
deployment "nginx-deploy" rolled back
```
现在可以用命令查看Deployment现在的状态了。


## 注意清除机制

前面在用`apply`命令滚动升级Deployment后，无意间在`Dashboard`中发现了`Replica Sets`下面有很多Pods为`0/0`的RS，由于本人有轻微的强迫症，眼里是容不下`0/0`这种东西的，然后就给`删除`了，结果后面更新的时候又出现了，以为是yaml脚本有误，结果到现在才清楚这个是用于Deployment回滚用的，**不能随便删除**的(感觉自己就是个棒槌啊~~~)。
![RS不能随便删除](/img/posts/1508322427262.jpg)

> `Kubernetes`默认是会将Deployments的每次改动操作生成一个新的RS，并保存下来的。不过你可以设置参数`.spec.revisonHistoryLimit`来来指定Deployment最多保留多少revision 历史记录。**如果将该项设置为0，Deployment就不允许回退了**。


## 参考文档

* [http://kubernetes.io/docs/user-guide/deployments/](http://kubernetes.io/docs/user-guide/deployments/)
* [http://kubernetes.io/docs/user-guide/kubectl/kubectl_rollout_history/](http://kubernetes.io/docs/user-guide/kubectl/kubectl_rollout_history/)
* [http://kubernetes.io/docs/user-guide/kubectl/kubectl_rolling-update/](http://kubernetes.io/docs/user-guide/kubectl/kubectl_rolling-update/)


扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

