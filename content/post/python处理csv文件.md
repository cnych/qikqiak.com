---
title: 用python处理csv文件
date: 2015-05-05
tags: ["python", "csv"]
slug: "python-process-csv-file"
category: "django"
gitcomment: true
---

`CSV`通常是纯文本文件。可以用`Sublime Text`或者`EXCEL`打开，`python`提供了一个非常强大的处理csv文件的库csv。

一般情况，如果csv文件不是很复杂则可以直接输出文件中每行的数据，代码如下：
```python
import csv

def read_csv_file(path):
    with open(path, 'rb') as f:  # r表示读取，b表示读取的文件
        reader = csv.reader(f)
        for row in reader:
            print row
    f.close()
```

<!--more-->

## 读取csv文件
如果想要获取某列的数据，在上面的代码中用数组指定索引即可得到，但是如果较复杂的话采用下面的形式更好，输出`字典`。这样还有个好处是有时需要反复读取csv文件，但是第一次读取后文件对象已经指向文件末尾了，所以需要将数据存入普通数组，方便后面处理：
```python
import csv

def read_csv_data(path):
    data_lines = []
    with open(path, 'rb') as f:
        reader = csv.reader(f)
        fields = reader.next()  # 过滤掉表头(如果有的话)
        for row in reader:
            items = dict(zip(fields, row))
            data_lines.append(items)
    f.close()
    return data_lines
```

## 写入csv文件
上面的csv包提供了读取的方法，自然我们也可以写入csv文件，代码如下：
```python
import csv

def write_csv_file(path)
    with open(path, 'wb') as f:  # w表示写入，b表示写入文件
        writer = csv.writer(f)
        writer.writerow(['name', 'address', 'age'])  # writerow是写入一行数据
        data = [
                ( 'ych ','china','25'),
                ( 'Lily', 'USA', '24')]
        writer.writerows(data)  # writerows是写入多行数据

    f.close()
```

> csv库还有很多用法，在此不再累述，相关请查看该[文档](http://docs.python.org/2/library/csv.html)。


