---
title: django下url函数的用法
date: 2014-06-13
publishdate: 2014-06-13
slug: django-url-function-usage
tags: ["django", "url"]
category: "django"
gitcomment: true
---

Django下有一个比较隐含的函数**url**，在`django/conf/urls/defaults`模块中，虽然只有短短的10行代码，但功能却很了得。起初初学`Django`，并没有发现它，Templates的链接地址都是根据`urlpatterns`定义的地址，拼凑成地址字符串，很难看，而且Templates里拼凑成的地址，随着页面的增加而不断增加，一旦在`urlpatterns`里的某个地址改变了名称，那眼泪可是哗哗的，有多少的拼凑的地址就得改动多少处！这时发现了url函数，这下可都好了，不管`urlpatterns`里的某个地址叫法怎么改变，`Templates`里的地址都不用修改了。

比如没有采用url函数的时候：`urlpatterns`里定义了资讯的首页地址,
```html
urlpatterns = patterns('',
    (r'^article$','news_index' ),
)
```

<!--more-->

Templates里的html为
```html
<a href="/article">资讯</a>
```

而且不止一个页面，可能有10个页面使用到资讯的链接，这时你的Templates上就会有10个那样的页面a标签，当有一天，你突然想改变地址的叫法，
```python
urlpatterns = patterns('',
    (r'^news$','news_index' ),
)
```

你会发现，你在Templates中得修改10个`<a href="/article">资讯</a>`成`html<a href="/news">资讯</a>`

可恨的是那样的标签分布在不同的页面上，有更糟糕的时候就是 你不知道到底有多少个那样的`a`标签（总不能一个个数嘛）。

有了url情况就大为不一样了，`urlpatterns`里定义了资讯的首页地址,
```
urlpatterns = patterns('',
    url(r'^article$','news_index' ，name="news_index"),
)
```

Templates里的html为
```html
<a href="http://mxjloveyou.blog.163.com/blog/{%url news_index%}">资讯</a>
```
你怎么修改`urlpatterns`的地址，Template都会随着改变，省事了不少。

url的用法也很简单，只要在urlpatterns里使用它，附加一个name，如：
```python
url(r'^article$','news_index' ，name="news_index"),
```

Templates里 这样使用
```{%url name%}，```
地址链接就能使用了。注意的是**name**是全局的，你整个`urlpatterns`里只能有一个唯一的name，这个道理应该好理解，就像网站的地址也是唯一性的。

Templates里的用法简单，在`views`里怎么用呢？以前在没有使用的url函数的时候，可能指向一个地址使用
```python
HttpResponseRedirect（"/article"）
```

当然urlpatterns改变地址叫法的时候，所用的views的指向函数的参数都得跟着变。有了url函数，变成：
```python
HttpResponseRedirect(reverse("news_index"))
```
好处和Template里使用的情形一样的。

当遇到urlpatterns的地址包含有参数的时候，如：
```python
(r'^(?P<year>\d{4})/(?P<month>\d{1,2})/$','news_list' ),
```
有两个参数，最终的地址如归档的地址`http://xxxx.com/2014/06`
情况变复杂点了，`urlpatterns`的以上的用法不变：
```python
url(r'^(?P<year>\d{4})/(?P<month>\d{1,2})/$','news_list',name="news_archive" ),
```

Templates里的用法就需要改改了，我们把url看成一个方法，结合templates的语法，结果就出来了：
```html
<a href="{%url news_archive 2014 ,06%}">2014年06月</a>
```

后面的2014, 06 就是参数了，参数之间用逗号隔开，多少个参数用法都一样的。当然，2014 06 参数是某个实体获得的，具体的情况具体分析。而在views呢，有了参数怎么写，万变不离宗：
```python
reverse（"news_archive"，kwargs={"year":2014,"month":06}）
```
即可，最后解析出来的地址为`/2014/06`。