---
title: 可视化创建 Kubernetes 微服务应用
date: 2020-05-11
tags: ["kubernetes", "devops", "微服务"]
keywords: ["kubernetes", "docker", "devops", "icepanel"]
slug: visualize-kubernetes-app
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200511100036.png",
      desc: "https://unsplash.com/photos/fi5FPDZ6tns",
    },
  ]
category: "kubernetes"
---

刚刚发现一款看上去非常厉害的工具：[icepanel](https://icepanel.io/)，可以用来快速创建和可视化我们的 Kubernetes 微服务应用程序。使用也是非常简单，只需要安装一款 VSCODE 插件即可。

<!--more-->

在 VSCODE 中搜索插件 `IcePanel` 安装就可以使用了。新建一个空的 workspace，在左下角就可以看到一个 `Open IcePanel` 按钮，点击该按钮会提示我们是否安装 `icepanel.yaml` 文件，默认允许即可进入 `IcePanel` 页面了。

![](https://picdn.youdianzhishi.com/images/20200511092831.png)

`IcePanel` 的操作页面非常简单：

![](https://picdn.youdianzhishi.com/images/20200511093113.png)

目前 `IcePanel` 预置了几种服务可以供我们使用，比如常用的 ConfigMap、Deployment、Service 等资源对象。

![](https://picdn.youdianzhishi.com/images/20200511093359.png)

接下来我们如何使用 Kubernetes 和 `IcePanel` 来部署 Wordpress 和 MySQL 应用。

这里我们使用 PV 来持久化数据，Service 对象来暴露服务，并且用 Secret 对象来保存密码信息。

1.创建数据卷

我们需要创建两个数据卷来存储 MySQL 和 Wordpress 所需的持久数据。

![](https://picdn.youdianzhishi.com/images/20200511093846.png)

2.创建 MySQL

然后创建一个 Mysql 的 Deployment 控制器和 Service 对象，并通过标签进行关联。

![](https://picdn.youdianzhishi.com/images/20200511094202.png)

单击 Service 上的编辑按钮可以显示其高级属性。然后为 3306 添加一个新端口，以允许 Service 暴露它。

![](https://picdn.youdianzhishi.com/images/20200511094230.png)

现在，我们应该看到一个新的连接器出现在 Service 上了，也就是上面暴露的端口。

![](https://picdn.youdianzhishi.com/images/20200511094345.png)

3.持久化 MySQL 数据

现在创建一个 PVC 对象来关联 MySQL，这样就可以使用前面创建的 PV 对象来持久化数据了。

![](https://picdn.youdianzhishi.com/images/20200511094528.png)

4.配置 MySQL 密码

接下来创建一个 Kubernetes Secret 对象，然后编辑添加一个密码数据字段。

![](https://picdn.youdianzhishi.com/images/20200511094652.png)

密码创建后，我们就可以将这个 Secret 对象连接到 MySQL 的 `ROOT_PASSWORD` 这个环境变量上去了。

![](https://picdn.youdianzhishi.com/images/20200511094816.png)

5.创建 Wordpress

接下来就可以创建 Wordpress 应用了，同样需要创建 Deployment 和 Service 对象。

![](https://picdn.youdianzhishi.com/images/20200511094953.png)

通过属性编辑器将 Service 配置位 `LoadBalancer`，当然如果不是云环境，我们可以使用 `NodePort` 类型的 Serivce。

![](https://picdn.youdianzhishi.com/images/20200511095123.png)

![](https://picdn.youdianzhishi.com/images/20200511095155.png)

6.持久化 Wordpress 数据

和 MySQL 一样，创建一个 PVC 对象来持久化 Wordpress 的数据。

![](https://picdn.youdianzhishi.com/images/20200511095309.png)

7.关联 MySQL 和 Wordpress

最后，将 MySQL 数据库服务和 Secret 连接到 Wordpress Deployment 上面。到这里，我们就完成创建了 Kubernetes Wordpress 和 MySQL 应用。

![](https://picdn.youdianzhishi.com/images/20200511095502.png)

8.部署

在我们当前的 workspace 下面已经有了上面我们可视化创建过后对应的资源清单文件了，我们直接用 kubectl 工具直接部署到 Kubernetes 集群中即可，部署完成后我们就可以通过 LoadBalancer 或者 NodePort 类型的 Service 去访问 Wordpress 应用了。

<!--adsense-self-->
