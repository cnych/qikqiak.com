---
title: Go1.16 使用 Embed 嵌入静态资源（视频）
date: 2021-02-18
tags: ["golang", "1.16", "embed"]
slug: go1.16-embed
keywords: ["go", "golang", "1.16", "静态", "资源", "嵌入"]
gitcomment: true
category: "golang"
---

{{% bilibili src="//player.bilibili.com/player.html?aid=204190353&bvid=BV13h411y7iZ&cid=299340988&page=1" %}}

go1.16 版本已经 release 了，推出了一些新功能特性，其中有一个 embed 的新功能，通过 embed 可以将静态资源文件直接打包到二进制文件中，这样当我们部署 Web 应用的时候就特别方便了，只需要构建成一个二进制文件即可，以前也有一些第三方的工具包可以支持这样的操作，但是毕竟不是官方的。接下来我们就来为大家简单介绍下 embed 功能的基本使用。

<!--more-->

## 安装

要测试 embed 功能，当然需要我们更新 go 到 1.16 版本，我们可以通过下面的方式进行安装，当然也可以直接下载安装包配置([https://golang.org/dl/#go1.16](https://golang.org/dl/#go1.16))。

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210218113657.png)

## 示例

查看下面的简单示例：

```go
package main

import (
	_ "embed"
	"fmt"
)

//go:embed hello.txt
var s string

func main() {
	fmt.Println(s)
}
```

可以看到上面的代码中出现了一个 `go:embed` 关键字的注解，通过该注解可以直接读取本地静态文件，在上面代码目录下面创建 hello.txt 静态文件，然后就可以直接编译打包运行了：

```go
➜  go1.16 run main.go 
Hello embed in golang 1.16
➜  cat hello.txt        
Hello embed in golang 1.16%                                                               
➜  go1.16 run main.go
Hello embed in golang 1.16
➜  go1.16 build main.go 
➜  rm hello.txt                                  
➜  ./main                        
Hello embed in golang 1.16
```

可以看到我们已经将静态文件直接打包进了二进制文件中。此外还可以引用多个文件或目录：

```go
package server

import "embed"

// content holds our static web server content.
//go:embed image/* template/*
//go:embed html/index.html
var content embed.FS
```

可以看到 `go:embed` 支持多个目录、单个文件或者多个文件，如果在代码中没有使用到 `embed.FS`，则需要在 import 的时候加上 `_` 。
<!--adsense-text-->
下面我们再和大家演示下如何将 embed 和 Gin 框架进行整合。

## 集成 **Gin**

假设 Gin 项目下需要使用静态资源以及 Template 视图模板，结构如下所示：

```bash
├── assets
│   └── images
│       └── k8sjob.png
├── go.mod
├── go.sum
├── main.go
└── templates
    ├── foo
    │   └── bar.tmpl
    └── index.tmpl
```

现在我们利用 embed 就可以将上面的 templates 和 assets 目录直接打包到二进制文件中，直接查看 `main.go`：

```go
package main

import (
	"embed"
	"html/template"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed assets/* templates/*
var f embed.FS

func main() {
	router := gin.Default()
	templ := template.Must(template.New("").ParseFS(f, "templates/*.tmpl", "templates/foo/*.tmpl"))
	router.SetHTMLTemplate(templ)

	// example: /public/assets/images/k8sjob.png
	router.StaticFS("/public", http.FS(f))

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.tmpl", gin.H{
			"title": "Embed Demo",
		})
	})

	router.GET("/foo", func(c *gin.Context) {
		c.HTML(http.StatusOK, "bar.tmpl", gin.H{
			"title": "Foo Bar",
		})
	})

	router.Run(":8080")
}
```

我们只需要使用简单的两行代码就可以将静态资源文件进行打包了：

```go
//go:embed assets/* templates/*
var f embed.FS
```

静态资源文件可以通过下面的路由进行访问：

```go
// example: /public/assets/images/k8sjob.png
router.StaticFS("/public", http.FS(f))
```

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20210218142211.png)

## 总结

有了 embed 这项功能后，当我们部署 Golang 应用的时候，就可以直接忽略静态资源文件了，变成一个单纯的二进制文件，以后对于一些相对私密的文件也可以通过该方式直接在构建流水线中替换掉再进行编译打包，实在是太方便了。

<!--adsense-self-->