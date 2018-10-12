---
title: Django 中STATIC_ROOT 与STATICFILES_DIRS的区别
date: 2017-11-01
publishdate: 2017-11-01
tags: ["python", "django"]
bigimg: [{src: "/img/posts/18888531_442371539465605_1833253399559143424_n.jpg", desc: "乌镇水乡@杭州 JUNE 1,2017"}]
slug: django-staticroot-staticfilesdirs-function
category: "python"
gitcomment: true
---

在做`Django`项目的时候，经常会遇到静态文件访问的问题，在本地开发的时候可以正常的访问静态文件，部署到服务器上后就出现各种幺蛾子了，我猜你一定也遇到过吧？之前在`settings.py`配置文件中对`STATIC_ROOT`与`STATICFILES_DIRS`两个配置项不是特别理解，总感觉都差不多，在线上就把`STATIC_ROOT`替换成`STATICFILES_DIRS`了，虽然可以解决问题，但是却没有知其所以然。

<!--more-->

## STATIC_ROOT
`STATIC_ROOT`是**Django 1.3**新增的特性，该目录下面的文件会被当成静态文件进行处理。与`STATIC_ROOT`搭配使用的还有`STATIC_URL`，一般默认用`/static/`，用于指定静态目录的URL。其实`STATIC_ROOT`是用来方便部署`Django App`的。我们在写`Django App`的时候，经常会有一些和该App 相关的静态文件，虽然我认为的最佳实践方式是将静态文件放在统一的目录，但是毕竟`Django`是支持这种操作的，所以在1.3版本以前，部署的时候就比较麻烦了。

* 第一种方法是使用`django.views.static.serve`来处理文件。在App的`urls.py`里面加上一条路由：
    ```python
    url(r"^(?/static/P<path>.*)$", "django.views.static.serve", {"document_root" : "/path/to/project/app/static/"})
    ```
    但是这样的话线上的静态文件就都通过`Django`来进行处理了，这样速度太慢了，毕竟处理静态文件不是`Django`的特长。

* 处理静态文件什么在行？`Nginx`再加上`CDN`呗，所以现在就可以将每个App 里面的静态文件复制到一个统一的文件夹里面，然后在`nginx`中将`/static/`映射到该目录就行。但是这样是不是特别麻烦啊，每次上线都得把每个App 下面的静态文件复制一遍。

为了解决上面的问题，1.3版本以后便提供了一个新的方法自动地将所有静态文件放在一起。在开发阶段不必费心去做映射。在部署到生产环境的时候，只需要配置`nginx`把`/static/`映射到`STATIC_ROOT`配置的目录，然后运行`python manage.py collectstatic`，自动地就会把各个App 下面的静态文件给复制到`STATIC_ROOT`。由于复制过来的文件会覆盖掉原来的文件，所以一定不要在`STATIC_ROOT`目录下面放置我们自己的静态文件。

## STATICFILES_DIRS
从名字可以看出`STATICFILES_DIRS`指定了一个工程里面哪个目录存放了与这个工程相关的静态文件，这是一个列表。上面的`collectstatic`命令也会将该列表下面的静态文件收集到`STATIC_ROOT`目录下面去的，所以`STATICFILES_DIRS`下面是不能包含`STATIC_ROOT`这个路径的，对吧？


## 最佳实践
所以最佳的配置方式是将所有的App 下面的静态文件统一放置到一个目录下面，然后将该目录设置为`STATICFILES_DIRS`，`STATIC_ROOT`则设置为另外的目录。如下：
```python
STATIC_URL = '/static/'
# 开发阶段放置项目自己的静态文件
STATICFILES_DIRS = (
    os.path.join(BASE_DIR, 'staticfiles'),
)
# 执行collectstatic命令后会将项目中的静态文件收集到该目录下面来（所以不应该在该目录下面放置自己的一些静态文件，因为会覆盖掉）
STATIC_ROOT = os.path.join(BASE_DIR, 'static')
```

在开发阶段，`Django`把/static 映射到`django.contrib.staticfiles`这个App。`staticfiles`自动地从`STATICFILES_DIRS`、`STATIC_ROOT`以及各个App的static子目录里面搜索静态文件。一旦布署到开发环境上，`settings.py`不需要重新编写，只要在`Nginx`的配置文件里面写好映射，/static将会被`Nginx`处理。`django.contrib.staticfiles`虽然仍然存在，但因为不会接收到以`/static/`开始的路径，所以将不会产生作用。不必担心`Django`会使用处理速度变慢。另外，当`settings.DEBUG is False`的时候，`staticfiles`将自动关闭。






