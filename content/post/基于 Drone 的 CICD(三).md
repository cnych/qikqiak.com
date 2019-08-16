---
title: Drone 结合 Helm 部署 Kubernetes 应用
subtitle: 基于 Drone 的 CI/CD（三）
date: 2019-08-07
tags: ["kubernetes", "devops", "drone", "CI", "CD", "github", "helm"]
keywords: ["kubernetes", "devops", "drone", "CI", "CD", "github", "动态", "helm"]
slug: drone-with-k8s-3
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1551949730-c0b55d675af1.jpeg", desc: "Here we go for a photo, above the clouds."}]
category: "kubernetes"
---

本文是 [Drone 系列文章](/tags/drone/)的第三篇，在[第一篇文章中我们介绍了如何在 Kubernetes 集群中使用 Helm 来快速安装 Drone](/post/drone-with-k8s-1/)，并且用 [cert-manager](/post/automatic-kubernetes-ingress-https-with-lets-encrypt/) 给 Drone 应用做了自动化 HTTPS，在[第二篇文章中我们介绍了如何在 Drone 中使用 Pipeline 来自动化构建 Docker 镜像](/post/drone-with-k8s-2/)

本文我们将创建一个 Helm Chart 包，然后使用 Drone Pipeline 来进行自动部署或更新应用到 Kubernetes 集群中。

如果对 Helm 如何部署应用还不熟悉的，同样的，可以查看我们前面的 [Helm 系列文章](/tags/helm/)

<!--more-->

## Helm Chart
在我们的项目[https://github.com/cnych/drone-k8s-demo](https://github.com/cnych/drone-k8s-demo)根目录下面创建一个 Helm Chart 包：
```shell
$ helm create drone-k8s-demo
Creating drone-k8s-demo
$ mv drone-k8s-demo helm  # 将根目录重命名为helm
```

对 Helm Chart 比较熟悉的应该清楚上面的`helm create`命令会创建一个基本的 chart 包，包含两个文件夹和两个文件：

* `charts/`目录主要是用来存放当前 chart 的一些依赖
* `templates/`目录就是来存放我们的 chart 模板的文件夹，然后和外面的 values.yaml 一起渲染成最终的 Kubernetes 资源清单文件
* `Charts.yaml`是当前 Chart 包的一些 Meta 信息
* `values.yaml`是当前 Chart 包的默认的 values 值。

创建完成后项目的结构如下所示：
```shell
$ tree
.
├── Dockerfile
├── README.md
├── go.mod
├── go.sum
├── helm
│   ├── Chart.yaml
│   ├── charts
│   ├── templates
│   │   ├── NOTES.txt
│   │   ├── _helpers.tpl
│   │   ├── deployment.yaml
│   │   ├── ingress.yaml
│   │   └── service.yaml
│   └── values.yaml
└── main.go

6 directories, 19 files
```

接下来我们就根据我们项目自己的实际情况去修改 values.yaml 和 templates/ 下面的模板。实际上我们这里的项目很简单，`helm create`命令创建的默认 chart 已经非常友好了，我们可以在模板文件中查看到`metadata`部分基本上都是相同的内容：
```yaml
metadata:
  name: {{ include "drone-k8s-demo.fullname" . }}
  labels:
    app: {{ include "drone-k8s-demo.name" . }}
    chart: {{ include "drone-k8s-demo.chart" . }}
    release: {{ .Release.Name }}
    heritage: {{ .Release.Service }}
```

这样可以确保我们无论部署多少次，应用都不会出现资源冲突，这基本上算是编写 Chart 包的一种最佳实践方式。

### Values 文件
我们可以查看默认的`values.yaml`文件内容：
```yaml
replicaCount: 1
image:
  repository: nginx
  tag: stable
  pullPolicy: IfNotPresent
nameOverride: ""
fullnameOverride: ""
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: false
  annotations: {}
  path: /
  hosts:
    - chart-example.local
  tls: []
  #  - secretName: chart-example-tls
  #    hosts:
  #      - chart-example.local
resources: {}
nodeSelector: {}
tolerations: []
affinity: {}
```

上面这些 values 值都是模板中直接或间接使用到的，我们可以根据自己的需要去覆盖这些值，比如要使用我们自己镜像，就去覆盖`image`字段的内容，镜像的地址当然就是上节课我们在 Drone Pipeline 里面最终打包成的镜像地址：
```yaml
image:
  repository: cnych/drone-k8s-demo
  tag: latest
  pullPolicy: Always
```

要注意我们将 pullPolicy 设置为了`Always`，这是因为我们的镜像标签是`latest`，所以当更新的时候需要强制去拉取镜像。

### 模板文件
在上一篇文章中我们创建的 Web 服务里面添加了一个`/health`的路径，所以我们可以用这个路径来做健康检查，在默认生成的模板中 deployment.yaml 文件里面默认就有 liveness probe 和 rediness probe 的配置，只是我们需要将检查的路径更改为`/health`，如下所示：
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: http
readinessProbe:
  httpGet:
    path: /health
    port: http
```

当探针检查到`/health`路由的请求返回一个非 200 的状态码的时候，Kubernetes 就会认为应用是不健康的状态，liveness probe 检测到就会自动重启 Pod，readiness probe 检测到就会将当前 Pod 从 Service 的 Endpoints 列表中移除，确保 Service 中都是可以正常接收请求的 Pod。

除此之外，我们的应用是暴露在 8080 端口上的，所以我们也需要将 Deployment 下面的端口号更改：
```yaml
ports:
- name: http
  containerPort: 8080
  protocol: TCP
```

然后我们可以去调试下，查看我们的更改是否符号我们的期望，我们可以用`helm install --dry-run --debug`命令来渲染资源清单文件，但不会真正的部署到集群中去：
```shell
$ helm install --dry-run --debug --name staging --namespace kube-ops helm/
[debug] Created tunnel using local port: '64832'

[debug] SERVER: "127.0.0.1:64832"

......
# Source: drone-k8s-demo/templates/deployment.yaml
apiVersion: apps/v1beta2
kind: Deployment
metadata:
  name: staging-drone-k8s-demo
  labels:
    app: drone-k8s-demo
    chart: drone-k8s-demo-0.1.0
    release: staging
    heritage: Tiller
spec:
  replicas: 1
  selector:
    matchLabels:
      app: drone-k8s-demo
      release: staging
  template:
    metadata:
      labels:
        app: drone-k8s-demo
        release: staging
    spec:
      containers:
        - name: drone-k8s-demo
          image: "cnych/drone-k8s-demo:latest"
          imagePullPolicy: Always
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
          livenessProbe:
            httpGet:
              path: /health
              port: http
          readinessProbe:
            httpGet:
              path: /health
              port: http
          resources:
            {}
```

上面就是通过 values.yaml 文件中的值渲染出来的真正的 Deployment 资源对象，我们可以看到镜像地址和端口以及健康检测的内容都是符合我们的预期的。

然后查看模板文件中的 Service.yaml 文件：
```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "drone-k8s-demo.fullname" . }}
  labels:
    app: {{ include "drone-k8s-demo.name" . }}
    chart: {{ include "drone-k8s-demo.chart" . }}
    release: {{ .Release.Name }}
    heritage: {{ .Release.Service }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app: {{ include "drone-k8s-demo.name" . }}
    release: {{ .Release.Name }}
```

该模板文件我们不需要做任何更改，唯一需要注意的说 ports 部分的 targetPort 是 http，而不是一个具体的端口号，这有一个好处就是 Pod 中端口号变了，我们也不需要更改 Service 这边的 targetPort，我们刚刚不是更改了端口号为 8080 吗？这个的 http 就是对应的 Pod 里面的端口名称，另一个就是 selector 部分，是和 Pod 模板里面的 label 标签一致的。
<!--adsense-text-->
然后就是如果通过 Ingress 对象来暴露我们的服务，就需要配置 Ingress 对象：
```
{{- if .Values.ingress.enabled -}}
......
{{- end }}
```

查看模板可以看出只要在 values 中设置 ingress.enabled=true 就会开启 Ingress 对象，到这里我们可以在`helm`目录下面创建一个 my-values.yaml 的文件，用来覆盖默认的 values 文件：
```yaml
image:
  repository: cnych/drone-k8s-demo
  tag: latest
  pullPolicy: Always

ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
  path: /
  hosts:
    - drone-k8s-demo.local

resources:
  limits:
    cpu: 50m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 128Mi
```

当然同样的，我们可以通过上面的命令来调试渲染模板：
```shell
$ helm install --dry-run --debug --name staging --namespace kube-ops -f helm/my-values.yaml helm/
```

这样我们的 Chart 包就准备好了。

## Pipeline
到这里我们就需要在前面文章的 Pipeline 中来添加一个步骤，用来安装我们这里的 Chart 包了，我们知道 Drone Pipeline 的每个步骤都是在一个容器中去执行的，那么我们要去使用 Helm 来安装我们的应用，自然需要容器里面有 helm 的命令，并且要能够和我们的 Kubernetes 集群进行联通，当然我们完全可以自己做一个镜像，把 helm 命令和连接集群的配置文件都内置到里面去，但这样显然也不是很灵活，不具有通用性，实际上 Drone 的插件机制非常简单粗暴，我们可以在 Drone 的插件页面找到和 Helm 相关的插件：[http://plugins.drone.io/ipedrazas/drone-helm/](http://plugins.drone.io/ipedrazas/drone-helm/)，这个插件的基本用法如下：
```yaml
pipeline:
  helm_deploy:
    image: quay.io/ipedrazas/drone-helm
    skip_tls_verify: true
    chart: ./charts/my-chart
    release: ${DRONE_BRANCH}
    values: secret.password=${SECRET_PASSWORD},image.tag=${TAG}
    prefix: STAGING
    namespace: development
```

这个 Pipeline 实际上相当于执行下面的命令：
```shell
$ helm upgrade --install ${DRONE_BRANCH} ./charts/my-chart --namespace development --set secret.password=${SECRET_PASSWORD},image.tag=${TAG}
```

另外我们可以通过指定 `API_SERVER`、`KUBERNETES_TOKEN` 以及 `KUBERNETES_CERTIFICATE` 这三个环境变量来指定连接 Kubernetes 集群的信息，同样的，我们到 drone 页面的项目设置下面添加这三个 secret，API_SERVER 就是我们集群的 APIServer 地址，那么 TOKEN 呢？这个 TOKEN 其实之前文章中我们已经反复提到过了，我们可以创建一个 ServiceAccount，去绑定一个 cluster-admin 的集群角色权限，然后获取这个 ServiceAccount 对应的 TOKEN 即可，比如我们 Helm 的服务端 Tiller 服务对应的 ServiceAccount，我们可以这样来获取：
```shell
$ kubectl -n kube-system get secrets | grep tiller
tiller-token-z4f6k                               kubernetes.io/service-account-token   3      115d
$ kubectl get secret tiller-token-z4f6k -o jsonpath={.data.token} -n kube-system | base64 --decode
eyJhbGciOiJSUzI1NiIsImtpZCI6IiJ9.xxxxx.jO7vEZCzLbtBg
```

证书信息同样可以通过上面的 secret 来获取：
```shell
$ kubectl get secret tiller-token-z4f6k -o jsonpath={.data.ca\\.crt} -n kube-system
xxxxxxx
```

要注意证书信息不需要用 base64 解码。然后将 apiserver 和 token 已经 ca 证书信息 添加到 drone 项目的 secret 里面：
![drone add helm plugin secret](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/drone-add-helm-secret.png)

最后我们用于部署 helm 的 pipeline 内容如下：
```yaml
- name: deploy
  image: quay.io/ipedrazas/drone-helm
  environment:
    STABLE_REPO_URL: https://mirror.azure.cn/kubernetes/charts/
    SERVICE_ACCOUNT: tiller
    API_SERVER:
      from_secret: api_server
    KUBERNETES_TOKEN:
      from_secret: kubernetes_token
    KUBERNETES_CERTIFICATE:
      from_secret: kubernetes_ca
  settings:
    client-only: true
    wait: true
    recreate_pods: true
    chart: ./helm
    release: drk8d
    values_files: ["./helm/my-values.yaml"]
    namespace: kube-ops
  when:
    event: push
    branch: master
```

通过 chart 字段指定 chart 模板的目录， values_files 指定用于部署的 values 文件，release 就是指定安装的应用名称。

> 另外需要注意得是该 helm 插件使用的 helm cli 为 v2.14.1 版本，所以如果和服务器版本不兼容的话，需要将服务器 tiller 的镜像版本升级为 v2.14.1，可以使用我提供的镜像`cnych/tiller:v2.14.1`，插件的参数需要放置到`settings`下面去。

现在我们将添加的 chart 包以及部署的步骤提交到 GitHub 中去，在 Drone 页面上就可以看到构建过程了：
![dron helm deploy](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/drone-helm-deploy.png)

然后在本地 /etc/hosts 里面添加上域名 drone-k8s-demo.local 和 nginx-ingress 的 Pod 所在节点的映射，就可以通过域名访问应用了：
```shell
$ kubectl get all -l release=drk8d -n kube-ops 
NAME                                        READY   STATUS    RESTARTS   AGE
pod/drk8d-drone-k8s-demo-55bbcf5f8c-ddmz2   1/1     Running   0          9m17s

NAME                           TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE
service/drk8d-drone-k8s-demo   ClusterIP   10.96.9.206   <none>        80/TCP    9m17s

NAME                                   READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/drk8d-drone-k8s-demo   1/1     1            1           9m17s

NAME                                              DESIRED   CURRENT   READY   AGE
replicaset.apps/drk8d-drone-k8s-demo-55bbcf5f8c   1         1         1       9m17s

$ curl http://drone-k8s-demo.local/health
{"health":true}
```

到这里我们就实现了在 Drone 中通过 Helm 部署我们的应用到 Kubernetes 集群中，不过需要注意的是 drone-helm 这个插件的官方文档有一些问题，如果在部署过程中遇到了一些问题，可以通过查看对应的源码来解决，仓库地址为：[https://github.com/ipedrazas/drone-helm](https://github.com/ipedrazas/drone-helm)。

完整的项目示例代码可以在 [https://github.com/cnych/drone-k8s-demo](https://github.com/cnych/drone-k8s-demo) 获取。

关于 Drone Pipeline 的一些细节使用方法以及插件机制，在后面的文章中再和大家探讨，总体来说 Drone 比 Jenkins 更加轻量级，在使用上更接近 GitLab CI，而且 Drone 的插件机制非常简单粗暴，我们也可以很容易根据自己的需求来包装一个插件。

<!--adsense-self-->
