---
title: Kubernetes Helm 初体验
date: 2018-01-25
publishdate: 2017-01-25
tags: ["kubernetes", "helm"]
slug: first-use-helm-on-kubernetes
keywords: ["kubernetes", "helm", "用法"]
gitcomment: true
bigimg: [{src: "/img/posts/Hxev8VTsTuOJ27thHQdK_DSC_0068.jpeg", desc: "Mouth of the cave"}]
category: "kubernetes"
---

`Helm`这个东西其实早有耳闻，但是一直没有用在生产环境，而且现在对这货的评价也是褒贬不一。正好最近需要再次部署一套测试环境，对于单体服务，部署一套测试环境我相信还是非常快的，但是对于微服务架构的应用，要部署一套新的环境，就有点折磨人了，微服务越多、你就会越绝望的。虽然我们线上和测试环境已经都迁移到了`kubernetes`环境，但是每个微服务也得维护一套`yaml`文件，而且每个环境下的配置文件也不太一样，部署一套新的环境成本是真的很高。如果我们能使用类似于`yum`的工具来安装我们的应用的话是不是就很爽歪歪了啊？`Helm`就相当于`kubernetes`环境下的`yum`包管理工具。

<!--more-->

### 用途
做为 Kubernetes 的一个包管理工具，`Helm`具有如下功能：

* 创建新的 chart
* chart 打包成 tgz 格式
* 上传 chart 到 chart 仓库或从仓库中下载 chart
* 在`Kubernetes`集群中安装或卸载 chart
* 管理用`Helm`安装的 chart 的发布周期

### 重要概念
Helm 有三个重要概念：

* chart：包含了创建`Kubernetes`的一个应用实例的必要信息
* config：包含了应用发布配置信息
* release：是一个 chart 及其配置的一个运行实例

### Helm组件
Helm 有以下两个组成部分：

`Helm Client` 是用户命令行工具，其主要负责如下：

* 本地 chart 开发
* 仓库管理
* 与 Tiller sever 交互
* 发送预安装的 chart
* 查询 release 信息
* 要求升级或卸载已存在的 release

`Tiller Server`是一个部署在`Kubernetes`集群内部的 server，其与 Helm client、Kubernetes API server 进行交互。Tiller server 主要负责如下：

* 监听来自 Helm client 的请求
* 通过 chart 及其配置构建一次发布
* 安装 chart 到`Kubernetes`集群，并跟踪随后的发布
* 通过与`Kubernetes`交互升级或卸载 chart
* 简单的说，client 管理 charts，而 server 管理发布 release

### 安装
我们可以在[Helm Realese](https://github.com/kubernetes/helm/releases)页面下载二进制文件，这里下载的**2.7.2**版本，解压后将可执行文件`helm`拷贝到`/usr/local/bin`目录下即可，这样`Helm`客户端就在这台机器上安装完成了。

现在我们可以使用`Helm`命令查看版本了，会提示无法连接到服务端`Tiller`：
```shell
$ helm version
Client: &version.Version{SemVer:"v2.7.2", GitCommit:"8478fb4fc723885b155c924d1c8c410b7a9444e6", GitTreeState:"clean"}
Error: cannot connect to Tiller
```

要安装 Helm 的服务端程序，我们需要使用到`kubectl`工具，所以先确保`kubectl`工具能够正常的访问 kubernetes 集群的`apiserver`哦。

然后我们在命令行中执行初始化操作：
```shell
$ helm init
```

由于 Helm 默认会去`gcr.io`拉取镜像，所以如果你当前执行的机器没有配置科学上网的话可以实现下面的命令代替：
```shell
$ helm init --upgrade --tiller-image cnych/tiller:v2.7.2
```

我在安装过程中遇到了一些其他问题，比如初始化的时候出现了如下错误：
```shell
E0125 14:03:19.093131   56246 portforward.go:331] an error occurred forwarding 55943 -> 44134: error forwarding port 44134 to pod d01941068c9dfea1c9e46127578994d1cf8bc34c971ff109dc6faa4c05043a6e, uid : unable to do port forwarding: socat not found.
2018/01/25 14:03:19 (0xc420476210) (0xc4203ae1e0) Stream removed, broadcasting: 3
2018/01/25 14:03:19 (0xc4203ae1e0) (3) Writing data frame
2018/01/25 14:03:19 (0xc420476210) (0xc4200c3900) Create stream
2018/01/25 14:03:19 (0xc420476210) (0xc4200c3900) Stream added, broadcasting: 5
Error: cannot connect to Tiller
```
解决方案：在节点上安装`socat`可以解决
```shell
$ sudo yum install -y socat
```

Helm 服务端正常安装完成后，`Tiller`默认被部署在`kubernetes`集群的`kube-system`命名空间下：
```shell
$ kubectl get pod -n kube-system -l app=helm
NAME                             READY     STATUS    RESTARTS   AGE
tiller-deploy-546cf9696c-wq5nl   1/1       Running   0          57m
```
此时，我们查看 Helm 版本就都正常了：
```shell
Client: &version.Version{SemVer:"v2.7.2", GitCommit:"8478fb4fc723885b155c924d1c8c410b7a9444e6", GitTreeState:"clean"}
Server: &version.Version{SemVer:"v2.7.2", GitCommit:"8478fb4fc723885b155c924d1c8c410b7a9444e6", GitTreeState:"clean"}
```

另外一个值得注意的问题是`RBAC`，我们的 kubernetes 集群是1.8.x版本的，默认开启了`RBAC`访问控制，所以我们需要为`Tiller`创建一个`ServiceAccount`，让他拥有执行的权限，详细内容可以查看 Helm 文档中的[Role-based Access Control](https://docs.helm.sh/using_helm/#role-based-access-control)。
创建`rbac.yaml`文件：
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: tiller
  namespace: kube-system
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: tiller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: tiller
    namespace: kube-system
```
然后使用`kubectl`创建：
```shell
$ kubectl create -f rbac-config.yaml
serviceaccount "tiller" created
clusterrolebinding "tiller" created
```

创建了`tiller`的 ServceAccount 后还没完，因为我们的 Tiller 之前已经就部署成功了，而且是没有指定 ServiceAccount 的，所以我们需要给 Tiller 打上一个 ServiceAccount 的补丁：
```shell
$ kubectl patch deploy --namespace kube-system tiller-deploy -p '{"spec":{"template":{"spec":{"serviceAccount":"tiller"}}}}'
```

> 上面这一步非常重要，不然后面在使用 Helm 的过程中可能出现`Error: no available release name found`的错误信息。

至此, `Helm`客户端和服务端都配置完成了，接下来我们看看如何使用吧。


### 使用

我们现在了尝试创建一个 Chart：
```shell
$ helm create hello-helm
Creating hello-helm
$ tree hello-helm
hello-helm
├── Chart.yaml
├── charts
├── templates
│   ├── NOTES.txt
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── ingress.yaml
│   └── service.yaml
└── values.yaml

2 directories, 7 files
```

我们通过查看`templates`目录下面的`deployment.yaml`文件可以看出默认创建的 Chart 是一个 nginx 服务，具体的每个文件是干什么用的，我们可以前往 [Helm 官方文档](https://docs.helm.sh/developing_charts/#charts)进行查看。

现在我们来尝试安装下这个 Chart :
```shell
$ helm install ./hello-helm
NAME:   kilted-bobcat
LAST DEPLOYED: Thu Jan 25 16:57:46 2018
NAMESPACE: default
2018/01/25 16:57:47 (0xc4207d8140) (7) Writing data frame
STATUS: DEPLOYED

RESOURCES:
==> v1/Service
NAME                      TYPE       CLUSTER-IP    EXTERNAL-IP  PORT(S)  AGE
kilted-bobcat-hello-helm  ClusterIP  10.254.43.90  <none>       80/TCP   1s

==> v1beta1/Deployment
NAME                      DESIRED  CURRENT  UP-TO-DATE  AVAILABLE  AGE
kilted-bobcat-hello-helm  1        1        1           0          1s

==> v1/Pod(related)
NAME                                      READY  STATUS             RESTARTS  AGE
kilted-bobcat-hello-helm-789946b9b-xslrm  0/1    ContainerCreating  0         1s


NOTES:
1. Get the application URL by running these commands:
  export POD_NAME=$(kubectl get pods --namespace default -l "app=hello-helm,release=kilted-bobcat" -o jsonpath="{.items[0].metadata.name}")
  echo "Visit http://127.0.0.1:8080 to use your application"
  kubectl port-forward $POD_NAME 8080:80
```

然后我们根据提示执行下面的命令：
```shell
$ export POD_NAME=$(kubectl get pods --namespace default -l "app=hello-helm,release=kilted-bobcat" -o jsonpath="{.items[0].metadata.name}")
$ kubectl port-forward $POD_NAME 8080:80
```
然后在浏览器中打开`http://127.0.0.1:8080`就可以正常的访问我们刚刚部署的 nginx 应用了。
![nginx](/img/posts/WX20180125-170245.png)

查看`release`：
```shell
$ helm list
NAME            REVISION    UPDATED                     STATUS      CHART               NAMESPACE
kilted-bobcat   1           Thu Jan 25 16:57:46 2018    DEPLOYED    hello-helm-0.1.0    default
```

打包`chart`：
```shell
$ helm package hello-helm
Successfully packaged chart and saved it to: /Users/ych/devs/workspace/yidianzhishi/k8s-repo/helm/hello-helm-0.1.0.tgz
```
然后我们就可以将打包的`tgz`文件分发到任意的服务器上，通过`helm fetch`就可以获取到该 Chart 了。

删除`release`：
```shell
$ helm delete kilted-bobcat
release "kilted-bobcat" deleted
```
然后我们看到`kubernetes`集群上的该 nginx 服务也已经被删除了。

还有更多关于`Helm`的使用命令，我们可以前往[官方文档](https://docs.helm.sh/helm/helm)查看。更高级的用法我们后面在深入吧。

### 参考资料

* [https://github.com/kubernetes/helm](https://github.com/kubernetes/helm)
* [https://docs.helm.sh/](https://docs.helm.sh/)
* [https://github.com/kubernetes/charts](https://github.com/kubernetes/charts)

欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

