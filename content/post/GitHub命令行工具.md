---
title: GitHub CLI 命令行工具使用
date: 2020-02-14
tags: ["github", "cli", "devops"]
keywords: ["github", "git", "cli", "命令行"]
slug: github-cli-tool-usage
gitcomment: true
category: "devops"
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1581375279144-bb3b381c7046.png", desc: "Painted, sliced avocado"}]
---
GitHub 被巨软收购以后推出了一系列非常好用的开发者工具，比如前面我们使用过的 CI/CD 工具 [GitHub Actions](/post/use-github-actions-build-go-app/)、[包管理工具 packages](https://github.com/features/packages)，今天我们要为大家介绍的是近来 GitHub 发布的又一个非常有用的工具: [GitHub CLI](https://cli.github.com/)，可以让开发者通过命令行于 GitHub 进行无缝的协同工作，也就是我们直接在命令行终端上就可以进行 pull requests、issues 等其他功能，现在已经发布 Beta 版本，我们可以在 [macOS、Windows 或者 Linux 平台](https://github.com/cli/cli#installation-and-upgrading)上安装 GitHub CLI。


## 安装
要安装 GitHub CLI 非常简单，比如我们这里在 macOS 下面依然可以用 Homebrew 工具进行安装：
```shell
$ brew install github/gh/gh
# 如果需要更新执行下面的命令即可
$ brew update && brew upgrade gh
```

安装完成后直接在命令行中执行 `gh` 命令，看到如下所示的信息就证明已经安装完成：
```shell
$ gh
> GET /repos/cli/cli/releases/latest
Work seamlessly with GitHub from the command line.

GitHub CLI is in early stages of development, and we'd love to hear your
feedback at <https://forms.gle/umxd3h31c7aMQFKG7>

Usage:
  gh [command]

Available Commands:
  help        Help about any command
  issue       Create and view issues
  pr          Create, view, and checkout pull requests

Flags:
      --help              Show help for command
  -R, --repo OWNER/REPO   Select another repository using the OWNER/REPO format
      --version           Show gh version

Use "gh [command] --help" for more information about a command.
```

其他平台的安装参考官方文档即可: [https://cli.github.com/manual/installation](https://cli.github.com/manual/installation)。

## 使用
下面我们以 issue 和 pull requests 两个开发者使用非常频繁的功能为例来介绍下 GitHub CLI 的基本使用。从 GitHub 上面 Clone 一个项目到本地，然后在项目目录下面执行 `gh` 相关的命令，比如我们这里就在博客文章的项目下面来进行演示，项目地址：[https://github.com/cnych/qikqiak.com](https://github.com/cnych/qikqiak.com)。

### 列表过滤
我们可以使用 `gh` 命令来过滤 issue，比如过滤带有 `gitment` 标签的问题：
```shell
$ gh issue list  --label "gitment"
> GET /repos/cli/cli/releases/latest
Notice: authentication required
Press Enter to open github.com in your browser... < HTTP 200 OK
```

在第一次使用的时候需要我们进行一次授权，在命令行中输入回车键就会在浏览器中打开授权页面，点击授权即可：

![github authorization](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200214145000.png)

授权完成后回到终端中输入回车键即可得到结果：
```shell
$ gh issue list  --label "gitment"
[git remote -v]
> GET /repos/cli/cli/releases/latest
> POST /graphql
< HTTP 200 OK
< HTTP 200 OK

Issues for cnych/qikqiak.com

> POST /graphql
< HTTP 200 OK
#152  Kubernetes 零宕机滚动更新                                          (gitment, zero-downtime-rolling-update-k8s)
#151  在 Kubernetes 集群上部署 VSCode                                   (deploy-vscode-on-k8s, gitment)
#150  自定义 Traefik2 中间件                                            (custom-traefik2-middleware, gitment)
#149  基于 Jenkins 的 DevOps 流水线实践                                   (devops-base-on-jenkins, gitment)
#148  自定义 Kubernetes 调度器                                          (custom-kube-scheduler, gitment)
#146  一文搞懂 Traefik2.1 的使用                                         (gitment, traefik-2.1-101)
......
```

上面的命令即可将带有 `gitment` 标签的 issue 过滤出来。


### 快速查看详情
找到一个我们关心的 issue 过后，要想查看该 issue 的详细信息，可以使用如下命令在浏览器中快速将 issue 的详细信息页面打开：
```shell
$ gh issue view 152
[git remote -v]
> POST /graphql
< HTTP 200 OK
> POST /graphql
< HTTP 200 OK
Opening https://github.com/cnych/qikqiak.com/issues/152 in your browser.
[open https://github.com/cnych/qikqiak.com/issues/152]
```

### 创建 PR
创建一个分支，在提交几次代码后修复了 issue 中描述的 BUG 后，然后可以使用 `gh` 命令来创建一个 pull request 来提交我们贡献的代码：