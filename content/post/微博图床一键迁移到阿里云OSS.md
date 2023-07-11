---
title: 微博图床一键迁移到阿里云 OSS
date: 2019-04-25
tags: ["微博", "阿里云", "OSS", "图床"]
keywords: ["微博", "阿里云", "OSS", "图床"]
slug: sina-img-transfer-to-oss
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/654ck.jpeg",
      desc: "sinaimgmover",
    },
  ]
category: "极客"
---

今天发现博客上大量图片显示不出来了，打开`Chrome`控制台一看出现了大量的 403 图片

![sina image 403](https://picdn.youdianzhishi.com/images/2mmzz.png)

这就是薅微博图床的羊毛的后果，应该是微博图床这边升级了访问策略，幸运的是直接打开图片地址还是可以访问的，不然就有得 ಥ_ಥ 了，这么多图片丢失了那就坑爹了，怎么办？迁移呗~~

<!--more-->

怎么迁移？把图片一张一张的下载下来，然后换一个存放图片的服务？这未免太麻烦了吧，这么多图片~~~，真是应了那句话：**微博图床一时爽，迁移火葬场[奸笑]**

于是花了一点点时间写了个小程序来一键将微博图床里面的图片一键迁移到阿里云`OSS`上面。这个程序使用起来很简单，提供几个阿里云`OSS`的一些参数即可，比如 bucket、accessKey、accessSecret：

```shell
$ mover -h
基于 Golang 开发的一个用于将微博图床一键迁移到云服务的工具
      目前只支持阿里云 OSS，文档查看：https://github.com/cnych/sinaimgmover

Usage:
  mover [flags]
  mover [command]

Available Commands:
  help        Help about any command
  oss         迁移到阿里云 OSS

Flags:
  -h, --help            help for mover
  -l, --length int      指定上传到OSS上面的图片名称长度，默认值：6 (default 6)
  -p, --post string     指定markdown文章路径，默认值：当前目录 (default "./")
  -f, --prefix string   Bucket下面的文件夹目录，默认值： images (default "images")

Use "mover [command] --help" for more information about a command.
```

示例：

```
$ mover oss --bucket=bxdc-static --key=xxxx --secret=xxxx --post=/Users/ych/devs/workspace/www.qikqiak.com/content/page
成功替换了图片：https://ws3.sinaimg.cn/large/006tKfTcgy1g1o2gcoqs2j30u021fe81.jpg
成功替换了图片：https://ws3.sinaimg.cn/large/006tKfTcgy1g1o2gcoqs2j30u0212233.jpg
......
```

心情舒畅多了~~~

> 可以根据自己需要扩展迁移至其他云服务......

`v0.2`版本更新：

- 提取公共接口
- 使用 Cobra 制作 CLI
- 优化代码
- 支持横向扩展其他云服务

源码地址：[https://github.com/cnych/sinaimgmover](https://github.com/cnych/sinaimgmover)
