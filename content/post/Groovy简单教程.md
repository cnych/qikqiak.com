---
title: Groovy 简明教程
date: 2019-05-13
tags: ["Groovy", "java", "jenkins", "pipeline"]
slug: groovy-simple-tutorial
keywords: ["Groovy", "java", "jenkins", "pipeline", "教程"]
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20190513212457.png",
      desc: "https://unsplash.com/photos/CMfzpKWAFQ0",
    },
  ]
category: "devops"
---

最近一直有很多同学提到不会写 Jenkins Pipeline 脚本，我都是直接摔一个 Jenkins 官方文档给他们，但是当我自己仔细去查看资料的时候发现并非如此简单，无论是声明式还是脚本式的 Pipeline 都依赖了 Groovy 脚本，所以如果要很好的掌握 Pipeline 脚本的用法，我们非常有必要去了解下 Groovy 语言。

<!--more-->

## 什么是 Groovy

Groovy 是跑在 JVM 中的另外一种语言，我们可以用 Groovy 在 Java 平台上进行编程，使用方式基本与使用 Java 代码的方式相同，所以如果你熟悉 Java 代码的话基本上不用花很多精力就可以掌握 Groovy 了，它的语法与 Java 语言的语法很相似，而且完成同样的功能基本上所需要的 Groovy 代码量会比 Java 的代码量少。

官方网站：[https://groovy.apache.org](https://groovy.apache.org)

## 环境搭建

要安装 Groovy 环境非常简单，前往官网网站下载对应的平台安装包一键安装即可：[https://groovy.apache.org/download.html](https://groovy.apache.org/download.html)，我这里使用的是 Mac，当然也可以使用比较方便的 Homebrew 工具来进行一键安装：

```shell
$ brew install groovy
```

可以使用下面的命令查看 groovy 是否安装成功：

```shell
$ groovy -v
Groovy Version: 2.5.6 JVM: 1.8.0_05 Vendor: Oracle Corporation OS: Mac OS X

```

## 基本语法

### 运行方法

使用编辑器（vscode）新建一个 Groovy 文件 hello.groovy，文件内容如下：

```groovy
class Example {
   static void main(String[] args) {
        // 使用 println 打印信息到 stdout
        /*除了上面的注释方法外，这里没也是注释信息哦*/
        println 'Hello World'
        println "Hello World";
   }
}
```

> 如果你对 Java 代码较熟悉的话，可以看到上面的 Groovy 是非常类似的。

然后可以使用 groovy 命令运行上面的程序：

```shell
$ groovy hello.groovy
Hello World
Hello World
```

从输出结果可以看出了 Groovy 里面支持`单引号`和`双引号`两种方式，注释支持`//`和`/**/`两种方式，而且不以分号“;”结尾也可以，但是我们还是推荐都带上分号保持代码的一致性。

### 标识符

`标识符`被用来定义变量，函数或其他用户定义的变量。标识符以**字母、美元或下划线**开头，不能以数字开头。以下是有效标识符的一些例子 ：

```groovy
def employeename
def student1
def student_name
```

> 其中，`def`是在 Groovy 中用来定义标识符的关键字。

如下代码：

```groovy
class Example {
    static void main(String[] args) {
        String x = "Hello";
        println(x);
        def _Name = "优点知识";
        println(_Name);
        println "Hello World";
    }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
Hello
优点知识
Hello World
```

### 数据类型

上述例子中我们定义了一个字符串 x 和一个标识符 \_Name。当然除了字符串之外，Groovy 也支持有符号整数、浮点数、字符等：

```groovy
class Example {
    static void main(String[] args) {
        String str = "Hello";  // 字符串
        int x = 5;  // 整数
        long y = 100L;  // 长整型
        float a = 10.56f;  // 32位浮点数
        double b = 10.5e40;  // 64位浮点数
        char c = 'A';  // 字符
        Boolean l = true;  // 布尔值，可以是true或false。
        println(str);
        println(x);
        println(y);
        println(a);
        println(b);
        println(c);
        println(l);
    }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
Hello
5
100
10.56
1.05E41
A
true
```

### 打印变量

上面用 def 关键字来定义变量，当然也可以用一个确定的数据类型来声明一个变量，我们可以用下面的几种方式来打印变量：

```groovy
class Example {
    static void main(String[] args) {
        // 初始化两个变量
        int x = 5;
        int X = 6;

        // 打印变量值
        println("x = " + x + " and X = " + X);
        println("x = ${x} and X = ${X}");
        println('x = ${x} and X = ${X}');
    }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
x = 5 and X = 6
x = 5 and X = 6
x = ${x} and X = ${X}
```

从这里我们可以看出 Groovy 在单引号的字符串里面是不支持插值的，这点非常重要，很多同学在使用 Pipeline 脚本的时候经常会混淆。除此之外，还支持三引号：

```groovy
class Example {
    static void main(String[] args) {
        // 初始化两个变量
        int x = 5;
        int X = 6;

println """
x = ${x}
X = ${X}
"""

println '''
x = ${x}
X = ${X}
'''
    }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
x = 5
X = 6

x = ${x}
X = ${X}
```

可以看出 Groovy 里面三引号支持双引号和单引号两种方式，但是单引号同样不支持插值，要记住。

### 函数

Groovy 中的函数是使用返回类型或使用 def 关键字定义的，函数可以接收任意数量的参数，定义参数时，不必显式定义类型，可以添加修饰符，如 public，private 和 protected，默认情况下，如果未提供可见性修饰符，则该方法为 public，如下所示：

```groovy
class Example {
   static def PrintHello() {
      println("This is a print hello function in groovy");
   }

   static int sum(int a, int b, int c = 10) {
      int d = a+b+c;
      return d;
   }

   static void main(String[] args) {
      PrintHello();
      println(sum(5, 50));
   }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
This is a print hello function in groovy
65
```

### 条件语句

在我们日常工作中条件判断语句是必不可少的，即使在 Jenkins Pipeline 脚本中也会经常遇到，Groovy 里面的条件语句和其他语言基本一致，使用 if/else 判断：

```groovy
class Example {
   static void main(String[] args) {
      // 初始化变量值
      int a = 2

      // 条件判断
      if (a < 100) {
         // 如果a<100打印下面这句话
         println("The value is less than 100");
      } else {
         // 如果a>=100打印下面这句话
         println("The value is greater than 100");
      }
   }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
The value is less than 100
```

### 循环语句

除了条件判断语句之外，循环语句也是非常重要的，Groovy 中可以使用三种方式来进行循环：`while、for语句、for-in语句`，如下：

```groovy
class Example {
   static void main(String[] args) {
      int count = 0;
      println("while循环语句：");
      while(count<5) {
         println(count);
         count++;
      }

      println("for循环语句：");
      for(int i=0;i<5;i++) {
	     println(i);
      }

      println("for-in循环语句：");
      int[] array = [0,1,2,3];
      for(int i in array) {
         println(i);
      }

      println("for-in循环范围：");
      for(int i in 1..5) {
         println(i);
      }
   }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
while循环语句：
0
1
2
3
4
for循环语句：
0
1
2
3
4
for-in循环语句：
0
1
2
3
for-in循环范围：
1
2
3
4
5
```

上面是常用的三种循环方式，其中一个比较特殊的地方是我们可以用`..`来定义一个数据范围，比如`1:5`表示 1 到 5 的数组。

另外我们还可以使用`for-in`来循环 Map，Map（字典）是我们在编写程序的过程中会镜像使用到的数据结构，大部分的编程语言都是使用`{}`来定义 Map，而在 Groovy 中有点不一样的地方，是使用`[]`来定义的 Map，如下所示：

```groovy
class Example {
   static void main(String[] args) {
       // 定义一个Map
      def ageMap = ["Ken" : 21, "John" : 25, "Sally" : 22];

      for(am in ageMap) {
         println(am);
      }
   }
}
```

运行结果如下：

```shell
$ groovy hello.groovy
Ken=21
John=25
Sally=22
```

除了上面这些最基本的特性外，Groovy 还支持很多其他的特性，比如异常处理、面向对象设计、正则表达式、泛型、闭包等等，由于我们这里只是为了让大家对 Jenkins Pipeline 的脚本有一个基本的认识，更深层次的用法很少会涉及到，大家如果感兴趣的可以去查阅官方文档了解更多信息。

<!--adsense-self-->
