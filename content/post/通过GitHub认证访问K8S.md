---
title: 通过 GitHub OAuth 和 Dex 访问 Kubernetes 集群
date: 2019-06-28
tags: ["kubernetes", "github", "dex", "kubectl", "rbac"]
keywords: ["kubernetes", "github", "oauth", "dex", "kubectl", "rbac", "cert manager"]
slug: k8s-auth-via-oidc
gitcomment: true
category: "kubernetes"
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1561553543-e4c7b608b98d.jpeg", desc: "https://unsplash.com/photos/ieWHXjjAEwY"}]
---

我们知道可以[通过 RBAC 为操作 kubectl 的用户或组来进行权限控制]((/post/use-rbac-in-k8s/))，但是我们往往是通过 [kubernetes](/tags/kubernetes/) 集群的超级管理员手动为这些用户进行分配的，并没有一个开箱即用的 kubectl 身份验证工具。

现在参加 [kubernetes 进阶课程](https://youdianzhishi.com/course/6n8xd6/)的学生比较多，其中可能有一部分学生暂时还没有一套可用的集群环境，那么我们就可以为这部分学生授权访问我们的集群，但是如果这么多学生都手动去给他们创建身份认证必然非常麻烦。

那么我们可以用什么办法来可以很方便的为用户进行授权访问 [kubernetes](/tags/kubernetes/) 集群呢？

<!--more-->

## Kubernetes 身份认证
其实前面关于 RBAC 的文章中我们就已经和大家介绍了关于 [kubernetes](/tags/kubernetes/) 身份认证的一些信息，[kubernetes](/tags/kubernetes/) 本身并不维护任何用户账户信息，当然也就没办法进行任何身份认证。[kubernetes](/tags/kubernetes/) 集群有两种类型的帐号：User Account 和 Service Account。

* User Account：是给用户来使用的，全局唯一的，和集群的 namespace 没有关系。
* Service Account：是给应用程序来使用的，给那些运行在 [kubernetes](/tags/kubernetes/) 集群中的程序访问 API server 使用的。

关于如何手动创建 RBAC 为 User Account 和 Service Account 用户进行权限控制，可以去查看之前的文章：[Kubernetes RBAC 详解](/post/use-rbac-in-k8s/)，这里不再重复了。

对于普通用户使用的 User Account，[kubernetes](/tags/kubernetes/) 并不提供管理机制，而是通过信任某个独立的外部身份认证系统，来把身份认证交给这个外部系统来完成，所以，大部分情况下 User Account 的认证是发生在 Kubernetes 系统之外的。[kubernetes](/tags/kubernetes/) 自然是支持和外部用户管理和认证服务进行集成的。例如，一个可分发私钥的服务，一个用户管理服务（比如 Google Accounts），甚至可以是一个存储了用户名和密码列表的外部文件也可以。但是不管外部系统怎么管理，[kubernetes](/tags/kubernetes/) 集群内部并没有存储任何代表用户的对象信息，也就是说，集群在创建之初，在没有配置外部认证机制的情况下，没有任何用户账户存在，当然，你也无法创建任何用户。
<!--adsense-text-->
所以 kubernetes 不能设置信任单个用户，而是去信任某个第三方的用户管理系统，一旦信任了某个系统，那么该系统中所有的用户都可以访问 kubernetes 集群了，当然具体有什么权限就是授权管理的事情了，而授权是由 [kubernetes](/tags/kubernetes/) 自身控制的。


## OIDC 认证
[kubernetes](/tags/kubernetes/) 的认证策略有很多种，其中，通过一个不记名令牌 (Bear Token) 来识别用户是一种相对安全又被各种客户端广泛支持的认证策略。不记名令牌，代表着对某种资源，以某种身份访问的权利，无论是谁，任何获取该令牌的访问者，都被认为具有了相应的身份和访问权限。身份令牌（ID Token）就是一种不记名令牌，它本身记录着一个权威认证机构对用户身份的认证声明，同时还可以包含对这个用户授予了哪些权限的声明，[kubernetes](/tags/kubernetes/) 接受和识别的正是这种 ID Token。 

要想得到 ID Token，就需要经过一个权威机构的一套身份认证流程，OpenID Connect（OIDC）就是这样一套认证、授权 ID Token 的协议，我们这里需要使用到的工具包括下面几个：

* [dex-k8s-authenticator](https://github.com/mintel/dex-k8s-authenticator) - 一个用来生成 kubectl 配置信息的应用
* [Dex](https://github.com/dexidp/dex) - 一个 OIDC 提供器
* GitHub - 通过 GitHub 来提供用户授权认证
* [Cert manager](/post/automatic-kubernetes-ingress-https-with-lets-encrypt/) - 用来进行自动化 HTTPS


### 授权流程

下面是 kubernetes 通过 OIDC 进行认证授权的流程图：

![k8s 认证流程](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-auth-process.png)

1. 用户通过访问 dex-k8s-authenticator 应用进行登录请求（dex-login.qikqiak.com）
2. dex-k8s-authenticator 应用跳转请求到 Dex（dex-k8s.qikqiak.com）
3. Dex 跳转到 GitHub 授权页面
4. GitHub 将响应信息回传给 Dex
5. Dex 转发响应信息给 dex-k8s-authenticator
6. 用户通过 GitHub 获得 ID Token
7. dex-k8s-authenticator 添加 ID Token 到 kubeconfig
8. kubectl 传递 ID Token 到 KubeAPIServer
9. KubeAPIServer 返回响应结果给 kubectl
10. 用户从 kubectl 获取相关信息。

### 准备工作
首先，我们当然需要有一个可用的 kubernetes 集群，由于我们这里会通过 Helm 来进行应用安装，所以需要提前准备好 Helm 相关环境，可以[查看前面的文章了解更多关于 Helm 的信息](https://www.qikqiak.com/tags/helm/)。

然后，由于要为很多用户进行授权，所以我们这里需要在 GitHub 上面创建一个组织，我们直接对这个组织下面的一个团队进行授权即可，我们这里的组织名称为：max-k8s，团队名称为：team-red，当然我们也可以对组织下的所有用户进行授权，但是通过团队来进行授权显然更加灵活。前往 GitHub 组织设置页面（[https://github.com/organizations/max-k8s/settings/applications](https://github.com/organizations/max-k8s/settings/applications)）创建一个新的`OAuth App`：

![github organization settings](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-org-settings.png)


填写上你自己的值：

* 首页 URL：https://dex-k8s.qikqiak.com
* 认证回调 URL： https://dex-k8s.qikqiak.com/callback

要注意回调 URL 后面需要加上`callback`，将生成的`Client ID`和`Client secret`记录下来。

最后一定要记住需要对上面的两个 URL：dex-login.qikqiak.com 和 dex-k8s.qikqiak.com 做 DNS 解析，由于 Dex 和 dex-k8s-authenticator 两个应用我们都安装在 kubernetes 集群中，所以直接解析到 Ingress Controller 所在的节点即可。

### 安装 Dex 和 dex-k8s-authenticator
为了连接 Dex 应用，我们需要配置上 kubernetes 证书和私钥信息，我这里是通过 [kubeadm](/tags/kubeadm/) 搭建的集群，所以直接在 master 节点上直接获取即可：
```shell
$ cat /etc/kubernetes/pki/ca.crt
-----BEGIN CERTIFICATE-----
......crt证书内容......
-----END CERTIFICATE-----
$ cat /etc/kubernetes/pki/ca.key
-----BEGIN RSA PRIVATE KEY-----
......key私钥内容......
-----END RSA PRIVATE KEY-----
```

Clone dex-k8s-authenticator 代码仓库：
```shell
$ git clone git@github.com:mintel/dex-k8s-authenticator.git
cd dex-k8s-authenticator/
```

仓库下面有 dex 和 dex-k8s-authenticator 和 Helm Chart 模板，分别创建对应的 values.yaml 文件即可进行安装。

创建 dex 的 values 文件：（values-dex.yaml）
```yaml
global:
  deployEnv: prod
tls:
# 替换成你的kubernetes证书信息
  certificate: |-
    -----BEGIN CERTIFICATE-----
    ......crt证书内容......
    -----END CERTIFICATE-----
# 替换成你的kubernetes私钥信息
  key: |-  
    -----BEGIN RSA PRIVATE KEY-----
    ......key私钥内容......
    -----END RSA PRIVATE KEY-----
ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx  # nginx ingress
    kubernetes.io/tls-acme: "true"  # 使用cert manager进行自动化https
  path: /
  hosts:
    - dex-k8s.qikqiak.com
  tls:
    - secretName: cert-auth-dex
      hosts:
        - dex-k8s.qikqiak.com
serviceAccount:
  create: true
  name: dex-auth-sa
config: |
  issuer: https://dex-k8s.qikqiak.com/
  storage: 
    type: sqlite3
    config:
      file: /var/dex.db
  web:
    http: 0.0.0.0:5556
  frontend:
    theme: "coreos"
    issuer: "Example Co"
    issuerUrl: "https://example.com"
    logoUrl: https://example.com/images/logo-250x25.png
  expiry:
    signingKeys: "6h"
    idTokens: "24h"
  logger:
    level: debug
    format: json
  oauth2:
    responseTypes: ["code", "token", "id_token"]
    skipApprovalScreen: true
  connectors:
  - type: github
    id: github
    name: GitHub
    config:
      clientID: $GITHUB_CLIENT_ID    # 不用替换
      clientSecret: $GITHUB_CLIENT_SECRET  # 不用替换
      redirectURI: https://dex-k8s.qikqiak.com/callback  # github oauth callback url
      orgs:
      - name: max-k8s    # github 组织
        teams:
        - team-red  # github 组织下面的 team
  staticClients:
  - id: dex-k8s-authenticator
    name: dex-k8s-authenticator
    secret: generatedLongRandomPhrase
    redirectURIs:
      - https://login-k8s.qikqiak.com/callback/
envSecrets:
  GITHUB_CLIENT_ID: "替换成你的github client id"
  GITHUB_CLIENT_SECRET: "替换成你的github client secret"
```

然后创建 dex-k8s-authenticator 的 values 文件：(values-auth.yaml)
```yaml
global:
  deployEnv: prod
dexK8sAuthenticator:
  clusters:
  - name: k8s.example.com
    short_description: "k8s cluster"
    description: "Kubernetes cluster"
    issuer: https://dex-k8s.qikqiak.com/   
    k8s_master_uri: https://<APIServer URL>  # 替换成你kubernetes集群apiserver地址
    client_id: dex-k8s-authenticator
    client_secret: generatedLongRandomPhrase
    redirect_uri: https://login-k8s.qikqiak.com/callback/
    k8s_ca_pem: |
      -----BEGIN CERTIFICATE-----
      ......crt证书内容......
      -----END CERTIFICATE-----
ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: "true"
  path: /
  hosts:
    - login-k8s.qikqiak.com
  tls:
    - secretName: cert-auth-login
      hosts:
        - login-k8s.qikqiak.com
```

Chart 模板的 values 文件准备好了，我们可以先将两个应用的自动化 HTTPS 分别配置上，创建 SSL certificates：(https.yaml)
```yaml
apiVersion: certmanager.k8s.io/v1alpha1
kind: ClusterIssuer
metadata:
  name: le-clusterissuer
  namespace: kube-system
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: icnych@gmail.com
    privateKeySecretRef:
      name: le-clusterissuer
    http01: {}

---
apiVersion: certmanager.k8s.io/v1alpha1
kind: Certificate
metadata:
  name: cert-auth-dex
  namespace: kube-system
spec:
  secretName: cert-auth-dex
  dnsNames:
    - dex-k8s.qikqiak.com
  acme:
    config:
    - http01:
        ingressClass: nginx
      domains:
      - dex-k8s.qikqiak.com
  issuerRef:
    name: le-clusterissuer
    kind: ClusterIssuer

---
apiVersion: certmanager.k8s.io/v1alpha1
kind: Certificate
metadata:
  name: cert-auth-login
  namespace: kube-system
spec:
  secretName: cert-auth-login
  dnsNames:
    - login-k8s.qikqiak.com
  acme:
    config:
    - http01:
        ingressClass: nginx
      domains:
      - login-k8s.qikqiak.com
  issuerRef:
    name: le-clusterissuer
    kind: ClusterIssuer
```

当然前提是要安装 Cert Manager，关于 Cert Manager 的安装可以查看前面文章：[Kubernetes Ingress 自动化 HTTPS](/post/automatic-kubernetes-ingress-https-with-lets-encrypt/)，我们这里不再展开了。
<!--adsense-text-->
直接使用 kubectl 工具创建即可：
```shell
$ kubect create -f https.yaml
```

创建完成后可以通过 describe 命令查看运行状况，查看到类似于`Certificate issued successfully`的信息证明就已经配置成功了：
```shell
$ kubectl describe certificates cert-auth-dex -n kube-system
$ kubectl describe certificates cert-auth-login -n kube-system
```

然后在 dex-k8s-authenticator/ 根目录下面直接通过 Helm 安装：
```shell
$ helm install -n dex --namespace kube-system --values values-dex.yml charts/dex
$ helm install -n dex-auth --namespace kube-system --values values-auth.yml charts/dex-k8s-authenticator
```

安装完成后通过下面的命令进行校验（Dex 应该返回状态码400，dex-k8s-authenticator 应该返回状态码200）：
```shell
$ curl -sI https://dex-k8s.qikqiak.com/callback | head -1
HTTP/2 400
$ curl -sI https://login-k8s.qikqiak.com/ | head -1
HTTP/2 200
```

### RBAC 权限配置
上面的准备工作完成后，现在我们来为 max-k8s 这个 group 下面的 team-red 进行权限控制，比如我们希望这个 team 下面的所有用户都只有只读权限，创建对应的 RBAC 配置文件：(read-auth.yaml)
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-read-all
rules:
  -
    apiGroups:
      - ""
      - apps
      - autoscaling
      - batch
      - extensions
      - policy
      - rbac.authorization.k8s.io
      - storage.k8s.io
    resources:
      - componentstatuses
      - configmaps
      - cronjobs
      - daemonsets
      - deployments
      - events
      - endpoints
      - horizontalpodautoscalers
      - ingress
      - ingresses
      - jobs
      - limitranges
      - namespaces
      - nodes
      - pods
      - pods/log
      - pods/exec
      - persistentvolumes
      - persistentvolumeclaims
      - resourcequotas
      - replicasets
      - replicationcontrollers
      - serviceaccounts
      - services
      - statefulsets
      - storageclasses
      - clusterroles
      - roles
    verbs:
      - get
      - watch
      - list
  - nonResourceURLs: ["*"]
    verbs:
      - get
      - watch
      - list
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]

---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: dex-cluster-auth
  namespace: kube-system
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-read-all
subjects:
- kind: Group
  name: "max-k8s:team-red"
```

如果对于 RBAC 权限控制这块还不是很熟悉，同样可以回头去看看前面的文章：[Kubernetes RBAC 详解](/post/use-rbac-in-k8s/)，使用 kubectl 直接创建：
```shell
$ kubectl create -f read-auth.yaml
```

### APIServer 配置
现在我们相关的准备工作已经完成了，权限也配置上了，接下来是最重要的一步：为 APIServer 提供 OIDC 相关的配置。关于 APIServer 中 OIDC 相关部分的配置可以查看官方文档：[https://kubernetes.io/docs/reference/access-authn-authz/authentication/](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#configuring-the-api-server)

由于我这里的集群是使用的 [kubeadm](/tags/kubeadm/) 进行搭建的，所以直接去 master 节点上更改 APIserver 的静态 Pod 配置即可：
```yaml
$ cat /etc/kubernetes/manifests/kube-apiserver.yaml
......
spec:
  containers:
  - command:
    - kube-apiserver
    - --authorization-mode=Node,RBAC
    - --oidc-client-id=dex-k8s-authenticator
    - --oidc-groups-claim=groups
    - --oidc-issuer-url=https://dex-k8s.qikqiak.com/
    - --oidc-username-claim=email
......
```

然后将`kube-apiserver.yaml`文件从`/etc/kubernetes/manifests/`静态 Pod 目录下面移除，稍等一小会儿再移动回来，相当于强制重启了。


这样就完成了 KubeAPIServer 部分关于 OIDC 的配置。

## 测试
现在所有的工作都准备好了，接下来我们来测试下，前往登录页面（https://login-k8s.qikqiak.com）使用你的 GitHub 帐号（当然前提是得加入到上面我们的 max-k8s 组下面）进行登录授权：

![k8s auth login page](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-auth-login.png)

![k8s github auth](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-auth-github.png)

![k8s dex kubeconfig page](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-dex-kubeconfig.png)


然后根据上面页面中的信息进行 kubeconfig 信息配置，正常我们就可以访问到 kubernetes 集群了：
```shell
$ kubectl get pods
NAME                                      READY   STATUS    RESTARTS   AGE
nginx-app-76b6449498-ffhgx                1/1     Running   0          28d
nginx-app-76b6449498-wzjq2                1/1     Running   0          28d
$ kubectl delete pod nginx-app-76b6449498-wzjq2
Error from server (Forbidden): pods "nginx-app-76b6449498-wzjq2" is forbidden: User "ych_1024@163.com" cannot delete resource "pods" in API group "" in the namespace "default"
```

我们可以看到在 GitHub 上面 max-k8s 这个组下面的 team-red 这个 Team 下面的用户可以读取我们的资源对象了，但是没有写相关的权限，证明我们的验证成功了。


这样以后要是有学生想要访问我的集群，只需要加入到我们的 GitHub 组里面来就可以了，是不是很方便，显然比手动去授权前进了一大步吧。当然除了通过 GitHub 去授权外，我们还可以使用其他的第三方用户认证系统。

<!--adsense-self-->

## 参考文档
* [Dex](https://github.com/dexidp/dex)
* [dex-k8s-authenticator](https://github.com/mintel/dex-k8s-authenticator)
* [Kubernetes Authenticating](https://kubernetes.io/docs/reference/access-authn-authz/authentication/)
* [Kubernetes Authroization Overview](https://kubernetes.io/docs/reference/access-authn-authz/authorization/)
* [Kubernetes authentication via GitHub OAuth and Dex](https://medium.com/preply-engineering/k8s-auth-a81f59d4dff6)
* [为 Kubernetes 搭建支持 OpenId Connect 的身份认证系统](https://www.ibm.com/developerworks/cn/cloud/library/cl-lo-openid-connect-kubernetes-authentication/index.html)
