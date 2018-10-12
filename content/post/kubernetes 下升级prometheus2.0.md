---
title: Kubernetes 下升级Prometheus2.0
date: 2017-11-22
publishdate: 2017-11-22
slug: update-prometheus-2-in-kubernetes
tags: ["kubernetes", "prometheus", "grafana"]
keywords: ["kubernetes", "prometheus2", "grafana", "升级"]
bigimg: [{src: "/img/posts/22277538_1987368801539992_4665344475080425472_n.jpg", desc: "It is always a new adventure, and I am always impressed with how beautiful nature is"}]
category: "kubernetes"
gitcomment: true
---

`prometheus`2.0正式版已经发布了，新增了很多特性，特别是底层存储性能提升了不少：[https://prometheus.io/blog/2017/11/08/announcing-prometheus-2-0/](https://prometheus.io/blog/2017/11/08/announcing-prometheus-2-0/)。

在将之前监控平台升级到2.0 的过程中还是有一些坑的，因为有很多参数已经更改了，还不清除怎么在`kubernetes`上搭建`prometheus`监控平台的，可以查看前面的文章[Kubernetes使用Prometheus搭建监控平台](/post/kubernetes-monitor-prometheus-grafana/)

本文章中涉及到的`yaml`文件可以在[github](https://github.com/cnych/k8s-repo/tree/master/prometheus)中查看。

<!--more-->

## 升级

因为现在我们的平台是1.8.2版本的，启用了RABC特性，所以首先就需要为`Prometheus`新增一个`ServiceAccount`：
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: kube-ops
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRole
metadata:
  name: prometheus
  namespace: kube-ops
rules:
- apiGroups: [""]
  resources:
  - nodes
  - nodes/proxy
  - services
  - endpoints
  - pods
  verbs: ["get", "list", "watch"]
- nonResourceURLs: ["/metrics"]
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1beta1
kind: ClusterRoleBinding
metadata:
  name: prometheus
  namespace: kube-ops
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: kube-ops
```

其次是需要更改`Prometheus`的镜像版本为:**2.0.0**，最重要的是执行参数需要将之前的`-`更改为`--`，如果你要指定数据存储的路径的话，那么需要将之前的`storage.local.path`更为`storage.tsdb.path`，如下：
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  labels:
    k8s-app: prometheus
  name: prometheus
  namespace: kube-ops
spec:
  replicas: 1
  template:
    metadata:
      labels:
        k8s-app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
      - image: prom/prometheus:v2.0.0
        name: prometheus
        command:
        - "/bin/prometheus"
        args:
        - "--config.file=/etc/prometheus/prometheus.yml"
        - "--storage.tsdb.path=/prometheus"
        - "--storage.tsdb.retention=15d"
        ports:
        - containerPort: 9090
          protocol: TCP
          name: http
        volumeMounts:
        - mountPath: "/prometheus"
          name: data
          subPath: prometheus/data
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
        persistentVolumeClaim:
          claimName: opspvc
      - configMap:
          name: prometheus-config
        name: config-volume
```

注意**args**参数的改变。

然后就是配置文件的改变了，以前`kubernetes_sd_configs`下面没有`api_servers`属性了等等，具体查看下面配置文件：
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

    - job_name: 'kubernetes-apiservers'
      kubernetes_sd_configs:
      - role: endpoints
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

    - job_name: 'kubernetes-nodes'
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/${1}/proxy/metrics

    - job_name: 'kubernetes-cadvisor'
      scheme: https
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - role: node
      relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
      - target_label: __address__
        replacement: kubernetes.default.svc:443
      - source_labels: [__meta_kubernetes_node_name]
        regex: (.+)
        target_label: __metrics_path__
        replacement: /api/v1/nodes/${1}/proxy/metrics/cadvisor

    - job_name: 'kubernetes-node-exporter'
      scheme: http
      tls_config:
        ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
      kubernetes_sd_configs:
      - role: node
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

更新完成后，可以去`prometheus`服务上查看`targets`的状态：
![prometheus targets](/img/posts/WX20171122-170347.png)

然后就可以前往`grafana`查看采集的信息了：
![kubernetes monitor](/img/posts/WX20171122-165339.png)



## 参考资料

* [Kubernetes使用Prometheus 搭建监控平台](/post/kubernetes-monitor-prometheus-grafana/)
* [https://github.com/cnych/k8s-repo](https://github.com/cnych/k8s-repo)

欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
