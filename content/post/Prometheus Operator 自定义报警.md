---
title: Prometheus Operator 自定义报警
date: 2018-12-19
tags: ["kubernetes", "prometheus", "operator", "alertmanager"]
slug: prometheus-operator-custom-alert
keywords: ["kubernetes", "prometheus", "operator", "alertmanager", "prometheus-operator", "钉钉"]
gitcomment: true
bigimg: [{src: "https://ws3.sinaimg.cn/large/006tNbRwgy1fyddbmv3d9j31dq0ryn8g.jpg", desc: ""}]
category: "kubernetes"
---

[上篇文章我们介绍了如何自定义一个 ServiceMonitor 对象](https://www.qikqiak.com/post/prometheus-operator-monitor-etcd)，但是如果需要自定义一个报警规则的话呢？又该怎么去做呢？

<!--more-->

### 配置 PrometheusRule
现在我们知道怎么自定义一个 ServiceMonitor 对象了，但是如果需要自定义一个报警规则的话呢？比如现在我们去查看 Prometheus Dashboard 的 Alert 页面下面就已经有一些报警规则了，还有一些是已经触发规则的了：

![alerts](https://ws3.sinaimg.cn/large/006tNbRwgy1fyc4hf239zj313i0p6juv.jpg)

但是这些报警信息是哪里来的呢？他们应该用怎样的方式通知我们呢？我们知道之前我们使用自定义的方式可以在 Prometheus 的配置文件之中指定 AlertManager 实例和 报警的 rules 文件，现在我们通过 Operator 部署的呢？我们可以在 Prometheus Dashboard 的 Config 页面下面查看关于 AlertManager 的配置：
```yaml
alerting:
  alert_relabel_configs:
  - separator: ;
    regex: prometheus_replica
    replacement: $1
    action: labeldrop
  alertmanagers:
  - kubernetes_sd_configs:
    - role: endpoints
      namespaces:
        names:
        - monitoring
    scheme: http
    path_prefix: /
    timeout: 10s
    relabel_configs:
    - source_labels: [__meta_kubernetes_service_name]
      separator: ;
      regex: alertmanager-main
      replacement: $1
      action: keep
    - source_labels: [__meta_kubernetes_endpoint_port_name]
      separator: ;
      regex: web
      replacement: $1
      action: keep
rule_files:
- /etc/prometheus/rules/prometheus-k8s-rulefiles-0/*.yaml
```

上面 alertmanagers 实例的配置我们可以看到是通过角色为 endpoints 的 kubernetes 的服务发现机制获取的，匹配的是服务名为 alertmanager-main，端口名未 web 的 Service 服务，我们查看下 alertmanager-main 这个 Service：
```shell
kubectl describe svc alertmanager-main -n monitoring
Name:                     alertmanager-main
Namespace:                monitoring
Labels:                   alertmanager=main
Annotations:              kubectl.kubernetes.io/last-applied-configuration={"apiVersion":"v1","kind":"Service","metadata":{"annotations":{},"labels":{"alertmanager":"main"},"name":"alertmanager-main","namespace":"monitoring"},...
Selector:                 alertmanager=main,app=alertmanager
Type:                     NodePort
IP:                       10.104.156.29
Port:                     web  9093/TCP
TargetPort:               web/TCP
NodePort:                 web  31918/TCP
Endpoints:                10.244.2.34:9093,10.244.2.37:9093,10.244.4.109:9093
Session Affinity:         None
External Traffic Policy:  Cluster
Events:                   <none>
```

可以看到服务名正是 alertmanager-main，Port 定义的名称也是 web，符合上面的规则，所以 Prometheus 和 AlertManager 组件就正确关联上了。而对应的报警规则文件位于：`/etc/prometheus/rules/prometheus-k8s-rulefiles-0/`目录下面所有的 YAML 文件。我们可以进入 Prometheus 的 Pod 中验证下该目录下面是否有 YAML 文件：
```shell
$ kubectl exec -it prometheus-k8s-0 /bin/sh -n monitoring
Defaulting container name to prometheus.
Use 'kubectl describe pod/prometheus-k8s-0 -n monitoring' to see all of the containers in this pod.
/prometheus $ ls /etc/prometheus/rules/prometheus-k8s-rulefiles-0/
monitoring-prometheus-k8s-rules.yaml
/prometheus $ cat /etc/prometheus/rules/prometheus-k8s-rulefiles-0/monitoring-pr
ometheus-k8s-rules.yaml
groups:
- name: k8s.rules
  rules:
  - expr: |
      sum(rate(container_cpu_usage_seconds_total{job="kubelet", image!="", container_name!=""}[5m])) by (namespace)
    record: namespace:container_cpu_usage_seconds_total:sum_rate
......
```

这个 YAML 文件实际上就是我们之前创建的一个 PrometheusRule 文件包含的：
```shell
$ cat prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  labels:
    prometheus: k8s
    role: alert-rules
  name: prometheus-k8s-rules
  namespace: monitoring
spec:
  groups:
  - name: k8s.rules
    rules:
    - expr: |
        sum(rate(container_cpu_usage_seconds_total{job="kubelet", image!="", container_name!=""}[5m])) by (namespace)
      record: namespace:container_cpu_usage_seconds_total:sum_rate
```

我们这里的 PrometheusRule 的 name 为 prometheus-k8s-rules，namespace 为 monitoring，我们可以猜想到我们创建一个 PrometheusRule 资源对象后，会自动在上面的 prometheus-k8s-rulefiles-0 目录下面生成一个对应的`<namespace>-<name>.yaml`文件，所以如果以后我们需要自定义一个报警选项的话，只需要定义一个 PrometheusRule 资源对象即可。至于为什么 Prometheus 能够识别这个 PrometheusRule 资源对象呢？这就需要查看我们创建的 prometheus 这个资源对象了，里面有非常重要的一个属性 ruleSelector，用来匹配 rule 规则的过滤器，要求匹配具有 prometheus=k8s 和 role=alert-rules 标签的 PrometheusRule 资源对象，现在明白了吧？
```yaml
ruleSelector:
  matchLabels:
    prometheus: k8s
    role: alert-rules
```

所以我们要想自定义一个报警规则，只需要创建一个具有 prometheus=k8s 和 role=alert-rules 标签的 PrometheusRule 对象就行了，比如现在我们添加一个 etcd 是否可用的报警，我们知道 etcd 整个集群有一半以上的节点可用的话集群就是可用的，所以我们判断如果不可用的 etcd 数量超过了一半那么就触发报警，创建文件 prometheus-etcdRules.yaml：
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  labels:
    prometheus: k8s
    role: alert-rules
  name: etcd-rules
  namespace: monitoring
spec:
  groups:
  - name: etcd
    rules:
    - alert: EtcdClusterUnavailable
      annotations:
        summary: etcd cluster small
        description: If one more etcd peer goes down the cluster will be unavailable
      expr: |
        count(up{job="etcd"} == 0) > (count(up{job="etcd"}) / 2 - 1)
      for: 3m
      labels:
        severity: critical

```

注意 label 标签一定至少要有 prometheus=k8s 和 role=alert-rules，创建完成后，隔一会儿再去容器中查看下 rules 文件夹：
```shell
kubectl exec -it prometheus-k8s-0 /bin/sh -n monitoring
Defaulting container name to prometheus.
Use 'kubectl describe pod/prometheus-k8s-0 -n monitoring' to see all of the containers in this pod.
/prometheus $ ls /etc/prometheus/rules/prometheus-k8s-rulefiles-0/
monitoring-etcd-rules.yaml            monitoring-prometheus-k8s-rules.yaml
```

可以看到我们创建的 rule 文件已经被注入到了对应的 rulefiles 文件夹下面了，证明我们上面的设想是正确的。然后再去 Prometheus Dashboard 的 Alert 页面下面就可以查看到上面我们新建的报警规则了：

![etcd cluster](https://ws2.sinaimg.cn/large/006tNbRwgy1fyc62d4gkzj31540doac1.jpg)


### 配置报警
我们知道了如何去添加一个报警规则配置项，但是这些报警信息用怎样的方式去发送呢？前面的课程中我们知道我们可以通过 AlertManager 的配置文件去配置各种报警接收器，现在我们是通过 Operator 提供的 alertmanager 资源对象创建的组件，应该怎样去修改配置呢？

首先我们将 alertmanager-main 这个 Service 改为 NodePort 类型的 Service，修改完成后我们可以在页面上的 status 路径下面查看 AlertManager 的配置信息:

![alertmanager config](https://ws4.sinaimg.cn/large/006tNbRwgy1fyc6dz3t5ij31aa0u0te0.jpg)


这些配置信息实际上是来自于我们之前在`prometheus-operator/contrib/kube-prometheus/manifests`目录下面创建的 alertmanager-secret.yaml 文件：
```yaml
apiVersion: v1
data:
  alertmanager.yaml: Imdsb2JhbCI6IAogICJyZXNvbHZlX3RpbWVvdXQiOiAiNW0iCiJyZWNlaXZlcnMiOiAKLSAibmFtZSI6ICJudWxsIgoicm91dGUiOiAKICAiZ3JvdXBfYnkiOiAKICAtICJqb2IiCiAgImdyb3VwX2ludGVydmFsIjogIjVtIgogICJncm91cF93YWl0IjogIjMwcyIKICAicmVjZWl2ZXIiOiAibnVsbCIKICAicmVwZWF0X2ludGVydmFsIjogIjEyaCIKICAicm91dGVzIjogCiAgLSAibWF0Y2giOiAKICAgICAgImFsZXJ0bmFtZSI6ICJEZWFkTWFuc1N3aXRjaCIKICAgICJyZWNlaXZlciI6ICJudWxsIg==
kind: Secret
metadata:
  name: alertmanager-main
  namespace: monitoring
type: Opaque
```

可以将 alertmanager.yaml 对应的 value 值做一个 base64 解码：
```shell
$ echo "Imdsb2JhbCI6IAogICJyZXNvbHZlX3RpbWVvdXQiOiAiNW0iCiJyZWNlaXZlcnMiOiAKLSAibmFtZSI6ICJudWxsIgoicm91dGUiOiAKICAiZ3JvdXBfYnkiOiAKICAtICJqb2IiCiAgImdyb3VwX2ludGVydmFsIjogIjVtIgogICJncm91cF93YWl0IjogIjMwcyIKICAicmVjZWl2ZXIiOiAibnVsbCIKICAicmVwZWF0X2ludGVydmFsIjogIjEyaCIKICAicm91dGVzIjogCiAgLSAibWF0Y2giOiAKICAgICAgImFsZXJ0bmFtZSI6ICJEZWFkTWFuc1N3aXRjaCIKICAgICJyZWNlaXZlciI6ICJudWxsIg==" | base64 -d
"global":
  "resolve_timeout": "5m"
"receivers":
- "name": "null"
"route":
  "group_by":
  - "job"
  "group_interval": "5m"
  "group_wait": "30s"
  "receiver": "null"
  "repeat_interval": "12h"
  "routes":
  - "match":
      "alertname": "DeadMansSwitch"
    "receiver": "null"
```

我们可以看到内容和上面查看的配置信息是一致的，所以如果我们想要添加自己的接收器，或者模板消息，我们就可以更改这个文件：
```yaml
global:
  resolve_timeout: 5m
  smtp_smarthost: 'smtp.163.com:25'
  smtp_from: 'ych_1024@163.com'
  smtp_auth_username: 'ych_1024@163.com'
  smtp_auth_password: '<邮箱密码>'
  smtp_hello: '163.com'
  smtp_require_tls: false
route:
  group_by: ['job', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: default
  routes:
  - receiver: webhook
    match:
      alertname: CoreDNSDown
receivers:
- name: 'default'
  email_configs:
  - to: '517554016@qq.com'
    send_resolved: true
- name: 'webhook'
  webhook_configs:
  - url: 'http://dingtalk-hook.kube-ops:5000'
    send_resolved: true
```

将上面文件保存为 alertmanager.yaml，然后使用这个文件创建一个 Secret 对象：
```shell
# 先将之前的 secret 对象删除
$ kubectl delete secret alertmanager-main -n monitoring
secret "alertmanager-main" deleted
$ kubectl create secret generic alertmanager-main --from-file=alertmanager.yaml -n monitoring
secret "alertmanager-main" created
```

我们添加了两个接收器，默认的通过邮箱进行发送，对于 CoreDNSDown 这个报警我们通过 webhook 来进行发送，这个 webhook 就是我们前面课程中定义的一个钉钉接收的 Server，上面的步骤创建完成后，很快我们就会收到一条钉钉消息：

![钉钉](https://ws3.sinaimg.cn/large/006tNbRwgy1fyc7drk445j311c0mm7bo.jpg)

同样邮箱中也会收到报警信息：

![邮箱](https://ws1.sinaimg.cn/large/006tNbRwgy1fyc7j3k20vj30u00u4gpx.jpg)

我们再次查看 AlertManager 页面的 status 页面的配置信息可以看到已经变成上面我们的配置信息了：

![alertmanager config](https://ws1.sinaimg.cn/large/006tNbRwgy1fyc7kvs27vj30vp0u017c.jpg)


AlertManager 配置也可以使用模板(.tmpl文件)，这些模板可以与 alertmanager.yaml 配置文件一起添加到 Secret 对象中，比如：
```yaml
apiVersion：v1
kind：secret
metadata：
   name：alertmanager-example
data：
  alertmanager.yaml：{BASE64_CONFIG}
  template_1.tmpl：{BASE64_TEMPLATE_1}
  template_2.tmpl：{BASE64_TEMPLATE_2}
  ...
```

模板会被放置到与配置文件相同的路径，当然要使用这些模板文件，还需要在 alertmanager.yaml 配置文件中指定：
```yaml
templates:
- '*.tmpl'
```

创建成功后，Secret 对象将会挂载到 AlertManager 对象创建的 AlertManager Pod 中去。

### 推荐
最后打个广告，给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)


