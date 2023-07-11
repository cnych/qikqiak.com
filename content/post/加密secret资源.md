---
title: 使用 Sealed Secrets 加密 Kubernetes Secrets
subtitle: 如何在 Git 中存储 Secrets 资源
date: 2020-06-20
tags: ["kubernetes", "sealed", "secrets", "ops"]
slug: encrypt-k8s-secrets-with-sealed-secrets
keywords: ["kubernetes", "sealed", "secrets", "ops", "gitops", "加密"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200620114105.png",
      desc: "Sealed Secrets",
    },
  ]
category: "kubernetes"
---

前面我们和大家提到过 GitOps 的实践，我们知道 GitOps 是提倡通过 Git 来管理所有的配置，通过声明式代码来对环境配置和基础设施进行版本管理。

在 Kubernetes 中我们知道可以使用资源清单文件来管理集群中的一资源对象，但是讲 Kubernetes 的 Secrets 数据存储在 Git 仓库中还是非常不妥的，毕竟也是非常不安全的。

Kubernetes Secrets 是用来帮助我们存储敏感信息的资源对象，比如密码、密钥、证书、OAuth Token、SSH KEY 等等。管理员可以通过创建 Secrets 对象，然后开发人员就可以在资源清单文件中非常方便的引用 Secrets 对象，而不用直接将这些敏感信息硬编码。

虽然这看上去非常方便，但是有 Secrets 的问题是它们只是简单的将这些敏感信息做了一次 base64 编码而已，任何人都可以非常容易对其进行解密获得原始的数据。所以我们说 Secrets 清单文件不能直接存储在 Git 源码仓库中，但是如果每次都去手工创建的话，这又使得我们的 GitOps 不是很流畅了。

为此 Bitnami Labs 创建了一个名为 [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) 的开源工具来解决这个问题。

<!--more-->

## Sealed Secrets

Sealed Secrets 主要由两个组件组成：

- 一个是集群内的 Kubernetes Operator
- 一个是名为 kubeseal 的客户端工具

`kubeseal` 允许我们使用非对称加密算法来加密 Kubernetes Secrets 对象，`SealedSecret` 是包含加密 Secret 的 Kubernetes CRD 资源对象，只有控制器可以进行解密，所以即使把 SealedSecret 存储在公共的代码仓库中也是非常安全的。

当我们在 Kubernetes 集群中创建 SealedSecret 资源对象的时候，对应的 Operator 就会读取它，然后生成对应的 Secret 对象，然后我们就可以在 Pod 中直接使用这个 Secret 对象了。下面就是一个 SealedSecret 的资源对象示例：

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: mysecret
spec:
  encryptedData:
    secret: AgBy3i4OJSWK+PiTySYZZA9rO43cGDEq.....
```

当 Operator 解密上面的对象后，会生成如下所示的 Secret 对象：

```yaml
apiVersion: v1
data:
  secret: VGhpcyBpcyBhIHNlY3JldCE=
kind: Secret
metadata:
  creationTimestamp: null
  name: mysecret
```

## SealedSecret 作用域

只有 Operator 才可以解密 SealedSecret，一般来说，不允许用户直接去读取 Secret 是一种比较好的做法，我们可以通过创建 RBAC 规则来禁止低权限用户来读取 Secret，也可以限制用户只能从他们的命名空间中读取 Secret 对象。虽然 SealedSecret 被设计成不能直接读取它们，但是用户还是可以绕过这个过程，获得对他们不允许查看的 Secret 对象的访问权限。

SealedSecret 资源提供了多种方式来防止这种行为，它默认是命名空间范围的，一旦将 SealedSecret 限定在一个命名空间下面，就不能在其他命名空间中使用这个对象。

比如，在 web 这个命名空间下面创建了一个名为 foo 带有 bar 这个值的 Secret 对象，我们就不能将这个 Secret 用于其他命名空间，即使需要相同的 Secret。虽然 SealedSecret 的控制器并没有为每个命名空间使用独立的解密密码，但是它在加密的过程中会考虑到命名空间和名称，所以达到的效果就类似于每个命名空间都有自己独立的解密密钥一样。

<!--adsense-self-->

另外一种情况是我们可能在上面的 web 命名空间上有一个用户，他只能查看某些 Secrets 而不是所有的，SealedSecret 也是允许这种操作的。当我们为 web 命名空间名为 foo 的 Secret 生成一个 SealedSecret 对象时，web 命名空间上的用户如果只是对名为 bar 的 Secret 对象有读取权限，那么就不能在 SealedSecret 资源对象中将 Secret 的名称改为 bar，并用它来查看该 Secret。

虽然这些方法可以帮助我们防止 Secrets 被滥用，但是管理起来还是比较麻烦。默认配置中，我们没办法定义通用的 Secret 来用于多个命名空间。而且很有可能我们的团队非常小，Kubernetes 集群只是运维人员来访问和维护，那么我们可能不需要这种 RBAC 的权限控制方式。

如果我们想定义跨命名空间的 SealedSecrets 对象，我们可以使用作用域来实现这个功能。

我们可以使用 3 个作用域来创建 SealedSecrets：

- strict（默认）：这种情况下，我们需要考虑 Secret 的名称和命名空间来加密，一旦创建了对应的 SealedSecret，就不能更改它的名称和命名空间了。
- namespace-wide：这个作用域允许我们在加密的 Secret 的命名空间内重命名 SealedSecret 对象。
- cluster-wide：这个作用域允许我们自由地在加密 Secret 的命名空间内重命名 SealedSecret，允许我们随意地将 Secret 移动到任何一个命名空间，随意命名。

我们可以在使用 kubeseal 的时候使用`--scope` 参数来指定作用域：

```bash
$ kubeseal --scope cluster-wide --format yaml <secret.yaml >sealed-secret.yaml
```

此外也可以在 Secret 中使用 annotation，在把配置传递给 kubeseal 之前使用作用域：

- `sealedsecrets.bitnami.com/namespace-wide: "true"`  表示  `namespace-wide`
- `sealedsecrets.bitnami.com/cluster-wide: "true"`  表示  `cluster-wide`

如果没有指定任何注解，那么 kubeseal 默认使用 strict 这个作用域，如果设置了两个注解，那么作用域更大的优先。

## SealedSecrets 使用

### 安装

前面我们提到过 SealedSecrets 由客户端的 kubeseal 和集群端的 Operator 组成。我们先来安装客户端的 kubeseal 工具。

从 [GitHub Release 页面](https://github.com/bitnami-labs/sealed-secrets/releases)选择最新的发布版本，下载最新的二进制文件：

```bash
$ wget https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.12.4/kubeseal-linux-amd64 -O kubeseal
$ sudo install -m 755 kubeseal /usr/local/bin/kubeseal
$ kubeseal --version
kubeseal version: v0.12.4+dirty
```

然后安装 Kubernetes 集群端的 Operator 控制器：

```bash
$ kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.12.4/controller.yaml
service/sealed-secrets-controller created
rolebinding.rbac.authorization.k8s.io/sealed-secrets-service-proxier created
rolebinding.rbac.authorization.k8s.io/sealed-secrets-controller created
clusterrole.rbac.authorization.k8s.io/secrets-unsealer created
serviceaccount/sealed-secrets-controller created
customresourcedefinition.apiextensions.k8s.io/sealedsecrets.bitnami.com created
role.rbac.authorization.k8s.io/sealed-secrets-service-proxier created
role.rbac.authorization.k8s.io/sealed-secrets-key-admin created
clusterrolebinding.rbac.authorization.k8s.io/sealed-secrets-controller created
deployment.apps/sealed-secrets-controller created
```

控制器默认会安装在 kube-system 命名空间下面：

```bash
$ kubectl get pods -n kube-system -l name=sealed-secrets-controller
NAME                                         READY   STATUS    RESTARTS   AGE
sealed-secrets-controller-6bf8c44ff9-fqhgt   1/1     Running   0          3m36s
```

当控制器运行成功后证明就已经安装成功了。接下来我们就可以使用 SealedSecret 来加密我们的 Secret 对象了。

### 测试

为了创建 SealedSecret 对象，我们首先需要创建一个 Secret 文件：

```bash
$ echo -n "This is a secret" | kubectl create secret generic mysecret --dry-run --from-file=secret=/dev/stdin -o yaml > secret.yaml
$ cat secret.yaml
apiVersion: v1
data:
  secret: VGhpcyBpcyBhIHNlY3JldA==
kind: Secret
metadata:
  creationTimestamp: null
  name: mysecret
```

注意上面我们使用的是`--dry-run` 参数，所以并不会真正创建，不过这个 Secret 对象也只是一个 base64 编码的字符串而已，所以不适合直接放在源码仓库中。

接下来使用 kubeseal 工具加密这个对象：

```bash
$ kubeseal --format yaml <secret.yaml >sealedsecret.yaml
$ cat sealedsecret.yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  creationTimestamp: null
  name: mysecret
  namespace: default
spec:
  encryptedData:
    secret: AgActQcD5PS8BkGE9bgB0gCtJrL0HQBA7IWoKYFcQAuOBxxAL5r+i6shnJQByxyo4Wv5y62MrxXlKZkliXuHygrCaxZaKUyvuPkmAcpcgg/P5kY2KI2yQd0ENqGzgPCBiqbBiEFYATykeAUSEe3uUrYeE0EeIDWpiX758UzukaP30Z9nr5m1Ce+rvUUrIaVwQvlHH3pCENGcnb+iCOd2N1zO4YUua1GIm8TFB9IaINCyJR1Djv5zoiu9auNEeVrTWW9gqr1Wj9UaHA7uYqMpdUvupRAdUxBL5HSjZKtcesOKvVtxLNPBmIzolMf42FrxBH42WEoXHOPsRxuKw6UIdsiigVwnTEJYIZyQg/iIdcuWHfOUkm4YcxVdnAuXGxqu8mUhlVNfHjX4SR7MvC+dRPWQNoiL2+uxweHNl0rZCddbzM0ELYdtn1bktaoFLiNeq0bhYYIXhdIzIZypqruuP7ZoNg6zz7ySf7OxhsevSTAD6x1wwKCcjr2kWvNj+zSu1D3zcKT8LTNqHlk35cxbjMDaGPjZ4VdvUGS0d/fBuEtiK6js1vMCfrMdPLiQFNOibro3yKNE8ES3rASIOj3XBxD3FUVT9lGNLsCaRQDQlx/7Fqdjg4o/iAY0qVz8EET8rFWRG/GX3miZdgI9WyHTOY6oUd10VjdEvVPI6JTISI36/HUXOybP+Tc/j6B9FlGmt1CkfzANvXGojjZVjm0yzPtH
  template:
    metadata:
      creationTimestamp: null
      name: mysecret
      namespace: default
```

可以看到 Secret 信息已经被加密了，现在我们就可以放心的将它存储在源码仓库中去了。

接下来我们在一个示例 Pod 中来使用下这个 Secret 对象，看能否正确获取到它的数据。

直接创建上面生成的 SealedSecret 对象：

```bash
$ kubectl apply -f sealedsecret.yaml
sealedsecret.bitnami.com/mysecret created
```

创建完成后正常我们也可以在 default 的命名空间下面找到一个名为 mysecret 的 Secret 对象：

```bash
$ kubectl get secret mysecret
NAME       TYPE     DATA   AGE
mysecret   Opaque   1      7s
```

使用如下所示的资源清单来创建一个测试的 Pod：

```bash
$ kubectl apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: busybox
  labels:
    app: busybox
spec:
  containers:
  - name: test
    image: busybox
    imagePullPolicy: IfNotPresent
    command:
      - sleep
      - "3600"
    volumeMounts:
    - name: mysecretvol
      mountPath: "/tmp/mysecret"
      readOnly: true
  volumes:
  - name: mysecretvol
    secret:
      secretName: mysecret
EOF
pod/busybox created
$ kubectl get pods busybox
NAME      READY   STATUS    RESTARTS   AGE
busybox   1/1     Running   0          19s
```

运行成功后我们可以查看容器中的密码数据来验证是否正确：

```bash
$ kubectl exec -it busybox cat /tmp/mysecret/secret
This is a secret
```

可以看到正确打印出了我们定义的密码信息 `This is a secret`。

<!--adsense-text-->

### 修改命名空间

由于上面我们的 Secret 中没有指定任何作用域信息，所以这个 Secret 只能在指定的 default （默认的）命名空间下面使用。比如这里我们将上面的 SealedSecret 对象修改到名为 test 的命名空间中去：

```bash
$ cp -a sealedsecret.yaml sealedsecret-test.yaml
$ sed -i 's/default/test/g' sealedsecret-test.yaml
$ kubectl create ns test
namespace/test created
$ kubectl apply -f sealedsecret-test.yaml
sealedsecret.bitnami.com/mysecret created
```

创建完成后，我们查看下是否有生成对应的 Secret 对象：

```bash
$ kubectl get secret -n test
NAME                  TYPE                                  DATA   AGE
default-token-4gwfx   kubernetes.io/service-account-token   3      31s
```

我们可以看到并没有生成对应的 Secret 对象，查看下 SealedSecret 对象是否创建成功：

```bash
$ kubectl get sealedsecret -n test
NAME       AGE
mysecret   104s
```

可以看到 SealedSecret 对象是存在的，但是没有生成对应的 Secret，我们去查看下控制器的日志：

```bash
$ kubectl get pods -n kube-system -l name=sealed-secrets-controller
NAME                                         READY   STATUS    RESTARTS   AGE
sealed-secrets-controller-6bf8c44ff9-fqhgt   1/1     Running   0          28m
$ kubectl logs -f sealed-secrets-controller-6bf8c44ff9-fqhgt -n kube-system
......
2020/06/20 02:59:50 Event(v1.ObjectReference{Kind:"SealedSecret", Namespace:"test", Name:"mysecret", UID:"78caa14b-c496-405b-91f8-652b2e4cef15", APIVersion:"bitnami.com/v1alpha1", ResourceVersion:"81242729", FieldPath:""}): type: 'Warning' reason: 'ErrUnsealFailed' Failed to unseal: no key could decrypt secret (secret)
2020/06/20 02:59:50 Updating test/mysecret
2020/06/20 02:59:50 Error updating test/mysecret, giving up: no key could decrypt secret (secret)
E0620 02:59:50.151844       1 controller.go:196] no key could decrypt secret (secret)
2020/06/20 02:59:50 Event(v1.ObjectReference{Kind:"SealedSecret", Namespace:"test", Name:"mysecret", UID:"78caa14b-c496-405b-91f8-652b2e4cef15", APIVersion:"bitnami.com/v1alpha1", ResourceVersion:"81242729", FieldPath:""}): type: 'Warning' reason: 'ErrUnsealFailed' Failed to unseal: no key could decrypt secret (secret)
```

可以看到了出现了 `no key could decrypt secret (secret)` 这样的错误信息，这是因为我们使用的默认的 strict 作用域，所以更改 SealedSecret 的命名空间是不生效的。

### 修改 Secret 名称

同样我们来测试下在 Secret 的命名空间下面来修改 Secret 的名称看看会是什么效果：

```bash
$ cp -a sealedsecret.yaml sealedsecret-anothersecret.yaml
$ sed -i 's/mysecret/anothersecret/g' sealedsecret-anothersecret.yaml
$ kubectl apply -f sealedsecret-anothersecret.yaml
sealedsecret.bitnami.com/anothersecret created
```

创建完成后查看 Secret 是否生成新的名称：

```bash
$ kubectl get secret
NAME                                    TYPE                                  DATA   AGE
default-token-5tsh4                     kubernetes.io/service-account-token   3      224d
mysecret                                Opaque                                1      18m
```

可以看到也没有生成修改过的名为 anothersecret 的 Secret 对象，同样可以查看 Controller 的日志信息：

```bash
$ kubectl logs -f sealed-secrets-controller-6bf8c44ff9-fqhgt -n kube-system
......
2020/06/20 03:07:52 Updating default/anothersecret
2020/06/20 03:07:53 Error updating default/anothersecret, will retry: no key could decrypt secret (secret)
2020/06/20 03:07:53 Event(v1.ObjectReference{Kind:"SealedSecret", Namespace:"default", Name:"anothersecret", UID:"b3467b24-b8d3-4c49-8de4-d8399875f8d5", APIVersion:"bitnami.com/v1alpha1", ResourceVersion:"81244607", FieldPath:""}): type: 'Warning' reason: 'ErrUnsealFailed' Failed to unseal: no key could decrypt secret (secret)
```

和上面修改命名空间出现的错误基本上是一致的，这也是符合我们的预期的，这是因为我们创建的是一个严格模式下的 Secret，所以不能跨命名空间也不能修改名称。我们可以来创建一个集群范围的 Secret 对象，看看是什么效果。

### 创建集群范围的 SealedSecrets

使用如下所示命令生成一个 Secret 对象资源清单：

```bash
$ echo -n "This is a secret" | kubectl create secret generic mycwsecret --dry-run --from-file=secret=/dev/stdin -o yaml > secret-cw.yaml
```

然后使用 `cluster-wide` 作用域来加密这个 Secret 对象到 test 命名空间下面去：

```bash
$ kubeseal --format yaml --scope cluster-wide <secret-cw.yaml >sealedsecret-cw.yaml
$ kubectl apply -n test -f sealedsecret-cw.yaml
sealedsecret.bitnami.com/mycwsecret created
$ kubectl get secret -n test
NAME                  TYPE                                  DATA   AGE
default-token-4gwfx   kubernetes.io/service-account-token   3      16m
mycwsecret            Opaque                                1      30s
```

我们可以看到对应的 Secret 对象也创建成功了。

现在我们来重命名这个 Secret，重新创建后看还能否生效：

```bash
$ cp -a sealedsecret-cw.yaml sealedsecret-anothercwsecret.yaml
$ sed -i 's/mycwsecret/anothercwsecret/g' sealedsecret-anothercwsecret.yaml
$ kubectl apply -n test -f sealedsecret-anothercwsecret.yaml
sealedsecret.bitnami.com/anothercwsecret created
```

创建完成后我们可以看成重命名后面的 Secret 也自动生成了：

```bash
$ kubectl get secret anothercwsecret -n test
NAME              TYPE     DATA   AGE
anothercwsecret   Opaque   1      36s
```

那么修改命名空间呢？比如我们将上面加密后的 Secret 对象创建在 default 命名空间下面：

```bash
$ kubectl apply -n default -f sealedsecret-cw.yaml
sealedsecret.bitnami.com/mycwsecret created
```

创建成功后，同样我们可以看到在默认的命名空间下面创建了对应的 Secret 对象：

```bash
$ kubectl get secret mycwsecret
NAME         TYPE     DATA   AGE
mycwsecret   Opaque   1      17s
```

这也是符合我们的预期的，因为我们创建的是一个 cluster-wide 作用域的 SealedSecrets，所以可以随意的修改命名空间和名称。

关于 SealedSecrets 的更多使用可以参考[官方文档](https://www.notion.so/cnych/Sealed-Secrets-Kubernetes-Secrets-bb45266d99ce46879d9475e72de905ed#e852a4220d2c4841a4ccc191e34ed47a)了解更多信息。

## 参考链接

- [https://github.com/bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
- [https://medium.com/better-programming/encrypting-kubernetes-secrets-with-sealed-secrets-fe363149a211](https://medium.com/better-programming/encrypting-kubernetes-secrets-with-sealed-secrets-fe363149a211)

<!--adsense-self-->
