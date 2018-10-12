---
title: Mac 下安装 cryptography 失败
date: 2018-07-05
tags: ["mac", "python"]
keywords: ["mac", "python", "pip", "cryptography"]
slug: install-cryptography-failed-in-mac
gitcomment: true
bigimg: [{src: "/img/posts/photo-1530636100082-7781dfaa6ab3.jpeg", desc: "Eagle on the Way"}]
category: "python"
---

在`Mac`下面安装`cryptography`依赖包，始终报错，出现`'openssl/opensslv.h' file not found`的错误。

<!--more-->

```shell
$ pip install cryptography
...
 building '_openssl' extension
cc -fno-strict-aliasing -fno-common -dynamic -arch i386 -arch x86_64 -g -Os -pipe -fno-common -fno-strict-aliasing -fwrapv -DENABLE_DTRACE -DMACOSX -DNDEBUG -Wall -Wstrict-prototypes -Wshorten-64-to-32 -DNDEBUG -g -fwrapv -Os -Wall -Wstrict-prototypes -DENABLE_DTRACE -arch i386 -arch x86_64 -pipe -I/System/Library/Frameworks/Python.framework/Versions/2.7/include/python2.7 -c build/temp.macosx-10.12-intel-2.7/_openssl.c -o build/temp.macosx-10.12-intel-2.7/build/temp.macosx-10.12-intel-2.7/_openssl.o
build/temp.macosx-10.12-intel-2.7/_openssl.c:434:10: fatal error: 'openssl/opensslv.h' file not found
#include <openssl/opensslv.h>
         ^
1 error generated.
error: command 'cc' failed with exit status 1
...
```

这是因为找不到`openssl`的头文件，可以使用`brew`命令进行安装:
```shell
$ brew install openssl
```

如果安装完成以后还是会出现上面的错误的话，就是环境变量的问题了，需要重新指定`openssl`的路径安装：
```shell
$ env LDFLAGS="-L$(brew --prefix openssl)/lib" CFLAGS="-I$(brew --prefix openssl)/include" pip install cryptography
```

这样就可以搞定了~~~
