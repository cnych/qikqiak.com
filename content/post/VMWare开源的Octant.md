---
title: VMWare 开源的 Kubernetes 可视化工具 Octant
date: 2019-09-03
tags: ["vmware", "kubernetes", "Octant"]
keywords: ["vmware", "kubernetes", "Octant", "Dashboard", "可视化"]
slug: vmware-k8s-dashboard-octant
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1567161569119-2efa25acc395.jpeg", desc: "https://unsplash.com/photos/bun7ERlQamw"}]
category: "kubernetes"
---
上午看新闻发现 VMWare 开源了一款 Kubernetes Dashboard 的可视化工具 [Octant](https://github.com/vmware/octant) ，这是一款帮助开发人员了解应用程序在 Kubernetes 集群中如何运行的工具。它通过可视化的方式，呈现 Kubernetes 对象的依赖关系，可将本地端口请求转发到正在运行的 pod，查看 pod 日志，浏览不同的集群。此外，用户还可以通过安装或编写插件来扩展 Octant 的功能。

<!--more-->

在第一时间体验了 Octant 过后，感觉和现在大部分的 Dashboard 功能差不多，也和他们提到的“并没有想把 Octant 做成一个仪表板，而是作为 kubectl 的一个可视化补充”比较符合，可能最大的亮点还是可以自己编写插件来扩展 Octant 功能吧，这倒是给 Octant 提供了更多的可能。
<!--adsense-text-->
对应 Linux 用户来说现在可以直接通过`.deb`或者`.rpm`包来进行安装，当然也可以直接在 GitHub Release 页面下载编译好的二进制包直接运行即可，更多的安装方式可以参考 Octant 的 GitHub 页面文档：[https://github.com/vmware/octant](https://github.com/vmware/octant)。

我们这里直接在 Kubernetes 集群的 master 节点上来安装体验下 Octant，我们这里是 centos 系统，所以在节点上下载 rpm 包即可：
```shell
$ wget https://github.com/vmware/octant/releases/download/v0.6.0/octant_0.6.0_Linux-64bit.rpm
......
100%[=====================================================================================>] 21,798,100  33.6KB/s   in 8m 50s

2019-09-03 10:31:02 (40.2 KB/s) - ‘octant_0.6.0_Linux-64bit.rpm’ saved [21798100/21798100]
```

然后使用`rpm`命令直接安装：
```shell
$ yum install octant_0.6.0_Linux-64bit.rpm
Loaded plugins: fastestmirror, langpacks
Examining octant_0.6.0_Linux-64bit.rpm: octant-0.6.0-1.x86_64
Marking octant_0.6.0_Linux-64bit.rpm to be installed
Resolving Dependencies
--> Running transaction check
---> Package octant.x86_64 0:0.6.0-1 will be installed
--> Finished Dependency Resolution
......

Installed:
  octant.x86_64 0:0.6.0-1

Complete!
```

安装完成后直接执行`octant`命令即可启动，但是需要注意的是我们这里需要来读取访问集群的 KUBECONFIG 文件，而且需要通过域名来访问 Octant，所以需要设置一些环境变量，如下所示：
```shell
$ OCTANT_ACCEPTED_HOSTS=k8s.youdianzhishi.com KUBECONFIG=~/.kube/config OCTANT_LISTENER_ADDR=0.0.0.0:8900 octant
2019-09-03T10:36:57.379+0800	INFO	module/manager.go:75	registering action	{"component": "module-manager", "actionPath": "deployment/configuration", "module-name": "overview"}
2019-09-03T10:36:57.383+0800	INFO	api/content.go:52	Registering routes for overview
2019-09-03T10:36:57.398+0800	INFO	api/content.go:52	Registering routes for cluster-overview
2019-09-03T10:36:57.398+0800	INFO	api/content.go:52	Registering routes for configuration
2019-09-03T10:36:57.399+0800	INFO	dash/dash.go:332	Dashboard is available at http://[::]:8900

```

我们这里通过设置`OCTANT_ACCEPTED_HOSTS`环境变量来配置了访问的域名，`KUBECONFIG`环境变量设置了访问集群的 kubeconfig 文件，这样我们就可以在浏览器中通过`k8s.youdianzhishi.com:8900`来访问 Octant 了：

![octant dashboard](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/octant-dashboard.png)

![octant resource viewer](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/octant-resource-viewer.png)

![octant logs](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/octant-logs.png)

我们可以看到功能基本上和官方的 Dashboard 区别不大，不过确实插件功能带来的想象空间就比较大了，插件是 Octant 的一个核心模块，一个插件可以读取资源对象允许用户自己添加组件到 Octant 的视图上面。更多关于插件的信息可以查看文档：[docs/plugins](https://github.com/vmware/octant/tree/master/docs/plugins)。

<!--adsense-self-->

