---
title: 使用 Golang 自定义 Kubernetes Ingress Controller
date: 2019-10-31
tags: ["kubernetes", "ingress", "golang"]
keywords: ["kubernetes", "ingress", "golang", "ingress controller", "traefik", "nginx"]
slug: custom-k8s-ingress-controller-with-go
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1572444768149-925f4150c0b2.jpeg", desc: "https://unsplash.com/photos/eIiHJH4wfq0"}]
category: "kubernetes"
---

在 Kubernetes 中通过 Ingress 来暴露服务到集群外部，这个已经是一个很普遍的方式了，而真正扮演请求转发的角色是背后的 Ingress Controller，比如我们经常使用的 traefik、ingress-nginx 等就是一个 Ingress Controller。本文我们将通过 golang 来实现一个简单的自定义的 Ingress Controller，可以加深我们对 Ingress 的理解。

<!--more-->

## 概述
我们在 Kubernetes 集群上往往会运行很多无状态的 Web 应用，一般来说这些应用是通过一个 Deployment 和一个对应的 Service 组成，比如我们在集群上运行一个 whoami 的应用，对应的资源清单如下所示：(whoami.yaml)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
  labels:
    app: whoami
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
        - name: whoami
          image: cnych/whoami
          ports:
            - containerPort: 80

---
kind: Service
apiVersion: v1
metadata:
  name: whoami
spec:
  selector:
    app: whoami
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```

可以直接使用上面的资源清单部署该应用：

```shell
$ kubectl apply -f whoami.yaml
```

通过部署该应用，在 Kubernetes 集群内部我们可以通过地址 `whoami.default.svc.cluster.local` 来访问该 Web 应用，但是在集群外部的用户应该如何来访问呢？当然我们可以使用 NodePort 类型的 Service 来进行访问，但是当我们应用越来越多的时候端口的管理也是一个很大的问题，所以一般情况下不采用该方式，之前我们的方法是用 DaemonSet 在每个边缘节点上运行一个 Nginx 应用：

```yaml
spec:
  hostNetwork: true
  containers:
    - image: nginx:1.15.3-alpine
      name: nginx
      ports:
        - name: http
          containerPort: 80
          hostPort: 80
```

通过设置 `hostNetwork:true`，容器将绑定节点的80端口，而不仅仅是容器，这样我们就可以通过节点的公共 IP 地址的 80 端口访问到 Nginx 应用了。这种方法理论上肯定是有效的，但是有一个最大的问题就是需要创建一个 Nginx 配置文件，如果应用有变更，还需要手动修改配置，不能自动发现和热更新，这对于大量的应用维护的成本显然太大。这个时候我们就可以用另外一个 Kubernetes 提供的方案了：`Ingress`。

## Ingress 对象
Kubernetes 内置就支持通过 Ingress 对象将外部的域名映射到集群内部服务，我们可以通过如下的 Ingress 对象来对外暴露服务：

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: whoami
spec:
  tls:
    - hosts:
        - "*.qikqiak.com"
      secretName: qikqiak-tls
  rules:
    - host: who.qikqiak.com
      http:
        paths:
          - path: /
            backend:
              serviceName: whoami
              servicePort: 80
```

该资源清单声明了如何将 HTTP 请求路由到后端服务：

* 任何到域名 `who.qikqiak.com` 的请求都将被路由到 `whoami` 服务后面的 Pod 列表中去。
* 如果是 HTTPS 请求，并且域名匹配 `*.qikqiak.com`，则对请求使用 `qikqiak-tls` 这个证书。

这个配置显然比我们取手动维护 Nginx 的配置要方便太多了，完全就是自动化的。
<!--adsense-text-->
## Ingress Controllers
上面我们声明的 Ingress 对象，只是一个集群的资源对象而已，并不会去真正处理我们的请求，这个时候我们还必须安装一个 Ingress Controller，该控制器负责读取 Ingress 对象的规则并进行真正的请求处理，简单来说就是 Ingress 对象只是一个声明，Ingress Controllers 就是真正的实现。

对于 Ingress Controller 有很多种选择，比如我们前面文章大量提到的 [traefik](/tags/traefik/)、或者 [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) 等等，我们可以根据自己的需求选择合适的 Ingress Controller 安装即可。

但是实际上，自定义一个 Ingress Controller 也是非常简单的（当然要支持各种请求特性就需要大量的工作了）。

## 自定义 Ingress Controller
这里我们将用 Golang 来自定义一个简单的 Ingress Controller，自定义的控制器主要需要实现以下几个功能：

* 通过 Kubernetes API 查询和监听 Service、Ingress 以及 Secret 这些对象
* 加载 TLS 证书用于 HTTPS 请求
* 根据加载的 Kubernetes 数据构造一个用于 HTTP 服务的路由，当然该路由需要非常高效，因为所有传入的流量都将通过该路由
* 在 80 和 443 端口上监听传入的 HTTP 请求，然后根据路由查找对应的后端服务，然后代理请求和响应。443 端口将使用 TLS 证书进行安全连接。

下面我们将来依次介绍上面的实现。

### Kubernetes 对象查询
我们可以通过一个 rest 配置然后调用 `NewForConfig` 来创建一个 Kubernetes 客户端，由于我们要通过集群内部的 Service 进行服务的访问，所以不能在集群外部使用，所以不能使用 kubeconfig 的方式来获取 Config：

```go
config, err := rest.InClusterConfig()
if err != nil {
    log.Fatal().Err(err).Msg("get kubernetes configuration failed")
}
client, err := kubernetes.NewForConfig(config)
if err != nil {
    log.Fatal().Err(er).Msg("create kubernetes client failed")
}
```

然后我们创建一个 `Watcher` 和 `Payload`，`Watcher` 是来负责查询 Kubernetes 和创建 Payloads 的，Payloads 包含了满足 HTTP 请求所需要的所有的 Kubernetes 数据：

```go
// 通过 Watcher 加载的 Kubernetes 的数据集合。
type Payload struct {
    Ingresses       []IngressPayload
    TLSCertificates map[string]*tls.Certificate
}

// 一个 IngressPayload 是一个 Ingress 加上他的服务端口。
type IngressPayload struct {
    Ingress      *extensionsv1beta1.Ingress
    ServicePorts map[string]map[string]int
}
```

另外需要注意除了端口外，Ingress 还可以通过端口名称来引用后端服务的端口，所以我们可以通过查询相应的 Service 来填充该数据。


Watcher 主要用来监听 Ingress、Service、Secret 的变化：

```go
// 在 Kubernetes 集群中监听 Ingress 对象的 Watcher
type Watcher struct {
    client   kubernetes.Interface
    onChange func(*Payload)
}
```

只要我们检测到某些变化，就会调用 `onChange` 函数。为了实现上面的监听功能，我们需要使用 `k8s.io/client-go/informers` 这个包，该包提供了一种类型安全、高效的机制来查询、list 和 watch Kubernetes 对象，我们只需要为需要的每个对象创建一个 `SharedInformerFactory` 以及 `Listers` 即可：

```go
func (w *Watcher) Run(ctx context.Context) error {
    factory := informers.NewSharedInformerFactory(w.client, time.Minute)
    secretLister := factory.Core().V1().Secrets().Lister()
    serviceLister := factory.Core().V1().Services().Lister()
    ingressLister := factory.Extensions().V1beta1().Ingresses().Lister()
    ...
}
```

然后定义一个 `onChange` 的本地函数，该函数在检测到变更时随时调用。我们这里在每种类型的变更时每次都从头开始重新构建所有的内容，暂时还未考虑性能问题。因为 Watcher 和 HTTP 处理程序都在不同的 goroutine 中运行，所以我们基本上可以构建一个有效的负载，而不会影响任何正在进行的请求，当然这是一种简单粗暴的做法。

我们可以通过从 listing ingresses 对象开始：

```go
ingresses, err := ingressLister.List(labels.Everything())
if err != nil {
    log.Error().Err(err).Msg("failed to list ingresses")
    return
}
```

对于每个 ingress 对象，如果有 TLS 规则，则从 secrets 对象中加载证书：

```go
for _, rec := range ingress.Spec.TLS {
    if rec.SecretName != "" {
        secret, err := secretLister.Secrets(ingress.Namespace).Get(rec.SecretName)
        if err != nil {
            log.Error().Err(err).Str("namespace", ingress.Namespace).Str("name", rec.SecretName).Msg("unknown secret")
            continue
        }
        cert, err := tls.X509KeyPair(secret.Data["tls.crt"], secret.Data["tls.key"])
        if err != nil {
            log.Error().Err(err).Str("namespace", ingress.Namespace).Str("name", rec.SecretName).Msg("invalid tls certificate")
            continue
        }
        payload.TLSCertificates[rec.SecretName] = &cert
    }
}
```

Go 语言已经内置了一些和加密相关的包，可以很简单的处理 TLS 证书，对于实际的 HTTP 规则，这里我们添加了一个 `addBackend` 的辅助函数：

```go
addBackend := func(ingressPayload *IngressPayload, backend extensionsv1beta1.IngressBackend) {
    svc, err := serviceLister.Services(ingressPayload.Ingress.Namespace).Get(backend.ServiceName)
    if err != nil {
        log.Error().Err(err).Str("namespace", ingressPayload.Ingress.Namespace).Str("name", backend.ServiceName).Msg("unknown service")
    } else {
        m := make(map[string]int)
        for _, port := range svc.Spec.Ports {
            m[port.Name] = int(port.Port)
        }
        ingressPayload.ServicePorts[svc.Name] = m
    }
}
```

每个 HTTP 规则和可选的默认规则都会调用该方法：

```go
if ingress.Spec.Backend != nil {
    addBackend(&ingressPayload, *ingress.Spec.Backend)
}
for _, rule := range ingress.Spec.Rules {
    if rule.HTTP != nil {
        continue
    }
    for _, path := range rule.HTTP.Paths {
        addBackend(&ingressPayload, path.Backend)
    }
}
```

然后调用 `onChange` 回调：

```go
w.onChange(payload)
```

每当发生更改时，都会调用本地 `onChange` 函数，最后一步就是启动我们的 `informers`：

```go
var wg sync.WaitGroup
wg.Add(1)
go func() {
    informer := factory.Core().V1().Secrets().Informer()
    informer.AddEventHandler(handler)
    informer.Run(ctx.Done())
    wg.Done()
}()

wg.Add(1)
go func() {
    informer := factory.Extensions().V1beta1().Ingresses().Informer()
    informer.AddEventHandler(handler)
    informer.Run(ctx.Done())
    wg.Done()
}()

wg.Add(1)
go func() {
    informer := factory.Core().V1().Services().Informer()
    informer.AddEventHandler(handler)
    informer.Run(ctx.Done())
    wg.Done()
}()

wg.Wait()
```

我们这里每个 informer 都使用同一个 handler：

```go
debounced := debounce.New(time.Second)
handler := cache.ResourceEventHandlerFuncs{
    AddFunc: func(obj interface{}) {
        debounced(onChange)
    },
    UpdateFunc: func(oldObj, newObj interface{}) {
        debounced(onChange)
    },
    DeleteFunc: func(obj interface{}) {
        debounced(onChange)
    },
}
```

[Debouncing（防抖动）](https://godoc.org/github.com/bep/debounce) 是一种避免事件重复的方法，我们设置一个小的延迟，如果在达到延迟之前发生了其他事件，则重启计时器。


### 路由表
路由表的目标是通过预先计算大部分查询相关信息来提高查询效率，这里我们就需要使用一些高效的数据结构来进行存储，由于在集群中有大量的路由规则，所以要实现映射查询既高效又容易理解的最简单的方法我们能想到的就是使用 `Map`，`Map` 可以为我们提供 `O(1)` 效率的查询，我们这里使用 Map 进行初始化查找，如果在后面找到了多个规则，则使用切片来存储这些规则。
<!--adsense-text-->
一个路由表由两个 `Map` 构成，一个是根据域名映射的证书，一个就是根据域名映射的后端路由表：

```go
type RoutingTable struct {
    certificatesByHost map[string]map[string]*tls.Certificate
    backendsByHost     map[string][]routingTableBackend
}

// NewRoutingTable 创建一个新的路由表
func NewRoutingTable(payload *watcher.Payload) *RoutingTable {
    rt := &RoutingTable{
        certificatesByHost: make(map[string]map[string]*tls.Certificate),
        backendsByHost:     make(map[string][]routingTableBackend),
    }
    rt.init(payload)
    return rt
}
```

此外路由表下面还有两个主要的方法：

```go
// GetCertificate 获得一个证书
func (rt *RoutingTable) GetCertificate(sni string) (*tls.Certificate, error) {
    hostCerts, ok := rt.certificatesByHost[sni]
    if ok {
        for h, cert := range hostCerts {
            if rt.matches(sni, h) {
                return cert, nil
            }
        }
    }
    return nil, errors.New("certificate not found")
}

// GetBackend 通过给定的 host 和 path 获取后端程序
func (rt *RoutingTable) GetBackend(host, path string) (*url.URL, error) {
    // strip the port
    if idx := strings.IndexByte(host, ':'); idx > 0 {
        host = host[:idx]
    }
    backends := rt.backendsByHost[host]
    for _, backend := range backends {
        if backend.matches(path) {
            return backend.url, nil
        }
    }
    return nil, errors.New("backend not found")
}
```

其中 `GetCertificate` 来获取用于安全连接的 TLS 证书。HTTP 处理程序使用 `GetBackend` 将请求代理到后端，对于 TLS 证书，我们还有一个 `matches` 方法来处理通配符证书：

```go
func (rt *RoutingTable) matches(sni string, certHost string) bool {
    for strings.HasPrefix(certHost, "*.") {
        if idx := strings.IndexByte(sni, '.'); idx >= 0 {
            sni = sni[idx+1:]
        } else {
            return false
        }
        certHost = certHost[2:]
    }
    return sni == certHost
}
```

其实对于后端应用来说，`matches` 方法实际上就是一个正则表达式匹配（因为 Ingress 对象的 path 字段定义的是一个正则表达式）：

```go
type routingTableBackend struct {
    pathRE *regexp.Regexp
    url    *url.URL
}

func (rtb routingTableBackend) matches(path string) bool {
    if rtb.pathRE == nil {
        return true
    }
    return rtb.pathRE.MatchString(path)
}
```

### HTTP Server
最后我们需要来实现一个 HTTP Server，用来接收网络入口的请求。首先定义一个私有的 `config` 结构体：

```go
type config struct {
    host    string
    port    int
    tlsPort int
}
```

定义一个 `Option` 类型：

```go
// config 的修改器
type Option func(*config)
```

定义一个设置 Option 的函数：

```go
// WithHost 设置 host 绑定到 config 上。
func WithHost(host string) Option {
    return func(cfg *config) {
        cfg.host = host
    }
}
```

服务的结构体和构造器如下所示：

```go
// 代理 HTTP 请求
type Server struct {
    cfg          *config
    routingTable atomic.Value
    ready        *Event
}

// New 创建一个新的服务
func New(options ...Option) *Server {
    cfg := defaultConfig()
    for _, o := range options {
        o(cfg)
    }
    s := &Server{
        cfg:   cfg,
        ready: NewEvent(),
    }
    s.routingTable.Store(NewRoutingTable(nil))
    return s
}
```

通过使用一个合适的默认值，上面的初始化方法可以使大多数客户端使用变得非常容易，同时还可以根据需要进行灵活的更改，这种 API 方法在 Go 语言中是非常普遍的，有很多实际示例，比如 [gRPC 的 Dail 方法](https://godoc.org/google.golang.org/grpc#Dial)。

除了配置之外，我们的服务器还有指向路由表的指针和一个就绪的事件，用于在第一次设置 payload 时发出信号。但是需要注意的是，我们这里使用的是 `atomic.Value` 来存储路由表，这是为什么呢？

由于这里我们的应用不是线程安全的，如果在 HTTP 处理程序尝试读取路由表的同时对其进行了修改，则可能导致状态错乱或者程序崩溃。所以，我们需要防止同时读取和写入这个共享的数据结构，当然有多种方法可以实现该需求：

* 第一种就是我们这里使用的 `atomic.Value`，该类型提供了一个 `Load` 和 `Store` 的方法，可以允许我们自动`读取/写入`该值。由于我们在每次更改时都会重新构建路由表，所以我们可以在一次操作中安全地交换新旧路由表，这和[文档中](https://godoc.org/sync/atomic#Value)的 `ReadMostly` 示例非常相似：

不过这种方法的一个缺点是必须在运行时声明存储的值类型：

```go
s.routingTable.Load().(*RoutingTable).GetBackend(r.Host, r.URL.Path)
```

* 另外我们也可以使用 `Mutext` 或 `RWMutex` 来控制对关键区域代码的访问：

```go
// 读
s.mu.RLock()
backendURL, err := s.routingTable.GetBackend(r.Host, r.URL.Path)
s.mu.RUnlock()

// 写
rt := NewRoutingTable(payload)
s.mu.Lock()
s.routingTable = rt
s.mu.Unlock()
```

* 还有一种方法就是让路由表本身成为线程安全的，使用 `sync.Map` 来代替 `Map` 并添加方法来动态更新路由表。一般来说，我会避免使用这种方法，它使代码更难于理解和维护了，而且如果你实际上最终没有多个 goroutine 访问数据结构的话，就会增加不必要的开销了。

真正的处理服务的 `ServeHTTP` 方法如下所示：

```go
// ServeHTTP 处理 HTTP 请求
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 根据请求的域名和 Path 路径获取背后真实的后端地址
    backendURL, err := s.routingTable.Load().(*RoutingTable).GetBackend(r.Host, r.URL.Path)
    if err != nil {
        http.Error(w, "upstream server not found", http.StatusNotFound)
        return
    }
    log.Info().Str("host", r.Host).Str("path", r.URL.Path).Str("backend", backendURL.String()).Msg("proxying request")

    // 对后端真实 URL 发起代理请求
    p := httputil.NewSingleHostReverseProxy(backendURL)
    p.ErrorLog = stdlog.New(log.Logger, "", 0)
    p.ServeHTTP(w, r)
}
```

这里我们使用了 `httputil` 这个包，该包具有反向代理的一些实现方法，我们可以将其用于 HTTP 服务，它可以将请求转发到指定的 URL 上，然后将响应发送回客户端。

### Main 函数
将所有组件组合在一起，然后通过 `main` 方法提供入口，我们这里使用 `flag` 包来提供一些命令行参数：

```go
func main() {
    flag.StringVar(&host, "host", "0.0.0.0", "the host to bind")
    flag.IntVar(&port, "port", 80, "the insecure http port")
    flag.IntVar(&tlsPort, "tls-port", 443, "the secure https port")
    flag.Parse()

    client, err := kubernetes.NewForConfig(getKubernetesConfig())
    if err != nil {
        log.Fatal().Err(err).Msg("failed to create kubernetes client")
    }

    s := server.New(server.WithHost(host), server.WithPort(port), server.WithTLSPort(tlsPort))
    w := watcher.New(client, func(payload *watcher.Payload) {
        s.Update(payload)
    })

    var eg errgroup.Group
    eg.Go(func() error {
        return s.Run(context.TODO())
    })
    eg.Go(func() error {
        return w.Run(context.TODO())
    })
    if err := eg.Wait(); err != nil {
        log.Fatal().Err(err).Send()
    }
}
```

## Kubernetes 配置
有了服务器代码，现在我们就可以在 Kubernetes 上用 DaemonSet 控制器来运行我们的 Ingress Controller：（k8s-ingress-controller.yaml）

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k8s-simple-ingress-controller
  namespace: default

---
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: k8s-simple-ingress-controller
rules:
  - apiGroups:
      - ""
    resources:
      - services
      - endpoints
      - secrets
    verbs:
      - get
      - list
      - watch
  - apiGroups:
      - extensions
    resources:
      - ingresses
    verbs:
      - get
      - list
      - watch

---
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: k8s-simple-ingress-controller
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: k8s-simple-ingress-controller
subjects:
- kind: ServiceAccount
  name: k8s-simple-ingress-controller
  namespace: default

---
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: k8s-simple-ingress-controller
  labels:
    app: ingress-controller
spec:
  selector:
    matchLabels:
      app: ingress-controller
  template:
    metadata:
      labels:
        app: ingress-controller
    spec:
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      serviceAccountName: k8s-simple-ingress-controller
      containers:
        - name: k8s-simple-ingress-controller
          image: cnych/k8s-simple-ingress-controller:v0.1
          ports:
            - name: http
              containerPort: 80
            - name: https
              containerPort: 443
```

由于我们要在应用中监听 Ingress、Service、Secret 这些资源对象，所以需要声明对应的 RBAC 权限，这样当我们的请求到达 Ingress Controller 的节点后，然后根据 Ingress 对象的规则，将请求转发到对应的 Service 上就完成了服务暴露的整个过程。

直接创建上面我们自定义的 Ingress Controller 的资源清单：

```shell
$ kubectl apply -f k8s-ingress-controller.yaml
$ kubectl get pods -l app=ingress-controller
NAME                                             READY   STATUS    RESTARTS   AGE
k8s-simple-ingress-controller-694df987c7-h2qlc   1/1     Running   0          7m59s
```

然后为我们最开始的 whoami 服务创建一个 Ingress 对象：（whoami-ingress.yaml）

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: whoami
spec:
  rules:
    - host: who.qikqiak.com
      http:
        paths:
          - path: /
            backend:
              serviceName: whoami
              servicePort: 80
```

```shell
$ kubectl apply -f whoami-ingress.yaml
```

然后将域名 `who.qikqiak.com` 解析到我们部署的 Ingress Controller 的 Pod 节点上，就可以直接访问了：

![k8s simple ingress controller demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/k8s-simple-ingress-controller-demo.png)

```shell
$ kubectl logs -f k8s-simple-ingress-controller-694df987c7-h2qlc
5:37AM INF starting secure HTTP server addr=0.0.0.0:443
5:37AM INF starting insecure HTTP server addr=0.0.0.0:80
5:39AM INF proxying request backend=http://whoami:80 host=who.qikqiak.com path=/
```

到这里我们就完成了自定义一个简单的 Ingress Controller，当然这只是一个最基础的功能，在实际使用中还会有更多的需求，比如 TCP 的支持、对请求进行一些修改之类的，这就需要花更多的时间去实现了。

> 本文相关代码都整理到了 GitHub 上，地址：[https://github.com/cnych/kubernetes-simple-ingress-controller](https://github.com/cnych/kubernetes-simple-ingress-controller)。

## 参考链接

* [Ingress Controllers](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/)
* [How to Build a Custom Kubernetes Ingress Controller in Go](http://www.doxsey.net/blog/how-to-build-a-custom-kubernetes-ingress-controller-in-go)


<!--adsense-self-->
