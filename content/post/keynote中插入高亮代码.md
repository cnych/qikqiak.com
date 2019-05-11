---
title: 如何在 Keynote 中插入高亮代码？
date: 2019-04-24
tags: ["keynote", "highlight", "Mac"]
slug: insert-code-on-keynote
keywords: ["keynote", "highlight", "Mac", "高亮", "PPT"]
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/jws2z.jpeg", desc: "San Francisco covered by fog"}]
category: "极客"
---

这两天在开始做 Golang 的实战课程，课程内容基本上规划得差不多了，现在在开始做 PPT 内容，但是做出的 PPT 内容始终感觉有点丑陋，特别是有时候需要或多或少的在 PPT 中展示下代码的时候，直接截图效果也不是很有好。于是一通查找在 keynote 中能够很好的显示代码的方法，找到一个比较友好的解决方法：**使用 RTF 格式插入文字格式的高亮代码。**

<!--more-->

首先需要安装高亮工具 highlight，当然我们在 Mac 中还是使用比较方便的 homebrew 工具来进行安装：
```shell
$ brew install highlight
```

然后复制一段我们需要展示的代码，比如我这里复制下面的代码片段：
```go
package main

import "fmt"

func main() {
	fmt.Println("Hello World")
}
```

然后使用下面的命令来格式化复制在内存中的代码：
```shell
$ pbpaste | highlight --syntax=go --style=github -k "Fira Code" -K 36 -u "utf-8" -t 4 -O rtf | pbcopy
```

> `--syntax`指定代码语法格式，`-u`指定编码，否则中文会乱码，`--style`指定高亮的样式，`-K`指定代码的字大小


当然除了上面的方法之外，我们也可以直接格式化文件中的代码，比如将上面的代码片段保存为 hello.go，然后执行下面的命令也可以：
```shell
$ highlight --style=github -k "Fira Code" -K 36 -u "utf-8" -t 4 -O rtf hello.go | pbcopy
```

执行了上面的命令后，直接粘贴在 keynote 中，然后根据实际的情况进行相应的调整即可，下面就是我们最终调整过后的在 keynote 中的效果图：

![keynote code demo](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/2f29u.jpeg)

为了方便操作，我们可以将上面的命令放在一个脚本中：
```js
function light() {
  if [ -z "$2" ]
    then src="pbpaste"
  else
    src="cat $2"
  fi
  $src | highlight -O rtf --syntax $1 --font Inconsolata --style solarized-dark --font-size 24 | pbcopy
}
```

然后执行`light js func.js`命令即可。

参考资料：[https://gist.github.com/jimbojsb/1630790](https://gist.github.com/jimbojsb/1630790)


<!--adsense-self-->
