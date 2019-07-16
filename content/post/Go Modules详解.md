---
title: Go Modules 基本使用（视频）
subtitle: Go 语言全新依赖管理系统 Go Modules
date: 2019-07-16
tags: ["golang", "modules"]
slug: go-modules-usage
keywords: ["go", "golang", "模块", "govendor", "modules", "依赖"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1563247709-3f02e3aaaca7.jpeg", desc: "https://unsplash.com/photos/FW6vnOnqUZQ/"}]
category: "golang"
---

Go 语言中一直被人诟病的一个问题就是没有一个比较好用的依赖管理系统，GOPATH 的设计让开发者一直有很多怨言，在 Go 语言快速发展的过程中也出现了一些比较优秀的依赖管理工具，比如 govendor、dep、glide 等，有一些差不多成了半官方的工具了，但是这些工具都还是需要依赖于 GOPATH，为了彻底解决这个“祸水”，随着 Go1.11 的发布，Golang 官方给我们带来了依赖管理的全新特性`Go Modules`，这是 Golang 全新的一套依赖管理系统。下面我们就来看下 Go Modules 是如何使用的。

<!--more-->

## 新建 Module
要使用 Go Modules 首先需要保证你环境中 Golang 版本大于1.11：
```shell
$ go version
go version go1.11.4 darwin/amd64
```

我们说 Go Modules 主要就是为了消除 GOPATH 的，所以我们新建的项目可以完全不用放在`$GOPATH/src`目录下面，任何地方都可以：
```shell
$ echo $GOPATH
/Users/ych/devs/projects/go/
```

我们在目录`/Users/ych/devs/projects`下面创建一个用于测试的工作目录：
```shell
$ pwd
/Users/ych/devs/projects
$ mkdir stardust && cd stardust
```

在 stardust 目录下面创建一个用于字符串操作的 stringsx 的包：
```shell
$ mkdir stringsx && cd stringsx
```

在包 stringsx 下面创建一个 string.go 的文件：
```go
package stringsx

import (
    "fmt"
)

func Hello(name string) string{
	return fmt.Sprintf("Hello, %s", name), nil
}
```

现在我们的包里面的代码准备完成了，但还不是一个模块，我们需要使用 Go Modules 来做一些工作：
```shell
$ export GO111MODULE=on  # 开启GoModule特性
```

{{% video mp4="https://vdn.youdianzhishi.com/course/2019/7/13/go-modules.min.mp4" poster="https://sdn.haimaxy.com/covers/2019/5/25/5089dc263d514efa906259eae0b99317.png" %}}

[点击查看 Golang 实战课程](https://youdianzhishi.com/course/67kv5m/)

然后在项目根目录下面初始化 Go Module：
```shell
$ pwd
/Users/ych/devs/projects/stardust
$ go mod init github.com/cnych/stardust
go: creating new go.mod: module github.com/cnych/stardust
```

我们这里使用了一个命令：`go mod init 模块名`，该命令会在当前目录下面生成一个`go.mod`的文件，生成的内容就是包含一个模块名称的声明：
```
module github.com/cnych/stardust
```

> 要注意`模块名`非常重要，就这相当于声明了我们的模块名称，以后要想使用该模块就需要使用这个名称来获取模块。

这一步操作非常简单，但是将我们当前的包变成了一个 Module 了，现在我们可以将这个代码推送到代码仓库上，我这里使用的是 Github，仓库地址：[https://github.com/cnych/stardust](https://github.com/cnych/stardust)
```shell
$ git init
$ git add .
$ git commit -am "add stringsx package content"
$ git remote add origin git@github.com:cnych/stardust.git
$ git push -u origin master
```

到这里我们就完成了一个最简单的 Go Module 的编写，其他任何开发者想要使用我们这个模块的用户都可以通过`go get`命令来获取了：
```shell
$ go get github.com/cnych/stardust
```

不过上面的命令是获取 master 分支的最新代码，这样当然没有问题，但不是一个最佳实践的方式，因为很有可能我们这个模块会有新的内容更新，或者有一些 BUG 需要修复，如果我们都放在 master 分支上面的话，势必会造成使用者的混乱，因为很有可能使用者的代码在我们模块更新后就不兼容了，不过也不用担心，Go Moduels 就可以很好的来解决这个版本的问题。
<!--adsense-text-->

## Module 版本管理
Go Modules 是需要进行版本化管理的，就类似于我们平时写代码一样用不同的版本来进行区分。对于 Go Modules 的版本强烈推荐使用语义化的版本控制，对于语义化的版本控制我们查看响应的文档说明：[https://semver.org](https://semver.org/lang/zh-CN/)，最主要的一个版本规则如下：

版本格式：`主版本号.次版本号.修订号`，版本号递增规则如下：

* 主版本号：当你做了不兼容的 API 修改，
* 次版本号：当你做了向下兼容的功能性新增，
* 修订号：当你做了向下兼容的问题修正。

> 先行版本号及版本编译元数据可以加到“主版本号.次版本号.修订号”的后面，作为延伸。

我们在使用 Go Modules 查找版本的时候会使用仓库中的 tags，并且某些版本和其他版本有一些不同之处，比如 v2 或者更高的版本要和 v1 的版本模块的导入路径要不同，这样才可以通过模块来区分使用的是不同的版本，当然默认情况下，Golang 会获取仓库中最新的 tag 版本。

> 所以最重要的一点就是要发布我们的模块，我们需要使用 git tag 来标记我们的仓库版本。

### 发布第一个版本
假如现在我们的包已经准备好了，可以发布 release 包了，首先我们就需要给当前的包打上一个 git tag，要记住使用语义化的版本，比如我们这里第一个版本就叫：`v1.0.0`：
```shell
$ git tag v1.0.0
$ git push --tags
```

![git tag](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/git-tag-v1.png)

这样我们就会在 Github 上面创建了一个名为 v1.0.0 的 tag，但是一个更好的方式是去创建一个名为`v1`的新分支，这样可以方便以后修复当前版本代码中的 BUG，也不会影响到 master 或者其他分支的一些代码：
```shell
$ git checkout -b v1
$ git push -u origin v1
```

现在我们就完全不用担心会影响到我们之前的版本了。


### 模块使用
现在我们的模块已经准备好了，现在我们来创建一个简单的程序来使用上面的模块：
```shell
$ pwd
/Users/ych/devs/projects
$ mkdir ch26-gomodules && cd ch26-gomodules
```

然后在 ch26-gomodules 目录下面创建一个 main.go 的文件：
```go
package main

import (
	"fmt"
	"github.com/cnych/stardust/stringsx"
)

func main() {
	fmt.Println(stringsx.Hello("cnych"))
}

```

程序里面使用了`github.com/cnych/stardust/stringsx`这个包，在以前的话我们直接使用`go get`命令将这个包拉到 GOPATH 或者 vendor 目录下面即可，现在我们是将这个包当成 modules 来使用，首先同样的在当前目录下面初始化模块：
```shell
$ go mod init ch26-gomodules
```

同样的，该命令会在目录下面新建一个`go.mod`的文件：
```
module ch26-gomodules
```

这个时候我们来直接运行下我们当前的程序：
```shell
$ go run main.go
go: finding github.com/cnych/stardust v1.0.0
go: downloading github.com/cnych/stardust v1.0.0
Hello, cnych
```

上面的命令会去自动下载程序中导入的包，下载完成后可以查看下`go.mod`文件内容：
```
module ch26-gomodules

require github.com/cnych/stardust v1.0.0
```

并且还在当前目录下面生成了一个名为`go.sum`的新文件，里面包含了依赖包的一些 hash 信息，可以用来确保文件和版本的正确性：
```
github.com/cnych/stardust v1.0.0 h1:8EcmmpIoIxq2VrzXdkwUYTD4OcMnYlZuLgNntZ+DxUE=
github.com/cnych/stardust v1.0.0/go.mod h1:Qgo0xT9MhtGo0zz48gnmbT9XjO/9kuuWKIOIKVqAv28=
```

模块会被下载到`$GOPATH/pkg/mod`目录下面去：
```shell
$  ls $GOPATH/pkg/mod/github.com/cnych 
stardust@v1.0.0
```

这样我们就成功使用了上面我们编写的 v1.0.0 版本的 github.com/cnych/stardust 这个模块。

### 发布一个 bugfix 版本
比如现在我们发现之前模块中的 Hello 函数有 bug，所以我们需要修复并发布一个新的版本：
```go
func Hello(name string) string{
	return fmt.Sprintf("Hello, %s!!!", name), nil
}
```

> 这里我们添加3个`!`来模拟 bugfix。

当然要注意我们是在`v1`这个分支上来进行 fix，fix 完成后再 merge 到 master 分支上面去，然后发布一个新的版本，遵从语义化的版本规则，我们这里是修正一个 bug，所以只需要添加修正版本号即可，比如命名为 v1.0.1 版本：
```shell
$ git add .
$ git commit -m "fix Hello function #123"
$ git tag v1.0.1
$ git push --tags origin v1
```

这样我们就发布了修正版本的模块了。

### 更新 modules
默认情况下，Golang 不会去自动更新模块的，如果自动更新的话是不是又会造成依赖管理的混乱了，所以我们需要明确告诉 Golang 我们需要更新模块，我们可以通过下面几种方式来进行模块的更新：

* 运行`go get -u xxx`命令来获取最新的模块（比如我们这里执行的话就会从v1.0.0更新到v1.0.1版本）
* 运行`go get package@version`命令来更新到指定版本的模块
* 直接更新`go.mod`文件中的模块依赖版本，然后执行`go mod tidy`命令来进行更新

当我们这里用任何一种方式都是可以的，比如用第二种方式：
```shell
$ go get github.com/cnych/stardust@v1.0.1
```

更新完成后，可以查看`go.mod`文件中的依赖模块的版本变化：
```
module ch26-gomodules

require github.com/cnych/stardust v1.0.1
```

这个时候同样可以查看下 mod 文件夹下面的模块：
```shell
$  ls $GOPATH/pkg/mod/github.com/cnych
stardust@v1.0.0 stardust@v1.0.1
```

看到这里我们是不是就明白 Go Modules 是通过怎样的方式来进行版本控制的了？每个版本都是独立的文件夹，这样是不是就不会出现版本冲突了。
<!--adsense-text-->

### 主版本升级
根据语义化版本规则，主版本升级是不向后兼容的，从 Go Modules 的角度来看，主版本是一个完全不同的模块了，因为我们认为两个大版本之间是互相不兼容的，那么我们怎么设计 Go Modules 来支持两个大版本呢？比如现在我们来修改下模块中的 Hello 函数，增加对语言的一个支持：
```go
func Hello(name, lang string) (string, error) {
	switch lang {
	case "en":
		return fmt.Sprintf("Hi, %s!", name), nil
	case "zh":
		return fmt.Sprintf("你好, %s!", name), nil
	case "fr":
		return fmt.Sprintf("Bonjour, %s!", name), nil
	default:
		return "", fmt.Errorf("unknow language")
	}
}
```

> 记住要切换到 master 分支进行修改，因为 v1 分支和我们现在修改的内容是完全不同的版本了。

这里我们的函数需要两个参数，返回也是两个参数，直接按照之前 v1 版本中的函数使用肯定是会出错的，所以我们这里新版本的模块就不打算再去兼容之前 1.x 的模块了，这个时候我们需要更新版本到 v2.0.0，那么怎么去区分这两个大版本呢？这个时候我们去更改 v2 版本的模块路径就可以了，比如变成`github.com/cnych/stardust/v2`，这样 v2 版本的模块和之前 v1 版本的模块就是两个完全不同的模块了，我们在使用新版本的模块的时候只需要在模块名称后面添加上 v2 就可以了。
```
module github.com/cnych/stardust/v2
```

接下来和前面的操作一样的，给当前版本添加一个名为 v2.0.0 的 git tag，当然最好还是创建一个名为 v2 的分支，这样可以将版本之间的影响降到最低：
```shell
$ git add .
$ git commit -m "change Hello function to support lang"
$ git checkout -b v2
$ git tag v2.0.0
$ git push origin v2 --tags
```

这样我们 v2 版本的模块就发布成功了，而且之前我们的程序也不会有任何的影响，因为他还是可以继续使用现有的 v1.0.1 版本，而且使用`go get -u`命令也不会拉取最新的 v2.0.0 版本代码，但是如果对于使用的用户来说，现在要想使用 v2.0.0 版本的模块怎么办呢？

其实很简单，只需要单独引入 v2 版本的模块即可：
```go
package main

import (
	"fmt"
	"github.com/cnych/stardust/stringsx"
	stringsV2 "github.com/cnych/stardust/v2/stringsx"
)

func main() {
	fmt.Println(stringsx.Hello("cnych"))

	if greet, err := stringsV2.Hello("cnych", "zh"); err != nil {
		fmt.Println(err)
	} else {
		fmt.Println(greet)
	}

}
```

这个时候我们去执行`go run main.go`命令当然同样的会去自动拉取`github.com/cnych/stardust/v2`这个模块的代码了：
```shell
$ go run main.go
go: finding github.com/cnych/stardust/v2 v2.0.0
go: downloading github.com/cnych/stardust/v2 v1.0.0
Hi, cnych！！！
你好, cnych!
```

这样我们在同一个 go 文件中就使用了两个不兼容版本的模块。同样这个时候再次查看下`go.mod`文件的变化：
```
module ch26-gomodules

require github.com/cnych/stardust v1.0.1

require github.com/cnych/stardust/v2 v2.0.0
```

默认情况下，Golang 是不会从`go.mod`文件中删除依赖项的，如果我们有不使用的一些依赖项需要清理，可以使用 tidy 命令：
```shell
$ go mod tidy
```

该命令会清除没有使用的模块，也会更新模块到指定的最新版本。


### Vendor
Go Modules 默认会忽略`vendor/`这个目录，但是如果我们还想将依赖放入 vendor 目录的话，我们可以执行下面的命令：
```shell
$ go mod vendor
``` 

该命令会在项目根目录下面创建一个`vendor/`的文件夹，里面会包含所有的依赖模块代码，并且会在该目录下面添加一个名为`modules.txt`的文件，用来记录依赖包的一些信息，比较类似于 govendor 中的 vendor.json 文件。

不过建议还是不要使用该命令，尽量去忘掉 vendor 的存在，如果有一些依赖包下载不下来的，我们可以使用`GOPROXY`这个参数来设置模块代理，比如：
```shell
$ export GOPROXY="https://goproxy.io"
```

阿里云也提供了 Go Modules 代理仓库服务：[http://mirrors.aliyun.com/goproxy/](http://mirrors.aliyun.com/goproxy/)，使用很简单就两步：

* 1.使用 go1.11 以上版本并开启 go module机制：`export GO111MODULE=on`
* 2.导出GOPROXY环境变量：`export GOPROXY=https://mirrors.aliyun.com/goproxy/`

如果你想上面的配置始终生效，可以将这两条命令添加到`.bashrc`中去。


除了使用公有的 Go Modules 代理仓库服务之外，很多时候我们在公司内部需要搭建私有的代理服务，特别是在使用 CI/CD 的时候，如果有一个私有代理仓库服务，会大大的提供应用的构建效率。

我们可以使用[Athens](https://docs.gomods.io/)来搭建私有的代理仓库服务，搭建非常简单，直接用 docker 镜像运行一个服务即可：
```shell
export ATHENS_STORAGE=~/athens-storage
mkdir -p $ATHENS_STORAGE
docker run -d -v $ATHENS_STORAGE:/var/lib/athens \
   -e ATHENS_DISK_STORAGE_ROOT=/var/lib/athens \
   -e ATHENS_STORAGE_TYPE=disk \
   --name goproxy \
   --restart always \
   -p 3000:3000 \
   gomods/athens:latest
```

其中 ATHENS_STORAGE 是用来存放我们下载下来的模块的本地路径，另外 ATHENS 还支持其他类型的存储，比如 内存, AWS S3 或 Minio，都是 OK 的。


然后修改 GOPROXY 配置：
```shell
export GOPROXY=http://127.0.0.1:3000
```

## 总结
一句话：**Go Modules 真的用起来非常爽**，特别是消除了`GOPATH`，这个东西对于 Golang 初学者来说是非常烦人的，很难理解为什么需要进入到特定目录下面才可以编写 Go 代码，现在不用担心了，直接使用`Go Modules`就行。

## 参考资料

* [Using Go Modules - The Go Blog](https://blog.golang.org/using-go-modules)
* [Introduction to Go Modules](https://roberto.selbach.ca/intro-to-go-modules/)
* [语义化版本](https://semver.org/lang/zh-CN/)

<!--adsense-self-->
