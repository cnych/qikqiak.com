---
title: kubernetes ConfigMap 和 Secrets
subtitle: 快速了解 kubernetes 中 ConfigMap 和 Secrets 的用法
date: 2018-02-10
publishdate: 2017-01-18
keywords: ["kubernetes", "ConfigMap", "Secretes", "使用"]
tags: ["kubernetes", "ConfigMap", "Secretes"]
slug: understand-kubernetes-configmap-and-secrets
gitcomment: true
bigimg: [{src: "/img/posts/photo-1470328358326-dee4879da669.jpeg", desc: "Forest bride in flowing dress"}]
category: "kubernetes"
---

我们经常都需要为我们的应用程序配置一些特殊的数据，比如密钥、Token 、数据库连接地址或者其他私密的信息。你的应用可能会使用一些特定的配置文件进行配置，比如`settings.py`文件，或者我们可以在应用的业务逻辑中读取环境变量或者某些标志来处理配置信息。

当然你可以直接将这些应用配置信息直接硬编码到你的应用程序中去，对于一个小型的应用，这或许是可以接受的，但是，对于一个相对较大的应用程序或者微服务的话，硬编码就会变得难以管理了。比如你现在有10个微服务，都连接了数据库A，如果现在需要更改数据库A的连接地址的话，就需要修改10个地方，显然这是难以忍受的。

<!--more-->

当然，我们可以使用环境变量和统一的配置文件来解决这个问题，当我们想改变配置的时候，只需要更改环境变量或者配置文件就可以了，但是对于微服务来说的话，这也是比较麻烦的一件事情，Docker 允许我们在 Dockerfile 中指定环境变量，但是如果我们需要在不同的容器中引用相同的数据呢，如果我们的应用程序是运行在集群上的时候，对于配置主机的环境变量也是难以管理的了。接下来我们来写一个应用程序，最后用`kubernetes`来管理我们的配置信息。

本文涉及到的所有代码都位于此`Gist`中：[https://gist.github.com/cnych/d40756ce6e03035551b6a023135a78d9](https://gist.github.com/cnych/d40756ce6e03035551b6a023135a78d9)


### 1. 编写应用
下面是我们简单定义的一个 WEB 服务，其中 TOKEN 和 LANGUAGE 是硬编码在程序代码中的，如下：（**hardcode-app.py**）
```python
# -*- coding: utf-8 -*-
from flask import Flask, jsonify
app = Flask(__name__)


@app.route("/")
def index():
    TOKEN = 'abcdefg123456'
    LANGUAGE = 'English'
    return jsonify(token=TOKEN, lang=LANGUAGE)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

如果我们现在想要改变 TOKEN 或者 LANGUAGE 的话，我们就需要手动去修改上面的代码了，这就有可能会导致新的 BUG 或者安全漏洞之类的。

下面我们来用环境变量代替上面的参数吧。


### 2. 使用环境变量
使用环境变量还是比较容易的，大部分编程语言都有内置的方式去读取环境变量，我们这里是 python，直接使用`os`包下面的 getenv 方法即可获取：（**read-env-app.py**）
```python
# -*- coding: utf-8 -*-
import os
from flask import Flask, jsonify
app = Flask(__name__)


@app.route("/")
def index():
    TOKEN = os.getenv('TOKEN', '')
    LANGUAGE = os.getenv('LANGUAGE', '')
    return jsonify(token=TOKEN, lang=LANGUAGE)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

现在我们就可以通过设置环境变量而不是直接去修改源码来改变我们的配置了。在 Unix 系统（MacOS和Linux）下面，我们可以通过在终端中执行下面的命令来设置环境变量：
```shell
$ export TOKEN=abcdefg0000
$ export LANGUAGE=English
```

对于 Windows 系统，我们就通过可以通过`cmd`命令进入终端，执行下面的命令来设置环境变量：
```shell
setx TOKEN "abcdefg0000"
setx LANGUAGE "English"
```

另外我们也可以在启动服务的时候设置环境变量，比如，对于我们的这个`flask`应用，我们可以这样运行：
```shell
$ TOKEN=abcdefg0000 LANGUAGE=English python read-env-app.py
 * Running on http://0.0.0.0:5000/ (Press CTRL+C to quit)
127.0.0.1 - - [10/Feb/2018 15:15:14] "GET / HTTP/1.1" 200 -
```
然后我们浏览器中打开地址[http://127.0.0.1:5000/](http://127.0.0.1:5000/)，可以看到下面的输出信息：
```json
{
    "lang": "English",
    "token": "abcdefg0000"
}
```
证明我们的环境变量设置生效了......


### 3. 使用 Docker 的环境变量
我们现在来使用容器运行我们的应用程序，我们就可以不依赖主机的环境变量了，每个容器都有自己的环境变量，所以保证容器的环境变量正确的配置就显得尤为重要了。幸运的是，Docker 可以非常轻松的构建带有环境变量的容器，在`Dockerfile`文件中，我们可以通过`ENV`指令来设置容器的环境变量。

```Dockerfile
FROM python:3.6.4

# 设置工作目录
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
# 安装依赖
RUN pip install flask
# 添加应用
ADD . /usr/src/app

# 设置环境变量
ENV TOKEN abcdefg0000
ENV LANGUAGE English

# 暴露端口
EXPOSE 5000
# 运行服务
CMD python read-env-app.py
```
将上面的文件保存为`Dockerfile`，放置在`read-env-app.py`文件同目录下面，然后我们可以构建镜像：
```shell
$ docker build -t cnych/envtest .
```

构建成功后，我们可以使用上面的`cnych/envtest`镜像启动一个容器：
```shell
$ docker run --name envtest --rm -p 5000:5000 -it cnych/envtest
* Running on http://0.0.0.0:5000/ (Press CTRL+C to quit)
```
同样的我们可以通过标记`-e`来覆盖容器的环境变量：
```shell
$ docker run --name envtest --rm -e TOKEN=abcdefg88888 -e LANGUAGE=English -p 5000:5000 -it cnych/envtest
 * Running on http://0.0.0.0:5000/ (Press CTRL+C to quit)
```
然后我们在浏览器中打开[http://127.0.0.1:5000/](http://127.0.0.1:5000/)可以看到下面的输出信息证明我们的环境配置成功了：
```json
{
    "lang": "English",
    "token": "abcdefg88888"
}
```

### 4. 使用 Kubernetes 的环境变量
当我们开始使用`Kubernetes`的时候，情况又不太一样了，我们可能会在多个 Kubernetes Deployment 中使用相同的 Docker 镜像，我们也可能希望对 Deployment 进行 A/B 测试，对不同的 Deployment 设置不同的配置信息。

和上面的 Dockerfile 一样，我们可以在 Kubernetes Deployment 的`YAML`文件中指定环境变量，这样我们就可以在不同的 Deployment 中设置不同的环境变量：（**read-env.yaml**）
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: envtest
  labels:
    name: envtest
spec:
  replicas: 1
  template:
    metadata:
      labels:
        name: envtest
    spec:
      containers:
      - name: envtest
        image: cnych/envtest
        ports:
        - containerPort: 5000
        env:
        - name: TOKEN
          value: "abcd123456"
        - name: LANGUAGE
          value: "English"
```

注意上面的 POD 的 env 部分，我们可以在这里指定我们想要设置的环境变量，比如这里我设置了 TOKEN 和 LANGUAGE 两个环境变量！


### 5. 使用 Kubernetes 的 Secrets 和 ConfigMap 进行配置
`Docker`和`Kubernetes`环境变量的不足之处在于它们是和容器的部署相关的，如果我们想要更改它们的话，就得重新构建容器或者修改 Deployment，更麻烦的是，如果想将变量用于多个容器或 Deployment 的话，就必须将配置复制过去。

幸运的是，`Kubernetes`中提供了`Secrets`（用于比较私密的数据）和`ConfigMap`（用于非私密的数据）两种资源可以很好的解决我们上面的问题。

Secret 和 ConfigMap 之间最大的区别就是 Secret 的数据是用`Base64`编码混淆过的，不过以后可能还会有其他的差异，对于比较机密的数据（如API密钥）使用 Secret 是一个很好的做法，但是对于一些非私密的数据（比如数据目录）用 ConfigMap 来保存就很好。

我们将 TOKEN 保存为 Secret：
```shell
$ kubectl create secret generic token --from-literal=TOKEN=abcd123456000
```

然后将 LANGUAGE 参数保存为 ConfigMap：
```shell
$ kubectl create configmap language --from-literal=LANGUAGE=English
```

然后我们可以通过下面的命令查看创建的 Secret 和 ConfigMap：
```shell
$ kubectl get secret
NAME                  TYPE                                  DATA      AGE
default-token-6s2bc   kubernetes.io/service-account-token   3         42d
token                 Opaque                                1         1m
$  kubectl get configmap
NAME       DATA      AGE
language   1         1m
```

现在，我们可以重新修改 Kubernetes Demployment 的 YAML 文件：（**final-read-env.yaml**）
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: envtest
  labels:
    name: envtest
spec:
  replicas: 1
  template:
    metadata:
      labels:
        name: envtest
    spec:
      containers:
      - name: envtest
        image: cnych/envtest
        ports:
        - containerPort: 5000
        env:
        - name: TOKEN
          valueFrom:
            secretKeyRef:
              name: token
              key: TOKEN
        - name: LANGUAGE
          valueFrom:
            configMapKeyRef:
              name: language
              key: LANGUAGE
```
我们将之前的硬编码 env 的值更改为从 secret 和 ConfigMap 中读取。


### 6. 更新 Secret 和 ConfigMap
上面我们已经提到过，使用 Kubernetes 来管理我们的环境变量后，意味这我们不必更改代码或者重新构建镜像来改变环境变量的值了。由于 POD 在启动的时候会缓存环境变量的值，所以如果我们要更改环境变量的值的话，需要以下两个步骤：

首先，更新 Secret 或者 ConfigMap：
```shell
$ kubectl create configmap language --from-literal=LANGUAGE=Chinese -o yaml --dry-run | kubectl replace -f -
configmap "language" replaced
$ kubectl create secret generic token --from-literal=TOKEN=bbbbb123456 -o yaml --dry-run | kubectl replace -f -
secret "token" replaced
```

然后，重启相关的 PODS，重启 POD 有很多方法，比如我们可以直接更新 Deployment，最简单的方法是我们可以直接手动删除 POD，然后 Deployemnt 会自动重建一个 POD起来的。
```shell
$ kubectl delete pod -l name=envtest
pod "envtest-55d6ff7675-zqb75" deleted
```
然后我们可以通过查看 POD 确定新的 POD 启动起来了：
```shell
$ kubectl get pod -l name=envtest
NAME                       READY     STATUS    RESTARTS   AGE
envtest-55d6ff7675-pkwpj   1/1       Running   0          36s
```

我们可以进入到上面的 POD 容器内部打印下环境变量是否设置成功：
```shell
$ kubectl exec envtest-55d6ff7675-pkwpj -it -- /bin/bash
root@envtest-55d6ff7675-pkwpj:/usr/src/app# echo $TOKEN
bbbbb123456
root@envtest-55d6ff7675-pkwpj:/usr/src/app# echo $LANGUAGE
Chinese
```
我们可以看到我们的环境变量已经更新成功了。

当然对于特别复杂的应用，单纯的只用 Secret 和 ConfigMap 来管理配置信息，可能也是不太现实的，这就需要引入配置中心的概念来进行统一管理我们的配置了，关于`配置中心`我们以后再进行相关的讨论吧。

### 参考资料

* [https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/)
* [https://kubernetes.io/docs/concepts/configuration/secret/](https://kubernetes.io/docs/concepts/configuration/secret/)


扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)


