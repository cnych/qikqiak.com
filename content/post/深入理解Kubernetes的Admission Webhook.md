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

这个 webhook 的完整代码可以在 Github 上获取：[https://github.com/banzaicloud/admission-webhook-example]，我们将根据这个 repo 为基础来 fork 一份代码进行更改。这个 webhook 是一个简单的带 TLS 认证的 HTTP 服务，用 Deployment 方式部署在我们的集群中。

代码中主要的逻辑在两个文件中：`main.go`和`webhook.go`，`main.go`文件包含创建 HTTP 服务的代码，而`webhook.go`包含 validates 和 mutates 的 webhook 逻辑，大部分代码都比较简单，首先查看`main.go`文件，查看如何使用标准 golang 包来启动 HTTP 服务，以及如何从命令行标志中[读取 TLS 配置](https://github.com/banzaicloud/admission-webhook-example/blob/blog/main.go#L21)的证书：

```golang
flag.StringVar(&parameters.certFile, "tlsCertFile", "/etc/webhook/certs/cert.pem", "File containing the x509 Certificate for HTTPS.")
flag.StringVar(&parameters.keyFile, "tlsKeyFile", "/etc/webhook/certs/key.pem", "File containing the x509 private key to --tlsCertFile.")
```

然后一个比较重要的是 serve 函数，用来处理传入的 mutate 函数和 validating 的 HTTP 请求。该函数从请求中反序列化 AdmissionReview，执行一些基本的内容校验，根据 URL 路径调用相应的 mutate 和 validate 函数，然后序列化 AdmissionReview 响应。
```golang
func (whsvr *WebhookServer) serve(w http.ResponseWriter, r *http.Request) {
	var body []byte
	if r.Body != nil {
		if data, err := ioutil.ReadAll(r.Body); err == nil {
			body = data
		}
	}
	if len(body) == 0 {
		glog.Error("empty body")
		http.Error(w, "empty body", http.StatusBadRequest)
		return
	}

	// verify the content type is accurate
	contentType := r.Header.Get("Content-Type")
	if contentType != "application/json" {
		glog.Errorf("Content-Type=%s, expect application/json", contentType)
		http.Error(w, "invalid Content-Type, expect `application/json`", http.StatusUnsupportedMediaType)
		return
	}

	var admissionResponse *v1beta1.AdmissionResponse
	ar := v1beta1.AdmissionReview{}
	if _, _, err := deserializer.Decode(body, nil, &ar); err != nil {
		glog.Errorf("Can't decode body: %v", err)
		admissionResponse = &v1beta1.AdmissionResponse{
			Result: &metav1.Status{
				Message: err.Error(),
			},
		}
	} else {
		fmt.Println(r.URL.Path)
		if r.URL.Path == "/mutate" {
			admissionResponse = whsvr.mutate(&ar)
		} else if r.URL.Path == "/validate" {
			admissionResponse = whsvr.validate(&ar)
		}
	}

	admissionReview := v1beta1.AdmissionReview{}
	if admissionResponse != nil {
		admissionReview.Response = admissionResponse
		if ar.Request != nil {
			admissionReview.Response.UID = ar.Request.UID
		}
	}

	resp, err := json.Marshal(admissionReview)
	if err != nil {
		glog.Errorf("Can't encode response: %v", err)
		http.Error(w, fmt.Sprintf("could not encode response: %v", err), http.StatusInternalServerError)
	}
	glog.Infof("Ready to write reponse ...")
	if _, err := w.Write(resp); err != nil {
		glog.Errorf("Can't write response: %v", err)
		http.Error(w, fmt.Sprintf("could not write response: %v", err), http.StatusInternalServerError)
	}
}
```

主要的准入逻辑是 validate 和 mutate 函数，

主要的准入逻辑是验证和变异函数。 验证检查是否需要许可：我们不想验证kube-system和kube-public命名空间中的资源，如果有明确告诉我们忽略它的注释，则不想验证资源（admission-webhook） -example.banzaicloud.com/validate设置为false）。 如果需要验证，则根据资源类型从请求中解组服务或部署资源，并将标签与其对应项进行比较。 如果缺少某些标签，则响应中的“允许”设置为false。 如果验证失败，则会在响应中写入失败原因，最终用户在尝试创建资源时会收到失败。

mutate的代码非常相似，但不是仅仅比较标签并在响应中放置Allowed，而是创建一个补丁，将缺失的标签添加到资源中，并将not_available设置为其值。

> TODO......

<!--adsense-self-->
