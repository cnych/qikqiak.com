---
title: Kubernetes使用Prometheus搭建监控平台
slug: kubernetes-monitor-prometheus-grafana
date: 2017-10-17
publishdate: 2017-10-17
keywords: ["kubernetes", "监控", "prometheus", "grafana", "influxdb"]
tags: ["kubernetes", "prometheus", "grafana", "influxdb"]
bigimg: [{src: "/img/posts/k8s-prometheus-grafana-cover.png", desc: ""}]
category: "kubernetes"
gitcomment: true
---

最近在测试环境搭建了`Kubernetes`集群环境，迁移了部分测试环境的应用，由于测试集群性能不是很好，有时会遇到集群资源不够的情况，一般情况下我们是直接通过Dashboard的资源统计图标进行观察的，但是很显然如果要上到生产环境，就需要更自动化的方式来对集群、Pod甚至容器进行监控了。`Kubernetes`内置了一套监控方案：influxdb+grafana+heapster。但由于之前我们的应用的业务监控使用的是`Prometheus`，所以这里准备使用`Prometheus`来完成k8s的集群监控。

<!--more-->
欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)

## Prometheus 简介
`Prometheus`是SoundCloud开源的一款开源软件。它的实现参考了Google内部的监控实现，与源自Google的Kubernetes结合起来非常合适。另外相比influxdb的方案，性能更加突出，而且还内置了报警功能。它针对大规模的集群环境设计了拉取式的数据采集方式，你只需要在你的应用里面实现一个`metrics`接口，然后把这个接口告诉`Prometheus`就可以完成数据采集了。

## 安装Prometheus
首先我们使用`ConfigMap`的形式来设置`Prometheus`的配置文件，如下
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: kube-ops
data:
  prometheus.yml: |
    global:
      scrape_interval: 30s
      scrape_timeout: 30s
    scrape_configs:
    - job_name: 'prometheus'
      static_configs:
        - targets: ['localhost:9090']
    - job_name: 'kubernetes-nodes-cadvisor'
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - api_servers:
        - 'https://10.43.0.1'
        in_cluster: true
        role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - source_labels: [__meta_kubernetes_role]
        action: replace
        target_label: kubernetes_role
      - source_labels: [__address__]
        regex: '(.*):10250'
        replacement: '${1}:4194'
        target_label: __address__
    - job_name: 'kubernetes-apiserver-cadvisor'
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - api_servers:
        - 'https://10.43.0.1'
        in_cluster: true
        role: apiserver
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - source_labels: [__meta_kubernetes_role]
        action: replace
        target_label: kubernetes_role
      - source_labels: [__address__]
        regex: '(.*):10250'
        replacement: '${1}:10255'
        target_label: __address__
    - job_name: 'kubernetes-node-exporter'
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - api_servers:
        - 'https://10.43.0.1'
        in_cluster: true
        role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - source_labels: [__meta_kubernetes_role]
        action: replace
        target_label: kubernetes_role
      - source_labels: [__address__]
        regex: '(.*):10250'
        replacement: '${1}:31672'
        target_label: __address__
```
将以上配置文件保存为`prometheus-config.yaml`，然后执行命令：
```shell
$ kubectl create -f prometheus-config.yaml
```

注意：

* `job_name=kubernetes-apiserver-cadvisor`需要将10250端口替换成10255，10255端口是`kubelet`实现的`metrics`，可以在节点上面curl查看内容，`curl http://<node_ip>:10255/metrics`
* `job_name=kubernetes-nodes-cadvisor`需要将10250端口替换成4194，4194同样是kubernetes集成的容器监控服务，在k8s 1.7版本之前的用10255端口即可，但是1.7版本后`cadvisor`监控的数据没有集成到`kubelet`的实现里面去了，[这里一定要注意](https://github.com/kubernetes/kubernetes/issues/48483)
* `job_name=kubernetes-node-exporter`中替换10250的端口是31672，该端口是`node-exporter`暴露的`NodePort`端口，这里需要根据实际情况填写。

先部署`node-exporter`，为了能够收集每个节点的信息，所以我们这里使用`DaemonSet`的形式部署PODS：
```yaml
---
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: kube-ops
  labels:
    k8s-app: node-exporter
spec:
  template:
    metadata:
      labels:
        k8s-app: node-exporter
    spec:
      containers:
      - image: prom/node-exporter
        name: node-exporter
        ports:
        - containerPort: 9100
          protocol: TCP
          name: http
---
apiVersion: v1
kind: Service
metadata:
  labels:
    k8s-app: node-exporter
  name: node-exporter
  namespace: kube-ops
spec:
  ports:
  - name: http
    port: 9100
    nodePort: 31672
    protocol: TCP
  type: NodePort
  selector:
    k8s-app: node-exporter
```
将以上文件保存为`node-exporter.yaml`，然后执行命令：
```shell
$ kubectl create -f node-exporter.yaml
```

接下来通过`Deployment`部署`Prometheus`,yaml文件如下：
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  labels:
    name: prometheus-deployment
  name: prometheus
  namespace: kube-ops
spec:
  replicas: 1
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - image: prom/prometheus:v1.0.1
        name: prometheus
        command:
        - "/bin/prometheus"
        args:
        - "-config.file=/etc/prometheus/prometheus.yml"
        - "-storage.local.path=/prometheus"
        - "-storage.local.retention=24h"
        ports:
        - containerPort: 9090
          protocol: TCP
        volumeMounts:
        - mountPath: "/prometheus"
          name: data
          subPath: prometheus
        - mountPath: "/etc/prometheus"
          name: config-volume
        resources:
          requests:
            cpu: 100m
            memory: 100Mi
          limits:
            cpu: 200m
            memory: 1Gi
      volumes:
      - name: data
        emptyDir: {}
      - configMap:
          name: prometheus-config
        name: config-volume
```
将以上文件保存为`prometheus-deploy.yaml`，然后执行命令：
```shell
$ kubectl create -f prometheus-deploy.yaml
```

接下来暴露服务以便可以访问`Prometheus`的UI界面，你可以通过`kubectl port-forward`将它暴露在本地：
```shell
$ POD=`kubectl get pod -l app=prometheus -n kube-ops -o go-template --template '{{range .items}}{{.metadata.name}}{{end}}'`
$ kubectl port-forward $POD 9090:9090
```
然后用浏览器访问`http://localhost:9090`就可以访问到Prometheus的界面了。

我这里通过`ingress`暴露到外网，yaml文件如下：
```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: traefik-default-ingress
  annotations:
    kubernetes.io/ingress.class: "traefik"
spec:
  tls:
    - secretName: traefik-ssl
  rules:
  - host: prometheus.local  # 替换成你的域名
    http:
      paths:
      - path: /
        backend:
          serviceName: prometheus
          servicePort: 9090
```
将以上文件保存为`prometheus-ingress.yaml`，然后执行命令：
```shell
$ kubectl create -f prometheus-ingress.yaml
```
然后就可以通过上面`traefik`中配置的域名进行访问了，可以切换到`Status`下面的`targets`查看我们采集的数据是否正常：
![Prometheus Targets](/img/posts/1508237027871.jpg)
可以根据`targets`下面的提示信息对采集失败的数据进行修正。

## 查询监控数据
`Prometheus`提供了API的方式进行数据查询，同样可以使用query语言进行复杂的查询任务，在上面的WEB界面上提供了基本的查询和图形化的展示功能。

比如查询每个`POD`的CPU使用情况，查询条件如下：
```shell
sum by (pod_name)( rate(container_cpu_usage_seconds_total{image!="", pod_name!=""}[1m] ) )
```
注意其中的`pod_name`和`image`要根据自己采集的数据进行区分。

![CPU使用](/img/posts/1508237868056.jpg)

更多的查询条件可以参考[Prometheus的文档](https://prometheus.io/docs/introduction/overview/)，将来也会逐步介绍，这里就不详细展开了。

这样通过在`Kubernetes`上部署`Prometheus`，在不修改集群的任何配置情况下实现了集群的基本监控功能。

## 安装Grafana
`Prometheus`以及获取到了我们采集的数据，现在我们需要一个更加强大的图标展示工具，毫无疑问选择`grafana`，同样的，在`Kubernetes`环境下面进行安装，yaml文件如下:
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: grafana
  namespace: kube-ops
spec:
  replicas: 1
  template:
    metadata:
      labels:
        k8s-app: grafana
        task: monitoring
    spec:
      containers:
      - name: grafana
        image: gcr.io/google_containers/heapster-grafana-amd64:v4.4.3
        ports:
        - containerPort: 3000
          protocol: TCP
        resources:
          limits:
            cpu: 200m
            memory: 256Mi
          requests:
            cpu: 100m
            memory: 100Mi
        volumeMounts:
        - name: ca-certificates
          mountPath: /etc/ssl/certs
          readOnly: true
        - name: grafana-data
          mountPath: /var
          subPath: grafana
        env:
        - name: INFLUXDB_HOST
          value: influxdb
        - name: INFLUXDB_SERVICE_URL
          value: http://influxdb.kube-ops.svc.cluster.local:8086
        - name: GF_SERVER_HTTP_PORT
          value: "3000"
        - name: GF_AUTH_BASIC_ENABLED
          value: "false"
        - name: GF_AUTH_ANONYMOUS_ENABLED
          value: "true"
        - name: GF_AUTH_ANONYMOUS_ORG_ROLE
          value: Admin
        - name: GF_SERVER_ROOT_URL
          # If you're only using the API Server proxy, set this value instead:
          # value: /api/v1/proxy/namespaces/kube-system/services/monitoring-grafana/
          value: /
      volumes:
      - name: ca-certificates
        hostPath:
          path: /etc/ssl/certs
      - name: grafana-data
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  labels:
    kubernetes.io/cluster-service: 'true'
    kubernetes.io/name: grafana
  name: grafana
  namespace: kube-ops
spec:
  ports:
  - port: 3000
    targetPort: 3000
  selector:
    k8s-app: grafana
```
将以上文件保存为`grafana.yaml`，然后执行命令：
```shell
$ kubectl create -f grafana.yaml
```
同样的你可以选择使用`kubectl port-forward`把端口暴露在本地，或者用`ingress`将服务暴露在外网进行访问。
访问`grafana`WEB界面，将我们上面的`Prometheus`添加到`grafana`数据源中去
![grafana数据源](/img/posts/1508238528462.jpg)

然后添加我们的`Dashboard`，推荐使用[https://grafana.com/dashboards/162](https://grafana.com/dashboards/162)，可以下载该页面的dashboard的json文件，然后直接导入到`grafana`中去，但是需要注意其中的一些参数，需要根据`prometheus`中采集到实际数据进行填写，比如我们这里采集到容器名是`name`，而不是`io_kubernetes_container_name`,最终展示界面如下：
![kubernetes monitor dashboard](/img/posts/1508238899864.jpg)

## 总结
未来将进一步完善`Prometheus`的使用：

* 增加更多的监控数据源
* [使用AlertManager实现异常提醒](/post/alertmanager-of-prometheus-in-practice/)（DONE）

> 上面用的`yaml`文件可以到`github`上查看[https://github.com/cnych/k8s-repo/tree/master/prometheus](https://github.com/cnych/k8s-repo/tree/master/prometheus)

欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
