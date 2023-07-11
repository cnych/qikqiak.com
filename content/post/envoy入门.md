---
title: Envoy 简单入门示例
date: 2020-04-03
keywords: ["envoy", "kubernetes"]
tags: ["envoy", "kubernetes", "istio"]
slug: envoy-usage-demo
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200403112418.png",
      desc: "https://unsplash.com/photos/ITkhmqFN4dI",
    },
  ]
category: "kubernetes"
---

[Envoy](https://www.envoyproxy.io/) 是为云原生应用而设计的开源边缘和服务代理，也是 Istio Service Mesh 默认的数据平面，本文我们通过一个简单的示例来介绍 Envoy 的基本使用。

<!--more-->

## 1. 配置

### 创建代理配置

Envoy 使用 YAML 配置文件来控制代理的行为。在下面的步骤中，我们将使用静态配置接口来构建配置，也意味着所有设置都是预定义在配置文件中的。此外 Envoy 也支持动态配置，这样可以通过外部一些源来自动发现进行设置。

### 资源

Envoy 配置的第一行定义了正在使用的接口配置，在这里我们将配置静态 API，因此第一行应为 `static_resources`：

```yaml
static_resources:
```

### 监听器

在配置的开始定义了监听器（Listeners）。监听器是 Envoy 监听请求的网络配置，例如 IP 地址和端口。我们这里的 Envoy 在 Docker 容器内运行，因此它需要监听 IP 地址 `0.0.0.0`，在这种情况下，Envoy 将在端口 `10000` 上进行监听。

下面是定义监听器的配置：

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 10000 }
```

### 过滤器

通过 Envoy 监听传入的流量，下一步是定义如何处理这些请求。每个监听器都有一组过滤器，并且不同的监听器可以具有一组不同的过滤器。

在我们这个示例中，我们将所有流量代理到 `baidu.com`，配置完成后我们应该能够通过请求 Envoy 的端点就可以直接看到百度的主页了，而无需更改 URL 地址。

过滤器是通过 `filter_chains` 来定义的，每个过滤器的目的是找到传入请求的匹配项，以使其与目标地址进行匹配：

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 10000 }

      filter_chains:
        - filters:
            - name: envoy.http_connection_manager
              config:
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route:
                            {
                              host_rewrite: www.baidu.com,
                              cluster: service_baidu,
                            }
                http_filters:
                  - name: envoy.router
```

该过滤器使用了 `envoy.http_connection_manager`，这是为 HTTP 连接设计的一个内置过滤器:

- `stat_prefix`：为连接管理器发出统计信息时使用的一个前缀。
- `route_config`：路由配置，如果虚拟主机匹配上了则检查路由。在我们这里的配置中，无论请求的主机域名是什么，`route_config` 都匹配所有传入的 HTTP 请求。
- `routes`：如果 URL 前缀匹配，则一组路由规则定义了下一步将发生的状况。`/` 表示匹配根路由。
- `host_rewrite`：更改 HTTP 请求的入站 Host 头信息。
- `cluster`: 将要处理请求的集群名称，下面会有相应的实现。
- `http_filters`: 该过滤器允许 Envoy 在处理请求时去适应和修改请求。

### 集群

当请求于过滤器匹配时，该请求将会传递到集群。下面的配置就是将主机定义为访问 HTTPS 的 baidu.com 域名，如果定义了多个主机，则 Envoy 将执行轮询（Round Robin）策略。配置如下所示：

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 10000 }

      filter_chains:
        - filters:
            - name: envoy.http_connection_manager
              config:
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route:
                            {
                              host_rewrite: www.baidu.com,
                              cluster: service_baidu,
                            }
                http_filters:
                  - name: envoy.router

  clusters:
    - name: service_baidu
      connect_timeout: 0.25s
      type: LOGICAL_DNS
      dns_lookup_family: V4_ONLY
      lb_policy: ROUND_ROBIN
      hosts: [{ socket_address: { address: www.baidu.com, port_value: 443 } }]
      tls_context: { sni: baidu.com }
```

### 管理

最后，还需要配置一个管理模块：

```yaml
admin:
  access_log_path: /tmp/admin_access.log
  address:
    socket_address: { address: 0.0.0.0, port_value: 9901 }
```

上面的配置定义了 Envoy 的静态配置模板，监听器定义了 Envoy 的端口和 IP 地址，监听器具有一组过滤器来匹配传入的请求，匹配请求后，将请求转发到集群。

<!--adsense-text-->

## 2. 开启代理

配置完成后，可以通过 Docker 容器来启动 Envoy，将上面的配置文件通过 Volume 挂载到容器中的 `/etc/envoy/envoy.yaml` 文件。

然后使用以下命令启动绑定到端口 80 的 Envoy 容器：

```shell
$ docker run --name=envoy -d \
  -p 80:10000 \
  -v $(pwd)/manifests/1.getting-started/envoy.yaml:/etc/envoy/envoy.yaml \
  envoyproxy/envoy:latest
```

启动后，我们可以在本地的 80 端口上去访问应用 `curl localhost` 来测试代理是否成功。同样我们也可以通过在本地浏览器中访问 `localhost` 来查看：

![envoy proxy baidu](https://picdn.youdianzhishi.com/images/20200402202659.png)

可以看到请求被代理到了 `baidu.com`，而且应该也可以看到 URL 地址没有变化，还是 `localhost`。

## 3. 管理视图

Envoy 提供了一个管理视图，可以让我们去查看配置、统计信息、日志以及其他 Envoy 内部的一些数据。

我们可以通过添加其他的资源定义来配置 admin，其中也可以定义管理视图的端口，不过需要注意该端口不要和其他监听器配置冲突。

```yaml
admin:
  access_log_path: /tmp/admin_access.log
  address:
    socket_address: { address: 0.0.0.0, port_value: 9901 }
```

当然我们也可以通过 Docker 容器将管理端口暴露给外部用户。上面的配置就会将管理页面暴露给外部用户，当然我们这里仅仅用于演示是可以的，如果你是用于线上环境还需要做好一些安全保护措施，可以查看 [Envoy 的相关文档](https://www.envoyproxy.io/docs/envoy/latest/operations/admin) 了解更多安全配置。

要将管理页面也暴露给外部用户，我们使用如下命令运行另外一个容器：

```shell
$ docker run --name=envoy-with-admin -d \
    -p 9901:9901 \
    -p 10000:10000 \
    -v $(pwd)/manifests/1.getting-started/envoy.yaml:/etc/envoy/envoy.yaml \
    envoyproxy/envoy:latest
```

运行成功后，现在我们可以在浏览器里面输入 `localhost:9901` 来访问 Envoy 的管理页面：

![envoy admin view](https://picdn.youdianzhishi.com/images/20200402204612.png)

> 需要注意的是当前的管理页面不仅允许执行一些破坏性的操作（比如，关闭服务），而且还可能暴露一些私有信息（比如统计信息、集群名称、证书信息等）。所以应该只允许通过安全网络去访问管理页面。

当然 Envoy 还有很多用法，本文只是一个最简单的入门示例，后续再慢慢深入。

<!--adsense-self-->
