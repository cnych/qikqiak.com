---
title: 利用 Hugo Pipes 处理资源文件
date: 2019-04-17
tags: ["Hugo", "Pipes", "webpack"]
slug: hugo-pipes-process-assets
keywords: ["Hugo", "Pipes", "压缩", "合并", "静态资源"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/3m6hw.jpg", desc: "https://unsplash.com/photos/C87vfR6C_aE"}]
category: "hugo"
---

[Hugo](https://www.qikqiak.com/tags/hugo/)是一个非常强大的静态博客生成工具，没错你们正在看的本博客也是用`Hugo`来生成的博客文章。作为一个对速度有着强烈要求的博主，整个网站使用的阿里云的全站加速功能，虽然博客上图片资源不算少，但是大部分用户访问的时候应该速度不算太慢，为了能够进一步提升访问速度，自然而然想到的就是对 CSS 样式或者 JS 文件进行合并压缩了。

<!--more-->

## 介绍

对前端稍微熟悉点的同学应该知道有很多工具可以完成 CSS 或者 JS 的压缩合并，比如 webpack、gulp 等等，但是要使用这些工具就得引入第三方的工具包了，还得写特定的配置文件，比如`webpack.config.js`文件，而且对于 webpack 还是有一定学习成本的，对于有多年前端开发经验的同学都不一定能够很好的使用 webpack。

幸运的是 Hugo 为我们提供了内置的功能：Hugo Pipes，一套专门用来处理资源文件的函数集合。使用 Hugo Pipes 有几个需要注意的点：

1. Asset 文件夹：Asset 文件必须存储在 asset 文件夹下面，默认是`/assets`，当然我们可以通过配置文件中的`asetDir`参数进行配置

2. 通过文件获取资源：为了通过 Hugo Pipes 处理文件，必须使用`resources.Get`获取解析资源，该函数需要传递一个 asset 目录下面的文件的相对路径，比如：
```html
{{ $style := recourses.Get "sass/main.scss" }}
```

3. 发布 Asset：在我们执行了`hugo`命令后，如果我们使用了`.Permalink`或者`.RelPermalink`，assets 资源文件会被发布到`/public`目录下面去。
<!--adsense-text-->
4. 管道操作：为了提高可读性，Hugo Pipes 通过使用 Go 管道符来进行操作，如下面的命令就可以将 scss 文件转换成 css，然后压缩
```html
{{ $style := resources.Get "sass/main.scss" | resources.ToCSS | resources.Minify | resources.Fingerprint }}
<link rel="stylesheet" href="{{ $style.Permalink }}">
```

> `recources.Fingerprint`，这个函数可以用于进行资源的指纹识别和 SRI 校验，通过一个散列函数生成一个 hash 值。


## 使用
比如在我们的博客页面中，每个页面都需要引入4个 CSS 样式文件：bootstrap.css、main.css、search.css、reward.css，我们将这4个样式文件放置在主题根目录下面`assets/css`下，然后在 partials 目录下面新建文件 css-assets.html，内容如下所示：
```html
<!-- Bootstrap Core CSS -->
{{- $bootcss := resources.Get "css/bootstrap.css" -}}

<!-- Theme CSS -->
{{- $maincss := resources.Get "css/main.css" -}}
{{- $searchcss := resources.Get "css/search.css" -}}

<!-- Custom asset css -->
{{- $indexScratch := .Scratch -}}
{{- $indexScratch.Add "cssassets" (slice $bootcss $maincss $searchcss) -}}
{{ if .Site.Params.reward }}
    {{- $rewardcss := resources.Get "css/reward.css" -}}
    {{- $indexScratch.Add "cssassets" (slice $rewardcss) -}}
{{ end }}
{{- range .Site.Params.customCSSAssets -}}
    {{- $indexScratch.Add "cssassets" (slice (resources.Get .)) -}}
{{- end -}}

<!-- Bundle css -->
{{- $appcss := $indexScratch.Get "cssassets" | resources.Concat "css/bundle.css" | resources.Minify | resources.Fingerprint -}}
{{- .Scratch.Set "appcss" $appcss.RelPermalink -}}
{{- .Scratch.Set "appcssintegrity" $appcss.Data.Integrity -}}
```

这里使用到了一个`.Scratch`函数，该函数非常重要，可以在模板之间进行参数传递，用 Add、Get、Set 等方法，具体使用可以参考文档：[https://gohugo.io/functions/scratch](https://gohugo.io/functions/scratch)。

我们这里就是通过`.Scratch`方法将 Assets 资源文件添加到一起，然后通过 Go 管道进行合并、压缩、和获取指纹数据等，最好通过`.Scratch.Set`设置了最后的 CSS 样式的路径参数，这样我们就可以在别的模板中通过`.Scratch.Get`来获取样式的路径了。
<!--adsense-text-->
比如我们这里在模板文件`partials/head.html`的`<head>`区域添加如下代码：
```html
<!-- CSS from hugo pipes -->
{{- partial "css-assets.html" . -}}
<link rel="stylesheet" href='{{ .Scratch.Get "appcss" }}' integrity='{{ .Scratch.Get "appcssintegrity" }}'>
```

这样我们就获取到了 Hugo Pipes 处理过后的资源文件了，通过执行`hugo`命令，我们可以发现目录`public/css`下面多了一个名为`bundle.min.8db0ca8922d045902af41f7c49c511fb32ec40827c92aeff990760820f2a475c.css`的文件，我们可以打开查看下里面是压缩合并过后的 CSS 样式，同样，可以在页面中查看到引入的代码变成了下面的样式：
```html
<link rel="stylesheet" href='https://www.qikqiak.com/css/bundle.min.8db0ca8922d045902af41f7c49c511fb32ec40827c92aeff990760820f2a475c.css' integrity='sha256-jbDKiSLQRZAq9B98ScUR&#43;zLsQIJ8kq7/mQdggg8qR1w='>
```

到这里就大功告成了，我们通过 Hugo Pipes 将多个 CSS 样式文件进行了合并打包、压缩，并且没有使用第三方的工具包，大家可以用同样的方法去对 JS 文件进行打包压缩，然后看下文章中的效果是否生效了？


