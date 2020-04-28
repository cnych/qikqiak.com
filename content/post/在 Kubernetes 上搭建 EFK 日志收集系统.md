---
title: 在 Kubernetes 上搭建 EFK 日志收集系统[更新]
subtitle: 一文彻底搞定 EFK 日志收集
date: 2020-04-28
tags: ["kubernetes", "EFK", "Elasticsearch", "Fluentd", "Kibana"]
keywords: ["kubernetes", "log", "EFK", "Elasticsearch", "Fluentd", "Kibana"]
slug: install-efk-stack-on-k8s
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/vphcv.jpg", desc: "EFK Stack"}]
category: "kubernetes"
---

[上节课和大家介绍了 `Kubernetes` 集群中的几种日志收集方案](/post/kubernetes-logs-architecture/)，Kubernetes 中比较流行的日志收集解决方案是 `Elasticsearch`、`Fluentd` 和 `Kibana`（EFK）技术栈，也是官方现在比较推荐的一种方案。

`Elasticsearch` 是一个实时的、分布式的可扩展的搜索引擎，允许进行全文、结构化搜索，它通常用于索引和搜索大量日志数据，也可用于搜索许多不同类型的文档。

Elasticsearch 通常与 `Kibana` 一起部署，Kibana 是 Elasticsearch 的一个功能强大的数据可视化 Dashboard，Kibana 允许你通过 web 界面来浏览 Elasticsearch 日志数据。

`Fluentd`是一个流行的开源数据收集器，我们将在 Kubernetes 集群节点上安装 Fluentd，通过获取容器日志文件、过滤和转换日志数据，然后将数据传递到 Elasticsearch 集群，在该集群中对其进行索引和存储。

<!--more-->

我们先来配置启动一个可扩展的 Elasticsearch 集群，然后在 Kubernetes 集群中创建一个 Kibana 应用，最后通过 DaemonSet 来运行 Fluentd，以便它在每个 Kubernetes 工作节点上都可以运行一个 Pod。

> 如果你了解 EFK 的基本原理，只是为了测试可以直接使用 Kubernetes 官方提供的 addon 插件的资源清单，地址：[https://github.com/kubernetes/kubernetes/blob/master/cluster/addons/fluentd-elasticsearch/](https://github.com/kubernetes/kubernetes/blob/master/cluster/addons/fluentd-elasticsearch/)，直接安装即可。

本文在之前环境的基础上升级到最新版本，实验环境版本：

* Kubernetes：`v1.16.2`
* Elasticsearch 镜像：`docker.elastic.co/elasticsearch/elasticsearch:7.6.2`
* Kibana 镜像：`docker.elastic.co/kibana/kibana:7.6.2`
* Fluentd 镜像：`quay.io/fluentd_elasticsearch/fluentd:v3.0.1`
* elastalert 镜像：`jertel/elastalert-docker:0.2.4`
* Rook Ceph 镜像：`rook/ceph:v1.2.1`


## 创建 Elasticsearch 集群
在创建 Elasticsearch 集群之前，我们先创建一个命名空间，我们将在其中安装所有日志相关的资源对象。

新建一个 kube-logging.yaml 文件：
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: logging
```

然后通过 kubectl 创建该资源清单，创建一个名为 logging 的 namespace：
```shell
$ kubectl create -f kube-logging.yaml
namespace/logging created
$ kubectl get ns
NAME           STATUS    AGE
default        Active    244d
istio-system   Active    100d
kube-ops       Active    179d
kube-public    Active    244d
kube-system    Active    244d
logging        Active    4h
monitoring     Active    35d
```

现在创建了一个命名空间来存放我们的日志相关资源，接下来可以部署 EFK 相关组件，首先开始部署一个3节点的 Elasticsearch 集群。

这里我们使用3个 Elasticsearch Pod 来避免高可用下多节点集群中出现的“脑裂”问题，当一个或多个节点无法与其他节点通信时会产生“脑裂”，可能会出现几个主节点。

> 了解更多 Elasticsearch 集群脑裂问题，可以查看文档[https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-node.html#split-brain](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-node.html#split-brain)


一个关键点是您应该设置参数`discover.zen.minimum_master_nodes=N/2+1`，其中`N`是 Elasticsearch 集群中符合主节点的节点数，比如我们这里3个节点，意味着`N`应该设置为2。这样，如果一个节点暂时与集群断开连接，则另外两个节点可以选择一个新的主节点，并且集群可以在最后一个节点尝试重新加入时继续运行，在扩展 Elasticsearch 集群时，一定要记住这个参数。
<!--adsense-text-->
首先创建一个名为 elasticsearch 的无头服务，新建文件 elasticsearch-svc.yaml，文件内容如下：
```yaml
kind: Service
apiVersion: v1
metadata:
  name: elasticsearch
  namespace: logging
  labels:
    app: elasticsearch
spec:
  selector:
    app: elasticsearch
  clusterIP: None
  ports:
    - port: 9200
      name: rest
    - port: 9300
      name: inter-node
```

定义了一个名为 elasticsearch 的 Service，指定标签 `app=elasticsearch`，当我们将 Elasticsearch StatefulSet 与此服务关联时，服务将返回带有标签 `app=elasticsearch`的 Elasticsearch Pods 的 DNS A 记录，然后设置 `clusterIP=None`，将该服务设置成无头服务。最后，我们分别定义端口9200、9300，分别用于与 REST API 交互，以及用于节点间通信。

使用 kubectl 直接创建上面的服务资源对象：
```shell
$ kubectl create -f elasticsearch-svc.yaml
service/elasticsearch created
$ kubectl get services --namespace=logging
Output
NAME            TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)             AGE
elasticsearch   ClusterIP   None         <none>        9200/TCP,9300/TCP   26s
```

现在我们已经为 Pod 设置了无头服务和一个稳定的域名`.elasticsearch.logging.svc.cluster.local`，接下来我们通过 StatefulSet 来创建具体的 Elasticsearch 的 Pod 应用。


Kubernetes StatefulSet 允许我们为 Pod 分配一个稳定的标识和持久化存储，Elasticsearch 需要稳定的存储来保证 Pod 在重新调度或者重启后的数据依然不变，所以需要使用 StatefulSet 来管理 Pod。

> 要了解更多关于 StaefulSet 的信息，可以查看官网关于 StatefulSet 的相关文档：[https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)。


新建名为 elasticsearch-statefulset.yaml 的资源清单文件，首先粘贴下面内容：
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: es
  namespace: logging
spec:
  serviceName: elasticsearch
  replicas: 3
  selector:
    matchLabels:
      app: elasticsearch
  template:
    metadata:
      labels:
        app: elasticsearch
```

该内容中，我们定义了一个名为 es 的 StatefulSet 对象，然后定义`serviceName=elasticsearch`和前面创建的 Service 相关联，这可以确保使用以下 DNS 地址访问 StatefulSet 中的每一个 Pod：`es-[0,1,2].elasticsearch.logging.svc.cluster.local`，其中[0,1,2]对应于已分配的 Pod 序号。

然后指定3个副本，将 matchLabels 设置为`app=elasticsearch`，所以 Pod 的模板部分`.spec.template.metadata.lables`也必须包含`app=elasticsearch`标签。

然后定义 Pod 模板部分内容：
```yaml
...
  spec:
    containers:
    - name: elasticsearch
      image: docker.elastic.co/elasticsearch/elasticsearch:7.6.2
      resources:
        limits:
          cpu: 1000m
        requests:
          cpu: 100m
      ports:
      - containerPort: 9200
        name: rest
        protocol: TCP
      - containerPort: 9300
        name: inter-node
        protocol: TCP
      volumeMounts:
      - name: data
        mountPath: /usr/share/elasticsearch/data
      env:
        - name: cluster.name
          value: k8s-logs
        - name: node.name
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: cluster.initial_master_nodes
          value: "es-0,es-1,es-2"
        - name: discovery.zen.minimum_master_nodes
          value: "2"
        - name: discovery.seed_hosts
          value: "elasticsearch"
        - name: ES_JAVA_OPTS
          value: "-Xms512m -Xmx512m"
        - name: network.host
          value: "0.0.0.0"
```

该部分是定义 StatefulSet 中的 Pod，暴露了9200和9300两个端口，注意名称要和上面定义的 Service 保持一致。然后通过 volumeMount 声明了数据持久化目录，下面我们再来定义 VolumeClaims。最后就是我们在容器中设置的一些环境变量了：

* cluster.name：Elasticsearch 集群的名称，我们这里命名成 k8s-logs。
* node.name：节点的名称，通过 `metadata.name` 来获取。这将解析为 es-[0,1,2]，取决于节点的指定顺序。
* discovery.seed_hosts：此字段用于设置在 Elasticsearch 集群中节点相互连接的发现方法。由于我们之前配置的无头服务，我们的 Pod 具有唯一的 DNS 域`es-[0,1,2].elasticsearch.logging.svc.cluster.local`，因此我们相应地设置此变量。要了解有关 Elasticsearch 发现的更多信息，请参阅 Elasticsearch 官方文档：[https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-discovery.html](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-discovery.html)。
* discovery.zen.minimum_master_nodes：我们将其设置为`(N/2) + 1`，`N`是我们的群集中符合主节点的节点的数量。我们有3个 Elasticsearch 节点，因此我们将此值设置为2（向下舍入到最接近的整数）。要了解有关此参数的更多信息，请参阅官方 Elasticsearch 文档：[https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-node.html#split-brain](https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-node.html#split-brain)。
* ES_JAVA_OPTS：这里我们设置为`-Xms512m -Xmx512m`，告诉`JVM`使用`512 MB`的最小和最大堆。您应该根据群集的资源可用性和需求调整这些参数。要了解更多信息，请参阅设置堆大小的相关文档：[https://www.elastic.co/guide/en/elasticsearch/reference/current/heap-size.html](https://www.elastic.co/guide/en/elasticsearch/reference/current/heap-size.html)。

接下来添加关于 initContainer 的内容：
```yaml
...
    initContainers:
    - name: increase-vm-max-map
      image: busybox
      command: ["sysctl", "-w", "vm.max_map_count=262144"]
      securityContext:
        privileged: true
    - name: increase-fd-ulimit
      image: busybox
      command: ["sh", "-c", "ulimit -n 65536"]
      securityContext:
        privileged: true
```

这里我们定义了几个在主应用程序之前运行的 Init 容器，这些初始容器按照定义的顺序依次执行，执行完成后才会启动主应用容器。

第一个名为 increase-vm-max-map 的容器用来增加操作系统对`mmap`计数的限制，默认情况下该值可能太低，导致内存不足的错误，要了解更多关于该设置的信息，可以查看 Elasticsearch 官方文档说明：[https://www.elastic.co/guide/en/elasticsearch/reference/current/vm-max-map-count.html](https://www.elastic.co/guide/en/elasticsearch/reference/current/vm-max-map-count.html)。

最后一个初始化容器是用来执行`ulimit`命令增加打开文件描述符的最大数量的。

> 此外 [Elastisearch Notes for Production Use](https://www.elastic.co/guide/en/elasticsearch/reference/current/docker.html#_notes_for_production_use_and_defaults) 文档还提到了由于性能原因最好禁用 swap，当然对于 Kubernetes 集群而言，最好也是禁用 swap 分区的。

现在我们已经定义了主应用容器和它之前运行的 Init Containers 来调整一些必要的系统参数，接下来我们可以添加数据目录的持久化相关的配置，在 StatefulSet 中，使用 volumeClaimTemplates 来定义 volume 模板即可：
```yaml
...
  volumeClaimTemplates:
  - metadata:
      name: data
      labels:
        app: elasticsearch
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: rook-ceph-block
      resources:
        requests:
          storage: 50Gi
```

我们这里使用 volumeClaimTemplates 来定义持久化模板，Kubernetes 会使用它为 Pod 创建 PersistentVolume，设置访问模式为`ReadWriteOnce`，这意味着它只能被 mount 到单个节点上进行读写，然后最重要的是使用了一个 StorageClass 对象，这里我们就直接使用前面创建的 Ceph RBD 类型的名为 `rook-ceph-block` 的 StorageClass 对象即可。最后，我们指定了每个 PersistentVolume 的大小为 50GB，我们可以根据自己的实际需要进行调整该值。

完整的 Elasticsearch StatefulSet 资源清单文件内容如下：
```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: es
  namespace: logging
spec:
  serviceName: elasticsearch
  replicas: 3
  selector:
    matchLabels:
      app: elasticsearch
  template:
    metadata:
      labels: 
        app: elasticsearch
    spec:
      nodeSelector:
        es: log
      initContainers:
      - name: increase-vm-max-map
        image: busybox
        command: ["sysctl", "-w", "vm.max_map_count=262144"]
        securityContext:
          privileged: true
      - name: increase-fd-ulimit
        image: busybox
        command: ["sh", "-c", "ulimit -n 65536"]
        securityContext:
          privileged: true
      containers:
      - name: elasticsearch
        image: docker.elastic.co/elasticsearch/elasticsearch:7.6.2
        ports:
        - name: rest
          containerPort: 9200
        - name: inter
          containerPort: 9300
        resources:
          limits:
            cpu: 1000m
          requests:
            cpu: 1000m
        volumeMounts:
        - name: data
          mountPath: /usr/share/elasticsearch/data
        env:
        - name: cluster.name
          value: k8s-logs
        - name: node.name
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        - name: cluster.initial_master_nodes
          value: "es-0,es-1,es-2"
        - name: discovery.zen.minimum_master_nodes
          value: "2"
        - name: discovery.seed_hosts
          value: "elasticsearch"
        - name: ES_JAVA_OPTS
          value: "-Xms512m -Xmx512m"
        - name: network.host
          value: "0.0.0.0"
  volumeClaimTemplates:
  - metadata:
      name: data
      labels:
        app: elasticsearch
    spec:
      accessModes: [ "ReadWriteOnce" ]
      storageClassName: rook-ceph-block
      resources:
        requests:
          storage: 50Gi    
```

现在直接使用 kubectl 工具部署即可：
```shell
$ kubectl create -f elasticsearch-statefulset.yaml
statefulset.apps/es created
```

添加成功后，可以看到 logging 命名空间下面的所有的资源对象：
```shell
$ kubectl get sts -n logging
NAME   READY   AGE
es     3/3     83m
$ kubectl get pods -n logging
NAME                      READY   STATUS    RESTARTS   AGE
es-0                      1/1     Running   0          83m
es-1                      1/1     Running   0          82m
es-2                      1/1     Running   0          81m
$ kubectl get svc -n logging
NAME            TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)             AGE
elasticsearch   ClusterIP   None             <none>        9200/TCP,9300/TCP   20h
```

Pods 部署完成后，我们可以通过请求一个 REST API 来检查 Elasticsearch 集群是否正常运行。使用下面的命令将本地端口9200 转发到 Elasticsearch 节点（如es-0）对应的端口：
```shell
$ kubectl port-forward es-0 9200:9200 --namespace=logging
Forwarding from 127.0.0.1:9200 -> 9200
Forwarding from [::1]:9200 -> 9200
```

然后，在另外的终端窗口中，执行如下请求：
```shell
$ curl http://localhost:9200/_cluster/state?pretty
```

正常来说，应该会看到类似于如下的信息：
```shell
{
  "cluster_name" : "k8s-logs",
  "compressed_size_in_bytes" : 348,
  "cluster_uuid" : "QD06dK7CQgids-GQZooNVw",
  "version" : 3,
  "state_uuid" : "mjNIWXAzQVuxNNOQ7xR-qg",
  "master_node" : "IdM5B7cUQWqFgIHXBp0JDg",
  "blocks" : { },
  "nodes" : {
    "u7DoTpMmSCixOoictzHItA" : {
      "name" : "es-1",
      "ephemeral_id" : "ZlBflnXKRMC4RvEACHIVdg",
      "transport_address" : "10.244.4.191:9300",
      "attributes" : { }
    },
    "IdM5B7cUQWqFgIHXBp0JDg" : {
      "name" : "es-0",
      "ephemeral_id" : "JTk1FDdFQuWbSFAtBxdxAQ",
      "transport_address" : "10.244.2.215:9300",
      "attributes" : { }
    },
    "R8E7xcSUSbGbgrhAdyAKmQ" : {
      "name" : "es-2",
      "ephemeral_id" : "9wv6ke71Qqy9vk2LgJTqaA",
      "transport_address" : "10.244.40.4:9300",
      "attributes" : { }
    }
  },
...
```

看到上面的信息就表明我们名为 k8s-logs 的 Elasticsearch 集群成功创建了3个节点：es-0，es-1，和es-2，当前主节点是 es-0。


## 创建 Kibana 服务
Elasticsearch 集群启动成功了，接下来我们可以来部署 Kibana 服务，新建一个名为 kibana.yaml 的文件，对应的文件内容如下：
```yaml
apiVersion: v1
kind: Service
metadata:
  name: kibana
  namespace: logging
  labels:
    app: kibana
spec:
  ports:
  - port: 5601
  type: NodePort
  selector:
    app: kibana

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kibana
  namespace: logging
  labels:
    app: kibana
spec:
  selector:
    matchLabels:
      app: kibana
  template:
    metadata:
      labels:
        app: kibana
    spec:
      nodeSelector:
        es: log
      containers:
      - name: kibana
        image: docker.elastic.co/kibana/kibana:7.6.2
        resources:
          limits:
            cpu: 1000m
          requests:
            cpu: 1000m
        env:
        - name: ELASTICSEARCH_HOSTS
          value: http://elasticsearch:9200
        ports:
        - containerPort: 5601
```

上面我们定义了两个资源对象，一个 Service 和 Deployment，为了测试方便，我们将 Service 设置为了 NodePort 类型，Kibana Pod 中配置都比较简单，唯一需要注意的是我们使用 `ELASTICSEARCH_HOSTS` 这个环境变量来设置Elasticsearch 集群的端点和端口，直接使用 Kubernetes DNS 即可，此端点对应服务名称为 elasticsearch，由于是一个 headless service，所以该域将解析为3个 Elasticsearch Pod 的 IP 地址列表。
<!--adsense-text-->
配置完成后，直接使用 kubectl 工具创建：
```shell
$ kubectl create -f kibana.yaml
service/kibana created
deployment.apps/kibana created
```

创建完成后，可以查看 Kibana Pod 的运行状态：
```shell
$ kubectl get pods --namespace=logging
NAME                      READY   STATUS    RESTARTS   AGE
es-0                      1/1     Running   0          85m
es-1                      1/1     Running   0          84m
es-2                      1/1     Running   0          83m
kibana-5c565c47dd-xj4bd   1/1     Running   0          80m
$ kubectl get svc -n logging
NAME            TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)             AGE
elasticsearch   ClusterIP   None            <none>        9200/TCP,9300/TCP   3h22m
kibana          NodePort    10.111.223.99   <none>        5601:31139/TCP      3h20m
```

如果 Pod 已经是 Running 状态了，证明应用已经部署成功了，然后可以通过 NodePort 来访问 Kibana 这个服务，在浏览器中打开`http://<任意节点IP>:31139`即可，如果看到如下欢迎界面证明 Kibana 已经成功部署到了 Kubernetes集群之中。

![kibana welcome](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200427174820.png)


## 部署 Fluentd
`Fluentd` 是一个高效的日志聚合器，是用 Ruby 编写的，并且可以很好地扩展。对于大部分企业来说，Fluentd 足够高效并且消耗的资源相对较少，另外一个工具`Fluent-bit`更轻量级，占用资源更少，但是插件相对 Fluentd 来说不够丰富，所以整体来说，Fluentd 更加成熟，使用更加广泛，所以我们这里也同样使用 Fluentd 来作为日志收集工具。

### 工作原理
Fluentd 通过一组给定的数据源抓取日志数据，处理后（转换成结构化的数据格式）将它们转发给其他服务，比如 Elasticsearch、对象存储等等。Fluentd 支持超过300个日志存储和分析服务，所以在这方面是非常灵活的。主要运行步骤如下：

* 首先 Fluentd 从多个日志源获取数据
* 结构化并且标记这些数据
* 然后根据匹配的标签将数据发送到多个目标服务去

![fluentd 架构](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/7moPNc.jpg)


### 配置
一般来说我们是通过一个配置文件来告诉 Fluentd 如何采集、处理数据的，下面简单和大家介绍下 Fluentd 的配置方法。

#### 日志源配置
比如我们这里为了收集 Kubernetes 节点上的所有容器日志，就需要做如下的日志源配置：
```
<source>
  @id fluentd-containers.log
  @type tail                             # Fluentd 内置的输入方式，其原理是不停地从源文件中获取新的日志。
  path /var/log/containers/*.log         # 挂载的服务器Docker容器日志地址
  pos_file /var/log/es-containers.log.pos
  tag raw.kubernetes.*                   # 设置日志标签
  read_from_head true
  <parse>                                # 多行格式化成JSON
    @type multi_format                   # 使用 multi-format-parser 解析器插件
    <pattern>
      format json                        # JSON 解析器
      time_key time                      # 指定事件时间的时间字段
      time_format %Y-%m-%dT%H:%M:%S.%NZ  # 时间格式
    </pattern>
    <pattern>
      format /^(?<time>.+) (?<stream>stdout|stderr) [^ ]* (?<log>.*)$/
      time_format %Y-%m-%dT%H:%M:%S.%N%:z
    </pattern>
  </parse>
</source>
```

上面配置部分参数说明如下：

* id：表示引用该日志源的唯一标识符，该标识可用于进一步过滤和路由结构化日志数据
* type：Fluentd 内置的指令，`tail` 表示 Fluentd 从上次读取的位置通过 tail 不断获取数据，另外一个是 `http` 表示通过一个 GET 请求来收集数据。
* path：`tail` 类型下的特定参数，告诉 Fluentd 采集 `/var/log/containers` 目录下的所有日志，这是 docker 在 Kubernetes 节点上用来存储运行容器 stdout 输出日志数据的目录。
* pos_file：检查点，如果 Fluentd 程序重新启动了，它将使用此文件中的位置来恢复日志数据收集。
* tag：用来将日志源与目标或者过滤器匹配的自定义字符串，Fluentd 匹配源/目标标签来路由日志数据。


#### 路由配置
上面是日志源的配置，接下来看看如何将日志数据发送到 Elasticsearch：
```
<match **>

@id elasticsearch

@type elasticsearch

@log_level info

include_tag_key true

type_name fluentd

host "#{ENV['OUTPUT_HOST']}"

port "#{ENV['OUTPUT_PORT']}"

logstash_format true

<buffer>

@type file

path /var/log/fluentd-buffers/kubernetes.system.buffer

flush_mode interval

retry_type exponential_backoff

flush_thread_count 2

flush_interval 5s

retry_forever

retry_max_interval 30

chunk_limit_size "#{ENV['OUTPUT_BUFFER_CHUNK_LIMIT']}"

queue_limit_length "#{ENV['OUTPUT_BUFFER_QUEUE_LIMIT']}"

overflow_action block

</buffer>
```

* match：标识一个目标标签，后面是一个匹配日志源的正则表达式，我们这里想要捕获所有的日志并将它们发送给 Elasticsearch，所以需要配置成`**`。
* id：目标的一个唯一标识符。
* type：支持的输出插件标识符，我们这里要输出到 Elasticsearch，所以配置成 elasticsearch，这是 Fluentd 的一个内置插件。
* log_level：指定要捕获的日志级别，我们这里配置成 `info`，表示任何该级别或者该级别以上（INFO、WARNING、ERROR）的日志都将被路由到 Elsasticsearch。
* host/port：定义 Elasticsearch 的地址，也可以配置认证信息，我们的 Elasticsearch 不需要认证，所以这里直接指定 host 和 port 即可。
* logstash_format：Elasticsearch 服务对日志数据构建反向索引进行搜索，将 logstash_format 设置为 `true`，Fluentd 将会以 logstash 格式来转发结构化的日志数据。
* Buffer： Fluentd 允许在目标不可用时进行缓存，比如，如果网络出现故障或者 Elasticsearch 不可用的时候。缓冲区配置也有助于降低磁盘的 IO。

#### 过滤
由于 Kubernetes 集群中应用太多，也还有很多历史数据，所以我们可以只将某些应用的日志进行收集，比如我们只采集具有 `logging=true` 这个 Label 标签的 Pod 日志，这个时候就需要使用 filter，如下所示：
```yaml
# 删除无用的属性
<filter kubernetes.**>
  @type record_transformer
  remove_keys $.docker.container_id,$.kubernetes.container_image_id,$.kubernetes.pod_id,$.kubernetes.namespace_id,$.kubernetes.master_url,$.kubernetes.labels.pod-template-hash
</filter>
# 只保留具有logging=true标签的Pod日志
<filter kubernetes.**>
  @id filter_log
  @type grep
  <regexp>
    key $.kubernetes.labels.logging
    pattern ^true$
  </regexp>
</filter>
```

### 安装
要收集 Kubernetes 集群的日志，直接用 DasemonSet 控制器来部署 Fluentd 应用，这样，它就可以从 Kubernetes 节点上采集日志，确保在集群中的每个节点上始终运行一个 Fluentd 容器。当然可以直接使用 Helm 来进行一键安装，为了能够了解更多实现细节，我们这里还是采用手动方法来进行安装。

首先，我们通过 ConfigMap 对象来指定 Fluentd 配置文件，新建 fluentd-configmap.yaml 文件，文件内容如下：
```yaml
kind: ConfigMap
apiVersion: v1
metadata:
  name: fluentd-config
  namespace: logging
data:
  system.conf: |-
    <system>
      root_dir /tmp/fluentd-buffers/
    </system>
  containers.input.conf: |-
    <source>
      @id fluentd-containers.log
      @type tail                              # Fluentd 内置的输入方式，其原理是不停地从源文件中获取新的日志。
      path /var/log/containers/*.log          # 挂载的服务器Docker容器日志地址
      pos_file /var/log/es-containers.log.pos
      tag raw.kubernetes.*                    # 设置日志标签
      read_from_head true
      <parse>                                 # 多行格式化成JSON
        @type multi_format                    # 使用 multi-format-parser 解析器插件
        <pattern>
          format json                         # JSON解析器
          time_key time                       # 指定事件时间的时间字段
          time_format %Y-%m-%dT%H:%M:%S.%NZ   # 时间格式
        </pattern>
        <pattern>
          format /^(?<time>.+) (?<stream>stdout|stderr) [^ ]* (?<log>.*)$/
          time_format %Y-%m-%dT%H:%M:%S.%N%:z
        </pattern>
      </parse>
    </source>
    # 在日志输出中检测异常，并将其作为一条日志转发 
    # https://github.com/GoogleCloudPlatform/fluent-plugin-detect-exceptions
    <match raw.kubernetes.**>           # 匹配tag为raw.kubernetes.**日志信息
      @id raw.kubernetes
      @type detect_exceptions           # 使用detect-exceptions插件处理异常栈信息
      remove_tag_prefix raw             # 移除 raw 前缀
      message log                       
      stream stream                     
      multiline_flush_interval 5
      max_bytes 500000
      max_lines 1000
    </match>

    <filter **>  # 拼接日志
      @id filter_concat
      @type concat                # Fluentd Filter 插件，用于连接多个事件中分隔的多行日志。
      key message
      multiline_end_regexp /\n$/  # 以换行符“\n”拼接
      separator ""
    </filter> 

    # 添加 Kubernetes metadata 数据
    <filter kubernetes.**>
      @id filter_kubernetes_metadata
      @type kubernetes_metadata
    </filter>

    # 修复 ES 中的 JSON 字段
    # 插件地址：https://github.com/repeatedly/fluent-plugin-multi-format-parser
    <filter kubernetes.**>
      @id filter_parser
      @type parser                # multi-format-parser多格式解析器插件
      key_name log                # 在要解析的记录中指定字段名称。
      reserve_data true           # 在解析结果中保留原始键值对。
      remove_key_name_field true  # key_name 解析成功后删除字段。
      <parse>
        @type multi_format
        <pattern>
          format json
        </pattern>
        <pattern>
          format none
        </pattern>
      </parse>
    </filter>

    # 删除一些多余的属性
    <filter kubernetes.**>
      @type record_transformer
      remove_keys $.docker.container_id,$.kubernetes.container_image_id,$.kubernetes.pod_id,$.kubernetes.namespace_id,$.kubernetes.master_url,$.kubernetes.labels.pod-template-hash
    </filter>

    # 只保留具有logging=true标签的Pod日志
    <filter kubernetes.**>
      @id filter_log
      @type grep
      <regexp>
        key $.kubernetes.labels.logging
        pattern ^true$
      </regexp>
    </filter>
  
  ###### 监听配置，一般用于日志聚合用 ######
  forward.input.conf: |-
    # 监听通过TCP发送的消息
    <source>
      @id forward
      @type forward
    </source>

  output.conf: |-
    <match **>
      @id elasticsearch
      @type elasticsearch
      @log_level info
      include_tag_key true
      host elasticsearch
      port 9200
      logstash_format true
      logstash_prefix k8s  # 设置 index 前缀为 k8s
      request_timeout    30s
      <buffer>
        @type file
        path /var/log/fluentd-buffers/kubernetes.system.buffer
        flush_mode interval
        retry_type exponential_backoff
        flush_thread_count 2
        flush_interval 5s
        retry_forever
        retry_max_interval 30
        chunk_limit_size 2M
        queue_limit_length 8
        overflow_action block
      </buffer>
    </match>
```

上面配置文件中我们只配置了 docker 容器日志目录，收集到数据经过处理后发送到 `elasticsearch:9200` 服务。

然后新建一个 fluentd-daemonset.yaml 的文件，文件内容如下：
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: fluentd-es
  namespace: logging
  labels:
    k8s-app: fluentd-es
    kubernetes.io/cluster-service: "true"
    addonmanager.kubernetes.io/mode: Reconcile
---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: fluentd-es
  labels:
    k8s-app: fluentd-es
    kubernetes.io/cluster-service: "true"
    addonmanager.kubernetes.io/mode: Reconcile
rules:
- apiGroups:
  - ""
  resources:
  - "namespaces"
  - "pods"
  verbs:
  - "get"
  - "watch"
  - "list"
---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: fluentd-es
  labels:
    k8s-app: fluentd-es
    kubernetes.io/cluster-service: "true"
    addonmanager.kubernetes.io/mode: Reconcile
subjects:
- kind: ServiceAccount
  name: fluentd-es
  namespace: logging
  apiGroup: ""
roleRef:
  kind: ClusterRole
  name: fluentd-es
  apiGroup: ""
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd-es
  namespace: logging
  labels:
    k8s-app: fluentd-es
    kubernetes.io/cluster-service: "true"
    addonmanager.kubernetes.io/mode: Reconcile
spec:
  selector:
    matchLabels:
      k8s-app: fluentd-es
  template:
    metadata:
      labels:
        k8s-app: fluentd-es
        kubernetes.io/cluster-service: "true"
      # 此注释确保如果节点被驱逐，fluentd不会被驱逐，支持关键的基于 pod 注释的优先级方案。
      annotations:
        scheduler.alpha.kubernetes.io/critical-pod: ''
    spec:
      serviceAccountName: fluentd-es
      containers:
      - name: fluentd-es
        image: quay.io/fluentd_elasticsearch/fluentd:v3.0.1
        env:
        - name: FLUENTD_ARGS
          value: --no-supervisor -q
        resources:
          limits:
            memory: 500Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /data/docker/containers
          readOnly: true
        - name: config-volume
          mountPath: /etc/fluent/config.d
      nodeSelector:
        beta.kubernetes.io/fluentd-ds-ready: "true"
      tolerations:
      - operator: Exists
      terminationGracePeriodSeconds: 30
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /data/docker/containers
      - name: config-volume
        configMap:
          name: fluentd-config
```

我们将上面创建的 fluentd-config 这个 ConfigMap 对象通过 volumes 挂载到了 Fluentd 容器中，另外为了能够灵活控制哪些节点的日志可以被收集，所以我们这里还添加了一个 nodSelector 属性：
```yaml
nodeSelector:
  beta.kubernetes.io/fluentd-ds-ready: "true"
```

意思就是要想采集节点的日志，那么我们就需要给节点打上上面的标签，比如我们这里只给节点4和节点6打上了该标签：
```shell
$ kubectl get nodes --show-labels
NAME          STATUS   ROLES    AGE    VERSION   LABELS
ydzs-master   Ready    master   170d   v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-master,kubernetes.io/os=linux,node-role.kubernetes.io/master=
ydzs-node1    Ready    <none>   170d   v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,es=log,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node1,kubernetes.io/os=linux
ydzs-node2    Ready    <none>   170d   v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,com=youdianzhishi,es=log,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node2,kubernetes.io/os=linux
ydzs-node3    Ready    <none>   169d   v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,es=log,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node3,kubernetes.io/os=linux,monitor=prometheus
ydzs-node4    Ready    <none>   169d   v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/fluentd-ds-ready=true,beta.kubernetes.io/os=linux,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node4,kubernetes.io/os=linux
ydzs-node5    Ready    <none>   96d    v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/os=linux,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node5,kubernetes.io/os=linux
ydzs-node6    Ready    <none>   96d    v1.16.2   beta.kubernetes.io/arch=amd64,beta.kubernetes.io/fluentd-ds-ready=true,beta.kubernetes.io/os=linux,kubernetes.io/arch=amd64,kubernetes.io/hostname=ydzs-node6,kubernetes.io/os=linux
```

> 如果你需要在其他节点上采集日志，则需要给对应节点打上标签，使用如下命令：`kubectl label nodes node名 beta.kubernetes.io/fluentd-ds-ready=true`。


另外由于我们的集群使用的是 kubeadm 搭建的，默认情况下 master 节点有污点，所以如果要想也收集 master 节点的日志，则需要添加上容忍：
```yaml
tolerations:
- operator: Exists
```

另外需要注意的地方是，我这里的测试环境更改了 docker 的根目录：
```shell
$ docker info
...
Docker Root Dir: /data/docker
...
```

所以上面要获取 docker 的容器目录需要更改成`/data/docker/containers`，这个地方非常重要，当然如果你没有更改 docker 根目录则使用默认的`/var/lib/docker/containers`目录即可。

<!--adsense-text-->

分别创建上面的 ConfigMap 对象和 DaemonSet：
```shell
$ kubectl create -f fluentd-configmap.yaml
configmap "fluentd-config" created
$ kubectl create -f fluentd-daemonset.yaml
serviceaccount "fluentd-es" created
clusterrole.rbac.authorization.k8s.io "fluentd-es" created
clusterrolebinding.rbac.authorization.k8s.io "fluentd-es" created
daemonset.apps "fluentd-es" created
```

创建完成后，查看对应的 Pods 列表，检查是否部署成功：
```shell
$ kubectl get pods -n logging
NAME                      READY   STATUS    RESTARTS   AGE
es-0                      1/1     Running   0          108m
es-1                      1/1     Running   0          107m
es-2                      1/1     Running   0          106m
fluentd-es-h4jl2          1/1     Running   0          100m
fluentd-es-vngmd          1/1     Running   0          100m
kibana-5c565c47dd-xj4bd   1/1     Running   0          103m
```

Fluentd 启动成功后，这个时候就可以发送日志到 ES 了，但是我们这里是过滤了只采集具有 `logging=true` 标签的 Pod 日志，所以现在还没有任何数据会被采集。

下面我们部署一个简单的测试应用， 新建 counter.yaml 文件，文件内容如下：
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: counter
  labels:
    logging: "true"  # 一定要具有该标签才会被采集
spec:
  containers:
  - name: count
    image: busybox
    args: [/bin/sh, -c,
            'i=0; while true; do echo "$i: $(date)"; i=$((i+1)); sleep 1; done']
```

该 Pod 只是简单将日志信息打印到 `stdout`，所以正常来说 Fluentd 会收集到这个日志数据，在 Kibana 中也就可以找到对应的日志数据了，使用 kubectl 工具创建该 Pod：
```shell
$ kubectl create -f counter.yaml
$ kubectl get pods
NAME                             READY   STATUS    RESTARTS   AGE
counter                          1/1     Running   0          9h
```

Pod 创建并运行后，回到 Kibana Dashboard 页面，点击左侧最下面的 `management` 图标，然后点击 Kibana 下面的 `Index Patterns` 开始导入索引数据：

![create index](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200427175019.png)

在这里可以配置我们需要的 Elasticsearch 索引，前面 Fluentd 配置文件中我们采集的日志使用的是 logstash 格式，定义了一个 `k8s` 的前缀，所以这里只需要在文本框中输入`k8s-*`即可匹配到 Elasticsearch 集群中采集的 Kubernetes 集群日志数据，然后点击下一步，进入以下页面：

![index config](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200427175255.png)

在该页面中配置使用哪个字段按时间过滤日志数据，在下拉列表中，选择`@timestamp`字段，然后点击`Create index pattern`，创建完成后，点击左侧导航菜单中的`Discover`，然后就可以看到一些直方图和最近采集到的日志数据了：

![log data](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200427175432.png)


现在的数据就是上面 Counter 应用的日志，如果还有其他的应用，我们也可以筛选过滤：

![counter log data](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200427193356.png)

我们也可以通过其他元数据来过滤日志数据，比如您可以单击任何日志条目以查看其他元数据，如容器名称，Kubernetes 节点，命名空间等。


## 日志分析
上面我们已经可以将应用日志收集起来了，下面我们来使用一个应用演示如何分析采集的日志。示例应用会输出如下所示的 JSON 格式的日志信息：
```json
{"LOGLEVEL":"WARNING","serviceName":"msg-processor","serviceEnvironment":"staging","message":"WARNING client connection terminated unexpectedly."}
{"LOGLEVEL":"INFO","serviceName":"msg-processor","serviceEnvironment":"staging","message":"","eventsNumber":5}
{"LOGLEVEL":"INFO","serviceName":"msg-receiver-api":"msg-receiver-api","serviceEnvironment":"staging","volume":14,"message":"API received messages"}
{"LOGLEVEL":"ERROR","serviceName":"msg-receiver-api","serviceEnvironment":"staging","message":"ERROR Unable to upload files for processing"}
```

因为 JSON 格式的日志解析非常容易，当我们将日志结构化传输到 ES 过后，我们可以根据特定的字段值而不是文本搜索日志数据，当然纯文本格式的日志我们也可以进行结构化，但是这样每个应用的日志格式不统一，都需要单独进行结构化，非常麻烦，所以建议将日志格式统一成 JSON 格式输出。

我们这里的示例应用会定期输出不同类型的日志消息，包含不同日志级别（INFO/WARN/ERROR）的日志，一行 JSON 日志就是我们收集的一条日志消息，该消息通过 fluentd 进行采集发送到 Elasticsearch。这里我们会使用到 fluentd 里面的自动 JSON 解析插件，默认情况下，fluentd 会将每个日志文件的一行作为名为 `log` 的字段进行发送，并自动添加其他字段，比如 `tag` 标识容器，`stream` 标识 stdout 或者 stderr。

由于在 fluentd 配置中我们添加了如下所示的过滤器：
```yaml
<filter kubernetes.**>
  @id filter_parser
  @type parser                # multi-format-parser多格式解析器插件
  key_name log                # 在要解析的记录中指定字段名称
  reserve_data true           # 在解析结果中保留原始键值对
  remove_key_name_field true  # key_name 解析成功后删除字段。
  <parse>
    @type multi_format
    <pattern>
      format json
    </pattern>
    <pattern>
      format none
    </pattern>
  </parse>
</filter>
```

该过滤器使用 `json` 和 `none` 两个插件将 JSON 数据进行结构化，这样就会把 JSON 日志里面的属性解析成一个一个的字段，解析生效过后记得刷新 Kibana 的索引字段，否则会识别不了这些字段，通过 `管理` -> `Index Pattern` 点击刷新字段列表即可。

下面我们将示例应用部署到 Kubernetes 集群中：(dummylogs.yaml)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dummylogs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dummylogs
  template:
    metadata:
      labels:
        app: dummylogs
        logging: "true"  # 要采集日志需要加上该标签
    spec:
      containers:
      - name: dummy
        image: cnych/dummylogs:latest
        args:
        - msg-processor
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dummylogs2
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dummylogs2
  template:
    metadata:
      labels:
        app: dummylogs2
        logging: "true"  # 要采集日志需要加上该标签
    spec:
      containers:
      - name: dummy
        image: cnych/dummylogs:latest
        args:
        - msg-receiver-api
```

直接部署上面的应用即可：
```shell
$ kubectl apply -f dummylogs.yaml
$ kubectl get pods -l logging=true
NAME                         READY   STATUS    RESTARTS   AGE
counter                      1/1     Running   0          22h
dummylogs-6f7b56579d-7js8n   1/1     Running   5          15h
dummylogs-6f7b56579d-wdnc6   1/1     Running   5          15h
dummylogs-6f7b56579d-x4twn   1/1     Running   5          15h
dummylogs2-d9b978d9b-bchks   1/1     Running   5          15h
dummylogs2-d9b978d9b-wv7rj   1/1     Running   5          15h
dummylogs2-d9b978d9b-z2r26   1/1     Running   5          15h
```

部署完成后 dummylogs 和 dummylogs2 两个应用就会开始输出不同级别的日志信息了，记得要给应用所在的节点打上 `beta.kubernetes.io/fluentd-ds-ready=true` 的标签，否则 fluentd 不会在对应的节点上运行也就不会收集日志了。正常情况下日志就已经可以被采集到 Elasticsearch 当中了，我们可以前往 Kibana 的 Dashboard 页面查看:

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428092342.png)

我们可以看到可用的字段中已经包含我们应用中的一些字段了。找到 `serviceName` 字段点击我们可以查看已经采集了哪些服务的消息：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428092559.png)

可以看到我们收到了来自 `msg-processor` 和 `msg-receiver-api` 的日志信息，在最近15分钟之内，`api` 服务产生的日志更多，点击后面的加号就可以只过滤该服务的日志数据：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428092903.png)

我们可以看到展示的日志数据的属性比较多，有时候可能不利于我们查看日志，此时我们可以筛选想要展示的字段:

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428093202.png)

我们可以根据自己的需求选择要显示的字段，现在查看消息的时候就根据清楚了：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428093343.png)

比如为了能够更加清晰的展示我们采集的日志数据，还可以将 `eventsNumber` 和 `serviceName` 字段选中添加：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428093646.png)

然后同样我们可以根据自己的需求来筛选需要查看的日志数据：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428093815.png)

如果你的 Elasticsearch 的查询语句比较熟悉的话，使用查询语句能实现的筛选功能更加强大，比如我们要查询 `mgs-processor` 和 `msg-receiver-api` 两个服务的日志，则可以使用如下所示的查询语句：
```shell
serviceName:msg-processor OR serviceName:msg-receiver-api
```

直接搜索框中输入上面的查询语句进行查询即可：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428094158.png)

接下来我们来创建一个图表来展示已经处理了多少 `msg-processor` 服务的日志信息。在 Kibana 中切换到 `Visualize` 页面，点击 `Create new visualization` 按钮选择 `Area`，选择 `k8s-*` 的索引，首先配置 Y 轴的数据，这里我们使用 `eventsNumber` 字段的 `Sum` 函数进行聚合：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428095222.png)

然后配置 X 轴数据使用 `Date Histogram` 类型的 `@timestamp` 字段：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428095344.png)

配置完成后点击右上角的 `Apply Changes` 按钮则就会在右侧展示出对应的图表信息：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428095631.png)

这个图表展示的就是最近15分钟内被处理的事件总数，当然我们也可以自己选择时间范围。我们还可以将 `msg-receiver-api` 事件的数量和已处理的消息总数进行关联，在该图表上添加另外一层数据，在 Y 轴上添加一个新指标，选择 `Add metrics` 和 `Y-axis`，然后同样选择 `sum` 聚合器，使用 `volume` 字段：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428100341.png)

点击 `Apply Changes` 按钮就可以同时显示两个服务事件的数据了。最后点击顶部的 `save` 来保存该图表，并为其添加一个名称。

在实际的应用中，我们可能对应用的错误日志更加关心，需要了解应用的运行情况，所以对于错误或者警告级别的日志进行统计也是非常有必要的。现在我们回到 `Discover` 页面，输入 `LOGLEVEL:ERROR OR LOGLEVEL:WARNING` 查询语句来过滤所有的错误和告警日志：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428101527.png)

错误日志相对较少，实际上我们这里的示例应用会每 15-20 分钟左右就会抛出4个错误信息，其余都是警告信息。同样现在我们还是用可视化的图表来展示下错误日志的情况。
<!--adsense-text-->
同样切换到 `Visualize` 页面，点击 `Create visualization`，选择 `Vertical Bar`，然后选中 `k8s-*` 的 Index Pattern。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428102104.png)

现在我们忽略 Y 轴，使用默认的 `Count` 设置来显示消息数量。首先点击 `Buckets` 下面的 `X-axis`，然后同样选择 `Date histogram`，然后点击下方的 `Add`，添加 `Sub-Bueckt`，选择 `Split series`:

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428102530.png)

然后我们可以通过指定的字段来分割条形图，选择 `Terms` 作为子聚合方式，然后选择 `serviceName.keyword` 字段，最后点击 `apply` 生成图表：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428102913.png)

现在上面的图表以不同的颜色来显示每个服务消息，接下来我们在搜索框中输入要查找的内容，因为现在的图表是每个服务的所有消息计数，包括正常和错误的日志，我们要过滤告警和错误的日志，同样输入 `LOGLEVEL:ERROR OR LOGLEVEL:WARNING` 查询语句进行搜索即可：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428103237.png)

从图表上可以看出来 `msg-processor` 服务问题较多，只有少量的是 `msg-receiver-api` 服务的，当然我们也可以只查看 `ERROR` 级别的日志统计信息：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428103446.png)

从图表上可以看出来基本上出现错误日志的情况下两个服务都会出现，所以这个时候我们就可以猜测两个服务的错误是非常相关的了，这对于我们去排查错误非常有帮助。最后也将该图表进行保存。

最后我们也可以将上面的两个图表添加到 `dashboard` 中，这样我们就可以在一个页面上组合各种可视化图表。切换到 `dashboard` 页面，然后点击 `Create New Dashboard` 按钮：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428104152.png)

选择 `Add an existing` 链接：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428104225.png)

然后选择上面我们创建的两个图表，添加完成后同样保存该 `dashboard` 即可：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428104516.png)

到这里我们就完成了通过 Fluentd 收集日志到 Elasticsearch，并通过 Kibana 对日志进行了分析可视化操作。

## 基于日志的报警
在生产环境中我们往往都会使用 Promethus 对应用的各项指标进行监控，但是往往应用的日志中也会产生一些错误日志，这些信息并不是都能够通过 metrics 提供数据的，所以为了避免出现太多的错误，我们还需要对错误日志进行监控报警。在 Elasticsearch 中，我们可以通过使用 `elastalert` 组件来完成这个工作。

[elastalert](https://github.com/Yelp/elastalert) 是 yelp 使用 python 开发的 elasticsearch 告警工具。`elastalert` 依照一定频率查询 ES，将查询结果对比告警阈值，超过阈值即进行告警。告警方式包括但不局限于邮箱、微信、钉钉等。

我们这里将 `elastalert` 部署到 Kubernetes 集群中，对应的资源清单文件如下所示：(elastalert.yaml)
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: elastalert-config
  namespace: logging
  labels:
    app: elastalert
data:
  elastalert_config: |-
    ---
    rules_folder: /opt/rules       # 指定规则的目录
    scan_subdirectories: false
    run_every:                     # 多久从 ES 中查询一次
      minutes: 1
    buffer_time:
      minutes: 15
    es_host: elasticsearch
    es_port: 9200
    writeback_index: elastalert
    use_ssl: False
    verify_certs: True
    alert_time_limit:             # 失败重试限制
      minutes: 2880
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: elastalert-rules
  namespace: logging
  labels:
    app: elastalert
data:
  rule_config.yaml: |-
    name: dummylogs error     # 规则名字，唯一值
    es_host: elasticsearch
    es_port: 9200
    
    type: any                 # 报警类型
    index: k8s-*              # es索引
    
    filter:                   # 过滤
    - query:
        query_string:
          query: "LOGLEVEL:ERROR"  # 报警条件

    alert:                    # 报警类型
    - "email"
    smtp_host: smtp.qq.com
    smtp_port: 587
    smtp_auth_file: /opt/auth/smtp_auth_file.yaml
    email_reply_to: 517554016@qq.com
    from_addr: 517554016@qq.com
    email:                  # 接受邮箱
    - "ych_1024@163.com"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elastalert
  namespace: logging
  labels:
    app: elastalert
spec:
  selector:
    matchLabels:
      app: elastalert
  template:
    metadata:
      labels:
        app: elastalert
    spec:
      containers:
      - name: elastalert
        image: jertel/elastalert-docker:0.2.4
        imagePullPolicy: IfNotPresent
        volumeMounts:
        - name: config
          mountPath: /opt/config
        - name: rules
          mountPath: /opt/rules
        - name: auth
          mountPath: /opt/auth
        resources:
          limits:
            cpu: 50m
            memory: 256Mi
          requests:
            cpu: 50m
            memory: 256Mi
      volumes:
      - name: auth
        secret:
          secretName: smtp-auth
      - name: rules
        configMap:
          name: elastalert-rules
      - name: config
        configMap:
          name: elastalert-config
          items:
          - key: elastalert_config
            path: elastalert_config.yaml
```

使用邮件进行报警的时候，需要指定一个 `smtp_auth_file` 的文件，文件中包含用户名和密码：(smtp_auth_file.yaml)
```yaml
user: "xxxxx@qq.com"       # 发送的邮箱地址
password: "ewwghfhdvjwnbjea"   # 不是qq邮箱的登录密码，是授权码
```

然后使用上面的文件创建一个对应的 Secret 资源对象：
```shell
$ kubectl create secret generic smtp-auth --from-file=smtp_auth_file.yaml -n logging
```

然后直接创建上面的 elastalert 应用：
```shell
$ kubectl apply -f elastalert.yaml
$ kubectl get pods -n logging -l app=elastalert
NAME                          READY   STATUS    RESTARTS   AGE
elastalert-64ccfbffcf-gd6xz   1/1     Running   0          102s
$ kubectl logs -f elastalert-64ccfbffcf-gd6xz -n logging
Elastic Version: 7.6.2
Reading Elastic 6 index mappings:
Reading index mapping 'es_mappings/6/silence.json'
Reading index mapping 'es_mappings/6/elastalert_status.json'
Reading index mapping 'es_mappings/6/elastalert.json'
Reading index mapping 'es_mappings/6/past_elastalert.json'
Reading index mapping 'es_mappings/6/elastalert_error.json'
Deleting index elastalert_status.
New index elastalert created
Done!
```

看到上面的日志信息就证明 elastalert 应用部署成功了。在 Elasticsearch 中也可以看到几个相关的 Index ：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428121319.png)

由于我们的示例应用会隔一段时间就产生 ERROR 级别的错误日志，所以正常情况下我们就可以收到如下所示的邮件信息了：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200428121055.png)

除此之外我们也可以配置将报警信息发往 [企业微信](https://github.com/anjia0532/elastalert-wechat-plugin) 或者 [钉钉](https://github.com/xuyaoqiang/elastalert-dingtalk-plugin)，还可以安装一个 elastalert 的 [Kibana 插件](https://github.com/bitsensor/elastalert-kibana-plugin)，用于在 Kibana 页面上进行可视化操作。

关于 elastalert 更多的操作和使用说明，大家可以查看官方文档了解更多：[https://elastalert.readthedocs.io/en/latest/](https://elastalert.readthedocs.io/en/latest/)。


> 参考文档: [How To Set Up an Elasticsearch, Fluentd and Kibana (EFK) Logging Stack on Kubernetes](https://www.digitalocean.com/community/tutorials/how-to-set-up-an-elasticsearch-fluentd-and-kibana-efk-logging-stack-on-kubernetes)

<!--adsense-self-->
