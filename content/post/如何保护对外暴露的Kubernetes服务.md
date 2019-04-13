---
title: 如何保护对外暴露的 Kubernetes 服务
date: 2019-04-13
tags: ["kubernetes", "traefik", "nginx", "ingress", "oauth"]
keywords: ["kubernetes", "traefik", "nginx", "ingress", "oauth", "basic auth"]
slug: how-to-protect-exposed-k8s-server
gitcomment: true
bigimg: [{src: "https://ws4.sinaimg.cn/large/006tNc79gy1g1zqfxynhpj31dp0u01kx.jpg", desc: "devops"}]
category: "kubernetes"
draft: true
---

有时候我们需要在 Kubernetes 中暴露一些没有任何安全验证机制的服务，比如没有安装 xpack 的 Kibana，没有开启登录认证的 Jenkins 服务之类的，我们也想通过域名来进行访问，比较域名比较方便，更主要的是对于 Kubernetes 里面的服务，通过 Ingress 暴露一个服务太方便了，而且还可以通过 cert-manager 来自动的完成`HTTPS`化。所以就非常有必要对这些服务进行一些安全验证了。

## Basic Auth 认证
我们在前面升级 Dashboard 的文章中就给大家提到过两种方式来为我们的服务添加 Basic Auth 认证：haproxy/nginx 和 traefik/nginx-ingress。

使用 haproxy/nginx 的方式非常简单，就是直接添加 basic auth 认证，然后将请求转发到后面的服务；而 traefik/nginx-ingress 都直接提供了 basic auth 的支持，我们这里使用 traefik 来为 Jenkins 服务添加一个 basic auth 的认证服务。

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

最后，我们需要在 Ingress 对象中添加`auth-type：basic`和`auth-secret：system-basic-auth`两个 annotations：（ingress.yaml）
```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: jenkins
  namespace: kube-ops
  annotations:
    kubernetes.io/ingress.class: traefik
    ingress.kubernetes.io/auth-type: basic
    ingress.kubernetes.io/auth-secret: jenkins-basic-auth
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

![jenkins basic auth](https://ws2.sinaimg.cn/large/006tNc79gy1g213ot1nyjj314y0qy422.jpg)


## OAuth 认证
除了上面的 Basic Auth 认证方式以为，我们还可以通过 Github、Google 等提供的 OAuth 服务来进行身份验证。我们可以通过名为`OAuth2 Proxy`的工具来代理请求，它通过提供一个外部身份验证的反向代理来实现，使用起来也相对简单。

### 安装
首先我们需要为我们的应用添加自动的 HTTPS，可以参考我们前面的文章[使用 Let's Encrypt 实现 Kubernetes Ingress 自动化 HTTPS](https://www.qikqiak.com/post/automatic-kubernetes-ingress-https-with-lets-encrypt/)。

然后登录 Github，在[https://github.com/settings/applications/new](https://github.com/settings/applications/new)添加一个新的`OAuth`应用程序：

![register github app](https://ws4.sinaimg.cn/large/006tNc79gy1g2142eks7wj317y0u0ae7.jpg)

替换成你自己需要使用的域名，然后在回调 URL 上添加`/oauth2`，点击注册后，记录下应用详细页面`Client ID`和`Client Secret`的值。然后还需要生成一个 cookie 密钥，当然如果我们系统中安装了 python 环境可以直接生成，没有的话用 Docker 容器运行当然也行：
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

ingress.kubernetes.io/auth-url: https://example.com

现在有一个很小的问题。不确定这是一个错误还是设计错误。您需要为两个服务（Kibana和OAuth2代理）创建两个入口资源，但要在同一FQDN上可用。否则你最终将使用auth循环，GitHub将阻止你一段时间。我没有时间深入研究它。

Kibana路径将打开\，OAuth2打开\oauth2，同一个域。这部分是配置Nginx ingress首先将请求路由到auth服务：

nginx.ingress.kubernetes.io/auth-url: "https://$host/oauth2/auth"
nginx.ingress.kubernetes.io/auth-signin: "https://$host/oauth2/start?rd=$request_uri"
并且您将仅向Kibana入口添加上述注释。

我可以直接使用Helm创建入口资源，但如果我手动执行它，您将更容易理解。让我们用kubectl创建两个入口资源：

⚡ cat <<EOF | kubectl create -f -
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: kibana-test
  annotations:
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: "true"
    nginx.ingress.kubernetes.io/auth-url: "https://\$host/oauth2/auth"
    nginx.ingress.kubernetes.io/auth-signin: "https://\$host/oauth2/start?rd=\$request_uri"
spec:
  rules:
  - host: kibana.test.akomljen.com
    http:
      paths:
      - backend:
          serviceName: kibana-test
          servicePort: 5601
        path: /
  tls:
  - hosts:
    - kibana.test.akomljen.com
    secretName: kibana-tls
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: authproxy-oauth2-proxy
  namespace: ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    kubernetes.io/tls-acme: "true"
spec:
  rules:
  - host: kibana.test.akomljen.com
    http:
      paths:
      - backend:
          serviceName: authproxy-oauth2-proxy
          servicePort: 80
        path: /oauth2
  tls:
  - hosts:
    - kibana.test.akomljen.com
    secretName: kibana-tls
EOF
kibana.test.akomljen.com将可通过HTTPS访问。打开您为Kibana配置为入口主机的URL，系统会提示您使用GitHub登录屏幕：


如果要向OAuth代理添加更多服务，可以编辑其入口并添加其他主机。

摘要
Cloud Native工具再次使事情变得更容易。人们只是喜欢，当你可以快速提供工作的东西和OAuth代理没有什么不同。一些基本的安全性肯定更容易。请继续关注下一个。