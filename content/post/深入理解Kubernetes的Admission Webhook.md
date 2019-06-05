---
title: 深入理解 Kubernetes Admission Webhook
date: 2019-06-05
tags: ["kubernetes", "admission", "webhook", "istio"]
keywords: ["kubernetes", "admission", "webhook", "istio", "apiserver", "准入控制", "Envoy", "Pod"]
slug: k8s-admission-webhook
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1559657693-e816ff3bd9af.jpeg", desc: "https://unsplash.com/photos/flfhAlEwDq4"}]
category: "kubernetes"
---

[Kubernetes](/tags/kubernetes/) 提供了需要扩展其内置功能的方法，最常用的可能是自定义资源类型和自定义控制器了，除此之外，[Kubernetes](/tags/kubernetes/) 还有一些其他非常有趣的功能，比如 [admission webhooks](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/#admission-webhooks) 或者 [initializers](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/#initializers)，这些也可以用于扩展 API，它们可以用于修改某些 Kubernetes 资源的基本行为，接下来我们来看看那些引入了 admission webhooks 的动态准入控制。

<!--more-->

## 准入控制器
首先，我们先看看 Kubernetes 官方文档中关于`准入控制器`的定义：

> An admission controller is a piece of code that intercepts requests to the Kubernetes API server prior to persistence of the object, but after the request is authenticated and authorized. […] Admission controllers may be “validating”, “mutating”, or both. Mutating controllers may modify the objects they admit; validating controllers may not. […] If any of the controllers in either phase reject the request, the entire request is rejected immediately and an error is returned to the end-user.

大概意思就是说`准入控制器`是在对象持久化之前用于对 Kubernetes API Server 的请求进行拦截的代码段，在请求经过身份验证和授权之后放行通过。准入控制器可能正在`validating`、`mutating`或者都在执行，Mutating 控制器可以修改他们的处理的资源对象，Validating 控制器不会，如果任何一个阶段中的任何控制器拒绝了请求，则会立即拒绝整个请求，并将错误返回给最终的用户。

这意味着有一些特殊的控制器可以拦截 Kubernetes API 请求，并根据自定义的逻辑修改或者拒绝它们。Kubernetes 有自己实现的一个控制器列表：[https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#what-does-each-admission-controller-do](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#what-does-each-admission-controller-do)，当然你也可以编写自己的控制器，虽然这些控制器听起来功能比较强大，但是这些控制器需要被编译进 kube-apiserver，并且只能在 apiserver 启动时启动。

由于上面的控制器的限制，我们就需要用到**“动态”**的概念了，而不是和 apiserver 耦合在一起，`Admission webhooks`和`initializers`就通过一种动态配置方法解决了这个限制问题。对于这两个功能，`initializers`属于比较新的功能，而且平时用得非常少，还是一个`alpha`特性，所以更多的我们会来了解下`Admission webhooks`的使用方法。

### admission webhook 是什么?
在 Kubernetes apiserver 中包含两个特殊的准入控制器：`MutatingAdmissionWebhook`和`ValidatingAdmissionWebhook`。这两个控制器将发送准入请求到外部的 HTTP 回调服务并接收一个准入响应。如果启用了这两个准入控制器，Kubernetes 管理员可以在集群中创建和配置一个 admission webhook。

![k8s api request lifecycle](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-api-request-lifecycle.png)


总的来说，这样做的步骤如下：

* 检查集群中是否启用了 admission webhook 控制器，并根据需要进行配置。
* 编写处理准入请求的 HTTP 回调，回调可以是一个部署在集群中的简单 HTTP 服务，甚至也可以是一个 serverless 函数，例如：[https://github.com/kelseyhightower/denyenv-validating-admission-webhook](https://github.com/kelseyhightower/denyenv-validating-admission-webhook)
* 通过`MutatingWebhookConfiguration`和`ValidatingWebhookConfiguration`资源配置 admission webhook。

这两种类型的 admission webhook 之间的区别是非常明显的：validating webhooks 可以拒绝请求，但是它们却不能修改在准入请求中获取的对象，而 mutating webhooks 可以在返回准入响应之前通过创建补丁来修改对象，如果 webhook 拒绝了一个请求，则会向最终用户返回错误。

现在非常火热的的 [Service Mesh](/post/what-is-service-mesh/) 应用`istio`就是通过 mutating webhooks 来自动将`Envoy`这个 sidecar 容器注入到 Pod 中去的：[https://istio.io/docs/setup/kubernetes/sidecar-injection/](https://istio.io/docs/setup/kubernetes/sidecar-injection/)。


## 创建配置一个 Admission Webhook
上面我们介绍了 Admission Webhook 的理论知识，接下来我们在一个真实的 Kubernetes 集群中来实际测试使用下，我们将创建一个 webhook 的 webserver，将其部署到集群中，然后创建 webhook 配置查看是否生效。

### 先决条件
一个 Kubernetes 当然是必须的，你可以通过[二进制](/post/manual-install-high-available-kubernetes-cluster/)或者 [Kubeadm 来快速搭建集群](/post/use-kubeadm-install-kubernetes-1.10/)，或者使用云服务厂商托管的集群都可以。（1.9版本以上）

然后确保在 apiserver 中启用了`MutatingAdmissionWebhook`和`ValidatingAdmissionWebhook`这两个控制器，通过运行下面的命令检查集群中是否启用了准入注册 API：
```shell
$ kubectl api-versions |grep admission

admissionregistration.k8s.io/v1beta1
```

### 编写 webhook
满足了前面的先决条件后，接下来我们就来实现一个 webhook 示例，通过监听两个不同的 HTTP 路径（validate 和 mutate）作为 validating 和 mutating webhook。

todo...

<!--adsense-self-->
