---
title: django国际化问题
date: 2014-05-28
publishdate: 2014-05-28
tags: ["django", "国际化"]
slug: django-i18n
category: "django"
gitcomment: true
---

最近准备用用django的国际化功能，用的django1.6.5版本，按照网上说的教程始终不生效，最终只能去看官方文档，不得不说还是官方文档靠谱啊，下面记录了下django1.6+启用国际化的相关步骤。

<!--more-->

1.配置settings.py文件

```python
LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_L10N = True

USE_TZ = True

LANGUAGES = (
    ('cn', '简体中文'),
    ('en', 'English'),
)
LOCALE_PATHS = (
    os.path.join(BASE_DIR, 'locale'), # 必须指定LOCALE_PATHS
)
MIDDLEWARE_CLASSES = (
    'django.contrib.sessions.middleware.SessionMiddleware',
  **  'django.middleware.locale.LocaleMiddleware',**
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
)
TEMPLATE_CONTEXT_PROCESSORS = (
    'django.contrib.auth.context_processors.auth',
   ** 'django.core.context_processors.i18n',**
    'django.core.context_processors.request',
    'django.core.context_processors.static',
)
```


2.生成本地化文件

```shell
$ django-admin.py makemessages -l en
$ django-admin.py makemessages -l cn
```
先用上面两条命令生成本地化文件，此时就可以在`locale`文件夹下面找到cn和en两个子文件，里面都有LC_MESSAGES文件夹，里面自动生成了`django.po`文件，文件里面有类似于msgid "Chinese" msgstr ""这样的内容，其中的msgid就是你使用的国际化的字符串，而msgstr就是对应的语言的翻译

将你需要国际化的字符串分别填充在上述指定文件中，然后执行命令编译.po文件，生成对应的.mo文件
```shell
django-admin.py compilemessages
```


3.模板中字符串翻译

在模板开始加上标签：
```html
{% load i18n %}
```

然后在相应的字符串上加上trans标签进行标识。
```html
<a href="/about">{% trans "About" %}</a> ·
<a href="/jobs">{% trans "Jobs" %}</a> ·
<a href="/auth/weibo">{% trans "Login" %}</a>
```

4.让用户根据需要进行选择语言

如下代码实现了根据下拉框来选择相应的语言：
```html
<form name="langform" id="langform" method="post">
    {% csrf_token %}
    <input name="next" type="hidden" value="{{ next }}" />
    <select id="language" name="language" onchange="selectdo(this);">
        {% for lang in LANGUAGES %}
            <option value="{{ lang.0 }}"
                {% ifequal LANGUAGE_CODE lang.0 %}selected{% endifequal %}>{{ lang.1 }}</option>
        {% endfor %}
    </select>
</form>
<script type="text/javascript">
function selectdo(obj) {
    str = "/i18n/setlang/";
    myform = document.getElementById("langform");
    myform.method = "POST";
    myform.action = str;
    myform.submit();
}
```

> 当用户在 url 附加上 /i18n/setlang/，就会重定向到 django.views.i18n.set_language()。





