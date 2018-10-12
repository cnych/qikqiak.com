---
title: 自定义django admin后台的action
date: 2014-07-02
tags: ["django", "admin", "action"]
slug: custom-django-admin-actions
category: "django"
gitcomment: true
---

提到强大的`django`，最能引起大家共鸣的可能是其自带的`admin`了，提供了默认的强大的功能，而且我们还能根据自己的需求进行定制。`django admin`的列表页自带了一个批量删除所选对象的action，我们还可以添加自定义的功能action来实现其他功能，比如批量标记将文章标记为已发布。如下代码：

<!--more-->

```python
class PhotoDescAdmin(admin.ModelAdmin):
    def pub_time(self, obj):
        return obj.photo.pub_time.strftime("%Y-%m-%d")
    pub_time.short_description = '关联图片发布日期'

    def make_published(self, request, queryset):
        queryset.update(enabled=True)
    make_published.short_description = "将选择的描述标记为【发布】"

    list_display = ('id', 'pub_time', 'category', 'photo', 'description',
        'user_id', 'user_name', 'enabled', 'created_at')
    list_filter = ('created_at', 'category',)
    search_fields = ('description',)
    ordering = ('-created_at',)
    raw_id_fields = ('photo', 'category', )
    actions = [make_published]
```

注意上面代码中`make_published`方法的参数，以及PhotoDescAdmin中的actions，这样我们就可以在`django admin`后台系统的photodesc列表中看到多了一个action：将选择的描述标记为【发布】。

