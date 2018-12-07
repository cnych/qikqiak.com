---
title: Kubernetes API 资源使用
subtitle: 应该使用哪个 Group 和 Version?
date: 2018-12-07
tags: ["kubernetes", "api"]
keywords: ["kubernetes", "api", "Group", "Version"]
slug: k8s-api-resources-group-and-version
gitcomment: true
bigimg: [{src: "/img/posts/photo-1543928069-4ce45659e968.jpeg", desc: "API Resource"}]
category: "kubernetes"
---

`Kubernetes`使用声明式的 API 让系统更加健壮。但是这样也就意味着我们想要系统执行某些操作就需要通过使用`CLI`或者`REST API`来创建一个资源对象，为此，我们需要定义 API 资源的名称、组和版本等信息。但是很多用户就会为此感到困惑了，因为有太多的资源、太多的版本、太多的组了，这些都非常容易产生混淆。如果我们通过 YAML 文件定义过 Deployment 这样的资源清单文件的话，那么你应该会看到`apiVersion: apps/v1beta2`、`apiVersion: apps/v1`等等这样的信息，那么我们到底应该使用哪一个呢？哪一个才是正确的呢？如何检查`Kubernetes`集群支持哪些？其实我们使用`kubectl`工具就可以来解决我们的这些疑惑。

<!--more-->

> 原文链接：https://akomljen.com/kubernetes-api-resources-which-group-and-version-to-use/

## API Resources
我们可以通过下面的命令来获取`Kubernetes`集群支持的所有 API 资源：
```shell
$ kubectl api-resources -o wide
NAME                              SHORTNAMES   APIGROUP                       NAMESPACED   KIND                             VERBS
bindings                                                                      true         Binding                          [create]
componentstatuses                 cs                                          false        ComponentStatus                  [get list]
configmaps                        cm                                          true         ConfigMap                        [create delete deletecollection get list patch update watch]
endpoints                         ep                                          true         Endpoints                        [create delete deletecollection get list patch update watch]
events                            ev                                          true         Event                            [create delete deletecollection get list patch update watch]
limitranges                       limits                                      true         LimitRange                       [create delete deletecollection get list patch update watch]
namespaces                        ns                                          false        Namespace                        [create delete get list patch update watch]
nodes                             no                                          false        Node                             [create delete deletecollection get list patch proxy update watch]
persistentvolumeclaims            pvc                                         true         PersistentVolumeClaim            [create delete deletecollection get list patch update watch]
persistentvolumes                 pv                                          false        PersistentVolume                 [create delete deletecollection get list patch update watch]
pods                              po                                          true         Pod                              [create delete deletecollection get list patch proxy update watch]
podtemplates                                                                  true         PodTemplate                      [create delete deletecollection get list patch update watch]
replicationcontrollers            rc                                          true         ReplicationController            [create delete deletecollection get list patch update watch]
resourcequotas                    quota                                       true         ResourceQuota                    [create delete deletecollection get list patch update watch]
secrets                                                                       true         Secret                           [create delete deletecollection get list patch update watch]
serviceaccounts                   sa                                          true         ServiceAccount                   [create delete deletecollection get list patch update watch]
services                          svc                                         true         Service                          [create delete get list patch proxy update watch]
mutatingwebhookconfigurations                  admissionregistration.k8s.io   false        MutatingWebhookConfiguration     [create delete deletecollection get list patch update watch]
validatingwebhookconfigurations                admissionregistration.k8s.io   false        ValidatingWebhookConfiguration   [create delete deletecollection get list patch update watch]
customresourcedefinitions         crd          apiextensions.k8s.io           false        CustomResourceDefinition         [create delete deletecollection get list patch update watch]
apiservices                                    apiregistration.k8s.io         false        APIService                       [create delete deletecollection get list patch update watch]
controllerrevisions                            apps                           true         ControllerRevision               [create delete deletecollection get list patch update watch]
daemonsets                        ds           apps                           true         DaemonSet                        [create delete deletecollection get list patch update watch]
deployments                       deploy       apps                           true         Deployment                       [create delete deletecollection get list patch update watch]
replicasets                       rs           apps                           true         ReplicaSet                       [create delete deletecollection get list patch update watch]
statefulsets                      sts          apps                           true         StatefulSet                      [create delete deletecollection get list patch update watch]
...
```

> 需要注意的是在`1.11.0`以上版本的集群中`kubectl`才支持上面的`api-resources`命令。

上面的命令输出了很多有用的信息：

* `SHORTNAMES` - 资源名称的简写，比如 deployments 简写就是 deploy，我们可以将这些快捷方式与`kubectl`一起使用
* `APIGROUP` - 我们可以[查看官方文档以了解更多信息](https://kubernetes.io/docs/reference/using-api/#api-groups)，但简而言之，您将在`yaml`文件中使用它像`apiVersion：<APIGROUP>/v1`
* `KIND` - 资源名称
* `VERBS` - 可用的方法，在您想要定义`ClusterRole RBAC`规则时也很有用，您还可以选择获取特定 API 组的 API 资源，例如：

```shell
$ kubectl api-resources --api-group apps -o wide
NAME                  SHORTNAMES   APIGROUP   NAMESPACED   KIND                 VERBS
controllerrevisions                apps       true         ControllerRevision   [create delete deletecollection get list patch update watch]
daemonsets            ds           apps       true         DaemonSet            [create delete deletecollection get list patch update watch]
deployments           deploy       apps       true         Deployment           [create delete deletecollection get list patch update watch]
replicasets           rs           apps       true         ReplicaSet           [create delete deletecollection get list patch update watch]
statefulsets          sts          apps       true         StatefulSet
```

对于上面的每种资源类型，我们都可以使用`kubectl explain`命令来获取有关的资源详细信息：
```shell
$ kubectl explain configmap
DESCRIPTION:
ConfigMap holds configuration data for pods to consume.

FIELDS:
   apiVersion   <string>
     APIVersion defines the versioned schema of this representation of an
     object. Servers should convert recognized schemas to the latest internal
     value, and may reject unrecognized values. More info:
     https://git.k8s.io/community/contributors/devel/api-conventions.md#resources

   data <object>
     Data contains the configuration data. Each key must consist of alphanumeric
     characters, '-', '_' or '.'.

   kind <string>
     Kind is a string value representing the REST resource this object
     represents. Servers may infer this from the endpoint the client submits
     requests to. Cannot be updated. In CamelCase. More info:
     https://git.k8s.io/community/contributors/devel/api-conventions.md#types-kinds

   metadata <Object>
     Standard object's metadata. More info:
     https://git.k8s.io/community/contributors/devel/api-conventions.md#metadata
```

> `kubectl explain`命令非常有用，特别是在我们不知道该如何编写`YAML`文件的时候，就可以使用改命令来帮助我们获得更多提示信息。

需要注意的是`explain`命令可能会显示旧的`group/version`，我们可以通过`--api-version`参数显示设置它，比如：
请注意，explain可能会显示旧组/版本，但您可以使用--api-version显式设置它，例如：
```shell
kubectl explain replicaset --api-version apps/v1
```

## API Versions
我们也可以使用下面的命令来获取集群支持的所有 API 版本：
```shell
$ kubectl api-versions
admissionregistration.k8s.io/v1beta1
apiextensions.k8s.io/v1beta1
apiregistration.k8s.io/v1beta1
apps/v1
apps/v1beta1
apps/v1beta2
authentication.k8s.io/v1
authentication.k8s.io/v1beta1
authorization.k8s.io/v1
authorization.k8s.io/v1beta1
autoscaling/v1
autoscaling/v2beta1
batch/v1
batch/v1beta1
certificates.k8s.io/v1beta1
certmanager.k8s.io/v1alpha1
enterprises.upmc.com/v1
events.k8s.io/v1beta1
extensions/v1beta1
metrics.k8s.io/v1beta1
monitoring.coreos.com/v1
networking.k8s.io/v1
policy/v1beta1
rbac.authorization.k8s.io/v1
rbac.authorization.k8s.io/v1beta1
storage.k8s.io/v1
storage.k8s.io/v1beta1
v1
```

输出结果是以`group/version`的方式呈现的，可以通过[查看此页面](https://kubernetes.io/docs/reference/using-api/#api-versioning)了解更多有关`Kubernetes`中 API 版本控制的信息。

有的时候，我们只想检查特定的`group/version`是否可以用于某些资源即可，大多数的资源都有可用的`GET`方法，所以我们只需要尝试获取下资源，同时提供 API 的 version 和 group 即可验证，`kubectl get <API_RESOURCE_NAME>.<API_VERSION>.<API_GROUP>`，例如：
```shell
$ kubectl get deployments.v1.apps -n kube-system
NAME                         DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
cert-manager                 1         1         1            1           1d
heapster                     1         1         1            1           183d
infra-wayne                  1         1         1            1           17d
kube-dns                     1         1         1            1           183d
kubernetes-dashboard         1         1         1            1           202d
monitoring-grafana           1         1         1            1           183d
monitoring-influxdb          1         1         1            1           183d
tiller-deploy                1         1         1            1           98d
traefik-ingress-controller   1         1         1            1           102d
```

如果资源不存在指定的`group/version`组合或者资源根本不存在，我们将会收到错误信息：
```shell
$ kubectl get deployments.v1beta.apps -n kube-system
error: the server doesn't have a resource type "deployments"
```

## 总结
本文将帮助您了解`YAML`文件中的`kind`和`apiVersion`这两个内容，如果你想了解更多关于`Kubernetes`设计的信息，我建议你[查看下这篇文章](https://thenewstack.io/kubernetes-design-and-development-explained/)，谢谢。

## 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://www.haimaxy.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://www.haimaxy.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)


