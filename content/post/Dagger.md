---
title: Docker 创始人的新产品 Dagger 好用吗？
date: 2022-04-06
tags: ["devops", "docker", "dagger", "cue"]
keywords: ["kubernetes", "docker", "devops", "cue", "go", "dagger", "ci/cd"]
slug: dagger
gitcomment: true
category: "devops"
---

近日，Docker 创始人 Solomon Hykes 对外宣布推出全新产品 [Dagger](https://dagger.io)，Dagger 是一个全新的 DevOps 平台，目的是为开发者解决 DevOps 流程上的一些问题。目前 Dagger 已经获得 2000 万 A 轮融资，本轮融资由 Redpoint Ventures 领投，GitHub 前 CEO Nat Fireman、Red Hat 前 CTO Brian Stevens 、Reddit 前 CEO Ellan Pao 等大佬参投。

[![](https://picdn.youdianzhishi.com/images/7691649210649_.pic.jpg)](https://dagger.io)

Dagger 要帮助 DevOps 开发者将 CI/CD 流水线编写成 CUE 中的声明性模型，以此为基础，开发者可以描述自己的流水线、并将其中各个环节进行对接，同时全部以纯代码形式实现。

<!--more-->

## 安装

如果你是 macOS 系统，并且安装了 Homebrew，那么可以使用下面的命令来一键安装 `dagger`：

```shell
☸ ➜ brew install dagger/tap/dagger
```

上面的命令会将 `dagger` 安装到 `/opt/homebrew/bin` 目录：

```shell
☸ ➜ type dagger
dagger is /opt/homebrew/bin/dagger
```

如果你没有安装 Homebrew 或者其他系统，或者你想安装指定版本的 `dagger`，可以使用下面的命令进行安装：

```shell
☸ ➜ curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.2.4 sh

☸ ➜ ./bin/dagger version
dagger 0.2.4 (GIT_SHA) darwin/arm64
```

由于 `dagger` 是利用 Docker 来进行执行任务的，所以在正式使用之前需要安装运行 Docker Engine。

## 示例

现在我们来使用官方的 `todo` 示例应用来演示如何使用 `dagger` 运行它的 CI/CD 流水线。

首先获取示例应用代码：

```shell
☸ ➜ git clone https://github.com/dagger/dagger
☸ ➜ cd dagger
☸ ➜ git checkout v0.2.4
```

进入示例应用代码根目录执行 `dagger do build` 命令执行 CI/CD 流水线：

```shell
☸ ➜ cd pkg/universe.dagger.io/examples/todoapp
☸ ➜ dagger do build
```

第一次执行任务的时候，由于没有缓存，需要安装所有的依赖项，所以为该示例应用进行测试构建的时候需要花一段时间才能完成：

```shell
[✔] client.filesystem."./".read                                                                   0.4s
[✔] actions.deps                                                                                170.8s
[✔] actions.test.script                                                                           0.2s
[✔] actions.build.run.script                                                                      0.2s
[✔] actions.test                                                                                  4.4s
[✔] actions.build.run                                                                            49.6s
[✔] actions.build.contents                                                                        0.1s
[✔] client.filesystem."./_build".write                                                            0.4s
```

上面的结果显示了我们上面的构建命令的执行结果，在整个执行过程中会在本地的一个名为 `dagger-buildkitd` 的容器中进行：

![](https://picdn.youdianzhishi.com/images/20220405173323.png)

这样证明了 `dagger` 是在 Docker 的执行引擎 `BuildKit` 中去执行任务的。

由于这是一个静态应用程序，我们可以在浏览器中打开最终生成的文件，这里我们是定义最后将构建结果复制到主机上的 `_build` 目录中。我们可以执行 `open _build/index.html` 命令来预览该应用：

![](https://picdn.youdianzhishi.com/images/20220405174337.png)

现在我们不需要安装任何特定应用的依赖，`dagger` 管理了所有的这些中间步骤，有了 `dagger` 我们也不需要每次都去 commit、push 代码后才能看到应用的结果，而且每个执行的动作都有缓存，后续的运行会非常快。

比如在 `todoapp` 目录中，编辑 `src/components/Form.js` 的第 25 行，将改行内容修改为 `What must be done today?` 并保存文件，然后再次在本地运行 build 命令：

```shell
dagger do build

[✔] client.filesystem."./".read                                                                   0.2s
[✔] actions.deps                                                                                  1.8s
[✔] actions.test.script                                                                           0.2s
[✔] actions.build.run.script                                                                      0.2s
[✔] actions.test                                                                                  0.0s
[✔] actions.build.run                                                                             0.0s
[✔] actions.build.contents                                                                        0.0s
[✔] client.filesystem."./_build".write                                                            0.5s
```

我们可以看到整个流水线的执行时间大幅度降低了，而且结果也正确输出了。

## 流水线定义

`dagger` 使用的是 CUE 语言来定义流水线，所以我们必须要先了解这门语言，可以参考前文我们介绍的关于 CUE 语言的基本使用。

我们这里的示例应用的流水线定义如下所示：

```cue
package todoapp

import (
 "dagger.io/dagger"
 "dagger.io/dagger/core"
 "universe.dagger.io/alpine"
 "universe.dagger.io/bash"
 "universe.dagger.io/docker"
 "universe.dagger.io/netlify"
)

dagger.#Plan & {
 _nodeModulesMount: "/src/node_modules": {
  dest:     "/src/node_modules"
  type:     "cache"
  contents: core.#CacheDir & {
   id: "todoapp-modules-cache"
  }

 }
 client: {
  filesystem: {
   "./": read: {
    contents: dagger.#FS
    exclude: [
     "README.md",
     "_build",
     "todoapp.cue",
     "node_modules",
    ]
   }
   "./_build": write: contents: actions.build.contents.output
  }
  env: {
   APP_NAME:      string
   NETLIFY_TEAM:  string
   NETLIFY_TOKEN: dagger.#Secret
  }
 }
 actions: {
  deps: docker.#Build & {
   steps: [
    alpine.#Build & {
     packages: {
      bash: {}
      yarn: {}
      git: {}
     }
    },
    docker.#Copy & {
     contents: client.filesystem."./".read.contents
     dest:     "/src"
    },
    bash.#Run & {
     workdir: "/src"
     mounts: {
      "/cache/yarn": {
       dest:     "/cache/yarn"
       type:     "cache"
       contents: core.#CacheDir & {
        id: "todoapp-yarn-cache"
       }
      }
      _nodeModulesMount
     }
     script: contents: #"""
      yarn config set cache-folder /cache/yarn
      yarn install
      """#
    },
   ]
  }

  test: bash.#Run & {
   input:   deps.output
   workdir: "/src"
   mounts:  _nodeModulesMount
   script: contents: #"""
    yarn run test
    """#
  }

  build: {
   run: bash.#Run & {
    input:   test.output
    mounts:  _nodeModulesMount
    workdir: "/src"
    script: contents: #"""
     yarn run build
     """#
   }

   contents: core.#Subdir & {
    input: run.output.rootfs
    path:  "/src/build"
   }
  }

  deploy: netlify.#Deploy & {
   contents: build.contents.output
   site:     client.env.APP_NAME
   token:    client.env.NETLIFY_TOKEN
   team:     client.env.NETLIFY_TEAM
  }
 }
}

```

从上面的 CUE 文件可以看出 `dagger` 的流水线是以一个 `#Plan` 开始的，在 `#Plan` 中，我们可以：

- 与 `client` 客户端文件系统进行交互
  - 读取文件，通常使用 `.` 表示当前目录
  - 写入文件，通常构建输出为 `_build` 目录
- 读取环境变量，比如上面定义的 `NETLIFY_TOKEN`
- 声明一些动作，比如 test、build、deploy 等等，动作的名称可以随意命名

上面我们定义的流水线整体架构如下所示，其中 `client` 部分定义和客户端相关的交互，`actions` 部分定义的流水线动作：

```cue
dagger.#Plan & {
  client: {
    filesystem: {
      // ...
    }
    env: {
      // ...
    }
  }
  actions: {
    deps: docker.#Build & {
      // ...
    }
    test: bash.#Run & {
      // ...
    }
    build: {
      run: bash.#Run & {
         // ...
      }
      contents: core.#Subdir & {
        // ...
      }
    }
    deploy: netlify.#Deploy & {
      // ...
    }
  }
}
```

前面我们执行 `dagger do build` 命令的时候，会产生以下输出：

```shell
[✔] client.filesystem."./".read                                                                   0.2s
[✔] actions.deps                                                                                  1.8s
[✔] actions.test.script                                                                           0.2s
[✔] actions.build.run.script                                                                      0.2s
[✔] actions.test                                                                                  0.0s
[✔] actions.build.run                                                                             0.0s
[✔] actions.build.contents                                                                        0.0s
[✔] client.filesystem."./_build".write                                                            0.5s
```

由于我们只执行了 `build` 这个动作，所以没有出现 `deploy` 相关的信息，我们可以选择运行特定的动作，只需要在 `dagger do <action>` 后面指定动作名即可，由于 `build` 这个动作的输入是 `test.output`，所以也要执行 `test`，同样 `test` 这个动作的输入是 `deps` 的输出，所以也会执行这个动作。

具体的每一个动作基本上都是使用现成导入的包进行定义，比如 `build` 这个动作，通过 `bash.#Run` 定义执行的流程，代码如下所示：

```cue
build: {
    run: bash.#Run & {
        input:   test.output
        mounts:  _nodeModulesMount
        workdir: "/src"
        script: contents: #"""
            yarn run build
            """#
    }
    contents: core.#Subdir & {
        input: run.output.rootfs
        path:  "/src/build"
    }
}
```

所以通过 `input: test.output` 将 `test` 动作的输出作为本次的输入，然后通过 `mounts` 指定挂载的目录，这样就可以使用缓存的 `nodemodules` 目录了，`workdir` 指定工作目录为 `/src`，然后通过 `script` 指定了执行的命令为 `yarn run build`，整体的定义结构其实就是 `base.#Run` 定义的，可以通过包 `universe.dagger.io/bash` 了解如何定义的。

为了改善开发者体验，`dagger` 推出了名为 `Dagger Universe` 的工具包库，帮助开发者灵活导入自己的 Dagger 配置，上面的流水线中很多都是该工具包中定义的。

### 客户端交互

具体在 `dagger.#Plan` 中可以定义哪些属性或操作，我们可以去查看导入的包 `dagger.io/dagger` 的代码，地址：[https://github.com/dagger/dagger/blob/main/pkg/dagger.io/dagger/plan.cue](https://github.com/dagger/dagger/blob/main/pkg/dagger.io/dagger/plan.cue)。该文件中定义了 `#Plan` 的所有属性，比如可以通过 `client` 可以进行客户端交互。

**访问文件系统**

可以通过 `client.filesystem` 可以定义访问文件系统：

```cue
dagger.#Plan & {
    client: filesystem:  {
        ".": read: {
            // 将本地目录加载为 dagger.#FS
            contents: dagger.#FS
            exclude: ["node_modules"]
        }
        "config.yaml": write: {
            // 将 CUE 值转换为 YAML 格式的字符串
            contents: yaml.Marshal(actions.pull.output.config)
        }
    }

    actions: {
        copy: docker.#Copy & {
            contents: client.filesystem.".".read.contents
        }
        // ...
    }
}
```

**获取本地 Socket：**

```cue
dagger.#Plan & {
    client: network: "unix:///var/run/docker.sock": connect: dagger.#Socket

    actions: {
        image: alpine.#Build & {
            packages: "docker-cli": {}
        }
        run: docker.#Run & {
            input: image.output
            mounts: docker: {
                dest:     "/var/run/docker.sock"
                contents: client.network."unix:///var/run/docker.sock".connect
            }
            command: {
                name: "docker"
                args: ["info"]
            }
        }
    }
}
```

**环境变量**

环境变量可以从宿主机上读取为字符串或者 Secret，只需指定类型即可：

```cue
dagger.#Plan & {
    client: env: {
        REGISTRY_USER:  string
        REGISTRY_TOKEN: dagger.#Secret
    }
    actions: pull: docker.#Pull & {
        source: "registry.example.com/image"
        auth: {
            username: client.env.REGISTRY_USER
            secret:   client.env.REGISTRY_TOKEN
        }
    }
}
```

**执行命令**

有时你需要执行一些本地命令，同样可以在 `client` 中定义：

```cue
dagger.#Plan & {
    client: commands: {
        os: {
            name: "uname"
            args: ["-s"]
        }
        arch: {
            name: "uname"
            args: ["-m"]
        }
    }

    actions: build: go.#Build & {
        os:   client.commands.os.stdout
        arch: client.commands.arch.stdout
        // ...
    }
}
```

**获取平台信息**

通过 `client.platform` 可以获取平台信息：

```cue
dagger.#Plan & {
    client: _

    actions: build: go.#Build & {
        os:   client.platform.os
        arch: client.platform.arch
        // ...
    }
}
```

### 构建镜像

同样我们可以使用 `dagger` 来构建容器镜像，如下所示代码：

```cue
package main

import (
    "dagger.io/dagger"
    "universe.dagger.io/docker"
)

dagger.#Plan & {
    client: filesystem: "./src": read: contents: dagger.#FS

    actions: build: docker.#Dockerfile & {
        // 构建上下文
        source: client.filesystem."./src".read.contents

        // 默认在 context 中查找 Dockerfile，这里我们直接声明
        dockerfile: contents: #"""
            FROM python:3.9
            COPY . /app
            RUN pip install -r /app/requirements.txt
            CMD python /app/app.py
            """#
    }
}
```

这里我们导入了 `universe.dagger.io/docker` 包，所以在 `build` 这个动作中使用的一个 `docker.#Dockerfile` 定义，首先通过 `client.filesystem` 读取 `./src` 目录内容，然后在 `build` 动作中指定构建上下文，然后通过 `dockerfile.contents` 直接定义使用的 Dockerfile，当然我们也可以直接在 `./src` 目录中提供一个 Dockerfile 文件。

除了直接使用 Dockerfile 这种方式，我们也可以直接在 CUE 中构建镜像，如下所示代码与上面的结果完全一样：

```cue
package main

import (
    "dagger.io/dagger"
    "universe.dagger.io/docker"
)

dagger.#Plan & {
    client: filesystem: "./src": read: contents: dagger.#FS

    actions: build: docker.#Build & {
        steps: [
            docker.#Pull & {
                source: "python:3.9"
            },
            docker.#Copy & {
                contents: client.filesystem."./src".read.contents
                dest:     "/app"
            },
            docker.#Run & {
                command: {
                    name: "pip"
                    args: ["install", "-r", "/app/requirements.txt"]
                }
            },
            docker.#Set & {
                config: cmd: ["python", "/app/app.py"]
            },
        ]
    }
}
```

这里我们就是通过的 `docker.#Build` 这个定义来进行配置的，通过 `steps` 可以定义构建步骤，`docker.#Pull` 相当于指定基础镜像，`docker.#Copy` 拷贝源码文件目录，`docker.#Run` 配置镜像构建命令，`docker.#Set` 指定镜像的启动命令，其实就相当于通过 CUE 去实现了 Dockerfile 的声明。

## 总结

`dagger` 采用 CUE 这门语言来配置流水线，所以这自然也增加了一些门槛，但如果你熟悉了 CUE 过后，就会发现 `dagger` 的流水线配置非常简单，基本上就是看下包的定义就知道如何使用了。

`dagger` 的宣传口号是用于 CI/CD 流水线的便携式开发工具包，它允许 DevOps 工程师快速构建强大的 CI/CD 流水线，可以在任何地方运行它们，可以统一开发和 CI 环境，在本地测试和调试管道，这无疑是 `dagger` 目前表现出来最大的好处，但是你要说这会是一个 DevOps 领域的颠覆式产品吗？至少目前来说还没有看到这些颠覆的点在什么地方，当然 `dagger` 还处于非常早期阶段，或许后续会有越来越多让我们惊讶的功能出现。
