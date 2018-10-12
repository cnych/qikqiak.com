---
title: 更新django2.0的10条注意事项
date: 2018-01-02
tags: ["django", "django2.0"]
slug: upgrading-django-20-10-tips
gitcomment: true
bigimg: [{src: "/img/posts/photo-1500206329404-5057e0aefa48.jpeg", desc: "Seeking the one who is higher than us. Lifting our hands to calling his name. Surrendering all of our being through worship."}]
category: "python"
---

备受期待的[django 2.0](https://www.djangoproject.com/start/overview/)已经发布了，最大的一个变化就是不再支持`python2.x`版本了，这也为我们还在保守使用的2.x的同学们敲响了警钟，赶紧学习`python3.x`吧，虽然大同小异，但是`python3.x`还是提供了很多更高级的用法。

<!--more-->

扫描下面的二维码添加我微信好友(注明python)，然后可以加入到我们的`python`讨论群里面共同学习
![qrcode](/img/posts/wexin-qrcode.jpeg)

## django2.0 弃用的特性
下面这些是我在升级到`Django 2.0`后遇到的最常见的一些错误：

#### 1. url
```python
from django.core.urlresolvers import reverse
```
变成了
```python
from django.urls import reverse
```

#### 2. MIDDLEWARE
`settings.py`文件，`MIDDLEWARE_CLASSES`更改成了`MIDDLEWARE`，这个一定要注意。

#### 3. django.shortcuts.render()
`django.shortcuts.render_to_response()`方法已经被弃用了，现在使用`django.shortcuts.render()`方法。

#### 4. User.is_authenticated 和User.is_anonymous
之前的`User.is_authenticated()`和`User.is_anonymous()`方法更改成了属性：`User.is_authenticated`和`User.is_anonymous`。

#### 5. SessionAuthenticationMiddleware
删除了`SessionAuthenticationMiddleware`类，不再需要该中间件，在`Django 1.10+`中已经默认开启了。

#### 6. assignment_tag 改成simple_tag
`@register.assignment_tag`改成了`@register.simple_tag`。

## django2.0 更新的特性
下面的是更新到`Django 2.0`遇到的一些新特性

#### 7. on_delete=models.CASCADE
为**model**的`ForeignKey`和`OneToOne`的属性增加`on_delete=models.CASCADE`。

#### 8. URL编写进行了简化
Django以前的URL规则是正则规则，写起来是有点反人类的，一点都不`Pythonic`。开发者们一直在被迫写类似这样的匹配表达式：
```python
url(r'^articles/(?P<year>[0-9]{4})/$', views.year_archive),
```
现在，你可以这样写了：
```python
path('articles/<int:year>/', views.year_archive),
```

#### 9. 聚合操作
数据库查询的聚合操作`annotate`中，增加了一个叫`Window`的操作，和一个叫`Frame`的条件。


#### 10. 首页

除此之外，首次启动的欢迎页面也重做了，感觉高大上了很多，有没有
![django2-index](/img/posts/django2-index.jpg)


## 总结

有关`Django 2.0`的新功能和更改的完整列表，请参阅[官方文档](https://www.djangoproject.com/)。


