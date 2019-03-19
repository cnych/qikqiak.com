---
title: 在 Kubernetes 上安装 Gitlab CI Runner
subtitle: Gitlab CI 基本概念以及 Runner 的安装
date: 2019-03-19
tags: ["kubernetes", "gitlab", "ci"]
keywords: ["kubernetes", "gitlab", "ci", "runner"]
slug: gitlab-runner-install-on-k8s
gitcomment: true
bigimg: [{src: "https://ws3.sinaimg.cn/large/006tKfTcgy1g18ciwz60yj315q0rtgpr.jpg", desc: "Copperopolis, Copperopolis, California, USA"}]
category: "kubernetes"
---


[上节课我们使用 Helm 快速的将 Gitlab 安装到了我们的 Kubernetes 集群中](/post/gitlab-install-on-k8s/)，这节课来和大家介绍如何使用 Gitlab CI 来做持续集成，首先先给大家介绍一些关于 Gitlab CI 的一些基本概念，以及如何在 Kubernetes 上安装 Gitlab CI Runner。

<!--more-->

## 简介
从 Gitlab 8.0 开始，Gitlab CI 就已经集成在 Gitlab 中，我们只要在项目中添加一个`.gitlab-ci.yml`文件，然后添加一个`Runner`，即可进行持续集成。在介绍 Gitlab CI 之前，我们先看看一些 Gitlab CI 的一些相关概念。

### Pipeline
一次 Pipeline 其实相当于一次构建任务，里面可以包含很多个流程，如安装依赖、运行测试、编译、部署测试服务器、部署生产服务器等流程。任何提交或者 Merge Request 的合并都可以触发 Pipeline 构建，如下图所示：
```
+------------------+           +----------------+
|                  |  trigger  |                |
|   Commit / MR    +---------->+    Pipeline    |
|                  |           |                |
+------------------+           +----------------+
```

### Stages
Stages 表示一个构建阶段，也就是上面提到的一个流程。我们可以在一次 Pipeline 中定义多个 Stages，这些 Stages 会有以下特点：

* 所有 Stages 会按照顺序运行，即当一个 Stage 完成后，下一个 Stage 才会开始
* 只有当所有 Stages 完成后，该构建任务 (Pipeline) 才会成功
* 如果任何一个 Stage 失败，那么后面的 Stages 不会执行，该构建任务 (Pipeline) 失败

Stages 和 Pipeline 的关系如下所示：

```
+--------------------------------------------------------+
|                                                        |
|  Pipeline                                              |
|                                                        |
|  +-----------+     +------------+      +------------+  |
|  |  Stage 1  |---->|   Stage 2  |----->|   Stage 3  |  |
|  +-----------+     +------------+      +------------+  |
|                                                        |
+--------------------------------------------------------+
```

### Jobs
Jobs 表示构建工作，表示某个 Stage 里面执行的工作。我们可以在 Stages 里面定义多个 Jobs，这些 Jobs 会有以下特点：

* 相同 Stage 中的 Jobs 会并行执行
* 相同 Stage 中的 Jobs 都执行成功时，该 Stage 才会成功
* 如果任何一个 Job 失败，那么该 Stage 失败，即该构建任务 (Pipeline) 失败

Jobs 和 Stage 的关系如下所示：

```
+------------------------------------------+
|                                          |
|  Stage 1                                 |
|                                          |
|  +---------+  +---------+  +---------+   |
|  |  Job 1  |  |  Job 2  |  |  Job 3  |   |
|  +---------+  +---------+  +---------+   |
|                                          |
+------------------------------------------+
```

## Gitlab Runner
如果理解了上面的基本概念之后，可能我们就会发现一个问题，我们的构建任务在什么地方来执行呢，以前用 Jenkins 在 Master 和 Slave 节点都可以用来运行构建任务，而来执行我们的 Gitlab CI 构建任务的就是 Gitlab Runner。

我们知道大多数情况下构建任务都是会占用大量的系统资源的，如果直接让 Gitlab 本身来运行构建任务的话，显然 Gitlab 的性能会大幅度下降的。GitLab CI 最大的作用是管理各个项目的构建状态，因此，运行构建任务这种浪费资源的事情交给一个独立的 Gitlab Runner 来做就会好很多，更重要的是 Gitlab Runner 可以安装到不同的机器上，甚至是我们本机，这样完全就不会影响到 Gitlab 本身了。


### 安装
安装 Gitlab Runner 非常简单，我们可以完全安装官方文档：[https://docs.gitlab.com/runner/install/](https://docs.gitlab.com/runner/install/)即可，比如可以直接使用二进制、Docker 等来安装。同样的，我们这里还是将 Gitlab Runner 安装到 Kubernetes 集群中来，让我们的集群来统一管理 Gitlab 相关的服务。

1.验证 Kubernetes 集群

执行下面的命令验证 Kubernetes 集群：
```shell
$ kubectl cluster-info
Kubernetes master is running at https://10.151.30.11:6443
KubeDNS is running at https://10.151.30.11:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

`cluster-info`这个命令会显示当前链接的集群状态和可用的集群服务列表。


2.获取 Gitlab CI Register Token

前面的章节中我们已经成功安装了 Gitlab，在浏览器中打开`git.qikqiak.com`页面，然后登录后进入到管理页面`http://git.qikqiak.com/admin`，然后点击导航栏中的`Runner`，可以看到该页面中有两个总要的参数，一个是 URL，另外一个就是 Register Token，下面的步骤中需要用到这两个参数值。

![gitlab runner](https://ws3.sinaimg.cn/large/006tKfTcgy1g188bykw2ij31lu0he0xf.jpg)

> 注意：不要随便泄露 Token


3.编写 Gitlab CI Runner 资源清单文件

同样我们将 Runner 相关的资源对象都安装到`kube-ops`这个 namespace 下面，首先，我们通过 ConfigMap 资源来传递 Runner 镜像所需的环境变量（runner-cm.yaml）:
```yaml
apiVersion: v1
data:
  REGISTER_NON_INTERACTIVE: "true"
  REGISTER_LOCKED: "false"
  METRICS_SERVER: "0.0.0.0:9100"
  CI_SERVER_URL: "http://git.qikqiak.com/ci"
  RUNNER_REQUEST_CONCURRENCY: "4"
  RUNNER_EXECUTOR: "kubernetes"
  KUBERNETES_NAMESPACE: "kube-ops"
  KUBERNETES_PRIVILEGED: "true"
  KUBERNETES_CPU_LIMIT: "1"
  KUBERNETES_MEMORY_LIMIT: "1Gi"
  KUBERNETES_SERVICE_CPU_LIMIT: "1"
  KUBERNETES_SERVICE_MEMORY_LIMIT: "1Gi"
  KUBERNETES_HELPER_CPU_LIMIT: "500m"
  KUBERNETES_HELPER_MEMORY_LIMIT: "100Mi"
  KUBERNETES_PULL_POLICY: "if-not-present"
  KUBERNETES_TERMINATIONGRACEPERIODSECONDS: "10"
  KUBERNETES_POLL_INTERVAL: "5"
  KUBERNETES_POLL_TIMEOUT: "360"
kind: ConfigMap
metadata:
  labels:
    app: gitlab-ci-runner
  name: gitlab-ci-runner-cm
  namespace: kube-ops
```

要注意`CI_SERVER_URL`对应的值需要指向我们的 Gitlab 实例的 URL，并加上`/ci`（ http://git.qikqiak.com/ci ）。此外还添加了一些构建容器运行的资源限制，我们可以自己根据需要进行更改即可。


> 注意：在向 ConfigMap 添加新选项后，需要删除 GitLab CI Runner Pod。因为我们是使用 `envFrom`来注入上面的这些环境变量而不是直接使用`env`的（envFrom 通过将环境变量放置到`ConfigMaps`或`Secrets`来帮助减小清单文件。

另外如果要添加其他选项的话，我们可以在 Pod 中运行`gitlab-ci-multi-runner register --help`命令来查看所有可使用的选项，只需为要配置的标志添加 env 变量即可，如下所示：
```shell
gitlab-runner@gitlab-ci-runner-0:/$ gitlab-ci-multi-runner --help
[...]
--kubernetes-cpu-limit value                          The CPU allocation given to build containers (default: "1") [$KUBERNETES_CPU_LIMIT]
--kubernetes-memory-limit value                       The amount of memory allocated to build containers (default: "4Gi") [$KUBERNETES_MEMORY_LIMIT]
--kubernetes-service-cpu-limit value                  The CPU allocation given to build service containers (default: "1") [$KUBERNETES_SERVICE_CPU_LIMIT]
--kubernetes-service-memory-limit value               The amount of memory allocated to build service containers (default: "1Gi") [$KUBERNETES_SERVICE_MEMORY_LIMIT]
--kubernetes-helper-cpu-limit value                   The CPU allocation given to build helper containers (default: "500m") [$KUBERNETES_HELPER_CPU_LIMIT]
--kubernetes-helper-memory-limit value                The amount of memory allocated to build helper containers (default: "3Gi") [$KUBERNETES_HELPER_MEMORY_LIMIT]
--kubernetes-cpu-request value                        The CPU allocation requested for build containers [$KUBERNETES_CPU_REQUEST]
[...]
```


除了上面的一些环境变量相关的配置外，还需要一个用于注册、运行和取消注册 Gitlab CI Runner 的小脚本。只有当 Pod 正常通过 Kubernetes（TERM信号）终止时，才会触发转轮取消注册。 如果强制终止 Pod（SIGKILL信号），Runner 将不会注销自身。必须手动完成对这种**被杀死的** Runner 的清理，配置清单文件如下：（runner-scripts-cm.yaml）
```yaml
apiVersion: v1
data:
  run.sh: |
    #!/bin/bash
    unregister() {
        kill %1
        echo "Unregistering runner ${RUNNER_NAME} ..."
        /usr/bin/gitlab-ci-multi-runner unregister -t "$(/usr/bin/gitlab-ci-multi-runner list 2>&1 | tail -n1 | awk '{print $4}' | cut -d'=' -f2)" -n ${RUNNER_NAME}
        exit $?
    }
    trap 'unregister' EXIT HUP INT QUIT PIPE TERM
    echo "Registering runner ${RUNNER_NAME} ..."
    /usr/bin/gitlab-ci-multi-runner register -r ${GITLAB_CI_TOKEN}
    sed -i 's/^concurrent.*/concurrent = '"${RUNNER_REQUEST_CONCURRENCY}"'/' /home/gitlab-runner/.gitlab-runner/config.toml
    echo "Starting runner ${RUNNER_NAME} ..."
    /usr/bin/gitlab-ci-multi-runner run -n ${RUNNER_NAME} &
    wait
kind: ConfigMap
metadata:
  labels:
    app: gitlab-ci-runner
  name: gitlab-ci-runner-scripts
  namespace: kube-ops
```

我们可以看到需要一个 GITLAB_CI_TOKEN，然后我们用 Gitlab CI runner token 来创建一个 Kubernetes secret 对象。将 token 进行 base64 编码：
```shell
$ echo rcVZF-mdHt9qCyyrCDgS | base64 -w0
cmNWWkYtbWRIdDlxQ3l5ckNEZ1MK
```

> base64 命令在大部分 Linux 发行版中都是可用的。

然后使用上面的 token 创建一个 Secret 对象：(gitlab-ci-token-secret.yaml)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitlab-ci-token
  namespace: kube-ops
  labels:
    app: gitlab-ci-runner
data:
  GITLAB_CI_TOKEN: cmNWWkYtbWRIdDlxQ3l5ckNEZ1MK
```


然后接下来我们就可以来编写一个用于真正运行 Runner 的控制器对象，我们这里使用 Statefulset。首先，在开始运行的时候，尝试取消注册所有的同名 Runner，当节点丢失时（即`NodeLost`事件），这尤其有用。然后再尝试重新注册自己并开始运行。在正常停止 Pod 的时候，Runner 将会运行`unregister`命令来尝试取消自己，所以 Gitlab 就不能再使用这个 Runner 了，这个是通过 Kubernetes Pod 生命周期中的`hooks`来完成的。

另外我们通过使用`envFrom`来指定`Secrets`和`ConfigMaps`来用作环境变量，对应的资源清单文件如下：(runner-statefulset.yaml)
```yaml
apiVersion: apps/v1beta1
kind: StatefulSet
metadata:
  name: gitlab-ci-runner
  namespace: kube-ops
  labels:
    app: gitlab-ci-runner
spec:
  updateStrategy:
    type: RollingUpdate
  replicas: 2
  serviceName: gitlab-ci-runner
  template:
    metadata:
      labels:
        app: gitlab-ci-runner
    spec:
      volumes:
      - name: gitlab-ci-runner-scripts
        projected:
          sources:
          - configMap:
              name: gitlab-ci-runner-scripts
              items:
              - key: run.sh
                path: run.sh
                mode: 0755
      serviceAccountName: gitlab-ci
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        supplementalGroups: [999]
      containers:
      - image: gitlab/gitlab-runner:latest
        name: gitlab-ci-runner
        command:
        - /scripts/run.sh
        envFrom:
        - configMapRef:
            name: gitlab-ci-runner-cm
        - secretRef:
            name: gitlab-ci-token
        env:
        - name: RUNNER_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        ports:
        - containerPort: 9100
          name: http-metrics
          protocol: TCP
        volumeMounts:
        - name: gitlab-ci-runner-scripts
          mountPath: "/scripts"
          readOnly: true
      restartPolicy: Always
```

可以看到上面我们使用了一个名为 gitlab-ci 的 serviceAccount，新建一个 rbac 资源清单文件：(runner-rbac.yaml)
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gitlab-ci
  namespace: kube-ops
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: gitlab-ci
  namespace: kube-ops
rules:
  - apiGroups: [""]
    resources: ["*"]
    verbs: ["*"]
---
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: gitlab-ci
  namespace: kube-ops
subjects:
  - kind: ServiceAccount
    name: gitlab-ci
    namespace: kube-ops
roleRef:
  kind: Role
  name: gitlab-ci
  apiGroup: rbac.authorization.k8s.io
```

4.创建 Runner 资源对象

资源清单文件准备好后，我们直接创建上面的资源对象：
```shell
$ ls
gitlab-ci-token-secret.yaml  runner-cm.yaml  runner-rbac.yaml  runner-scripts-cm.yaml  runner-statefulset.yaml
$ kubectl create -f .
secret "gitlab-ci-token" created
configmap "gitlab-ci-runner-cm" created
serviceaccount "gitlab-ci" created
role.rbac.authorization.k8s.io "gitlab-ci" created
rolebinding.rbac.authorization.k8s.io "gitlab-ci" created
configmap "gitlab-ci-runner-scripts" created
statefulset.apps "gitlab-ci-runner" created
```

创建完成后，可以通过查看 Pod 状态判断 Runner 是否运行成功：
```shell
$ kubectl get pods -n kube-ops
NAME                                           READY     STATUS    RESTARTS   AGE
gitlab-7bff969fbc-k5zl4                        1/1       Running   0          4d
gitlab-ci-runner-0                             1/1       Running   0          3m
gitlab-ci-runner-1                             1/1       Running   0          3m
......
```

可以看到已经成功运行了两个（具体取决于`StatefulSet`清单中的副本数) Runner 实例，然后切换到 Gitlab Admin 页面下面的 Runner 页面：

![gitlab runner list](https://ws2.sinaimg.cn/large/006tKfTcgy1g189zhnqzbj31lc0u07bd.jpg)

当然我们也可以根据需要更改 Runner 的一些配置，比如添加 tag 标签等。

参考链接: https://edenmal.moe/post/2017/GitLab-Kubernetes-Running-CI-Runners-in-Kubernetes/

## 推荐
另外我们最近准备组织 [Kubernetes 线下3天闭门集训](/post/k8s-offline-training/) 活动，带您实现从 Docker 入门一步一步到 Kubernetes 进阶之路。

[![k8s training](https://ws1.sinaimg.cn/large/006tKfTcgy1g178gkk1azj30jl08caf4.jpg)](/post/k8s-offline-training/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](https://www.qikqiak.com/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

