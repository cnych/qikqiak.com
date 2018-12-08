---
title: Kubernetes Ingress 自动化 HTTPS
subtitle: 使用 Let's Encrypt 实现 Kubernetes Ingress 自动化 HTTPS
date: 2018-12-05
tags: ["kubernetes", "ingress", "traefik"]
slug: automatic-kubernetes-ingress-https-with-lets-encrypt
keywords: ["kubernetes", "ingress", "https", "traefik"]
gitcomment: true
bigimg: [{src: "/img/posts/photo-1543970256-c86ba45b0d9b.jpeg", desc: "You don’t have to be at the top to enjoy the view"}]
category: "kubernetes"
---

我们知道`HTTPS`的服务非常安全，Google 现在对非`HTTPS`的服务默认是拒绝的，而且还能避免国内各种乱七八糟的劫持，所以启用`HTTPS`服务是真的非常有必要的。一些正规机构颁发的`CA`证书费用又特别高，不过比较幸运的是也有免费的午餐 - `Let's Encrypt`，虽然只有90天的证书有效期，但是我们完全可以在证书失效之前，重新生成证书替换掉。在`Kubernetes`集群中就更方便了，我们可以通过 Kubernetes Ingress 和 Let's Encrypt 实现外部服务的自动化 HTTPS。

<!--more-->

在`Kubernetes`集群中使用 HTTPS 协议，需要一个证书管理器、一个证书自动签发服务，主要通过 Ingress 来发布 HTTPS 服务，因此需要`Ingress Controller`并进行配置，启用 HTTPS 及其路由。

![cert-manager-structrue](/img/posts/cert-manager-structrue.jpg)

## 部署
我们这里用来管理 SSL/TLS 证书的组件是`Cert manager`，它对于每一个 ingress endpoint 将会自动创建一个新的证书，当 certificates 过期时还能自动更新，除此之外，Cert manager 也可以和其它的 providers 一起工作，例如 HashiCorp Vault。为了方便我们这里使用`Helm`来部署即可。

> 如果你对`Helm`还不是很熟悉，可以参考前面我的[Helm 系列文章](https://www.qikqiak.com/k8s-book/docs/42.Helm%E5%AE%89%E8%A3%85.html)

在使用的时候我们需要配置一个缺省的[cluster issuer](http://docs.cert-manager.io/en/latest/reference/clusterissuers.html)，当部署`Cert manager`的时候，用于支持`kubernetes.io/tls-acme: "true"`annotation 来自动化 TLS：
```shell
ingressShim.defaultIssuerName=letsencrypt-prod
ingressShim.defaultIssuerKind=ClusterIssuer
```

运行下面的命令部署 Cert manager：
```shell
$ helm install --name cert-manager --namespace kube-system --set ingressShim.defaultIssuerName=letsencrypt-prod --set ingressShim.defaultIssuerKind=ClusterIssuer stable/cert-manager
NAME:   cert-manager
LAST DEPLOYED: Wed Dec  5 18:04:56 2018
NAMESPACE: kube-system
STATUS: DEPLOYED

RESOURCES:
==> v1/ServiceAccount
NAME          SECRETS  AGE
cert-manager  1        0s

==> v1beta1/CustomResourceDefinition
NAME                               AGE
certificates.certmanager.k8s.io    0s
clusterissuers.certmanager.k8s.io  0s
issuers.certmanager.k8s.io         0s

==> v1beta1/ClusterRole
cert-manager  0s

==> v1beta1/ClusterRoleBinding
NAME          AGE
cert-manager  0s

==> v1beta1/Deployment
NAME          DESIRED  CURRENT  UP-TO-DATE  AVAILABLE  AGE
cert-manager  1        1        1           0          0s

==> v1/Pod(related)
NAME                          READY  STATUS             RESTARTS  AGE
cert-manager-dd6856945-9ltk9  0/1    ContainerCreating  0         0s


NOTES:
cert-manager has been deployed successfully!

In order to begin issuing certificates, you will need to set up a ClusterIssuer
or Issuer resource (for example, by creating a 'letsencrypt-staging' issuer).

More information on the different types of issuers and how to configure them
can be found in our documentation:

https://cert-manager.readthedocs.io/en/latest/reference/issuers.html

For information on how to configure cert-manager to automatically provision
Certificates for Ingress resources, take a look at the `ingress-shim`
documentation:

https://cert-manager.readthedocs.io/en/latest/reference/ingress-shim.html
```

安装完成后，然后查看`Pod`运行状态：
```shell
$ kubectl get pod -n kube-system --selector=app=cert-manager
NAME                                        READY     STATUS    RESTARTS   AGE
cert-manager-cert-manager-7797579f9-m4dbc   1/1       Running   0          1m
```

除此之外，安装完成后`Cert manager`还提供了一些[Kubernetes custom resources](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/custom-resources/)：
```shell
$ kubectl get crd
NAME                                         AGE
certificates.certmanager.k8s.io              1m
clusterissuers.certmanager.k8s.io            1m
issuers.certmanager.k8s.io                   1m
```

## 创建证书签发服务
`Cert manager`安装后，接下来需要定义上面的`letsencrypt-prod`这个`cluster issuer`，这里使用上面的`clusterissuers.certmanager.k8s.io`这个`CRD`来定义：（cluster-issuer.yaml）
```yaml
apiVersion: certmanager.k8s.io/v1alpha1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: icnych@gmail.com
    privateKeySecretRef:
      name: letsencrypt-prod
    http01: {}
```

然后直接创建这个`ClusterIssuer`资源：
```shell
$ kubectl create -f cluster-issuer.yaml
clusterissuer.certmanager.k8s.io "letsencrypt-prod" created
$ kubectl get clusterissuer
NAME               AGE
letsencrypt-prod   16s
```

## 测试
上面我们已经安装了`Cert manager`，定义了`ClusterIssuer`，接下来我们来配置 HTTPS 去访问我们的 Kubernetes Dashboard 的服务，Dashboard 的部署我们这里就不多说了，直接添加一个 Ingress 资源对象即可：(dashboard-ingress.yaml)
```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: kube-ui
  namespace: kube-system
  annotations:
    kubernetes.io/ingress.class: "traefik"
    kubernetes.io/tls-acme: "true"
spec:
  tls:
  - hosts:
    - k8sui.qikqiak.com
    secretName: k8sui-tls
  rules:
  - host: k8sui.qikqiak.com
    http:
      paths:
      - path: '/'
        backend:
          serviceName: kubernetes-dashboard
          servicePort: 443
```

这里需要注意的是上面我们添加的两个`annotations`非常重要，这个将告诉 Cert Manager 去生成证书，然后由于我们这里要使用 HTTPS，所以我们需要添加一个 tls 证书，而证书就是通过`k8sui-tls`这个 Secret 对象来提供的，要注意的是这个 Secret 对象并不是我们手动创建的，而是 Cert Manager 自动创建的证书对应的对应。然后直接创建这个资源对象即可：
```shell
$ kubectl create -f dashboard-ingress.yaml
```

> 当然如果需要在公网中进行访问，我们还需要将我们这里的域名解析到 Ingress Controller 所在的任意一个节点，或者在本地的`/etc/hosts`中加上映射也是可以的。

创建完成后隔一会儿我们可以看到会多出现一个随机名称的 Ingress 对象，这个 Ingress 对象就是用来专门验证证书的：
```shell
$ kubectl get ingress -n kube-system
NAME                        HOSTS                   ADDRESS   PORTS     AGE
cm-acme-http-solver-hl5sx   k8sui.qikqiak.com             80        37s
kube-ui                     k8sui.qikqiak.com             80, 443   41s
```

我们可以通过 Traefik 的 Dashboard 可以观察到这一变化，验证成功后，这个 Ingress 对象也自动删除了：
![traefik-dashboard-acme](/img/posts/traefik-dashboard-acme.png)

这个时候我们可以去`describe`下我们的 Ingress 对象：
```shell
$ Name:             kube-ui
Namespace:        kube-system
Address:
Default backend:  default-http-backend:80 (<none>)
TLS:
  k8sui-tls terminates k8sui.qikqiak.com
Rules:
  Host               Path  Backends
  ----               ----  --------
  k8sui.qikqiak.com
                     /   kubernetes-dashboard:443 (10.244.0.31:8443)
Annotations:
  kubernetes.io/tls-acme:       true
  kubernetes.io/ingress.class:  traefik
Events:
  Type    Reason             Age   From          Message
  ----    ------             ----  ----          -------
  Normal  CreateCertificate  13m   cert-manager  Successfully created Certificate "k8sui-tls"
```

可以看到最后提示成功创建了 Certificate 对象，同样我们可以通过下面的命令获取：
```shell
$ kubectl get certificate -n kube-system
NAME        AGE
k8sui-tls   15m
```

这个时候 Let's Encrypt 生成的证书文件就已经创建成功了，内容被添加到了上面 Ingress 中声明的 Secret 对象中：
```shell
$ kubectl get secret -n kube-system
k8sui-tls                                        kubernetes.io/tls                     2         32m
```

同样我们可以看到 Cert manager 的 Pod 中的日志信息：
```shell
$ kubectl logs -f cert-manager-dd6856945-4drmr -n kube-system
......
 1 sync.go:124] Certificate "k8sui-tls" for ingress "kube-ui" already exists
I1205 16:27:21.372285       1 sync.go:127] Certificate "k8sui-tls" for ingress "kube-ui" is up to date
I1205 16:27:21.372362       1 controller.go:166] ingress-shim controller: Finished processing work item "kube-system/kube-ui"
I1205 16:27:23.371967       1 controller.go:181] certificates controller: syncing item 'kube-system/k8sui-tls'
I1205 16:27:23.372682       1 sync.go:174] Certificate kube-system/k8sui-tls scheduled for renewal in 1430 hours
I1205 16:27:23.372769       1 controller.go:195] certificates controller: Finished processing work item "kube-system/k8sui-tls"
```

这个时候我们就可以通过 HTTPS 去访问上面我们配置的 Dashboard 的服务了，在浏览器中输入:`https://k8sui.qikqiak.com`，就可以看到会跳转到登录界面了，更重要的是浏览器左上角出现了`绿色`的认证小图标了：
![dashboard https](/img/posts/dashboard-https.png)

> 需要注意的是 Dashboard 会使用自己自建的证书，所以我们需要在 Traefik 的配置中添加上配置`insecureSkipVerify = true`，不去校验后端的证书服务，否则访问会有问题。如果你使用的是其他的 Ingress Controller，这里配置基本上也是一致的，只需要做相应的修改即可。

到这里我们就完成了使用`Let's Encrypt`实现`Kubernetes Ingress`自动化 HTTPS。

## 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

