---
title: Python 虚拟环境全知道
date: 2018-01-09
tags: ["python", "pyenv", "virtualenv", "docker"]
keywords: ["python", "pyenv", "virtualenv", "docker", "虚拟"]
slug: python-virtualenv-all-know
gitcomment: true
bigimg: [{src: "/img/posts/photo-1500644970114-4ff3c3dfb61f.jpeg", desc: "Reach for the End."}]
category: "python"
---

对于每个`python`项目依赖的库版本都有可能不一样，如果将依赖包都安装到公共环境的话显然是没法进行区分的，甚至是不同的项目使用的`python`版本都不尽相同，有的用`python2.7`，有的用`python3.6`，所以对于`python`项目的环境进行隔离管理就成为一个必然的需求了。

<!--more-->

## 需求

* 不同项目间能区分依赖包版本
* 不同项目间能区分`python`版本
* 方便自由切换

## 解决方案

* 解决依赖包问题：`virtualenv`
* 解决`python`版本问题：`pyenv`
* 终极(也许吧)解决方案：`docker`

### virtualenv
运行`pip install virtualenv`即可安装`virtualenv`，当然了还可以用`easy_install`安装，即使是没有安装任何`Python`包管理器(比如**pip**)，也可以直接获取[virtualenv.py](https://raw.github.com/pypa/virtualenv/master/virtualenv.py)并运行`python virtualenv.py`，效果也是一样的，当然我还是强烈推荐你安装包管理工具：`pip`，他一定能为你带来很多便利的(新版本的`virtualenv`也包含了`pip`管理工具)。
```shell
$ pip install virtualenv
Collecting virtualenv
  Using cached virtualenv-15.1.0-py2.py3-none-any.whl
Installing collected packages: virtualenv
Successfully installed virtualenv-15.1.0
```
安装完成后，就可以直接创建一个虚拟环境了(**virtualenv 环境名称**):
```shell
$ virtualenv env4test
```
创建完成后，用下面的命令即可激活当前虚拟环境：
```shell
$ source env4test/bin/activate
(env4test)$
```
现在就可以随意的安装你的依赖包了，现在安装的包只会对当前环境`env4test`有效，比如安装`django2.0`：
```shell
(env4test)$ pip install django
```
要退出当前虚拟环境也是非常简单的，如下：
```shell
$ deactivate
```
现在我们用`pip list`命令可以发现已经没有`django`的身影了。

`virtualenv`还有很多高级的用法，可以[前往该文档查看](https://virtualenv-chinese-docs.readthedocs.io/en/latest/)。

### virtualenvwrapper
`virtualenvwrapper`是`virtualenv`的一个扩展包，可以让你更加方便的使用`virtualenv`，优点：

* 将所有虚拟环境整合在一个目录下
* 管理（新增，删除，复制）虚拟环境
* 方便切换虚拟环境

安装也很方便，用包管理工具即可：
```shell
$ pip install virtualenvwrapper
```
安装完成以后还需要小小的配置一下才可以使用，首先我们找到`virtualenvwrapper.sh`的文章，通常会是：`/usr/local/bin/virtualenvwrapper.sh`：
```shell
$ sudo find / -name virtualenvwrapper.sh
Password:
/usr/local/bin/virtualenvwrapper.sh
```
然后我们可以在`.zshrc`(取决于你用的终端，我用的`zsh`)添加一行命令：
```txt
source /usr/local/bin/virtualenvwrapper.sh
```
然后让我们的配置生效：
```shell
$ source ~/.zshrc
```
现在我们就可以使用`virtualenvwrapper`的基本命令了：

* 创建基本环境：**mkvirtualenv** [环境名]
* 删除环境：**rmvirtualenv** [环境名]
* 激活环境：**workon** [环境名]
* 退出环境：**deactivate**
* 列出所有环境：**workon**或者**lsvirtualenv -b**

参考文档：[https://virtualenvwrapper.readthedocs.io/en/latest/](https://virtualenvwrapper.readthedocs.io/en/latest/)


### pyenv
`pyenv`是`Python`版本管理工具，可以改变全局的`Python`版本，安装多个版本的`Pytho`，设置目录级别的`Python`版本，还能创建和管理虚拟环境。所有的设置都是用户级别的操作，不需要`sudo`命令。
`pyenv`通过系统修改环境变量来实现`Python`不同版本的切换。而`virtualenv` 通过将`Python`包安装到一个目录来作为`Python` 包虚拟环境，通过切换目录来实现不同包环境间的切换。

如果你使用的`MAC`系统，推荐使用`homebrew`来安装：
```shell
$ brew update
$ brew install pyenv
```
如果你使用的是其他系统，也不担心，`pyenv`官方提供了一键安装的方式：
```shell
$ curl -L https://raw.githubusercontent.com/pyenv/pyenv-installer/master/bin/pyenv-installer | bash
```
安装完成以后，可以添加几条命令到`.zshrc`(同样的也可能是.bashrc，根据自己使用的终端进行配置)中开启自动补全功能：
```txt
export PATH=$HOME/.pyenv/bin:$PATH
eval "$(pyenv init -)"
eval "$(pyenv virtualenv-init -)"
```
然后同样激活上面的配置：
```shell
$ source ~/.zshrc
```
现在我们就可以使用`pyenv`了：

* 查看本机安装`Python`版本：
```shell
$ pyenv versions
∗ system (set by /Users/ych/.pyenv/version)
  3.6.4
  3.6.4/envs/ops3.6.4
  3.6.4/envs/talk3.6.4
  ops3.6.4
  talk3.6.4
```
星号表示当前正在使用的`Python`版本。

* 查看所有可安装的`Python`版本：
```shell
$ pyenv install -l
```

* 安装与卸载：
```shell
$ pyenv install 2.7.3   # 安装python
$ pyenv uninstall 2.7.3 # 卸载python
```

* 版本切换：
```shell
$ pyenv global 2.7.3
$ pyenv local 2.7.3
```
`global`用于设置全局的`Python`版本，通过将版本号写入`~/.pyenv/version`文件的方式。`local`用于设置本地版本，通过将版本号写入当前目录下的`.python-version`文件的方式。通过这种方式设置的`Python`版本优先级比`global`高。

* `python`优先级：`shell > local > global`
`pyenv`会从当前目录开始向上逐级查找`.python-version`文件，直到根目录为止。若找不到，就用`global`版本。
```shell
$ pyenv shell 2.7.3 # 设置面向 shell 的 Python 版本，通过设置当前 shell 的 PYENV_VERSION 环境变量的方式。这个版本的优先级比 local 和 global 都要高。
$ pyenv shell --unset  # –unset 参数用于取消当前 shell 设定的版本。
```

### pyenv-virtualenv
自动安装`pyenv`后，它会自动安装部分插件，通过`pyenv-virtualenv`插件可以很好的和`virtualenv`进行结合：
```shell
$ ls -la ~/.pyenv/plugins
total 8
drwxr-xr-x   9 ych  staff  288 12 26 16:27 .
drwxr-xr-x  23 ych  staff  736 12 26 17:44 ..
-rw-r--r--   1 ych  staff   52 12 26 16:26 .gitignore
drwxr-xr-x  11 ych  staff  352 12 26 16:27 pyenv-doctor
drwxr-xr-x  12 ych  staff  384 12 26 16:27 pyenv-installer
drwxr-xr-x   7 ych  staff  224 12 26 16:27 pyenv-update
drwxr-xr-x  13 ych  staff  416 12 26 16:27 pyenv-virtualenv
drwxr-xr-x   8 ych  staff  256 12 26 16:27 pyenv-which-ext
drwxr-xr-x   8 ych  staff  256 12 26 16:26 python-build
```

基本使用命令：

* 列出当前虚拟环境：`pyenv virtualenvs`
* 激活虚拟环境：`pyenv activate 环境名称`
* 退出虚拟环境：`pyenv deactivate`
* 删除虚拟环境：`pyenv uninstall 环境名称`或者`rm -rf ~/.pyenv/versions/环境名称`
* 创建虚拟环境：`pyenv virtualenv 3.6.4 env3.6.4`

> 若不指定python 版本，会默认使用当前环境python 版本。如果指定Python 版本，则一定要是已经安装过的版本，否则会出错。环境的真实目录位于`~/.pyenv/versions`下。


总结：利用`pyenv`和`pyenv-virtualenv`插件就能够简单方便的将`python`版本和依赖包进行环境隔离了，在实际开发过程中比较推荐这种方式。

参考文档：[https://github.com/pyenv/pyenv](https://github.com/pyenv/pyenv)。


### Docker
有没有一种方式能够不按照这些工具来进行环境隔离的呢？当然有，那就是大名鼎鼎的`Docker`。如果你的服务都是容器化的话，应该对`Docker`不陌生，将当前项目跑在一个隔离的容器中，对系统中的其他服务或者项目是没有任何影响的，不用担心会污染环境，唯一不友好的地方是项目中的代码改变后需要重新构建镜像。

比如现在有一个`django`的项目，项目结构如下：
```shell
$ testpyenv  tree
.
├── manage.py
└── testpyenv
    ├── __init__.py
    ├── settings.py
    ├── urls.py
    └── wsgi.py
```
在项目根目录下面新建文件`requirements.txt`：
```txt
Django==2.0
```
然后我们在根目录下面创建一个`Dockerfile`文件：
```dockerfile
FROM python:3.6.4

# 设置工作目录
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# 添加依赖（利用Docker 的缓存）
ADD ./requirements.txt /usr/src/app/requirements.txt

# 安装依赖
RUN pip install -r requirements.txt

# 添加应用
ADD . /usr/src/app

# 运行服务
CMD python manage.py runserver 0.0.0.0:8000
```
因为`django2.0`只支持`python3`以上了，所以我们这里基础镜像使用`python:3.6.4`，然后是添加应用代码，安装依赖，运行服务等。然后我们构建一个镜像：
```shell
$ docker build -t cnych/testpyenv:v0.1.1 .
```
构建完成以后，在我们项目根目录中新建一个`start.sh`的脚本来启动容器：
```txt
docker run -d -p 8000:8000 --name testpyenv cnych/testpyenv:v0.1.1
```
将本地的`8000`端口和容器的`8000`进行映射，执行我们的启动脚本：
```shell
$ source start.sh
```
启动完成后，我们就可以在本地通过`http://127.0.0.1:8000`进行访问了。
![django-index](/img/posts/django2-index.jpg)
但是如果只这样配置的话，的确能够解决我们的环境隔离问题，但是现在有一个最大的一个问题是，每次代码更改过后都需要重新构建镜像才能生效，这对于开发阶段是非常不友好的，有什么解决方案呢？你是否还记得当你更改了代码后`django`项目会自动加载的，要是每次更改了项目代码后，容器中的代码也变化的话那岂不是容器中的服务也自动加载了？是不是？

幸好`Docker`为我们提供了`volume`挂载的概念，我们只需要将我们的代码挂载到容器中的工作目录就行了，现在来更改`start.sh`脚本：
```txt
work_path=$(pwd)
docker run -d -p 8000:8000 --name testpyenv -v ${work_path}:/usr/src/app cnych/testpyenv:v0.1.1
```
然后激活启动脚本，随意更改一次代码，看看是否能够及时生效，怎样查看呢？查看日志就行了：
```shell
$ docker logs -f testpyenv
```
最后，如果是生产环境记得把代码挂载给去掉，因为线上不需要这样做，只需要构建一次就行。


## 参考资料：

* [https://virtualenv-chinese-docs.readthedocs.io/en/latest/](https://virtualenv-chinese-docs.readthedocs.io/en/latest/)
* [https://virtualenvwrapper.readthedocs.io/en/latest/](https://virtualenvwrapper.readthedocs.io/en/latest/)
* [https://github.com/pyenv/pyenv](https://github.com/pyenv/pyenv)
* [TDD开发容器化的Python微服务应用(一)](/post/tdd-develop-python-microservice-app)


扫描下面的二维码(或微信搜索`iEverything`)添加我微信好友(注明`python`)，然后可以加入到我们的`python`讨论群里面共同学习
![qrcode](/img/posts/wexin-qrcode.jpeg)
