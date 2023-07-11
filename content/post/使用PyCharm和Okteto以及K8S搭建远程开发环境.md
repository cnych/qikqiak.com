---
title: 使用 PyCharm、Okteto 和 Kubernetes 搭建远程开发环境
date: 2020-05-13
tags: ["kubernetes", "pycharm", "okteto"]
slug: remote-deploy-env-with-okteto
keywords: ["kubernetes", "pycharm", "okteto", "vscode"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200513120948.png",
      desc: "https://unsplash.com/photos/yZTCvnOTpms",
    },
  ]
category: "kubernetes"
---

[Okteto](https://okteto.com/) 是一个通过在 Kubernetes 中来开发和测试代码的应用程序开发工具。可以通过 `Okteto` 在 Kubernetes 中一键为我们启动一个开发环境，非常简单方便。前面我们也介绍过 Google 推出的 [Skaffold](/post/skaffold-simple-local-develop-k8s-app-tools/) 工具，今天我们演示下如何使用 `Okteto` 来搭建 Python 应用开发环境。

<!--more-->

## 安装

我们只需要在本地开发机上面安装 [Okteto CLI](https://okteto.com/docs/getting-started/installation) 工具即可，要想使用 Okteto 来配置环境就需要我们本地机上可以访问一个 Kubernetes 集群，所以前提是需要配置一个可访问的 Kubernetes 集群的 kubeconfig 文件，如果你没有 Kubernetes 集群的话，可以使用 [OKteto Cloud](https://okteto.com/) 提供的环境，对于个人用户来说免费的额度基本上够用了。`Okteto CLI` 就是一个二进制文件，所以安装非常简单。

对于 MacOS 或者 Linux 系统执行执行如下命令即可：

```shell
$ curl https://get.okteto.com -sSfL | SH
```

对于 Windows 用户直接下载 [https://downloads.okteto.com/cli/okteto.exe](https://downloads.okteto.com/cli/okteto.exe) 并将其添加到您的 `$PATH` 路径中即可。

配置完成后在终端中执行如下命令，正常就安装完成了：

```shell
$ okteto version
okteto version 1.8.8
```

## 项目配置

打开 PyCharm IDE，为我们的应用环境一个新的项目，选择 `Pure Python` 模板，命名为 `guestbook`。

![new python project](https://picdn.youdianzhishi.com/images/20200513102624.png)

[远程开发环境](https://okteto.com/docs/reference/development-environment) 其实就是一个运行在远程的一个 Docker 容器，其中包含构建和开发应用程序的一些环境依赖而已。`Okteto` 会在项目中读取 `okteto.yml` 文件来定义应用程序的开发环境。

<!--adsense-text-->

比如我们这里在 `guestbook` 项目根目录下面创建一个名为 `okteto.yml` 的文件，文件内容如下所示：

```yaml
name: guestbook
image: okteto/python:3
forward:
  - 8080:8080
remote: 2222
command:
  - bash
```

该文件定义了 `Okteto` 的操作：

- 创建一个名为 `guestbook` 的开发环境
- 使用 `okteto/python:3` 这个镜像
- 在 2222 端口上启动远程 SSH 服务器
- 将端口 8080 转发到远程环境
- `bash` 命令在启动的时候运行，所以我们可以获得一个远程终端

> 关于 `okteto.yml` 配置清单更多的使用可以查看文档 [https://okteto.com/docs/reference/manifest](https://okteto.com/docs/reference/manifest) 了解更多。

现在我们来部署开发环境，在 PyCharm 中直接打开本地终端，然后直接执行 `okteto up` 命令，第一次启动的时候会让我们确认是否创建它，输入 `y` 确认即可。该命令会自动执行环境配置任务：

- 将 `okteto.yml` 描述的开发环境部署到 Kubernetes 集群中
- 将端口 8080 转发到远程环境中
- 在端口 2222 中启动 SSH 服务器
- 启动[文件同步服务](https://okteto.com/docs/reference/file-synchronization/index.html)，这样可以让我们本地的文件系统和开发环境的 Pod 之间保持同步更新
- 在远程开发环境中启动一个远程的 Shell，现在我们就可以像在本地计算机上一个构建、测试和运行应用程序了。

![okteto up](https://picdn.youdianzhishi.com/images/20200513104206.png)

配置环境的过程其实就是在 Kubernetes 集群中启动一个 Pod 来提供开发环境，我们可以在 Kubernetes 中查看这个新启动的 Pod：

```shell
$ kubectl get pod -l app=guestbook
NAME                         READY   STATUS    RESTARTS   AGE
guestbook-8494ccd87b-q459j   1/1     Running   0          12m
```

默认情况下，PyCharm 会使用本地的 Python 解释器，我们这里的环境是远程的，所以需要将其配置为使用远程的开发环境作为解释器，这样可以确保我们的开发环境和本地没有任何关联。

在 PyCharm 最下方的状态栏的右下方选择 `Python Interpreters`，然后点击 `Add Interpreter...` 菜单来添加一个新的解释器：
![Add Interpreter](https://picdn.youdianzhishi.com/images/20200513104458.png)

然后选择左侧的 `SSH Interpreter`：

![SSH Interpreter](https://picdn.youdianzhishi.com/images/20200513104553.png)

选择 `New server configuration` 新建一个配置，配置内容如下图所示：

![New server configuration](https://picdn.youdianzhishi.com/images/20200513105647.png)

点击 `NEXT` 进入认证配置页面，选择使用 `Key pair`，输入 `Private key file` 文件的路径 `/Users/ych/.okteto/id_rsa_okteto`，这里将 `/Users/ych` 替换成自己的 `$HOME` 目录路径即可：

![Key pair](https://picdn.youdianzhishi.com/images/20200513105722.png)

`okteto up` 命令第一次运行的时候，会为我们创建一个 SSH 密钥对，并将其保存在 `$HOME/.okteto/id_rsa_okteto` 和 `$HOME/.okteto/id_rsa_okteto.pub` 文件中，在开发环境中启动的 SSH 服务中会自动使用这些密钥进行身份验证。

SSH 配置完成后，我们可以更新下解释器的路径，需要注意的是现在的路径是远程开发环境的路径，这里我们替换成 `/usr/local/bin/python`，文件夹映射设置为 `<Project root> -> /okteto`，并禁用文件上传，因为 `Okteto` 会自动帮我们同步的。

![SSH Config](https://picdn.youdianzhishi.com/images/20200513105954.png)

点击 `FINISH` 按钮就配置完成了。现在我们的项目就会直接使用远程开发环境中的 Python 解释器了，而不是本地的。

## 测试

在项目中新建一个名为 `app.py` 的文件来测试下应用，文件内容如下所示：

```py
from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/", methods=["GET"])
def get_messages():
    return jsonify(message="Hello okteto")

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
```

用 `Flask` 启动一个简单的 Web Server。现在还需要安装环境依赖，在控制台（注意带有 `okteto >` 提示的）中执行如下命令：

```shell
default:guestbook okteto> pip install flask
```

安装完成后，同样我们可以将依赖添加到 `requirements.txt` 文件中：

```shell
default:guestbook okteto> pip freeze > requirements.txt
```

其实上面我们的操作是在远程的 Pod 中执行的，但是由于 `Okteto` 会自动同步文件，所以很快我们也会在本地项目中看到 `requirements.txt` 这个文件。同样现在我们可以在控制台中执行 `python app.py` 命令来启动服务器：

```shell
default:guestbook okteto> python app.py
 * Serving Flask app "app" (lazy loading)
 * Environment: production
   WARNING: This is a development server. Do not use it in a production deployment.
   Use a production WSGI server instead.
 * Debug mode: on
 * Running on http://0.0.0.0:8080/ (Press CTRL+C to quit)
 * Restarting with stat
 * Debugger is active!
 * Debugger PIN: 599-491-525

```

![test flask codeb](https://picdn.youdianzhishi.com/images/20200513111653.png)

启动完成后，我们的应用程序就在远程的开发环境中启动并运行起来了，由于我们在 `okteto.yml` 文件中配置了将本地的 8080 端口转发到远程的 8080 端口，所以我们也可以通过本地的 8080 端口进行访问了，而且每次代码的改动， `Flask` 都会自动重新加载我们的应用程序：

```shell
$ curl http://0.0.0.0:8080
{
  "message": "Hello okteto"
}
```

到这里我们就完成了为 Python 应用程序配置远程开发环境的功能。

<!--adsense-self-->
