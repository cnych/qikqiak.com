---
title: 基于 kubernetes 的动态 jenkins slave
subtitle: 基于 Jenkins 的 CI/CD(一)
date: 2018-07-28
tags: ["kubernetes", "devops", "jenkins", "slave", "CI", "CD", "gitlab"]
keywords:
  ["kubernetes", "devops", "jenkins", "slave", "CI", "CD", "gitlab", "动态"]
slug: kubernetes-jenkins1
gitcomment: true
bigimg:
  [
    {
      src: "/img/posts/photo-1532154984646-37dc46508066.jpeg",
      desc: "Rainbow after the Hailstorm",
    },
  ]
category: "kubernetes"
---

前面的课程中我们学习了持久化数据存储在`Kubernetes`中的使用方法，其实接下来按照我们的课程进度来说应该是讲解服务发现这一部分的内容的，但是最近有很多同学要求我先讲解下 CI/CD 这块的内容，所以我们先把这块内容提前来讲解了。提到基于`Kubernete`的`CI/CD`，可以使用的工具有很多，比如`Jenkins`、`Gitlab CI`已经新兴的`drone`之类的，我们这里会使用大家最为熟悉的`Jenkins`来做`CI/CD`的工具。

<!--more-->

## 安装

听我们课程的大部分同学应该都或多或少的听说过`Jenkins`，我们这里就不再去详细讲述什么是 Jenkins 了，直接进入正题，后面我们会单独的关于 Jenkins 的学习课程，想更加深入学习的同学也可以关注下。既然要基于`Kubernetes`来做`CI/CD`，当然我们这里需要将 Jenkins 安装到 Kubernetes 集群当中，新建一个 Deployment：(jenkins2.yaml)

```yaml
---
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: jenkins2
  namespace: kube-ops
spec:
  template:
    metadata:
      labels:
        app: jenkins2
    spec:
      terminationGracePeriodSeconds: 10
      serviceAccountName: jenkins2
      containers:
        - name: jenkins
          image: jenkins/jenkins:lts
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: web
              protocol: TCP
            - containerPort: 50000
              name: agent
              protocol: TCP
          resources:
            limits:
              cpu: 1000m
              memory: 1Gi
            requests:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /login
              port: 8080
            initialDelaySeconds: 60
            timeoutSeconds: 5
            failureThreshold: 12
          readinessProbe:
            httpGet:
              path: /login
              port: 8080
            initialDelaySeconds: 60
            timeoutSeconds: 5
            failureThreshold: 12
          volumeMounts:
            - name: jenkinshome
              subPath: jenkins2
              mountPath: /var/jenkins_home
      securityContext:
        fsGroup: 1000
      volumes:
        - name: jenkinshome
          persistentVolumeClaim:
            claimName: opspvc

---
apiVersion: v1
kind: Service
metadata:
  name: jenkins2
  namespace: kube-ops
  labels:
    app: jenkins2
spec:
  selector:
    app: jenkins2
  type: NodePort
  ports:
    - name: web
      port: 8080
      targetPort: web
      nodePort: 30002
    - name: agent
      port: 50000
      targetPort: agent
```

为了方便演示，我们把本节课所有的对象资源都放置在一个名为 kube-ops 的 namespace 下面，所以我们需要添加创建一个 namespace：

```shell
$ kubectl create namespace kube-ops
```

我们这里使用一个名为 jenkins/jenkins:lts 的镜像，这是 jenkins 官方的 Docker 镜像，然后也有一些环境变量，当然我们也可以根据自己的需求来定制一个镜像，比如我们可以将一些插件打包在自定义的镜像当中，可以参考文档：[https://github.com/jenkinsci/docker](https://github.com/jenkinsci/docker)，我们这里使用默认的官方镜像就行，另外一个还需要注意的是我们将容器的 /var/jenkins_home 目录挂载到了一个名为 opspvc 的 PVC 对象上面，所以我们同样还得提前创建一个对应的 PVC 对象，当然我们也可以使用我们前面的 StorageClass 对象来自动创建：(pvc.yaml)

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: opspv
spec:
  capacity:
    storage: 20Gi
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Delete
  nfs:
    server: 10.151.30.57
    path: /data/k8s

---
kind: PersistentVolumeClaim
apiVersion: v1
metadata:
  name: opspvc
  namespace: kube-ops
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 20Gi
```

创建需要用到的 PVC 对象：

```shell
$ kubectl create -f pvc.yaml
```

另外我们这里还需要使用到一个拥有相关权限的 serviceAccount：jenkins2，我们这里只是给 jenkins 赋予了一些必要的权限，当然如果你对 serviceAccount 的权限不是很熟悉的话，我们给这个 sa 绑定一个 cluster-admin 的集群角色权限也是可以的，当然这样具有一定的安全风险：（rbac.yaml）

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jenkins2
  namespace: kube-ops

---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: jenkins2
rules:
  - apiGroups: ["extensions", "apps"]
    resources: ["deployments"]
    verbs: ["create", "delete", "get", "list", "watch", "patch", "update"]
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["create", "delete", "get", "list", "watch", "patch", "update"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["create", "delete", "get", "list", "patch", "update", "watch"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create", "delete", "get", "list", "patch", "update", "watch"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: jenkins2
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: jenkins2
subjects:
  - kind: ServiceAccount
    name: jenkins2
    namespace: kube-ops
```

创建 rbac 相关的资源对象：

```shell
$ kubectl create -f rbac.yaml
serviceaccount "jenkins2" created
role.rbac.authorization.k8s.io "jenkins2" created
rolebinding.rbac.authorization.k8s.io "jenkins2" created
```

最后为了方便我们测试，我们这里通过 NodePort 的形式来暴露 Jenkins 的 web 服务，固定为 30002 端口，另外还需要暴露一个 agent 的端口，这个端口主要是用于 Jenkins 的 master 和 slave 之间通信使用的。

一切准备的资源准备好过后，我们直接创建 Jenkins 服务：

```yaml
$ kubectl create -f jenkins2.yaml
deployment.extensions "jenkins2" created
service "jenkins2" created
```

创建完成后，要去拉取镜像可能需要等待一会儿，然后我们查看下 Pod 的状态：

```shell
$ kubectl get pods -n kube-ops
NAME                        READY     STATUS    RESTARTS   AGE
jenkins2-7f5494cd44-pqpzs   0/1       Running   0          2m
```

可以看到该 Pod 处于 Running 状态，但是 READY 值确为 0，然后我们用 describe 命令去查看下该 Pod 的详细信息：

```shell
$ kubectl describe pod jenkins2-7f5494cd44-pqpzs -n kube-ops
...
Normal   Created                3m                kubelet, node01    Created container
  Normal   Started                3m                kubelet, node01    Started container
  Warning  Unhealthy              1m (x10 over 2m)  kubelet, node01    Liveness probe failed: Get http://10.244.1.165:8080/login: dial tcp 10.244.1.165:8080: getsockopt: connection refused
  Warning  Unhealthy              1m (x10 over 2m)  kubelet, node01    Readiness probe failed: Get http://10.244.1.165:8080/login: dial tcp 10.244.1.165:8080: getsockopt: connection refused
```

可以看到上面的 Warning 信息，健康检查没有通过，具体原因是什么引起的呢？可以通过查看日志进一步了解：

```shell
$ kubectl logs -f jenkins2-7f5494cd44-pqpzs -n kube-ops
touch: cannot touch '/var/jenkins_home/copy_reference_file.log': Permission denied
Can not write to /var/jenkins_home/copy_reference_file.log. Wrong volume permissions?
```

很明显可以看到上面的错误信息，意思就是我们没有权限在 jenkins 的 home 目录下面创建文件，这是因为默认的镜像使用的是 jenkins 这个用户，而我们通过 PVC 挂载到 nfs 服务器的共享数据目录下面却是 root 用户的，所以没有权限访问该目录，要解决该问题，也很简单，我只需要在 nfs 共享数据目录下面把我们的目录权限重新分配下即可：

```shell
$ chown -R 1000 /data/k8s/jenkins2
```

> 当然还有另外一种方法是我们自定义一个镜像，在镜像中指定使用 root 用户也可以

然后我们再重新创建：

```shell
$ kubectl delete -f jenkins.yaml
deployment.extensions "jenkins2" deleted
service "jenkins2" deleted
$ kubectl create -f jenkins.yaml
deployment.extensions "jenkins2" created
service "jenkins2" created
```

现在我们再去查看新生成的 Pod 已经没有错误信息了：

```shell
$ kubectl get pods -n kube-ops
NAME                        READY     STATUS        RESTARTS   AGE
jenkins2-7f5494cd44-smn2r   1/1       Running       0          25s
```

等到服务启动成功后，我们就可以根据任意节点的 IP:30002 端口就可以访问 jenkins 服务了，可以根据提示信息进行安装配置即可：
![setup jenkins](/img/posts/setup-jenkins-01-unlock.jpg)
初始化的密码我们可以在 jenkins 的容器的日志中进行查看，也可以直接在 nfs 的共享数据目录中查看：

```shell
$ cat /data/k8s/jenkins2/secrets/initAdminPassword
```

然后选择安装推荐的插件即可。
![setup plugin](/img/posts/setup-jenkins-02-plugin.png)

安装完成后添加管理员帐号即可进入到 jenkins 主界面：
![jenkins home](/img/posts/setup-jenkins-home.png)

## 优点

Jenkins 安装完成了，接下来我们不用急着就去使用，我们要了解下在 Kubernetes 环境下面使用 Jenkins 有什么好处。

我们知道持续构建与发布是我们日常工作中必不可少的一个步骤，目前大多公司都采用 Jenkins 集群来搭建符合需求的 CI/CD 流程，然而传统的 Jenkins Slave 一主多从方式会存在一些痛点，比如：

- 主 Master 发生单点故障时，整个流程都不可用了
- 每个 Slave 的配置环境不一样，来完成不同语言的编译打包等操作，但是这些差异化的配置导致管理起来非常不方便，维护起来也是比较费劲
- 资源分配不均衡，有的 Slave 要运行的 job 出现排队等待，而有的 Slave 处于空闲状态
- 资源有浪费，每台 Slave 可能是物理机或者虚拟机，当 Slave 处于空闲状态时，也不会完全释放掉资源。

正因为上面的这些种种痛点，我们渴望一种更高效更可靠的方式来完成这个 CI/CD 流程，而 Docker 虚拟化容器技术能很好的解决这个痛点，又特别是在 Kubernetes 集群环境下面能够更好来解决上面的问题，下图是基于 Kubernetes 搭建 Jenkins 集群的简单示意图：
![k8s-jenkins](/img/posts/k8s-jenkins-slave.png)

从图上可以看到 Jenkins Master 和 Jenkins Slave 以 Pod 形式运行在 Kubernetes 集群的 Node 上，Master 运行在其中一个节点，并且将其配置数据存储到一个 Volume 上去，Slave 运行在各个节点上，并且它不是一直处于运行状态，它会按照需求动态的创建并自动删除。

这种方式的工作流程大致为：当 Jenkins Master 接受到 Build 请求时，会根据配置的 Label 动态创建一个运行在 Pod 中的 Jenkins Slave 并注册到 Master 上，当运行完 Job 后，这个 Slave 会被注销并且这个 Pod 也会自动删除，恢复到最初状态。

那么我们使用这种方式带来了哪些好处呢？

- **服务高可用**，当 Jenkins Master 出现故障时，Kubernetes 会自动创建一个新的 Jenkins Master 容器，并且将 Volume 分配给新创建的容器，保证数据不丢失，从而达到集群服务高可用。
- **动态伸缩**，合理使用资源，每次运行 Job 时，会自动创建一个 Jenkins Slave，Job 完成后，Slave 自动注销并删除容器，资源自动释放，而且 Kubernetes 会根据每个资源的使用情况，动态分配 Slave 到空闲的节点上创建，降低出现因某节点资源利用率高，还排队等待在该节点的情况。
- **扩展性好**，当 Kubernetes 集群的资源严重不足而导致 Job 排队等待时，可以很容易的添加一个 Kubernetes Node 到集群中，从而实现扩展。

是不是以前我们面临的种种问题在 Kubernetes 集群环境下面是不是都没有了啊？看上去非常完美。

## 配置

接下来我们就需要来配置 Jenkins，让他能够动态的生成 Slave 的 Pod。

**第 1 步.** 我们需要安装**kubernetes plugin (新版本就叫 Kubernetes)**， 点击 Manage Jenkins -> Manage Plugins -> Available -> Kubernetes plugin 勾选安装即可。
![kubernetes plugin](/img/posts/setup-jenkins-k8s-plugin.png)

**第 2 步.** 安装完毕后，点击 Manage Jenkins —> Configure System —> (拖到最下方)Add a new cloud —> 选择 Kubernetes，然后填写 Kubernetes 和 Jenkins 配置信息。
![kubernetes plugin config1](/img/posts/jenkins-k8s-config1.jpg)

注意 namespace，我们这里填 kube-ops，然后  点击**Test Connection**，如果出现 Connection test successful 的提示信息证明  Jenkins 已经可以和 Kubernetes 系统正常通信了，然后下方的 Jenkins URL 地址：**http://jenkins2.kube-ops.svc.cluster.local:8080**，这里的格式为：服务名.namespace.svc.cluster.local:8080，**根据上面创建的 jenkins  的服务名填写，我这里是之前创建的名为 jenkins，如果是用上面我们创建的就应该是 jenkins2**

> 另外需要注意，如果这里  Test Connection 失败的话， 很有可能是权限问题，这里就需要把我们创建的 jenkins 的 serviceAccount 对应的 secret 添加到这里的 Credentials 里面。

**第 3 步.** 配置 Pod Template，其实就是配置 Jenkins Slave 运行的 Pod 模板，命名空间我们同样是  用  kube-ops，Labels 这里也非常重要，对于后面执行 Job 的时候  需要用到该值，然后我们这里使用的是 cnych/jenkins:jnlp 这个镜像，这个镜像是在官方的 jnlp 镜像基础上定制的，加入了 kubectl 等一些实用的工具。
![kubernetes plugin config2](/img/posts/jenkins-k8s-config2.png)

> 注意：由于新版本的 Kubernetes 插件变化较多，如果你使用的 Jenkins 版本在 2.176.x 版本以上，注意将上面的镜像替换成`cnych/jenkins:jnlp6`，否则使用会报错，配置如下图所示：
> ![kubernetes slave image config](https://picdn.youdianzhishi.com/images/jenkins-slave-new.png)

另外需要注意我们这里需要在下面挂载两个主机目录，一个是`/var/run/docker.sock`，该文件是用于 Pod 中的容器能够共享宿主机的 Docker，这就是  大家说的 docker in docker 的方式，Docker 二进制文件我们已经打包到上面的镜像中了，另外一个目录下`/root/.kube`目录，我们将这个目录挂载到容器的 /root/.kube 目录下面这是为了让我们能够在 Pod 的容器中能够使用 kubectl 工具来访问我们的 Kubernetes 集群，方便我们后面在 Slave Pod 部署 Kubernetes 应用。

![kubernetes plugin config3](https://picdn.youdianzhishi.com/images/jenkins-slave-volume.png)

另外还有几个参数需要注意，如下图中的**Time in minutes to retain slave when idle**，这个参数表示的意思是当处于空闲状态的时候保留 Slave Pod 多长时间，这个参数最好我们保存默认就行了，如果你设置过大的话，Job 任务执行完成后，对应的 Slave Pod 就不会立即被销毁删除。
![kubernetes plugin config4](/img/posts/jenkins-k8s-config4.png)

另外一些同学在配置了后运行 Slave Pod 的时候出现了权限问题，如果出现了权限不足的问题，在 Slave Pod 配置的地方点击下面的高级，添加上对应的 ServiceAccount 即可：
![kubernetes plugin config5](/img/posts/jenkins-k8s-config5.png)

还有一些同学在配置完成后发现启动 Jenkins Slave Pod 的时候，出现 Slave Pod 连接不上，然后尝试 100 次连接之后销毁 Pod，然后会再创建一个 Slave Pod 继续尝试连接，无限循环，类似于下面的信息：
![](https://picdn.youdianzhishi.com/images/slave-pod-reconnect-100-times.png)

如果出现这种情况的话就需要将 Slave Pod 中的运行命令和参数两个值给清空掉
![](https://picdn.youdianzhishi.com/images/clean-slave-pod-cmd-args.png)

到这里我们的 Kubernetes Plugin  插件就算配置完成了。

## 测试

Kubernetes 插件的配置工作完成了，接下来我们就来添加一个 Job 任务，看是否能够在 Slave Pod 中执行， 任务执行完成后看 Pod 是否会被销毁。

在 Jenkins 首页点击**create new jobs**，创建一个测试的任务，输入任务名称，然后我们选择 Freestyle project 类型的任务：
![jenkins demo](/img/posts/jenkins-demo1.png)

注意在下面的 Label Expression 这里要填入**haimaxy-jnlp**，就是前面我们配置的 Slave Pod 中的 Label，这两个地方必须保持一致
![config](/img/posts/jenkins-demo1-config.jpeg)

然后往下拉，在  Build 区域选择**Execute shell**
![Build](/img/posts/jenkins-demo1-config2.jpeg)

然后输入我们测试命令

```shell
echo "测试 Kubernetes 动态生成 jenkins slave"
echo "==============docker in docker==========="
docker info

echo "=============kubectl============="
kubectl get pods
```

最后点击保存
![command](/img/posts/jenkins-demo1-config3.jpeg)

> 注意：如果在执行`kubectl apply`这一步的时候出现类似于`Failed to download OpenAPI (unknown), falling back to swagger error: error validating: "k8s.yaml": error validating data: unknown; if you choose to ignore these errors, trun validation off with --validate=false`这样的错误，这是因为我使用的镜像`cnych/jenkins:jnlp`里面内置的`kubectl`工具是 v1.10.0 版本的，如果你的 kubernetes 集群版本较高，就会出现这种情况，要解决这个问题也很简单，可以基于我这个镜像重新制作一个镜像，把 kubectl 工具用正确的版本覆盖掉即可，[点击查看我原始的 Dockerfile 文件](https://github.com/cnych/kubernetes-learning/blob/master/jenkins/jenkins-slave.Dockerfile)。

 现在我们直接在页面点击做成的 Build now 触发构建即可，然后观察 Kubernetes 集群中 Pod 的变化

```shell
$ kubectl get pods -n kube-ops
NAME                       READY     STATUS              RESTARTS   AGE
jenkins2-7c85b6f4bd-rfqgv   1/1       Running             3          1d
jnlp-hfmvd                 0/1       ContainerCreating   0          7s
```

我们可以看到在我们点击立刻构建的时候可以看到一个新的 Pod：jnlp-hfmvd 被创建了，这就是我们的 Jenkins Slave。任务执行完成后我们可以看到任务信息，比如我们这里是 花费了 5.2s 时间在 jnlp-hfmvd 这个 Slave 上面
![jnlp slave](/img/posts/jenkins-demo1-config4.jpeg)

同样也可以查看到对应的控制台信息：
![jnlp output](/img/posts/jenkins-demo1-config5.jpeg)

到这里证明我们的任务已经构建完成，然后这个时候我们再去集群查看我们的 Pod 列表，发现 kube-ops 这个 namespace 下面已经没有之前的 Slave 这个 Pod 了。

```shell
$ kubectl get pods -n kube-ops
NAME                       READY     STATUS    RESTARTS   AGE
jenkins2-7c85b6f4bd-rfqgv   1/1       Running   3          1d
```

到这里我们就完成了使用 Kubernetes 动态生成 Jenkins Slave 的方法。下节课我们来给大家介绍下怎么在 Jenkins 中来发布我们的 Kubernetes 应用。最后感谢圈友`@TangT-newhope-成都`提供的帮助。

<!--adsense-self-->
