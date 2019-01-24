---
title: Kubernetes 部署策略详解
date: 2019-01-24
tags: ["kubernetes", "deployment"]
keywords: ["kubernetes", "deployment", "灰度", "蓝绿", "AB测试"]
slug: k8s-deployment-strategies
bigimg: [{src: "https://ws4.sinaimg.cn/large/006tNc79gy1fzhjyv30l1j30zk0ft7c0.jpg", desc: "部署策略"}]
gitcomment: true
category: "kubernetes"
---

在`Kubernetes`中有几种不同的方式发布应用，所以为了让应用在升级期间依然平稳提供服务，选择一个正确的发布策略就非常重要了。

选择正确的部署策略是要依赖于我们的业务需求的，下面我们列出了一些可能会使用到的策略：

* 重建(recreate)：停止旧版本部署新版本

* 滚动更新(rolling-update)：一个接一个地以滚动更新方式发布新版本

* 蓝绿(blue/green)：新版本与旧版本一起存在，然后切换流量

* 金丝雀(canary)：将新版本面向一部分用户发布，然后继续全量发布

* A/B测(a/b testing)：以精确的方式（HTTP 头、cookie、权重等）向部分用户发布新版本。`A/B测`实际上是一种基于数据统计做出业务决策的技术。在 Kubernetes 中并不原生支持，需要额外的一些高级组件来完成改设置（比如Istio、Linkerd、Traefik、或者自定义 Nginx/Haproxy 等）。

<!--more-->

你可以在`Kubernetes`集群上来对上面的这些策略进行测试，下面的仓库中有需要使用到的资源清单：<https://github.com/ContainerSolutions/k8s-deployment-strategies>

接下来我们来介绍下每种策略，看看在什么场景下面适合哪种策略。



### 重建(Recreate) - 最好在开发环境

策略定义为`Recreate`的`Deployment`，会终止所有正在运行的实例，然后用较新的版本来重新创建它们。

```yaml
spec:
  replicas: 3
  strategy:
    type: Recreate
```

![Recreate](https://ws2.sinaimg.cn/large/006tNc79gy1fzhkoyj17tj327g0igaed.jpg)

重新创建策略是一个虚拟部署，包括关闭版本A，然后在关闭版本A后部署版本B. 此技术意味着服务的停机时间取决于应用程序的关闭和启动持续时间。

我们这里创建两个相关的资源清单文件，app-v1.yaml：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  type: NodePort
  ports:
  - name: http
    port: 80
    targetPort: http
  selector:
    app: my-app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v1.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

app-v2.yaml 文件内容如下：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 3
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
        version: v2.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v2.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

上面两个资源清单文件中的 Deployment 定义几乎是一直的，唯一不同的是定义的环境变量`VERSION`值不同，接下来按照下面的步骤来验证`Recreate`策略：

1. 版本1提供服务
2. 删除版本1
3. 部署版本2
4. 等待所有副本准备就绪

首先部署第一个应用：

```shell
$ kubectl apply -f app-v1.yaml
service "my-app" created
deployment.apps "my-app" created
```

测试版本1是否部署成功：

```shell
$ kubectl get pods -l app=my-app
NAME                      READY     STATUS    RESTARTS   AGE
my-app-7b4874cd75-m5kct   1/1       Running   0          19m
my-app-7b4874cd75-pc444   1/1       Running   0          19m
my-app-7b4874cd75-tlctl   1/1       Running   0          19m
$ kubectl get svc my-app
NAME      TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
my-app    NodePort   10.108.238.76   <none>        80:32532/TCP   5m
$ curl http://127.0.0.1:32532
Host: my-app-7b4874cd75-pc444, Version: v1.0.0
```

可以看到版本1的应用正常运行了。为了查看部署的运行情况，打开一个新终端并运行以下命令：

```shell
$ watch kubectl get po -l app=my-app
```

然后部署版本2的应用：

```shell
$ kubectl apply -f app-v2.yaml
```

这个时候可以观察上面新开的终端中的 Pod 列表的变化，可以看到之前的3个 Pod 都会先处于`Terminating`状态，并且3个 Pod 都被删除后才开始创建新的 Pod。

然后测试第二个版本应用的部署进度：

```shell
$ while sleep 0.1; do curl http://127.0.0.1:32532; done
curl: (7) Failed connect to 127.0.0.1:32532; Connection refused
curl: (7) Failed connect to 127.0.0.1:32532; Connection refused
......
Host: my-app-f885c8d45-sp44p, Version: v2.0.0
Host: my-app-f885c8d45-t8g7g, Version: v2.0.0
Host: my-app-f885c8d45-sp44p, Version: v2.0.0
......
```

可以看到最开始的阶段服务都是处于不可访问的状态，然后到第二个版本的应用部署成功后才正常访问，可以看到现在访问的数据是版本2了。

最后，可以执行下面的命令来清空上面的资源对象：

```shell
$ kubectl delete all -l app=my-app
```

结论:

* 应用状态全部更新

- 停机时间取决于应用程序的关闭和启动消耗的时间



### 滚动更新(rolling-update)

滚动更新通过逐个替换实例来逐步部署新版本的应用，直到所有实例都被替换完成为止。它通常遵循以下过程：在负载均衡器后面使用版本 A 的实例池，然后部署版本 B 的一个实例，当服务准备好接收流量时(Readiness Probe 正常)，将该实例添加到实例池中，然后从实例池中删除一个版本 A 的实例并关闭，如下图所示：

![ramped](https://ws3.sinaimg.cn/large/006tNc79gy1fzhmat6gvzj30xv0kzab4.jpg)

下图是滚动更新过程应用接收流量的示意图：

![rolling-update requests](https://ws4.sinaimg.cn/large/006tNc79gy1fzhmld82wwj327c0ig78s.jpg)

下面是 Kubernetes 中通过 Deployment 来进行滚动更新的关键参数：

```yaml
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2        # 一次可以添加多少个Pod
      maxUnavailable: 1  # 滚动更新期间最大多少个Pod不可用
```

现在仍然使用上面的 app-v1.yaml 这个资源清单文件，新建一个定义滚动更新的资源清单文件 app-v2-rolling-update.yaml，文件内容如下:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  replicas: 10
  # maxUnavailable设置为0可以完全确保在滚动更新期间服务不受影响，还可以使用百分比的值来进行设置。
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
        version: v2.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v2.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          # 初始延迟设置高点可以更好地观察滚动更新过程
          initialDelaySeconds: 15
          periodSeconds: 5
```

上面的资源清单中我们在环境变量中定义了版本2，然后通过设置`strategy.type=RollingUpdate`来定义该 Deployment 使用滚动更新的策略来更新应用，接下来我们按下面的步骤来验证滚动更新策略：

1. 版本1提供服务
2. 部署版本2
3. 等待直到所有副本都被版本2替换完成

同样，首先部署版本1应用：

```shell
$ kubectl apply -f app-v1.yaml
service "my-app" created
deployment.apps "my-app" created
```

测试版本1是否部署成功：

```shell
$ kubectl get pods -l app=my-app
NAME                      READY     STATUS    RESTARTS   AGE
my-app-7b4874cd75-h8c4d   1/1       Running   0          47s
my-app-7b4874cd75-p4l8f   1/1       Running   0          47s
my-app-7b4874cd75-qnt7p   1/1       Running   0          47s
$ kubectl get svc my-app
NAME      TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
my-app    NodePort   10.109.99.184   <none>        80:30486/TCP   1m
$ curl http://127.0.0.1:30486
Host: my-app-7b4874cd75-qnt7p, Version: v1.0.0
```

同样，在一个新终端中执行下面命令观察 Pod 变化：

```shell
$ watch kubectl get pod -l app=my-app
```

然后部署滚动更新版本2应用：

```shell
$ kubectl apply -f app-v2-rolling-update.yaml
deployment.apps "my-app" configured
```

这个时候在上面的 watch 终端中可以看到多了很多 Pod，还在创建当中，并没有一开始就删除之前的 Pod，同样，这个时候执行下面命令，测试应用状态：

```shell
$ while sleep 0.1; do curl http://127.0.0.1:30486; done
Host: my-app-7b4874cd75-vrlj7, Version: v1.0.0
......
Host: my-app-7b4874cd75-vrlj7, Version: v1.0.0
Host: my-app-6b5479d97f-2fk24, Version: v2.0.0
Host: my-app-7b4874cd75-p4l8f, Version: v1.0.0
......
Host: my-app-6b5479d97f-s5ctz, Version: v2.0.0
Host: my-app-7b4874cd75-5ldqx, Version: v1.0.0
......
Host: my-app-6b5479d97f-5z6ww, Version: v2.0.0
```

我们可以看到上面的应用并没有出现不可用的情况，最开始访问到的都是版本1的应用，然后偶尔会出现版本2的应用，直到最后全都变成了版本2的应用，而这个时候看上面 watch 终端中 Pod 已经全部变成10个版本2的应用了，我们可以看到这就是一个逐步替换的过程。

如果在滚动更新过程中发现新版本应用有问题，我们可以通过下面的命令来进行一键回滚：

```shell
$ kubectl rollout undo deploy my-app
deployment.apps "my-app"
```

如果你想保持两个版本的应用都存在，那么我们也可以执行 pause 命令来暂停更新：

```shell
$ kubectl rollout pause deploy my-app
deployment.apps "my-app" paused
```

这个时候我们再去循环访问我们的应用就可以看到偶尔会出现版本1的应用信息了。

如果新版本应用程序没问题了，也可以继续恢复更新：

```shell
$ kubectl rollout resume deploy my-app
deployment.apps "my-app" resumed
```

最后，可以执行下面的命令来清空上面的资源对象：

```shell
$ kubectl delete all -l app=my-app
```

结论：

* 版本在实例之间缓慢替换
* rollout/rollback 可能需要一定时间
* 无法控制流量



### 蓝/绿(blue/green) - 最好用来验证 API 版本问题

蓝/绿发布是版本2 与版本1 一起发布，然后流量切换到版本2，也称为红/黑部署。蓝/绿发布与滚动更新不同，版本2(`绿`) 与版本1(`蓝`)一起部署，在测试新版本满足要求后，然后更新更新 Kubernetes 中扮演负载均衡器角色的 Service 对象，通过替换 label selector 中的版本标签来将流量发送到新版本，如下图所示：

![blug/green](https://ws2.sinaimg.cn/large/006tNc79gy1fzhnqugkj4j30xv0kzq3q.jpg)

下面是蓝绿发布策略下应用方法的示例图：

![blue/green request](https://ws3.sinaimg.cn/large/006tNc79gy1fzhnsl61k8j327c0igdkk.jpg)

在 Kubernetes 中，我们可以用两种方法来实现蓝绿发布，通过单个 Service 对象或者 Ingress 控制器来实现蓝绿发布，实际操作都是类似的，都是通过 label 标签去控制。

实现蓝绿发布的关键点就在于 Service 对象中 label selector 标签的匹配方法，比如我们重新定义版本1 的资源清单文件 app-v1-single-svc.yaml，文件内容如下：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  type: NodePort
  ports:
  - name: http
    port: 80
    targetPort: http
  # 注意这里我们匹配 app 和 version 标签，当要切换流量的时候，我们更新 version 标签的值，比如：v2.0.0
  selector:
    app: my-app
    version: v1.0.0
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-v1
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
      version: v1.0.0
  template:
    metadata:
      labels:
        app: my-app
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v1.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

上面定义的资源对象中，最重要的就是 Service 中 label selector 的定义：

```yaml
selector:
  app: my-app
  version: v1.0.0
```

版本2 的应用定义和以前一样，新建文件 app-v2-single-svc.yaml，文件内容如下：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-v2
  labels:
    app: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
      version: v2.0.0
  template:
    metadata:
      labels:
        app: my-app
        version: v2.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v2.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

然后按照下面的步骤来验证使用单个 Service 对象实现蓝/绿部署的策略：

1. 版本1 应用提供服务
2. 部署版本2 应用
3. 等到版本2 应用全部部署完成
4. 切换入口流量从版本1 到版本2
5. 关闭版本1 应用

首先，部署版本1 应用：

```shell
$ kubectl apply -f app-v1-single-svc.yaml
service "my-app" created
deployment.apps "my-app-v1" created
```

测试版本1 应用是否部署成功：

```shell
$ kubectl get pods -l app=my-app
NAME                         READY     STATUS    RESTARTS   AGE
my-app-v1-7b4874cd75-7xh6s   1/1       Running   0          41s
my-app-v1-7b4874cd75-dmq8f   1/1       Running   0          41s
my-app-v1-7b4874cd75-t64z7   1/1       Running   0          41s
$ kubectl get svc -l app=my-app
NAME      TYPE       CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
my-app    NodePort   10.106.184.144   <none>        80:31539/TCP   50s
$ curl http://127.0.0.1:31539
Host: my-app-v1-7b4874cd75-7xh6s, Version: v1.0.0
```

同样，新开一个终端，执行如下命令观察 Pod 变化：

```shell
$ watch kubectl get pod -l app=my-app
```

然后部署版本2 应用：

```shell
$ kubectl apply -f app-v2-single-svc.yaml
deployment.apps "my-app-v2" created
```

然后在上面 watch 终端中可以看到会多3个`my-app-v2`开头的 Pod，待这些 Pod 部署成功后，我们再去访问当前的应用：

```shell
$ while sleep 0.1; do curl http://127.0.0.1:31539; done
Host: my-app-v1-7b4874cd75-dmq8f, Version: v1.0.0
Host: my-app-v1-7b4874cd75-dmq8f, Version: v1.0.0
......
```

我们会发现访问到的都是版本1 的应用，和我们刚刚部署的版本2 没有任何关系，这是因为我们 Service 对象中通过 label selector 匹配的是`version=v1.0.0`这个标签，我们可以通过修改 Service 对象的匹配标签，将流量路由到标签`version=v2.0.0`的 Pod 去：

```shell
$ kubectl patch service my-app -p '{"spec":{"selector":{"version":"v2.0.0"}}}'
service "my-app" patched
```

然后再去访问应用，可以发现现在都是版本2 的信息了：

```shell
$ while sleep 0.1; do curl http://127.0.0.1:31539; done
Host: my-app-v2-f885c8d45-r5m6z, Version: v2.0.0
Host: my-app-v2-f885c8d45-r5m6z, Version: v2.0.0
......
```

如果你需要回滚到版本1，同样只需要更改 Service 的匹配标签即可：

```shell
$ kubectl patch service my-app -p '{"spec":{"selector":{"version":"v1.0.0"}}}'
```

如果新版本已经完全符合我们的需求了，就可以删除版本1 的应用了：

```shell
$ kubectl delete deploy my-app-v1
```

最后，同样，执行如下命令清理上述资源对象：

```shell
$ kubectl delete all -l app=my-app
```

结论：

* 实时部署/回滚

* 避免版本问题，因为一次更改是整个应用的改变
* 需要两倍的资源
* 在发布到生产之前，应该对整个应用进行适当的测试



### 金丝雀(Canary) - 让部分用户参与测试

金丝雀部署是让部分用户访问到新版本应用，在 Kubernetes 中，可以使用两个具有相同 Pod 标签的 Deployment 来实现金丝雀部署。新版本的副本和旧版本的一起发布。在一段时间后如果没有检测到错误，则可以扩展新版本的副本数量并删除旧版本的应用。

如果需要按照具体的百分比来进行金丝雀发布，需要尽可能的启动多的 Pod 副本，这样计算流量百分比的时候才方便，比如，如果你想将 1% 的流量发送到版本 B，那么我们就需要有一个运行版本 B 的 Pod 和 99 个运行版本 A 的 Pod，当然如果你对具体的控制策略不在意的话也就无所谓了，如果你需要更精确的控制策略，建议使用服务网格（如 Istio），它们可以更好地控制流量。

![Canary](https://ws3.sinaimg.cn/large/006tNc79gy1fzhq9w17kyj30xv0apjsh.jpg)

在下面的例子中，我们使用 Kubernetes 原生特性来实现一个穷人版的金丝雀发布，如果你想要对流量进行更加细粒度的控制，请使用豪华版本的 Istio。下面是金丝雀发布的应用请求示意图：

![canary requests](https://ws3.sinaimg.cn/large/006tNc79gy1fzhqbmi66dj327i0ikq7h.jpg)

接下来我们按照下面的步骤来验证金丝雀策略：

1. 10个副本的版本1 应用提供服务
2. 版本2 应用部署1个副本（意味着小于10%的流量）
3. 等待足够的时间来确认版本2 应用足够稳定没有任何错误信息
4. 将版本2 应用扩容到10个副本
5. 等待所有实例完成
6. 关闭版本1 应用

首先，创建版本1 的应用资源清单，app-v1-canary.yaml，内容如下：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  labels:
    app: my-app
spec:
  type: NodePort
  ports:
  - name: http
    port: 80
    targetPort: http
  selector:
    app: my-app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-v1
  labels:
    app: my-app
spec:
  replicas: 10
  selector:
    matchLabels:
      app: my-app
      version: v1.0.0
  template:
    metadata:
      labels:
        app: my-app
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v1.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

其中核心的部分也是 Service 对象中的 label selector 标签，不在具有版本相关的标签了，然后定义版本2 的资源清单文件，app-v2-canary.yaml，文件内容如下：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-v2
  labels:
    app: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
      version: v2.0.0
  template:
    metadata:
      labels:
        app: my-app
        version: v2.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9101"
    spec:
      containers:
      - name: my-app
        image: containersol/k8s-deployment-strategies
        ports:
        - name: http
          containerPort: 8080
        - name: probe
          containerPort: 8086
        env:
        - name: VERSION
          value: v2.0.0
        livenessProbe:
          httpGet:
            path: /live
            port: probe
          initialDelaySeconds: 5
          periodSeconds: 5
        readinessProbe:
          httpGet:
            path: /ready
            port: probe
          periodSeconds: 5
```

版本1 和版本2 的 Pod 都具有一个共同的标签`app=my-app`，所以对应的 Service 会匹配两个版本的 Pod。

首先，部署版本1 应用：

```shell
$ kubectl apply -f app-v1-canary.yaml
service "my-app" created
deployment.apps "my-app-v1" created
```

然后测试版本1 应用是否正确部署了：

```shell
$ kubectl get svc -l app=my-app
NAME          TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)        AGE
my-app        NodePort    10.105.133.213   <none>        80:30760/TCP   47s
$ curl http://127.0.0.1:30760
Host: my-app-v1-7b4874cd75-tsh2s, Version: v1.0.0
```

同样，新开一个终端，查看 Pod 的变化：

```shell
$ watch kubectl get po
```

然后部署版本2 应用：

```shell
$ kubectl apply -f app-v2-canary.yaml
deployment.apps "my-app-v2" created
```

然后在 watch 终端页面可以看到多了一个 Pod，现在一共 11 个 Pod，其中只有1 个 Pod 运行新版本应用，然后同样可以循环访问该应用，查看是否会有版本2 的应用信息：

```shell
$ while sleep 0.1; do curl http://127.0.0.1:30760; done
Host: my-app-v1-7b4874cd75-bhxbp, Version: v1.0.0
Host: my-app-v1-7b4874cd75-wmcqc, Version: v1.0.0
Host: my-app-v1-7b4874cd75-tsh2s, Version: v1.0.0
Host: my-app-v1-7b4874cd75-ml58j, Version: v1.0.0
Host: my-app-v1-7b4874cd75-spsdv, Version: v1.0.0
Host: my-app-v2-f885c8d45-mc2fx, Version: v2.0.0
......
```

正常情况下可以看到大部分都是返回的版本1 的应用信息，偶尔会出现版本2 的应用信息，这就证明我们的金丝雀发布成功了，待确认了版本2 的这个应用没有任何问题后，可以将版本2 应用扩容到10 个副本：

```shell
$ kubectl scale --replicas=10 deploy my-app-v2
deployment.extensions "my-app-v2" scaled
```

其实这个时候访问应用的话新版本和旧版本的流量分配是1:1了，确认了版本2 正常后，就可以删除版本1 的应用了：

```shell
$ kubectl delete deploy my-app-v1
deployment.extensions "my-app-v1" deleted
```

最终留下的是 10 个新版本的 Pod 了，到这里我们的整个金丝雀发布就完成了。

同样，最后，执行下面的命令删除上面的资源对象：

```shell
$ kubectl delete all -l app=my-app
```

结论：

* 部分用户获取新版本
* 方便错误和性能监控
* 快速回滚
* 发布较慢
* 流量精准控制很浪费（99％A / 1％B = 99 Pod A，1 Pod B）

> 如果你对新功能的发布没有信心，建议使用金丝雀发布的策略。



### A/B测试(A/B testing) - 最适合部分用户的功能测试

A/B 测试实际上是一种基于统计信息而非部署策略来制定业务决策的技术，与业务结合非常紧密。但是它们也是相关的，也可以使用金丝雀发布来实现。

除了基于权重在版本之间进行流量控制之外，A/B 测试还可以基于一些其他参数（比如 Cookie、User Agent、地区等等）来精确定位给定的用户群，该技术广泛用于测试一些功能特性的效果，然后按照效果来进行确定。

> 我们经常可以在`今日头条`的客户端中就会发现有大量的 A/B 测试，同一个地区的用户看到的客户端有很大不同。

要使用这些细粒度的控制，仍然还是建议使用 Istio，可以根据权重或 HTTP 头等来动态请求路由控制流量转发。

![ab test](https://ws4.sinaimg.cn/large/006tNc79gy1fzhrimnx3nj30ra0b13zb.jpg)

下面是使用 Istio 进行规则设置的示例，因为 Istio 还不太稳定，以下示例规则将来可能会更改：

```yaml
route:
- tags:
  version: v1.0.0
  weight: 90
- tags:
  version: v2.0.0
  weight: 10
```

关于在 Istio 中具体如何做 A/B 测试，我们这里就不再详细介绍了，我们在`istio-book`文档中有相关的介绍。

![ab test request](https://ws1.sinaimg.cn/large/006tNc79gy1fzhrlxh573j327c0iigok.jpg)

结论：

* 几个版本并行运行
* 完全控制流量分配
* 特定的一个访问错误难以排查，需要分布式跟踪
* Kubernetes 没有直接的支持，需要其他额外的工具



### 总结

发布应用有许多种方法，当发布到开发/测试环境的时候，`重建`或者`滚动更新`通常是一个不错的选择。在生产环境，`滚动更新`或者`蓝绿发布`比较合适，但是新版本的提前测试是非常有必要的。如果你对新版本的应用不是很有信心的话，那应该使用`金丝雀`发布，将用户的影响降到最低。最后，如果你的公司需要在特定的用户群体中进行新功能的测试，例如，移动端用户请求路由到版本 A，桌面端用户请求路由到版本 B，那么你就看使用`A/B 测试`，通过使用 Kubernetes 服务网关的配置，可以根据某些请求参数来确定用户应路由的服务。

如果您有任何问题或反馈，请随时在下面留言。

> 本文主要参考链接：[https://container-solutions.com/kubernetes-deployment-strategies/](https://container-solutions.com/kubernetes-deployment-strategies/)

### 推荐
最后打个广告，给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
