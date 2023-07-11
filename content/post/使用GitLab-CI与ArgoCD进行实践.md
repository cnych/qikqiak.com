---
title: 使用 GitLab CI 与 Argo CD 进行 GitOps 实践
date: 2020-07-15
keywords: ["argo", "kubernetes", "gitops"]
tags: ["argo", "gitlab", "gitops", "devops"]
slug: gitlab-ci-argo-cd-gitops
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200715115832.png",
      desc: "https://unsplash.com/photos/0YL3UFYjR_g",
    },
  ]
category: "devops"
---

在现在的云原生世界里面 GitOps 不断的被提及，这种持续交付的模式越来越受到了大家的青睐，我们前面也有文章详细讲解了 GitOps 的相关概念，在网上也可以找到很多关于它的资源，但是关于 GitOps 相关的工作流实践的示例却并不多见，我们这里就将详细介绍一个使用示例，希望对大家实践 GitOps 有所帮助。

<!--more-->

## 介绍

![GitOps Workflow](https://picdn.youdianzhishi.com/images/20200710144852.png)

上图是当前示例中的 GitOps 工作流程。GitLab 和 Argo CD 是两个主要的核心组件：

**Argo CD** 是一个声明式、GitOps 持续交付的 Kubernetes 工具，它的配置和使用分非常简单，并且自带一个简单一用的 Dashboard 页面，更重要的是 Argo CD 支持 kustomzie、helm、ksonnet 等多种工具。应用程序可以通过 Argo CD 提供的 CRD 资源对象进行配置，可以在指定的目标环境中自动部署所需的应用程序。关于 Argo CD 更多的信息可以查看[官方文档](https://argoproj.github.io/argo-cd/)了解更多。

**GitLab CI** 是 GitLab 的持续集成和持续交付的工具，也是非常流行的 CI/CD 工具，相比 Jenkins 更加轻量级，更重要的是和 GitLab 天然集成在一起的，所以非常方便。

## Argo CD 安装

当前前提条件是有一个可用的 Kubernetes 集群，通过 kubectl 可以正常访问集群，为了访问 Argo CD 的 Dashboard 页面，我们可以通过 Ingress 来暴露服务，为此需要在 Kubernetes 中安装一个 Ingress Controller，我这里已经提前安装了 `ingress-nginx`，接下来我们将 Helm3 来安装 Argo CD，关于 Helm 以及 ingress-nginx 的使用我们前面的文章中已经多次提到，这里就不再详细介绍他们的使用了。

首先创建一个 argocd 的命名空间：

```bash
$ kubectl create ns argocd
```

然后添加 argocd 的 chart 仓库地址：

```bash
$ helm repo add argo https://argoproj.github.io/argo-helm
```

接下来我们就可以使用 Helm 安装 Argo CD 了：

```bash
$ helm install argocd -n argocd argo/argo-cd --values values.yaml
```

其中 values.yaml 文件如下所示，用来定制安装的 Argo CD：

```yaml
server:
  ingress:
    enabled: true
    annotations:
      kubernetes.io/ingress.class: "nginx"
      nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
      nginx.ingress.kubernetes.io/ssl-passthrough: "true"
      nginx.ingress.kubernetes.io/backend-protocol: "HTTPS"
    hosts:
      - argocd.k8s.local
```

执行上面的安装命令后，Argo CD 就会被安装在 argocd 命名空间之下，可以在本地 `/etc/hosts` 中添加一个映射，将 [argocd.k8s.local](http://argocd.k8s.local) 映射到 ingress-nginx 所在的节点即可：

```bash
$ helm ls -n argocd
NAME    NAMESPACE       REVISION        UPDATED                                 STATUS    CHART            APP VERSION
argocd  argocd          2               2020-07-10 15:26:38.259258 +0800 CST    deployed  argo-cd-2.5.0    1.6.1
$ kubectl get pods -n argocd
NAME                                             READY   STATUS    RESTARTS   AGE
argocd-application-controller-85c4788ffc-p2m4c   1/1     Running   0          49m
argocd-dex-server-cc65c7546-x78bj                1/1     Running   0          49m
argocd-redis-5f45875bc7-mnx8b                    1/1     Running   0          49m
argocd-repo-server-7bcf647588-h8gtq              1/1     Running   0          49m
argocd-server-7877ff8889-zp7tq                   1/1     Running   0          49m
```

当所有 Pod 变成 Running 状态后，我们就可以通过浏览器访问 Argo CD 的 Dashboard 页面了：

![](https://picdn.youdianzhishi.com/images/20200710161259.png)

默认的用户名为 admin，密码为 server Pod 的名称，可以通过如下所示的命令来获取：

```bash
$ kubectl get pods -n argocd -l app.kubernetes.io/name=argocd-server -o name | cut -d'/' -f 2
argocd-server-7877ff8889-zp7tq
```

用上面的用户名和密码即可登录成功，接下来我们在 GitLab 中来创建示例项目。

![](https://picdn.youdianzhishi.com/images/20200710161420.png)

## GitLab 项目配置

我们这里使用的示例项目是一个 Golang 程序，在页面上显示一个文本信息和 Pod 名称，代码地址：[https://github.com/cnych/gitops-webapp-demo](https://github.com/cnych/gitops-webapp-demo)。我们可以将该项目代码上传到我们自己的 GitLab 上面去，我这里的 GitLab 安装在 Kubernetes 之上，通过配置域名 [git.k8s.local](http://git.k8s.local) 进行访问，调整过后我们本地的代码仓库地址为：[http://git.k8s.local/course/gitops-webapp](http://git.k8s.local/course/gitops-webapp) 。

接下来需要添加一些在 GitLab CI 流水线中用到的环境变量（Settings → CI/CD → Variables）：

- CI_REGISTRY - 镜像仓库地址，值为：[https://index.docker.io/v1/](https://index.docker.io/v1/)
- CI_REGISTRY_IMAGE - 镜像名称，值为：cnych/gitops-webapp
- CI_REGISTRY_USER - Docker Hub 仓库用户名，值为 cnych
- CI_REGISTRY_PASSWORD - Docker Hub 仓库密码
- CI_PASSWORD - Git 仓库访问密码
- CI_USERNAME - Git 仓库访问用户名

![](https://picdn.youdianzhishi.com/images/20200710184849.png)

## Argo CD 配置

现在我们可以开始使用 GitOps 来配置我们的 Kubernetes 中的应用了。Argo CD 自带了一套 CRD 对象，可以用来进行声明式配置，这当然也是推荐的方式，把我们的基础设施作为代码来进行托管，下面是我们为开发和生产两套环境配置的资源清单：

```yaml
# gitops-demo-app.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-app-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: http://git.k8s.local/course/gitops-webapp.git
    targetRevision: HEAD
    path: deployment/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: dev
  syncPolicy:
    automated:
      prune: true
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: web-app-prod
  namespace: argocd
spec:
  project: default
  source:
    repoURL: http://git.k8s.local/course/gitops-webapp.git
    targetRevision: HEAD
    path: deployment/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: prod
  syncPolicy:
    automated:
      prune: true
```

上面定义的 Application 这个资源，就是 Argo CD 用于描述应用的 CRD 对象：

- name：Argo CD 应用程序的名称
- project：应用程序将被配置的项目名称，这是在 Argo CD 中应用程序的一种组织方式
- repoURL：源代码的仓库地址
- targetRevision：想要使用的 git 分支
- path：Kubernetes 资源清单在仓库中的路径
- destination：Kubernetes 集群中的目标

然后同样使用 kubectl 工具直接部署上面的资源对象即可，将会创建两个 Application 类型的对象：

```yaml
$ kubectl apply -f gitops-demo-app.yaml
application.argoproj.io/web-app-dev created
application.argoproj.io/web-app-prod created
$ kubectl get application -n argocd
NAME           AGE
web-app-dev    25s
web-app-prod   24s
```

此时我们再去 Argo CD 的 Dashboard 首页同样将会看到两个 Application 的信息：

![](https://picdn.youdianzhishi.com/images/20200710161727.png)

点击其中一个就可以看到关于应用的详细信息，我们可以在 gitops-webapp 代码仓库的 `deployment/<env>` 目录里面找到资源对象。我们可以看到，在每个文件夹下面都有一个 `kustomization.yaml` 文件，Argo CD 可以识别它，不需要任何其他的设置就可以使用。

由于我们这里的代码仓库是私有的 GitLab，所以我们还需要配置对应的仓库地址，在页面上 Settings → Repositories，点击 `Connect Repo using HTTPS` 按钮：

![](https://picdn.youdianzhishi.com/images/20200710162651.png)

添加我们的代码仓库认证信息：

![](https://picdn.youdianzhishi.com/images/20200710162935.png)

需要注意的是这里默认使用的是 HTTPS，所以我们需要勾选下方的 `Skip server verification`，然后点击上方的 `CONNECT` 按钮添加即可。然后重新同步上面的两个 Application，就可以看到正常的状态了。

## GitLab CI 流水线

接下来我们需要为应用程序创建流水线，自动构建我们的应用程序，推送到镜像仓库，然后更新 Kubernetes 的资源清单文件。

下面的示例并不是一个多么完美的流水线，但是基本上可以展示整个 GitOps 的工作流。开发人员在自己的分支上开发代码，他们分支的每一次提交都会触发一个阶段性的构建，当他们将自己的修改和主分支合并时，完整的流水线就被触发。将构建应用程序，打包成 Docker 镜像，将镜推送到 Docker 仓库，并自动更新 Kubernetes 资源清单，此外，一般情况下将应用部署到生产环境需要手动操作。

<!--adsense-text-->

GitLab CI 中的流水线默认定义在代码仓库根目录下的 `.gitlab-ci.yml` 文件中，在改文件的最上面定义了一些构建阶段和环境变量、镜像以及一些前置脚本：

```yaml
stages:
  - build
  - publish
  - deploy-dev
  - deploy-prod
```

接下来是阶段的定义和所需的任务声明。我们这里的构建过程比较简单，只需要在一个 golang 镜像中执行一个构建命令即可，然后将编译好的二进制文件保存到下一个阶段处理，这一个阶段适合分支的任何变更：

```yaml
build:
  stage: build
  image:
    name: golang:1.13.1
  script:
    - go build -o main main.go
  artifacts:
    paths:
      - main
  variables:
    CGO_ENABLED: 0
```

然后就是构建镜像并推送到镜像仓库，这里我们使用 Kaniko，当然也可以使用 DinD 模式进行构建，只是安全性不高，这里我们可以使用 GIT 提交的 commit 哈希值作为镜像 tag，关于 Docker 镜像仓库的认证和镜像地址信息可以通过项目的参数来进行传递，不过这个阶段只在主分支发生变化时才会触发：

```yaml
publish:
  stage: publish
  image:
    name: cnych/kaniko-executor:v0.22.0
    entrypoint: [""]
  script:
    - echo "{\"auths\":{\"$CI_REGISTRY\":{\"username\":\"$CI_REGISTRY_USER\",\"password\":\"$CI_REGISTRY_PASSWORD\"}}}" > /kaniko/.docker/config.json
    - /kaniko/executor --context $CI_PROJECT_DIR --dockerfile ./Dockerfile --destination $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  dependencies:
    - build
  only:
    - master
```

下一个阶段就是将应用程序部署到开发环境中，在 GitOps 中就意味着需要更新 Kubernetes 的资源清单，这样 Argo CD 就可以拉取更新的版本来部署应用。这里我们使用了为项目定义的环境变量，包括用户名和 TOKEN，此外在提交消息里面增加 `[skip ci]` 这样的关键字，这样流水线就不会被触发：

```yaml
deploy-dev:
  stage: deploy-dev
  image: cnych/kustomize:v1.0
  before_script:
    - git remote set-url origin http://${CI_USERNAME}:${CI_PASSWORD}@git.k8s.local/course/gitops-webapp.git
    - git config --global user.email "gitlab@git.k8s.local"
    - git config --global user.name "GitLab CI/CD"
  script:
    - git checkout -B master
    - cd deployment/dev
    - kustomize edit set image $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
    - cat kustomization.yaml
    - git commit -am '[skip ci] DEV image update'
    - git push origin master
  only:
    - master
```

最后添加一个部署到 prod 环境的阶段，和前面非常类似，只是添加了一个手动操作的流程：

```yaml
deploy-prod:
  stage: deploy-prod
  image: cnych/kustomize:v1.0
  before_script:
    - git remote set-url origin http://${CI_USERNAME}:${CI_PASSWORD}@git.k8s.local/course/gitops-webapp.git
    - git config --global user.email "gitlab@git.k8s.local"
    - git config --global user.name "GitLab CI/CD"
  script:
    - git checkout -B master
    - git pull origin master
    - cd deployment/prod
    - kustomize edit set image $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA
    - cat kustomization.yaml
    - git commit -am '[skip ci] PROD image update'
    - git push origin master
  only:
    - master
  when: manual
```

这样我们就完成了整个流水线的定义。

## 使用

接下来我们来看看它们是如何一起工作的。我们将开发和线上两个环境的应用分别部署在了 dev 和 prod 命名空间之下，通过 Ingress 暴露服务，同样需要将两个应用的域名 [http://webapp.dev.k8s.local/](http://webapp.prod.k8s.local/) 与 [http://webapp.prod.k8s.local/](http://webapp.prod.k8s.local/) 在本地 `/etc/hosts` 中添加映射。

如果一切正常的话现在我们可以在浏览器中来查看我们部署的 web 应用程序了。

![Dev web app](https://picdn.youdianzhishi.com/images/20200710190515.png)

然后我们来尝试修改下代码，编辑 main.go 文件，将变量 welcome 中的 `GITOPS` 修改为 `GITOPS-K8S`:

```go
func main() {
   welcome := Welcome{"GITOPS-K8S", time.Now().Format(time.Stamp), os.Getenv("HOSTNAME")
	  ......
}
```

然后提交代码到 master 分支，然后进入 GitLab 项目 -> CI/CD -> Pipelines，就可以看到一个新的流水线开始构建了。

![](https://picdn.youdianzhishi.com/images/20200710191018.png)

等待一会儿，正常情况下会执行到 dev 的部署阶段，然后变成 `skipped` 的状态，此时流水线已经将代码中的 dev 下的资源清单文件已经更新了。

![GitLab CI/CD Pipeline](https://picdn.youdianzhishi.com/images/20200710191559.png)

然后 Argo CD 在自动同步模式下在一分钟内变会更新 Kubernetes 的资源对象，我们也可以在 Argo CD 的页面中看到进度。当 Argo CD 中同步完成后我们再去查看 DEV 环境的应用，就可以看到页面上面的信息已经变成了 `GITOPS-K8S` 了。

![Update Dev Web APP](https://picdn.youdianzhishi.com/images/20200710191716.png)

最后如果需要部署到 prod 环境，我们只需要在 GitLab 的流水线中手动触发即可，之后，prod 中的镜像也会被更新。

![GitLab CI/CD Prod deployment](https://picdn.youdianzhishi.com/images/20200710192038.png)

下面是同步时 Argo CD 更新的页面状态变化图。

![Argo CD Sync Workflow](https://picdn.youdianzhishi.com/images/20200710192302.png)

到这里，我们就使用 GitOps 成功的将我们的应用部署到了开发和生产环境之中了。

## 参考链接

- [https://www.weave.works/technologies/gitops/](https://www.weave.works/technologies/gitops/)
- [https://argoproj.github.io/argo-cd/](https://argoproj.github.io/argo-cd/)
- [https://docs.gitlab.com/ee/ci/yaml/](https://docs.gitlab.com/ee/ci/yaml/)
- [https://medium.com/@andrew.kaczynski/gitops-in-kubernetes-argo-cd-and-gitlab-ci-cd-5828c8eb34d6](https://medium.com/@andrew.kaczynski/gitops-in-kubernetes-argo-cd-and-gitlab-ci-cd-5828c8eb34d6)
- [https://github.com/cnych/gitops-webapp-demo](https://github.com/cnych/gitops-webapp-demo)

<!--adsense-self-->
