---
title: Grafana Loki 简明教程
subtitle: 云原生日志收集工具 Loki 使用教程
date: 2020-08-19
tags: ["kubernetes", "Loki", "grafana"]
keywords: ["kubernetes", "Loki", "Grafana", "日志"]
slug: grafana-loki-usage
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200819114930.png", desc: "Grafana Loki"}]
category: "kubernetes"
---

Loki 是 Grafana Labs 团队最新的开源项目，是一个水平可扩展，高可用性，多租户的日志聚合系统。它的设计非常经济高效且易于操作，因为它不会为日志内容编制索引，而是为每个日志流配置一组标签。项目受 Prometheus 启发，官方的介绍就是：`Like Prometheus, but for logs`，类似于 Prometheus 的日志系统。

<!--more-->

# 1. 概述

和其他日志系统不同的是，Loki 只会对你的日志元数据标签（就像 Prometheus 的标签一样）进行索引，而不会对原始的日志数据进行全文索引。然后日志数据本身会被压缩，并以 chunks（块）的形式存储在对象存储（比如 S3 或者 GCS）甚至本地文件系统。一个小的索引和高度压缩的 chunks 可以大大简化操作和降低 Loki 的使用成本。

有关本文档更详细的版本，可以查看[《Loki 架构》](https://github.com/grafana/loki/blob/master/docs/architecture.md)章节介绍。

## 1.1 多租户

Loki 支持多租户模式，租户之间的数据是完全分开的。多租户是通过一个租户 ID（用数字字母生成的字符串）实现的。当多租户模式被禁用后，所有请求都会在内部生成一个**`假的`**租户 ID。

## 1.2 操作模式

Loki 可以在本地小规模运行也可以横向扩展。Loki 自带单进程模式，可以在一个进程中运行所有需要的微服务。单进程模式非常适合于测试 Loki 或者小规模运行。对于横向扩展来说，Loki 的微服务是可以被分解成单独的进程的，使其能够独立扩展。

## 1.3 组件

### Distributor（分配器）

分配器服务负责处理[客户端](https://github.com/grafana/loki/blob/master/docs/clients/README.md)写入的日志。本质上它是日志数据写入路径中的`第一站`。一旦分配器接收到日志数据，它就会把它们分成若干批次，并将它们并行地发送到多个采集器去。

分配器通过 [gPRC](https://grpc.io/) 和[采集器](https://github.com/grafana/loki/blob/master/docs/overview/README.md#ingester)进行通信。它们是无状态的，所以我们可以根据实际需要对他们进行扩缩容。

**Hashing**

分配器采用一致性哈希和可配置的复制因子结合使用，来确定哪些采集器服务应该接收日志数据。

该哈希是基于日志标签和租户 ID 生成的。

存储在 [Consul](https://www.consul.io/) 中的哈希环被用来实现一致性哈希；所有的采集器将他们自己的一组 Token 注册到哈希环中去。然后分配器找到和日志的哈希值最匹配的 Token，并将数据发送给该 Token 的持有者。

**一致性**

由于所有的分配器都共享同一个哈希环，所以可以向任何分配器发送写请求。

为了确保查询结果的一致性，Loki 在读和写上使用了 [Dynamo 方式](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)的法定人数一致性。这意味着分配器将等待至少有一半以上的采集器响应，再向用户发送样本，然后再响应给用户。

### Ingester（采集器）

采集器服务负责将日志数据写入长期存储的后端（DynamoDB、S3、Cassandra 等等）。

采集器会校验采集的日志是否乱序。当采集器接收到的日志行与预期的顺序不一致时，该行日志将被拒绝，并向用户返回一个错误。有关更多相关信息，可以查看[时间戳排序](https://github.com/grafana/loki/blob/master/docs/overview/README.md#timestamp-ordering)部分内容。

采集器验证接收到的日志行是按照时间戳递增的顺序接收的（即每条日志的时间戳都比之前的日志晚）。当采集器接收到的日志不按照这个顺序，日志行将被拒绝并返回错误。

每一个唯一的标签集数据都会在内存中构建成`chunks`，然后将它们存储到后端存储中去。

如果一个采集器进程崩溃或者突然挂掉了，所有还没有被刷新到存储的数据就会丢失。Loki 通常配置成多个副本（通常为3个）来降低这种风险。

**时间戳排序**

一般来说推送到 Loki 的所有日志行必须比之前收到的行有一个更新的时间戳。然而有些情况可能是多行日志具有相同的纳秒级别的时间戳，可以按照下面两种情况进行处理：

- 如果传入的行和之前接收到的行完全匹配（时间戳和日志文本都匹配），则传入的行会被视为完全重复并会被忽略。
- 如果传入行的时间戳和前面一行的时间戳相同，但是日志内容不相同，则会接收该行日志。这就意味着，对于相同的时间戳，有可能有两个不同的日志行。

**Handoff（交接）**

默认情况下，当一个采集器关闭并视图离开哈希环时，它将等待查看是否有新的采集器视图进入，然后再进行 flush，并尝试启动交接。交接将把离开的采集器拥有的所有 Token 和内存中的 chunks 都转移到新的采集器中来。

这个过程是为了避免在关闭时 flush 所有的 chunks，因为这是一个比较缓慢的过程，比较耗时。

**文件系统支持**

采集器支持通过 BoltDB 写入到文件系统，但这只在单进程模式下工作，因为[查询器](https://github.com/grafana/loki/blob/master/docs/overview/README.md#querier)需要访问相同的后端存储，而且 BoltDB 只允许一个进程在给定时间内对 DB 进行锁定。

### Querier（查询器）

查询器服务负责处理 [LogQL](https://github.com/grafana/loki/blob/master/docs/logql.md) 查询语句来评估存储在长期存储中的日志数据。

它首先会尝试查询所有采集器的内存数据，然后再返回到后端存储中加载数据。

### 前端查询

该服务是一个可选组件，在一组查询器前面，来负责在它们之间公平地调度请求，尽可能地并行化它们并缓存请求。

### Chunk（块）存储

块存储是 Loki 的长期数据存储，旨在支持交互式查询和持续写入，无需后台维护任务。它由一下几部分组成：

- **块索引**，该索引可以由 DynamoDB、Bigtable 或者 Cassandra 来支持。
- 块数据本身的 **KV 存储**，可以是 DynamoDB、Bigtable、Cassandra，也可以上是对象存储，比如 S3。

> 与 Loki 的其他核心组件不同，块存储不是一个独立的服务、任务或者进程，而是嵌入到需要访问 Loki 数据的采集器和查询器中的库。

块存储依赖统一的 ”NoSQL“ 存储（DynamoDB、Bigtable 和 Cassandra）接口，该接口可以用来支持块存储索引。该接口假设索引是由以下几个 key 构成的集合：

- **哈希 KEY** - 这是所有的读和写都需要的。
- **范围 KEY** - 这是写的时候需要的，读的时候可以省略，可以通过前缀或者范围来查询。

上面支持的这些数据库中接口的工作原理有些不同：

- DynamoDB 支持范围和哈希 KEY。所以索引条目直接建模为 DynamoDB 的数据，哈希 KEY 为分布式 KEY，范围为范围 KEY。
- 对于 Bigtable 和 Cassandra，索引项被建模为单个的列值。哈希 KEY 成为行 KEY，范围 KEY 成为列 KEY。

一些模式被用于对块存储的读取和写入时使用的匹配器和标签集合映射到索引的适当操作中来。随着 Loki 的发展也会增加一些新的模式，主要是为了更好地平衡些和提高查询性能。

## 1.4 对比其他日志系统

EFK（Elasticsearch、Fluentd、Kibana）用于从各种来源获取、可视化和查询日志。

Elasticsearch 中的数据以非结构化 JSON 对象的形式存储在磁盘上。每个对象的键和每个键的内容都有索引。然后可以使用 JSON 对象来定义查询（称为 Query DSL）或通过 Lucene 查询语言来查询数据。

相比之下，单二进制模式下的 Loki 可以将数据存储在磁盘上，但在水平可扩展模式下，数据存储需要在云存储系统中，如 S3、GCS 或 Cassandra。日志以纯文本的形式存储，并标记了一组标签的名称和值，其中只有标签会被索引。这种权衡使其操作起来比完全索引更便宜。Loki 中的日志使用 LogQL 进行查询。由于这种设计上的权衡，根据内容（即日志行内的文本）进行过滤的 LogQL 查询需要加载搜索窗口内所有与查询中定义的标签相匹配的块。

Fluentd 通常用于收集日志并转发到 Elasticsearch。Fluentd 被称为数据收集器，它可以从许多来源采集日志，并对其进行处理，然后转发到一个或多个目标。

相比之下，Promtail 是为 Loki 量身定做的。它的主要工作模式是发现存储在磁盘上的日志文件，并将其与一组标签关联的日志文件转发到 Loki。Promtail 可以为在同一节点上运行的 Kubernetes Pods 做服务发现，作为 Docker 日志驱动，从指定的文件夹中读取日志，并对 systemd 日志不断获取。

Loki 通过一组标签表示日志的方式与 Prometheus 表示指标的方式类似。当与Prometheus 一起部署在环境中时，由于使用了相同的服务发现机制，来自Promtail 的日志通常与你的应用指标具有相同的标签。拥有相同级别的日志和指标，用户可以在指标和日志之间无缝切换，帮助进行根本性原因分析。

Kibana 被用于可视化和搜索 Elasticsearch 数据，并且在对这些数据进行分析时非常强大。Kibana 提供了许多可视化工具来做数据分析，例如地图、用于异常检测的机器学习，以及关系图。也可以配置报警，当出现意外情况时，可以通知用户。

相比之下，Grafana 是专门针对 Prometheus 和 Loki 等数据源的时间序列数据定制的。仪表板可以设置为可视化指标（即将推出的日志支持），也可以使用探索视图对数据进行临时查询。和 Kibana 一样，Grafana 也支持根据你的指标进行报警。

# 2. 安装

官方推荐使用 Tanka 进行安装，Tanka 是 Grafana 重新实现的 Ksonnect 版本，在 Grafana 内部用于生产环境部署，但是 Tanka 目前使用并不多，熟悉的人较少，所以我们这里就不介绍这种方式了。主要介绍下面3种方式。

## 2.1 使用 Helm 安装 Loki

### 前提

首先需要确保已经部署了 Kubernetes 集群，并安装配置了 Helm 客户端，然后添加 [Loki 的 chart 仓库](https://github.com/grafana/loki/tree/master/production/helm/loki)：

```bash
$ helm repo add loki [https://grafana.github.io/loki/charts](https://grafana.github.io/loki/charts)
```

可以使用如下命令更新 chart 仓库：

```bash
$ helm repo update
```

### 部署 Loki

**使用默认配置部署**

```bash
$ helm upgrade --install loki loki/loki-stack
```

**指定命名空间**

```bash
$ helm upgrade --install loki --namespace=loki loki/loki
```

**指定配置**

```bash
$ helm upgrade --install loki loki/loki --set "key1=val1,key2=val2,..."
```

**部署 Loki 工具栈（Loki, Promtail, Grafana, Prometheus）**

```bash
$ helm upgrade --install loki loki/loki-stack --set grafana.enabled=true,prometheus.enabled=true,prometheus.alertmanager.persistentVolume.enabled=false,prometheus.server.persistentVolume.enabled=false
```

**部署 Loki 工具栈（Loki, Promtail, Grafana, Prometheus）**

```bash
$ helm upgrade --install loki loki/loki-stack \
    --set fluent-bit.enabled=true,promtail.enabled=false,grafana.enabled=true,prometheus.enabled=true,prometheus.alertmanager.persistentVolume.enabled=false,prometheus.server.persistentVolume.enabled=false
```

**部署 Grafana**

使用 Helm 安装 Grafana 到 Kubernetes 集群，可以使用如下所示命令：

```bash
$ helm install stable/grafana -n loki-grafana
```

要获取 Grafana 管理员密码，可以使用如下所示命令：

```bash
$ kubectl get secret --namespace <YOUR-NAMESPACE> loki-grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
```

要访问 Grafana UI 页面，可以使用下面的命令：

```bash
$ kubectl port-forward --namespace <YOUR-NAMESPACE> service/loki-grafana 3000:80
```

然后在浏览器中打开 `http://localhost:3000`，用 admin 和上面输出的密码进行登录。然后[按照提示添加 Loki 数据源](https://github.com/grafana/loki/blob/master/docs/getting-started/grafana.md)，Loki 地址为 `http://loki:3100`。

**使用 HTTPS Ingress 访问 Loki**

如果 Loki 和 Promtail 部署在不同的集群上，你可以在 Loki 前面添加一个 Ingress 对象，通过添加证书，可以通过 HTTPS 进行访问，为了保证安全性，还可以在 Ingress 上启用 Basic Auth 认证。

在 Promtail 中，设置下面的 values 值来使用 HTTPS 和 Basic Auth 认证进行通信：

```yaml
loki:
  serviceScheme: https
  user: user
  password: pass
```

Ingress 的 Helm 模板示例如下所示：

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  annotations:
    kubernetes.io/ingress.class: {{ .Values.ingress.class }}
    ingress.kubernetes.io/auth-type: "basic"ingress.kubernetes.io/auth-secret: {{ .Values.ingress.basic.secret }}
  name: loki
spec:
  rules:
  - host: {{ .Values.ingress.host }}
    http:
      paths:
      - backend:
          serviceName: loki
          servicePort: 3100
  tls:
  - secretName: {{ .Values.ingress.cert }}
    hosts:
    - {{ .Values.ingress.host }}
```

## 2.2 使用 Docker 安装 Loki

我们可以使用 Docker 或 Docker Compose 安装 Loki，用来评估、测试或者开发 Lok，但是对于生产环境，我们推荐使用 Tanka 或者 Helm 方式。

### 前提

- [Docker](https://docs.docker.com/install)
- [Docker Compose](https://docs.docker.com/compose/install)（可选，只有使用 Docker Compose 方式才需要安装）

### 使用 Docker 安装

直接拷贝下面的命令代码在命令行中执行：

**Linux**

执行完成后，loki-config.yaml 和 promtail-config.yaml 两个配置文件会被下载到我们使用的目录下面，Docker 容器会使用这些配置文件来运行 Loki 和 Promtail。

```bash
$ wget https://raw.githubusercontent.com/grafana/loki/v1.5.0/cmd/loki/loki-local-config.yaml -O loki-config.yaml
$ docker run -v $(pwd):/mnt/config -p 3100:3100 grafana/loki:1.5.0 -config.file=/mnt/config/loki-config.yaml
$ wget https://raw.githubusercontent.com/grafana/loki/v1.5.0/cmd/promtail/promtail-docker-config.yaml -O promtail-config.yaml
$ docker run -v $(pwd):/mnt/config -v /var/log:/var/log grafana/promtail:1.5.0 -config.file=/mnt/config/promtail-config.yaml
```

### 使用 Docker Compose 安装

```bash
$ wget https://raw.githubusercontent.com/grafana/loki/v1.5.0/production/docker-compose.yaml -O docker-compose.yaml
$ docker-compose -f docker-compose.yaml up
```

## 2.3 本地安装 Loki

### 二进制文件

每个版本都包括 Loki 的二进制文件，可以在 GitHub 的 [Release 页面](https://github.com/grafana/loki/releases)上找到。

### openSUSE Linux 安装包

社区为 openSUSE Linux 提供了 Loki 的软件包，可以使用下面的方式来安装：

- 添加仓库 [`https://download.opensuse.org/repositories/security:/logging/`](https://download.opensuse.org/repositories/security:/logging/)到系统中。比如你在使用 Leap 15.1，执行命令 `sudo zypper ar [https://download.opensuse.org/repositories/security:/logging/openSUSE_Leap_15.1/security:logging.repo](https://download.opensuse.org/repositories/security:/logging/openSUSE_Leap_15.1/security:logging.repo) ; sudo zypper ref`
- 使用命令 `zypper in loki` 安装 Loki 软件包
- 启动 Loki 和 Promtail 服务：
    - `systemd start promtail && systemd enable promtail`
    - `systemd start loki && systemd enable loki`
- 根据需求修改配置文件：`/etc/loki/promtail.yaml` 和 `/etc/loki/loki.yaml` 。

### 手动构建

**前提**

- Go 1.13+ 版本
- Make
- Docker（用于更新 protobuf 文件和 yacc 文件）

**构建**

克隆 Loki 代码到 `$GOPATH/src/github.com/grafana/loki` 路径：

```bash
$ git clone [https://github.com/grafana/loki](https://github.com/grafana/loki) $GOPATH/src/github.com/grafana/loki
```

然后切换到代码目录执行 `make loki` 命令：

```bash
$ cd $GOPATH/src/github.com/grafana/loki
$ make loki

# ./cmd/loki/loki 目录下面将会生成最终的二进制文件。
```

# 3. 开始使用 Loki

## 3.1 Loki 在 Grafana 中的配置

Grafana 在 6.0 以上的版本中内置了对 Loki 的支持。建议使用 6.3 或更高版本，就可以使用新的LogQL功能。

- 登录 Grafana 实例，如果这是你第一次运行 Grafana，用户名和密码都默认为`admin`。
- 在 Grafana 中，通过左侧侧边栏上的图标转到 "`配置 > 数据源`"。
- 单击 `+ Add data source` 按钮。
- 在列表中选择 Loki。
- Http URL 字段是你的 Loki 服务器的地址，例如，在本地运行或使用端口映射的 Docker 运行时，地址可能是 [http://localhost:3100](http://localhost:3100/)。使用 docker-compose 或 Kubernetes 运行时，地址很可能是 [https://loki:3100](https://loki:3100/)。
- 要查看日志，可以单击侧边栏上的 "`探索`"，在左上角下拉菜单中选择 Loki 数据源，然后使用日志标签按钮过滤日志流。

## 3.2 使用 LogCLI 查询 Loki

如果您喜欢命令行界面，`LogCLI` 允许用户针对 Loki 服务器使用 LogQL 查询。

### 安装

**二进制（推荐）**

在 [Release 页面](https://github.com/grafana/loki/releases)中下载的 release 包中就包含 logcli 的二进制文件。

**源码安装**

同样你也可以使用 golang 直接对源码进行编译，使用如下所示的 `go get` 命令获取 `logcli`，二进制文件会出现在 `$GOPATH/bin` 目录下面：

```bash
$ go get github.com/grafana/loki/cmd/logcli
```

### 使用示例

假设你现在使用的是 Grafana Cloud，需要设置下面几个环境变量：

```bash
$ export LOKI_ADDR=https://logs-us-west1.grafana.net
$ export LOKI_USERNAME=<username>
$ export LOKI_PASSWORD=<password>
```

如果你使用的是本地的 Grafana，则可以直接将 LogCLI 指向本地的实例，而不需要用户名和密码：

```bash
$ export LOKI_ADDR=http://localhost:3100
```

> 注意：如果你在 Loki 前面添加了代理服务器，并且配置了身份验证，那么还是需要配置对应的 `LOKI_USERNAME` 和 `LOKI_PASSWORD` 数据。

配置完成后可以使用如下所示的一些 `logcli` 命令：

```bash
$ logcli labels job
https://logs-dev-ops-tools1.grafana.net/api/prom/label/job/values
cortex-ops/consul
cortex-ops/cortex-gw
...

$ logcli query '{job="cortex-ops/consul"}'
https://logs-dev-ops-tools1.grafana.net/api/prom/query?query=%7Bjob%3D%22cortex-ops%2Fconsul%22%7D&limit=30&start=1529928228&end=1529931828&direction=backward&regexp=
Common labels: {job="cortex-ops/consul", namespace="cortex-ops"}
2018-06-25T12:52:09Z {instance="consul-8576459955-pl75w"} 2018/06/25 12:52:09 [INFO] raft: Snapshot to 475409 complete
2018-06-25T12:52:09Z {instance="consul-8576459955-pl75w"} 2018/06/25 12:52:09 [INFO] raft: Compacting logs from 456973 to 465169
...

$ logcli series -q --match='{namespace="loki",container_name="loki"}'
{app="loki", container_name="loki", controller_revision_hash="loki-57c9df47f4", filename="/var/log/pods/loki_loki-0_8ed03ded-bacb-4b13-a6fe-53a445a15887/loki/0.log", instance="loki-0", job="loki/loki", name="loki", namespace="loki", release="loki", statefulset_kubernetes_io_pod_name="loki-0", stream="stderr"}
```

**批量查询**

从 Loki 1.6.0 开始，logcli 会分批向 Loki 发送日志查询。

如果你将查询的`--limit` 参数（默认为30）设置为一个较大的数，比如 10000，那么 logcli 会自动将此请求分批发送到 Loki，默认的批次大小是 1000。
<!--adsense-text-->
Loki 对查询中返回的最大行数有一个服务端的限制（默认为5000）。批量发送允许你发出比服务端限制更大的请求，只要 `--batch` 大小小于服务器限制。

请注意，每个批次的查询元数据都会被打印在 stderr 上，可以通过设置`--quiet` 参数来停止这个动作。

> 对于配置的值会根据环境变量和命令行标志从低到高生效。

### 命令详情

`logcli` 命令行工具详细的使用信息如下所示：

```bash
$ logcli help
usage: logcli [<flags>] <command> [<args> ...]

A command-line for loki.

Flags:
      --help             Show context-sensitive help (also try --help-long and --help-man).
      --version          Show application version.
  -q, --quiet            Suppress query metadata.
      --stats            Show query statistics.
  -o, --output=default   Specify output mode [default, raw, jsonl]. raw suppresses log labels and timestamp.
  -z, --timezone=Local   Specify the timezone to use when formatting output timestamps [Local, UTC].
      --cpuprofile=""    Specify the location for writing a CPU profile.
      --memprofile=""    Specify the location for writing a memory profile.
      --addr="http://localhost:3100"
                         Server address. Can also be set using LOKI_ADDR env var.
      --username=""      Username for HTTP basic auth. Can also be set using LOKI_USERNAME env var.
      --password=""      Password for HTTP basic auth. Can also be set using LOKI_PASSWORD env var.
      --ca-cert=""       Path to the server Certificate Authority. Can also be set using LOKI_CA_CERT_PATH env var.
      --tls-skip-verify  Server certificate TLS skip verify.
      --cert=""          Path to the client certificate. Can also be set using LOKI_CLIENT_CERT_PATH env var.
      --key=""           Path to the client certificate key. Can also be set using LOKI_CLIENT_KEY_PATH env var.
      --org-id=""        adds X-Scope-OrgID to API requests for representing tenant ID. Useful for requesting tenant data when
                         bypassing an auth gateway.

Commands:
  help [<command>...]
    Show help.

  query [<flags>] <query>
    Run a LogQL query.

    The "query" command is useful for querying for logs. Logs can be returned in a few output modes:

      raw: log line
      default: log timestamp + log labels + log line
      jsonl: JSON response from Loki API of log line

    The output of the log can be specified with the "-o" flag, for example, "-o raw" for the raw output format.

    The "query" command will output extra information about the query and its results, such as the API URL, set of common labels,
    and set of excluded labels. This extra information can be suppressed with the --quiet flag.

    While "query" does support metrics queries, its output contains multiple data points between the start and end query time.
    This output is used to build graphs, like what is seen in the Grafana Explore graph view. If you are querying metrics and just
    want the most recent data point (like what is seen in the Grafana Explore table view), then you should use the "instant-query"
    command instead.

  instant-query [<flags>] <query>
    Run an instant LogQL query.

    The "instant-query" command is useful for evaluating a metric query for a single point in time. This is equivalent to the
    Grafana Explore table view; if you want a metrics query that is used to build a Grafana graph, you should use the "query"
    command instead.

    This command does not produce useful output when querying for log lines; you should always use the "query" command when you
    are running log queries.

    For more information about log queries and metric queries, refer to the LogQL documentation:

    https://grafana.com/docs/loki/latest/logql/

  labels [<flags>] [<label>]
    Find values for a given label.

  series [<flags>] <matcher>
    Run series query.

$ logcli help query
usage: logcli query [<flags>] <query>

Run a LogQL query.

The "query" command is useful for querying for logs. Logs can be returned in a few output modes:

  raw: log line
  default: log timestamp + log labels + log line
  jsonl: JSON response from Loki API of log line

The output of the log can be specified with the "-o" flag, for example, "-o raw" for the raw output format.

The "query" command will output extra information about the query and its results, such as the API URL, set of common labels, and
set of excluded labels. This extra information can be suppressed with the --quiet flag.

While "query" does support metrics queries, its output contains multiple data points between the start and end query time. This
output is used to build graphs, like what is seen in the Grafana Explore graph view. If you are querying metrics and just want the
most recent data point (like what is seen in the Grafana Explore table view), then you should use the "instant-query" command
instead.

Flags:
      --help               Show context-sensitive help (also try --help-long and --help-man).
      --version            Show application version.
  -q, --quiet              Suppress query metadata.
      --stats              Show query statistics.
  -o, --output=default     Specify output mode [default, raw, jsonl]. raw suppresses log labels and timestamp.
  -z, --timezone=Local     Specify the timezone to use when formatting output timestamps [Local, UTC].
      --cpuprofile=""      Specify the location for writing a CPU profile.
      --memprofile=""      Specify the location for writing a memory profile.
      --addr="http://localhost:3100"
                           Server address. Can also be set using LOKI_ADDR env var.
      --username=""        Username for HTTP basic auth. Can also be set using LOKI_USERNAME env var.
      --password=""        Password for HTTP basic auth. Can also be set using LOKI_PASSWORD env var.
      --ca-cert=""         Path to the server Certificate Authority. Can also be set using LOKI_CA_CERT_PATH env var.
      --tls-skip-verify    Server certificate TLS skip verify.
      --cert=""            Path to the client certificate. Can also be set using LOKI_CLIENT_CERT_PATH env var.
      --key=""             Path to the client certificate key. Can also be set using LOKI_CLIENT_KEY_PATH env var.
      --org-id=""          adds X-Scope-OrgID to API requests for representing tenant ID. Useful for requesting tenant data when
                           bypassing an auth gateway.
      --limit=30           Limit on number of entries to print.
      --since=1h           Lookback window.
      --from=FROM          Start looking for logs at this absolute time (inclusive).
      --to=TO              Stop looking for logs at this absolute time (exclusive).
      --step=STEP          Query resolution step width, for metric queries. Evaluate the query at the specified step over the time
                           range.
      --interval=INTERVAL  Query interval, for log queries. Return entries at the specified interval, ignoring those between.
                           **This parameter is experimental, please see Issue 1779**.
      --batch=1000         Query batch size to use until 'limit' is reached.
      --forward            Scan forwards through logs.
      --no-labels          Do not print any labels.
      --exclude-label=EXCLUDE-LABEL ...
                           Exclude labels given the provided key during output.
      --include-label=INCLUDE-LABEL ...
                           Include labels given the provided key during output.
      --labels-length=0    Set a fixed padding to labels.
      --store-config=""    Execute the current query using a configured storage from a given Loki configuration file.
  -t, --tail               Tail the logs.
      --delay-for=0        Delay in tailing by number of seconds to accumulate logs for re-ordering.
      --colored-output     Show ouput with colored labels.

Args:
  <query>  eg '{foo="bar",baz=~".*blip"} |~ ".*error.*"'

$ logcli help labels
usage: logcli labels [<flags>] [<label>]

Find values for a given label.

Flags:
      --help             Show context-sensitive help (also try --help-long and --help-man).
      --version          Show application version.
  -q, --quiet            Suppress query metadata.
      --stats            Show query statistics.
  -o, --output=default   Specify output mode [default, raw, jsonl]. raw suppresses log labels and timestamp.
  -z, --timezone=Local   Specify the timezone to use when formatting output timestamps [Local, UTC].
      --cpuprofile=""    Specify the location for writing a CPU profile.
      --memprofile=""    Specify the location for writing a memory profile.
      --addr="http://localhost:3100"
                         Server address. Can also be set using LOKI_ADDR env var.
      --username=""      Username for HTTP basic auth. Can also be set using LOKI_USERNAME env var.
      --password=""      Password for HTTP basic auth. Can also be set using LOKI_PASSWORD env var.
      --ca-cert=""       Path to the server Certificate Authority. Can also be set using LOKI_CA_CERT_PATH env var.
      --tls-skip-verify  Server certificate TLS skip verify.
      --cert=""          Path to the client certificate. Can also be set using LOKI_CLIENT_CERT_PATH env var.
      --key=""           Path to the client certificate key. Can also be set using LOKI_CLIENT_KEY_PATH env var.
      --org-id=""        adds X-Scope-OrgID to API requests for representing tenant ID. Useful for requesting tenant data when
                         bypassing an auth gateway.
      --since=1h         Lookback window.
      --from=FROM        Start looking for labels at this absolute time (inclusive).
      --to=TO            Stop looking for labels at this absolute time (exclusive).

Args:
  [<label>]  The name of the label.

$ logcli help series
usage: logcli series --match=MATCH [<flags>]

Run series query.

Flags:
      --help             Show context-sensitive help (also try --help-long and --help-man).
      --version          Show application version.
  -q, --quiet            Suppress query metadata.
      --stats            Show query statistics.
  -o, --output=default   Specify output mode [default, raw, jsonl]. raw suppresses log labels and timestamp.
  -z, --timezone=Local   Specify the timezone to use when formatting output timestamps [Local, UTC].
      --cpuprofile=""    Specify the location for writing a CPU profile.
      --memprofile=""    Specify the location for writing a memory profile.
      --addr="http://localhost:3100"
                         Server address. Can also be set using LOKI_ADDR env var.
      --username=""      Username for HTTP basic auth. Can also be set using LOKI_USERNAME env var.
      --password=""      Password for HTTP basic auth. Can also be set using LOKI_PASSWORD env var.
      --ca-cert=""       Path to the server Certificate Authority. Can also be set using LOKI_CA_CERT_PATH env var.
      --tls-skip-verify  Server certificate TLS skip verify.
      --cert=""          Path to the client certificate. Can also be set using LOKI_CLIENT_CERT_PATH env var.
      --key=""           Path to the client certificate key. Can also be set using LOKI_CLIENT_KEY_PATH env var.
      --org-id=""        adds X-Scope-OrgID to API requests for representing tenant ID. Useful for requesting tenant data when
                         bypassing an auth gateway.
      --since=1h         Lookback window.
      --from=FROM        Start looking for logs at this absolute time (inclusive).
      --to=TO            Stop looking for logs at this absolute time (exclusive).
      --match=MATCH ...  eg '{foo="bar",baz=~".*blip"}'
```

## 3.3 Label 标签

Label 标签是一个键值对，可以定义任何东西，我们喜欢称它们为描述日志流的元数据。如果你熟悉 Prometheus，那么一定对 Label 标签有一定的了解，在 Loki 的 scrape 配置中也定义了这些标签，和 Prometheus 拥有一致的功能，这些标签非常容易将应用程序指标和日志数据关联起来。

Loki 中的标签执行一个非常重要的任务：它们定义了一个流。更具体地说，每个标签键和值的组合定义了流。如果只是一个标签值变化，这将创建一个新的流。

如果你熟悉 Prometheus，那里的术语叫序列，而且 Prometheus 中还有一个额外的维度：指标名称。Loki 中简化了这一点，因为没有指标名，只有标签，所以最后决定使用流而不是序列。

### 标签示例

下面的示例将说明 Loki 中 Label 标签的基本使用和概念。

首先看下下面的示例：

```yaml
scrape_configs:
 - job_name: system
   pipeline_stages:
   static_configs:
   - targets:
      - localhost
     labels:
      job: syslog
      __path__: /var/log/syslog
```

这个配置将获取日志文件数据并添加一个 `job=syslog` 的标签，我们可以这样来查询：

```bash
{job="syslog"}
```

这将在 Loki 中创建一个流。现在我们再新增一些任务配置：

```yaml
scrape_configs:
 - job_name: system
   pipeline_stages:
   static_configs:
   - targets:
      - localhost
     labels:
      job: syslog
      __path__: /var/log/syslog
 - job_name: system
   pipeline_stages:
   static_configs:
   - targets:
      - localhost
     labels:
      job: apache
      __path__: /var/log/apache.log
```

现在我们采集两个日志文件，每个文件有一个标签与一个值，所以 Loki 会存储为两个流。我们可以通过下面几种方式来查询这些流：

```bash
{job="apache"} <- 显示 job 标签为 apache 的日志
{job="syslog"} <- 显示 job 标签为 syslog 的日志
{job=~"apache|syslog"} <- 显示 job 标签为 apache 或者 syslog 的日志
```

最后一种方式我们使用的是一个 `regex` 标签匹配器来获取 job 标签值为 apache 或者 syslog 的日志。接下来我们看看如何使用额外的标签：

```yaml
scrape_configs:
 - job_name: system
   pipeline_stages:
   static_configs:
   - targets:
      - localhost
     labels:
      job: syslog
      env: dev
      __path__: /var/log/syslog
 - job_name: system
   pipeline_stages:
   static_configs:
   - targets:
      - localhost
     labels:
      job: apache
      env: dev
      __path__: /var/log/apache.log
```

要获取这两个任务的日志可以用下面的方式来代替 regex 的方式：

```yaml
{env="dev"} <- 将返回所有带有 env=dev 标签的日志
```

通过使用一个标签就可以查询很多日志流了，通过组合多个不同的标签，可以创建非常灵活的日志查询。
<!--adsense-text-->
Label 标签是 Loki 日志数据的索引，它们用于查找压缩后的日志内容，这些内容被单独存储为`块`。标签和值的每一个唯一组合都定义了一个`流` ，一个流的日志被分批，压缩，并作为块进行存储。

### Cardinality（势）

前面的示例使用的是静态定义的 Label 标签，只有一个值；但是有一些方法可以动态定义标签。比如我们有下面这样的日志数据：

```bash
11.11.11.11 - frank [25/Jan/2000:14:00:01 -0500] "GET /1986.js HTTP/1.1" 200 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
```

我们可以使用下面的方式来解析这条日志数据：

```yaml
- job_name: system
   pipeline_stages:
      - regex:
        expression: "^(?P<ip>\\S+) (?P<identd>\\S+) (?P<user>\\S+) \\[(?P<timestamp>[\\w:/]+\\s[+\\-]\\d{4})\\] \"(?P<action>\\S+)\\s?(?P<path>\\S+)?\\s?(?P<protocol>\\S+)?\" (?P<status_code>\\d{3}|-) (?P<size>\\d+|-)\\s?\"?(?P<referer>[^\"]*)\"?\\s?\"?(?P<useragent>[^\"]*)?\"?$"
    - labels:
        action:
        status_code:
   static_configs:
   - targets:
      - localhost
     labels:
      job: apache
      env: dev
      __path__: /var/log/apache.log
```

这个 regex 匹配日志行的每个组件，并将每个组件的值提取到一个 capture 组里面。在 pipeline 代码内部，这些数据被放置到一个临时的数据结构中，允许在处理该日志行时将其用于其他处理（此时，临时数据将被丢弃）。

从该 regex 中，我们就使用其中的两个 capture 组，根据日志行本身的内容动态地设置两个标签：

```bash
action (例如 action="GET", action="POST") status_code (例如 status_code="200", status_code="400")
```

假设我们有下面几行日志数据：

```bash
11.11.11.11 - frank [25/Jan/2000:14:00:01 -0500] "GET /1986.js HTTP/1.1" 200 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
11.11.11.12 - frank [25/Jan/2000:14:00:02 -0500] "POST /1986.js HTTP/1.1" 200 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
11.11.11.13 - frank [25/Jan/2000:14:00:03 -0500] "GET /1986.js HTTP/1.1" 400 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
11.11.11.14 - frank [25/Jan/2000:14:00:04 -0500] "POST /1986.js HTTP/1.1" 400 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
```

则在 Loki 中收集日志后，会创建为如下所示的流：

```bash
{job="apache",env="dev",action="GET",status_code="200"} 11.11.11.11 - frank [25/Jan/2000:14:00:01 -0500] "GET /1986.js HTTP/1.1" 200 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
{job="apache",env="dev",action="POST",status_code="200"} 11.11.11.12 - frank [25/Jan/2000:14:00:02 -0500] "POST /1986.js HTTP/1.1" 200 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
{job="apache",env="dev",action="GET",status_code="400"} 11.11.11.13 - frank [25/Jan/2000:14:00:03 -0500] "GET /1986.js HTTP/1.1" 400 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
{job="apache",env="dev",action="POST",status_code="400"} 11.11.11.14 - frank [25/Jan/2000:14:00:04 -0500] "POST /1986.js HTTP/1.1" 400 932 "-" "Mozilla/5.0 (Windows; U; Windows NT 5.1; de; rv:1.9.1.7) Gecko/20091221 Firefox/3.5.7 GTB6"
```

这4行日志将成为4个独立的流，并开始填充4个独立的块。任何与这些 `标签/值` 组合相匹配的额外日志行将被添加到现有的流中。如果有另一个独特的标签组合进来（比如 status_code="500"）就会创建另一个新的流。

比如我们为 IP 设置一个 Label 标签，不仅用户的每一个请求都会变成一个唯一的流，每一个来自同一用户的不同 action 或 status_code 的请求都会得到自己的流。

如果有4个共同的操作（GET、PUT、POST、DELETE）和4个共同的状态码（可能不止4个！），这将会是16个流和16个独立的块。然后现在乘以每个用户，如果我们使用 IP 的标签，你将很快就会有数千或数万个流了。

这个 Cardinality 太高了，这足以让 Loki 挂掉。

当我们谈论 Cardinality 的时候，我们指的是标签和值的组合，以及他们创建的流的数量，高 Cardinality 是指使用具有较大范围的可能值的标签，如 IP，或结合需要其他标签，即使它们有一个小而有限的集合，比如 status_code 和 action。

高 Cardinality 会导致 Loki 建立一个巨大的索引（💰💰💰💰），并将成千上万的微小块存入对象存储中（慢），Loki 目前在这种配置下的性能非常差，运行和使用起来非常不划算的。

### Loki 性能优化

现在我们知道了如果使用大量的标签或有大量值的标签是不好的，那我应该如何查询我的日志呢？如果没有一个数据是有索引的，那么查询不会真的很慢吗？

我们看到使用 Loki 的人习惯了其他重索引的解决方案，他们就觉得需要定义很多标签，才可以有效地查询日志，毕竟很多其他的日志解决方案都是为了索引，这是之前的惯性思维方式。

在使用 Loki 的时候，你可能需要忘记你所知道的东西，看看如何用`并行化`的方式来解决这个问题。Loki 的超强之处在于将查询拆成小块，并行调度，这样你就可以在少量时间内查询大量的日志数据了。

大型索引是非常复杂而昂贵的，通常情况下，你的日志数据的全文索引与日志数据本身的大小相当或更大。要查询你的日志数据，需要加载这个索引，为了性能，可能在内存中，这就非常难扩展了，当你采集了大量的日志时，你的索引就会变得很大。

现在我们来谈谈 Loki，索引通常比你采集的日志量小一个数量级。所以，如果你很好地将你的流保持在最低限度，那么指数的增长和采集的日志相比就非常缓慢了。

Loki 将有效地使你的静态成本尽可能低（索引大小和内存需求以及静态日志存储），并使查询性能可以在运行时通过水平伸缩进行控制。

为了了解是如何工作的，让我们回过头来看看上面我们查询访问日志数据的特定 IP 地址的例子，我们不使用标签来存储 IP，相反，我们使用一个过滤器表达式来查询它。

```bash
{job="apache"} |= "11.11.11.11"
```

在背后 Loki 会将该查询分解成更小的碎片（shards），并为标签匹配的流打开每个块（chunk），并开始查找这个 IP 地址。

这些碎片的大小和并行化的数量是可配置的，并基于你提供的资源。如果你愿意，可以将 shard 间隔配置到 5m，部署20个查询器，并在几秒内处理千兆字节的日志。或者你可以更加疯狂地配置200个查询器，处理 TB 级别的日志！

这种较小的索引和并行查询与较大/较快的全文索引之间的权衡，是让 Loki 相对于其他系统节省成本的原因。操作大型索引的成本和复杂度很高，而且通常是固定的，无论是是否在查询它，你都要一天24小时为它付费。

这种设计的好处是，你可以决定你想拥有多大的查询能力，而且你可以按需变更。查询性能成为你想花多少钱的函数。同时数据被大量压缩并存储在低成本的对象存储中，比如 S3 和 GCS。这就将固定的运营成本降到了最低，同时还能提供难以置信的快速查询能力。

<!--adsense-self-->
