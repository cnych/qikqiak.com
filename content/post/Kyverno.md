---
title: Kubernetes 策略引擎 Kyverno
date: 2024-04-17
tags: ["kubernetes", "Kyverno"]
keywords: ["kubernetes", "Kyverno", "策略引擎", "云原生"]
slug: kubernetes-policy-engine-kyverno
gitcomment: true
ads: true
category: "kubernetes"
---

[Kyverno](https://kyverno.io/) 是来自 Nirmata 的开源项目，后来捐赠给了 CNCF。Kyverno 是一个**具有验证和变异能力的 Kubernetes 策略引擎**，但是它还有生成资源的功能，还加入了 API 对象查询的能力。Kyverno 原本就是为 Kubernetes 编写的，除了对象生成功能之外，无需专用语言即可编写策略。

![Kyverno](https://picdn.youdianzhishi.com/images/1712888407472.png)

<!--more-->

同样 Kyverno 在 Kubernetes 集群中也是作为动态准入控制器运行的。Kyverno 从 kube-apiserver 接收验证和修改准入 webhook HTTP 回调，并应用匹配策略返回执行准入策略或拒绝请求的结果。Kyverno 策略可以使用资源 Kind、name 和标签选择器匹配资源，而且名称中支持通配符。

策略执行是通过 Kubernetes events 来捕获的，Kyverno 还报告现有资源的策略违规行为。下图显示了 Kyverno 的整体架构：

![Kyverno架构](https://picdn.youdianzhishi.com/images/1712888653949.png)

Kyverno 的高可用安装可以通过运行多个副本来完成，并且 Kyverno 的每个副本将具有多个执行不同功能的控制器。Webhook 处理来自 Kubernetes APIServer 的 `AdmissionReview` 请求，其 Monitor 组件创建和管理所需的配置。`PolicyController` watch 策略资源并根据配置的扫描间隔启动后台扫描，`GenerateController` 管理生成资源的生命周期。

## 安装

首先需要保证你的 Kubernetes 集群版本必须高于 v1.14，要安装的版本也和 Kubernetes 版本有关系。

![兼容版本](https://picdn.youdianzhishi.com/images/1712888705482.png)

我们这里已经是 v1.28.x 版本了，所以选择安装最新的 1.11.4 版本即可。

你可以选择直接从最新版本的资源清单安装 Kyverno，直接执行下面的命令即可：

```shell
➜ kubectl create -f https://github.com/kyverno/kyverno/releases/download/v1.11.3/install.yaml
```

此外同样可以使用 Helm 来进行一键安装：

```shell
➜ helm repo add kyverno https://kyverno.github.io/kyverno/
➜ helm repo update
# Install the Kyverno Helm chart into a new namespace called "kube-kyverno"
➜ helm upgrade --install kyverno kyverno/kyverno -n kube-kyverno --create-namespace
Release "kyverno" does not exist. Installing it now.
NAME: kyverno
LAST DEPLOYED: Fri Apr 12 10:57:03 2024
NAMESPACE: kube-kyverno
STATUS: deployed
REVISION: 1
NOTES:
Chart version: 3.1.4
Kyverno version: v1.11.4

Thank you for installing kyverno! Your release is named kyverno.

The following components have been installed in your cluster:
- CRDs
- Admission controller
- Reports controller
- Cleanup controller
- Background controller


⚠️  WARNING: Setting the admission controller replica count below 3 means Kyverno is not running in high availability mode.

💡 Note: There is a trade-off when deciding which approach to take regarding Namespace exclusions. Please see the documentation at https://kyverno.io/docs/installation/#security-vs-operability to understand the risks.
```

安装完成会创建一个 `kube-kyverno` 命名空间，同样也包含一些相关的 CRD：

```shell
➜ kubectl get pods -n kube-kyverno
NAME                                                       READY   STATUS      RESTARTS   AGE
kyverno-admission-controller-5bfb8878f5-gd77c              1/1     Running     0          22m
kyverno-background-controller-584b969d8c-l2m76             1/1     Running     0          22m
kyverno-cleanup-admission-reports-28548190-94s8h           0/1     Completed   0          9m24s
kyverno-cleanup-cluster-admission-reports-28548190-m5gkc   0/1     Completed   0          9m24s
kyverno-cleanup-controller-c9cc65b74-tvzdh                 1/1     Running     0          22m
kyverno-reports-controller-757cc45589-2vjqd                1/1     Running     0          22m
➜ kubectl get validatingwebhookconfiguration
NAME                                       WEBHOOKS   AGE
kyverno-cleanup-validating-webhook-cfg     1          18m
kyverno-exception-validating-webhook-cfg   1          13m
kyverno-policy-validating-webhook-cfg      1          13m
kyverno-resource-validating-webhook-cfg    0          13m
kyverno-ttl-validating-webhook-cfg         1          18m
➜ kubectl get mutatingwebhookconfigurations
NAME                                    WEBHOOKS   AGE
kyverno-policy-mutating-webhook-cfg     1          14m
kyverno-resource-mutating-webhook-cfg   0          14m
kyverno-verify-mutating-webhook-cfg     1          14m
➜ kubectl get crd |grep kyverno
admissionreports.kyverno.io                  2024-04-12T02:57:06Z
backgroundscanreports.kyverno.io             2024-04-12T02:57:06Z
cleanuppolicies.kyverno.io                   2024-04-12T02:57:06Z
clusteradmissionreports.kyverno.io           2024-04-12T02:57:06Z
clusterbackgroundscanreports.kyverno.io      2024-04-12T02:57:06Z
clustercleanuppolicies.kyverno.io            2024-04-12T02:57:06Z
clusterpolicies.kyverno.io                   2024-04-12T02:57:07Z
policies.kyverno.io                          2024-04-12T02:57:07Z
policyexceptions.kyverno.io                  2024-04-12T02:57:06Z
updaterequests.kyverno.io                    2024-04-12T02:57:06Z
```

可以看出安装完成后创建了几个 `validatingwebhookconfiguration` 与 `mutatingwebhookconfigurations` 对象。

## 策略与规则

使用 Kyverno 其实就是对策略和规则的应用，Kyverno 策略是规则的集合，每个规则都包含一个 `match` 声明、一个可选的 `exclude` 声明以及 `validate`、`mutate`、`generate` 或 `verifyImages` 声明之一组成，每个规则只能包含一个 `validate`、`mutate`、`generate` 或 `verifyImages` 子声明。

![Kyverno策略](https://picdn.youdianzhishi.com/images/1712893350720.png)

策略可以定义为集群范围的资源（`ClusterPolicy`）或命名空间级别资源（`Policy`）。

- Policy 将仅适用于定义它们的 namespace 内的资源
- ClusterPolicy 应用于匹配跨所有 namespace 的资源

## 策略定义

编写策略其实就是定义 `Policy` 或者 `ClusterPolicy` 对象。

**验证资源**

验证规则基本上是我们使用最常见和最实用的规则类型，当用户或进程创建新资源时，Kyverno 将根据验证规则检查该资源的属性，如果验证通过，则允许创建资源。如果验证失败，则创建被阻止。比如现在我们添加一个策略，要求所有的 pod 都包含一个 kyverno 的标签：

```yaml
# kyverno-require-label.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-label-policy
spec:
  validationFailureAction: Enforce
  rules:
    - name: check-for-labels
      match:
        resources:
          kinds:
            - Pod
      validate:
        message: "label 'kyverno' is required"
        pattern:
          metadata:
            labels:
              kyverno: "?*"
```

上面策略文件中添加了一个 `validationFailureAction=[Audit, Enforce]` 属性：

- 当处于 `Audit` 模式下，每当创建违反规则集的一个或多个规则的资源时，会允许 admission review 请求，并将结果添加到报告中。
- 当处于 `Enforce` 模式下，资源在创建时立即被阻止，报告中不会有。

然后就是下面使用 `rules` 属性定义的规则集合，`match` 用于表示匹配的资源资源，`validate` 表示验证方式，这里我们定义 `kyverno: "?*"` 这样的标签表示必须有这样的一个标签 key。

直接应用上面的策略对象即可：

```shell
➜ kubectl apply -f kyverno-require-label.yaml
clusterpolicy.kyverno.io/require-label-policy created
➜ kubectl get clusterpolicy
NAME                   ADMISSION   BACKGROUND   VALIDATE ACTION   READY   AGE   MESSAGE
require-label-policy   true        true         Enforce           True    37s   Ready
```

现在我们添加一个不带标签 kyverno 的 Pod：

```shell
➜ kubectl run busybox --image=busybox:1.28.3  --restart=Never -- sleep 1000000
Error from server: admission webhook "validate.kyverno.svc-fail" denied the request:

resource Pod/default/busybox was blocked due to the following policies

require-label-policy:
  check-for-labels: 'validation error: label ''kyverno'' is required. rule check-for-labels
    failed at path /metadata/labels/kyverno/'
```

可以看到提示，需要一个 kyverno 标签，同样我们也可以通过查看 Events 事件来了解策略应用情况：

```shell
➜ kubectl get events -A -w
......
kube-system     41s         Warning   PolicyViolation           pod/kube-scheduler-master                                      policy require-label-policy/check-for-labels fail: validation error: label 'kyverno' is required. rule check-for-labels failed at path /metadata/labels/kyverno/
kube-system     41s         Warning   PolicyViolation           pod/kube-sealos-lvscare-node1                                  policy require-label-policy/check-for-labels fail: validation error: label 'kyverno' is required. rule check-for-labels failed at path /metadata/labels/
kube-system     41s         Warning   PolicyViolation           pod/kube-sealos-lvscare-node2                                  policy require-label-policy/check-for-labels fail: validation error: label 'kyverno' is required. rule check-for-labels failed at path /metadata/labels/
```

如果创建的 Pod 带有 kyverno 标签则可以正常创建：

```shell
➜ kubectl run busybox --image=busybox:1.28.3 --labels kyverno=demo --restart=Never -- sleep 1000000
pod/busybox created
```

如果将 `validationFailureAction` 的值更改为 `Audit`，则即使我们创建的 Pod 不带有 kyverno 标签，也可以创建成功，但是我们可以在 `PolicyReport` 对象中看到对应的违规报告：

```shell
➜ kubectl get policyreports
NAME                                   KIND         NAME                                      PASS   FAIL   WARN   ERROR   SKIP   AGE
92916c69-a769-4064-a82f-0cbedd14de3a   Deployment   nfs-client-provisioner                    0      1      0      0       0      6m3s
e0860e6f-7296-492f-8cba-a411f8305885   ReplicaSet   nfs-client-provisioner-5f6f85d8c4         0      1      0      0       0      6m3s
e55af9b6-30f5-4708-9308-63f58063bfea   Pod          busybox                                   0      1      0      0       0      10s
➜ kubectl describe policyreports |grep "Result: \+fail" -B10
  UID:               1cc048ee-6a63-4824-bdbe-3234a69d0379
Results:
  Message:  validation error: label 'kyverno' is required. rule check-for-labels failed at path /metadata/labels/kyverno/
  Policy:   require-label-policy
  Result:   fail
  Rule:     check-for-labels
  Scored:   true
  Source:   kyverno
  Timestamp:
    Nanos:    0
    Seconds:  1712902797
```

从上面的报告资源中可以看到违反策略的资源对象。

**变更规则**

变更规则可以用于修改匹配到规则的资源（比如规则设置了 `metadata` 字段可以和资源的 `metadata` 进行合并），就是根据我们设置的规则来修改对应的资源。

比如现在我们添加如下所示一个策略，给所有包含 nginx 镜像的 pod 都加上一个标签（kyverno=nginx）：

```yaml
# kyverno-mutate-label.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: nginx-label-policy
spec:
  rules:
    - name: nginx-label
      match:
        resources:
          kinds:
            - Pod
      mutate:
        patchStrategicMerge:
          metadata:
            labels:
              kyverno: nginx
          spec:
            (containers):
              - (image): "*nginx*" # 容器镜像包含 nginx 即可
```

直接应用上面这个策略对象即可：

```shell
➜ kubectl apply -f kyverno-mutate-label.yaml
clusterpolicy.kyverno.io/nginx-label-policy created
➜ kubectl get clusterpolicy
NAME                 ADMISSION   BACKGROUND   VALIDATE ACTION   READY   AGE   MESSAGE
nginx-label-policy   true        true         Audit             True    4s    Ready
```

现在我们使用 nginx 镜像直接创建一个 Pod：

```shell
➜ kubectl run --image=nginx:1.7.9 nginx
pod/nginx created
➜ kubectl get pod nginx --show-labels
NAME    READY   STATUS    RESTARTS   AGE   LABELS
nginx   1/1     Running   0          11s   kyverno=nginx,run=nginx
```

可以看到 Pod 创建成功后包含了一个 `kyverno=nginx` 标签，由于有 kyverno 标签，所以上面的验证策略也是通过的，可以正常创建。

**生成资源**

生成规则可用于在创建新资源或更新源时创建其他资源，例如为命名空间创建新 RoleBindings 或 Secret 等。

比如现在我们一个需求是将某个 Secret 同步到其他命名空间中去（比如 TLS 密钥、镜像仓库认证信息），手动复制这些 Secret 比较麻烦，则我们可以使用 Kyverno 来创建一个策略帮助我们同步这些 Secret。比如在 `default` 命名空间中有一个名为 `regcred` 的 Secret 对象，需要复制到另外的命名空间，如果源 Secret 发生更改，它还将向复制的 Secret 同步更新。

```yaml
# kyverno-generate-secret.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: sync-secrets-policy
spec:
  rules:
    - name: sync-image-pull-secret
      match:
        any:
          - resources:
              kinds:
                - Namespace
      generate: # 生成的资源对象
        apiVersion: v1
        kind: Secret
        name: regcred
        namespace: "{{request.object.metadata.name}}" # 获取目标命名空间
        synchronize: true
        clone:
          namespace: default
          name: regcred
```

先在 default 命名空间中准备我们的 Secret 对象：

```shell
➜ kubectl create secret docker-registry regcred --docker-server=DOCKER_REGISTRY_SERVER --docker-username=DOCKER_USER --docker-password=DOCKER_PASSWORD --docker-email=DOCKER_EMAIL
secret/regcred created
```

然后应用上面的同步 Secret 策略：

```shell
➜ kubectl apply -f kyverno-generate-secret.yaml
clusterpolicy.kyverno.io/sync-secrets-policy created
➜ kubectl get clusterpolicy
NAME                  ADMISSION   BACKGROUND   VALIDATE ACTION   READY   AGE   MESSAGE
sync-secrets-policy   true        true         Audit             True    19s   Ready
```

现在我们创建一个新的命名空间：

```shell
➜ kubectl create ns test
namespace/test created
➜ kubectl get secret -n test
NAME      TYPE                             DATA   AGE
regcred   kubernetes.io/dockerconfigjson   1      6s
```

可以看到在新建的命名空间中多了一个 `regcred` 的 Secret 对象。

又比如默认情况下，Kubernetes 允许集群内所有 Pod 之间进行通信。必须使用 `NetworkPolicy` 资源和支持 `NetworkPolicy` 的 CNI 插件来限制通信。我们可以为每个命名空间配置默认 `NetworkPolicy`，以默认拒绝命名空间中 Pod 的所有入口和出口流量。然后再配置额外的 `NetworkPolicy` 资源，以允许从选定来源到应用程序 Pod 的所需流量。这个时候我们也可以创建一个 Kyverno 策略来帮助我们自动创建这个默认的 NetworkPolicy。

```yaml
# kyverno-add-networkpolicy.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: add-networkpolicy
spec:
  rules:
    - name: default-deny
      match:
        any:
          - resources:
              kinds:
                - Namespace
      generate:
        apiVersion: networking.k8s.io/v1
        kind: NetworkPolicy
        name: default-deny
        namespace: "{{request.object.metadata.name}}"
        synchronize: true
        data:
          spec:
            # select all pods in the namespace
            podSelector: {}
            # deny all traffic
            policyTypes:
              - Ingress
              - Egress
```

上面的这个策略文件中定义了一个 `default-deny` 的 NetworkPolicy，这个 NetworkPolicy 将在创建新命名空间时拒绝所有流量。

**清理资源**

Kyverno 能够以两种不同的方式清理（即删除）集群中的现有资源。第一种方法是通过 `CleanupPolicy` 或 `ClusterCleanupPolicy` 中的声明性策略定义。第二种方法是通过添加到资源的保留生存时间 (TTL) 标签。

与验证、变异、生成或验证资源中的镜像的其他策略类似，Kyverno 可以通过定义称为 `CleanupPolicy` 的新策略类型来清理资源。清理策略有集群范围和命名空间两种类型。清理策略使用熟悉的 `match/exclude` 属性来选择和排除要进行清理过程的资源。 `Conditions{}` 属性（可选）使用类似于前提条件和拒绝规则中的通用表达式来查询所选资源的内容，以优化选择过程。上下文变量（可选）可用于从其他资源获取数据以纳入清理过程。最后，`schedule` 字段以 `cron` 格式定义规则应运行的时间。

比如如果每 5 分钟的定时任务中发现副本数量少于两个，则此清理策略将删除具有标签 `canremove:true`的 Deployment。

```yaml
apiVersion: kyverno.io/v2beta1
kind: ClusterCleanupPolicy
metadata:
  name: cleandeploy
spec:
  match:
    any:
      - resources:
          kinds:
            - Deployment
          selector:
            matchLabels:
              canremove: "true"
  conditions:
    any:
      - key: "{{ target.spec.replicas }}"
        operator: LessThan
        value: 2
  schedule: "*/5 * * * *"
```

由于 Kyverno 遵循最小权限原则，因此根据希望删除的资源，可能需要向清理控制器授予额外的权限。 Kyverno 将在安装新的清理策略时通过验证这些权限来协助通知您是否需要额外的权限。比如下面的 ClusterRole 表示允许 Kyverno 清理 Pod 的权限声明：

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  labels:
    app.kubernetes.io/component: cleanup-controller
    app.kubernetes.io/instance: kyverno
    app.kubernetes.io/part-of: kyverno
  name: kyverno:cleanup-pods
rules:
  - apiGroups:
      - ""
    resources:
      - pods
    verbs:
      - get
      - watch
      - list
      - delete
```

除了可以声明性定义要删除哪些资源以及何时删除它们的策略之外，还有一种清理方式就是使用一个名为 `cleanup.kyverno.io/ttl` 的标签来明确标记需要删除的资源，该标签可以分配给任何资源，只要 Kyverno 具有删除该资源所需的权限，它将在指定时间删除。例如，创建下面的 Pod 将导致 Kyverno 在两分钟后清理它，并且不存在清理策略。

```yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    cleanup.kyverno.io/ttl: 2m
  name: foo
spec:
  containers:
    - args:
        - sleep
        - 1d
      image: busybox:1.35
      name: foo
```

## 策略变量

变量通过启用对策略定义中的数据、准入审核请求以及 ConfigMap、Kubernetes API Server、OCI 镜像仓库甚至外部服务调用等外部数据源的引用，使策略变得更加智能和可重用。

变量存储为 JSON，Kyverno 支持使用 `JMESPath` 来选择和转换 JSON 数据。使用 `JMESPath`，来自数据源的值以 `{{key1.key2.key3}}` 的格式引用。例如，要在 `kubectl apply` 操作期间引用新/传入资源的名称，可以将其编写为变量引用：`{{request.object.metadata.name}}`。在处理规则之前，策略引擎将用变量值替换任何格式为 `{{ <JMESPath> }}` 的值。变量可用于 Kyverno 规则或策略中的大多数位置，但匹配或排除语句中除外。

**预定义变量**

Kyverno 会自动创建一些有用的变量并使其在规则中可用：

- `serviceAccountName：userName`：例如当处理来自 `system:serviceaccount:nirmata:user1` 的请求时，Kyverno 会将值 `user1` 存储在变量 `serviceAccountName` 中。
- `serviceAccountNamespace：ServiceAccount` 的 `namespace` 部分。例如，当处理来自 `system:serviceaccount:nirmata:user1` 的请求时，Kyverno 会将 `nirmata` 存储在变量 `serviceAccountNamespace` 中。
- `request.roles`：存储在给定帐户可能拥有的数组中的角色列表。例如，`["foo:dave"]`。
- `request.clusterRoles`：存储在数组中的集群角色列表。例如，`["dave-admin"，"system：basic-user"，"system：discovery"，"system：public-info-viewer"]`。
- `images`：容器镜像信息的映射（如果有）。

**策略定义中的变量**

Kyverno 策略定义可以以`快捷方式`的形式引用策略定义中的其他字段。这是一种分析和比较值的有用方法，而无需显式定义它们。
为了让 Kyverno 在清单中引用这些现有值，它使用符号 `$(./../key_1/key_2)`。这可能看起来很熟悉，因为它本质上与 Linux/Unix 系统引用相对路径的方式相同。

例如下面的策略清单片段：

```yaml
validationFailureAction: Enforce
rules:
  - name: check-tcpSocket
    match:
      any:
        - resources:
            kinds:
              - Pod
    validate:
      message: "Port number for the livenessProbe must be less than that of the readinessProbe."
      pattern:
        spec:
          ^(containers):
            - livenessProbe:
                tcpSocket:
                  port: "$(./../../../readinessProbe/tcpSocket/port)"
              readinessProbe:
                tcpSocket:
                  port: "3000"
```

在上面的示例中，对于 Pod 规范中找到的任何容器字段 `readinessProbe.tcpSocket.port` 必须为 3000，并且字段 `livenessProbe.tcpSocket.port` 必须为相同的值。

**转义变量**

在某些情况下，我们可能希望编写一个包含变量的规则，供另一个程序或流程执行操作，而不是供 Kyverno 使用。例如，对于 `$()` 表示法中的变量，可以使用前导反斜杠 `(\)` 进行转义，并且 Kyverno 不会尝试替换值。以 `JMESPath` 表示法编写的变量也可以使用相同的语法进行转义，例如 `\{{ request.object.metadata.name }}`。

在下面的策略中，`OTEL_RESOURCE_ATTRIBUTES` 的值包含对其他环境变量的引用，这些变量将按字面引用，例如 `$(POD_NAMESPACE)`。

```yaml
apiVersion: kyverno.io/v1
kind: Policy
metadata:
  name: add-otel-resource-env
  namespace: foobar
spec:
  background: false
  rules:
    - name: imbue-pod-spec
      match:
        any:
          - resources:
              kinds:
                - v1/Pod
      mutate:
        patchStrategicMerge:
          spec:
            containers:
              - (name): "?*"
                env:
                  - name: NODE_NAME
                    value: "mutated_name"
                  - name: POD_IP_ADDRESS
                    valueFrom:
                      fieldRef:
                        fieldPath: status.podIP
                  - name: POD_NAME
                    valueFrom:
                      fieldRef:
                        fieldPath: metadata.name
                  - name: POD_NAMESPACE
                    valueFrom:
                      fieldRef:
                        fieldPath: metadata.namespace
                  - name: POD_SERVICE_ACCOUNT
                    valueFrom:
                      fieldRef:
                        fieldPath: spec.serviceAccountName
                  - name: OTEL_RESOURCE_ATTRIBUTES
                    value: >-
                      k8s.namespace.name=\$(POD_NAMESPACE),
                      k8s.node.name=\$(NODE_NAME),
                      k8s.pod.name=\$(POD_NAME),
                      k8s.pod.primary_ip_address=\$(POD_IP_ADDRESS),
                      k8s.pod.service_account.name=\$(POD_SERVICE_ACCOUNT),
                      rule_applied=$(./../../../../../../../../name)
```

比如现在创建一个如下所示的 Pod：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: test-env-vars
spec:
  containers:
    - name: test-container
      image: busybox
      command: ["sh", "-c"]
      args:
        - while true; do
          echo -en '\n';
          printenv OTEL_RESOURCE_ATTRIBUTES;
          sleep 10;
          done;
      env:
        - name: NODE_NAME
          value: "node_name"
        - name: POD_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: POD_NAMESPACE
          valueFrom:
            fieldRef:
              fieldPath: metadata.namespace
        - name: POD_IP_ADDRESS
          valueFrom:
            fieldRef:
              fieldPath: status.podIP
  restartPolicy: Never
```

该 Pod 相对于 `OTEL_RESOURCE_ATTRIBUTES` 环境变量的结果如下所示：

```yaml
- name: OTEL_RESOURCE_ATTRIBUTES
  value: k8s.namespace.name=$(POD_NAMESPACE), k8s.node.name=$(NODE_NAME), k8s.pod.name=$(POD_NAME),
k8s.pod.primary_ip_address=$(POD_IP_ADDRESS), k8s.pod.service_account.name=$(POD_SERVICE_ACCOUNT),
rule_applied=imbue-pod-spec
```

更多的 Kyverno 策略可以直接查看官方网站：[https://kyverno.io/policies](https://kyverno.io/policies)，可以在该网站上面根据策略类型、分类、主题等进行筛选。Kyverno 在灵活、强大和易用之间取得了一个很好的平衡，不需要太多学习时间，就能够提供相当方便的功能，官网提供了大量的针对各种场景的样例，非常值得使用。此外我们还有使用官方提供的 [Kyverno Playground](https://playground.kyverno.io) 来对你的资源策略进行测试。
