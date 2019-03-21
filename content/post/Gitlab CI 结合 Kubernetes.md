---
title: Gitlab CI 与 Kubernetes 的结合
subtitle: 基于 Gitlab CI 和 Kubernetes 的 CI/CD
date: 2019-03-21
tags: ["kubernetes", "gitlab", "ci"]
keywords: ["kubernetes", "gitlab", "ci", "CI/CD", "runner"]
slug: gitlab-ci-k8s-cluster-feature
gitcomment: true
bigimg: [{src: "https://ws3.sinaimg.cn/large/006tKfTcgy1g1aj3z02c3j315o0rs120.jpg", desc: "STEP"}]
category: "kubernetes"
---

上节课我们将 [Gitlab CI Runner 安装到了 Kubernetes](/post/gitlab-runner-install-on-k8s/) 集群中，接下来看看如何结合 Kubernetes 和 Gitlab CI 进行持续集成和持续部署。

<!--more-->

### 基本配置

首先将本节所用到的代码库从 Github 上获得：[cnych/gitlab-ci-k8s-demo](https://github.com/cnych/gitlab-ci-k8s-demo)，可以在 Gitlab 上新建一个项目导入该仓库，当然也可以新建一个空白的仓库，然后将 Github 上面的项目 Clone 到本地后，更改远程仓库地址即可：
```shell
$ git clone https://github.com/cnych/gitlab-ci-k8s-demo.git
$ cd gitlab-ci-k8s-demo
# Change the remote of the repository
$ git remote set-url origin ssh://git@git.qikqiak.com:30022/root/gitlab-ci-k8s-demo.git
# Now to push/"import" the repository run:
$ git push -u origin master
```

当我们把仓库推送到 Gitlab 以后，应该可以看到 Gitlab CI 开始执行构建任务了:
![gitlab ci](https://ws2.sinaimg.cn/large/006tKfTcgy1g1929udcvuj31mg0owq5b.jpg)

此时 Runner Pod 所在的 namespace 下面也会出现两个新的 Pod：
```shell
$ kubectl get pods -n kube-ops
NAME                                           READY     STATUS              RESTARTS   AGE
gitlab-7bff969fbc-k5zl4                        1/1       Running             0          4d
gitlab-ci-runner-0                             1/1       Running             0          4m
gitlab-ci-runner-1                             1/1       Running             0          4m
runner-9rixsyft-project-2-concurrent-06g5w4    0/2       ContainerCreating   0          4m
runner-9rixsyft-project-2-concurrent-1t74t9    0/2       ContainerCreating   0          4m
......
```

这两个新的 Pod 就是用来执行具体的 Job 任务的，这里同时出现两个证明第一步是并行执行的两个任务，从上面的 Pipeline 中也可以看到是 test 和 test2 这两个 Job。我们可以看到在执行 image_build 任务的时候出现了错误：

![pipeline](https://ws2.sinaimg.cn/large/006tKfTcgy1g19369pzotj31m20emwg4.jpg)

我们可以点击查看这个 Job 失败详细信息：
```shell
$ docker login -u "${CI_REGISTRY_USER}" -p "${CI_REGISTRY_PASSWORD}" "${CI_REGISTRY}"
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Error response from daemon: Get https://registry-1.docker.io/v2/: unauthorized: incorrect username or password
ERROR: Job failed: command terminated with exit code 1
```

出现上面的错误是因为我们并没有在 Gitlab 中开启 Container Registry，所以环境变量中并没有这些值，还记得前面章节中我们安装的 [Harbor](https://www.qikqiak.com/tags/harbor/)吗？我们这里使用 [Harbor](https://www.qikqiak.com/tags/harbor/) 来作为我们的镜像仓库，这里我们只需要把 [Harbor](https://www.qikqiak.com/tags/harbor/) 相关的配置以参数的形式配置到环境中就可以了。

定位到项目 -> 设置 -> CI/CD，展开`Environment variables`栏目，配置镜像仓库相关的参数值：

![gitlab ci env](https://ws1.sinaimg.cn/large/006tKfTcgy1g19duem1bdj31jc0m6jvl.jpg)


配置上后，我们在上面失败的 Job 任务上点击“重试”，在重试过后依然可以看到会出现下面的错误信息：
```shell
$ docker login -u "${CI_REGISTRY_USER}" -p "${CI_REGISTRY_PASSWORD}" "${CI_REGISTRY}"
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Error response from daemon: Get https://registry.qikqiak.com/v2/: x509: certificate signed by unknown authority
ERROR: Job failed: command terminated with exit code 1
```

从错误信息可以看出这是因为登录私有镜像仓库的时候证书验证错误，因为我们根本就没有提供任何证书，所以肯定会失败的，还记得我们之前在介绍 Harbor 的时候的解决方法吗？第一种是在 Docker 的启动参数中添加上`insecure-registries`，另外一种是在目录`/etc/docker/certs.d/`下面添加上私有仓库的 CA 证书，同样，我们只需要在 dind 中添加 insecure 的参数即可：
```yaml
services:
- name: docker:dind
  command: ["--insecure-registry=registry.qikqiak.com"]
```

> 其中`registry.qikqiak.com`就是我们之前配置的私有镜像仓库地址。

然后保存`.gitlab-ci.yml`文件，重新提交到代码仓库，可以看到又触发了正常的流水线构建了，在最后的阶段`deploy_review`仍然可以看到失败了，这是因为在最后的部署阶段我们使用`kubectl`工具操作集群的时候并没有关联上任何集群。

我们在 Gitlab CI 中部署阶段使用到的镜像是`cnych/kubectl`，该镜像的`Dockerfile`文件可以在仓库 [cnych/docker-kubectl](https://github.com/cnych/docker-kubectl) 中获取：
```yaml
FROM alpine:3.8

MAINTAINER cnych <icnych@gmail.com>

ENV KUBE_LATEST_VERSION="v1.13.4"

RUN apk add --update ca-certificates \
 && apk add --update -t deps curl \
 && apk add --update gettext \
 && apk add --update git \
 && curl -L https://storage.googleapis.com/kubernetes-release/release/${KUBE_LATEST_VERSION}/bin/linux/amd64/kubectl -o /usr/local/bin/kubectl \
 && chmod +x /usr/local/bin/kubectl \
 && apk del --purge deps \
 && rm /var/cache/apk/*

 ENTRYPOINT ["kubectl"]
 CMD ["--help"]
```

我们知道`kubectl`在使用的时候默认会读取当前用户目录下面的`~/.kube/config`文件来链接集群，当然我们可以把连接集群的信息直接内置到上面的这个镜像中去，这样就可以直接操作集群了，但是也有一个不好的地方就是不方便操作，假如要切换一个集群还得重新制作一个镜像。所以一般我们这里直接在 Gitlab 上配置集成 Kubernetes 集群。

在项目页面点击`Add Kubernetes Cluster` -> `Add existing cluster`：

1.Kubernetes cluster name 可以随便填

2.API URL 是你的集群的`apiserver`的地址， 一般可以通过输入`kubectl cluster-info `获取，Kubernetes master 地址就是需要的
```shell
$ kubectl cluster-info
Kubernetes master is running at https://10.151.30.11:6443
KubeDNS is running at https://10.151.30.11:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

3.CA证书、Token、项目命名空间

对于我们这个项目准备部署在一个名为`gitlab`的 namespace 下面，所以首先我们需要到目标集群中创建一个 namespace:
```shell
$ kubectl create ns gitlab
```

由于我们在部署阶段需要去创建、删除一些资源对象，所以我们也需要对象的 RBAC 权限，这里为了简单，我们直接新建一个 ServiceAccount，绑定上一个`cluster-admin`的权限：(gitlab-sa.yaml)
```yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gitlab
  namespace: gitlab

---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: gitlab
  namespace: gitlab
subjects:
  - kind: ServiceAccount
    name: gitlab
    namespace: gitlab
roleRef:
  kind: ClusterRole
  name: cluster-admin
```

然后创建上面的 ServiceAccount 对象：
```shell
$ kubectl apply -f sa.yaml
serviceaccount "gitlab" created
clusterrolebinding.rbac.authorization.k8s.io "gitlab" created
```

可以通过上面创建的 ServiceAccount 获取 CA 证书和 Token：
```shell
$ kubectl get serviceaccount gitlab -n gitlab -o json | jq -r '.secrets[0].name'
gitlab-token-f9zp7

# 然后根据上面的Secret找到CA证书
$ kubectl get secret gitlab-token-f9zp7 -n gitlab -o json | jq -r '.data["ca.crt"]' | base64 -d
xxxxxCA证书内容xxxxx

# 当然要找到对应的 Token 也很简单
$ kubectl get secret gitlab-token-f9zp7  -n gitlab -o json | jq -r '.data.token' | base64 -d
xxxxxxtoken值xxxx
```

填写上面对应的值添加集群：

![add k8s cluster](https://ws1.sinaimg.cn/large/006tKfTcgy1g1a6lrep5yj31160u0af9.jpg)



### .gitlab-ci.yml

现在 Gitlab CI 的环境都准备好了，我们可以来看下用于描述 Gitlab CI 的`.gitlab-ci.yml`文件。

一个 Job 在`.gitlab-ci.yml`文件中一般如下定义：
```yaml
# 运行golang测试用例
test:
  stage: test
  script:
    - go test ./...
```

上面这个 Job 会在 test 这个 Stage 阶段运行。

为了指定运行的 Stage 阶段，可以在`.gitlab-ci.yml`文件中放置任意一个简单的列表：
```yaml
# 所有 Stage
stages:
  - test
  - build
  - release
  - deploy
```

你可以指定用于在全局或者每个作业上执行命令的镜像：
```yaml
# 对于未指定镜像的作业，会使用下面的镜像
image: golang:1.10.3-stretch
# 或者对于特定的job使用指定的镜像
test:
  stage: test
  image: python:3
  script:
    - echo Something in the test step in a python:3 image
```

> 对于`.gitlab-ci.yml`文件的的其他部分，请查看如下文档介绍：[https://docs.gitlab.com/ce/ci/yaml/README.html](https://docs.gitlab.com/ce/ci/yaml/README.html)。

在我们当前的项目中定义了 4 个构建阶段：test、build、release、review、deploy，完整的`.gitlab-ci.yml`文件如下：
```yaml
image:
  name: golang:1.10.3-stretch
  entrypoint: ["/bin/sh", "-c"]

# 为了能够使用go get，需要将代码放在 $GOPATH 中，比如你的 gitlab 域名是 mydomain.com，你的代码仓库是 repos/projectname，默认的 GOPATH 是 /go，然后你就需要将你的代码放置到 GOPATH 下面，/go/src/mydomain.com/repos/projectname，用一个软链接指过来就可以了
before_script:
  - mkdir -p "/go/src/git.qikqiak.com/${CI_PROJECT_NAMESPACE}"
  - ln -sf "${CI_PROJECT_DIR}" "/go/src/git.qikqiak.com/${CI_PROJECT_PATH}"
  - cd "/go/src/git.qikqiak.com/${CI_PROJECT_PATH}/"

stages:
  - test
  - build
  - release
  - review
  - deploy

test:
  stage: test
  script:
    - make test

test2:
  stage: test
  script:
    - sleep 3
    - echo "We did it! Something else runs in parallel!"

compile:
  stage: build
  script:
    # 添加所有的依赖，或者使用 glide/govendor/...
    - make build
  artifacts:
    paths:
      - app

image_build:
  stage: release
  image: docker:latest
  variables:
    DOCKER_DRIVER: overlay
    DOCKER_HOST: tcp://localhost:2375
  services:
    - name: docker:17.03-dind
      command: ["--insecure-registry=registry.qikqiak.com"]
  script:
    - docker info
    - docker login -u "${CI_REGISTRY_USER}" -p "${CI_REGISTRY_PASSWORD}" registry.qikqiak.com
    - docker build -t "${CI_REGISTRY_IMAGE}:latest" .
    - docker tag "${CI_REGISTRY_IMAGE}:latest" "${CI_REGISTRY_IMAGE}:${CI_COMMIT_REF_NAME}"
    - test ! -z "${CI_COMMIT_TAG}" && docker push "${CI_REGISTRY_IMAGE}:latest"
    - docker push "${CI_REGISTRY_IMAGE}:${CI_COMMIT_REF_NAME}"

deploy_review:
  image: cnych/kubectl
  stage: review
  only:
    - branches
  except:
    - tags
  environment:
    name: dev
    url: https://dev-gitlab-k8s-demo.qikqiak.com
    on_stop: stop_review
  script:
    - kubectl version
    - cd manifests/
    - sed -i "s/__CI_ENVIRONMENT_SLUG__/${CI_ENVIRONMENT_SLUG}/" deployment.yaml ingress.yaml service.yaml
    - sed -i "s/__VERSION__/${CI_COMMIT_REF_NAME}/" deployment.yaml ingress.yaml service.yaml
    - |
      if kubectl apply -f deployment.yaml | grep -q unchanged; then
          echo "=> Patching deployment to force image update."
          kubectl patch -f deployment.yaml -p "{\"spec\":{\"template\":{\"metadata\":{\"annotations\":{\"ci-last-updated\":\"$(date +'%s')\"}}}}}"
      else
          echo "=> Deployment apply has changed the object, no need to force image update."
      fi
    - kubectl apply -f service.yaml || true
    - kubectl apply -f ingress.yaml
    - kubectl rollout status -f deployment.yaml
    - kubectl get all,ing -l ref=${CI_ENVIRONMENT_SLUG}

stop_review:
  image: cnych/kubectl
  stage: review
  variables:
    GIT_STRATEGY: none
  when: manual
  only:
    - branches
  except:
    - master
    - tags
  environment:
    name: dev
    action: stop
  script:
    - kubectl version
    - kubectl delete ing -l ref=${CI_ENVIRONMENT_SLUG}
    - kubectl delete all -l ref=${CI_ENVIRONMENT_SLUG}

deploy_live:
  image: cnych/kubectl
  stage: deploy
  environment:
    name: live
    url: https://live-gitlab-k8s-demo.qikqiak.com
  only:
    - tags
  when: manual
  script:
    - kubectl version
    - cd manifests/
    - sed -i "s/__CI_ENVIRONMENT_SLUG__/${CI_ENVIRONMENT_SLUG}/" deployment.yaml ingress.yaml service.yaml
    - sed -i "s/__VERSION__/${CI_COMMIT_REF_NAME}/" deployment.yaml ingress.yaml service.yaml
    - kubectl apply -f deployment.yaml
    - kubectl apply -f service.yaml
    - kubectl apply -f ingress.yaml
    - kubectl rollout status -f deployment.yaml
    - kubectl get all,ing -l ref=${CI_ENVIRONMENT_SLUG}

```

上面的`.gitlab-ci.yml`文件中还有一些特殊的属性，如限制运行的的`when`和`only`参数，例如`only: ["tags"]`表示只为创建的标签运行，更多的信息，我可以通过查看 Gitlab CI YAML 文件查看：[https://docs.gitlab.com/ce/ci/yaml/README.html](https://docs.gitlab.com/ce/ci/yaml/README.html)


由于我们在`.gitlab-ci.yml`文件中将应用的镜像构建完成后推送到了我们的私有仓库，而 Kubernetes 资源清单文件中使用的私有镜像，所以我们需要配置一个`imagePullSecret`，否则在 Kubernetes 集群中是无法拉取我们的私有镜像的：(替换下面相关信息为自己的)
```shell
$ kubectl create secret docker-registry myregistry --docker-server=registry.qikqiak.com --docker-username=xxxx --docker-password=xxxxxx --docker-email=xxxx -n gitlab
secret "myregistry" created
```

在下面的 Deployment 的资源清单文件中会使用到创建的`myregistry`。

接下来为应用创建 Kubernetes 资源清单文件，添加到代码仓库中。首先创建 Deployment 资源：（deployment.yaml）
```yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gitlab-k8s-demo-__CI_ENVIRONMENT_SLUG__
  namespace: gitlab
  labels:
    app: gitlab-k8s-demo
    ref: __CI_ENVIRONMENT_SLUG__
    track: stable
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gitlab-k8s-demo
      ref: __CI_ENVIRONMENT_SLUG__
  template:
    metadata:
      labels:
        app: gitlab-k8s-demo
        ref: __CI_ENVIRONMENT_SLUG__
        track: stable
    spec:
      imagePullSecrets:
        - name: myregistry
      containers:
      - name: app
        image: registry.qikqiak.com/gitdemo/gitlab-k8s:__VERSION__
        imagePullPolicy: Always
        ports:
        - name: http-metrics
          protocol: TCP
          containerPort: 8000
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 3
          timeoutSeconds: 2
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 3
          timeoutSeconds: 2
```

> 注意用上面创建的 myregistry 替换 imagePullSecrets。

这是一个基本的 Deployment 资源清单的描述，像`__CI_ENVIRONMENT_SLUG__`和`__VERSION__`这样的占位符用于区分不同的环境，`__CI_ENVIRONMENT_SLUG__`将由 dev 或 live（环境名称）和`__VERSION__`替换为镜像标签。


为了能够连接到部署的 Pod，还需要 Service。对应的 Service 资源清单如下（service.yaml）：
```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: gitlab-k8s-demo-__CI_ENVIRONMENT_SLUG__
  namespace: gitlab
  labels:
    app: gitlab-k8s-demo
    ref: __CI_ENVIRONMENT_SLUG__
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8000"
    prometheus.io/scheme: "http"
    prometheus.io/path: "/metrics"
spec:
  type: ClusterIP
  ports:
    - name: http-metrics
      port: 8000
      protocol: TCP
  selector:
    app: gitlab-k8s-demo
    ref: __CI_ENVIRONMENT_SLUG__
```

我们的应用程序运行8000端口上，端口名为`http-metrics`，如果你还记得前面我们监控的课程中应该还记得我们使用`prometheus-operator`为 Prometheus 创建了`自动发现`的配置，所以我们在`annotations`里面配置上上面的这几个注释后，Prometheus 就可以自动获取我们应用的监控指标数据了。


现在 Service 创建成功了，但是外部用户还不能访问到我们的应用，当然我们可以把 Service 设置成 NodePort 类型，另外一个常见的方式当然就是使用 Ingress 了，我们可以通过 Ingress 来将应用暴露给外面用户使用，对应的资源清单文件如下：（ingress.yaml）
```yaml
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: gitlab-k8s-demo-__CI_ENVIRONMENT_SLUG__
  namespace: gitlab
  labels:
    app: gitlab-k8s-demo
    ref: __CI_ENVIRONMENT_SLUG__
  annotations:
    kubernetes.io/ingress.class: "traefik"
spec:
  rules:
  - host: __CI_ENVIRONMENT_SLUG__-gitlab-k8s-demo.qikqiak.com
    http:
      paths:
      - path: /
        backend:
          serviceName: gitlab-k8s-demo-__CI_ENVIRONMENT_SLUG__
          servicePort: 8000

```

> 当然如果想配置 https 访问的话我们可以自己用 CA 证书创建一个 tls 密钥，也可以使用`cert-manager`来自动为我们的应用程序添加 https。

当然要通过上面的域名进行访问，还需要进行 DNS 解析的，`__CI_ENVIRONMENT_SLUG__-gitlab-k8s-demo.qikqiak.com`其中`__CI_ENVIRONMENT_SLUG__`值为 live 或 dev，所以需要创建`dev-gitlab-k8s-demo.qikqiak.com` 和 `live-gitlab-k8s-demo.qikqiak.com` 两个域名的解析。


> 我们可以使用 DNS 解析服务商的 API 来自动创建域名解析，也可以使用 [Kubernetes incubator](https://github.com/kubernetes-incubator) 孵化的项目 [external-dns operator](https://github.com/kubernetes-incubator/external-dns) 来进行操作。


所需要的资源清单和`.gitlab-ci.yml`文件已经准备好了，我们可以小小的添加一个文件去触发下 Gitlab CI 构建：
```shell
$ touch test1
$ git add .
$ git commit -m"Testing the GitLab CI functionality #1"
$ git push origin master
```

现在回到 Gitlab 中可以看到我们的项目触发了一个新的 Pipeline 的构建：

![gitlab pipeline](https://ws4.sinaimg.cn/large/006tKfTcgy1g1ag8co9r3j31m80rewhh.jpg)


可以查看最后一个阶段（stage）是否正确，如果通过了，证明我们已经成功将应用程序部署到 Kubernetes 集群中了，一个成功的`review`阶段如下所示：

![review success](https://ws3.sinaimg.cn/large/006tKfTcgy1g1ahimbwmwj315z0u0n6w.jpg)


整个 Pipeline 构建成功后，我们可以在项目的环境菜单下面看到多了一个环境：

![env](https://ws1.sinaimg.cn/large/006tKfTcgy1g1ahkx8gwuj31vm0fatap.jpg)

如果我们点击`终止`，就会调用`.gitlab-ci.yml`中定义的钩子`on_stop: stop_review`，点击`View deployment`就可以看到这次我们的部署结果（前提是DNS解析已经完成）：

![view deployment](https://ws3.sinaimg.cn/large/006tKfTcgy1g1ahq5v4qfj313i0hgtbl.jpg)

这就是关于 Gitlab CI 结合 Kubernetes 进行 CI/CD 的过程，具体详细的构建任务还需要结合我们自己的应用实际情况而定。下节课给大家介绍使用 Jenkins + Gitlab + Harbor + Helm + Kubernetes 来实现一个完整的 CI/CD 流水线作业。

参考链接：[https://edenmal.moe/post/2017/Kubernetes-WYNTK-GitLab-CI-Kubernetes-Presentation/](https://edenmal.moe/post/2017/Kubernetes-WYNTK-GitLab-CI-Kubernetes-Presentation/)

### 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

