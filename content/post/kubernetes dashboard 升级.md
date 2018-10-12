---
title: kubernetes dashboard 升级之路
date: 2017-11-13
publishdate: 2017-11-13
tags: ["kubernetes", "dashboard", "https"]
keywords: ["kubernetes", "dashboard", "https", "登录", "认证", "升级"]
slug: update-kubernetes-dashboard-more-secure
gitcomment: true
bigimg: [{src: "/img/posts/21689420_1963460803943335_1928791974941294592_n.jpg", desc: "It was an exciting feeling to be there alone at this huge lake, witnessing the spectacle of nature"}]
category: "kubernetes"
---

在前面[手动搭建高可用的kubernetes 集群](/post/manual-install-high-available-kubernetes-cluster)一文中我们安装的[kubernetes](/tags/kubernetes/)集群是`v1.8.2`版本，该版本的`dashboard`插件还是**1.6.x**，如果你把`dashboard`暴露在公网环境下面访问的话，是非常不安全的，因为该版本没有任何的安全登录之类的处理，在最新版本的**1.7.x**中则新增了更多安全相关的特性，我们可以升级到该版本或以上来暴露我们的`dashboard`到公网环境下面，当然安全都是相对的，能不暴露在公网环境下面当然是最好的。

<!--more-->

## 增加basic auth 认证

如果是**1.6.x**版本的`dashboard`我们可以增加`basic auth`认证，我们可以使用两种方式来实现：`haproxy/nginx`或者`traefik ingress`

#### haproxy/nginx

我们知道`haproxy`或者`nginx`都提供了`basic auth`的配置方法，由于我们这里配置的域名是强制跳转`https`的，公网服务都是直接通过`traefik ingress`来进行代理的，`https`的证书直接配置到`traefik`上面的，如果用`nginx`的话则还需要在`nginx`层配置`https`证书，所以这里我们使用`haproxy`，我们可以创建一个`ConfigMap`：

```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: haproxy-conf
  namespace: kube-system
data:
  haproxy-config: |-
    userlist users
      user admin insecure-password admin

    global
        log 127.0.0.1 local0 debug
        stats timeout 30s

    defaults
      log global
      mode  http
      option  httplog
      option  dontlognull
      timeout connect 5000
      timeout client  50000
      timeout server  50000
      timeout http-request 15s
      timeout http-keep-alive 15s

    frontend k8s-ui
      bind *:8440
      mode http
      acl auth_ok http_auth(users)
      http-request auth unless auth_ok
      default_backend k8s-ui

    backend k8s-ui
        mode http
        balance roundrobin
        server k8s-ui-1 kubernetes-dashboard.kube-system.svc.cluster.local:80 check
```

然后创建一个`haproxy`的**Deployment**和**Service**：

```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: haproxy
  namespace: kube-system
  labels:
    k8s-app: haproxy
spec:
  template:
    metadata:
      labels:
        k8s-app: haproxy
    spec:
      containers:
      - name: haproxy
        image: haproxy:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8440
          name: k8s-ui
          protocol: TCP
        volumeMounts:
        - name: haproxy-config-volume
          mountPath: /usr/local/etc/haproxy
      volumes:
      - name: haproxy-config-volume
        configMap:
          name: haproxy-conf
          items:
          - key: haproxy-config
            path: haproxy.cfg

---
kind: Service
apiVersion: v1
metadata:
  name: haproxy
  namespace: kube-system
  labels:
      k8s-app: haproxy
spec:
  ports:
  - port: 8440
    targetPort: k8s-ui
    name: k8s-ui
  selector:
    k8s-app: haproxy
```

然后配置上我们的`ingress`就可以了：

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: traefik-system
  namespace: kube-system
spec:
  rules:
  - host: k8s.local
    http:
      paths:
      - path: /
        backend:
          serviceName: haproxy
          servicePort: k8s-ui
```

然后我们访问`https://k8s.local`就会弹出`basic auth`的认证弹窗

![dashboard basic auth](/img/posts/WX20171113-111916.png)

#### traefik ingress

上面的方式需要引入`haprox`或者`nginx`，多引入了一个代理转发层，其实`ingress`本身就提供了`basic auth`的支持，在`ingress`规则中添加额外的认证`annotations`即可。

* 首先，我们需要创建用于存储用户名和密码的`htpasswd`文件

  ```shell
  $ htpasswd -bc auth admin admin
  ```


* 然后，然后创建一个基于`auth`文件的`secret`

  ```shell
  $ kubectl create secret generic system-basic-auth --from-file=auth -n kube-system
  ```

* 现在我们需要将`auth-type：basic`和`auth-secret：system-basic-auth`注释添加到`ingress`定义中。这告诉`traefik ingress controller`为hosts 配置`basic auth`，以及从哪里读取`htpasswd`文件。

  ```yaml
  apiVersion: extensions/v1beta1
  kind: Ingress
  metadata:
    name: traefik-system
    namespace: kube-system
    annotations:
      ingress.kubernetes.io/auth-type: basic
      ingress.kubernetes.io/auth-secret: system-basic-auth
  spec:
    rules:
    - host: k8s.local
      http:
        paths:
        - path: /
          backend:
            serviceName: haproxy
            servicePort: k8s-ui
  ```

  ​

## 升级Dashboard

上面的做法可以为`dashboard`增加`basic auth`认证，现在我们来升级到`1.7.1`版本，该版本新增了用户登录认证的功能。

#### 删除原来的资源

将之前的`dashboard`相关的yaml 文件资源都删除掉：

```shell
$ kubectl delete -f dashboard/
```

#### 部署新的版本

直接使用官方的配置文件安装即可：

```shell
$ wget https://raw.githubusercontent.com/kubernetes/dashboard/master/src/deploy/recommended/kubernetes-dashboard.yaml
```

为了测试方便，我们将`Service`改成`NodePort`类型，然后直接部署新版本的`dashboard`即可。

```shell
$ kubectl create -f kubernetes-dashboard.yaml
```

然后我们可以查看`dashboard`的外网访问端口：

```shell
$ kubectl get svc kubernetes-dashboard -n kube-system
NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)             AGE
haproxy                ClusterIP   10.254.125.90    <none>        8440/TCP,8442/TCP   2d
kubernetes-dashboard   NodePort    10.254.122.185   <none>        443:31694/TCP       10s
```

然后直接访问集群中的任何一个节点IP 加上上面的`31694`端口即可打开`dashboard`页面了

![dashboard https](/img/posts/WX20171113-110052.png)

> 由于`dashboard`默认是自建的`https`证书，该证书是不受浏览器信任的，所以我们需要强制跳转就可以了。

默认`dashboard`会跳转到登录页面：

![dashboard login](/img/posts/WX20171113-110230.png)

我们可以看到`dashboard`提供了`Kubeconfig`和`token`两种登录方式，我们可以直接跳过或者使用本地的`Kubeconfig`文件进行登录，可以看到会跳转到如下页面：

![dashboard auth](/img/posts/WX20171113-112007.png)

这是由于该用户没有对`default`命名空间的访问权限。



## 身份认证

登录`dashboard` 的时候支持`Kubeconfig` 和`token` 两种认证方式，Kubeconfig 中也依赖token 字段，所以生成token 这一步是必不可少的。

#### 生成token

我们创建一个`admin`用户并授予admin 角色绑定，使用下面的yaml文件创建admin用户并赋予他管理员权限，然后就可以通过token 登陆`dashbaord`，这种认证方式本质实际上是通过`Service Account` 的身份认证加上`Bearer token`请求 API server 的方式实现，参考 [Kubernetes 中的认证](https://kubernetes.io/docs/admin/authentication/)。

```yaml
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: admin
  annotations:
    rbac.authorization.kubernetes.io/autoupdate: "true"
roleRef:
  kind: ClusterRole
  name: cluster-admin
  apiGroup: rbac.authorization.k8s.io
subjects:
- kind: ServiceAccount
  name: admin
  namespace: kube-system
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: admin
  namespace: kube-system
  labels:
    kubernetes.io/cluster-service: "true"
    addonmanager.kubernetes.io/mode: Reconcile
```

上面的`admin`用户创建完成后我们就可以获取到该用户对应的`token`了，如下命令：

```shell
$ kubectl get secret -n kube-system|grep admin-token
admin-token-d5jsg                  kubernetes.io/service-account-token   3         1d
$ kubectl get secret admin-token-d5jsg -o jsonpath={.data.token} -n kube-system |base64 -d
# 会生成一串很长的base64后的字符串
```

然后在`dashboard`登录页面上直接使用上面得到的`token`字符串即可登录，这样就可以拥有管理员权限操作整个`kubernetes`集群的对象，当然你也可以为你的登录用户新建一个指定操作权限的用户。

![dashboard authed](/img/posts/WX20171113-110359.png)

#### 使用Kubeconfig

其实在前面的[集群安装一文](/post/manual-install-high-available-kubernetes-cluster/#kubectl)中我们已经知道了`Kubeconfig`的生成方式了，这里就不再累诉了。

## https 访问

前面我们提到`bashboard`默认是自建的不受信任的证书，所以这里如果你需要绑定你自己的域名，然后通过`https`访问的话有两种方式：

* `dashboard`采用上面的https 的方式部署，将你的域名证书替换掉自建的证书

  ```shell
  $ ls certs/
  dashboard.crt dashboard.key
  $ kubectl create secret generic kubernetes-dashboard-certs --from-file=certs -n kube-system
  ```

  然后将域名绑定到任意一个节点IP 和对应的NodePort 上面即可

* 上面的这种方式不能通过我们的`traefik`了，如果需要通过`traefik`来转发我们的`dashboard`的话，目前需要使用http 的方式部署`dashboard`，也直接使用官方提供的yaml 文件即可

  ```shell
  $ wget https://raw.githubusercontent.com/kubernetes/dashboard/master/src/deploy/alternative/kubernetes-dashboard.yaml
  $ kubectl create -f kubernetes-dashboard.yaml
  ```

  然后直接配置我们的`traefik ingress`转发规则即可，这样就形成了访问我们的`dashboard`使用`basic auth`和`dashboard login`两层认证了。

> 上面的traefik 转发的方式访问dashboard 默认不会自动跳转到登录页面，这是因为不是使用的https 的方式部署的，但是如果使用https 的方式部署dashboard，然后再通过traefik 进行转发的话则会一直报错：`tls: bad certificate`，不能正常使用dashboard，不知道有没有朋友也有这个问题呢？



## 参考资料

* [Access Control](https://github.com/kubernetes/dashboard/wiki/Access-control)
* [Traefik Authentication](https://docs.traefik.io/configuration/backends/kubernetes/)
* [haproxy basic auth](https://www.ohbyteme.com/posts/using-haproxy-http-basic-authentication-to-secure-access-to-kibana)
* [手动搭建高可用的kubernetes 集群](/post/manual-install-high-available-kubernetes-cluster)


欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

