---
title: 使用 Elastic 技术栈构建 K8S 全栈监控(1/4)
subtitle: 搭建 ElasticSearch 集群环境
date: 2020-07-09
keywords: ["elastic", "kubernetes"]
tags: ["elastic", "kubernetes", "kibana"]
slug: k8s-monitor-use-elastic-stack-1
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200709104733.png",
      desc: "https://unsplash.com/photos/bK1hmAK3D78",
    },
  ]
category: "kubernetes"
---

在本系列文章中，我们将学习如何使用 Elastic 技术栈来为 Kubernetes 构建监控环境。可观测性的目标是为生产环境提供运维工具来检测服务不可用的情况（比如服务宕机、错误或者响应变慢等），并且保留一些可以排查的信息，以帮助我们定位问题。总的来说主要包括 3 个方面：

- 监控指标提供系统各个组件的时间序列数据，比如 CPU、内存、磁盘、网络等信息，通常可以用来显示系统的整体状况以及检测某个时间的异常行为
- 日志为运维人员提供了一个数据来分析系统的一些错误行为，通常将系统、服务和应用的日志集中收集在同一个数据库中
- 追踪或者 APM（应用性能监控）提供了一个更加详细的应用视图，可以将服务执行的每一个请求和步骤都记录下来（比如 HTTP 调用、数据库查询等），通过追踪这些数据，我们可以检测到服务的性能，并相应地改进或修复我们的系统。

<!--more-->

![](https://picdn.youdianzhishi.com/images/20200626091556.png)

本文我们就将在 Kubernetes 集群中使用由 ElasticSearch、Kibana、Filebeat、Metricbeat 和 APM-Server 组成的 Elastic 技术栈来监控系统环境。为了更好地去了解这些组件的配置，我们这里将采用手写资源清单文件的方式来安装这些组件，当然我们也可以使用 Helm 等其他工具来快速安装配置。

![](https://picdn.youdianzhishi.com/images/elastic-stack-arch.png)

接下来我们就来学习下如何使用 Elastic 技术构建 Kubernetes 监控栈。我们这里的试验环境是 Kubernetes v1.16.2 版本的集群，为方便管理，我们将所有的资源对象都部署在一个名为 elastic 的命名空间中：

```bash
$ kubectl create ns elastic
namespace/elastic created
```

## 1. 示例应用

这里我们先部署一个使用 SpringBoot 和 MongoDB 开发的示例应用。首先部署一个 MongoDB 应用，对应的资源清单文件如下所示：

```yaml
# mongo.yml
---
apiVersion: v1
kind: Service
metadata:
  name: mongo
  namespace: elastic
  labels:
    app: mongo
spec:
  ports:
    - port: 27017
      protocol: TCP
  selector:
    app: mongo
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  namespace: elastic
  name: mongo
  labels:
    app: mongo
spec:
  serviceName: "mongo"
  selector:
    matchLabels:
      app: mongo
  template:
    metadata:
      labels:
        app: mongo
    spec:
      containers:
        - name: mongo
          image: mongo
          ports:
            - containerPort: 27017
          volumeMounts:
            - name: data
              mountPath: /data/db
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: rook-ceph-block # 使用支持 RWO 的 StorageClass
        resources:
          requests:
            storage: 1Gi
```

这里我们使用了一个名为 rook-ceph-block 的 StorageClass 对象来自动创建 PV，可以替换成自己集群中支持 RWO 的 StorageClass 对象即可。直接使用上面的资源清单创建即可：

```bash
$ kubectl apply -f mongo.yml
service/mongo created
statefulset.apps/mongo created
$ kubectl get pods -n elastic -l app=mongo
NAME      READY   STATUS    RESTARTS   AGE
mongo-0   1/1     Running   0          34m
```

直到 Pod 变成 Running 状态证明 mongodb 部署成功了。接下来部署 SpringBoot 的 API 应用，这里我们通过 NodePort 类型的 Service 服务来暴露该服务，对应的资源清单文件如下所示：

```yaml
# spring-boot-simple.yml
---
apiVersion: v1
kind: Service
metadata:
  namespace: elastic
  name: spring-boot-simple
  labels:
    app: spring-boot-simple
spec:
  type: NodePort
  ports:
    - port: 8080
      protocol: TCP
  selector:
    app: spring-boot-simple
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: elastic
  name: spring-boot-simple
  labels:
    app: spring-boot-simple
spec:
  replicas: 1
  selector:
    matchLabels:
      app: spring-boot-simple
  template:
    metadata:
      labels:
        app: spring-boot-simple
    spec:
      containers:
        - image: cnych/spring-boot-simple:0.0.1-SNAPSHOT
          name: spring-boot-simple
          env:
            - name: SPRING_DATA_MONGODB_HOST # 指定MONGODB地址
              value: mongo
          ports:
            - containerPort: 8080
```

同样直接创建上面的应用的应用即可：

```bash
$ kubectl apply -f spring-boot-simple.yaml
service/spring-boot-simple created
deployment.apps/spring-boot-simple created
$ kubectl get pods -n elastic -l app=spring-boot-simple
NAME                                  READY   STATUS    RESTARTS   AGE
spring-boot-simple-64795494bf-hqpcj   1/1     Running   0          24m
$ kubectl get svc -n elastic -l app=spring-boot-simple
NAME                 TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
spring-boot-simple   NodePort   10.109.55.134   <none>        8080:31847/TCP   84s
```

当应用部署完成后，我们就可以通过地址 http://<nodeip>:31847 访问应用，可以通过如下命令进行简单测试：

```bash
$ curl -X GET  http://k8s.qikqiak.com:31847/
Greetings from Spring Boot!
```

发送一个 POST 请求：

```
$ curl -X POST http://k8s.qikqiak.com:31847/message -d 'hello world'
{"id":"5ef55c130d53190001bf74d2","message":"hello+world=","postedAt":"2020-06-26T02:23:15.860+0000"}
```

获取所以消息数据：

```
$ curl -X GET http://k8s.qikqiak.com:31847/message
[{"id":"5ef55c130d53190001bf74d2","message":"hello+world=","postedAt":"2020-06-26T02:23:15.860+0000"}]
```

## 2. ElasticSearch 集群

要建立一个 Elastic 技术的监控栈，当然首先我们需要部署 ElasticSearch，它是用来存储所有的指标、日志和追踪的数据库，这里我们通过 3 个不同角色的可扩展的节点组成一个集群。

### 2.1 安装 ElasticSearch 主节点

设置集群的第一个节点为 Master 主节点，来负责控制整个集群。首先创建一个 ConfigMap 对象，用来描述集群的一些配置信息，以方便将 ElasticSearch 的主节点配置到集群中并开启安全认证功能。对应的资源清单文件如下所示：

```yaml
# elasticsearch-master.configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: elastic
  name: elasticsearch-master-config
  labels:
    app: elasticsearch
    role: master
data:
  elasticsearch.yml: |-
    cluster.name: ${CLUSTER_NAME}
    node.name: ${NODE_NAME}
    discovery.seed_hosts: ${NODE_LIST}
    cluster.initial_master_nodes: ${MASTER_NODES}

    network.host: 0.0.0.0

    node:
      master: true
      data: false
      ingest: false

    xpack.security.enabled: true
    xpack.monitoring.collection.enabled: true
---
```

然后创建一个 Service 对象，在 Master 节点下，我们只需要通过用于集群通信的 9300 端口进行通信。资源清单文件如下所示：

```yaml
# elasticsearch-master.service.yaml
---
apiVersion: v1
kind: Service
metadata:
  namespace: elastic
  name: elasticsearch-master
  labels:
    app: elasticsearch
    role: master
spec:
  ports:
    - port: 9300
      name: transport
  selector:
    app: elasticsearch
    role: master
---
```

最后使用一个 Deployment 对象来定义 Master 节点应用，资源清单文件如下所示：

```yaml
# elasticsearch-master.deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: elastic
  name: elasticsearch-master
  labels:
    app: elasticsearch
    role: master
spec:
  replicas: 1
  selector:
    matchLabels:
      app: elasticsearch
      role: master
  template:
    metadata:
      labels:
        app: elasticsearch
        role: master
    spec:
      containers:
        - name: elasticsearch-master
          image: docker.elastic.co/elasticsearch/elasticsearch:7.8.0
          env:
            - name: CLUSTER_NAME
              value: elasticsearch
            - name: NODE_NAME
              value: elasticsearch-master
            - name: NODE_LIST
              value: elasticsearch-master,elasticsearch-data,elasticsearch-client
            - name: MASTER_NODES
              value: elasticsearch-master
            - name: "ES_JAVA_OPTS"
              value: "-Xms512m -Xmx512m"
          ports:
            - containerPort: 9300
              name: transport
          volumeMounts:
            - name: config
              mountPath: /usr/share/elasticsearch/config/elasticsearch.yml
              readOnly: true
              subPath: elasticsearch.yml
            - name: storage
              mountPath: /data
      volumes:
        - name: config
          configMap:
            name: elasticsearch-master-config
        - name: "storage"
          emptyDir:
            medium: ""
---
```

直接创建上面的 3 个资源对象即可：

```shell
$ kubectl apply  -f elasticsearch-master.configmap.yaml \
                 -f elasticsearch-master.service.yaml \
                 -f elasticsearch-master.deployment.yaml

configmap/elasticsearch-master-config created
service/elasticsearch-master created
deployment.apps/elasticsearch-master created
$ kubectl get pods -n elastic -l app=elasticsearch
NAME                                    READY   STATUS    RESTARTS   AGE
elasticsearch-master-6f666cbbd-r9vtx    1/1     Running   0          111m
```

直到 Pod 变成 Running 状态就表明 master 节点安装成功。

### 2.2 安装 ElasticSearch 数据节点

现在我们需要安装的是集群的数据节点，它主要来负责集群的数据托管和执行查询。

<!--adsense-text-->

和 master 节点一样，我们使用一个 ConfigMap 对象来配置我们的数据节点：

```yaml
# elasticsearch-data.configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: elastic
  name: elasticsearch-data-config
  labels:
    app: elasticsearch
    role: data
data:
  elasticsearch.yml: |-
    cluster.name: ${CLUSTER_NAME}
    node.name: ${NODE_NAME}
    discovery.seed_hosts: ${NODE_LIST}
    cluster.initial_master_nodes: ${MASTER_NODES}

    network.host: 0.0.0.0

    node:
      master: false
      data: true
      ingest: false

    xpack.security.enabled: true
    xpack.monitoring.collection.enabled: true
---
```

可以看到和上面的 master 配置非常类似，不过需要注意的是属性 node.data=true。

同样只需要通过 9300 端口和其他节点进行通信：

```yaml
# elasticsearch-data.service.yaml
---
apiVersion: v1
kind: Service
metadata:
  namespace: elastic
  name: elasticsearch-data
  labels:
    app: elasticsearch
    role: data
spec:
  ports:
    - port: 9300
      name: transport
  selector:
    app: elasticsearch
    role: data
---
```

最后创建一个 StatefulSet 的控制器，因为可能会有多个数据节点，每一个节点的数据不是一样的，需要单独存储，所以也使用了一个 volumeClaimTemplates 来分别创建存储卷，对应的资源清单文件如下所示：

```yaml
# elasticsearch-data.statefulset.yaml
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  namespace: elastic
  name: elasticsearch-data
  labels:
    app: elasticsearch
    role: data
spec:
  serviceName: "elasticsearch-data"
  selector:
    matchLabels:
      app: elasticsearch
      role: data
  template:
    metadata:
      labels:
        app: elasticsearch
        role: data
    spec:
      containers:
        - name: elasticsearch-data
          image: docker.elastic.co/elasticsearch/elasticsearch:7.8.0
          env:
            - name: CLUSTER_NAME
              value: elasticsearch
            - name: NODE_NAME
              value: elasticsearch-data
            - name: NODE_LIST
              value: elasticsearch-master,elasticsearch-data,elasticsearch-client
            - name: MASTER_NODES
              value: elasticsearch-master
            - name: "ES_JAVA_OPTS"
              value: "-Xms1024m -Xmx1024m"
          ports:
            - containerPort: 9300
              name: transport
          volumeMounts:
            - name: config
              mountPath: /usr/share/elasticsearch/config/elasticsearch.yml
              readOnly: true
              subPath: elasticsearch.yml
            - name: elasticsearch-data-persistent-storage
              mountPath: /data/db
      volumes:
        - name: config
          configMap:
            name: elasticsearch-data-config
  volumeClaimTemplates:
    - metadata:
        name: elasticsearch-data-persistent-storage
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: rook-ceph-block
        resources:
          requests:
            storage: 50Gi
---
```

直接创建上面的资源对象即可：

```bash
$ kubectl apply -f elasticsearch-data.configmap.yaml \
                -f elasticsearch-data.service.yaml \
                -f elasticsearch-data.statefulset.yaml

configmap/elasticsearch-data-config created
service/elasticsearch-data created
statefulset.apps/elasticsearch-data created
```

直到 Pod 变成 Running 状态证明节点启动成功：

```bash
$ kubectl get pods -n elastic -l app=elasticsearch
NAME                                    READY   STATUS    RESTARTS   AGE
elasticsearch-data-0                    1/1     Running   0          90m
elasticsearch-master-6f666cbbd-r9vtx    1/1     Running   0          111m
```

### 2.3 安装 ElasticSearch 客户端节点

最后来安装配置 ElasticSearch 的客户端节点，该节点主要负责暴露一个 HTTP 接口将查询数据传递给数据节点获取数据。

同样使用一个 ConfigMap 对象来配置该节点：

```yaml
# elasticsearch-client.configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: elastic
  name: elasticsearch-client-config
  labels:
    app: elasticsearch
    role: client
data:
  elasticsearch.yml: |-
    cluster.name: ${CLUSTER_NAME}
    node.name: ${NODE_NAME}
    discovery.seed_hosts: ${NODE_LIST}
    cluster.initial_master_nodes: ${MASTER_NODES}

    network.host: 0.0.0.0

    node:
      master: false
      data: false
      ingest: true

    xpack.security.enabled: true
    xpack.monitoring.collection.enabled: true
---
```

客户端节点需要暴露两个端口，9300 端口用于与集群的其他节点进行通信，9200 端口用于 HTTP API。对应的 Service 对象如下所示：

```yaml
# elasticsearch-client.service.yaml
---
apiVersion: v1
kind: Service
metadata:
  namespace: elastic
  name: elasticsearch-client
  labels:
    app: elasticsearch
    role: client
spec:
  ports:
    - port: 9200
      name: client
    - port: 9300
      name: transport
  selector:
    app: elasticsearch
    role: client
---
```

使用一个 Deployment 对象来描述客户端节点：

```yaml
# elasticsearch-client.deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: elastic
  name: elasticsearch-client
  labels:
    app: elasticsearch
    role: client
spec:
  selector:
    matchLabels:
      app: elasticsearch
      role: client
  template:
    metadata:
      labels:
        app: elasticsearch
        role: client
    spec:
      containers:
        - name: elasticsearch-client
          image: docker.elastic.co/elasticsearch/elasticsearch:7.8.0
          env:
            - name: CLUSTER_NAME
              value: elasticsearch
            - name: NODE_NAME
              value: elasticsearch-client
            - name: NODE_LIST
              value: elasticsearch-master,elasticsearch-data,elasticsearch-client
            - name: MASTER_NODES
              value: elasticsearch-master
            - name: "ES_JAVA_OPTS"
              value: "-Xms256m -Xmx256m"
          ports:
            - containerPort: 9200
              name: client
            - containerPort: 9300
              name: transport
          volumeMounts:
            - name: config
              mountPath: /usr/share/elasticsearch/config/elasticsearch.yml
              readOnly: true
              subPath: elasticsearch.yml
            - name: storage
              mountPath: /data
      volumes:
        - name: config
          configMap:
            name: elasticsearch-client-config
        - name: "storage"
          emptyDir:
            medium: ""
---
```

同样直接创建上面的资源对象来部署 client 节点：

```bash
$ kubectl apply  -f elasticsearch-client.configmap.yaml \
                 -f elasticsearch-client.service.yaml \
                 -f elasticsearch-client.deployment.yaml

configmap/elasticsearch-client-config created
service/elasticsearch-client created
deployment.apps/elasticsearch-client created
```

直到所有的节点都部署成功后证明集群安装成功：

```bash
$ kubectl get pods -n elastic -l app=elasticsearch
NAME                                    READY   STATUS    RESTARTS   AGE
elasticsearch-client-788bffcc98-hh2s8   1/1     Running   0          83m
elasticsearch-data-0                    1/1     Running   0          91m
elasticsearch-master-6f666cbbd-r9vtx    1/1     Running   0          112m
```

可以通过如下所示的命令来查看集群的状态变化：

```bash
$ kubectl logs -f -n elastic \
  $(kubectl get pods -n elastic | grep elasticsearch-master | sed -n 1p | awk '{print $1}') \
  | grep "Cluster health status changed from"

{"type": "server", "timestamp": "2020-06-26T03:31:21,353Z", "level": "INFO", "component": "o.e.c.r.a.AllocationService", "cluster.name": "elasticsearch", "node.name": "elasticsearch-master", "message": "Cluster health status changed from [RED] to [GREEN] (reason: [shards started [[.monitoring-es-7-2020.06.26][0]]]).", "cluster.uuid": "SS_nyhNiTDSCE6gG7z-J4w", "node.id": "BdVScO9oQByBHR5rfw-KDA"  }
```

### 2.4 生成密码

我们启用了 xpack 安全模块来保护我们的集群，所以我们需要一个初始化的密码。我们可以执行如下所示的命令，在客户端节点容器内运行 `bin/elasticsearch-setup-passwords` 命令来生成默认的用户名和密码：

```bash
$ kubectl exec $(kubectl get pods -n elastic | grep elasticsearch-client | sed -n 1p | awk '{print $1}') \
    -n elastic \
    -- bin/elasticsearch-setup-passwords auto -b

Changed password for user apm_system
PASSWORD apm_system = 3Lhx61s6woNLvoL5Bb7t

Changed password for user kibana_system
PASSWORD kibana_system = NpZv9Cvhq4roFCMzpja3

Changed password for user kibana
PASSWORD kibana = NpZv9Cvhq4roFCMzpja3

Changed password for user logstash_system
PASSWORD logstash_system = nNnGnwxu08xxbsiRGk2C

Changed password for user beats_system
PASSWORD beats_system = fen759y5qxyeJmqj6UPp

Changed password for user remote_monitoring_user
PASSWORD remote_monitoring_user = mCP77zjCATGmbcTFFgOX

Changed password for user elastic
PASSWORD elastic = wmxhvsJFeti2dSjbQEAH
```

注意需要将 elastic 用户名和密码也添加到 Kubernetes 的 Secret 对象中：

```bash
$ kubectl create secret generic elasticsearch-pw-elastic \
    -n elastic \
    --from-literal password=wmxhvsJFeti2dSjbQEAH
secret/elasticsearch-pw-elastic created
```

## 3. Kibana

ElasticSearch 集群安装完成后，接着我们可以来部署 Kibana，这是 ElasticSearch 的数据可视化工具，它提供了管理 ElasticSearch 集群和可视化数据的各种功能。

同样首先我们使用 ConfigMap 对象来提供一个文件文件，其中包括对 ElasticSearch 的访问（主机、用户名和密码），这些都是通过环境变量配置的。对应的资源清单文件如下所示：

```yaml
# kibana.configmap.yaml
---
apiVersion: v1
kind: ConfigMap
metadata:
  namespace: elastic
  name: kibana-config
  labels:
    app: kibana
data:
  kibana.yml: |-
    server.host: 0.0.0.0

    elasticsearch:
      hosts: ${ELASTICSEARCH_HOSTS}
      username: ${ELASTICSEARCH_USER}
      password: ${ELASTICSEARCH_PASSWORD}
---
```

然后通过一个 NodePort 类型的服务来暴露 Kibana 服务：

```yaml
# kibana.service.yaml
---
apiVersion: v1
kind: Service
metadata:
  namespace: elastic
  name: kibana
  labels:
    app: kibana
spec:
  type: NodePort
  ports:
    - port: 5601
      name: webinterface
  selector:
    app: kibana
---
```

最后通过 Deployment 来部署 Kibana 服务，由于需要通过环境变量提供密码，这里我们使用上面创建的 Secret 对象来引用：

```yaml
# kibana.deployment.yaml
---
apiVersion: apps/v1
kind: Deployment
metadata:
  namespace: elastic
  name: kibana
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
      containers:
        - name: kibana
          image: docker.elastic.co/kibana/kibana:7.8.0
          ports:
            - containerPort: 5601
              name: webinterface
          env:
            - name: ELASTICSEARCH_HOSTS
              value: "http://elasticsearch-client.elastic.svc.cluster.local:9200"
            - name: ELASTICSEARCH_USER
              value: "elastic"
            - name: ELASTICSEARCH_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: elasticsearch-pw-elastic
                  key: password
          volumeMounts:
            - name: config
              mountPath: /usr/share/kibana/config/kibana.yml
              readOnly: true
              subPath: kibana.yml
      volumes:
        - name: config
          configMap:
            name: kibana-config
---
```

同样直接创建上面的资源清单即可部署：

```bash
$ kubectl apply  -f kibana.configmap.yaml \
                 -f kibana.service.yaml \
                 -f kibana.deployment.yaml

configmap/kibana-config created
service/kibana created
deployment.apps/kibana created
```

部署成功后，可以通过查看 Pod 的日志来了解 Kibana 的状态：

```bash
$ kubectl logs -f -n elastic $(kubectl get pods -n elastic | grep kibana | sed -n 1p | awk '{print $1}') \
     | grep "Status changed from yellow to green"

{"type":"log","@timestamp":"2020-06-26T04:20:38Z","tags":["status","plugin:elasticsearch@7.8.0","info"],"pid":6,"state":"green","message":"Status changed from yellow to green - Ready","prevState":"yellow","prevMsg":"Waiting for Elasticsearch"}
```

当状态变成 `green` 后，我们就可以通过 NodePort 端口 30474 去浏览器中访问 Kibana 服务了：

```bash
$ kubectl get svc kibana -n elastic
NAME     TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)          AGE
kibana   NodePort   10.101.121.31   <none>        5601:30474/TCP   8m18s
```

如下图所示，使用上面我们创建的 Secret 对象的 elastic 用户和生成的密码即可登录：

![](https://picdn.youdianzhishi.com/images/20200626122305.png)

登录成功后会自动跳转到 Kibana 首页：

![](https://picdn.youdianzhishi.com/images/20200626122502.png)

同样也可以自己创建一个新的超级用户，Management → Stack Management → Create User：

![](https://picdn.youdianzhishi.com/images/20200626122705.png)

使用新的用户名和密码，选择 `superuser` 这个角色来创建新的用户：

![](https://picdn.youdianzhishi.com/images/20200626122835.png)

创建成功后就可以使用上面新建的用户登录 Kibana，最后还可以通过 Management → Stack Monitoring 页面查看整个集群的健康状态：

![](https://picdn.youdianzhishi.com/images/20200626123104.png)

到这里我们就安装成功了 ElasticSearch 与 Kibana，它们将为我们来存储和可视化我们的应用数据（监控指标、日志和追踪）服务。

在下一篇文章中，我们将来学习如何安装和配置 Metricbeat，通过 Elastic Metribeat 来收集指标监控 Kubernetes 集群。

<!--adsense-self-->
