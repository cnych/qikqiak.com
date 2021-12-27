---
title: 自定义 Traefik（本地）插件
date: 2021-12-27
tags: ["traefik", "kubernetes", "插件"]
keywords: ["traefik", "中间件", "middleware", "kubernetes"]
slug: custom-traefik-local-middleware
gitcomment: true
notoc: true
category: "kubernetes"
---

![自定义traefik插件](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20211227113321.png)

虽然 Traefik 已经默认实现了很多中间件，可以满足大部分我们日常的需求，但是在实际工作中，用户仍然还是有自定义中间件的需求，为解决这个问题，官方推出了一个 [Traefik Pilot](https://pilot.traefik.io/) 的功能了，此外在 Traefik v2.5 版本还推出了支持本地插件的功能。

<!--more-->

## Traefik Pilot

`Traefik Pilot` 是一个 SaaS 平台，和 Traefik 进行链接来扩展其功能，它提供了很多功能，通过一个全局控制面板和 Dashboard 来增强对 Traefik 的观测和控制：

* Traefik 代理和代理组的网络活动的指标
* 服务健康问题和安全漏洞警报
* 扩展 Traefik 功能的插件

在 Traefik 可以使用 `Traefik Pilot` 的功能之前，必须先连接它们，我们只需要对 Traefik 的静态配置进行少量更改即可。

![pilot](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225100314.png)

> Traefik 代理必须要能访问互联网才能连接到 `Traefik Pilot`，通过 HTTPS 在 443 端口上建立连接。

首先我们需要在 `Traefik Pilot` 主页上(<https://pilot.traefik.io/>)创建一个帐户，注册新的 `Traefik` 实例并开始使用 `Traefik Pilot`。登录后，可以通过选择 `Register New Traefik Instance`来创建新实例。

![创建实例](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225100714.png)

另外，当我们的 Traefik 尚未连接到 `Traefik Pilot` 时，Traefik Web UI 中将出现一个响铃图标，我们可以选择 `Connect with Traefik Pilot` 导航到 Traefik Pilot UI 进行操作。

![Pilot UI](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225100905.png)

登录完成后，`Traefik Pilot` 会生成一个新实例的令牌，我们需要将这个 Token 令牌添加到 Traefik 静态配置中。

![Pilot 配置](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225101104.png)

在 Traefik 安装配置文件中启用 Pilot 的配置：

```yaml
# Activate Pilot integration
pilot:
  enabled: true
  token: "e079ea6e-536a-48c6-b3e3-f7cfaf94f477"
```

更新完成后，我们在 Traefik 的 Web UI 中就可以看到 Traefik Pilot UI 相关的信息了。

![更新完成](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225101951.png)

接下来我们就可以在 Traefik Pilot 的插件页面选择我们想要使用的插件，比如我们这里使用 [Demo Plugin](https://github.com/traefik/plugindemo) 这个插件。

![Demo 插件](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225102230.png)

点击右上角的 `Install Plugin` 按钮安装插件会弹出一个对话框提示我们如何安装。

![插件提示](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225102357.png)

首先我们需要将当前 Traefik 注册到 Traefik Pilot（已完成），然后需要以静态配置的方式添加这个插件到 Traefik 中，然后添加插件启动参数：

```yaml
# Activate Pilot integration
pilot:
  enabled: true
  token: "e079ea6e-536a-48c6-b3e3-f7cfaf94f477"

additionalArguments:
# 添加 demo plugin 的支持
- --experimental.plugins.plugindemo.modulename=github.com/traefik/plugindemo
- --experimental.plugins.plugindemo.version=v0.2.1
# 其他配置
```

更新完成后创建一个如下所示的 Middleware 对象：

```yaml
➜ cat <<EOF | kubectl apply -f -
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: myplugin
spec:
  plugin:
    plugindemo:  # 插件名
      Headers:
        X-Demo: test
        Foo: bar
EOF
```

然后添加到上面的 whoami 应用的 IngressRoute 对象中去：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: ingressroute-demo
  namespace: default
spec:
  entryPoints:
  - web
  routes:
  - match: Host(`who.qikqiak.com`) && PathPrefix(`/notls`)
    kind: Rule
    services:
    - name: whoami  # K8s Service
      port: 80
    middlewares:
    - name: myplugin  # 使用上面新建的 middleware
```

更新完成后，当我们去访问 `http://who.qikqiak.com/notls` 的时候就可以看到新增了两个上面插件中定义的两个 Header。

![自定义插件显示](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20201225104027.png)

当然除了使用 Traefik Pilot 上开发者提供的插件之外，我们也可以根据自己的需求自行开发自己的插件，可以自行参考文档：[https://doc.traefik.io/traefik-pilot/plugins/plugin-dev/](https://doc.traefik.io/traefik-pilot/plugins/plugin-dev/)。

<!--adsense-text-->

## 私有插件

上面我们介绍了可以使用 Traefik Pilot 来使用插件，但是这是一个 SaaS 服务平台，对于大部分企业场景下面不是很适用，我们更多的场景下需要在本地环境加载插件，为解决这个问题，在 Traefik v2.5 版本后，就提供了一种直接从本地存储目录加载插件的新方法，不需要启用 Traefik Pilot，只需要将插件源码放入一个名为 `/plugins-local` 的新目录，相对于当前工作目录去创建这个目录，比如我们直接使用的是 traefik 的 docker 镜像，则入口点则是根目录 `/`，Traefik 本身会去构建你的插件，所以我们要做的就是编写源代码，并把它放在正确的目录下，让 Traefik 来加载它即可。

需要注意的是由于在每次启动的时候插件只加载一次，所以如果我们希望重新加载你的插件源码的时候需要重新启动 Traefik。

下面我们使用一个简单的自定义插件示例来说明如何使用私有插件。首先我们定义一个名为 `Dockerfile.demo` 的 Dockerfile 文件，先从 git 仓库中克隆插件源码，然后以 `traefik:v2.5` 为基础镜像，将插件源码拷贝刀 `/plugins-local` 目录，如下所示：

```docker
FROM alpine:3
ARG PLUGIN_MODULE=github.com/traefik/plugindemo
ARG PLUGIN_GIT_REPO=https://github.com/traefik/plugindemo.git
ARG PLUGIN_GIT_BRANCH=master
RUN apk add --update git && \
    git clone ${PLUGIN_GIT_REPO} /plugins-local/src/${PLUGIN_MODULE} \
      --depth 1 --single-branch --branch ${PLUGIN_GIT_BRANCH}

FROM traefik:v2.5
COPY --from=0 /plugins-local /plugins-local
```

我们这里使用的演示插件和上面 Pilot 中演示的是同一个插件，我们可以通过该插件去自定义请求头信息。

然后在 `Dockerfile.demo` 目录下面，构建镜像：

```shell
➜ docker build -f Dockerfile.demo -t cnych/traefik-private-demo-plugin:2.5.4 .
# 推送到镜像仓库
➜ docker push cnych/traefik-private-demo-plugin:2.5.4
```

镜像构建完成后就可以使用这个镜像来测试 demo 插件了，将镜像修改成上面我们自定义的镜像地址：

```yaml
image:
  name: cnych/traefik-private-demo-plugin
  tag: 2.5.4

# 其他省略

# 不需要开启 pilot 了
pilot:
  enabled: false

additionalArguments:
# 添加 demo plugin 的本地支持
- --experimental.localPlugins.plugindemo.moduleName=github.com/traefik/plugindemo
# 其他省略
```

注意上面我们添加 Traefik 的启动参数的时候使用的 `--experimental.localPlugins`。更新完成后就可以使用我们的私有插件来创建一个 Middleware 对象了：

```yaml
➜ cat <<EOF | kubectl apply -f -
apiVersion: traefik.containo.us/v1alpha1
kind: Middleware
metadata:
  name: my-private-plugin
spec:
  plugin:
    plugindemo:  # 插件名
      Headers:
        X-Demo: private-demo
        Foo: bar
EOF
```

然后添加到上面的 whoami 应用的 IngressRoute 对象中去：

```yaml
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: ingressroute-demo
  namespace: default
spec:
  entryPoints:
  - web
  routes:
  - match: Host(`who.qikqiak.com`) && PathPrefix(`/notls`)
    kind: Rule
    services:
    - name: whoami  # K8s Service
      port: 80
    middlewares:
    - name: my-private-plugin  # 使用上面新建的 middleware
```

更新上面的资源对象后，我们再去访问 `http://who.qikqiak.com/notls` 就可以看到新增了两个上面插件中定义的两个 Header，证明我们的私有插件配置成功了：

![自定义插件显示](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20211227110109.png)

<!--adsense-self-->
