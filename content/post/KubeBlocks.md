---
title: 云原生数据管理平台 KubeBlocks
date: 2024-05-13
tags: ["kubernetes", "KubeBlocks", "数据库", "云原生"]
keywords:
  ["kubernetes", "KubeBlocks", "数据库", "云原生", "Operator", "云原生数据库"]
slug: cloud-native-database-platform-kubeblocks
gitcomment: true
ads: true
category: "kubernetes"
---

[KubeBlocks](https://kubeblocks.io/) 是基于 Kubernetes 的云原生数据基础设施，将顶级云服务提供商的大规模生产经验与增强的可用性和稳定性改进相结合，帮助用户轻松构建容器化、声明式的关系型、NoSQL、流计算和向量型数据库服务。

![KubeBlocks](https://picdn.youdianzhishi.com/images/1729930752185.png)

<!--more-->

## 为什么需要 KubeBlocks？

Kubernetes 已经成为容器编排的事实标准。它利用 ReplicaSet 提供的可扩展性和可用性以及 Deployment 提供的发布和回滚功能来管理日益增加的无状态工作负载。然而，管理有状态工作负载给 Kubernetes 带来了巨大的挑战，尽管 StatefulSet 提供了稳定的持久存储和唯一的网络标识符，但这些功能对于复杂的有状态工作负载来说远远不够。

为了应对这些挑战，并解决复杂性问题，KubeBlocks 引入了 `ReplicationSet` 和 `ConsensusSet`，具备以下能力：

- 基于角色的更新顺序可减少因升级版本、缩放和重新启动而导致的停机时间。
- 维护数据复制的状态，并自动修复复制错误或延迟。

KubeBlocks 具有以下特点：

- 支持多云，与 AWS、GCP、Azure、阿里云等云平台兼容。
- 支持 MySQL、PostgreSQL、Redis、MongoDB、Kafka 等 32 个主流数据库和流计算引擎。
- 提供生产级性能、弹性、可扩展性和可观察性。
- 简化 day-2 操作，例如升级、扩展、监控、备份和恢复。
- 包含强大且直观的命令行工具。
- 仅需几分钟，即可建立一个适用于生产环境的完整数据基础设施。

KubeBlocks 集成生态丰富，已经接入多种主流数据库，包括：

- 关系型数据库：ApeCloud-MySQL（MySQL 集群版）、PostgreSQL（PostgreSQL 主备版）；
- NoSQL 数据库：MongoDB、Redis；
- 图数据库：Nebula（来自社区贡献者）；
- 时序数据库：TDengine、Greptime（来自社区贡献者）；
- 向量数据库：Milvus、Qdrant、Weaviate 等；
- 流数据库：Kafka、Pulsar。

![架构](https://picdn.youdianzhishi.com/images/1715304995211.png)

## 安装

要安装 KubeBlocks 可以使用 Helm 安装，也可以使用 KubeBlocks 提供的 CLI 工具安装，由于 CLI 工具不只是安装，还提供了很多功能，所以我们选择使用 CLI 工具来安装。

直接执行以下命令即可安装 CLI 工具：

```bash
$ curl -fsSL https://kubeblocks.io/installer/install_cli.sh | bash


Your system is darwin_arm64
Installing kbcli ...

Getting the latest kbcli ...
Downloading ...
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 33.3M  100 33.3M    0     0  24.4M      0  0:00:01  0:00:01 --:--:-- 24.5M
Password:
kbcli installed successfully.
kbcli: 0.8.2
Make sure your docker service is running and begin your journey with kbcli:

        kbcli playground init


For more information on how to get started, please visit:
  https://kubeblocks.io
$ kbcli version
kbcli: 0.8.2
```

需要注意的是 `kbcli` 默认安装最新版本，在安装 KubeBlocks 时，kbcli 会安装与之匹配的版本。请确保 kbcli 和 KubeBlocks 的主版本号相匹配。例如，你可以安装 kbcli v0.6.1 和 KubeBlocks v0.6.3。但是，如果安装的是 kbcli v0.5.0 和 KubeBlocks v0.6.0，就可能会报错，因为版本不匹配。

`kbcli` 安装完成后，可以使用 `kbcli` 命令来安装 KubeBlocks。如果你目前没有一个可用的 Kubernetes 集群，那么可以使用 `kbcli` 提供的 Playground 功能来快速创建一个演示环境。直接使用 `kbcli playground init` 命令即可初始化 Playground，该命令会在的容器中创建一个 Kubernetes 集群，然后在 K3d 集群中部署 KubeBlocks 并创建一个 MySQL 单机版集群，演示环境安装完成后就可以尝试 KubeBlocks 的基本功能，包括查看 MySQL 集群、访问 MySQL 集群、观测 MySQL 集群和 MySQL 的高可用性等等。

使用 Playground 创建一个新的 Kubernetes 集群并安装 KubeBlocks，是快速上手的一种方法。然而，在实际生产环境中，情况会复杂得多，应用程序在不同的命名空间中运行，还存在资源或权限限制。所以我们这里将介绍如何在现有的 Kubernetes 集群上部署 KubeBlocks。

当然首先需要准备一个可访问的 Kubernetes 集群，版本要求 1.22 及以上。

环境准备好后，可以使用 `kbcli` 安装 KubeBlocks，执行 `kbcli kubeblocks install` 命令即可安装 KubeBlocks，`kbcli` 默认会将 KubeBlocks 安装在 `kb-system` 命名空间中，如果需要安装到其他命名空间，可以使用 `--namespace` 参数指定。

```bash
kbcli kubeblocks install
```

kbcli 默认安装最新版本，如果想安装 KubeBlocks 的指定版本，可以首先查看可用的版本。

```bash
$ kbcli kubeblocks list-versions
VERSION   RELEASE-NOTES
0.8.3     https://github.com/apecloud/kubeblocks/releases/tag/v0.8.3
0.8.2     https://github.com/apecloud/kubeblocks/releases/tag/v0.8.2
0.8.1     https://github.com/apecloud/kubeblocks/releases/tag/v0.8.1
0.8.0     https://github.com/apecloud/kubeblocks/releases/tag/v0.8.0
0.7.5     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.5
0.7.4     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.4
0.7.3     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.3
0.7.2     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.2
0.7.1     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.1
0.7.0     https://github.com/apecloud/kubeblocks/releases/tag/v0.7.0
```

然后在安装时使用 `--version` 指定版本：

```bash
kbcli kubeblocks install --version=xxxx
```

正常情况下，安装完成后会出现如下所示的一些提示信息：

```bash
$ kbcli kubeblocks install
KubeBlocks will be installed to namespace "kb-system"
Kubernetes version 1.28.7
kbcli version 0.8.2
Collecting data from cluster                       OK
Kubernetes cluster preflight                       OK
  Warn
  - The default storage class was not found. You can use option --set storageClass=<storageClassName> when creating cluster
Create CRDs                                        OK
Add and update repo kubeblocks                     OK
Install KubeBlocks 0.8.2                           OK
Wait for addons to be enabled
  apecloud-mysql                                   OK
  clickhouse                                       OK
  kafka                                            OK
  mongodb                                          OK
  postgresql                                       OK
  pulsar                                           OK
  redis                                            OK
  snapshot-controller                              OK

KubeBlocks 0.8.2 installed to namespace kb-system SUCCESSFULLY!

-> Basic commands for cluster:
    kbcli cluster create -h     # help information about creating a database cluster
    kbcli cluster list          # list all database clusters
    kbcli cluster describe <cluster name>  # get cluster information

-> Uninstall KubeBlocks:
    kbcli kubeblocks uninstall
```

安装完成后我们可以使用如下命令来验证 KubeBlocks 是否安装成功：

```bash
$ kbcli kubeblocks status
KubeBlocks is deployed in namespace: kb-system,version: 0.8.2

KubeBlocks Workloads:
NAMESPACE   KIND         NAME                           READY PODS   CPU(CORES)   MEMORY(BYTES)   CREATED-AT
kb-system   Deployment   kb-addon-snapshot-controller   1/1          N/A          N/A             May 10,2024 10:12 UTC+0800
kb-system   Deployment   kubeblocks                     1/1          N/A          N/A             May 10,2024 10:11 UTC+0800
kb-system   Deployment   kubeblocks-dataprotection      1/1          N/A          N/A             May 10,2024 10:11 UTC+0800

KubeBlocks Addons:
NAME                           STATUS     TYPE   PROVIDER
alertmanager-webhook-adaptor   Disabled   Helm   N/A
apecloud-mysql                 Enabled    Helm   N/A
apecloud-otel-collector        Disabled   Helm   N/A
aws-load-balancer-controller   Disabled   Helm   N/A
bytebase                       Disabled   Helm   N/A
clickhouse                     Enabled    Helm   N/A
csi-driver-nfs                 Disabled   Helm   N/A
csi-hostpath-driver            Disabled   Helm   N/A
csi-s3                         Disabled   Helm   N/A
elasticsearch                  Disabled   Helm   N/A
external-dns                   Disabled   Helm   N/A
fault-chaos-mesh               Disabled   Helm   N/A
foxlake                        Disabled   Helm   N/A
grafana                        Disabled   Helm   N/A
jupyter-hub                    Disabled   Helm   N/A
jupyter-notebook               Disabled   Helm   N/A
kafka                          Enabled    Helm   N/A
kubebench                      Disabled   Helm   N/A
kubeblocks-csi-driver          Disabled   Helm   N/A
llm                            Disabled   Helm   N/A
loki                           Disabled   Helm   N/A
migration                      Disabled   Helm   N/A
milvus                         Disabled   Helm   N/A
minio                          Disabled   Helm   N/A
mongodb                        Enabled    Helm   N/A
mysql                          Disabled   Helm   N/A
nvidia-gpu-exporter            Disabled   Helm   N/A
nyancat                        Disabled   Helm   N/A
oceanbase                      Disabled   Helm   N/A
opensearch                     Disabled   Helm   N/A
polardbx                       Disabled   Helm   N/A
postgresql                     Enabled    Helm   N/A
prometheus                     Disabled   Helm   N/A
pulsar                         Enabled    Helm   N/A
pyroscope-server               Disabled   Helm   N/A
qdrant                         Disabled   Helm   N/A
redis                          Enabled    Helm   N/A
snapshot-controller            Enabled    Helm   N/A
victoria-metrics-agent         Disabled   Helm   N/A
weaviate                       Disabled   Helm   N/A
xinference                     Disabled   Helm   N/A
```

状态查询结果中的 KubeBlocks Workloads 显示了 KubeBlocks 的工作负载，如果都显示已准备就绪，则表明已成功安装了 KubeBlocks。当然我们也可以在 `kb-system` 命名空间中查看 KubeBlocks 的 Pod 资源状态：

```bash
$ kubectl get pods -n kb-system
NAME                                            READY   STATUS    RESTARTS      AGE
kb-addon-snapshot-controller-7bc7cf9dbf-kpmgv   1/1     Running   7 (94m ago)   3h52m
kubeblocks-85ddddddd4-r2gqz                     1/1     Running   2 (96m ago)   3h53m
kubeblocks-dataprotection-7f9c76fb8f-vh7v8      1/1     Running   2 (96m ago)   3h53m
```

到这里 KubeBlocks 就安装完成了，接下来我们就可以使用 KubeBlocks 来创建数据库集群了，例如 MySQL、PostgreSQL、Redis、MongoDB、Kafka 等。

## 管理数据库集群

KubeBlocks 部署完成后，我们就可以使用 `kbcli` 来创建数据库集群了，数据库在 Kubernetes 上以 Pod 的形式运行。比如我们这里以 MySQL 为例，创建一个 MySQL 集群。

### 创建 MySQL 集群

为保持隔离，这里我们创建一个名为 `demo` 的独立命名空间。

```bash
kubectl create namespace demo
```

KubeBlocks 支持创建两种类型的 MySQL 集群：单机版（Standalone）和集群版（RaftGroup）。单机版仅支持一个副本，适用于对可用性要求较低的场景。集群版包含三个副本，适用于对高可用性要求较高的场景。为了确保高可用性，所有的副本都默认分布在不同的节点上。

直接使用下面的命令即可创建一个 MySQL 单机版集群：

```bash
$ kbcli cluster create mysql demo --namespace demo
Info: --version is not specified, ac-mysql-8.0.30 is applied by default.
Cluster demo created
```

创建后可以使用 `kbcli cluster list` 命令查看创建的数据库集群列表：

```bash
$ kbcli cluster list -n demo
NAME   NAMESPACE   CLUSTER-DEFINITION   VERSION           TERMINATION-POLICY   STATUS     CREATED-TIME
demo   demo        apecloud-mysql       ac-mysql-8.0.30   Delete               Creating   May 11,2024 20:15 UTC+0800
```

从上面的输出可以看到，我们创建的 MySQL 集群名称为 `demo`，所属命名空间为 `demo`，使用的集群定义为 `apecloud-mysql`，版本为 `ac-mysql-8.0.30`，状态为 `Creating`。当然我们也可以查看 Pod 的状态：

```bash
$ kubectl get cluster -n demo
NAME   CLUSTER-DEFINITION   VERSION           TERMINATION-POLICY   STATUS     AGE
demo   apecloud-mysql       ac-mysql-8.0.30   Delete               Creating   2m24s
$ kubectl get sts -n demo
NAME         READY   AGE
demo-mysql   0/1     2m
$ kubectl get pods -n demo
NAME           READY   STATUS    RESTARTS   AGE
demo-mysql-0   0/5     Pending   0          79s
```

由于我们并没有配置存储类，所以 Pod 一直处于 Pending 状态，我们可以设置一个默认的 StorageClass 来解决这个问题。

上面创建单机版的 MySQL 集群是 kbcli 内置的集群定义，如果需要创建集群版的 MySQL 集群，可以使用 `--cluster-definition` 参数指定集群定义，比如创建一个 MySQL 集群版，设置副本数为 3，

```bash
$ kbcli cluster create mycluster --cluster-definition=apecloud-mysql --set cpu=0.5,memory=512Mi,storage=10Gi,replicas=3 --set storageClass=nfs-client --namespace demo
Info: --cluster-version is not specified, ClusterVersion ac-mysql-8.0.30 is applied by default
Cluster mycluster created
```

创建后可以使用 `kbcli cluster list` 命令查看创建的数据库集群列表：

```bash
$ kbcli cluster list -n demo
NAME        NAMESPACE   CLUSTER-DEFINITION   VERSION           TERMINATION-POLICY   STATUS     CREATED-TIME
mycluster   demo        apecloud-mysql       ac-mysql-8.0.30   Delete               Creating   May 11,2024 20:34 UTC+0800
```

此外还可以使用 `kbcli cluster describe` 命令查看集群的详细信息：

```bash
$ kbcli cluster  describe mycluster -n demo
Name: mycluster  Created Time: May 11,2024 20:39 UTC+0800
NAMESPACE   CLUSTER-DEFINITION   VERSION           STATUS    TERMINATION-POLICY
demo        apecloud-mysql       ac-mysql-8.0.30   Running   Delete

Endpoints:
COMPONENT   MODE        INTERNAL                                      EXTERNAL
mysql       ReadWrite   mycluster-mysql.demo.svc.cluster.local:3306   <none>

Topology:
COMPONENT   INSTANCE            ROLE       STATUS    AZ       NODE                  CREATED-TIME
mysql       mycluster-mysql-0   follower   Running   <none>   node2/192.168.0.118   May 11,2024 20:39 UTC+0800
mysql       mycluster-mysql-1   follower   Running   <none>   node1/192.168.0.116   May 11,2024 20:39 UTC+0800
mysql       mycluster-mysql-2   leader     Running   <none>   node1/192.168.0.116   May 11,2024 20:39 UTC+0800

Resources Allocation:
COMPONENT   DEDICATED   CPU(REQUEST/LIMIT)   MEMORY(REQUEST/LIMIT)   STORAGE-SIZE   STORAGE-CLASS
mysql       false       500m / 500m          512Mi / 512Mi           data:10Gi      nfs-client

Images:
COMPONENT   TYPE    IMAGE
mysql       mysql   infracreate-registry.cn-zhangjiakou.cr.aliyuncs.com/apecloud/apecloud-mysql-server:8.0.30-5.beta3.20231215.ge77d836.13

Data Protection:
BACKUP-REPO   AUTO-BACKUP   BACKUP-SCHEDULE   BACKUP-METHOD   BACKUP-RETENTION

Show cluster events: kbcli cluster list-events -n demo mycluster
```

从上面的输出可以看到我们创建的 MySQL 集群的详细信息，包括状态、集群的访问地址等，Topology 显示了集群的拓扑结构，Resources Allocation 显示了集群的资源分配情况，Images 显示了集群使用的镜像，Data Protection 显示了集群的数据保护情况。

此外还可以使用 `kbcli cluster list-events` 命令查看集群的 Events 事件：

```bash
$ kbcli cluster list-events -n demo mycluster
# ......
demo        May 11,2024 20:42 UTC+0800   Normal    Pulled                     Instance/mycluster-mysql-1   Successfully pulled image "infracreate-registry.cn-zhangjiakou.cr.aliyuncs.com/apecloud/apecloud-mysql-scale:0.2.6" in 725ms (1m42.223s including waiting)
demo        May 11,2024 20:42 UTC+0800   Normal    Started                    Instance/mycluster-mysql-1   Started container config-manager
demo        May 11,2024 20:42 UTC+0800   Normal    Pulled                     Instance/mycluster-mysql-1   Container image "infracreate-registry.cn-zhangjiakou.cr.aliyuncs.com/apecloud/kubeblocks-tools:0.8.2" already present on machine
demo        May 11,2024 20:42 UTC+0800   Normal    Started                    Instance/mycluster-mysql-1   Started container lorry
demo        May 11,2024 20:42 UTC+0800   Normal    checkRole                  Instance/mycluster-mysql-0   {"event":"Success","operation":"checkRole","originalRole":"","role":"Follower"}
demo        May 11,2024 20:42 UTC+0800   Normal    checkRole                  Instance/mycluster-mysql-2   {"event":"Success","operation":"checkRole","originalRole":"","role":"Leader"}
demo        May 11,2024 20:42 UTC+0800   Normal    checkRole                  Instance/mycluster-mysql-1   {"event":"Success","operation":"checkRole","originalRole":"","role":"Follower"}
demo        May 11,2024 20:42 UTC+0800   Normal    ComponentPhaseTransition   Cluster/mycluster            component is Running
demo        May 11,2024 20:42 UTC+0800   Normal    AllReplicasReady           Cluster/mycluster            all pods of components are ready, waiting for the probe detection successful
demo        May 11,2024 20:42 UTC+0800   Normal    ClusterReady               Cluster/mycluster            Cluster: mycluster is ready, current phase is Running
demo        May 11,2024 20:42 UTC+0800   Normal    Running                    Cluster/mycluster            Cluster: mycluster is ready, current phase is Running
```

通过这些 Events 事件可以查看集群的创建过程，以及集群的状态变化，如果有问题也可以根据 Events 事件来排查问题。从上面的输出可以看到我们的 MySQL 集群已经创建成功，状态为 Running。

我们也可以查看集群的 Pod 状态：

```bash
$ kubectl get pods -n demo
NAME                READY   STATUS    RESTARTS   AGE
mycluster-mysql-0   5/5     Running   0          7m44s
mycluster-mysql-1   5/5     Running   0          7m44s
mycluster-mysql-2   5/5     Running   0          7m44s
```

### 连接 MySQL 集群

接下来我们就可以连接到 MySQL 集群中，进行一些操作了。我们这里可以使用 `kbcli` 提供的 `cluster connect` 命令来连接到 MySQL 集群中：

```bash
$ kbcli cluster connect mycluster  --namespace demo
Connect to instance mycluster-mysql-2: out of mycluster-mysql-2(leader), mycluster-mysql-0(follower), mycluster-mysql-1(follower)
Defaulted container "mysql" out of: mysql, metrics, vttablet, lorry, config-manager
mysql: [Warning] Using a password on the command line interface can be insecure.
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 46
Server version: 8.0.30 WeSQL Server - GPL, Release 5, Revision e77d836

Copyright (c) 2000, 2022, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql>
```

> `cluster connect` 的底层命令是 `kubectl exec`，只要能够访问 K8s APIServer，就可以使用该命令。

比如现在我们在 MySQL 集群中创建一个数据库：

```bash
mysql> USE mydb
Database changed
mysql> CREATE TABLE students (
    student_id INT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    birthday DATE NOT NULL,
    major VARCHAR(50) NOT NULL,
    grade INT NOT NULL
);
Query OK, 0 rows affected (0.06 sec)

mysql> INSERT INTO
    students (student_id, name, gender, birthday, major, grade)
    VALUES
    (1, 'John Smith', 'Male', '2001-01-01', 'Computer Science and Technology', 2020),
    (2, 'Emily Brown', 'Female', '2002-02-15', 'Software Engineering', 2021),
    (3, 'Michael Johnson', 'Male', '2003-03-26', 'Information Security', 2022);
Query OK, 3 rows affected (0.08 sec)
Records: 3  Duplicates: 0  Warnings: 0

mysql> SELECT * FROM students;
+------------+-----------------+--------+------------+---------------------------------+-------+
| student_id | name            | gender | birthday   | major                           | grade |
+------------+-----------------+--------+------------+---------------------------------+-------+
|          1 | John Smith      | Male   | 2001-01-01 | Computer Science and Technology |  2020 |
|          2 | Emily Brown     | Female | 2002-02-15 | Software Engineering            |  2021 |
|          3 | Michael Johnson | Male   | 2003-03-26 | Information Security            |  2022 |
+------------+-----------------+--------+------------+---------------------------------+-------+
3 rows in set (0.00 sec)
mysql> exit
```

到这里我们就成功创建了一个 MySQL 集群，并在集群中创建了一个数据库，插入了一些数据。

当然除了使用 `kbcli cluster connect` 命令连接到 MySQL 集群，我们也可以使用 `kubectl exec` 命令进入 Pod 并连接到数据库。KubeBlocks operator 会创建一个名为 `mycluster-conn-credential` 的新的 Secret 来存储 MySQL 集群的连接凭证。该 Secret 包含以下 key：

- username：MySQL 集群的根用户名。
- password：根用户的密码。
- port：MySQL 集群的端口。
- host：MySQL 集群的主机。
- endpoint：MySQL 集群的终端节点，与 `host:port` 相同。

我们可以使用下面的命令获取用于 `kubectl exec` 命令的 `username` 和 `password`：

```bash
$ kubectl get secrets -n demo mycluster-conn-credential -o jsonpath='{.data.username}' | base64 -d
root
$ kubectl get secrets -n demo mycluster-conn-credential -o jsonpath='{.data.password}' | base64 -d
zcw4p54l
```

然后就可以使用用户名和密码，进入 Pod 并连接到数据库。

```bash
$ kubectl exec -ti -n demo mycluster-mysql-0 -- bash
Defaulted container "mysql" out of: mysql, metrics, vttablet, lorry, config-manager
[root@mycluster-mysql-0 /]# mysql -uroot -pzcw4p54l
mysql: [Warning] Using a password on the command line interface can be insecure.
Welcome to the MySQL monitor.  Commands end with ; or \g.
Your MySQL connection id is 2625
Server version: 8.0.30 WeSQL Server - GPL, Release 5, Revision e77d836

Copyright (c) 2000, 2022, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or '\h' for help. Type '\c' to clear the current input statement.

mysql> use mydb;
Reading table information for completion of table and column names
You can turn off this feature to get a quicker startup with -A

Database changed
mysql> SELECT * FROM students;
+------------+-----------------+--------+------------+---------------------------------+-------+
| student_id | name            | gender | birthday   | major                           | grade |
+------------+-----------------+--------+------------+---------------------------------+-------+
|          1 | John Smith      | Male   | 2001-01-01 | Computer Science and Technology |  2020 |
|          2 | Emily Brown     | Female | 2002-02-15 | Software Engineering            |  2021 |
|          3 | Michael Johnson | Male   | 2003-03-26 | Information Security            |  2022 |
+------------+-----------------+--------+------------+---------------------------------+-------+
3 rows in set (0.00 sec)

mysql>
```

如果在本地计算机上安装了 MySQL 客户端，我们同样可以使用 `kubectl port-forward` 来进行端口转发，然后连接到数据库，当然也可以通过一些网关服务（比如 higress）来暴露数据库服务。

### 扩展

前面我们创建的 MySQL 集群配置了集群的 CPU、内存、存储等，当资源不足的时候，我们还可以使用 `kbcli cluster vscale` 命令来进行垂直扩展，比如我们将 MySQL 集群的 CPU 和内存都扩展为 1 核 1GB，使用如下命令：

```bash
$ kkbcli cluster vscale mycluster --components=mysql --cpu 1000m --memory 1Gi -n demo
Please type the name again(separate with white space when more than one): mycluster
OpsRequest mycluster-verticalscaling-7zhf2 created successfully, you can view the progress:
        kbcli cluster describe-ops mycluster-verticalscaling-7zhf2 -n demo
```

> 在垂直扩容时，所有的 Pod 将按照 `Learner -> Follower -> Leader` 的顺序重启。重启后，主节点可能会发生变化。

然后可以使用上面提示的 `kbcli cluster describe-ops` 命令查看垂直扩展的进度：

```bash
$ kbcli cluster describe-ops mycluster-verticalscaling-7zhf2 -n demo
Spec:
  Name: mycluster-verticalscaling-7zhf2 NameSpace: demo Cluster: mycluster      Type: VerticalScaling

Command:
  kbcli cluster vscale mycluster --components=mysql --cpu=1 --memory=1Gi --namespace=demo

Last Configuration:
COMPONENT   REQUEST-CPU   REQUEST-MEMORY   LIMIT-CPU   LIMIT-MEMORY
mysql       500m          512Mi            500m        512Mi

Status:
  Start Time:         May 12,2024 07:26 UTC+0800
  Duration:           45s
  Status:             Running
  Progress:           0/3
                      OBJECT-KEY              STATUS       DURATION    MESSAGE
                      Pod/mycluster-mysql-0   Processing   45s         Start to vertical scale: Pod/mycluster-mysql-0 in Component: mysql
                      Pod/mycluster-mysql-2   Pending      <Unknown>
                      Pod/mycluster-mysql-1   Pending      <Unknown>

Conditions:
LAST-TRANSITION-TIME         TYPE                 REASON                     STATUS   MESSAGE
May 12,2024 07:26 UTC+0800   WaitForProgressing   WaitForProgressing         True     wait for the controller to process the OpsRequest: mycluster-verticalscaling-7zhf2 in Cluster: mycluster
May 12,2024 07:26 UTC+0800   Validated            ValidateOpsRequestPassed   True     OpsRequest: mycluster-verticalscaling-7zhf2 is validated
May 12,2024 07:26 UTC+0800   VerticalScaling      VerticalScalingStarted     True     Start to vertical scale resources in Cluster: mycluster

Warning Events: <none>
```

我们还可以使用 `cluster list-ops` 命令查看这些运维操作的状态：

```bash
$ kbcli cluster list-ops --status all -n demo
NAME                              NAMESPACE   TYPE              CLUSTER     COMPONENT   STATUS    PROGRESS   CREATED-TIME
mycluster-verticalscaling-7zhf2   demo        VerticalScaling   mycluster   mysql       Succeed   3/3        May 12,2024 07:26 UTC+0800
```

从上面的输出可以看到垂直扩展操作已经成功完成，我们也可以从 `kbcli cluster describe` 命令中查看集群的资源分配情况：

```bash
$ kbcli cluster describe mycluster -n demo
# ......
Resources Allocation:
COMPONENT   DEDICATED   CPU(REQUEST/LIMIT)   MEMORY(REQUEST/LIMIT)   STORAGE-SIZE   STORAGE-CLASS
mysql       false       1 / 1                1Gi / 1Gi               data:10Gi      nfs-client

# ......
```

同样除了可以使用 `kbcli cluster vscale` 命令进行垂直扩展，我们还可以创建一个 `OpsRequest` 的 CRD 对象来实现该运维操作，如下所示：

> `OpsRequest` 是 KubeBlocks 提供的一种资源对象，用于描述运维操作，比如垂直扩展、水平扩展、配置更新等。

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: OpsRequest
metadata:
  name: ops-vertical-scaling
  namespace: demo
spec:
  clusterRef: mycluster
  type: VerticalScaling
  verticalScaling:
    - componentName: mysql
      requests:
        memory: "1Gi"
        cpu: "1000m"
      limits:
        memory: "2Gi"
        cpu: "2000m"
```

另外我还可以直接修改 `Cluster` 对象的 `spec.componentSpecs.resources` 字段来实现垂直扩展，如下所示：

> `spec.componentSpecs.resources` 控制资源需求和相关限制，更改配置将触发垂直扩容。

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: Cluster
metadata:
  name: mysql-cluster
  namespace: demo
spec:
  clusterDefinitionRef: apecloud-mysql
  clusterVersionRef: ac-mysql-8.0.30
  componentSpecs:
    - name: mysql
      componentDefRef: mysql
      replicas: 3
      resources: # 修改资源值
        requests:
          memory: "1Gi"
          cpu: "1"
        limits:
          memory: "1Gi"
          cpu: "1"
      volumeClaimTemplates:
        - name: data
          spec:
            accessModes:
              - ReadWriteOnce
            resources:
              requests:
                storage: 1Gi
            storageClassName: nfs-client
  terminationPolicy: Delete
```

当然除了垂直扩展，我们还可以使用 `kbcli cluster hscale` 命令来进行水平扩展，比如我们将 MySQL 集群的副本数从 3 扩展到 5，扩容过程包括数据的备份和恢复。

```bash
kbcli cluster hscale mycluster --components="mysql" --replicas=5 -n demo
```

同样可以使用 `OpsRequest` 对象或者编辑 `Cluster` 对象来实现水平扩展操作，如下所示：

```yaml
apiVersion: apps.kubeblocks.io/v1alpha1
kind: OpsRequest
metadata:
  name: ops-horizontal-scaling
  namespace: demo
spec:
  clusterRef: mycluster
  type: HorizontalScaling
  horizontalScaling:
    - componentName: mysql
      replicas: 3
```

### 配置更新

我们知道 MySQL 集群本身有很多配置参数，比如 `max_connections`、`innodb_buffer_pool_size`、`innodb_log_file_size` 等等，在实际应用中，我们可能需要根据业务需求来调整这些配置参数。KubeBlocks 中同样提供了一些命令来更新集群的配置参数，比如我们需要将 `max_connections` 参数修改为 2000。

首先可以使用 `kbcli cluster describe-config` 命令查看集群的配置参数：

```bash
$ kbcli cluster describe-config mycluster --show-detail -n demo | grep max_connections=
max_connections=83
```

可以看到默认的 `max_connections` 参数为 83，然后我们可以使用 `kbcli cluster configure` 命令来更新集群的配置参数：

```bash
$ kbcli cluster configure mycluster --set max_connections=2000 -n demo
Will updated configure file meta:
  ConfigSpec: mysql-consensusset-config   ConfigFile: my.cnf    ComponentName:  ClusterName: mycluster
OpsRequest mycluster-reconfiguring-bb6l8 created successfully, you can view the progress:
        kbcli cluster describe-ops mycluster-reconfiguring-bb6l8 -n demo
$ kbcli cluster describe-ops mycluster-reconfiguring-bb6l8 -n demo
Spec:
  Name: mycluster-reconfiguring-bb6l8   NameSpace: demo Cluster: mycluster      Type: Reconfiguring

Command:
  kbcli cluster configure mycluster --components=mysql --config-spec=mysql-consensusset-config --config-file=my.cnf --set max_connections=2000 --namespace=demo

Status:
  Start Time:         May 12,2024 07:44 UTC+0800
  Completion Time:    May 12,2024 07:44 UTC+0800
  Duration:           30s
  Status:             Succeed
  Progress:           3/3
                      OBJECT-KEY   STATUS   DURATION   MESSAGE

Conditions:
LAST-TRANSITION-TIME         TYPE                 REASON                            STATUS   MESSAGE
May 12,2024 07:44 UTC+0800   WaitForProgressing   WaitForProgressing                True     wait for the controller to process the OpsRequest: mycluster-reconfiguring-bb6l8 in Cluster: mycluster
May 12,2024 07:44 UTC+0800   Validated            ValidateOpsRequestPassed          True     OpsRequest: mycluster-reconfiguring-bb6l8 is validated
May 12,2024 07:44 UTC+0800   Reconfigure          ReconfigureStarted                True     Start to reconfigure in Cluster: mycluster, Component: mysql
May 12,2024 07:44 UTC+0800   Succeed              OpsRequestProcessedSuccessfully   True     Successfully processed the OpsRequest: mycluster-reconfiguring-bb6l8 in Cluster: mycluster

Warning Events: <none>
```

配置更新操作已经成功完成，我们再次查看集群的配置参数正常就可以看到 `max_connections` 参数已经更新为 2000：

```bash
$ kbcli cluster describe-config mycluster --show-detail -n demo | grep max_connections=
max_connections=2000
```

### 备份

KubeBlocks 还提供备份恢复功能，以确保数据的安全性和可靠性。KubeBlocks 采用物理备份的方式，将数据库中的物理文件作为备份对象。你可以根据实际需求，选择对应的方式按需或定时备份集群数据。

- 按需备份：根据不同的备份选项，按需备份可以进一步分为备份工具备份和快照备份两种。
  - 备份工具备份：可使用数据库产品的备份工具，如 MySQL XtraBackup 和 PostgreSQL pg_basebackup。KubeBlocks 支持为不同的数据产品配置备份工具。
  - 快照备份：如果你的数据存储在支持快照的云盘中，你可以通过快照创建数据备份。快照备份通常比备份工具备份更快，因此推荐使用。
- 定时备份：可指定保留时间、备份方法、时间等参数来自定义备份设置。

KubeBlocks 的备份恢复功能依赖于 `BackupRepo`，在使用完整的备份恢复功能之前，首先需要配置 `BackupRepo`。`BackupRepo` 是备份数据的存储仓库，支持配置 OSS（阿里云对象存储）、S3（亚马逊对象存储）、COS（腾讯云对象存储）、GCS（谷歌云对象存储）、OBS（华为云对象存储）、MinIO 等兼容 S3 协议的对象存储作为备份仓库，同时支持 K8s 原生的 PVC 作为备份仓库。

用户可以创建多个 `BackupRepo` 以适应不同的场景。例如，根据不同的业务需求，可以把业务 A 的数据存储在 A 仓库，把业务 B 的数据存储在 B 仓库，或者可以按地区配置多个仓库以实现异地容灾。在创建备份时，你需要指定备份仓库。你也可以创建一个默认的备份仓库，如果在创建备份时未指定具体的仓库，KubeBlocks 将使用此默认仓库来存储备份数据。

如果你没有使用云厂商的对象存储，可在 Kubernetes 中部署开源服务 MinIO，用它来配置 BackupRepo。如果你正在使用云厂商提供的对象存储服务，可以直接使用。我们这里可以使用 MinIO 来配置一个 BackupRepo，先在 `kb-system` 命名空间中安装 MinIO。

```bash
helm repo add kubeblocks-apps https://jihulab.com/api/v4/projects/152630/packages/helm/stable
helm upgrade --install minio kubeblocks-apps/minio --namespace kb-system --create-namespace --set "extraEnvVars[0].name=MINIO_BROWSER_LOGIN_ANIMATION" --set "extraEnvVars[0].value=off" --set persistence.storageClass=nfs-client --set replicas=1 --set resources.requests.memory=1Gi --set rootUser=root --set rootPassword=12345678 --set mode=standalone
```

安装完成后然后执行 `kubectl port-forward --namespace kb-system svc/minio-console 9001:9001` 命令暴露 MinIO 服务，访问 `127.0.0.1:9001` 进入登录页面，使用上面的 `root:12345678` 进行登录，登录到仪表盘后，生成 `access key` 和 `secret key`。

![生成 AK](https://picdn.youdianzhishi.com/images/1715474339144.png)

然后在 MinIO 仪表盘上创建一个名为 `test-minio` 的存储桶。

![创建 Bucket](https://picdn.youdianzhishi.com/images/1715474410462.png)

> 安装的 MinIO 的访问地址为 `http://minio.kb-system.svc.cluster.local:9000`，用于配置 `BackupRepo`。

准备好对象存储服务后，就可以配置 `BackupRepo` 了。KubeBlocks 提供两种配置方式：

- 安装 KubeBlocks 时自动配置 `BackupRepo`；
- 按需手动配置 BackupRepo。

由于我们在安装 KubeBlocks 时没有配置 `BackupRepo` 信息，所以这里我们使用手动配置的方式。我们可以使用 `kbcli backuprepo create` 命令来创建一个名为 `my-repo` 的 `BackupRepo`，如下所示：

```bash
kbcli backuprepo create myrepo \
  --provider minio \
  --endpoint http://minio.kb-system.svc.cluster.local:9000 \
  --bucket test-minio \
  --access-key-id <ACCESS KEY> \  # 上面创建的
  --secret-access-key <SECRET KEY> \
  --access-method Tool \
  --default
```

以上命令会创建了一个名为 `myrepo` 的默认备份仓库。`--default` 表示该仓库是默认仓库，全局只能有一个默认仓库，如果系统中存在多个默认仓库，KubeBlocks 无法选出应该使用哪个仓库，会导致备份失败。`--provider` 参数对应后端存储类型，即 `storageProvider`，可选值为 `s3`、`cos`、`gcs-s3comp`、`obs`、`oss`、`minio`、`ftp`、`nfs`。不同存储所需的命令行参数不同，可以通过 `kbcli backuprepo create --provider STORAGE-PROVIDER-NAME -h` 命令查看参数信息（注意 `--provider` 参数是必需的），其他参数就是对应的存储配置信息。

`kbcli backuprepo create` 命令执行成功后，就会在系统中创建一个类型为 `BackupRepo` 的 K8s 资源，查看 `BackupRepo` 及其状态。 如果 STATUS 为 Ready，说明 `BackupRepo` 已经准备就绪。

```bash
$ kbcli backuprepo list
NAME     STATUS   STORAGE-PROVIDER   ACCESS-METHOD   DEFAULT   BACKUPS   TOTAL-SIZE
myrepo   Ready    minio              Tool            true      0         0 B
```

使用 kubectl 同样可以配置 `BackupRepo`，但相比使用 kbcli，会缺少参数校验和默认仓库检查，推荐使用 kbcli。

```bash
# 创建 secret，保存 MinIO 的访问 AK
kubectl create secret generic minio-credential-for-backuprepo \
  -n kb-system \
  --from-literal=accessKeyId=<ACCESS KEY> \
  --from-literal=secretAccessKey=<SECRET KEY>

# 创建 BackupRepo 资源
kubectl apply -f - <<-'EOF'
apiVersion: dataprotection.kubeblocks.io/v1alpha1
kind: BackupRepo
metadata:
  name: myrepo
  annotations:
    dataprotection.kubeblocks.io/is-default-repo: "true"
spec:
  storageProviderRef: minio
  accessMethod: Tool
  pvReclaimPolicy: Retain
  volumeCapacity: 100Gi
  config:
    bucket: test-kb-backup
    mountOptions: ""
    endpoint: <ip:port>
  credential:
    name: minio-credential-for-backuprepo
    namespace: kb-system
EOF
```

使用 KubeBlocks 创建数据库集群后，对于支持备份的数据库，会自动为其创建一个备份策略（BackupPolicy），可以执行如下命令查看集群的备份策略：

```bash
$ kbcli cluster list-backup-policy mycluster -n demo
NAME                                   NAMESPACE   DEFAULT   CLUSTER     CREATE-TIME                  STATUS
mycluster-mysql-backup-policy          demo        true      mycluster   May 11,2024 20:39 UTC+0800   Available
mycluster-mysql-backup-policy-hscale   demo        false     mycluster   May 11,2024 20:39 UTC+0800   Available
```

备份策略中包含了该集群支持的备份方法，执行以下命令进行查看备份方法：

```bash
$ kbcli cluster describe-backup-policy mycluster -n demo
Summary:
  Name:               mycluster-mysql-backup-policy
  Cluster:            mycluster
  Namespace:          demo
  Default:            true

Backup Methods:
NAME              ACTIONSET                           SNAPSHOT-VOLUMES
xtrabackup        xtrabackup-for-apecloud-mysql       false
volume-snapshot   volumesnapshot-for-apecloud-mysql   true
```

对于 MySQL 集群而言，默认支持两种备份方法：`xtrabackup` 和 `volume-snapshot`，前者使用备份工具 `xtrabackup` 将 MySQL 数据备份至对象存储中；后者则使用云存储的卷快照能力，通过快照方式对数据进行备份。创建备份时，可以指定要使用哪种备份方法进行备份。

比如我们要使用 `xtrabackup` 备份方法，则可以使用 `kbcli cluster backup` 命令来备份 MySQL 集群：

```bash
$ kbcli cluster backup mycluster --name mybackup --method xtrabackup -n demo
Backup mybackup created successfully, you can view the progress:
        kbcli cluster list-backups --name=mybackup -n demo
```

备份完成后，可以使用 `kbcli cluster list-backups` 命令查看备份的状态：

```bash
$ kbcli cluster list-backups --name=mybackup -n demo
NAME       NAMESPACE   SOURCE-CLUSTER   METHOD       STATUS      TOTAL-SIZE   DURATION   CREATE-TIME                  COMPLETION-TIME              EXPIRATION
mybackup   demo        mycluster        xtrabackup   Completed   4645133      59s        May 12,2024 08:55 UTC+0800   May 12,2024 08:56 UTC+0800
```

备份完成后我们就可以在 MinIO 仪表盘上看到备份的数据。

![备份数据](https://picdn.youdianzhishi.com/images/1715475552673.png)

如果想要使用云存储的卷快照能力，只需将 kbcli 命令中的 `--method` 参数设置为 `volume-snapshot` 即可。

```bash
$ kbcli cluster backup mycluster --name mybackup2 --method volume-snapshot -n demo
Backup mybackup2 created successfully, you can view the progress:
        kbcli cluster list-backups --name=mybackup2 -n demo
$ kbcli cluster list-backups --name=mybackup2 -n demo
NAME        NAMESPACE   SOURCE-CLUSTER   METHOD            STATUS   TOTAL-SIZE   DURATION   CREATE-TIME                  COMPLETION-TIME   EXPIRATION
mybackup2   demo        mycluster        volume-snapshot   Failed                           May 12,2024 08:56 UTC+0800
```

但是需要注意使用云盘快照创建备份时，请确保使用的存储支持快照功能，否则会导致备份失败。

```bash
$ kubectl describe backup mybackup2 -n demo
Name:         mybackup2
Namespace:    demo
# ......
Events:
  Type     Reason               Age   From               Message
  ----     ------               ----  ----               -------
  Warning  FailedCreatedBackup  30s   backup-controller  Creating backup failed, error: cannot find any VolumeSnapshotClass of persistentVolumeClaim "data-mycluster-mysql-0" to do volume snapshot on pod "mycluster-mysql-0"
(base) ➜  k8strain5 kbcli cluster list-backups --name=mybackup -n demo
NAME       NAMESPACE   SOURCE-CLUSTER   METHOD       STATUS      TOTAL-SIZE   DURATION   CREATE-TIME                  COMPLETION-TIME              EXPIRATION
mybackup   demo        mycluster        xtrabackup   Completed   4645133      59s        May 12,2024 08:55 UTC+0800   May 12,2024 08:56 UTC+0800
```

上面我们是按需进行手动备份的，此外 KubeBlocks 还支持为集群配置自动备份。我们可以使用下面的 kbcli 命令配置集群自动备份：

```bash
kbcli cluster update mycluster --backup-enabled=true \
--backup-method=xtrabackup --backup-repo-name=myrepo \
--backup-retention-period=7d --backup-cron-expression="0 18 * * *" -n demo
```

上面的命令中，我们使用了 `kbcli cluster update` 命令来更新集群的配置，其中的参数含义如下：

- `--backup-enabled` 表示是否开启自动备份。
- `--backup-method` 指定备份方法。支持的备份方法可以执行 `kbcli cluster describe-backup-policy mycluster -n demo` 命令查看。
- `--backup-repo-name` 指定备份仓库的名称。
- `--backup-retention-period` 指定备份保留时长，以上示例中为 7 天。
- `--backup-cron-expression` 指定自动备份的备份周期。表达式格式与 linux 系统中的定时任务保持一致，时区为 UTC。

开启自动备份后，可以执行如下命令查看是否有 CronJob 对象被创建：

```bash
$ kubectl get cronjob -n demo
NAME                                 SCHEDULE     SUSPEND   ACTIVE   LAST SCHEDULE   AGE
d665381d-mycluster-demo-xtrabackup   0 18 * * *   False     0        <none>          9s
```

也可以执行如下命令，查看集群信息，其中 `Data Protection:` 部分会显示自动备份的配置信息。

```bash
$ kbcli cluster describe mycluster -n demo
# ......

Data Protection:
BACKUP-REPO   AUTO-BACKUP   BACKUP-SCHEDULE   BACKUP-METHOD   BACKUP-RETENTION
myrepo        Enabled       0 18 * * *        xtrabackup      7d

Show cluster events: kbcli cluster list-events -n demo mycluster
```

### 恢复

上面我们已经介绍了如何备份 MySQL 集群，接下来我们就可以使用备份数据来恢复集群。

首先我们可以使用 `kbcli cluster restore` 命令从 Backup 中恢复一个新的集群，如下所示：

```bash
$ kbcli cluster list-backups -n demo
NAME       NAMESPACE   SOURCE-CLUSTER   METHOD       STATUS      TOTAL-SIZE   DURATION   CREATE-TIME                  COMPLETION-TIME              EXPIRATION
mybackup   demo        mycluster        xtrabackup   Completed   4645133      59s        May 12,2024 08:55 UTC+0800   May 12,2024 08:56 UTC+0800
$ kbcli cluster restore new-cluster --backup mybackup -n demo
Cluster new-cluster created
```

恢复后我们可以校验新集群的数据是否和原集群一致，如果一致则说明恢复成功。

```bash
$ kbcli cluster connect new-cluster -n demo
Connect to instance new-cluster-mysql-1: out of new-cluster-mysql-1(leader), new-cluster-mysql-0(follower), new-cluster-mysql-2(follower)
mysql: [Warning] Using a password on the command line interface can be insecure.
Welcome to the MySQL monitor.  Commands end with ; or g.
Your MySQL connection id is 9961
Server version: 8.0.30 WeSQL Server - GPL, Release 5, Revision 28f261a

Copyright (c) 2000, 2022, Oracle and/or its affiliates.

Oracle is a registered trademark of Oracle Corporation and/or its
affiliates. Other names may be trademarks of their respective
owners.

Type 'help;' or 'h' for help. Type 'c' to clear the current input statement.
mysql> USE mydb
mysql> SELECT * FROM students;
+------------+-----------------+--------+------------+---------------------------------+-------+
| student_id | name            | gender | birthday   | major                           | grade |
+------------+-----------------+--------+------------+---------------------------------+-------+
|          1 | John Smith      | Male   | 2001-01-01 | Computer Science and Technology |  2020 |
|          2 | Emily Brown     | Female | 2002-02-15 | Software Engineering            |  2021 |
|          3 | Michael Johnson | Male   | 2003-03-26 | Information Security            |  2022 |
+------------+-----------------+--------+------------+---------------------------------+-------+
3 rows in set (0.00 sec)
mysql> exit
Bye
```

到这里我们就完成了 MySQL 集群的备份和恢复操作。

除此之外 KubeBlocks 还提供了强大的可观测性能力，你可以实时观察数据库的健康状态，及时跟踪数据库，并优化数据库性能。KubeBlocks 以引擎形式集成了许多开源监控组件，如 Prometheus、AlertManager 和 Grafana，并采用定制的 `apecloud-otel-collector` 组件收集数据库和宿主机的监控指标。

> 参考链接：https://kubeblocks.io/docs/preview/user_docs/overview/introduction
