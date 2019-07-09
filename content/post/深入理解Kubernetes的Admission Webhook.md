---
title: 深入理解 Kubernetes Admission Webhook
date: 2019-07-05
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
<!--adsense-text-->
由于上面的控制器的限制，我们就需要用到**“动态”**的概念了，而不是和 apiserver 耦合在一起，`Admission webhooks`和`initializers`就通过一种动态配置方法解决了这个限制问题。对于这两个功能，`initializers`属于比较新的功能，而且平时用得非常少，还是一个`alpha`特性，所以更多的我们会来了解下`Admission webhooks`的使用方法。

> 在新版本(1.14+) kubernetes 集群中已经移除了对`initializers`的支持，所以可以不用考虑这种方式。

### admission webhook 是什么?
在 Kubernetes apiserver 中包含两个特殊的准入控制器：`MutatingAdmissionWebhook`和`ValidatingAdmissionWebhook`。这两个控制器将发送准入请求到外部的 HTTP 回调服务并接收一个准入响应。如果启用了这两个准入控制器，Kubernetes 管理员可以在集群中创建和配置一个 admission webhook。

![k8s api request lifecycle](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-api-request-lifecycle.png)


总的来说，这样做的步骤如下：

* 检查集群中是否启用了 admission webhook 控制器，并根据需要进行配置。
* 编写处理准入请求的 HTTP 回调，回调可以是一个部署在集群中的简单 HTTP 服务，甚至也可以是一个 serverless 函数，例如：[https://github.com/kelseyhightower/denyenv-validating-admission-webhook](https://github.com/kelseyhightower/denyenv-validating-admission-webhook)
* 通过`MutatingWebhookConfiguration`和`ValidatingWebhookConfiguration`资源配置 admission webhook。

这两种类型的 admission webhook 之间的区别是非常明显的：validating webhooks 可以拒绝请求，但是它们却不能修改在准入请求中获取的对象，而 mutating webhooks 可以在返回准入响应之前通过创建补丁来修改对象，如果 webhook 拒绝了一个请求，则会向最终用户返回错误。

现在非常火热的的 [Service Mesh](https://www.qikqiak.com/post/what-is-service-mesh/) 应用`istio`就是通过 mutating webhooks 来自动将`Envoy`这个 sidecar 容器注入到 Pod 中去的：[https://istio.io/docs/setup/kubernetes/sidecar-injection/](https://istio.io/docs/setup/kubernetes/sidecar-injection/)。


## 创建配置一个 Admission Webhook
上面我们介绍了 Admission Webhook 的理论知识，接下来我们在一个真实的 Kubernetes 集群中来实际测试使用下，我们将创建一个 webhook 的 webserver，将其部署到集群中，然后创建 webhook 配置查看是否生效。

### 先决条件
一个 Kubernetes 当然是必须的，你可以通过[二进制](/post/manual-install-high-available-kubernetes-cluster/)或者 [Kubeadm 来快速搭建集群](/post/use-kubeadm-install-kubernetes-1.10/)，或者使用云服务厂商托管的集群都可以。（1.9版本以上）

然后确保在 apiserver 中启用了`MutatingAdmissionWebhook`和`ValidatingAdmissionWebhook`这两个控制器，由于我这里集群使用的是 kubeadm 搭建的，可以通过查看 apiserver Pod 的配置：
```shell
$ kubectl get pods kube-apiserver-ydzs-master -n kube-system -o yaml
apiVersion: v1
kind: Pod
metadata:
  labels:
    component: kube-apiserver
    tier: control-plane
  name: kube-apiserver-ydzs-master
  namespace: kube-system
......
spec:
  containers:
  - command:
    - kube-apiserver
    - --advertise-address=10.151.30.11
    - --allow-privileged=true
    - --authorization-mode=Node,RBAC
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --enable-admission-plugins=NodeRestriction,MutatingAdmissionWebhook,ValidatingAdmissionWebhook
......
```

上面的`enable-admission-plugins`参数中带上了`MutatingAdmissionWebhook`和`ValidatingAdmissionWebhook`两个准入控制插件，如果没有的，需要添加上这两个参数，然后重启 apiserver。

然后通过运行下面的命令检查集群中是否启用了准入注册 API：
```shell
$ kubectl api-versions |grep admission

admissionregistration.k8s.io/v1beta1
```

### 编写 webhook
满足了前面的先决条件后，接下来我们就来实现一个 webhook 示例，通过监听两个不同的 HTTP 路径（validate 和 mutate）来进行 validating 和 mutating webhook 验证。

这个 webhook 的完整代码可以在 Github 上获取：[https://github.com/cnych/admission-webhook-example](https://github.com/cnych/admission-webhook-example)，该代码 Fork 自仓库[https://github.com/banzaicloud/admission-webhook-example](https://github.com/banzaicloud/admission-webhook-example)。这个 webhook 是一个简单的带 TLS 认证的 HTTP 服务，用 Deployment 方式部署在我们的集群中。

代码中主要的逻辑在两个文件中：`main.go`和`webhook.go`，`main.go`文件包含创建 HTTP 服务的代码，而`webhook.go`包含 validates 和 mutates 两个 webhook 的逻辑，大部分代码都比较简单，首先查看`main.go`文件，查看如何使用标准 golang 包来启动 HTTP 服务，以及如何从命令行标志中[读取 TLS 配置](https://github.com/cnych/admission-webhook-example/blob/blog/main.go#L21)的证书：

```golang
flag.StringVar(&parameters.certFile, "tlsCertFile", "/etc/webhook/certs/cert.pem", "File containing the x509 Certificate for HTTPS.")
flag.StringVar(&parameters.keyFile, "tlsKeyFile", "/etc/webhook/certs/key.pem", "File containing the x509 private key to --tlsCertFile.")
```

然后一个比较重要的是 serve 函数，用来处理传入的 mutate 和 validating 函数 的 HTTP 请求。该函数从请求中反序列化 AdmissionReview 对象，执行一些基本的内容校验，根据 URL 路径调用相应的 mutate 和 validate 函数，然后序列化 AdmissionReview 对象：
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

主要的准入逻辑是 validate 和 mutate 两个函数。validate 函数检查资源对象是否需要校验：不验证 kube-system 和 kube-public 两个命名空间中的资源，如果想要显示的声明不验证某个资源，可以通过在资源对象中添加一个`admission-webhook-example.qikqiak.com/validate=false`的 annotation 进行声明。如果需要验证，则根据资源类型的 kind，和标签与其对应项进行比较，将 service 或者 deployment 资源从请求中反序列化出来。如果缺少某些 label 标签，则响应中的`Allowed`会被设置为 false。如果验证失败，则会在响应中写入失败原因，最终用户在尝试创建资源时会收到失败的信息。validate 函数实现如下所示：
```golang
// validate deployments and services
func (whsvr *WebhookServer) validate(ar *v1beta1.AdmissionReview) *v1beta1.AdmissionResponse {
	req := ar.Request
	var (
		availableLabels                 map[string]string
		objectMeta                      *metav1.ObjectMeta
		resourceNamespace, resourceName string
	)

	glog.Infof("AdmissionReview for Kind=%v, Namespace=%v Name=%v (%v) UID=%v patchOperation=%v UserInfo=%v",
		req.Kind, req.Namespace, req.Name, resourceName, req.UID, req.Operation, req.UserInfo)

	switch req.Kind.Kind {
	case "Deployment":
		var deployment appsv1.Deployment
		if err := json.Unmarshal(req.Object.Raw, &deployment); err != nil {
			glog.Errorf("Could not unmarshal raw object: %v", err)
			return &v1beta1.AdmissionResponse{
				Result: &metav1.Status{
					Message: err.Error(),
				},
			}
		}
		resourceName, resourceNamespace, objectMeta = deployment.Name, deployment.Namespace, &deployment.ObjectMeta
		availableLabels = deployment.Labels
	case "Service":
		var service corev1.Service
		if err := json.Unmarshal(req.Object.Raw, &service); err != nil {
			glog.Errorf("Could not unmarshal raw object: %v", err)
			return &v1beta1.AdmissionResponse{
				Result: &metav1.Status{
					Message: err.Error(),
				},
			}
		}
		resourceName, resourceNamespace, objectMeta = service.Name, service.Namespace, &service.ObjectMeta
		availableLabels = service.Labels
	}

	if !validationRequired(ignoredNamespaces, objectMeta) {
		glog.Infof("Skipping validation for %s/%s due to policy check", resourceNamespace, resourceName)
		return &v1beta1.AdmissionResponse{
			Allowed: true,
		}
	}

	allowed := true
	var result *metav1.Status
	glog.Info("available labels:", availableLabels)
	glog.Info("required labels", requiredLabels)
	for _, rl := range requiredLabels {
		if _, ok := availableLabels[rl]; !ok {
			allowed = false
			result = &metav1.Status{
				Reason: "required labels are not set",
			}
			break
		}
	}

	return &v1beta1.AdmissionResponse{
		Allowed: allowed,
		Result:  result,
	}
}
```

判断是否需要进行校验的方法如下，可以通过 namespace 进行忽略，也可以通过 annotations 设置进行配置：
```golang
func validationRequired(ignoredList []string, metadata *metav1.ObjectMeta) bool {
	required := admissionRequired(ignoredList, admissionWebhookAnnotationValidateKey, metadata)
	glog.Infof("Validation policy for %v/%v: required:%v", metadata.Namespace, metadata.Name, required)
	return required
}

func admissionRequired(ignoredList []string, admissionAnnotationKey string, metadata *metav1.ObjectMeta) bool {
	// skip special kubernetes system namespaces
	for _, namespace := range ignoredList {
		if metadata.Namespace == namespace {
			glog.Infof("Skip validation for %v for it's in special namespace:%v", metadata.Name, metadata.Namespace)
			return false
		}
	}

	annotations := metadata.GetAnnotations()
	if annotations == nil {
		annotations = map[string]string{}
	}

	var required bool
	switch strings.ToLower(annotations[admissionAnnotationKey]) {
	default:
		required = true
	case "n", "no", "false", "off":
		required = false
	}
	return required
}
```

mutate 函数的代码是非常类似的，但不是仅仅比较标签并在响应中设置`Allowed`，而是创建一个补丁，将缺失的标签添加到资源中，并将`not_available`设置为标签的值。

```golang
// main mutation process
func (whsvr *WebhookServer) mutate(ar *v1beta1.AdmissionReview) *v1beta1.AdmissionResponse {
	req := ar.Request
	var (
		availableLabels, availableAnnotations map[string]string
		objectMeta                            *metav1.ObjectMeta
		resourceNamespace, resourceName       string
	)

	glog.Infof("AdmissionReview for Kind=%v, Namespace=%v Name=%v (%v) UID=%v patchOperation=%v UserInfo=%v",
		req.Kind, req.Namespace, req.Name, resourceName, req.UID, req.Operation, req.UserInfo)

	switch req.Kind.Kind {
	case "Deployment":
		var deployment appsv1.Deployment
		if err := json.Unmarshal(req.Object.Raw, &deployment); err != nil {
			glog.Errorf("Could not unmarshal raw object: %v", err)
			return &v1beta1.AdmissionResponse{
				Result: &metav1.Status{
					Message: err.Error(),
				},
			}
		}
		resourceName, resourceNamespace, objectMeta = deployment.Name, deployment.Namespace, &deployment.ObjectMeta
		availableLabels = deployment.Labels
	case "Service":
		var service corev1.Service
		if err := json.Unmarshal(req.Object.Raw, &service); err != nil {
			glog.Errorf("Could not unmarshal raw object: %v", err)
			return &v1beta1.AdmissionResponse{
				Result: &metav1.Status{
					Message: err.Error(),
				},
			}
		}
		resourceName, resourceNamespace, objectMeta = service.Name, service.Namespace, &service.ObjectMeta
		availableLabels = service.Labels
	}

	if !mutationRequired(ignoredNamespaces, objectMeta) {
		glog.Infof("Skipping validation for %s/%s due to policy check", resourceNamespace, resourceName)
		return &v1beta1.AdmissionResponse{
			Allowed: true,
		}
	}

	annotations := map[string]string{admissionWebhookAnnotationStatusKey: "mutated"}
	patchBytes, err := createPatch(availableAnnotations, annotations, availableLabels, addLabels)
	if err != nil {
		return &v1beta1.AdmissionResponse{
			Result: &metav1.Status{
				Message: err.Error(),
			},
		}
	}

	glog.Infof("AdmissionResponse: patch=%v\n", string(patchBytes))
	return &v1beta1.AdmissionResponse{
		Allowed: true,
		Patch:   patchBytes,
		PatchType: func() *v1beta1.PatchType {
			pt := v1beta1.PatchTypeJSONPatch
			return &pt
		}(),
	}
}
```

### 构建
其实我们已经将代码打包成一个 docker 镜像了，你可以直接使用，镜像仓库地址为：`cnych/admission-webhook-example:v1`。当然如果你希望更改部分代码，那就需要重新构建项目了，由于这个项目采用 go 语言开发，依赖使用的是`dep`工具，所以我们需要确保构建环境提前安装好 go 环境和 dep 工具，当然 docker 也是必不可少的，因为我们需要的是打包成一个 docker 镜像。

新建项目文件夹：
```shell
$ mkdir admission-webhook && cd admission-webhook
# 创建go项目代码目录，设置当前目录为GOPATH路径
$ mkdir src && export GOPATH=$pwd
$ mkdir -p src/github.com/cnych/ && cd src/github.com/cnych/
```

进入到上面的`src/github.com/cnych/`目录下面，将项目代码 clone 下面：
```shell
$ git clone https://github.com/cnych/admission-webhook-example.git
```

我们可以看到代码根目录下面有一个`build`的脚本，只需要提供我们自己的 docker 镜像用户名然后直接构建即可：
```shell
$ export DOCKER_USER=cnych
$ ./build
```

### 部署服务
为了部署 webhook server，我们需要在我们的 Kubernetes 集群中创建一个 service 和 deployment 资源对象，部署是非常简单的，只是需要配置下服务的 TLS 配置。我们可以在代码根目录下面的 deployment 文件夹下面查看`deployment.yaml`文件中关于证书的配置声明，会发现从命令行参数中读取的证书和私钥文件是通过一个 secret 对象挂载进来的：
```yaml
args:
	- -tlsCertFile=/etc/webhook/certs/cert.pem
	- -tlsKeyFile=/etc/webhook/certs/key.pem
[...]
	volumeMounts:
	- name: webhook-certs
		mountPath: /etc/webhook/certs
		readOnly: true
volumes:
- name: webhook-certs
  secret:
	secretName: admission-webhook-example-certs
```

在生产环境中，对于 TLS 证书（特别是私钥）的处理是非常重要的，我们可以使用类似于[cert-manager](https://www.qikqiak.com/post/automatic-kubernetes-ingress-https-with-lets-encrypt)之类的工具来自动处理 TLS 证书，或者将私钥密钥存储在Vault中，而不是直接存在 secret 资源对象中。
<!--adsense-text-->
我们可以使用任何类型的证书，但是需要注意的是我们这里设置的 CA 证书是需要让 apiserver 能够验证的，我们这里可以重用 Istio 项目中的生成的[证书签名请求脚本](https://github.com/istio/istio/blob/release-0.7/install/kubernetes/webhook-create-signed-cert.sh)。通过发送请求到 apiserver，获取认证信息，然后使用获得的结果来创建需要的 secret 对象。

首先，运行[该脚本](https://github.com/cnych/admission-webhook-example/blob/blog/deployment/webhook-create-signed-cert.sh)检查 secret 对象中是否有证书和私钥信息：

```shell
$ ./deployment/webhook-create-signed-cert.sh
creating certs in tmpdir /var/folders/x3/wjy_1z155pdf8jg_jgpmf6kc0000gn/T/tmp.IboFfX97 
Generating RSA private key, 2048 bit long modulus (2 primes)
..................+++++
........+++++
e is 65537 (0x010001)
certificatesigningrequest.certificates.k8s.io/admission-webhook-example-svc.default created
NAME                                    AGE   REQUESTOR          CONDITION
admission-webhook-example-svc.default   1s    kubernetes-admin   Pending
certificatesigningrequest.certificates.k8s.io/admission-webhook-example-svc.default approved
secret/admission-webhook-example-certs created

$ kubectl get secret admission-webhook-example-certs
NAME                              TYPE     DATA   AGE
admission-webhook-example-certs   Opaque   2      28s
```

一旦 secret 对象创建成功，我们就可以直接创建 deployment 和 service 对象。
```shell
$ kubectl create -f deployment/deployment.yaml
deployment.apps "admission-webhook-example-deployment" created

$ kubectl create -f deployment/service.yaml
service "admission-webhook-example-svc" created
```

### 配置 webhook
现在我们的 webhook 服务运行起来了，它可以接收来自 apiserver 的请求。但是我们还需要在 kubernetes 上创建一些配置资源。首先来配置 validating 这个 webhook，查看 [webhook 配置](https://github.com/cnych/admission-webhook-example/blob/blog/deployment/validatingwebhook.yaml)，我们会注意到它里面包含一个`CA_BUNDLE`的占位符：
```yaml
clientConfig:
  service:
	name: admission-webhook-example-svc
	namespace: default
	path: "/validate"
  caBundle: ${CA_BUNDLE}
```

CA 证书应提供给 admission webhook 配置，这样 apiserver 才可以信任 webhook server 提供的 TLS 证书。因为我们上面已经使用 Kubernetes API 签署了证书，所以我们可以使用我们的 kubeconfig 中的 CA 证书来简化操作。代码仓库中也提供了一个小脚本用来替换 CA_BUNDLE 这个占位符，创建 validating webhook 之前运行该命令即可：
```shell
$ cat ./deployment/validatingwebhook.yaml | ./deployment/webhook-patch-ca-bundle.sh > ./deployment/validatingwebhook-ca-bundle.yaml
```

执行完成后可以查看`validatingwebhook-ca-bundle.yaml`文件中的`CA_BUNDLE`占位符的值是否已经被替换掉了。需要注意的是 clientConfig 里面的 path 路径是`/validate`，因为我们代码在是将 validate 和 mutate 集成在一个服务中的。

然后就是需要配置一些 RBAC 规则，我们想在 deployment 或 service 创建时拦截 API 请求，所以`apiGroups`和`apiVersions`对应的值分别为`apps/v1`对应 deployment，`v1`对应 service。对于 RBAC 的配置方法可以查看我们前面的文章：[Kubernetes RBAC 详解](https://www.qikqiak.com/post/use-rbac-in-k8s)

webhook 的最后一部分是配置一个`namespaceSelector`，我们可以为 webhook 工作的命名空间定义一个 selector，这个配置不是必须的，比如我们这里添加了下面的配置：
```yaml
namespaceSelector:
  matchLabels:
	admission-webhook-example: enabled
```

则我们的 webhook 会只适用于设置了`admission-webhook-example=enabled`标签的 namespace， 您可以在Kubernetes参考文档中查看此资源配置的完整布局。

所以，首先需要在`default`这个 namespace 中添加该标签：
```shell
$ kubectl label namespace default admission-webhook-example=enabled
namespace "default" labeled

```

最后，创建这个 validating webhook 配置对象，这会动态地将 webhook 添加到 webhook 链上，所以一旦创建资源，就会拦截请求然后调用我们的 webhook 服务：
```shell
$ kubectl create -f deployment/validatingwebhook-ca-bundle.yaml
validatingwebhookconfiguration.admissionregistration.k8s.io "validation-webhook-example-cfg" created
```

### 测试
现在让我们创建一个 deployment 资源来验证下是否有效，代码仓库下有一个`sleep.yaml`的资源清单文件，直接创建即可：
```shell
$ kubectl create -f deployment/sleep.yaml
Error from server (required labels are not set): error when creating "deployment/sleep.yaml": admission webhook "required-labels.qikqiak.com" denied the request: required labels are not set
```

正常情况下创建的时候会出现上面的错误信息，然后部署另外一个`sleep-with-labels.yaml`的资源清单：
```shell
$ kubectl create -f deployment/sleep-with-labels.yaml
deployment.apps "sleep" created
```

可以看到可以正常部署，先我们将上面的 deployment 删除，然后部署另外一个`sleep-no-validation.yaml`资源清单，该清单中不存在所需的标签，但是配置了`admission-webhook-example.qikqiak.com/validate=false`这样的 annotation，正常也是可以正常创建的：
```shell
$ kubectl delete deployment sleep
$ kubectl create -f deployment/sleep-no-validation.yaml
deployment.apps "sleep" created
```

### 部署 mutating webhook
首先，我们将上面的 validating webhook 删除，防止对 mutating 产生干扰，然后部署新的配置。 mutating webhook 与 validating webhook 配置基本相同，但是 webook server 的路径是`/mutate`，同样的我们也需要先填充上`CA_BUNDLE`这个占位符。
```shell
$ kubectl delete validatingwebhookconfiguration validation-webhook-example-cfg
validatingwebhookconfiguration.admissionregistration.k8s.io "validation-webhook-example-cfg" deleted

$ cat ./deployment/mutatingwebhook.yaml | ./deployment/webhook-patch-ca-bundle.sh > ./deployment/mutatingwebhook-ca-bundle.yaml

$ kubectl create -f deployment/mutatingwebhook-ca-bundle.yaml
mutatingwebhookconfiguration.admissionregistration.k8s.io "mutating-webhook-example-cfg" created
```

现在我们可以再次部署上面的`sleep`应用程序，然后查看是否正确添加 label 标签：

```shell
$ kubectl create -f deployment/sleep.yaml
deployment.apps "sleep" created

$ kubectl get  deploy sleep -o yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  annotations:
    admission-webhook-example.qikqiak.com/status: mutated
    deployment.kubernetes.io/revision: "1"
  creationTimestamp: 2018-09-24T11:35:50Z
  generation: 1
  labels:
    app.kubernetes.io/component: not_available
    app.kubernetes.io/instance: not_available
    app.kubernetes.io/managed-by: not_available
    app.kubernetes.io/name: not_available
    app.kubernetes.io/part-of: not_available
    app.kubernetes.io/version: not_available
...
```

最后，我们重新创建 validating webhook，来一起测试。现在，尝试再次创建 sleep 应用。正常是可以创建成功的，我们可以查看下[admission-controllers 的文档](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#what-are-they)

> 准入控制分两个阶段进行，第一阶段，运行 mutating admission 控制器，第二阶段运行 validating admission 控制器。

所以 mutating webhook 在第一阶段添加上缺失的 labels 标签，然后 validating webhook 在第二阶段就不会拒绝这个 deployment 了，因为标签已经存在了，用`not_available`设置他们的值。

```shell
$ kubectl create -f deployment/validatingwebhook-ca-bundle.yaml
validatingwebhookconfiguration.admissionregistration.k8s.io "validation-webhook-example-cfg" created

$ kubectl create -f deployment/sleep.yaml
deployment.apps "sleep" created
```


## 参考文档
* [In-depth introduction to Kubernetes admission webhooks](https://banzaicloud.com/blog/k8s-admission-webhooks/)
* [admission-controllers](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/#what-are-they)

<!--adsense-self-->
