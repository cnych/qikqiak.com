---
title: 利用Python 优雅的将PDF 转换成图片
date: 2017-10-30
publishdate: 2017-12-06
tags: ["python", "PDF"]
bigimg: [{src: "/img/posts/15624042_1804617946454032_2037034921851092992_n.jpg", desc: "普吉岛@泰国 JAN 6,2017"}]
slug: python-convert-pdf-images
category: "python"
gitcomment: true
---

之前收集了很多优秀的`PDF`文档，但是需要看的时候不是很方便，需要去找到这个文件，如果是在手机上的话往往还需要下载`PDF`相关的插件才行，而且最大的问题是不便于资料的整理和分享。如果能够将`PDF`转换成网页，岂不是就能解决这些问题了？还能直接分享出去。

这里利用`PyPDF`包来处理`PDF`文件，为了方便快捷，我这里直接将一个页面转换成图片，就不需要去识别页面中的每一个`PDF`元素了，这是没必要的。

<!--more-->

## 转换
核心代码很简单，就是将`PDF`文件读取出来，转换成`PdfFileReader`，然后就可以根据`PyPDF2`的API去获得每一个页面的二进制数据，拿到二进制数据过后，就能很方便的进行图片处理了，这里用`wand`包来进行图片处理。

```python
# -*- coding: utf-8 -*-
import io

from wand.image import Image
from wand.color import Color
from PyPDF2 import PdfFileReader, PdfFileWriter

memo = {}

def getPdfReader(filename):
    reader = memo.get(filename, None)
    if reader is None:
        reader = PdfFileReader(filename, strict=False)
        memo[filename] = reader
    return reader

def _run_convert(filename, page, res=120):
    idx = page + 1
    pdfile = getPdfReader(filename)
    pageObj = pdfile.getPage(page)
    dst_pdf = PdfFileWriter()
    dst_pdf.addPage(pageObj)

    pdf_bytes = io.BytesIO()
    dst_pdf.write(pdf_bytes)
    pdf_bytes.seek(0)

    img = Image(file=pdf_bytes, resolution=res)
    img.format = 'png'
    img.compression_quality = 90
    img.background_color = Color("white")
    img_path = '%s%d.png' % (filename[:filename.rindex('.')], idx)
    img.save(filename=img_path)
    img.destroy()
```

> 需要注意的是一般PDF文件较大，如果一次性转换整个PDF文件需要小心内存溢出的问题，我们这里将第一次载入的整个PDF文件保存到内存，避免每次读取的时候都重新载入。

## 批量处理
上面已经完成了一个`PDF`页面的转换，要完成整个文件的转换就很简单了，只需要拿到文件的总页码，然后循环执行就行。考虑到转换比较耗时，可以使用异步处理的方式加快速度。比如可以使用`celery`来搭配处理，一定注意小心内存泄露。

核心代码已经整理放到[github](https://github.com/cnych/pdf2images)上去了，好了，等有时间的时候准备做一个公共的`PDF`转成`H5`的服务，开放给大众使用。


> 花了点时间，做成了一个独立的服务：[https://pdfh5.com](https://pdfh5.com)，欢迎大家试用

![pdfh5.com](/img/posts/pdfh5.com.png)



