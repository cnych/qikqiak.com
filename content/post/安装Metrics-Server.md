---
title: Metrics Server 安装
date: 2019-05-22
tags: ["kubernetes", "metrics-server"]
slug: install-metrics-server
keywords: ["kubernetes", "metrics-server", "安装", "helm"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/photo-1558429886-f2d4fa936469.jpeg",
      desc: "https://unsplash.com/photos/uShcDKPSaCE",
    },
  ]
category: "kubernetes"
notoc: true
---

kubernetes 集群资源监控之前可以通过 heapster 来获取数据，在 1.11 开始开始逐渐废弃 heapster 了，采用 metrics-server 来代替，metrics-server 是集群的核心监控数据的聚合器，它从 kubelet 公开的 Summary API 中采集指标信息，metrics-server 是扩展的 APIServer，依赖于[kube-aggregator](https://github.com/kubernetes/kube-aggregator)，因为我们需要在 APIServer 中开启相关参数。

<!--more-->

查看 APIServer 参数配置，确保你的 APIServer 启动参数中包含下的一些参数配置。

```yaml

---
- --requestheader-client-ca-file=/etc/kubernetes/certs/proxy-ca.crt
- --proxy-client-cert-file=/etc/kubernetes/certs/proxy.crt
- --proxy-client-key-file=/etc/kubernetes/certs/proxy.key
- --requestheader-allowed-names=aggregator
- --requestheader-extra-headers-prefix=X-Remote-Extra-
- --requestheader-group-headers=X-Remote-Group
- --requestheader-username-headers=X-Remote-User
- --enable-aggregator-routing=true
```

> 如果您未在 master 节点上运行 kube-proxy，则必须确保 kube-apiserver 启动参数中包含`--enable-aggregator-routing=true`

## 安装

我们可以直接使用 metrics-server 官方提供的资源清单文件直接安装，地址：[https://github.com/kubernetes-incubator/metrics-server/tree/master/deploy](https://github.com/kubernetes-incubator/metrics-server/tree/master/deploy)

```shell
# kubernetes 1.7
$ kubectl create -f 1.7/

# kubernetes > 1.8
$ kubectl create -f 1.8+/
```

当然我们可以使用 Helm 来安装，我们可以将 metrics-server 的 Chart 包 fetch 到集群中，查看模板，去了解如何部署应用：

```shell
$ helm fetch stable/metrics-server
$ tar -xvf metrics-server-2.7.1.tgz
$ cd metrics-server
```

我们可以使用微软的镜像来覆盖默认的 gcr.io 镜像，如下命名安装：

```shell
$ helm install --name metric --namespace kube-system --set image.repository=gcr.azk8s.cn/google_containers/metrics-server-amd64 .
NAME:   metric
LAST DEPLOYED: Wed May 22 01:30:53 2019
NAMESPACE: kube-system
STATUS: DEPLOYED

RESOURCES:
==> v1/ServiceAccount
NAME                   SECRETS  AGE
metric-metrics-server  1        1s

==> v1/ClusterRole
NAME                                     AGE
system:metrics-server-aggregated-reader  1s
system:metric-metrics-server             1s

==> v1/ClusterRoleBinding
NAME                                         AGE
metric-metrics-server:system:auth-delegator  1s
system:metric-metrics-server                 1s

==> v1beta1/RoleBinding
NAME                               AGE
metric-metrics-server-auth-reader  1s

==> v1/Service
NAME                   TYPE       CLUSTER-IP      EXTERNAL-IP  PORT(S)  AGE
metric-metrics-server  ClusterIP  10.103.214.219  <none>       443/TCP  1s

==> v1/Deployment
NAME                   DESIRED  CURRENT  UP-TO-DATE  AVAILABLE  AGE
metric-metrics-server  1        1        1           0          1s

==> v1beta1/APIService
NAME                    AGE
v1beta1.metrics.k8s.io  1s

==> v1/Pod(related)
NAME                                    READY  STATUS             RESTARTS  AGE
metric-metrics-server-697bd98b8b-kvg2d  0/1    ContainerCreating  0         1s


NOTES:
The metric server has been deployed.

In a few minutes you should be able to list metrics using the following
command:

  kubectl get --raw "/apis/metrics.k8s.io/v1beta1/nodes"

```

等部署完成后，可以查看 Pod 日志是否正常：

```shell
$ kubectl get pods -n kube-system -l release=metric
NAME                                     READY     STATUS    RESTARTS   AGE
metric-metrics-server-697bd98b8b-kvg2d   1/1       Running   0          58m
$ kubectl logs -f metric-metrics-server-697bd98b8b-kvg2d -n kube-system
I0521 17:31:54.580374       1 serving.go:273] Generated self-signed cert (/tmp/apiserver.crt, /tmp/apiserver.key)
[restful] 2019/05/21 17:31:55 log.go:33: [restful/swagger] listing is available at https://:8443/swaggerapi
[restful] 2019/05/21 17:31:55 log.go:33: [restful/swagger] https://:8443/swaggerui/ is mapped to folder /swagger-ui/
I0521 17:31:55.112171       1 serve.go:96] Serving securely on [::]:8443
E0521 17:32:55.229771       1 manager.go:111] unable to fully collect metrics: [unable to fully scrape metrics from source kubelet_summary:ydzs-node2: unable to fetch metrics from kubelet ydzs-node2 (ydzs-node2): Get https://ydzs-node2:10250/stats/summary/: dial tcp: lookup ydzs-node2 on 10.96.0.10:53: no such host, unable to fully scrape metrics from source kubelet_summary:ydzs-master: unable to fetch metrics from kubelet ydzs-master (ydzs-master): Get https://ydzs-master:10250/stats/summary/: dial tcp: lookup ydzs-master on 10.96.0.10:53: no such host, unable to fully scrape metrics from source kubelet_summary:ydzs-node1: unable to fetch metrics from kubelet ydzs-node1 (ydzs-node1): Get https://ydzs-node1:10250/stats/summary/: dial tcp: lookup ydzs-node1 on 10.96.0.10:53: no such host]
```

我们可以发现 Pod 中出现了一些错误信息：`xxx: no such host`，我们看到这个错误信息一般就可以确定是 DNS 解析不了造成的，我们可以看到 metrics-server 会通过 kubelet 的 10250 端口获取信息，使用的是 hostname，我们部署集群的时候在节点的 /etc/hosts 里面添加了节点的 hostname 和 ip 的映射，但是是我们的 metrics-server 的 Pod 内部并没有这个 hosts 信息，当然也就不识别 hostname 了，要解决这个问题，有两种方法：

第一种方法就是在集群内部的 DNS 服务里面添加上 hostname 的解析，比如我们这里集群中使用的是 CoreDNS，我们就可以去修改下 CoreDNS 的 Configmap 信息，添加上 hosts 信息：

```shell
$ kubectl edit configmap coredns -n kube-system
apiVersion: v1
data:
  Corefile: |
    .:53 {
        errors
        health
        hosts {  # 添加集群节点hosts隐射信息
          10.151.30.11 ydzs-master
          10.151.30.22 ydzs-node1
          10.151.30.23 ydzs-node2
          fallthrough
        }
        kubernetes cluster.local in-addr.arpa ip6.arpa {
           pods insecure
           upstream
           fallthrough in-addr.arpa ip6.arpa
        }
        prometheus :9153
        proxy . /etc/resolv.conf
        cache 30
        reload
    }
kind: ConfigMap
metadata:
  creationTimestamp: 2019-05-18T11:07:46Z
  name: coredns
  namespace: kube-system
```

这样当在集群内部访问集群的 hostname 的时候就可以解析到对应的 ip 了，另外一种方法就是在 metrics-server 的启动参数中修改`kubelet-preferred-address-types`参数，如下：（custom-values.yaml）

```yaml
image:
  repository: gcr.azk8s.cn/google_containers/metrics-server-amd64

args:
  - --kubelet-preferred-address-types=InternalIP
```

我们这里使用第二种方式，然后重新安装：

```shell
$ helm delete metric --purge
$ helm install --name metric --namespace kube-system -f custom-values.yaml .
......
$ kubectl get pods -n kube-system |grep metric
metric-metrics-server-58fc94d9f-jlxcb            1/1       Running   0          47s
$ kubectl logs -f metric-metrics-server-58fc94d9f-jlxcb -n kube-system
I0521 17:54:32.873326       1 serving.go:273] Generated self-signed cert (/tmp/apiserver.crt, /tmp/apiserver.key)
[restful] 2019/05/21 17:54:34 log.go:33: [restful/swagger] listing is available at https://:8443/swaggerapi
[restful] 2019/05/21 17:54:34 log.go:33: [restful/swagger] https://:8443/swaggerui/ is mapped to folder /swagger-ui/
I0521 17:54:34.668940       1 serve.go:96] Serving securely on [::]:8443

E0521 17:55:34.650303       1 manager.go:111] unable to fully collect metrics: [unable to fully scrape metrics from source kubelet_summary:ydzs-master: unable to fetch metrics from kubelet ydzs-master (10.151.30.11): Get https://10.151.30.11:10250/stats/summary/: x509: cannot validate certificate for 10.151.30.11 because it doesn't contain any IP SANs, unable to fully scrape metrics from source kubelet_summary:ydzs-node2: unable to fetch metrics from kubelet ydzs-node2 (10.151.30.23): Get https://10.151.30.23:10250/stats/summary/: x509: cannot validate certificate for 10.151.30.23 because it doesn't contain any IP SANs, unable to fully scrape metrics from source kubelet_summary:ydzs-node1: unable to fetch metrics from kubelet ydzs-node1 (10.151.30.22): Get https://10.151.30.22:10250/stats/summary/: x509: cannot validate certificate for 10.151.30.22 because it doesn't contain any IP SANs]
```

因为部署集群的时候，CA 证书并没有把各个节点的 IP 签上去，所以这里 metrics-server 通过 IP 去请求时，提示签的证书没有对应的 IP（错误：x509: cannot validate certificate for 192.168.33.11 because it doesn't contain any IP SANs），我们可以添加一个`--kubelet-insecure-tls`参数跳过证书校验：

```yaml
image:
  repository: gcr.azk8s.cn/google_containers/metrics-server-amd64

args:
  - --kubelet-insecure-tls
  - --kubelet-preferred-address-types=InternalIP
```

然后再`重新安装`即可成功!

```shell
$ kubectl get apiservice | grep metrics
v1beta1.metrics.k8s.io                 2019-05-21T18:03:03Z
$ kubectl get --raw "/apis/metrics.k8s.io/v1beta1/nodes"
{"kind":"NodeMetricsList","apiVersion":"metrics.k8s.io/v1beta1","metadata":{"selfLink":"/apis/metrics.k8s.io/v1beta1/nodes"},"items":[{"metadata":{"name":"ydzs-master","selfLink":"/apis/metrics.k8s.io/v1beta1/nodes/ydzs-master","creationTimestamp":"2019-05-22T22:11:16Z"},"timestamp":"2019-05-22T22:11:01Z","window":"30s","usage":{"cpu":"516674270n","memory":"2555172Ki"}},{"metadata":{"name":"ydzs-node1","selfLink":"/apis/metrics.k8s.io/v1beta1/nodes/ydzs-node1","creationTimestamp":"2019-05-22T22:11:16Z"},"timestamp":"2019-05-22T22:11:05Z","window":"30s","usage":{"cpu":"413218279n","memory":"3417680Ki"}}]}
$ kubectl top nodes
NAME          CPU(cores)   CPU%      MEMORY(bytes)   MEMORY%
ydzs-master   496m         24%       2443Mi          66%
ydzs-node1    412m         10%       3338Mi          43%
```

> 本篇文章使用的集群版本为 kubernetes v1.11.0 版本，采用 Kubeadm 方式安装。

在安装的过程中或多或少可能会有一些问题，最好的办法就是一步一步的去排错，出现了错误不要着急，最重要的就是分析错误日志信息，很多错误日志提示其实已经非常明显了。

<!--adsense-self-->
