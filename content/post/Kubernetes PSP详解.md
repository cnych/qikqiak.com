---
title: Kubernetes Pod 安全策略(PSP)配置
date: 2019-09-15
tags: ["kubernetes", "psp", "kubeadm", "RBAC"]
keywords:
  ["kubernetes", "RBAC", "psp", "kubeadm", "安全策略", "PodSecurityPolicy"]
slug: setup-psp-in-k8s
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1568397917828-25e02104303f.jpeg",
      desc: "A wonderful morning in summer!",
    },
  ]
category: "kubernetes"
---

默认情况下，Kubernetes 允许创建一个有特权容器的 Pod，这些容器很可能会危机系统安全，而 Pod 安全策略（PSP）则通过确保请求者有权限按配置来创建 Pod，从而来保护集群免受特权 Pod 的影响。

<!--more-->

`PodSecurityPolicy` 是 Kubernetes API 对象，你可以在不对 Kubernetes 进行任何修改的情况下创建它们，但是，默认情况下不会强制执行我们创建的一些策略，我们需要一个准入控制器、kube-controller-manager 配置以及 RBAC 权限配置，下面我们就来对这些配置进行一一说明。

[![k8s PodSecurityPolicy](https://picdn.youdianzhishi.com/images/k8s-psp.png)](/post/setup-psp-in-k8s/)

## Admission Controller

Admission Controller（准入控制器）拦截对 kube-apiserver 的请求，拦截发生在请求的对象被持久化之前，但是在请求被验证和授权之后。这样我们就可以查看请求对象的来源，并验证需要的内容是否正确。通过将它们添加到 kube-apiserver 的`--enable-admission-plugins`参数中来启用准入控制器。在 1.10 版本之前，使用现在已经弃用的`--admision-control`参数，另外需要注意准入控制器的顺序很重要。

将`PodSecurityPolicy`添加到 kube-apiserver 上的`--enabled-admission-plugins`参数中，然后重启 kube-apiserver：

```shell
--enable-admission-plugins=NamespaceLifecycle,LimitRanger,ServiceAccount,DefaultStorageClass,DefaultTolerationSeconds,MutatingAdmissionWebhook,ValidatingAdmissionWebhook,ResourceQuota,PodSecurityPolicy
```

> 其他插件来自 Kubernetes 文档中[推荐的一些插件列表](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#is-there-a-recommended-set-of-admission-controllers-to-use)。

PodSecurityPolicy 已经添加到上面的列表中了，现在 PSP 的控制器已经启用了，但是我们集群中现在缺少一些安全策略，那么新的 Pod 创建就会失败。

比如现在我们创建一个 Nginx 的 Deployment，YAML 文件内容如下所示：（nginx.yaml）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deploy
  namespace: default
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.15.4
```

然后直接创建上面的 Deployment：

```shell
$ kubectl apply -f nginx.yaml
deployment.apps/nginx-deploy created
```

我们可以看到 Deployment 已经创建成功了，现在检查下 default 命名空间下面的 pod、replicaset、deployment：

```shell
$ kubectl get po,rs,deploy -l app=nginx

NAME                                       READY   STATUS      RESTARTS   AGE

NAME                                            DESIRED   CURRENT   READY   AGE
replicaset.extensions/nginx-deploy-77f7d4c6b4   1         0         0       40s

NAME                                 READY   UP-TO-DATE   AVAILABLE   AGE
deployment.extensions/nginx-deploy   0/1     0            0           40s
```

可以看到 replicaset 和 deployment 都创建成功了，但是 replicaset 控制器却并没有创建 Pod，这个时候就需要使用 ServiceAccount 了。

<!--adsense-text-->

## ServiceAccount Controller Manager

一般来说用户很少会直接创建 Pod，通常是通过 Deployment、StatefulSet、Job 或者 DasemonSet 这些控制器来创建 Pod 的，我们这里需要配置 kube-controller-manager 来为其包含的每个控制器使用单独的 ServiceAccount，我们可以通过在其命令启动参数中添加如下标志来实现：

```shell
--use-service-account-credentials=true
```

一般情况下上面这个标志在大多数安装工具（如 kubeadm）中都是默认开启的，所以不需要单独配置了。

当 kube-controller-manager 开启上面的标志后，它将使用由 Kubernetes 自动生成的以下 ServiceAccount:

```shell
$ kubectl get serviceaccount -n kube-system | egrep -o '[A-Za-z0-9-]+-controller'

attachdetach-controller
calico-kube-controller
certificate-controller
clusterrole-aggregation-controller
cronjob-controller
daemon-set-controller
deployment-controller
disruption-controller
endpoint-controller
expand-controller
job-controller
namespace-controller
node-controller
pv-protection-controller
pvc-protection-controller
replicaset-controller
replication-controller
resourcequota-controller
service-account-controller
service-controller
statefulset-controller
ttl-controller
```

这些 ServiceAccount 指定了哪个控制器可以解析哪些策略的配置。

## 策略

PodSecurityPolicy 对象提供了一种声明式的方式，用于表达我们运行用户和 ServiceAccount 在我们的集群中创建的内容。我们可以查看[策略文档](https://kubernetes.io/docs/concepts/policy/pod-security-policy/#policy-reference)来了解如何设置。在我们当前示例中，我们将创建 2 个策略，第一个是提供限制访问的“默认”策略，保证使用特权设置（例如使用 hostNetwork）无法创建 Pod。第二种是一个“提升”的许可策略，允许将特权设置用于某些 Pod，例如在 kube-system 命名空间下面创建的 Pod 有权限。

首先，创建一个限制性策略，作为默认策略：(psp-restrictive.yaml)

```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: restrictive
spec:
  privileged: false
  hostNetwork: false
  allowPrivilegeEscalation: false
  defaultAllowPrivilegeEscalation: false
  hostPID: false
  hostIPC: false
  runAsUser:
    rule: RunAsAny
  fsGroup:
    rule: RunAsAny
  seLinux:
    rule: RunAsAny
  supplementalGroups:
    rule: RunAsAny
  volumes:
    - "configMap"
    - "downwardAPI"
    - "emptyDir"
    - "persistentVolumeClaim"
    - "secret"
    - "projected"
  allowedCapabilities:
    - "*"
```

直接创建上面的 psp 对象：

```shell
$ kubectl apply -f psp-restrictive.yaml
podsecuritypolicy.policy/restrictive configured
```

虽然限制性的访问对于大多数 Pod 创建是足够的了，但是对于需要提升访问权限的 Pod 来说，就需要一些允许策略了，例如，kube-proxy 就需要启用 hostNetwork:

```shell
$ kubectl get pods -n kube-system -l k8s-app=kube-proxy
NAME               READY   STATUS    RESTARTS   AGE
kube-proxy-4z4vf   1/1     Running   0          18d
$ kubectl get pods -n kube-system kube-proxy-4z4vf -o yaml |grep hostNetwork
  hostNetwork: true
```

这就需要创建一个用于提升创建权限的许可策略了：(psp-permissive.yaml)

```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: permissive
spec:
  privileged: true
  hostNetwork: true
  hostIPC: true
  hostPID: true
  seLinux:
    rule: RunAsAny
  supplementalGroups:
    rule: RunAsAny
  runAsUser:
    rule: RunAsAny
  fsGroup:
    rule: RunAsAny
  hostPorts:
    - min: 0
      max: 65535
  volumes:
    - "*"
```

同样直接创建上面的 psp 对象：

```shell
$ kubectl apply -f psp-permissive.yaml
podsecuritypolicy.policy/permissive configured
$ kubectl get psp
NAME               PRIV    CAPS   SELINUX    RUNASUSER   FSGROUP     SUPGROUP    READONLYROOTFS   VOLUMES
permissive         true           RunAsAny   RunAsAny    RunAsAny    RunAsAny    false            *
restrictive        false   *      RunAsAny   RunAsAny    RunAsAny    RunAsAny    false            configMap,downwardAPI,emptyDir,persistentVolumeClaim,secret,projected
```

现在配置都已经就绪了，但是我们需要引入到 Kubernetes 授权，这样才可以确定请求 Pod 创建的用户或者 ServiceAccount 是否解决了限制性或许可性策略，这就需要用到 RBAC 了。

## RBAC

在我们启用 Pod 安全策略的时候，可能会对 RBAC 引起混淆。它确定了一个账户可以使用的策略，使用集群范围的 ClusterRoleBinding 可以为 ServiceAccount（例如 replicaset-controller）提供对限制性策略的访问权限。使用命名空间范围的 RoleBinding，可以启用对许可策略的访问，这样可以在特定的命名空间（如 kube-system）中进行操作。下面演示了 daemonset-controller 创建 kube-proxy Pod 的解析路径：

![rbac flow](https://picdn.youdianzhishi.com/images/rbac-flow.png)

上面的流程图可以帮助我们从概念上去了解策略解决方案，当然实际上的代码执行路径不一定就完全就是这样的，这只是一个简单的演示。

首先创建允许使用`restrictive`策略的 ClusterRole。然后创建一个 ClusterRoleBinding，将`restrictive`策略和系统中所有的控制器 ServiceAccount 进行绑定:(psp-restrictive-rbac.yaml)

```yaml
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: psp-restrictive
rules:
  - apiGroups:
      - extensions
    resources:
      - podsecuritypolicies
    resourceNames:
      - restrictive
    verbs:
      - use

---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: psp-default
subjects:
  - kind: Group
    name: system:serviceaccounts
    namespace: kube-system
roleRef:
  kind: ClusterRole
  name: psp-restrictive
  apiGroup: rbac.authorization.k8s.io
```

直接创建上面的 RBAC 相关的资源对象：

```shell
$ kubectl apply -f psp-restrictive-rbac.yaml
clusterrole.rbac.authorization.k8s.io/psp-restrictive created
clusterrolebinding.rbac.authorization.k8s.io/psp-default created
```

然后现在我们再重新创建上面我们的定义的 Deployment：

```shell
$ kubectl delete -f nginx.yaml
deployment.apps "nginx-deploy" deleted
$ kubectl apply -f nginx.yaml
deployment.apps/nginx-deploy created
```

创建完成后同样查看下 default 命名空间下面我们创建的一些资源对象：

```shell
$ kubectl get po,rs,deploy -l app=nginx
NAME                                       READY   STATUS      RESTARTS   AGE
pod/nginx-deploy-77f7d4c6b4-njfdl          1/1     Running     0          13s

NAME                                            DESIRED   CURRENT   READY   AGE
replicaset.extensions/nginx-deploy-77f7d4c6b4   1         1         1       13s

NAME                                 READY   UP-TO-DATE   AVAILABLE   AGE
deployment.extensions/nginx-deploy   1/1     1            1           13s
```

我们可以看到 Pods 被成功创建了，但是，如果我们尝试做一些策略不允许的事情，正常来说就应该被拒绝了。首先删除上面的这个 Deployment：

```shell
$ kubectl delete -f nginx.yaml
deployment.apps "nginx-deploy" deleted
```

现在我们在 nginx-deploy 基础上添加`hostNetwork: true`来使用 hostNetwork 这个特权：（nginx-hostnetwork.yaml）

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-hostnetwork-deploy
  namespace: default
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.15.4
      hostNetwork: true # 注意添加hostNetwork
```

然后直接创建上面的 Deployment 这个资源对象：

```shell
$ kubectl apply -f nginx-hostnetwork.yaml
deployment.apps/nginx-hostnetwork-deploy created
```

创建完成后同样查看 default 这个命名空间下面的一些资源对象：

```shell
$ kubectl get po,rs,deploy -l app=nginx

NAME                                       READY   STATUS      RESTARTS   AGE

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.extensions/nginx-hostnetwork-deploy-74c8fbd687   1         0         0       44s

NAME                                             READY   UP-TO-DATE   AVAILABLE   AGE
deployment.extensions/nginx-hostnetwork-deploy   0/1     0            0           44s
```

现在我们发现 ReplicaSet 又没有创建 Pod 了，可以使用`kubectl describe`命令去查看这里我们创建的 ReplicaSet 资源对象来了解更多的信息：

```shell
$ kubectl describe rs nginx-hostnetwork-deploy-74c8fbd687
Name:           nginx-hostnetwork-deploy-74c8fbd687
......
Events:
  Type     Reason        Age                   From                   Message
  ----     ------        ----                  ----                   -------
  Warning  FailedCreate  80s (x15 over 2m42s)  replicaset-controller  Error creating: pods "nginx-hostnetwork-deploy-74c8fbd687-" is forbidden: unable to validate against any pod security policy: [spec.securityContext.hostNetwork: Invalid value: true: Host network is not allowed to be used]
```

我们可以看到很明显 Hostnetwork 不被允许使用，但是在某些情况下，我们的确有在某个命名空间（比如 kube-system）下面创建使用 hostNetwork 的 Pod，这里就需要我们创建一个允许执行的 ClusterRole，然后为特定的命名空间创建一个 RoleBinding，将这里的 ClusterRole 和相关的控制器 ServiceAccount 进行绑定:(psp-permissive-rbac.yaml)

```yaml
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: psp-permissive
rules:
  - apiGroups:
      - extensions
    resources:
      - podsecuritypolicies
    resourceNames:
      - permissive
    verbs:
      - use

---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: RoleBinding
metadata:
  name: psp-permissive
  namespace: kube-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: psp-permissive
subjects:
  - kind: ServiceAccount
    name: daemon-set-controller
    namespace: kube-system
  - kind: ServiceAccount
    name: replicaset-controller
    namespace: kube-system
  - kind: ServiceAccount
    name: job-controller
    namespace: kube-system
```

然后直接创建上面的 RBAC 相关的资源对象：

```shell
$ kubectl apply -f psp-permissive-rbac.yaml
clusterrole.rbac.authorization.k8s.io/psp-permissive created
rolebinding.rbac.authorization.k8s.io/psp-permissive created
```

现在，我们就可以在 kube-system 这个命名空间下面使用 hostNetwork 来创建 Pod 了，将上面的 nginx 资源清单更改成 kube-system 命名空间下面：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-hostnetwork-deploy
  namespace: kube-system
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.15.4
      hostNetwork: true
```

重新创建这个 Deployment：

```shell
$ kubectl apply -f nginx-hostnetwork.yaml
deployment.apps/nginx-hostnetwork-deploy created
```

创建完成后同样查看下对应的资源对象创建情况：

```shell
$ kubectl get po,rs,deploy -n kube-system -l app=nginx
NAME                                            READY   STATUS    RESTARTS   AGE
pod/nginx-hostnetwork-deploy-74c8fbd687-7x8px   1/1     Running   0          2m1s

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.extensions/nginx-hostnetwork-deploy-74c8fbd687   1         1         1       2m1s

NAME                                             READY   UP-TO-DATE   AVAILABLE   AGE
deployment.extensions/nginx-hostnetwork-deploy   1/1     1            1           2m1s
```

现在我们可以看到 Pod 在 kube-system 这个命名空间下面创建成功了。

## 特定应用的 ServiceAccount

如果我们现在有这样的一个需求，在某个命名空间下面要强制执行我们创建的 restrictive（限制性）策略，但是这个命名空间下面的某个应用需要使用 permissive（许可）策略，那么应该怎么办呢？在当前模型中，我们只有集群级别和命名空间级别的解析。为了给某个应用提供单独的许可策略，我们可以为应用的 ServiceAccount 提供使用 permissive 这个 ClusterRole 的能力。

比如，还是在默认的命名空间下面创建一个名为 specialsa 的 ServiceAccount:

```shell
$ kubectl create serviceaccount specialsa
serviceaccount/specialsa created
```

然后创建一个 RoleBinding 将 specialsa 绑定到上面的 psp-permissive 这个 CluterRole 上:(specialsa-psp.yaml)

```yaml
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: RoleBinding
metadata:
  name: specialsa-psp-permissive
  namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: psp-permissive
subjects:
  - kind: ServiceAccount
    name: specialsa
    namespace: default
```

创建上面的 RoleBinding 对象：

```shell
$ kubectl apply -f specialsa-psp.yaml
rolebinding.rbac.authorization.k8s.io/specialsa-psp-permissive created
```

然后为我们上面的 Deployment 添加上 serviceAccount 属性:(nginx-hostnetwork-sa.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-hostnetwork-deploy
  namespace: default
  labels:
    app: nginx
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.15.4
      hostNetwork: true
      serviceAccount: specialsa # 注意这里使用的sa的权限绑定
```

然后直接创建即可:

```shell
$ kubectl apply -f nginx-hostnetwork-sa.yaml
deployment.apps/nginx-hostnetwork-deploy configured
```

这个时候我们查看 default 这个命名空间下面带有 hostNetwork 的 Pod 也创建成功了:

```shell
$ kubectl get po,rs,deploy -l app=nginx
NAME                                            READY   STATUS    RESTARTS   AGE
pod/nginx-hostnetwork-deploy-6c85dfbf95-hqt8j   1/1     Running   0          65s

NAME                                                        DESIRED   CURRENT   READY   AGE
replicaset.extensions/nginx-hostnetwork-deploy-6c85dfbf95   1         1         1       65s
replicaset.extensions/nginx-hostnetwork-deploy-74c8fbd687   0         0         0       31m

NAME                                             READY   UP-TO-DATE   AVAILABLE   AGE
deployment.extensions/nginx-hostnetwork-deploy   1/1     1            1           31m
```

> 上面我们描述了 Pod 安全策略是一种通过使用 PSP 授权策略来保护 k8s 集群中的 Pod 的创建过程的方法。

## 参考资料

- [Policy Reference](https://kubernetes.io/docs/concepts/policy/pod-security-policy/#policy-reference)
- [Setting Up Pod Security Policies](https://octetz.com/posts/setting-up-psps)
- [Is there a recommended set of admission controllers to use?](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#is-there-a-recommended-set-of-admission-controllers-to-use)

<!--adsense-self-->
