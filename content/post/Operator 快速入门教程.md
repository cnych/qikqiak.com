---
title: Kubernetes Operator 快速入门教程
subtitle: Kubernetes Operator 101
date: 2019-05-29
tags: ["kubernetes", "operator", "101"]
slug: k8s-operator-101
keywords: ["kubernetes", "operator", "101", "教程"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1559160581-44bd4222d397.jpeg", desc: "https://unsplash.com/photos/S2Q5mdOrrVc"}]
category: "kubernetes"
---

在 Kubernetes 的监控方案中我们经常会使用到一个[Promethues Operator](https://devops.college/prometheus-operator-how-to-monitor-an-external-service-3cb6ac8d5acb)的项目，该项目可以让我们更加方便的去使用 Prometheus，而不需要直接去使用最原始的一些资源对象，比如 Pod、Deployment，随着 Prometheus Operator 项目的成功，CoreOS 公司开源了一个比较厉害的工具：[Operator Framework](https://github.com/operator-framework)，该工具可以让开发人员更加容易的开发 Operator 应用。

在本篇文章中我们会为大家介绍一个简单示例来演示如何使用 Operator Framework 框架来开发一个 Operator 应用。

<!--more-->

## Kubernetes Operator
Operator 是由 CoreOS 开发的，用来扩展 Kubernetes API，特定的应用程序控制器，它用来创建、配置和管理复杂的有状态应用，如数据库、缓存和监控系统。Operator 基于 Kubernetes 的资源和控制器概念之上构建，但同时又包含了应用程序特定的领域知识。创建Operator 的关键是CRD（自定义资源）的设计。

Kubernetes 1.7 版本以来就引入了[自定义控制器](https://kubernetes.io/docs/concepts/api-extension/custom-resources/)的概念，该功能可以让开发人员扩展添加新功能，更新现有的功能，并且可以自动执行一些管理任务，这些自定义的控制器就像 Kubernetes 原生的组件一样，Operator 直接使用 Kubernetes API进行开发，也就是说他们可以根据这些控制器内部编写的自定义规则来监控集群、更改 Pods/Services、对正在运行的应用进行扩缩容。


## Operator Framework
Operator Framework 同样也是 CoreOS 开源的一个用于快速开发 Operator 的工具包，该框架包含两个主要的部分：

* Operator SDK: 无需了解复杂的 Kubernetes API 特性，即可让你根据你自己的专业知识构建一个 Operator 应用。
* Operator Lifecycle Manager OLM: 帮助你安装、更新和管理跨集群的运行中的所有 Operator（以及他们的相关服务）

![operator sdk](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/operator-sdk-lifecycle.png)

### Workflow
Operator SDK 提供以下工作流来开发一个新的 Operator：

* 1. 使用 SDK 创建一个新的 Operator 项目
* 2. 通过添加自定义资源（CRD）定义新的资源 API
* 3. 指定使用 SDK API 来 watch 的资源
* 4. 定义 Operator 的协调（reconcile）逻辑
* 5. 使用 Operator SDK 构建并生成 Operator 部署清单文件

## Demo
我们平时在部署一个简单的 Webserver 到 Kubernetes 集群中的时候，都需要先编写一个 Deployment 的控制器，然后创建一个 Service 对象，通过 Pod 的 label 标签进行关联，最后通过 Ingress 或者 type=NodePort 类型的 Service 来暴露服务，每次都需要这样操作，是不是略显麻烦，我们就可以创建一个自定义的资源对象，通过我们的 CRD 来描述我们要部署的应用信息，比如镜像、服务端口、环境变量等等，然后创建我们的自定义类型的资源对象的时候，通过控制器去创建对应的 Deployment 和 Service，是不是就方便很多了，相当于我们用一个资源清单去描述了 Deployment 和 Service 要做的两件事情。

这里我们将创建一个名为 AppService 的 CRD 资源对象，然后定义如下的资源清单进行应用部署：
```yaml
apiVersion: app.example.com/v1
kind: AppService
metadata:
  name: nginx-app
spec:
  size: 2
  image: nginx:1.7.9
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30002
```

通过这里的自定义的 AppService 资源对象去创建副本数为2的 Pod，然后通过 nodePort=30002 的端口去暴露服务，接下来我们就来一步一步的实现我们这里的这个简单的 Operator 应用。

### 开发环境

#### 环境需求
要开发 Operator 自然 Kubernetes 集群是少不了的，还需要 Golang 的环境，这里的安装就不多说了，然后还需要一个 Go 语言的依赖管理工具包：[dep](https://github.com/golang/dep)，由于 Operator SDK 是使用的 dep 该工具包，所以需要我们提前安装好，可以查看资料：https://github.com/golang/dep，另外一个需要说明的是，由于 dep 去安装的时候需要去谷歌的网站拉取很多代码，所以正常情况下的话是会失败的，需要做什么工作大家应该清楚吧？要科学。

#### 安装 operator-sdk
operator sdk 安装方法非常多，我们可以直接在 github 上面下载需要使用的版本，然后放置到 PATH 环境下面即可，当然也可以将源码 clone 到本地手动编译安装即可，如果你是 Mac，当然还可以使用常用的 brew 工具进行安装：
```shell
$ brew install operator-sdk
......
$ operator-sdk version
operator-sdk version: v0.7.0
$ go version
go version go1.11.4 darwin/amd64
```

我们这里使用的 sdk 版本是`v0.7.0`，其他安装方法可以参考文档：https://github.com/operator-framework/operator-sdk/blob/master/doc/user/install-operator-sdk.md


### 演示
#### 创建新项目
环境准备好了，接下来就可以使用 operator-sdk 直接创建一个新的项目了，命令格式为：
**operator-sdk new <project-name>**

按照上面我们预先定义的 CRD 资源清单，我们这里可以这样创建：
```shell
# 创建项目目录
$ mkdir -p operator-learning  
# 设置项目目录为 GOPATH 路径
$ cd operator-learning && export GOPATH=$PWD  
$ mkdir -p $GOPATH/src/github.com/cnych 
$ cd $GOPATH/src/github.com/cnych
# 使用 sdk 创建一个名为 opdemo 的 operator 项目
$ operator-sdk new opdemo
......
# 该过程需要科学上网，需要花费很长时间，请耐心等待
......
$ cd opdemo && tree -L 2
.
├── Gopkg.lock
├── Gopkg.toml
├── build
│   ├── Dockerfile
│   ├── _output
│   └── bin
├── cmd
│   └── manager
├── deploy
│   ├── crds
│   ├── operator.yaml
│   ├── role.yaml
│   ├── role_binding.yaml
│   └── service_account.yaml
├── pkg
│   ├── apis
│   └── controller
├── vendor
│   ├── cloud.google.com
│   ├── contrib.go.opencensus.io
│   ├── github.com
│   ├── go.opencensus.io
│   ├── go.uber.org
│   ├── golang.org
│   ├── google.golang.org
│   ├── gopkg.in
│   ├── k8s.io
│   └── sigs.k8s.io
└── version
    └── version.go

23 directories, 8 files
```

到这里一个全新的 Operator 项目就新建完成了。

#### 项目结构
使用`operator-sdk new`命令创建新的 Operator 项目后，项目目录就包含了很多生成的文件夹和文件。

* **Gopkg.toml Gopkg.lock** — Go Dep 清单，用来描述当前 Operator 的依赖包。
* **cmd** - 包含 main.go 文件，使用 operator-sdk API 初始化和启动当前 Operator 的入口。
* **deploy** - 包含一组用于在 Kubernetes 集群上进行部署的通用的 Kubernetes 资源清单文件。
* **pkg/apis** - 包含定义的 API 和自定义资源（CRD）的目录树，这些文件允许 sdk 为 CRD 生成代码并注册对应的类型，以便正确解码自定义资源对象。
* **pkg/controller** - 用于编写所有的操作业务逻辑的地方
* **vendor** - golang vendor 文件夹，其中包含满足当前项目的所有外部依赖包，通过 go dep 管理该目录。

我们主要需要编写的是**pkg**目录下面的 api 定义以及对应的 controller 实现。

#### 添加 API
接下来为我们的自定义资源添加一个新的 API，按照上面我们预定义的资源清单文件，在 Operator 相关根目录下面执行如下命令：
```shell
$ operator-sdk add api --api-version=app.example.com/v1 --kind=AppService
```

添加完成后，我们可以看到类似于下面的这样项目结构：
![operator project layout](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/operator-project-layout.png)


#### 添加控制器
上面我们添加自定义的 API，接下来可以添加对应的自定义 API 的具体实现 Controller，同样在项目根目录下面执行如下命令：
```shell
$ operator-sdk add controller --api-version=app.example.com/v1 --kind=AppService
```

这样整个 Operator 项目的脚手架就已经搭建完成了，接下来就是具体的实现了。


#### 自定义 API
打开源文件`pkg/apis/app/v1/appservice_types.go`，需要我们根据我们的需求去自定义结构体 AppServiceSpec，我们最上面预定义的资源清单中就有 size、image、ports 这些属性，所有我们需要用到的属性都需要在这个结构体中进行定义：
```golang
type AppServiceSpec struct {
	// INSERT ADDITIONAL SPEC FIELDS - desired state of cluster
	// Important: Run "operator-sdk generate k8s" to regenerate code after modifying this file
	// Add custom validation using kubebuilder tags: https://book.kubebuilder.io/beyond_basics/generating_crd.html
	Size  	  *int32                      `json:"size"`
	Image     string                      `json:"image"`
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	Envs      []corev1.EnvVar             `json:"envs,omitempty"`
	Ports     []corev1.ServicePort        `json:"ports,omitempty"`
}
```

代码中会涉及到一些包名的导入，由于包名较多，所以我们会使用一些别名进行区分，主要的包含下面几个：
```golang
import (
    appsv1 "k8s.io/api/apps/v1"
    corev1 "k8s.io/api/core/v1"
    appv1 "github.com/cnych/opdemo/pkg/apis/app/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)
```

这里的 resources、envs、ports 的定义都是直接引用的`"k8s.io/api/core/v1"`中定义的结构体，而且需要注意的是我们这里使用的是`ServicePort`，而不是像传统的 Pod 中定义的 ContanerPort，这是因为我们的资源清单中不仅要描述容器的 Port，还要描述 Service 的 Port。

然后一个比较重要的结构体`AppServiceStatus`用来描述资源的状态，当然我们可以根据需要去自定义状态的描述，我这里就偷懒直接使用 Deployment 的状态了：
```shell
type AppServiceStatus struct {
	// INSERT ADDITIONAL STATUS FIELD - define observed state of cluster
	// Important: Run "operator-sdk generate k8s" to regenerate code after modifying this file
	// Add custom validation using kubebuilder tags: https://book.kubebuilder.io/beyond_basics/generating_crd.html
	appsv1.DeploymentStatus `json:",inline"`
}
```

定义完成后，在项目根目录下面执行如下命令：
```shell
$ operator-sdk generate k8s
```

改命令是用来根据我们自定义的 API 描述来自动生成一些代码，目录`pkg/apis/app/v1/`下面以`zz_generated`开头的文件就是自动生成的代码，里面的内容并不需要我们去手动编写。

这样我们就算完成了对自定义资源对象的 API 的声明。

#### 实现业务逻辑
上面 API 描述声明完成了，接下来就需要我们来进行具体的业务逻辑实现了，编写具体的 controller 实现，打开源文件`pkg/controller/appservice/appservice_controller.go`，需要我们去更改的地方也不是很多，核心的就是`Reconcile`方法，该方法就是去不断的 watch 资源的状态，然后根据状态的不同去实现各种操作逻辑，核心代码如下：
```golang
func (r *ReconcileAppService) Reconcile(request reconcile.Request) (reconcile.Result, error) {
	reqLogger := log.WithValues("Request.Namespace", request.Namespace, "Request.Name", request.Name)
	reqLogger.Info("Reconciling AppService")

	// Fetch the AppService instance
	instance := &appv1.AppService{}
	err := r.client.Get(context.TODO(), request.NamespacedName, instance)
	if err != nil {
		if errors.IsNotFound(err) {
			// Request object not found, could have been deleted after reconcile request.
			// Owned objects are automatically garbage collected. For additional cleanup logic use finalizers.
			// Return and don't requeue
			return reconcile.Result{}, nil
		}
		// Error reading the object - requeue the request.
		return reconcile.Result{}, err
	}

	if instance.DeletionTimestamp != nil {
		return reconcile.Result{}, err
	}

	// 如果不存在，则创建关联资源
	// 如果存在，判断是否需要更新
	//   如果需要更新，则直接更新
	//   如果不需要更新，则正常返回

	deploy := &appsv1.Deployment{}
	if err := r.client.Get(context.TODO(), request.NamespacedName, deploy); err != nil && errors.IsNotFound(err) {
		// 创建关联资源
		// 1. 创建 Deploy
		deploy := resources.NewDeploy(instance)
		if err := r.client.Create(context.TODO(), deploy); err != nil {
			return reconcile.Result{}, err
		}
		// 2. 创建 Service
		service := resources.NewService(instance)
		if err := r.client.Create(context.TODO(), service); err != nil {
			return reconcile.Result{}, err
		}
		// 3. 关联 Annotations
		data, _ := json.Marshal(instance.Spec)
		if instance.Annotations != nil {
			instance.Annotations["spec"] = string(data)
		} else {
			instance.Annotations = map[string]string{"spec": string(data)}
		}

		if err := r.client.Update(context.TODO(), instance); err != nil {
			return reconcile.Result{}, nil
		}
		return reconcile.Result{}, nil
	}

	oldspec := appv1.AppServiceSpec{}
	if err := json.Unmarshal([]byte(instance.Annotations["spec"]), oldspec); err != nil {
		return reconcile.Result{}, err
	}

	if !reflect.DeepEqual(instance.Spec, oldspec) {
		// 更新关联资源
		newDeploy := resources.NewDeploy(instance)
		oldDeploy := &appsv1.Deployment{}
		if err := r.client.Get(context.TODO(), request.NamespacedName, oldDeploy); err != nil {
			return reconcile.Result{}, err
		}
		oldDeploy.Spec = newDeploy.Spec
		if err := r.client.Update(context.TODO(), oldDeploy); err != nil {
			return reconcile.Result{}, err
		}

		newService := resources.NewService(instance)
		oldService := &corev1.Service{}
		if err := r.client.Get(context.TODO(), request.NamespacedName, oldService); err != nil {
			return reconcile.Result{}, err
		}
		oldService.Spec = newService.Spec
		if err := r.client.Update(context.TODO(), oldService); err != nil {
			return reconcile.Result{}, err
		}

		return reconcile.Result{}, nil
	}

	return reconcile.Result{}, nil

}
```

上面就是业务逻辑实现的核心代码，逻辑很简单，就是去判断资源是否存在，不存在，则直接创建新的资源，创建新的资源除了需要创建 Deployment 资源外，还需要创建 Service 资源对象，因为这就是我们的需求，当然你还可以自己去扩展，比如在创建一个 Ingress 对象。更新也是一样的，去对比新旧对象的声明是否一致，不一致则需要更新，同样的，两种资源都需要更新的。

另外两个核心的方法就是上面的`resources.NewDeploy(instance)`和`resources.NewService(instance)`方法，这两个方法实现逻辑也很简单，就是根据 CRD 中的声明去填充 Deployment 和 Service 资源对象的 Spec 对象即可。

NewDeploy 方法实现如下：
```golang
func NewDeploy(app *appv1.AppService) *appsv1.Deployment {
	labels := map[string]string{"app": app.Name}
	selector := &metav1.LabelSelector{MatchLabels: labels}
	return &appsv1.Deployment{
		TypeMeta: metav1.TypeMeta{
			APIVersion: "apps/v1",
			Kind:       "Deployment",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name:      app.Name,
			Namespace: app.Namespace,

			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(app, schema.GroupVersionKind{
					Group: v1.SchemeGroupVersion.Group,
					Version: v1.SchemeGroupVersion.Version,
					Kind: "AppService",
				}),
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: app.Spec.Size,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					Containers: newContainers(app),
				},
			},
			Selector: selector,
		},
	}
}

func newContainers(app *v1.AppService) []corev1.Container {
	containerPorts := []corev1.ContainerPort{}
	for _, svcPort := range app.Spec.Ports {
		cport := corev1.ContainerPort{}
		cport.ContainerPort = svcPort.TargetPort.IntVal
		containerPorts = append(containerPorts, cport)
	}
	return []corev1.Container{
		{
			Name: app.Name,
			Image: app.Spec.Image,
			Resources: app.Spec.Resources,
			Ports: containerPorts,
			ImagePullPolicy: corev1.PullIfNotPresent,
			Env: app.Spec.Envs,
		},
	}
}
```

newService 对应的方法实现如下：
```golang
func NewService(app *v1.AppService) *corev1.Service {
	return &corev1.Service {
		TypeMeta: metav1.TypeMeta {
			Kind: "Service",
			APIVersion: "v1",
		},
		ObjectMeta: metav1.ObjectMeta{
			Name: app.Name,
			Namespace: app.Namespace,
			OwnerReferences: []metav1.OwnerReference{
				*metav1.NewControllerRef(app, schema.GroupVersionKind{
					Group: v1.SchemeGroupVersion.Group,
					Version: v1.SchemeGroupVersion.Version,
					Kind: "AppService",
				}),
			},
		},
		Spec: corev1.ServiceSpec{
			Type: corev1.ServiceTypeNodePort,
			Ports: app.Spec.Ports,
			Selector: map[string]string{
				"app": app.Name,
			},
		},
	}
}
```

这样我们就实现了 AppService 这种资源对象的业务逻辑。


#### 调试
如果我们本地有一个可以访问的 Kubernetes 集群，我们也可以直接进行调试，在本地用户`~/.kube/config`文件中配置集群访问信息，下面的信息表明可以访问 Kubernetes 集群：
```shell
$ kubectl cluster-info
Kubernetes master is running at https://ydzs-master:6443
KubeDNS is running at https://ydzs-master:6443/api/v1/namespaces/kube-system/services/kube-dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

首先，在集群中安装 CRD 对象：
```shell
$ kubectl create -f deploy/crds/app_v1_appservice_crd.yaml
customresourcedefinition "appservices.app.example.com" created
$ kubectl get crd
NAME                                   AGE
appservices.app.example.com            <invalid>
......
```

当我们通过`kubectl get crd`命令获取到我们定义的 CRD 资源对象，就证明我们定义的 CRD 安装成功了。其实现在只是 CRD 的这个声明安装成功了，但是我们这个 CRD 的具体业务逻辑实现方式还在我们本地，并没有部署到集群之中，我们可以通过下面的命令来在本地项目中启动 Operator 的调试：
```shell
$ operator-sdk up local                                                     
INFO[0000] Running the operator locally.                
INFO[0000] Using namespace default.                     
{"level":"info","ts":1559207203.964137,"logger":"cmd","msg":"Go Version: go1.11.4"}
{"level":"info","ts":1559207203.964192,"logger":"cmd","msg":"Go OS/Arch: darwin/amd64"}
{"level":"info","ts":1559207203.9641972,"logger":"cmd","msg":"Version of operator-sdk: v0.7.0"}
{"level":"info","ts":1559207203.965905,"logger":"leader","msg":"Trying to become the leader."}
{"level":"info","ts":1559207203.965945,"logger":"leader","msg":"Skipping leader election; not running in a cluster."}
{"level":"info","ts":1559207206.928867,"logger":"cmd","msg":"Registering Components."}
{"level":"info","ts":1559207206.929077,"logger":"kubebuilder.controller","msg":"Starting EventSource","controller":"appservice-controller","source":"kind source: /, Kind="}
{"level":"info","ts":1559207206.9292521,"logger":"kubebuilder.controller","msg":"Starting EventSource","controller":"appservice-controller","source":"kind source: /, Kind="}
{"level":"info","ts":1559207209.622659,"logger":"cmd","msg":"failed to initialize service object for metrics: OPERATOR_NAME must be set"}
{"level":"info","ts":1559207209.622693,"logger":"cmd","msg":"Starting the Cmd."}
{"level":"info","ts":1559207209.7236018,"logger":"kubebuilder.controller","msg":"Starting Controller","controller":"appservice-controller"}
{"level":"info","ts":1559207209.8284118,"logger":"kubebuilder.controller","msg":"Starting workers","controller":"appservice-controller","worker count":1}
```

上面的命令会在本地运行 Operator 应用，通过`~/.kube/config`去关联集群信息，现在我们去添加一个 AppService 类型的资源然后观察本地 Operator 的变化情况，资源清单文件就是我们上面预定义的（deploy/crds/app_v1_appservice_cr.yaml）
```yaml
apiVersion: app.example.com/v1
kind: AppService
metadata:
  name: nginx-app
spec:
  size: 2
  image: nginx:1.7.9
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30002
```

直接创建这个资源对象：
```shell
$ kubectl create -f deploy/crds/app_v1_appservice_cr.yaml
appservice "nginx-app" created
```

我们可以看到我们的应用创建成功了，这个时候查看 Operator 的调试窗口会有如下的信息出现：
```shell
......
{"level":"info","ts":1559207416.670523,"logger":"controller_appservice","msg":"Reconciling AppService","Request.Namespace":"default","Request.Name":"nginx-app"}
{"level":"info","ts":1559207417.004226,"logger":"controller_appservice","msg":"Reconciling AppService","Request.Namespace":"default","Request.Name":"nginx-app"}
{"level":"info","ts":1559207417.004331,"logger":"controller_appservice","msg":"Reconciling AppService","Request.Namespace":"default","Request.Name":"nginx-app"}
{"level":"info","ts":1559207418.33779,"logger":"controller_appservice","msg":"Reconciling AppService","Request.Namespace":"default","Request.Name":"nginx-app"}
{"level":"info","ts":1559207418.951193,"logger":"controller_appservice","msg":"Reconciling AppService","Request.Namespace":"default","Request.Name":"nginx-app"}
......
```

然后我们可以去查看集群中是否有符合我们预期的资源出现：
```shell
$ kubectl get AppService
NAME        AGE
nginx-app   <invalid>
$ kubectl get deploy
NAME                     DESIRED   CURRENT   UP-TO-DATE   AVAILABLE   AGE
nginx-app                2         2         2            2           <invalid>
$ kubectl get svc
NAME         TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)        AGE
kubernetes   ClusterIP   10.96.0.1      <none>        443/TCP        76d
nginx-app    NodePort    10.108.227.5   <none>        80:30002/TCP   <invalid>
$ kubectl get pods
NAME                                      READY     STATUS    RESTARTS   AGE
nginx-app-76b6449498-2j82j                1/1       Running   0          <invalid>
nginx-app-76b6449498-m4h58                1/1       Running   0          <invalid>
```

看到了吧，我们定义了两个副本（size=2），这里就出现了两个 Pod，还有一个 NodePort=30002 的 Service 对象，我们可以通过该端口去访问下应用：
![crd nginx app demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/crd-nginx-app-demo.png)

如果应用在安装过程中出现了任何问题，我们都可以通过本地的 Operator 调试窗口找到有用的信息，然后调试修改即可。

清理：
```shell
$ kubectl delete -f deploy/crds/app_v1_appservice_crd.yaml
$ kubectl delete -f deploy/crds/app_v1_appservice_cr.yaml
```

#### 部署
自定义的资源对象现在测试通过了，但是如果我们将本地的`operator-sdk up local`命令终止掉，我们可以猜想到就没办法处理 AppService 资源对象的一些操作了，所以我们需要将我们的业务逻辑实现部署到集群中去。

执行下面的命令构建 Operator 应用打包成 Docker 镜像：
```shell
$ operator-sdk build cnych/opdemo                         
INFO[0002] Building Docker image cnych/opdemo           
Sending build context to Docker daemon  400.7MB
Step 1/7 : FROM registry.access.redhat.com/ubi7-dev-preview/ubi-minimal:7.6
......
Successfully built a8cde91be6ab
Successfully tagged cnych/opdemo:latest
INFO[0053] Operator build complete.              
```

镜像构建成功后，推送到 docker hub：
```shell
$ docker push cnych/opdemo
```

镜像推送成功后，使用上面的镜像地址更新 Operator 的资源清单：
```shell
$ sed -i 's|REPLACE_IMAGE|cnych/opdemo|g' deploy/operator.yaml
# 如果你使用的是 Mac 系统，使用下面的命令
$ sed -i "" 's|REPLACE_IMAGE|cnych/opdemo|g' deploy/operator.yaml
```

现在 Operator 的资源清单文件准备好了，然后创建对应的 RBAC 的对象：
```shell
# Setup Service Account
$ kubectl create -f deploy/service_account.yaml
# Setup RBAC
$ kubectl create -f deploy/role.yaml
$ kubectl create -f deploy/role_binding.yaml
```

权限相关声明已经玩CN，接下来安装 CRD 和 Operator：
```shell
# Setup the CRD
$ kubectl apply -f deploy/crds/app_v1_appservice_crd.yaml
$ kubectl get crd
NAME                                   CREATED AT
appservices.app.example.com            2019-05-30T17:03:32Z
......
# Deploy the Operator
$ kubectl create -f deploy/operator.yaml
deployment.apps/opdemo created
$ kubectl get pods
NAME                                      READY   STATUS    RESTARTS   AGE
opdemo-64db96d575-9vtq6                   1/1     Running   0          2m2s
```

到这里我们的 CRD 和 Operator 实现都已经安装成功了。

现在我们再来部署我们的 AppService 资源清单文件，现在的业务逻辑就会在上面的`opdemo-64db96d575-9vtq6`的 Pod 中去处理了。
```shell
$ kubectl create -f deploy/crds/app_v1_appservice_cr.yaml
appservice.app.example.com/nginx-app created
$ kubectl get appservice
NAME        AGE
nginx-app   18s
$  kubectl get deploy
NAME                     READY   UP-TO-DATE   AVAILABLE   AGE
nginx-app                2/2     2            2           24s
opdemo                   1/1     1            1           5m51s
$  kubectl get svc
NAME         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
kubernetes   ClusterIP   10.96.0.1       <none>        443/TCP        76d
nginx-app    NodePort    10.106.129.82   <none>        80:30002/TCP   29s
opdemo       ClusterIP   10.100.233.51   <none>        8383/TCP       4m25s
$  kubectl get pods
NAME                                      READY   STATUS    RESTARTS   AGE
nginx-app-76b6449498-ffhgx                1/1     Running   0          32s
nginx-app-76b6449498-wzjq2                1/1     Running   0          32s
opdemo-64db96d575-9vtq6                   1/1     Running   0          5m59s
$ kubectl describe appservice nginx-app
Name:         nginx-app
Namespace:    default
Labels:       <none>
Annotations:  spec: {"size":2,"image":"nginx:1.7.9","resources":{},"ports":[{"protocol":"TCP","port":80,"targetPort":80,"nodePort":30002}]}
API Version:  app.example.com/v1
Kind:         AppService
Metadata:
  Creation Timestamp:  2019-05-30T17:41:28Z
  Generation:          2
  Resource Version:    19666617
  Self Link:           /apis/app.example.com/v1/namespaces/default/appservices/nginx-app
  UID:                 2756f232-8302-11e9-80ca-525400cc3c00
Spec:
  Image:  nginx:1.7.9
  Ports:
    Node Port:    30002
    Port:         80
    Protocol:     TCP
    Target Port:  80
  Resources:
  Size:  2
Events:  <none>
```

然后同样的可以通过 30002 这个 NodePort 端口去访问应用，到这里应用就部署成功了。


#### 清理
有资源清单文件，直接删除即可：
```shell
$ kubectl delete -f deploy/crds/app_v1_appservice_cr.yaml
$ kubectl delete -f deploy/operator.yaml
$ kubectl delete -f deploy/role.yaml
$ kubectl delete -f deploy/role_binding.yaml
$ kubectl delete -f deploy/service_account.yaml
$ kubectl delete -f deploy/crds/app_v1_appservice_crd.yaml
```

#### 开发
Operator SDK 为我们创建了一个快速启动的代码和相关配置，如果我们要开始处理相关的逻辑，我们可以在项目中搜索`TODO(user)`这个注释来实现我们自己的逻辑，比如在我的 VSCode 环境中，看上去是这样的：
![operator code todo demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/operator-code-todo-demo.png)

本篇文章示例代码地址：[https://github.com/cnych/opdemo](https://github.com/cnych/opdemo)

## 参考资料
* [CLI reference](https://github.com/operator-framework/operator-sdk/blob/master/doc/sdk-cli-reference.md)
* [User Guide](https://github.com/operator-framework/operator-sdk/blob/master/doc/user-guide.md)
* [Developing Kubernetes Operator is now easy with Operator Framework](https://devops.college/developing-kubernetes-operator-is-now-easy-with-operator-framework-d3194a7428ff)
