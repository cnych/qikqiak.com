---
title: 360 开源 K8S Dashboard Wayne 的安装使用
date: 2018-11-19
tags: ["kubernetes", "wayne"]
slug: kubernetes-dashboard-wayne-usage
keywords: ["kubernetes", "360", "开源", "dashboard", "wayne"]
gitcomment: true
bigimg: [{src: "/img/posts/photo-1542481889-27404a7ec14a.jpeg", desc: "church of St. John of Nepomuk in Ranui, Italy"}]
category: "kubernetes"
---

`Kubernetes` 官方本身就提供了一个管理集群的 Dashboard 插件，但是官方的 Dashboard 插件还是有一些局限性，近日360开源了内部使用的 Kubernetes Dashboard 插件：[Wayne](https://github.com/Qihoo360/wayne/)。 `Wayne` 是一个通用的、基于 Web 的 Kubernetes 多集群管理平台。通过可视化 Kubernetes 对象模板编辑的方式，降低业务接入成本， 拥有完整的权限管理系统，适应多租户场景，是一款适合企业级集群使用的发布平台。

<!--more-->

Wayne 已大规模服务于 360 搜索，承载了公司绝大部分业务，稳定管理了上万个容器。

> 命名的起源：360 搜索私有云团队多数项目命名都来源于 DC 漫画的角色，Wayne 也不例外，Wayne 是声名显赫的超级英雄蝙蝠侠 Bruce Wayne 的名字。


## 架构图
整体采用前后端分离的方案，其中前端采用 Angular 框架进行数据交互和展示，使用Ace编辑器进行 Kubernetes 资源模版编辑。后端采用 Beego 框架做数据接口处理，使用 Client-go 与 Kubernetes 进行交互，数据使用 MySQL 存储。

![架构图](https://raw.githubusercontent.com/wiki/Qihoo360/wayne/image/architecture.png)

## 特性
* 基于 RBAC（Role based access control）的权限管理：用户通过角色与部门和项目关联，拥有部门角色允许操作部门资源，拥有项目角色允许操作项目资源，更加适合多租户场景。
* 简化 k8s 对象创建：提供基础 k8s 对象配置文件添加方式，同时支持高级模式直接编辑 Json/Yaml文件创建 k8s 对象。
* LDAP/OAuth 2.0/DB 多种登录模式支持：集成企业级 LDAP 登录及 DB 登录模式，同时还可以实现 OAuth2 登录。
* 支持多集群、多租户：可以同时管理多个 Kubernetes 集群，并针对性添加特定配置，更方便的多集群、多租户管理。
* 提供完整审计模块：每次操作都会有完整的审计功能，追踪用于操作历史，同时支持用户自定义 webhook。
* 提供基于 APIKey 的开放接口调用：用户可自主申请相关 APIKey 并管理自己的部门和项目，运维人员也可以申请全局 APIKey 进行特定资源的全局管理。
* 保留完整的发布历史：用户可以便捷的找到任何一次历史发布，并可轻松进行回滚，以及基于特定历史版本更新 k8s 资源。
* 具备完善的资源报表：用户可以轻松获取各项目的资源使用占比和历史上线频次（天级）以及其他基础数据的报表和图表。
* 提供基于严密权限校验的 web shell：用户可以通过 web shell 的形式进入发布的 Pod 进行操作，自带完整的权限校验。
* 提供站内通知系统：方便管理员推送集群、业务通知和故障处理报告等。

## 组件
* Web UI: 提供完整的业务开发和平台运维功能体验。
* Worker: 扩展一系列基于消息队列的功能，例如 audit 和 webhook 等审计组件。

## 安装
Wayne 依赖 MySQL 和 RabbitMQ，其中 MySQL 是必须的服务，用户存储系统的各种数据，RabbitMQ 是可选的，主要用户扩展审计功能使用。

### 数据库服务
首先部署 MySQL 服务，如果你系统中有一个可访问的 MySQL 服务的话就可以跳过这一步，我们这里在 Kubernetes 集群中部署一个简单的 MySQL 服务，对应的资源清单文件如下：(db.yaml)
```yaml
apiVersion: apps/v1beta1
kind: Deployment
metadata:
  name: mysql
  namespace: kube-system
  labels:
    app: mysql
spec:
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:5.7.14
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3306
          name: dbport
        env:
        - name: MYSQL_ROOT_PASSWORD
          value: rootPassw0rd
        volumeMounts:
        - name: db
          mountPath: /var/lib/mysql
      volumes:
      - name: db
        emptyDir: {}

---
apiVersion: v1
kind: Service
metadata:
  name: mysql
  namespace: kube-system
spec:
  selector:
    app: mysql
  ports:
  - name: mysqlport
    protocol: TCP
    port: 3306
    targetPort: dbport
```

通过环境变量添加了数据库 root 用户密码（不需要提前创建`wayne`数据库），不过需要注意的是我们这里并没有对数据进行持久化，如果需要的话一定要记得做数据的持久化，避免数据丢失。创建上面的资源对象：

```shell
$ kubec create -f db.yaml
$ kubectl get pods -n kube-system
NAME                                          READY     STATUS             RESTARTS   AGE
mysql-6ffcf87ddc-7kkbk                        1/1       Running            0          1h
......
$ kubectl get svc -n kube-system
NAME                      TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                       AGE
mysql                     ClusterIP   10.106.31.171    <none>        3306/TCP                      1h
......
```

部署成功后我们就可以在集群内部通过`mysql:3306`来访问 MySQL 服务了。


### 部署 Wayne
直接 clone Wayne 的 git 代码：
```shell
$ git clone https://github.com/Qihoo360/wayne/
```

其中 `hack/kubernetes` 目录下面就是我们需要部署的 Wayne 的资源清单文件：
```shell
$ ls -la hack/kubernetes
total 24
drwxr-xr-x  5 ych  staff  160 Nov 19 13:40 .
drwxr-xr-x  5 ych  staff  160 Nov 19 11:33 ..
-rw-r--r--  1 ych  staff  339 Nov 19 11:33 configmap.yaml
-rw-r--r--  1 ych  staff  967 Nov 19 13:40 deployment.yaml
-rw-r--r--  1 ych  staff  229 Nov 19 11:33 service.yaml
```

> 我们这里将所有服务都部署到`kube-system`命名空间下面，所以将这里的资源清单中的`namespace`都统一改成`kube-system`

由于我们这里是使用上面集群中部署的 MySQL 服务，所以这里需要对 configmap.yaml 文件进行简单的配置，而 360 文档上面的 ConfigMap 是不完整的，需要使用源码里面的`app.conf`文件来进行创建，所以我们这里可以使用`--from-file`关键字来创建 ConfigMap 对象，首先配置下`app.conf`文件：
```
appname = wayne
httpport = 8080
runmode = prod
autorender = false
copyrequestbody = true
EnableDocs = true
EnableAdmin = true
StaticDir = public:static
# Custom config
ShowSql = false
## if enable username and password login
EnableDBLogin = true
# token, generate jwt token
RsaPrivateKey = "./apikey/rsa-private.pem"
RsaPublicKey = "./apikey/rsa-public.pem"
# token end time. second
TokenLifeTime=86400

# kubernetes labels config
AppLabelKey= wayne-app
NamespaceLabelKey = wayne-ns
PodAnnotationControllerKindLabelKey = wayne.cloud/controller-kind

# database configuration:
## mysql
DBName = wayne
DBTns = tcp(mysql:3306)
DBUser = root
DBPasswd = rootPassw0rd
DBLoc = "Asia%2FShanghai"
DBConnTTL = 30

# web shell auth
appKey = "860af247a91a19b2368d6425797921c6"

# Set demo namespace and group id
DemoGroupId = 1
DemoNamespaceId = 1

# Sentry
LogLevel = 7
SentryEnable = false
#SentryDSN = "${SENTRY_DSN}"
#SentryLogLevel = "${SENTRY_LOGLEVEL||4}"

# Robin
EnableRobin = false

# api-keys
EnableApiKeys = false

# Bus
BusEnable = false
#BusRabbitMQURL = "${MQ_URL||amqp://guest:guest@rabbitmq:5672}"

# other
# 采用Canary/Production上线模式
# 如果项目配置了metaData {"mode":"beta"}，则跳转到beta域名
#BetaUrl = "${BETA_URL||https://beta.wayne.cloud}"
#AppUrl = "${APP_URL||https://www.wayne.cloud}"

# oauth2
#RedirectUrl = "${REDIRECT_URL||https://www.wayne.cloud}"

[auth.qihoo]
enabled = false
client_id = client
client_secret = secret
auth_url = https://example.com/oauth2/v1/authorize
token_url = https://example.com/oauth2/v1/token
api_url = https://example.com/oauth2/v1/userinfo

# ldap config
# enable ldap login
[auth.ldap]
enabled = false
ldap_url = ldap://127.0.0.1
ldap_search_dn = "cn=admin,dc=example,dc=com"
ldap_search_password = admin
ldap_base_dn = "dc=example,dc=com"
ldap_filter =
ldap_uid = cn
ldap_scope = 2
ldap_connection_timeout = 30
```

可以直接使用我这里上面的配置文件，和源码中的区别是`runmode`改成了`prod`模式，不然运行会出错，另外是配置了数据库相关的信息：
```
DBName = wayne
DBTns = tcp(mysql:3306)
DBUser = root
DBPasswd = rootPassw0rd
DBLoc = "Asia%2FShanghai"
DBConnTTL = 30
```

将`DBTns`配置成你的 mysql 服务的地址，另外一个值得注意的是这里的`DBUser`必须使用`root`，否则第一次安装的时候不能同步数据库，配置好后，然后创建 ConfigMap 对象：
```shell
$ kubectl create configmap infra-wayne --namespace kube-system --from-file=app.conf
configmap "infra-wayne" created
```

然后就可以部署另外两个资源对象了：
```shell
$ kubectl create -f deployment.yaml
deployment.extensions "infra-wayne" created
$ kubectl create -f service.yaml
service "infra-wayne" created
```

创建完成后，可以查看下 Pod 的状态，如果没有错误信息，就证明部署成功了：
```shell
$ kubectl get pods -n kube-system -l app=infra-wayne
NAME                           READY     STATUS    RESTARTS   AGE
infra-wayne-5c5d95cb5c-q6z25   1/1       Running   0          19m
$ kubectl logs -f infra-wayne-5c5d95cb5c-q6z25 -n kube-system
[ORM]2018/11/20 05:08:37 unsupport orm tag int
[ORM]2018/11/20 05:08:37 unsupport orm tag bool
[ORM]2018/11/20 05:08:37 unsupport orm tag int
[ORM]2018/11/20 05:08:37 unsupport orm tag bool
2018/11/20 05:08:39.395 [E] [db.go:53] Ping database: root:rootPassw0rd@tcp(mysql:3306)/ error: Error 1049: Unknown database 'wayne'
2018/11/20 05:08:39.402 [D] [db.go:78] Initialize database connection: root:rootPassw0rd@tcp(mysql:3306)/
create table `user`
    -- --------------------------------------------------
    --  Table Structure for `github.com/Qihoo360/wayne/src/backend/models.User`
    -- --------------------------------------------------
    CREATE TABLE IF NOT EXISTS `user` (
        `id` bigint AUTO_INCREMENT NOT NULL PRIMARY KEY,
......
$ kubectl get svc -n kube-system -l app=infra-wayne
NAME          TYPE       CLUSTER-IP    EXTERNAL-IP   PORT(S)          AGE
infra-wayne   NodePort   10.98.29.98   <none>        8080:31259/TCP   10h
```

然后我们就可以通过`31259`这个 NodePort 来访问 Wayne 了：

![wayne dashboard](/img/posts/wayne-dashboard.png)


使用默认的用户名和密码(都是`admin`)登录就可以进入到 Wayne 首页去了：

![wayne index](/img/posts/wayne-index.png)

我们可以看到 Wayne 还是有很多问题的，第一次进来的时候还会报500错误，这是因为没有配置集群，点击右上角的`管理员` -> `进入后台`，可以进入到后台管理界面：

![wayne backend index](/img/posts/wayne-backend-index.png)

在左侧菜单中点击`集群` -> `列表` -> `+创建集群`，可以新建一个集群：

![wayne backend new cluster](/img/posts/wayne-backend-new-cluster.png)

名字随便填写即可，`Master`填写集群的`apiserver`地址，然后下面的`KubeConfig`是最重要的，如果我们经常使用 kubectl 工具的话就应该知道这个工具的配置文件其实就是一个`KubeConfig`，我们只需要把需要管理的集群的`KubeConfig`文件复制到这里即可，默认路径是`~/.kube/config`文件，创建完成后就可以看到添加的集群信息了：

![wayne cluster](/img/posts/wayne-cluster.png)


其他部分就可以自行去体验了，参考文档：[https://github.com/Qihoo360/wayne/wiki](https://github.com/Qihoo360/wayne/wiki)


> 目前`Wayne`的确还有很多坑，和不完善的地方，如果你觉得这个项目还不错的话，可以多些耐心或者贡献下项目。


## 推广
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
