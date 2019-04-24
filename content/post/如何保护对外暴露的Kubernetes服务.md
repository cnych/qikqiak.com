---
title: 如何保护对外暴露的 Kubernetes 服务
date: 2019-04-14
tags: ["kubernetes", "traefik", "nginx", "ingress", "oauth"]
keywords: ["kubernetes", "traefik", "nginx", "ingress", "oauth", "basic auth", "安全"]
slug: how-to-protect-exposed-k8s-server
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/j14tu.jpg", desc: "oauth"}]
category: "kubernetes"
---

有时候我们需要在 Kubernetes 中暴露一些没有任何安全验证机制的服务，比如没有安装 xpack 的 Kibana，没有开启登录认证的 Jenkins 服务之类的，我们也想通过域名来进行访问，比较域名比较方便，更主要的是对于 Kubernetes 里面的服务，通过 Ingress 暴露一个服务太方便了，而且还可以通过 cert-manager 来自动的完成`HTTPS`化。所以就非常有必要对这些服务进行一些安全验证了。

<!--more-->

## Basic Auth 认证
我们在前面升级 Dashboard 的文章中就给大家提到过两种方式来为我们的服务添加 Basic Auth 认证：haproxy/nginx 和 traefik/nginx-ingress。
<!--adsense-text-->
使用 haproxy/nginx 的方式非常简单，就是直接添加 basic auth 认证，然后将请求转发到后面的服务；而 traefik/nginx-ingress 都直接提供了 basic auth 的支持，我们这里使用 nginx-ingress 来为 Jenkins 服务添加一个 basic auth 的认证服务。

首先，我们需要创建用于存储用户名和密码的`htpasswd`文件：
```shell
$ htpasswd -bc auth admin admin321
Adding password for user admin
```

然后，创建一个基于上面 htpasswd 文件的 Secret 对象：
```shell
$ kubectl create secret generic jenkins-basic-auth --from-file=auth -n kube-ops
secret "jenkins-basic-auth" created
```

最后，我们需要在 Ingress 对象中添加`auth-type：basic`和`auth-jenkins-basic-auth`两个 annotations：（ingress.yaml）
```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: jenkins
  namespace: kube-ops
  annotations:
    kubernetes.io/ingress.class: nginx
    # 认证类型
    nginx.ingress.kubernetes.io/auth-type: basic
    # 包含 user/password 的 Secret 名称
    nginx.ingress.kubernetes.io/auth-secret: jenkins-basic-auth
    # 当认证的时候显示一个合适的上下文信息
    nginx.ingress.kubernetes.io/auth-realm: 'Authentication Required - admin'
spec:
  rules:
  - host: jenkins.qikqiak.com
    http:
      paths:
      - backend:
          serviceName: jenkins
          servicePort: web
```

然后更新上面的资源对象：
```yaml
$ kubectl apply -f ingress.yaml
ingress.extensions "jenkins" configured
```

更新完成后，现在我们去访问我们的 Jenkins 服务可以看到需要输入用户名和密码的提示信息了：

![jenkins basic auth](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/Nc7GvR.jpg)


## OAuth 认证
除了上面的 Basic Auth 认证方式以为，我们还可以通过 Github、Google 等提供的 OAuth 服务来进行身份验证。我们可以通过名为[OAuth2 Proxy](https://github.com/pusher/oauth2_proxy)的工具来代理请求，它通过提供一个外部身份验证的反向代理来实现，使用起来也相对简单。

### 安装
首先我们需要为我们的应用添加自动的 HTTPS，可以参考我们前面的文章[使用 Let's Encrypt 实现 Kubernetes Ingress 自动化 HTTPS](https://www.qikqiak.com/post/automatic-kubernetes-ingress-https-with-lets-encrypt/)。

然后登录 Github，在[https://github.com/settings/applications/new](https://github.com/settings/applications/new)添加一个新的`OAuth`应用程序：

![register github app](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/1LvSla.jpg)

替换成你自己需要使用的域名，然后在回调 URL 上添加`/oauth2/callback`，点击注册后，记录下应用详细页面`Client ID`和`Client Secret`的值。然后还需要生成一个 cookie 密钥，当然如果我们系统中安装了 python 环境可以直接生成，没有的话用 Docker 容器运行当然也行：
```shell
$ docker run -ti --rm python:3-alpine \
    python -c 'import secrets,base64; print(base64.b64encode(base64.b64encode(secrets.token_bytes(16))));'
b'<GENERATED_COOKIE_SECRET>'
```

然后部署`OAuth2 Proxy`应用，这里我们直接使用 Helm 来简化安装：
```shell
$ helm install --name authproxy \
    --namespace=kube-system \
    --set config.clientID=<YOUR_CLIENT_ID> \
    --set config.clientSecret=<YOUR_SECRET> \
    --set config.cookieSecret=<GENERATED_COOKIE_SECRET> \
    --set extraArgs.provider=github \
    --set extraArgs.email-domain="*" \
    stable/oauth2-proxy
NAME:   authproxy
LAST DEPLOYED: Sun Apr 14 01:11:50 2019
NAMESPACE: kube-system
STATUS: DEPLOYED

RESOURCES:
==> v1/Secret
NAME                    TYPE    DATA  AGE
authproxy-oauth2-proxy  Opaque  3     0s

==> v1/ConfigMap
NAME                    DATA  AGE
authproxy-oauth2-proxy  1     0s

==> v1/Service
NAME                    TYPE       CLUSTER-IP      EXTERNAL-IP  PORT(S)  AGE
authproxy-oauth2-proxy  ClusterIP  10.109.110.219  <none>       80/TCP   0s

==> v1beta2/Deployment
NAME                    DESIRED  CURRENT  UP-TO-DATE  AVAILABLE  AGE
authproxy-oauth2-proxy  1        0        0           0          0s

==> v1/Pod(related)
NAME                                     READY  STATUS             RESTARTS  AGE
authproxy-oauth2-proxy-798cff85fc-pc8x5  0/1    ContainerCreating  0         0s


NOTES:
To verify that oauth2-proxy has started, run:

  kubectl --namespace=kube-system get pods -l "app=oauth2-proxy"

$ # 执行下面的命令待编程 Running 状态证明安装成功了。
$ kubectl --namespace=kube-system get pods -l "app=oauth2-proxy"
NAME                                     READY     STATUS    RESTARTS   AGE
authproxy-oauth2-proxy-cdb4f675b-wvdg5   1/1       Running   0          1m
```

> 对于 GitHub，我们可以通过`github-org`和`github-team`来限制访问，一般设置`email-doamin="*"`，我们可以通过`OAuth2 Proxy`的[示例文档](https://github.com/pusher/oauth2_proxy#github-auth-provider)来查看更改 GitHub Provider 的配置。

### 测试
同样我们这里还是使用一个 Jenkins 服务，大家也可以使用任意的一个服务来验证，当然最好是没有身份验证功能的，比如没有安装 x-pack 的 Kibana。
<!--adsense-text-->
要实现外部服务来进行认证的关键点在于 nginx-ingress-controller 在 annotations 中为我们提供了`auth-url`和`auth-signin`两个注解来允许配置外部身份验证的入口。

> 上面这两个 annotation 需要 nginx-ingress-controller 在 v0.9.0 版本或以上。

我们在 Jenkins 的核心 Ingress 对象中配置服务认证的 url：`https://$host/oauth2/auth`，然后通过创建一个同域的 Ingress 对象将`oauth2`路径代理到`OAuth2 proxy`应用去处理认证服务：
```yaml
nginx.ingress.kubernetes.io/auth-url: "https://$host/oauth2/auth"
nginx.ingress.kubernetes.io/auth-signin: "https://$host/oauth2/start?rd=$escaped_request_uri"
```

然后按照上面的思路重新创建 Jenkins 的两个 Ingress 对象：
```shell
$ cat <<EOF | kubectl apply -f -
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: jenkins
  namespace: kube-ops
  annotations:
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: "true"
    nginx.ingress.kubernetes.io/auth-url: "https://$host/oauth2/auth"
    nginx.ingress.kubernetes.io/auth-signin: "https://$host/oauth2/start?rd=$escaped_request_uri"
spec:
  rules:
  - host: jenkins.qikqiak.com
    http:
      paths:
      - backend:
          serviceName: jenkins
          servicePort: web
        path: /
  tls:
  - hosts:
    - jenkins.qikqiak.com
    secretName: jenkins-tls

---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: authproxy-oauth2-proxy
  namespace: kube-system
  annotations:
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: "true"
spec:
  rules:
  - host: jenkins.qikqiak.com
    http:
      paths:
      - backend:
          serviceName: authproxy-oauth2-proxy
          servicePort: 80
        path: /oauth2
  tls:
  - hosts:
    - jenkins.qikqiak.com
    secretName: jenkins-tls
EOF
```

我们这里通过`cert-manager`来自动为服务添加 HTTPS ，添加了`kubernetes.io/tls-acme=true`这个注解，然后我们在浏览器中打开我们的 Jenkins 服务，正常就会跳转到 GitHub 登录页面了：

![github oauth](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/voQyke.jpg)

然后认证通过后就可以跳转到我们的 Jenkins 服务了：

![jenkins](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/wsnWEN.jpg)

当然除了使用 GitHub 之外，还可以使用其他的 OAuth 认证服务，比如 Google，我们可以根据需要自行去添加即可。

## 相关链接
* [OAuth2 Proxy](https://github.com/pusher/oauth2_proxy)
* [ingress-nginx oauth external auth exmaple](https://github.com/kubernetes/ingress-nginx/tree/master/docs/examples/auth/oauth-external-auth)
* [Kubernetes Helm 初体验](https://www.qikqiak.com/post/first-use-helm-on-kubernetes/)
* [使用 Let's Encrypt 实现 Kubernetes Ingress 自动化 HTTPS](https://www.qikqiak.com/automatic-kubernetes-ingress-https-with-lets-encrypt/)

## 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](https://www.qikqiak.com/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
