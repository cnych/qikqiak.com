---
title: 通过 Traefik 使用 Kubernetes Service APIs 进行流量路由
date: 2021-02-13
tags: ["kubernetes", "traefik", "Service API"]
keywords: ["kubernetes", "traefik", "ingress", "ingressroute", "Service API"]
slug: use-kubernetes-service-apis-with-traefik
notoc: true
gitcomment: true
category: "kubernetes"
---

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210212151242.png)

[前面我们已经介绍了 Kubernetes 社区内部为 Kubernetes 开发了一种改进的定义和管理入口流量的新接口](* [Kubernetes Service APIs 简介](/post/kubernetes-service-apis-intro/))，也就是新的 `Kubernetes Service APIs`。Traefik 在2.4 版本中引入了对 Service APIs 的初始支持。本文我们将演示如何通过 Traefik 来使用新的 `Gateway`、`GatewayClass` 和 `HTTPRoute API` 将请求路由到后端的服务 Pod。

<!--more-->

## 环境

在开始使用之前我们需要先准备相关的环境：

- 一个运行的 Kubernetes 集群，本文会假设它运行在 [localhost](http://localhost) 上。
- kubectl 命令行工具，并配置成访问你的集群。

本文涉及的相关配置文件可以通过下面的 GitHub 仓库获取：

```bash
git clone https://github.com/traefik-tech-blog/k8s-service-apis
```

### 安装 CRD

由于目前 Kubernetes 集群上默认没有安装 Service APIs，所以我们需要先安装一组支持他们的 CRD 资源，需要保证在 Traefik 中启用 Service APIs 支持之前安装这些资源。

目前我们可以直接使用 0.10 版本进行安装：

```bash
kubectl apply -k "github.com/kubernetes-sigs/service-apis/config/crd?ref=v0.1.0"
```

### 安装配置 Traefik

目前需要 Traefik 2.4+ 版本才支持 Service APIs，所以我们需要安装 Traefik v2.4（或更高版本）并配置启用新的 Provider，这里我们可以直接使用官方的 Helm Chart 包进行安装：

```bash
helm repo add traefik https://helm.traefik.io/traefik
helm repo update
helm install traefik --set experimental.kubernetesGateway.enabled=true traefik/traefik
```

注意上面我们设置的 `--set experimental.kubernetesGateway.enabled=true`参数，上面的命令会安装 Traefik 2.4，并启用新的 Service APIs Provider，还将创建 `GatewayClasses` 和一个 `Gateway` 实例。如果还有更多的定制安装需求，我们可以直接通过覆盖 Chart 包的 Values 值，比如可以配置 label selector 或者 TLS 证书等等。

要验证新功能是否已经被启用，这里我们使用端口转发来直接暴露 Traefik 的 Dashboard。

```bash
kubectl port-forward $(kubectl get pods --selector "app.kubernetes.io/name=traefik" --output=name) 9000:9000
```

然后使用浏览器通过 [http://localhost:9000/dashboard/](http://localhost:9000/dashboard/) 访问 Dashboard，正常应该看到 `KubernetesGateway` 这个 Provider 已经激活并准备好了服务。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210212145525.png)

## 测试

下面我们安装 whoami 服务来进行测试，直接使用下面的资源清单创建对应的服务即可：

```yaml
# 01-whoami.yaml
---
kind: Deployment
apiVersion: apps/v1
metadata:
  name: whoami
spec:
  replicas: 2
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
          image: traefik/whoami:v1.6.0
          ports:
            - containerPort: 80
              name: http

---
apiVersion: v1
kind: Service
metadata:
  name: whoami
spec:
  ports:
    - protocol: TCP
      port: 80
      targetPort: http
  selector:
    app: whoami
```

当测试服务部署完成后，我们就可以使用 Service API 的方式来进行流量配置了。

### 部署一个简单的 Host 主机

在以前的方式中我们会创建一个 Ingress 或 IngressRoute 资源对象，这里我们将部署第一个简单呃 HTTPRoute 对象。

```yaml
# 02-whoami-httproute.yaml  
---
kind: HTTPRoute
apiVersion: networking.x-k8s.io/v1alpha1
metadata:
  name: http-app-1
  namespace: default
  labels:
    app: traefik
spec:
  hostnames:
    - "whoami"
  rules:
    - matches:
        - path:
            type: Exact
            value: /
      forwardTo:
        - serviceName: whoami
          port: 80
          weight: 1
```

这个 HTTPRoute 资源会捕捉到向 whoami 主机名发出的请求，并将其转发到之前部署的 whoami 服务，如果你现在对这个主机名进行请求，你会看到典型的 whoami 输出。

```bash
curl -H "Host: whoami" http://localhost
Hostname: whoami-9cdc57b6d-pfpxs
IP: 127.0.0.1
IP: ::1
IP: 10.42.0.13
IP: fe80::9c1a:a1ff:fead:2663
RemoteAddr: 10.42.0.11:33658
GET / HTTP/1.1
Host: whoami
User-Agent: curl/7.64.1
Accept: */*
Accept-Encoding: gzip
X-Forwarded-For: 10.42.0.1
X-Forwarded-Host: whoami
X-Forwarded-Port: 80
X-Forwarded-Proto: http
X-Forwarded-Server: traefik-74d7f586dd-xxr7r
X-Real-Ip: 10.42.0.1
```

注意`app：traefik`标签选择器，它确保请求被路由到你的 Traefik 实例，这是上面通过 Helm Chart 包安装的默认标签，当然也可以进行自定义。
<!--adsense-text-->
### 带路径的 Host 主机

上面的例子可以很容易地限制流量只在一个给定的子路径上进行路由。

```yaml
# 03-whoami-httproute-paths.yaml
--- 
apiVersion: networking.x-k8s.io/v1alpha1
kind: HTTPRoute
metadata: 
  labels: 
    app: traefik
  name: http-app-1
  namespace: default
spec: 
  hostnames: 
    - whoami
  rules: 
    - 
      forwardTo: 
        - 
          port: 80
          serviceName: whoami
          weight: 1
      matches: 
        - 
          path: 
            type: Exact
            value: /foo
```

创建上面修改后的 HTTPRoute，你会发现之前的请求现在返回404错误，而请求 `/foo` 路径后缀则返回成功。

```bash
curl -H "Host: whoami" http://localhost/foo
Hostname: whoami-9cdc57b6d-pfpxs
IP: 127.0.0.1
IP: ::1
IP: 10.42.0.13
IP: fe80::9c1a:a1ff:fead:2663
RemoteAddr: 10.42.0.11:34424
GET /foo HTTP/1.1
Host: whoami
User-Agent: curl/7.64.1
Accept: */*
Accept-Encoding: gzip
X-Forwarded-For: 10.42.0.1
X-Forwarded-Host: whoami
X-Forwarded-Port: 80
X-Forwarded-Proto: http
X-Forwarded-Server: traefik-74d7f586dd-xxr7r
X-Real-Ip: 10.42.0.1
```

关于请求的哪些部分可以被匹配的更多信息可以在官方 Service APIs 文档（[https://kubernetes-sigs.github.io/service-apis/httproute/](https://kubernetes-sigs.github.io/service-apis/httproute/)）中找到。

### 使用静态证书的 TLS

到目前为止，我们已经创建了一个简单的 HTTPRoute，下一步，我们需要通过 TLS 来保证这个路由的安全，首先需要先用一个证书创建一个Kubernetes Secret，如下所示：

```yaml
# 04-tls-dummy-cert.yaml
--- 
apiVersion: v1
data: 
  tls.crt: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUVVVENDQXJtZ0F3SUJBZ0lRV2pNZ2Q4OUxOUXIwVC9WMDdGR1pEREFOQmdrcWhraUc5dzBCQVFzRkFEQ0IKaFRFZU1Cd0dBMVVFQ2hNVmJXdGpaWEowSUdSbGRtVnNiM0J0Wlc1MElFTkJNUzB3S3dZRFZRUUxEQ1JxWW1SQQpaSEpwZW5wMElDaEtaV0Z1TFVKaGNIUnBjM1JsSUVSdmRXMWxibXB2ZFNreE5EQXlCZ05WQkFNTUsyMXJZMlZ5CmRDQnFZbVJBWkhKcGVucDBJQ2hLWldGdUxVSmhjSFJwYzNSbElFUnZkVzFsYm1wdmRTa3dIaGNOTWpBeE1qQTAKTVRReE1qQXpXaGNOTWpNd016QTBNVFF4TWpBeldqQllNU2N3SlFZRFZRUUtFeDV0YTJObGNuUWdaR1YyWld4dgpjRzFsYm5RZ1kyVnlkR2xtYVdOaGRHVXhMVEFyQmdOVkJBc01KR3BpWkVCa2NtbDZlblFnS0VwbFlXNHRRbUZ3CmRHbHpkR1VnUkc5MWJXVnVhbTkxS1RDQ0FTSXdEUVlKS29aSWh2Y05BUUVCQlFBRGdnRVBBRENDQVFvQ2dnRUIKQU12bEc5d0ZKZklRSWRreDRXUy9sNGhQTVRQcmVUdmVQOS9MZlBYK2h2ekFtVC90V1BJbGxGY2JJNnZzemp0NQpEWlZUMFFuQzhHYzg0K1lPZXZHcFpNaTg0M20zdTdFSUlmY3dETUF4WWQ0ZjJJcENLVW9jSFNtVGpOaVhDSnhwCjVNd2tlVXdEc1dvVVZza1RxeVpOcWp0RWVIbGNuQTFHaGZSa3dEUkZxd1QxeVhaUTBoZHpkQzRCeFhhaVk0VEQKaFQ1dnFXQmlnUlh0M1VwSkhEL1NXUG4wTEVQOHM3ckhjUkZPY0RhV3ZWMW1jTkxNZUpveWNYUTJ0M2Z1Q0Fsegp3UWZOSjFQSk45QWlLalFJcXJ1MGFnMC9wU0kyQ3NkbEUzUTFpM29tZGpCQkZDcmxNMTZyY0wwNDdtWXZKOEVvCjFMdDVGQkxnVURBZktIOFRsaXU0ZG9jQ0F3RUFBYU5wTUdjd0RnWURWUjBQQVFIL0JBUURBZ1dnTUJNR0ExVWQKSlFRTU1Bb0dDQ3NHQVFVRkJ3TUJNQXdHQTFVZEV3RUIvd1FDTUFBd0h3WURWUjBqQkJnd0ZvQVV5cWNiZGhDego3Nm4xZjFtR3BaemtNb2JOYnJ3d0VRWURWUjBSQkFvd0NJSUdkMmh2WVcxcE1BMEdDU3FHU0liM0RRRUJDd1VBCkE0SUJnUUFzWlBndW1EdkRmNm13bXR1TExkWlZkZjdYWk13TjVNSkk5SlpUQ1NaRFRQRjRsdG91S2RCV0gxYm0Kd003VUE0OXVWSHplNVNDMDNlQ294Zk9Ddlczby94SFZjcDZGei9qSldlYlY4SWhJRi9JbGNRRyszTVRRMVJaVApwNkZOa3kvOEk3anF1R2V2b0xsbW9KamVRV2dxWGtFL0d1MFloVCtudVBJY1pGa0hsKzFWOThEUG5WaTJ3U0hHCkIwVU9RaFdxVkhRU0RzcjJLVzlPbmhTRzdKdERBcFcwVEltYmNCaWlXOTlWNG9Ga3VNYmZQOE9FTUY2ZXUzbW0KbUVuYk1pWFFaRHJUMWllMDhwWndHZVNhcTh1Rk82djRwOVVoWHVuc3Vpc01YTHJqQzFwNmlwaDdpMTYwZzRWawpmUXlYT09KY0o2WTl2a2drYzRLYUxBZVNzVUQvRDR1bmd6emVWQ3k0ZXhhMmlBakpzVHVRS3JkOFNUTGNNbUJkCnhtcXVKZXFWSEpoZEVMNDBMVGtEY1FPM1NzOUJpbjRaOEFXeTJkdkR1a1gwa084dm9IUnN4bWVKcnVyZ09MVmIKamVvbTVQMTVsMkkwY3FKd2lNNHZ3SlBsb25wMTdjamJUb0IzQTU5RjZqekdONWtCbjZTaWVmR3VLM21hVWdKegoxWndjamFjPQotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0t
  tls.key: LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2Z0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktnd2dnU2tBZ0VBQW9JQkFRREw1UnZjQlNYeUVDSFoKTWVGa3Y1ZUlUekV6NjNrNzNqL2Z5M3oxL29iOHdKay83Vmp5SlpSWEd5T3I3TTQ3ZVEyVlU5RUp3dkJuUE9QbQpEbnJ4cVdUSXZPTjV0N3V4Q0NIM01BekFNV0hlSDlpS1FpbEtIQjBwazR6WWx3aWNhZVRNSkhsTUE3RnFGRmJKCkU2c21UYW83UkhoNVhKd05Sb1gwWk1BMFJhc0U5Y2wyVU5JWGMzUXVBY1Yyb21PRXc0VStiNmxnWW9FVjdkMUsKU1J3LzBsajU5Q3hEL0xPNngzRVJUbkEybHIxZFpuRFN6SGlhTW5GME5yZDM3Z2dKYzhFSHpTZFR5VGZRSWlvMApDS3E3dEdvTlA2VWlOZ3JIWlJOME5ZdDZKbll3UVJRcTVUTmVxM0M5T081bUx5ZkJLTlM3ZVJRUzRGQXdIeWgvCkU1WXJ1SGFIQWdNQkFBRUNnZ0VCQUl5SWpvbzQxaTJncHVQZitIMkxmTE5MK2hyU0cwNkRZajByTVNjUVZ4UVEKMzgvckZOcFp3b1BEUmZQekZUWnl1a1VKYjFRdUU2cmtraVA0S1E4MTlTeFMzT3NCRTVIeWpBNm5CTExYbHFBVwpEUmRHZ05UK3lhN2xiemU5NmdaOUNtRVdackJZLzBpaFdpdmZyYUNKK1dJK1VGYzkyS1ZoeldSa3FRR2VYMERiCnVSRXRpclJzUXVRb1hxNkhQS1FIeUVITHo2aWVVMHJsV3IyN0VyQkJ4RlRKTm51MnJ1MHV1Ly8wdG1SYjgzZWwKSUpXQnY1V1diSnl4dXNnMkhkc0tzTUh0eEVaYWh1UlpTNHU2TURQR3dSdjRaU0xpQm1FVVc3RUMwUEg3dCtGaAoxUDcrL0Yyd1pGSDAvSzl6eXUyc0lOMDJIbTBmSWtGejBxb09BSzQ5OXhrQ2dZRUE2SC9nVUJoOG9GUSt2cmZKCnQvbXdMeFBHZHhWb3FWR1hFVjhlQzNWbmxUSXJlREpNWm81b1hKZHNuQ0d2S1NaWUhXZ3o3SVpwLzRCL29vSWsKTDl4TEJSVTJwS0d1OGxBT1ZhYnpaVDk0TTZYSE1PTGQ0ZlUrS3ZqK1lLVm5laEM3TVNQL3RSOWhFMjN1MnRKZwp1eUdPRklFVlptNHZxS1hEelU3TTNnU0R5WXNDZ1lFQTRJRVFyZDl2MXp0T2k5REZ6WEdnY05LVmpuYmFTWnNXCm9JNm1WWFJZS1VNM1FyWUw4RjJTVmFFM0Y0QUZjOXRWQjhzV0cxdDk4T09Db0xrWTY2NjZqUFkwMXBWTDdXeTMKZXpwVEFaei9tRnc2czdic3N3VEtrTW5MejVaNW5nS3dhd3pRTXVoRGxLTmJiUi90enRZSEc0NDRrQ2tQS3JEbQphOG40bUt6ZlRuVUNnWUFTTWhmVERPZU1BS3ZjYnpQSlF6QkhydXVFWEZlUmtNSWE2Ty9JQThzMGdQV245WC9ICk12UDE4eC9iNUVMNkhIY2U3ZzNLUUFiQnFVUFQ2dzE3OVdpbG9EQmptQWZDRFFQaUxpdTBTOUJUY25EeFlYL3QKOUN5R1huQkNEZy9ZSE1FWnFuQ1RzejM4c0VqV05VcSt1blNOSkVFUmdDUVl0Y2hxSS9XaWxvWGQyd0tCZ1FEQworTlBYYlBqZ1h5MHoxN2d4VjhFU3VwQVFEY0E5dEdiT1FaVExHaU9Ha2sxbnJscG9BWnVZcWs0Q0pyaVZpYUlyCkJvREllWWpDcjVNK3FnR3VqU3lPUnpSVU40eWRRWkdIZjN1Zkp3NEM3L1k3SlY0amlzR3hSTSt3Rk9yQ0EydmIKVEdGMEZLcThaN0o2N3dQRVliUUNobDB4TmJkcVIvK1ZGTzdGQ1QxV0VRS0JnQThUaE9hZmNEUmdpd0IxRFdyRgozZ1lmT3I0dERENExrNjRYZlF6ajdtRXQyYlJzOFNEYXYwVGZPclVUUlpFTTkyTVFZMnlrbzhyMDJDbmpndmxCCm1aYnZCTEFYaVZLa0laai9TTkNYUnhzOFZkZ3psTkpzYVNZTUtsNloxK1Z3MnZUdDNQSnI0TXlhRWpHYUxlSmMKRGRTQjdYOU9ESk5acW10bGpoRzc5eXpQCi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS0=
kind: Secret
metadata: 
  name: mysecret
  namespace: default
type: kubernetes.io/tls
```

有了这个 Secret 资源后，就可以开始进行安全配置了。首先，必须重新配置 Gateway，以创建一个带有 mysecret 证书的 TLS 监听器，可以通过使用 Helm Chart 的升级选项来进行更新，以便在 Traefik 配置中添加证书部分。

```bash
helm upgrade traefik -f 05-values.yaml traefik/traefik
```

其中 `05-values.yaml` 的内容如下所示：

```yaml
# 05-values.yaml
--- 
experimental: 
  kubernetesGateway: 
    appLabelSelector: traefik
    certificates:
      - 
        group: "core"
        kind: "Secret"
        name: "mysecret"
    enabled: true
```

Traefik 重启后，我们可以发现 HTTPRoute 仍然有效，只是现在我们可以用 HTTPS 访问它了。

```bash
curl --insecure -H "Host: whoami" https://localhost/foo
Hostname: whoami-9cdc57b6d-pfpxs
IP: 127.0.0.1
IP: ::1
IP: 10.42.0.13
IP: fe80::9c1a:a1ff:fead:2663
RemoteAddr: 10.42.0.11:53158
GET /foo HTTP/1.1
Host: whoami
User-Agent: curl/7.64.1
Accept: */*
Accept-Encoding: gzip
X-Forwarded-For: 10.42.0.1
X-Forwarded-Host: whoami
X-Forwarded-Port: 443
X-Forwarded-Proto: https
X-Forwarded-Server: traefik-74d7f586dd-xxr7r
X-Real-Ip: 10.42.0.1
```

### 金丝雀发布

Traefik 2.4 通过 Service APIs 规范可以支持的另一个功能是**金丝雀发布**。假设你想在一个端点上运行两个不同的服务（或同一服务的两个版本），并将一部分请求路由到每个端点，你可以通过修改你的 HTTPRoute 来实现。

首先，我们需要运行第二个服务，这里我们快速生成一个 Nginx 的实例来进行测试。

```yaml
# 06-nginx.yaml
---
kind: Deployment
apiVersion: apps/v1
metadata:
  name: nginx
spec:
  replicas: 2
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: whoami
          image: nginx
          ports:
            - containerPort: 80
              name: http

---
apiVersion: v1
kind: Service
metadata:
  name: whoami
spec:
  ports:
    - protocol: TCP
      port: 80
      targetPort: http
  selector:
    app: nginx
```

HTTPRoute 资源有一个 `weight` 选项，可以为两个服务分别分配不同的值。

```yaml
# 07-whoami-nginx-canary.yaml
--- 
apiVersion: networking.x-k8s.io/v1alpha1
kind: HTTPRoute
metadata: 
  labels: 
    app: traefik
  name: http-app-1
  namespace: default
spec: 
  hostnames: 
    - whoami
  rules: 
    - forwardTo: 
        - port: 80
          serviceName: whoami
          weight: 3
        - port: 80
          serviceName: nginx
          weight: 1
```

创建上面的 HTTPRoute 后，现在我们可以再次访问 whoami 服务 http://localhost（没有 `foo/` 路径后缀），正常我们可以看到有大约25%的时间会看到 Nginx 的响应，而不是 whoami 的响应。

目前，Traefik 对 Service APIs 的实现只集中在 HTTP 和 HTTPS 上。然而，该规范还具有 TCP 功能，未来可能也会支持 UDP，这些都是后续需要实现的功能。当然现在开始你就可以使用 Traefik 2.4 来使用 Kubernetes Service APIs。

## 总结

到这里我们就使用 Traefik 2.4 来测试使用了 Kubernetes Service APIs 的使用。目前，Traefik 对 Service APIs 的实现只集中在 HTTP 和 HTTPS 上，然而，该规范还具有 TCP 功能，未来可能也会支持 UDP，这些都是后续需要实现的功能。

<!--adsense-self-->
