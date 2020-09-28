---
title: 真香！使用 VSCode 远程开发调试
date: 2020-09-28
tags: ["vscode", "goland", "golang"]
keywords: ["vscode", "goland", "ssh", "调试", "goland"]
slug: use-vscode-remote-dev-debug
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928155728.png", desc: "https://unsplash.com/photos/12zE8xgAwuQ"}]
category: "golang"
---

对于大型的 Golang 项目往往我都会使用 Goland 这样的专业 IDE，但是由于我本地开发环境硬件资源偏低，不能很顺畅的使用 Goland，这个时候我们就可以使用 VSCode 来代替 Goland，另外 VSCode 同样还支持远程开发，所以我索性将开发环境放在远程机器上，然后用 VSCode 远程开发模式进行连接，最主要的是大部分我们的项目都是直接跑在 Linux 上面的，这个时候我们就可以直接在 VSCode 中运行 Linux 环境下面的应用，而且我们还可以很好地进行调试。

<!--more-->

## 远程配置

VSCode 的 Remote 功能由三个插件组成，分别实现三种不同场景的远程开发。

- [Remote - SSH](https://code.visualstudio.com/docs/remote/ssh)：利用 SSH 连接远程主机进行开发。
- [Remote - Container](https://code.visualstudio.com/docs/remote/containers)：连接当前机器上的容器进行开发。
- [Remote - WSL](https://code.visualstudio.com/docs/remote/wsl)：在Windows 10上，连接子系统（Windows Subsystem for Linux）进行开发。

我们这里使用 SSH 模式进行配置，SSH 模式的原理如下图所示：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928095013.png)

首先我们这里在本地环境 Mac 上安装上 VSCode，远程开发的机器 IP 为 192.168.31.104，配置该节点可以本地通过 SSH 远程连接。然后在 VSCode 中安装 Remote SSH 插件：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928095557.png)

安装了 Remote - SSH 扩展后，你会在最左边看到一个新的状态栏图标。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928100002.png)

远程状态栏图标可以快速显示 VS Code 在哪个上下文中运行（本地或远程），点击该图标或者点击 F1 按键然后输入remote-ssh 便会弹出 Remote-SSH 的相关命令。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928100346.png)

选择 `"Remote-SSH: Connect to Host"` 命令，然后按以下格式输入远程主机的连接信息，连接到主机：`user@hostname`，然后根据提示输入登录的密码。

VSCode 将打开一个新窗口，然后你会看到 "VSCode 服务器 "正在 SSH 主机上初始化的通知，一旦 VSCode 服务器安装在远程主机上，它就可以运行扩展并与你的本地 VSCode 实例通信了。通过查看状态栏中的指示器，可以知道已连接到虚拟机了，它显示的是你的虚拟机的主机名。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928100750.png)

Remote-SSH 扩展还在你的活动栏上添加了一个新的图标，点击它将打开远程浏览器。从下拉菜单中，可以选择 SSH 目标，在这里你可以配置你的 SSH 连接。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928100854.png)

一旦你连接到你的 SSH 主机，你就可以与远程机器上的文件进行交互l ，如果你打开集成终端(`⌃``)，你会发现现在我们是在远程的 Linux 下面了。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928101040.png)

现在我们可以使用 bash shell 浏览远程主机上的文件系统，还可以使用 `"文件">"打开文件夹"` 浏览和打开远程主目录上的文件夹。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928101244.png)

此外，如果我们开发的是 WEB 应用，为了能够浏览到远程主机上的应用，我们可以利用另一个`端口转发`的功能来实现。

## 环境配置

现在我们已经可以在 VSCode 中进行远程开发了，接下来我们以开源项目 [KinD](https://kind.sigs.k8s.io/) 为例来说明如何进行远程调试。

> KinD 是一个使用 Docker 容器`节点`运行本地 Kubernetes 集群的工具，主要是为了测试 Kubernetes 本身而设计的，但也可以用于本地开发或CI 测试。

首先在远程主机上 Clone 代码（也可以直接通过 VSCode Clone 操作）：

```bash
cnych@ubuntu:~/Github$ git clone https://github.com/kubernetes-sigs/kind.git
cnych@ubuntu:~/Github$ git checkout v0.9.0
cnych@ubuntu:~/Github$ git checkout -b dev
```

然后在 VSCode 中定位到该项目，打开该项目。由于我们这是一个 Golang 项目，当然首先要做的是在远程主机上安装 Golang 的环境。 然后当然需要在 VSCode 中安装 Golang 的插件，但是要注意的是我们需要安装到远程主机上，切换到 EXTENSIONS 页面，输入 Go，选择 Go 插件，然后在插件页面我们可以看到一个 `Install on SSH: 192.168.31.104` 的按钮，点击这个按钮按钮就可以将该插件安装到远程主机上：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928102615.png)

安装完成后，还需要安装一些相关的命令行工具，可以查看 [https://github.com/golang/vscode-go](https://github.com/golang/vscode-go) 了解相关信息。同样在 VSCode 中输入 F1 按键，然后输入 Go 关键字，可以列出和 Go 相关的操作：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928103130.png)

我们要做的是选择第一条命令：`Go: Install/Update Tools`，选择所有的命令行工具，点击 `OK` 按钮便会在远程主机上安装这些工具：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928103322.png)

不过需要注意的是这些工具或多或少需要一些科学方法才能下载成功，我们也可以手动下载这些工具放到 `GOBIN` 目录下面即可。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928103628.png)

这些命令行工具配置完成后，我们就可以在项目中使用这些工具了，在 KinD 项目根目录下面创建 .vscode 目录，在目录下面新建 settings.json 文件，该文件就是来配置 VSCode 的，我这里使用的配置信息如下所示，我们可以根据自己的实际需求进行配置：

```json
{
  "workbench.editor.enablePreview": false,
  "editor.fontLigatures": true,
  "editor.fontSize": 20, 
  "editor.fontFamily": "'Ubuntu Mono derivative Powerline'",
  "terminal.integrated.fontFamily": "'Ubuntu Mono derivative Powerline'",
  "terminal.integrated.fontSize": 17,
  "workbench.fontAliasing": "antialiased",
  "go.inferGopath": false,
  "go.autocompleteUnimportedPackages": true,
  "go.useLanguageServer": true,
  "go.lintTool": "golangci-lint",
  "go.docsTool": "godoc",
  "go.buildFlags": [],
  "go.lintFlags": [],
  "go.vetFlags": [],
  "go.gocodePackageLookupMode": "go",
  "go.gotoSymbol.includeImports": true,
  "go.useCodeSnippetsOnFunctionSuggest": true,
  "go.useCodeSnippetsOnFunctionSuggestWithoutType": true,
  "go.formatTool": "goreturns", 
  "go.gocodeAutoBuild": false,
  "go.liveErrors": {
      "enabled": true,
      "delay": 0
  }
}
```

现在在 VSCode 终端的项目目录下面执行如下命令更新依赖：

```bash
cnych@ubuntu:~/Github$ export GOPROXY="https://goproxy.cn"
cnych@ubuntu:~/Github$ go mod tidy
```

现在我们就可以在 VSCode 中查看项目了，可以快速跟踪代码，也有代码提示，基本上 IDE 有的功能，在 VSCode 中都有：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928104124.png)

不过对于大型 Golang 项目使用 VSCode 不方面的一个地方是不能快速定位到接口的实现，因为 Golang 中的接口很可能有多个地方都有实现，这点 VSCode 就没有 Goland 方便了，不过我们也还是可以使用快捷方式找到接口的实现，我们可以将鼠标定位到接口名称或者接口方法声明上，然后通过快捷键`Cmd（Windows 下面是 Ctrl） + F12` 就可以找到对应的实现，当然也可以通过右键查找所有实现：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928104630.png)

## 远程调试

现在我们已经可以使用 Remote-SSH 插件开发项目了，但是在开发过程中或者学习开源项目的时候往往少不了调试，特别是要想快速了解开源项目的实现，单步调试跟踪代码是非常好的一种方式，比如我们要来跟踪下 KinD 是如何创建集群的，我们就可以在 KinD 创建集群的某些代码片段上打上端点，然后单步调试进行跟踪。
<!--adsense-text-->
比较幸运的时候 VSCode 就可以很好的来帮助我们进行调试的操作。Golang 项目的调试是依赖 `delve` 这个工具的，上面安装命令行工具的时候已经安装了，如果没有安装，我们可以使用如下方式进行手动安装：

```bash
$ go get -u github.com/go-delve/delve/cmd/dlv
```

安装完成后需要配置调试工具，F1 输入 `Debug: Open launch.json` 打开 `launch.json` 文件。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928105626.png)

如果第一次打开，会新建一个配置文件，默认配置内容如下所示：

```go
{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Launch",
			"type": "go",
			"request": "launch",
			"mode": "auto",
			"program": "${fileDirname}",
			"env": {},
			"args": []
		}
	]
}
```

常见的配置属性：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928105733.png)

我们还可以在配置文件中使用一些内置的变量：

- `${workspaceFolder}` 调试 VS Code 打开工作空间的根目录下的所有文件
- `${file}` 调试当前文件
- `${fileDirname}` 调试当前文件所在目录下的所有文件

比如我们要调试 KinD 的创建集群的命令，对应的 `launch.json` 文件内容如下所示：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Kind",
      "type": "go",
      "request": "launch",
      "mode": "debug",
      "host": "127.0.0.1",
      "port": 2345,
      "program": "${workspaceFolder}/main.go",
      "cwd": "${workspaceFolder}",
      "env": {},
			"args": ["create", "cluster"]
    }
  ]
}
```

然后在创建集群的代码片段中打上端点，比如在 pkg/cluster/internal/create/create.go 文件的 Cluster 函数中打上两个端点（在左侧点击一下即可）：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928110409.png)

然后在左侧切换到调试，点击我们上面配置的 `Debug Kind` 按钮（或者使用 F5 按键）即可开始调试：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928110459.png)

开始调试后， delve 会在远程主机上启动一个无头服务，监听在 2345 端口上，正常这个时候我们的程序会运行到我们上面打的断点位置停下来：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200928110704.png)

这个时候我们可以看到已经初始化的变量信息，在最上方也有调试的工具栏，当然也有对应的快捷键，F5：继续、F10：单步执行、F11：进入函数内部单步执行，这几个快捷键是最常用的，当然如果你的快捷键有冲突我们可以直接使用上面的工具栏进行操作。在操作的过程中产生的日志信息也会出现在 `DEBUG CONSOLE` 栏目下面。这样我们就实现了远程调试的，对于开源项目我们可以多使用单步调试去跟踪代码的执行，这样可以更快了解程序的执行流程，当然远程调试并不只是针对 Golang 项目，其他语言的也同样适用。

<!--adsense-self-->