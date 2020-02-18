---
title: 在 Kubernetes 上部署 Spinnaker
date: 2020-02-18
tags: ["kubernetes", "spinnaker", "jenkins", "helm"]
keywords: ["kubernetes", "spinnaker", "jenkins", "ci/cd", "helm", "安装"]
slug: deploy-spinnaker-on-k8s
gitcomment: true
notoc: true
category: "kubernetes"
---
[![在 Kubernetes 上部署 Spinnaker](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/spinnaker-on-k8s.png)](/post/deploy-spinnaker-on-k8s/)

[Spinnaker](https://www.spinnaker.io/) 是一种持续交付平台，最初由 Netflix 开发，用于快速、可靠地发布软件变更。Spinnaker 使开发人员可以更轻松地专注于编写代码，而无需担心底层的云基础设施，它可以和 Jenkins 以及其他流行的构建工具无缝集成。很早就想要体验下 Spinnaker 了，但是由于 GFW 的原因尝试了很多次都无功而返，这次解决了代理的问题终于顺利的在 Kubernetes 集群上成功部署上了 Spinnaker。

<!--more-->

本文将使用 helm3 来为大家演示在 Kubernetes 集群上安装 Spinnaker，对应的环境版本如下所示：
```shell
$ helm version
version.BuildInfo{Version:"v3.0.1", GitCommit:"7c22ef9ce89e0ebeb7125ba2ebf7d421f3e82ffa", GitTreeState:"clean", GoVersion:"go1.13.4"}
$ kubectl version                          
Client Version: version.Info{Major:"1", Minor:"14", GitVersion:"v1.14.2", GitCommit:"66049e3b21efe110454d67df4fa62b08ea79a19b", GitTreeState:"clean", BuildDate:"2019-05-16T18:55:03Z", GoVersion:"go1.12.5", Compiler:"gc", Platform:"darwin/amd64"}
Server Version: version.Info{Major:"1", Minor:"16", GitVersion:"v1.16.2", GitCommit:"c97fe5036ef3df2967d086711e6c0c405941e14b", GitTreeState:"clean", BuildDate:"2019-10-15T19:09:08Z", GoVersion:"go1.12.10", Compiler:"gc", Platform:"linux/amd64"}
```

对于 Helm3 的安装配置其实很简单，只需要在 kubectl 所在节点上面安装上 Helm3 客户端即可，默认就会读取 kubeconfig 文件来访问集群。我们这里使用微软提供的 helm chart 仓库源：
```shell
$  helm repo ls
NAME            URL                                      
stable          http://mirror.azure.cn/kubernetes/charts/
$ helm repo update
Hang tight while we grab the latest from your chart repositories...
...Successfully got an update from the "stable" chart repository
Update Complete. ⎈ Happy Helming!⎈ 
```

由于我们这里使用的是 Kubernetes 1.16.x 版本，该版本之后将之前很多资源对象的一些旧的 API 废弃掉了，比如 Deployment 只能使用 `apps/v1` 这个版本了，而我们这里要使用的 Spinnaker 对应的 chart 包目前还是使用的以前的 API 版本，所以我们需要手动下载下来做一次更改：
```shell
$ helm fetch stable/spinnaker
$ tar -xvf spinnaker-1.23.2.tgz
```

然后将 spinnaker chart 模板中的 Deployment、StatefulSet 这些资源对象的 apiVersion 更改成 `apps/v1`，也需要记住如果是 Deployment 还需要添加上 `selector.matchLabels` 字段，大家可以直接使用我更改后的 chart 模板 [https://github.com/cnych/spinnaker-helm](https://github.com/cnych/spinnaker-helm)。

在 chart 模板的 `values.yaml` 文件中指定了 `halyard.spinnakerVersion=1.17.6`，这还是因为 apiVersion 版本的问题，该版本以上就可以兼容 Kubernetes v1.16.x 的集群，另外将默认的 `gcr.io` 的镜像替换成了微软的镜像源 `gcr.azk8s.cn`，此外还有一个非常重要的就是存储的指定，这里我们创建了一个 `StorageClass` 的资源对象来提供存储，我这里是创建的一个 `Ceph RBD` 类型的存储 `rook-ceph-block`，当然任何可用的 `StorageClass` 资源对象都是可以的：
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
   name: rook-ceph-block
provisioner: rook-ceph.rbd.csi.ceph.com
reclaimPolicy: Retain
parameters:
    # clusterID 是 rook 集群运行的命名空间
    clusterID: rook-ceph

    # 指定存储池
    pool: k8s-test-pool

    # RBD image (实际的存储介质) 格式. 默认为 "2".
    imageFormat: "2"

    # RBD image 特性. CSI RBD 现在只支持 `layering` .
    imageFeatures: layering

    # Ceph 管理员认证信息，这些都是在 clusterID 命名空间下面自动生成的
    csi.storage.k8s.io/provisioner-secret-name: rook-csi-rbd-provisioner
    csi.storage.k8s.io/provisioner-secret-namespace: rook-ceph
    csi.storage.k8s.io/node-stage-secret-name: rook-csi-rbd-node
    csi.storage.k8s.io/node-stage-secret-namespace: rook-ceph
    # 指定 volume 的文件系统格式，如果不指定, csi-provisioner 会默认设置为 `ext4`
    csi.storage.k8s.io/fstype: ext4
```


需要为 halyard、redis、mino 都指定对应的存储，当然直接指定一个合适的 PVC 也是可以的，这里可以根据实际情况决定：
```yaml
halyard:
  ...
  persistence:
    storageClass: rook-ceph-block
...
redis:
  ...
  master:
    persistence:
      storageClass: rook-ceph-block
...
minio:
  ...
  persistence:
    storageClass: rook-ceph-block
...
```

接下来**最重要的一步就是必须要为 halyard 配置代理**，所以继续下去的前提是你需要配置一个在 Kubernetes 的 Pod 中可以访问的代理，比如我这里的代理地址为 `10.151.30.11:8118`，则需要配置如下所示的 `JAVA_OPTS` 这个环境变量：
```yaml
halyard:
  env:
    - name: JAVA_OPTS
      value: '"-Djava.security.egd=file:/dev/./urandom" "-Dhttp.proxyHost=10.151.30.11" "-Dhttps.proxyHost=10.151.30.11" "-Dhttp.proxyPort=8118" "-Dhttps.proxyPort=8118" "-Dhttp.nonProxyHosts=\"localhost|*.spinnaker.com\""'
```

获取上面我修改过后的 Spinnaker 的 Chart 模板，将 `values.yaml` 文件中上面对应的配置替换成自己对应的配置即可。
```shell
$ git clone https://github.com/cnych/spinnaker-helm spinnaker
$ kubectl create ns spinnaker
# 安装 spinnaker
$ helm install spinnaker --namespace spinnaker ./spinnaker
```

由于安装过程非常耗时，可能上面的 `helm install` 的过程可能会有超时提示，这个可以忽略：
```shell
$ helm ls -n spinnaker
NAME            NAMESPACE       REVISION        UPDATED                                 STATUS  CHART            APP VERSION
spinnaker       spinnaker       1               2020-02-17 19:28:02.644552 +0800 CST    failed  spinnaker-1.23.2 1.16.2 
```

安装完成后最开始会生成如下所示的几个 Pod，其中 `spinnaker-install-using-hal-th8qf` 就是用来去真正安装 Spinnaker 的一个 Job 任务：
```shell
$ kubectl get pods -n spinnaker
spinnaker-install-using-hal-th8qf   0/1     Completed   0          17h
spinnaker-minio-86f5b8785-bkjfq     1/1     Running     0          17h
spinnaker-redis-master-0            1/1     Running     0          17h
spinnaker-spinnaker-halyard-0       1/1     Running     0          17h
```
<!--adsense-text-->
不过由于在安装 Spinnaker 的过程中会使用 `gcr.io` 的镜像，所以会看到很多 Pod 镜像拉取失败的错误，这个时候我们可以手动编辑 Deployment 对象更改镜像地址：
```shell
$ kubectl get deploy -n spinnaker
NAME               READY   UP-TO-DATE   AVAILABLE   AGE
spin-clouddriver   0/1     1            0           17h
spin-deck          0/1     1            0           17h
spin-echo          0/1     1            0           17h
spin-front50       0/1     1            0           17h
spin-gate          0/1     1            0           17h
spin-igor          0/1     1            0           17h
spin-orca          0/1     1            0           17h
spin-rosco         0/1     1            0           17h
spinnaker-minio    1/1     1            1           17h
```

比如修改 `spin-deck` 这个 Deployment 资源对象的镜像地址：
```shell
$ kubectl edit deploy spin-deck -n spinnaker
# 然后在打开的编辑中将 gcr.io 替换成 gcr.azk8s.cn
```

用同样的方法替换其他资源对象，正常替换过后隔一段时间就可以正常启动 Pod 了，最终的 Pod 列表如下所示：
```shell
$ kubectl get pods -n spinnaker           
NAME                                READY   STATUS      RESTARTS   AGE
spin-clouddriver-76b8989b4f-cjw8r   1/1     Running     0          17h
spin-deck-5fd7b64b77-fnl5r          1/1     Running     0          17h
spin-echo-644c4cb6b6-gh98w          1/1     Running     0          17h
spin-front50-9d99cd697-cqbxb        1/1     Running     0          17h
spin-gate-6c49bccb6f-nhbzx          1/1     Running     0          17h
spin-igor-7c84d9bcb-rltw7           1/1     Running     0          17h
spin-orca-b5944685-wbm5p            1/1     Running     0          17h
spin-rosco-6d5f9c8f55-g89hq         1/1     Running     0          17h
spinnaker-install-using-hal-th8qf   0/1     Completed   0          17h
spinnaker-minio-86f5b8785-bkjfq     1/1     Running     0          17h
spinnaker-redis-master-0            1/1     Running     0          17h
spinnaker-spinnaker-halyard-0       1/1     Running     0          17h
```

到这里就证明我们的 Spinnaker 已经安装成功了，这个时候如果我们想要把 Spinnaker 暴露给外部用户访问，当然可以创建一个 NodePort 类型的 Service，或者创建一个 Ingress 资源对象即可，其实上面的 chart 模板中我们就可以通过配置指定 Ingress 资源对象的参数。由于我这里使用的是 Traefik2.1 版本，所以单独创建一个 IngressRoute 资源对象来暴露服务：
```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: spin-deck-https
  namespace: spinnaker
spec:
  entryPoints:
  - websecure
  routes:
  - match: Host(`spinnaker.qikqiak.com`)
    kind: Rule
    services:
    - name: spin-deck
      port: 9000
  tls:
    certResolver: ali
    domains:
    - main: "*.qikqiak.com"
---
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: redirect-https
  namespace: spinnaker
spec:
  redirectScheme:
    scheme: https
---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: spin-deck-http
  namespace: spinnaker
spec:
  entryPoints:
  - web
  routes:
  - match: Host(`spinnaker.qikqiak.com`)
    kind: Rule
    services:
    - name: spin-deck
      port: 9000
    middlewares: 
    - name: redirect-https
```

直接创建上面的资源对象即可，对 Traefik2 使用不是很熟悉的，可以查看前面的文章 [一文搞懂 Traefik2.1 的使用](/post/traefik-2.1-101/) 了解更多，然后直接对域名 `spinnaker.qikqiak.com` 做好 DNS 解析即可在浏览器中访问 Spinnaker 了：

![spinnaker dashboard](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200218133426.png)

到这里就安装成功了，当然这只是万里长征的第一步呢，后面我们再慢慢的去了解 Spinnaker 到底有哪些值得我们关注的功能。


<!--adsense-self-->
