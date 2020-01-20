---
title: 自定义 Traefik2 中间件
date: 2020-01-20
tags: ["traefik", "kubernetes", "ingress"]
keywords: ["traefik", "中间件", "middleware", "lua"]
slug: custom-traefik2-middleware
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1579463971814-a71f6a2a3858.jpeg", desc: "https://unsplash.com/photos/P8fQMbVWqTk"}]
category: "kubernetes"
---
[Traefik 2.X](/tags/traefik/) 版本发布以来受到了很大的关注，特别是提供的中间件机制非常受欢迎，但是目前对于用户来说能使用的也只有官方提供的中间件，这对于某些特殊场景可能就满足不了需求了，自然而然就想到了自定义中间件，然而现在要想自定义中间件不是一件容易的事情，虽然实现一个中间件很简单，因为目前官方没有提供方法可以将我们自定义的中间件配置到 Traefik 中，所以只能采用比较 low 的一种方法，那就是直接更改官方的源代码了，下面我们以一个简单的示例来说明下如何自定义一个 Traefik 中间件。

<!--more-->

## 自定义
首先下载 Traefik 源码，切换到最新的 v2.1 代码分支：
```shell
$ git clone https://github.com/containous/traefik
$ cd traefik
$ git checkout v2.1
$ git checkout -b dev
```

在 v2.1 分支基础上创建一个本地的 dev 分支，然后添加我们自定义的 luascript 中间件：
```shell
$ git submodule add https://github.com/cnych/traefik2-luascript pkg/middlewares/luascript
$ git status
On branch dev
Changes to be committed:
  (use "git reset HEAD <file>..." to unstage)

        new file:   .gitmodules
        new file:   pkg/middlewares/luascript
```

这样就将我们自定义的 luascript 中间件代码添加到了 Traefik 源码中，但是这还不够，只是声明了中间件而已，还需要将该中间件配置到 Traefik 的中间件中去才能生效，前往 `pkg/config/dynamic/middleware.go` 文件在 `Middleware` 结构体下面添加自定义脚本字段：
```go
// pkg/config/dynamic/middleware.go
// Middleware holds the Middleware configuration.
type Middleware struct {
    ......
    LuaScript         *LuaScript         `json:"lua,omitempty" toml:"lua,omitempty" yaml:"lua,omitempty"`
}

// +k8s:deepcopy-gen=true

// LuaScript config
type LuaScript struct {
	Script string `json:"script,omitempty" toml:"script,omitempty" yaml:"script,omitempty"`
}
```

然后在服务端构建器中注册上面定义的 `LuaScript` 中间件，代码位于 `pkg/server/middleware/middlewares.go`，在 `buildConstructor` 方法中添加上自定义中间件的信息：
```go
// pkg/server/middleware/middlewares.go
import (
    // ...
    "github.com/containous/traefik/v2/pkg/middlewares/luascript"  
    // ...
)

// ...

// it is the responsibility of the caller to make sure that b.configs[middlewareName].Middleware exists
func (b *Builder) buildConstructor(ctx context.Context, middlewareName string) (alice.Constructor, error) {
    // ... other middlewares

    // LuaScript
	if config.LuaScript != nil {
		if middleware != nil {
			return nil, badConf
		}
		middleware = func(next http.Handler) (http.Handler, error) {
			return luascript.New(ctx, next, *config.LuaScript, middlewareName)
		}
	}

	if middleware == nil {
		return nil, fmt.Errorf("invalid middleware %q configuration: invalid middleware type or middleware does not exist", middlewareName)
	}

	return tracing.Wrap(ctx, middleware), nil
}
```

到这里我们就完成了自定义中间件。

## 测试
接下来重新编译打包 Traefik 即可：
```shell
$ go generate
$ export GOPROXY=https://goproxy.cn 
$ export GO111MODULE=on 
$ go build ./cmd/traefik
```

编译完成后可以用这个包来测试下这个中间件，首先创建一个 FileProvider 的配置文件：(config.toml)
```toml
[http.routers]
  [http.routers.router1]
    service = "service1"
    middlewares = ["example-luascript"]
    rule = "Host(`localhost`)"

[http.middlewares]
 [http.middlewares.example-luascript.lua]
   script = "example.lua"

[http.services]
 [http.services.service1]
   [http.services.service1.loadBalancer]
     [[http.services.service1.LoadBalancer.servers]]
       url = "https://www.baidu.com"
```

这个配置文件我们使用 FileProvider 来配置了一个请求，将域名 `localhost` 的请求转发到 `service1` 这个 Service 上，在中间使用了 `example-luascript` 这个 lua 中间件，可以看到这里我们用 `script` 属性指定了一个名为 `example.lua` 的脚本，下面来定义这个脚本：(example.lua)
```lua
local http = require('http')
local log = require('log')

log.warn('Hello from LUA script')
http.setResponseHeader('X-New-Response-Header', 'QikQiak')
```

现在我们可以直接使用上面编译好的 Traefik 二进制文件来启动服务：
```shell
# 用 --providers.file 开启 FileProvider，指定配置文件
$ ./traefik --providers.file.filename=config.toml --log.level=warn 
INFO[0000] Configuration loaded from flags.
```
<!--adsense-text-->
然后我们打开另外一个终端，在终端中输入如下请求命令：
```shell
$ curl -v http://localhost
* Rebuilt URL to: http://localhost/
*   Trying ::1...
* TCP_NODELAY set
* Connected to localhost (::1) port 80 (#0)
> GET / HTTP/1.1
> Host: localhost
> User-Agent: curl/7.54.0
> Accept: */*
>
< HTTP/1.1 403 Forbidden
< Content-Length: 0
< Content-Type: text/plain; charset=utf-8
< Date: Mon, 20 Jan 2020 04:00:15 GMT
< Server: bfe
< X-New-Response-Header: QikQiak
<
* Connection #0 to host localhost left intact
```

我们可以看到 baidu.com 给我们返回的响应 Header 里面有我们在 lua 脚本里面的定义信息：
```shell
...
< X-New-Response-Header: QikQiak
...
```

同时也可以发现 Traefik 日志中新的记录输出：
```shell
WARN[2020-01-20T12:03:51+08:00] Hello from LUA script                         middlewareName=example-luascript@file middlewareType=LuaScript
```

到这里我们就完成了自定义 Traefik 中间件。不过我们也可以看到上面的方式耦合性太高了，需要我们去官方的源代码中去添加代码，这样显然不是一个很好的做法，即使我们自定义的中间件非常有用，要想合并到官方的主线中去也是比较困难的，至少时间成本非常高。在 Traefik 的 [Github Issue](https://github.com/containous/traefik/issues/1336) 中也有关于自定义插件的讨论，不过讨论虽然非常热闹，不过这个已经过去两年了还是没有什么进展，所以要想等到官方支持这个特性，估计需要很长一段路要走了......

![custom traefik middleware](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/traefik-custom-middleware-issue.png)


## 参考资料

* [enable custom plugins/middlewares for Traefik #1336](https://github.com/containous/traefik/issues/1336)
* [LuaScript middleware for Traefik v2](https://github.com/negasus/traefik2-luascript)

<!--adsense-self-->
