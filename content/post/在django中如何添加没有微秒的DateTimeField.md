---
title: 在 Django 中如何添加没有微秒的 DateTimeField 属性
subtitle: Django 中关于 DateTimeField 属性的一个大坑
date: 2019-01-29
tags: ["django", "mysql"]
keywords: ["django", "DateTimeField", "mysql"]
slug: how-to-add-datetimefield-in-django-without-microsecond
gitcomment: true
bigimg: [{src: "https://ws1.sinaimg.cn/large/006tNc79gy1fznhi0eq88j31140rtjw0.jpg", desc: "C H A O S"}]
category: "django"
---

今天在项目中遇到一个`Django`的大坑，一个很简单的分页问题，造成了数据重复。最后排查发现是`DateTimeField` 属性引起的。

下面描述下问题，下面是我需要用到的一个 Task Model 基本定义：
<!--more-->

```python
class Task(models.Model):
    # ...... 省略了其他字段
    title = models.CharField(max_length=256, verbose_name=u'标题')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=u'创建时间')
```

### 问题描述

前端这边的分页方式不是常规的 page、page_size 方式，而是使用标志位的方式进行分页，我这里采用的就是通过创建时间的时间戳作为分页标记。比如下面是返回的第一页的数据：
```json
{
    "data": {
        "count": 5,
        "has_next": 1,
        "tasks": [
            {
                "title": "这是一个作业标题1",
                "ts": 1546829224000,
                "id": 1
            },
            {
                "title": "这是一个作业标题2",
                "ts": 1546829641000,
                "id": 2
            }
        ]
    },
    "result": 1
}
```

要请求第2页的数据只需要在请求的 API 中传递上一页最后一条数据的时间戳即可，这里我们就传递 1546829641000，这样当我后台接收到这个值过后就直接过滤大于该时间戳的数据，再取一页数据返回前端即可，逻辑上很简单。过滤核心代码如下：
```python
ts = string_utils.get_num(request.GET.get('ts', 0), 0)
alltask = Task.objects.filter(created_at__gt=date_utils.timestamp2datetime(ts))
```

这段代码很简单，主要就是将前台传递过来的时间戳转换成 DateTime 类型的数据，然后利用`created_at__gt`来过滤，就是大于这个时间点的就可以。然后问题来了，查询出来的数据始终包含了上一页最后一条数据，感觉很奇怪，我这里明明用的是`gt`而不是`gte`，怎么会重复这条数据呢。

于是，我们把上一页最后一条数据的 created_at 字段打印出来和传递过来的时间戳进行对比下：
```shell
>>> task = Task.objects.get(pk=2)
>>> task.created_at
datetime.datetime(2019, 1, 7, 10, 54, 1, 343136)
```

然后将时间戳转换成 DateTime 类型的数据：
```shell
>>> ts = int(1546829641000/1000)
>>> date_utils.timestamp2datetime(ts)
datetime.datetime(2019, 1, 7, 10, 54, 1)
```

现在看到区别没有，从数据库中查询出来的 created_at 字段的值包含了一个微秒，就是后面的 343136，而时间戳转换成 DateTime 类型的值是不包含这个微秒值的，所以我们上面查询的使用`created_at__gt`来进行过滤很显然 created_at 的值是大于下面的值的，因为多了一个微秒，所以就造成了数据重复了，终于破案了。


### 解决方法
那么要怎么解决这个问题呢？当然我们可以直接在数据库中就保存一个时间戳的字段，用这个字段直接来进行查询过滤，肯定是可以解决这个问题的。

如果就用现在的 created_at 这个 DateTimeField 类型呢？如果保存的数据没有这个微秒是不是也可以解决这个问题啊？

我们可以去查看下源码为什么 DateTimeField 类型的数据会包含微秒，下面是`django/db/backends/mysql/base.py`文件中的部分代码说明：
```python
class DatabaseWrapper(BaseDatabaseWrapper):
    vendor = 'mysql'
    # This dictionary maps Field objects to their associated MySQL column
    # types, as strings. Column-type strings can contain format strings; they'll
    # be interpolated against the values of Field.__dict__ before being output.
    # If a column type is set to None, it won't be included in the output.
    _data_types = {
        'AutoField': 'integer AUTO_INCREMENT',
        'BinaryField': 'longblob',
        'BooleanField': 'bool',
        'CharField': 'varchar(%(max_length)s)',
        'CommaSeparatedIntegerField': 'varchar(%(max_length)s)',
        'DateField': 'date',
        'DateTimeField': 'datetime',
        'DecimalField': 'numeric(%(max_digits)s, %(decimal_places)s)',
        'DurationField': 'bigint',
        'FileField': 'varchar(%(max_length)s)',
        'FilePathField': 'varchar(%(max_length)s)',
        'FloatField': 'double precision',
        'IntegerField': 'integer',
        'BigIntegerField': 'bigint',
        'IPAddressField': 'char(15)',
        'GenericIPAddressField': 'char(39)',
        'NullBooleanField': 'bool',
        'OneToOneField': 'integer',
        'PositiveIntegerField': 'integer UNSIGNED',
        'PositiveSmallIntegerField': 'smallint UNSIGNED',
        'SlugField': 'varchar(%(max_length)s)',
        'SmallIntegerField': 'smallint',
        'TextField': 'longtext',
        'TimeField': 'time',
        'UUIDField': 'char(32)',
    }

    @cached_property
    def data_types(self):
        if self.features.supports_microsecond_precision:
            return dict(self._data_types, DateTimeField='datetime(6)', TimeField='time(6)')
        else:
            return self._data_types

    # ... further class methods
```

上面的 data_types 方法中在进行 MySQL 版本检查，属性`supports_microsecond_precision`来自于文件`django/db/backends/mysql/features.py`:
```python
class DatabaseFeatures(BaseDatabaseFeatures):
    # ... properties and methods

    def supports_microsecond_precision(self):
        # See https://github.com/farcepest/MySQLdb1/issues/24 for the reason
        # about requiring MySQLdb 1.2.5
        return self.connection.mysql_version >= (5, 6, 4) and Database.version_info >= (1, 2, 5)
```

从上面代码可以看出如果使用的 MySQL 大于等于 5.6.4 版本，属性`DateTimeField`会被映射成为数据库中的`datetime(6)`，所以保存的数据就包含了微秒。

在 Django 中暂时没有发现可以针对改配置进行设置的方法，所以我们要想保存的数据不包含微秒，我们这里则可以将上面的`data_types`属性进行覆盖即可：
```python
from django.db.backends.mysql.base import DatabaseWrapper

DatabaseWrapper.data_types = DatabaseWrapper._data_types
```

将上面的代码放置在合适的地方，比如`models.py`或者`__init__.py`或者其他地方，当我们运行 migrations 命令来创建 DateTimeField 列的时候对应在数据库中的字段就被隐射成为了`datetime`，而不是`datetime(6)`，即使你用的是 5.6.4 版本以上的数据库。

当然要立即解决当前的问题，只需要更改下数据库中的 created_at 字段的类型即可：
```shell
mysql> ALTER TABLE `task` CHANGE COLUMN `created_at` `created_at` datetime NOT NULL;
Query OK, 156 rows affected (0.14 sec)
Records: 156  Duplicates: 0  Warnings: 0
```

这样数据重复的 BUG 就解决了。

> 参考链接：[https://stackoverflow.com/questions/46539755/how-to-add-datetimefield-in-django-without-microsecond](https://stackoverflow.com/questions/46539755/how-to-add-datetimefield-in-django-without-microsecond)


