---
title: 在 Kubernetes 集群上部署 Kafka
date: 2020-03-17
tags: ["kubernetes", "helm", "kafka"]
keywords: ["kubernetes", "helm", "kafka", "zookeeper", "logstash", "Elasticsearch", "Operator"]
slug: install-kafka-in-kubernetes
gitcomment: true
notoc: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200317190406.png", desc: "person standing on a mountain overlooking the ocean"}]
category: "kubernetes"
---
最近在测试日志采集的时候，发现日志数据量稍微大一点，Elasticsearch 就有点抗不住了，对于 ES 的优化可能不是一朝一夕能够完成的，所以打算加一个中间层，将日志输出到 Kafka，然后通过 Logstash 从 Kafka 里面去消费日志存入 Elasticsearch。在测试环境现在并没有一套 Kafka 集群，所以我们来先在测试环境搭建一套 Kafka 集群。

<!--more-->

本文使用到的相关环境版本如下：
```shell
$ kubectl version
Client Version: version.Info{Major:"1", Minor:"14", GitVersion:"v1.14.2", GitCommit:"66049e3b21efe110454d67df4fa62b08ea79a19b", GitTreeState:"clean", BuildDate:"2019-05-16T18:55:03Z", GoVersion:"go1.12.5", Compiler:"gc", Platform:"darwin/amd64"}
Server Version: version.Info{Major:"1", Minor:"16", GitVersion:"v1.16.2", GitCommit:"c97fe5036ef3df2967d086711e6c0c405941e14b", GitTreeState:"clean", BuildDate:"2019-10-15T19:09:08Z", GoVersion:"go1.12.10", Compiler:"gc", Platform:"linux/amd64"}
$ helm version
version.BuildInfo{Version:"v3.0.1", GitCommit:"7c22ef9ce89e0ebeb7125ba2ebf7d421f3e82ffa", GitTreeState:"clean", GoVersion:"go1.13.4"}
$ # kafka helm chart 包版本为：kafka-0.20.8.tgz
```

同样为了简单起见，我们这里使用 Helm3 来安装 Kafka，首先我们需要添加一个 `incubator` 的仓库地址，因为 stable 的仓库里面并没有合适的 Kafka 的 Chart 包：
```shell
$ helm repo add incubator http://mirror.azure.cn/kubernetes/charts-incubator/
$ helm repo update
Hang tight while we grab the latest from your chart repositories...
...Successfully got an update from the "incubator" chart repository
...Successfully got an update from the "stable" chart repository
Update Complete. ⎈ Happy Helming!⎈ 
```

将 Kafka 的 Helm Chart 包下载到本地，这有助于我们了解 Chart 包的使用方法，当然也可以省去这一步：
```shell
$ helm fetch incubator/kafka
$ ls kafka-0.20.8.tgz 
$ tar -xvf kafka-0.20.8.tgz
```

然后新建一个名为 kafka-test.yaml 的文件，内容如下所示：
```yaml
resources:
  limits:
    cpu: 200m
    memory: 1536Mi
  requests:
    cpu: 100m
    memory: 1024Mi

livenessProbe:
  initialDelaySeconds: 60

persistence:
  storageClass: "rook-ceph-block"
```

由于 kafka 初次启动的时候比较慢，所以尽量将健康检查的初始化时间设置长一点，我们这里设置成 `livenessProbe.initialDelaySeconds=60`，资源声明可以根据我们集群的实际情况进行声明，最后如果需要持久化 kafka 的数据，还需要提供一个 StorageClass，我们也知道 kafka 对磁盘的 IO 要求本身也是非常高的，所以最好是用 Local PV，我们这里使用的是 ceph rbd 的一个 StorageClass 资源对象：（storageclass.yaml）
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
   name: rook-ceph-block
provisioner: rook-ceph.rbd.csi.ceph.com
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
reclaimPolicy: Retain
```

具体的存储方案需要根据我们自己的实际情况进行选择，我这里使用的 Rook 搭建的 Ceph，使用相对简单很多，感兴趣的也可以查看前面的文章 [使用 Rook 快速搭建 Ceph 集群](https://www.qikqiak.com/post/deploy-ceph-cluster-with-rook/) 了解相关信息。
<!--adsense-text-->
定制的 values 文件准备好过后就可以直接使用 Helm 来进行安装了：
```shell
$ kubectl create ns kafka
$ helm install -f kafka.yaml kfk incubator/kafka --namespace kafka
NAME: kfk
LAST DEPLOYED: Tue Mar 17 11:49:51 2020
NAMESPACE: kafka
STATUS: deployed
REVISION: 1
NOTES:
### Connecting to Kafka from inside Kubernetes

You can connect to Kafka by running a simple pod in the K8s cluster like this with a configuration like this:

  apiVersion: v1
  kind: Pod
  metadata:
    name: testclient
    namespace: kafka
  spec:
    containers:
    - name: kafka
      image: confluentinc/cp-kafka:5.0.1
      command:
        - sh
        - -c
        - "exec tail -f /dev/null"

Once you have the testclient pod above running, you can list all kafka
topics with:

  kubectl -n kafka exec testclient -- kafka-topics --zookeeper kfk-zookeeper:2181 --list

To create a new topic:

  kubectl -n kafka exec testclient -- kafka-topics --zookeeper kfk-zookeeper:2181 --topic test1 --create --partitions 1 --replication-factor 1

To listen for messages on a topic:

  kubectl -n kafka exec -ti testclient -- kafka-console-consumer --bootstrap-server kfk-kafka:9092 --topic test1 --from-beginning

To stop the listener session above press: Ctrl+C

To start an interactive message producer session:
  kubectl -n kafka exec -ti testclient -- kafka-console-producer --broker-list kfk-kafka-headless:9092 --topic test1

To create a message in the above session, simply type the message and press "enter"
To end the producer session try: Ctrl+C

If you specify "zookeeper.connect" in configurationOverrides, please replace "kfk-zookeeper:2181" with the value of "zookeeper.connect", or you will get error.
```

安装成功后可以查看下 Release 的状态：
```shell
$ helm ls -n kafka
NAME    NAMESPACE       REVISION        UPDATED                                 STATUS          CHART           APP VERSION
kfk     kafka           1               2020-03-17 14:50:41.595746 +0800 CST    deployed        kafka-0.20.8    5.0.1  
```

正常情况下隔一会儿就会部署上3个实例的 kafka 和 zookeeper 的集群：
```shell
$ kubectl get pods -n kafka
NAME              READY   STATUS    RESTARTS   AGE
kfk-kafka-0       1/1     Running   0          3h52m
kfk-kafka-1       1/1     Running   0          3h50m
kfk-kafka-2       1/1     Running   0          3h48m
kfk-zookeeper-0   1/1     Running   0          3h55m
kfk-zookeeper-1   1/1     Running   0          3h54m
kfk-zookeeper-2   1/1     Running   0          3h54m
```

部署完成后创建一个测试的客户端来测试下 kafka 集群是否正常了：(testclient.yaml)
```yaml
apiVersion: v1
  kind: Pod
  metadata:
    name: testclient
    namespace: kafka
  spec:
    containers:
    - name: kafka
      image: confluentinc/cp-kafka:5.0.1
      command:
        - sh
        - -c
        - "exec tail -f /dev/null"
```

同样直接部署上面的资源对象即可：
```shell
$ kubectl apply -f testclient.yaml
$ kubectl get pods -n kafka
NAME              READY   STATUS    RESTARTS   AGE
testclient        1/1     Running   0          3h44m
......
```

测试的客户端创建完成后，通过如下命令创建一个新的 topic:
```shell
$ kubectl -n kafka exec testclient -- kafka-topics --zookeeper kfk-zookeeper:2181 --topic test1 --create --partitions 1 --replication-factor 1
Created topic "test1".
```

可以看到 `test1` 这个 topic 创建成功了。然后可以运行如下命令来监听 `test1` 这个 topic 的消息：
```shell
$ kubectl -n kafka exec -ti testclient -- kafka-console-consumer --bootstrap-server kfk-kafka:9092 --topic test1 --from-beginning
```

然后开启一个新的命令行终端生成一条消息：
```shell
$ kubectl -n kafka exec -ti testclient -- kafka-console-producer --broker-list kfk-kafka-headless:9092 --topic test1
>Hello kafka on k8s
>
```

这个时候在 `test1` 这个 topic 这边的监听器里面可以看到对应的消息记录了：
```shell
$ kubectl -n kafka exec -ti testclient -- kafka-console-consumer --bootstrap-server kfk-kafka:9092 --topic test1 --from-beginning
Hello kafka on k8s
```

到这里就表明我们部署的 kafka 已经成功运行在了 Kubernetes 集群上面。当然我们这里只是在测试环境上使用，对于在生产环境上是否可以将 kafka 部署在 Kubernetes 集群上需要考虑的情况就非常多了，对于有状态的应用都更加推荐使用 Operator 去使用，比如 [Confluent 的 Kafka Operator](https://www.confluent.io/confluent-operator/)，总之，你能 hold 住就无所谓，随便用🤣

<!--adsense-self-->

