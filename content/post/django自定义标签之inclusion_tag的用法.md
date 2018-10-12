---
title: django自定义标签之inclusion_tag的用法
date: 2014-05-28
publishdate: 2014-05-28
tags: ["django", "标签"]
slug: django-custom-tag-inclusion_tag
category: "django"
gitcomment: true
---

`django`提供了强大的自定义标签、自定义过滤器等强大功能，今天首先介绍一下自定义标签的`inclusion_tags`的用法。

<!--more-->

1.在model目录下面新建templatetags文件夹，在该文件夹下面新建`__init__.py`文件，标识该目录为一个可以引用的包

2.新建`buttons.py`文件，文件内容如下：
```python
from django import template
register = template.Library()
@register.inclusion_tag('tags/digg_button.html', takes_context=True)
def digg_button(context, comment):
# context可以获取访问的request等变量，需要将上面的takes_context设置为True，
# 而且方法的第一个参数必须为'context'
    user = context['user']
    if user.is_authenticated():
        return {'is_digg': comment.is_digg(user), 'uuid': comment.uuid,
            'up_times': comment.up_times}

    return {'is_digg': False, 'uuid': comment.uuid,
        'up_times': comment.up_times}
```

3.在模板目录新建tags目录，在目录下面新建`digg_button.html`，内容如下(注意上一步中digg_button方法的返回结果)：
```html
{% if is_digg %}
<a href="javascript:void(0);" style="color:#ae3910;">
    <i class="glyphicon glyphicon-thumbs-up"></i>
    <span class="heart-name">赞 {{ up_times }}</span>
</a>
{% else %}
<a href="javascript:void(0);" onclick="doThumbsUp('{{ uuid }}')">
    <i class="glyphicon glyphicon-thumbs-up"></i>
    <span class="heart-name">赞 {{ up_times }}</span>
</a>
{% endif %}
```

4.然后自定义的标签`digg_button`其实就已经定义好了，只是在使用的时候需要注意，我用的django 1.6.2版本，需要在使用的模板中加载buttons文件，代码如下(注意这里加载的buttons为第一步中`templatetags`目录下面新建的文件):
```html
{% load buttons %}
```

5.最后就可以在上一步操作的模板中使用`digg_button`标签了：
```html
{% digg_button comment %}
```

> 注意django 1.6.2版本一定需要加载标签文件，其他版本的暂未测试。
