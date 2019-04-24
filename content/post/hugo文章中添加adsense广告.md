---
title: 在 Hugo 文章中添加 Adsense 广告单元
date: 2019-04-15
tags: ["Hugo", "Adsense"]
slug: add-adsense-in-hugo-article
keywords: ["Hugo", "Adsense", "广告", "Google"]
gitcomment: true
category: "hugo"
---
[![adsense hugo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/Lu3u0b.jpg)](/post/add-adsense-in-hugo-article/)

之前在首页添加了 Google Adsense 信息流广告，文章详情页没有添加，而文章详情页是 Hugo 编译 markdown 文档过后的，我们可以通过主题下面的`layouts/_default/single.html`看到模板中是通`{{ .Content }}`进行渲染的，那么如果我们想要在文章中添加 Adsense 广告的话呢？应该怎样添加呢？

其实很简单，我们只需要在文章中加上一个特殊的标签，然后在模板中将该标签替换掉即可。我们在用 Hugo 写文章的时候添加的`< !--more-->`标签就是这种原理。

<!--more-->

## 方案
首先创建一个`partial`模板，在使用的主题目录下面创建文件：`layouts/partials/adsense-inarticle.html`，添加如下的代码作为模板内容：
```html
<script async src="//pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
<ins class="adsbygoogle"
     style="display:block; text-align:center;"
     data-ad-layout="in-article"
     data-ad-format="fluid"
     data-ad-client="{{.Site.Params.Adsense.client}}"
     data-ad-slot="{{.Site.Params.Adsense.inArticleSlot}}"></ins>
<script>
     (adsbygoogle = window.adsbygoogle || []).push({});
</script>
```
<!--adsense-text-->
我们在上面的模板中使用了两个变量：`.Site.Params.Adsense.client`和`.Site.Params.Adsense.inArticleSlot`，他们的值我们可以通过 Google AdSense 后台获取，然后将获取到的`data-ad-client`和`data-ad-slot`的值填充到`config.toml`文件中，放置在一个`params.adsense`模块下面，如下所示：
```toml
[params.adsense]
  client = "ca-pub-12345"
  inArticleSlot = "12345"
```

然后在我们写的 markdown 文档中，我们只需要在需要放置广告的位置用一个标签代替，用来表示一个 Adsense 广告单元，然后我们使用 hugo 的函数将这个标签从`partial`模板中替换成真正的 Adsense 代码块，如下所示：
```markdown
This is the first paragraph.

This is the second paragraph.

<!--adsense-->

This is the third paragraph.
```
<!--adsense-->
然后去修改文章页面渲染的模板，打开文件`layouts/_default/single.html`，将`{{ .Content }}`替换成下面的代码：
```html
{{ replace .Content "<!--adsense-->" (partial "adsense-inarticle.html" .) | safeHTML }}
```

然后我们就可以尝试去编译生成文章，就可以看到在文章中出现了广告单元，需要注意的事第一次放置广告上来可能需要等待一段时间才会生效。可以看下本篇文章中的效果是否生效了？


