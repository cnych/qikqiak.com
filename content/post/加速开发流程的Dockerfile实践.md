---
title: 加速开发流程的 Dockerfile 最佳实践
date: 2020-04-30
tags: ["kubernetes", "docker", "Dockerfile"]
keywords: ["kubernetes", "docker", "Dockerfile", "最佳实践"]
slug: speed-up-develop-flow-dockerfile-best-practices
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200430162404.png",
      desc: "Dockerfile",
    },
  ]
category: "kubernetes"
---

Dockerfile 是创建 Docker 镜像的起点，该文件提供了一组定义良好的指令，可以让我们复制文件或文件夹，运行命令，设置环境变量以及执行创建容器镜像所需的其他任务。编写 Dockerfile 来确保生成的镜像安全、小巧、快速构建和快速更新非常重要。

本文我们将看到如何编写良好的 Dockerfile 来加快开发流程，确保构建的可重用性，并生成可放心部署到生产中的镜像。

<!--more-->

### 开发流程

作为开发人员，我们希望将开发环境与生产环境尽可能地匹配，以确保我们构建的内容在部署时能够正常工作。

我们还希望能够快速开发，这意味着我们希望构建速度要快，也希望可以使用调试器之类的开发工具。容器是整理我们的开发环境的一种好方法，但是我们需要正确定义 Dockerfile 以便能够与我们的容器快速交互。

#### 增量构建

Dockerfile 是用于构建容器镜像的一个声明清单。Docker 构建器将每个步骤的结果作为镜像层进行缓存的同时，缓存可能会无效，从而导致使缓存无效的步骤以及所有后续步骤都需要重新运行，并重新生成相应的层。

当 `COPY` 或 `ADD` 引用构建上下文中的文件发生变化时，缓存会失效。所以构建步骤的顺序可能会对构建的性能产生非常大的影响。

<!--adsense-text-->

让我们看一个在 Dockerfile 中构建 NodeJs 项目的示例。在这个项目中，在 package.json 文件中指定了一些依赖项，这些依赖项是在运行 `npm ci` 命令时获取的。

最简单的 Dockerfile 文件如下所示：

```Dockerfile
FROM node:lts

ENV CI=true
ENV PORT=3000

WORKDIR /code
COPY . /code
RUN npm ci

CMD [ "npm", "start" ]
```

每当构建上下文中的文件发生变化时，我们按照上述结构构建 Dockerfile 都会导致在 COPY 这一行使得缓存失效。也就是说除了会花费很长时间得 package.json 文件以外的其他任何文件发生了变更得话，都将会重新获取依赖项放置到 node_modules 目录下面去。

为了避免这种情况发送，只在依赖项发生变更时（即，当 `package.json` 或 `package-lock.json` 更改时）才重新获取依赖，我们应该考虑将依赖项安装与应用程序的构建和运行分开。

优化后得 Dockerfile 如下所示：

```Dockerfile
FROM node:lts

ENV CI=true
ENV PORT=3000

WORKDIR /code
COPY package.json package-lock.json /code/
RUN npm ci
COPY src /code/src

CMD [ "npm", "start" ]
```

使用这种分离的方式，如果 `package.json` 或 `package-lock.json` 文件没有变更，则缓存将用于 `RUN npm ci` 指令生成的这一层。这意味着，当我们编辑应用程序源代码并进行重建时，就不会重新下载依赖项，从而节省了很多时间 🎉。

#### 在主机和容器之间保持实时加载

该技巧和 Dockerfile 并不直接相关，但我们经常听到这样的问题：在容器中运行应用程序并在主机上从 IDE 修改源代码时，如何保持代码的热更新？

在我们这里的示例，我们需要将我们的项目目录挂载到容器中，并传递一个环境变量来启用 [Chokidar](https://github.com/paulmillr/chokidar)，该项目封装了 NodeJS 文件的更改事件。运行命令如下所示：

```shell
$ docker run -e CHOKIDAR_USEPOLLING=true  -v ${PWD}/src/:/code/src/ -p 3000:3000 repository/image_name
```

这里我们通过 `-v` 将宿主机上面的代码目录挂载到容器中，当宿主机上的代码有任何变更时都会在容器中进行实时加载更新。

### 构建一致性

Dockerfile 最重要的事情之一就是从相同的构建上下文（源，依赖项...）构建完全相同的镜像。

这里我们将继续改进上一部分中定义的 Dockerfile。

#### 从源上进行一致构建

如上一节所述，我们可以通过在 Dockerfile 描述中添加源文件和依赖项并在其上运行命令来构建应用程序。

但是在前面的示例中，其实我们每次运行 `docker build` 时都无法确认生成的镜像是否相同，为什么呢？因为每次 NodeJS 发布后，lts 标签就会指向 NodeJS 镜像的最新 LTS 版本，该版本会随着时间的推移而变化，并可能带来重大变化。所以我们可以通过对基础映像使用确定的标签来轻松解决此问题。如下所示：

```Dockerfile
FROM node:13.12.0

ENV CI=true
ENV PORT=3000

WORKDIR /code
COPY package.json package-lock.json /code/
RUN npm ci
COPY src /code/src

CMD [ "npm", "start" ]
```

在下面我们还将看到使用特定标签的基础镜像还有其他优点。

#### 多阶段和匹配合适的环境

我们针对开发构建保持一致，但是针对生产环境如何来做到这一点？

从 Docker 17.05 开始，我们可以使用多阶段构建来定义生成最终镜像的步骤。使用 Dockerfile 中的这种机制，我们可以将用于开发流程的镜像与用于生产环境的镜像分开，如下所示：

```Dockerfile
FROM node:13.12.0 AS development

ENV CI=true
ENV PORT=3000

WORKDIR /code
COPY package.json package-lock.json /code/
RUN npm ci
COPY src /code/src

CMD [ "npm", "start" ]

FROM development AS builder

RUN npm run build

FROM nginx:1.17.9 AS production

COPY –from=builder /code/build /usr/share/nginx/html
```

当我们看到 `FROM…… AS` 这样的指令就可以知道是多构建阶段。我们现在有开发、构建和生产 3 个阶段。通过使用 `--target` 标记构建特定的开发阶段的镜像，我们可以继续将容器用于我们的开发流程。

```shell
$ docker build –target development -t repository/image_name:development .
```

同样还可以这样运行：

```shell
$ docker run -e CHOKIDAR_USEPOLLING=true -v ${PWD}/src/:/code/src/ repository/image_name:development
```

没有 `--target` 标志的 docker 构建将构建最终阶段，在我们这里就是生产镜像。我们的生产镜像只是一个 nginx 镜像，其中在前面的步骤中构建的文件被放置在了对应的位置。

### 生产准备

保持生产环境的镜像尽可能精简和安全是非常重要的。在生产中运行容器之前，需要检查以下几件事。

#### 没有更多最新镜像版本

正如我们前面说的，使用特定的标签的构建步骤有助于使镜像的生成的唯一性。此外至少还有两个非常好的理由为镜像使用具体的标签：

- 可以很方便在容器编排系统（Swarm，Kubernetes...）中找到所有运行有镜像版本的容器。

```shell
# Search in Docker engine containers using our repository/image_name:development image

$ docker inspect $(docker ps -q) | jq -c ‘.[] | select(.Config.Image == "repository/image_name:development") |"\(.Id) \(.State) \(.Config)"‘

"89bf376620b0da039715988fba42e78d42c239446d8cfd79e4fbc9fbcc4fd897 {\"Status\":\"running\",\"Running\":true,\"Paused\":false,\"Restarting\":false,\"OOMKilled\":false,\"Dead\":false,\"Pid\":25463,\"ExitCode\":0,\"Error\":\"\",\"StartedAt\":\"2020-04-20T09:38:31.600777983Z\",\"FinishedAt\":\"0001-01-01T00:00:00Z\"}
{\"Hostname\":\"89bf376620b0\",\"Domainname\":\"\",\"User\":\"\",\"AttachStdin\":false,\"AttachStdout\":true,\"AttachStderr\":true,\"ExposedPorts\":{\"3000/tcp\":{}},\"Tty\":false,\"OpenStdin\":false,\"StdinOnce\":false,\"Env\":[\"CHOKIDAR_USEPOLLING=true\",\"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\",\"NODE_VERSION=12.16.2\",\"YARN_VERSION=1.22.4\",\"CI=true\",\"PORT=3000\"],\"Cmd\":[\"npm\",\"start\"],\"Image\":\"repository/image_name:development\",\"Volumes\":null,\"WorkingDir\":\"/code\",\"Entrypoint\":[\"docker-entrypoint.sh\"],\"OnBuild\":null,\"Labels\":{}}"

#Search in k8s pods running a container with our repository/image_name:development image (using jq cli)
$ kubectl get pods –all-namespaces -o json | jq -c ‘.items[] | select(.spec.containers[].image == "repository/image_name:development")| .metadata’

{"creationTimestamp":"2020-04-10T09:41:55Z","generateName":"image_name-78f95d4f8c-","labels":{"com.docker.default-service-type":"","com.docker.deploy-namespace":"docker","com.docker.fry":"image_name","com.docker.image-tag":"development","pod-template-hash":"78f95d4f8c"},"name":"image_name-78f95d4f8c-gmlrz","namespace":"docker","ownerReferences":[{"apiVersion":"apps/v1″,"blockOwnerDeletion":true,"controller":true,"kind":"ReplicaSet","name":"image_name-78f95d4f8c","uid":"5ad21a59-e691-4873-a6f0-8dc51563de8d"}],"resourceVersion":"532″,"selfLink":"/api/v1/namespaces/docker/pods/image_name-78f95d4f8c-gmlrz","uid":"5c70f340-05f1-418f-9a05-84d0abe7009d"}
```

- 对于 CVE（常见漏洞和披露），我们可以快速知道是否需要修补容器和镜像。在我们这里的示例，我们可以指定我们的开发和生产镜像使用 alpine 版本。

```Dockerfile
FROM node:13.12.0-alpine AS development

ENV CI=true
ENV PORT=3000

WORKDIR /code
COPY package.json package-lock.json /code/
RUN npm ci
COPY src /code/src

CMD [ "npm", "start" ]

FROM development AS builder

RUN npm run build

FROM nginx:1.17.9-alpine

COPY –from=builder /code/build /usr/share/nginx/html
```

#### 使用官方镜像

您可以使用 Docker Hub 搜索在 Dockerfile 中使用的基础镜像，其中一些是官方支持的镜像。我们强烈建议使用这些镜像：

- 他们的内容已经过验证
- 修复 CVE 后，它们会快速更新

![Docker Hub 中的 nginx 官方镜像](https://picdn.youdianzhishi.com/images/20200430161114.png)

您可以添加 `image_filter` 请求查询参数来获取正式版本的镜像：

```shell
https://hub.docker.com/search?q=nginx&type=image&image_filter=official
```

上面我们使用的示例中均使用 NodeJS 和 NGINX 的官方镜像。

#### 足够的权限！

无论是否在容器中运行的所有应用程序都应遵守最小特权原则，这意味着应用程序应仅访问其所需的资源。

如果出现恶意行为或错误，以太多特权运行的进程可能会在运行时对整个系统造成意外的后果。

用非特权用户身份来配置镜像本身也是非常简单的：

```Dockerfile
FROM maven:3.6.3-jdk-11 AS builder
WORKDIR /workdir/server
COPY pom.xml /workdir/server/pom.xml
RUN mvn dependency:go-offline

RUN mvn package

FROM openjdk:11-jre-slim
RUN addgroup -S java && adduser -S javauser -G java
USER javauser

EXPOSE 8080
COPY –from=builder /workdir/server/target/project-0.0.1-SNAPSHOT.jar /project-0.0.1-SNAPSHOT.jar

CMD ["java", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/project-0.0.1-SNAPSHOT.jar"]
```

只需创建一个新组，向其中添加一个用户，然后使用 USER 指令，我们就可以使用非 root 用户运行容器了。

### 结论

本文我们只是展示了通过制作 Dockerfile 来优化和保护 Docker 镜像的许多方法中的部分方法。如果您想了解更多实践方式，可以查看下面的一些资料：

- [Our official documentation about Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [A previous post on the subject by Tibor Vass](https://www.docker.com/blog/intro-guide-to-dockerfile-best-practices/)
- [A session during the DockerCon 2019 by Tibor Vass and Sebastiaan van Stijn](https://www.docker.com/dockercon/2019-videos?watch=dockerfile-best-practices)
- [Another session during Devoxx 2019 by Jérémie Drouet and myself](https://www.youtube.com/watch?v=VjmOhWIRtTY)

> 本文翻译自 Docker 官方博客：[Speed Up Your Development Flow With These Dockerfile Best Practices](https://www.docker.com/blog/speed-up-your-development-flow-with-these-dockerfile-best-practices/)

<!--adsense-self-->
