---
title: Gitlab CI 在 Kubernetes 中的 Docker 缓存
date: 2021-11-09
tags: ["kubernetes", "gitlab-ci", "docker"]
slug: gitlab-ci-docker-layer-cache-for-k8s-executor
keywords: ["kubernetes", "gitlab-ci", "docker", "缓存"]
gitcomment: true
notoc: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20211109172525.png", desc: "https://unsplash.com/photos/Zyv7Dc-lOjw"}]
category: "kubernetes"
---

前面我们有文章介绍过如何在 Kubernetes 集群中使用 GitLab CI 来实现 CI/CD，在构建镜像的环节我们基本上都是使用的 `Docker On Docker` 的模式，这是因为 Kubernetes 集群使用的是 Docker 这种容器运行时，所以我们可以将宿主机的 `docker.sock` 文件挂载到容器中构建镜像，而最近我们在使用 Kubernetes 1.22.X 版本后将容器运行时更改为了 Containerd，这样节点上没有可用的 Docker 服务了，这个时候就需要更改构建镜像的模式了，当然要实现构建镜像的方式有很多，我们这里还是选择使用 Docker 来构建我们的 Docker 镜像，也就是使用 `Docker IN Docker` 的模式。

<!--more-->

在每次构建镜像的时候，GitLab Runner 都会启动一个包含3个容器的 Pod，其中一个就是运行 Docker 守护进程的 Docker DIND 容器，构建的容器会去连接到运行在同一个 Pod 上的 Docker 守护进程，由于 Pod 中的所有容器共享同一个 network namespace，构建镜像的 Docker CLI 能够通过 localhost 直接连接到 Docker 守护进程进行构建。但是这种方式最大的一个问题是每次构建都是启动一个全新的 Docker 守护进程，造成没有缓存 Docker layer 层，这会显著增加我们的构建时间。

这个问题的解决方法非常简单，与其为每个 Pod 运行一个 Docker DIND 服务的 sidecar 容器，不如让我们运行一个独立的 Docker DIND 容器，构建容器的所有 Docker CLI 都连接到这个一个 Docker 守护进程上，这个时候我们将 Docker layer 层进行持久化，也就起到了缓存的作用了。

首先创建一个 PVC 来存储 Docker 的持久化数据，为了性能考虑，这里我们使用的是一个 Local PV：

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-volume
provisioner: kubernetes.io/no-provisioner
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer

---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: docker-pv
spec:
  capacity:
    storage: 5Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: local-volume
  local:
    path: /mnt/k8s/docker  # 数据存储的目录
  nodeAffinity:
    required:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: In
          values:
          - node1  # 运行在node1节点
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  labels:
    app: docker-dind
  name: docker-dind-data
  namespace: kube-ops
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: local-volume
  resources:
    requests:
      storage: 5Gi
```

然后使用 Deployment 部署一个 Docker DIND 服务：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: docker-dind
  namespace: kube-ops
  labels:
    app: docker-dind
spec:
  selector:
    matchLabels:
      app: docker-dind
  template:
    metadata:
      labels:
        app: docker-dind
    spec:
      containers:
        - image: docker:dind
          name: docker-dind
          args:
          - --registry-mirror=https://ot2k4d59.mirror.aliyuncs.com/  # 指定一个镜像加速器地址
          env:
            - name: DOCKER_DRIVER
              value: overlay2
            - name: DOCKER_HOST
              value: tcp://0.0.0.0:2375
            - name: DOCKER_TLS_CERTDIR   # 禁用 TLS 
              value: ""
          volumeMounts:
            - name: docker-dind-data-vol # 持久化docker根目录
              mountPath: /var/lib/docker/
          ports:
            - name: daemon-port
              containerPort: 2375
          securityContext:
            privileged: true # 需要设置成特权模式
      volumes:
        - name: docker-dind-data-vol
          persistentVolumeClaim:
            claimName: docker-dind-data
```

然后创建一个 Service 以方便构建的 Docker CLI 与其连接：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: docker-dind
  namespace: kube-ops
  labels:
    app: docker-dind
spec:
  ports:
    - port: 2375
      targetPort: 2375
  selector:
    app: docker-dind
```

将 Docker DIND 服务部署完成后，我们就可以在 Gitlab CI 中使用这个守护程序来构建镜像了，如下所示：

```yaml
tages:
  - image

build_image:
  stage: image
  image: docker:latest
  variables:
    DOCKER_HOST: tcp://docker-dind:2375  # 通过 service dns 形式连接 docker dind 服务
  script:
    - docker info
    - docker build -t xxxx .
    - docker push xxxx
  only:
    - tags
```

由于我们缓存了 Docker layer 层，这个时候构建的速度会明显提升。最后随着镜像的大量构建会产生很多镜像数据，我们可以写一个 Cronjob 用来定时清除缓存：

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: docker-dind-clear-cache
  namespace: kube-ops
spec:
  schedule: 0 0 * * 0  # 每周清理一次
  jobTemplate:
    metadata:
      labels:
        app: docker-dind
      name: docker-dind-clear-cache
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: clear-cache
              image: docker:latest
              command:
                - docker
                - system
                - prune
                - -af
              env:
                - name: DOCKER_HOST
                  value: tcp://docker-dind:2375
```
