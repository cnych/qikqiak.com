---
title: 使用 GitHub Actions 自动化构建 Golang 应用
date: 2019-08-24
tags: ["CI", "CD", "github", "golang", "pipeline"]
keywords: ["CI", "CD", "github", "GitHub Actions", "golang", "pipeline"]
slug: use-github-actions-build-go-app
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/photo-1566568216493-71bf7995310a.jpeg", desc: "https://unsplash.com/photos/MUbcybuo7aY"}]
category: "devops"
---

GitHub 前一段时间推出了自家的自动化构建工具：[GitHub Actions](https://github.com/features/actions)，不过目前还没有开放注册，只能通过申请等待官方审核。我第一时间就提交了申请，现在已经审核通过了，所以第一时间体验了`GitHub Actions`的功能，总体感受是 Travis CI 之类的工具应该现在在墙角`瑟瑟发抖`吧😄？

`GitHub Actions`允许构建一个完整的 CI/CD Pipeline，与 GitHub 生态系统深度集成，而无需使用 Travis CI 或者 Circle CI 等第三方服务，对于开源项目都是可以免费使用的。如果你也想尽快使用的话，可以通过链接 [https://github.com/features/actions/signup](https://github.com/features/actions/signup) 去申请权限。

![github actions](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions.jpg)

<!--more-->

## Golang 项目
为了演示`GitHub Actions`的功能，我们这里来构建一个最简单的"Hello world"的 Golang 程序，其中就包含一个基本的 Pipeline，每次`Pull Request`或者推送代码到 master 分支的时候就会触发该 Pipeline 的自动构建，进行代码的 lint 操作、运行单元测试并使用 [Codecov](https://codecov.io/) 生成代码覆盖率报告。

当在仓库上创建一个新的`tag`的时候，Pipeline 会使用 [GoReleaser](https://goreleaser.com/) 工具发布一个新的 GitHub 版本。

> GoReleaser 是一个 Golang 项目的自动化发布工具，可以简化构建、发布流程，为所有流程提供了一些自定义的选项。

在 GitHub 上新建一个名为 [go-github-actions](https://github.com/cnych/go-github-actions)的仓库，在项目根目录下面创建一个 main.go 文件，内容如下所示：

```golang
package main

import (
	"fmt"

	"github.com/cnych/go-github-actions/hello"
)

func main() {
	fmt.Println(hello.Greet())
}
```

可以看到我们调用了 hello 这个 package 下面的 Greet 函数，所以需要在根目录下面新建一个名为 hello 的 package，在 package 下面新建一个 hellog.go 的文件，内容如下所示：

```golang
package hello

// Greet... Greet GitHub Actions
func Greet() string {
	return "Hello GitHub Actions"
}
```

在项目根目录下面初始化 go modules：
```shell
$ go mod init github.com/cnych/go-github-actions
go: creating new go.mod: module github.com/cnych/go-github-actions
```

然后在 hello 这个 package 下面创建一个单元测试的文件（hello_test.go），内容如下所示：
```golang
package hello

import "testing"

func TestGreet(t *testing.T) {
	result := Greet()
	if result != "Hello GitHub Actions" {
		t.Errorf("Greet() = %s; Expected Hello GitHub actions", result)
	}

}
```

在根目录下面执行单元测试：
```golang
$ go test ./hello
ok  	github.com/cnych/go-github-actions/hello	0.007s
$ go run main.go
Hello GitHub Actions
```

最终的代码结构如下所示：
```shell
$ tree .
.
├── README.md
├── go.mod
├── hello
│   ├── hello.go
│   └── hello_test.go
└── main.go

1 directory, 5 files
```

最后不要忘记把代码推送到 GitHub 上面去。
<!--adsense-text-->

## GitHub Actions Pipeline
当我们把代码推送到 GitHub 上去过后，在页面上可以看到 Actions 的入口（前提是已经开通了）：

![github actions config](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-config.jpg)

在页面中可以看到 Actions 为我们提供了很多内置的 workflow，比如 golang、Rust、Python、Node 等等，我们这里来自己编写 workflow，点击右上角的`Set up a workflow yourself`，跳转到 Pipeline 的编写页面：

![github actions pipeline custom](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-custom.png)

可以通过属性`on`来控制 workflow 被触发构建的条件，比如当代码推送到`master`和`release`分支的时候触发构建：

```yaml
on:
  push:
    branches:
    - master
    - release/*
```

当只有`pull_request`被合并到`master`分支的时候：
```yaml
on:
  pull_request:
    branches:
    - master
```

除此之外，还可以通过定时任务来进行触发，比如星期一到星期五的每天2点构建任务呢：
```yaml
on:
  schedule:
  - cron: 0 2 * * 1-5
```

GitHub Actions Workflow 的完整语法可以在文档 [https://help.github.com/articles/workflow-syntax-for-github-actions](https://help.github.com/articles/workflow-syntax-for-github-actions) 中查看到。

另外一个比较重要的是`action`，actions 是可重复使用的工作单元，可由任何人在 GitHub 上构建和分发，我们可以在 GitHub marketplace 中找打各种各样的操作，通过指定包含 action 和 想使用的 ref 来进行操作：
```yaml
- name: < display name for action >
  uses: {owner}/{repo}@ref
  with:
      <map of inputs>
```

通过查看 GitHub Actions 为我们生成的默认的 workflow 脚本，我们就可以看出 workflow 是满足某些条件或事件的时候的一组任务（job）和步骤（step）：
```yaml
name: CI

on: [push]

jobs:
  build:

    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v1
    - name: Run a one-line script
      run: echo Hello, world!
    - name: Run a multi-line script
      run: |
        echo Add other actions to build,
        echo test, and deploy your project.
```

在一个项目中还可以有多个 workflow，每个 workflow 都响应一组不同的事件。


### main workflow
在我们这里的示例中，我们将会定义两个 workflow，推送代码到 master 分支或者创建 PR 的时候将触发 Build 的 workflow，当创建了一个新的 tag 的时候，会触发 Release 的 workflow，该工作流会发布一个新的应用版本。

每个 workflow 由一个或多个 Job 组成，我们的 Build Workflow 包含3个 Job（Lint、Build 和 Test），而 Release Workflow 只包含一个 Release 的 Job。

每个 Job 都由多个 Step 组成，比如，“单元测试”的 Job 就包含获取代码、运行测试和生产代码覆盖率报告的几个步骤。

Workflow 会被定义在代码仓库根目录下面的`.github/workflows`目录中的 YAML 文件中，该目录下面的每个文件就代表了不同的工作流。

下面是我们定义的 Build Workflow：（main.yaml）
```yaml
name: Build and Test
on:
  push:
    branches:
      - master
  pull_request:

jobs:

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Set up Go
        uses: actions/setup-go@v1
        with:
          go-version: 1.12

      - name: Check out code
        uses: actions/checkout@v1

      - name: Lint Go Code
        run: |
          export PATH=$PATH:$(go env GOPATH)/bin # temporary fix. See https://github.com/actions/setup-go/issues/14
          go get -u golang.org/x/lint/golint 
          make lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Set up Go
        uses: actions/setup-go@v1
        with:
          go-version: 1.12

      - name: Check out code
        uses: actions/checkout@v1

      - name: Run Unit tests.
        run: make test-coverage

      - name: Upload Coverage report to CodeCov
        uses: codecov/codecov-action@v1.0.0
        with:
          token: ${{secrets.CODECOV_TOKEN}}
          file: ./coverage.txt

  build:
    name: Build
    runs-on: ubuntu-latest 
    needs: [lint, test]
    steps:
      - name: Set up Go
        uses: actions/setup-go@v1
        with:
          go-version: 1.12

      - name: Check out code
        uses: actions/checkout@v1

      - name: Build
        run: make build
```

我们首先定义了 workflow 的名称和触发规则，我们希望代码推送到 master 分支或者执行一个 PR 的时候触发，所以定义的触发器规则如下：
```yaml
on:
  push:
    branches:
      - master
  pull_request:
```

然后在整个 workflow 中包含了3个 Job：Lint、Test 和 Build，Lint 的 Job 定义如下：
```yaml
lint:
  name: Lint
  runs-on: ubuntu-latest
  steps:
  - name: Set up Go
    uses: actions/setup-go@v1
    with:
      go-version: 1.12

  - name: Check out code
    uses: actions/checkout@v1

  - name: Lint Go Code
    run: |
      export PATH=$PATH:$(go env GOPATH)/bin # temporary fix. See https://github.com/actions/setup-go/issues/14
      go get -u golang.org/x/lint/golint 
      make lint
```

这里我们指定了我们希望这个 Job 任务在 ubuntu 机器上运行（`runs-on`关键字）。Actions 现在支持 Linux、Mac、Windows 和 Docker 环境，在以后，也可以将自己的机器来作为 runners 运行，类似与 GitLab CI Runner。然后定义了该 Job 任务的执行步骤：

首先是安装 Golang 环境，GitHub 已经提供了这样的一个 action，所以我们直接使用即可：
```yaml
- name: Set up Go
  uses: actions/setup-go@v1
  with:
    go-version: 1.12
```

> 可以在 GitHub marketplace 上面找到 action 的具体使用方法：[https://github.com/marketplace/actions/setup-go-for-use-with-actions](https://github.com/marketplace/actions/setup-go-for-use-with-actions)。

其实这里的步骤声明语法很明确了，`with`关键字允许我们指定 action 所需的参数，这里`setup-go`这个 action 允许我们指定要使用的 go 版本，由于我们上面的例子中使用了 go modules，所以我们这里指定使用的是`1.12`版本（大于1.11即可），然后下一个步骤就是获取源代码，同样这里还是直接使用内置的一个 action：
```yaml
- name: Check out code
  uses: actions/checkout@v1
```

然后我们安装和运行`golint`工具：
```yaml
- name: Lint Go Code
  run: |
    export PATH=$PATH:$(go env GOPATH)/bin
    go get -u golang.org/x/lint/golint 
    make lint
```

这样 Lint 这个 Job 任务就定义完成了，其余的 Job 也非常类似，比如我们再来看下 Test 这个 Job 任务，定义如下所示：
```yaml
test:
  name: Test
  runs-on: ubuntu-latest
  steps:
  - name: Set up Go
    uses: actions/setup-go@v1
    with:
      go-version: 1.12

  - name: Check out code
    uses: actions/checkout@v1

  - name: Run Unit tests.
    run: make test-coverage

  - name: Upload Coverage report to CodeCov
    uses: codecov/codecov-action@v1.0.0
    with:
      token: ${{secrets.CODECOV_TOKEN}}
      file: ./coverage.txt
```

这里的定义唯一不同的是上传代码测试覆盖率使用的 action 是一个第三方的，当然这个 action 也在 marketplace 上面可以找到：[https://github.com/marketplace/actions/codecov](https://github.com/marketplace/actions/codecov)，我们会将测试的代码覆盖率上传到 [CodeCov](https://www.codecov.io/)。这里我们需要使用 GitHub 的`secrets`来存储操作 CodeCov 所需要的`Codecov Token`，在 CodeCov 网站上通过 GitHub 用户授权登录，然后启用上面的[go-github-actions]项目，就可以获得`Codecov Token`的值，然后在 GitHub 项目 settings -> Secrets 下面添加，Name 为`CODECOV_TOKEN`，Value 就是刚刚获取的`Codecov Token`的值。这样我们就完成了 Test 这个 Job 任务的操作声明。

> 我们可以使用任何语言创建自己的 actions（只需要包含一个 Dockerfile 文件），如果你喜欢使用 Typescript 的话还可以直接使用官方提供的 action 开发工具包：[https://github.com/actions/toolkit](https://github.com/actions/toolkit)。

这样我们就完成了第一个 workflow😄，不过需要注意的是我们这里所有的操作都是通过 make 命令执行的，所以我们还需要在项目根目录中添加一个 Makefile 文件，内容如下所示：
```shell
PROJECT_NAME := "github.com/cnych/go-github-actions"
PKG := "$(PROJECT_NAME)"
PKG_LIST := $(shell go list ${PKG}/... | grep -v /vendor/)
GO_FILES := $(shell find . -name '*.go' | grep -v /vendor/ | grep -v _test.go)

.PHONY: all dep lint vet test test-coverage build clean

all: build

dep: ## Get the dependencies
	@go mod download

lint: ## Lint Golang files
	@golint -set_exit_status ${PKG_LIST}

vet: ## Run go vet
	@go vet ${PKG_LIST}

test: ## Run unittests
	@go test -short ${PKG_LIST}

test-coverage: ## Run tests with coverage
	@go test -short -coverprofile cover.out -covermode=atomic ${PKG_LIST}
	@cat cover.out >> coverage.txt

build: dep ## Build the binary file
	@go build -i -o build/main $(PKG)

clean: ## Remove previous build
	@rm -f ./build

help: ## Display this help screen
	@grep -h -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
```

接下来我们创建一个新的分支改一点代码然后在 Actions 中查看下 PR 的 workflow：
```shell
$ git checkout -b actions-demo
Switched to a new branch 'actions-demo'
```

然后修改 hello 这个 package 下面的 Greet 函数：
```golang
// Greet ... Greet GitHub Actions
func Greet() string {
  return "Hello GitHub Actions. qikqiak.com is awesome"
}
```

当然同样也要修改下 hello_test.go 中的测试代码：
```golang
func TestGreet(t *testing.T) {
  result := Greet()
  if result != "Hello GitHub Actions. qikqiak.com is awesome" {
	t.Errorf("Greet() = %s; Expected Hello GitHub Actions. qikqiak.com is awesome", result)
  }

}
```

要记住上面定义的 workflow 文件同样要添加到项目根目录`.github/workflows/main.yml`文件中，现在推送这个分支然后创建一个 Pull Request 到 master 分支，上面我们定义的工作流就会立刻被触发构建了。而且在 workflow 还未执行完成通过的时候，是不能进行 merge 操作的。
![github actions pr check](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-pr.png)

当任务执行完成后就可以进行 Merge 操作了：
![github actions pr pass](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-pr-pass.png)

上面在 workflow 中我们还和 CodeCov 进行了集成，所以我们可以看到 PR 的状态检查和 Coverage 代码覆盖报告：
![github actions codecov report](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-codev-report.png)


### release workflow
上面我们定义了构建测试的 workflow，接下来我们来定义我们的发布 workflow，使用方法都是类似的，上面我们也提到过每个 workflow 都是一个独立的文件，我们这里创建一个文件`.github/workflows/release.yml`，内容如下所示：
```yaml
name: Release
on:
  create:
    tags:
    - v*

jobs:
  release:
    name: Release on GitHub
    runs-on: ubuntu-latest
    steps:
    - name: Check out code
      uses: actions/checkout@v1

    - name: Validates GO releaser config
      uses: docker://goreleaser/goreleaser:latest
      with:
        args: check

    - name: Create release on GitHub
      uses: docker://goreleaser/goreleaser:latest
      with:
        args: release
      env:
        GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
```

这个 workflow 中我们定义了只在创建新的 tag 时才触发任务，然后只定义了一个 release 的 Job。

上面我们定义的 Job 任务中先获取项目代码，然后使用 [GoReleaser](https://goreleaser.com/) 官方 Docker 镜像来构建任务。当使用 docker 容器的时候，可以定义容器的`args`和`entrypoint`，我们这里分别使用`args`定义了`check`和`release`两个参数。

另外还指定了`GoReleaser`所需的`GITHUB_TOKEN`这个环境变量，这样可以在 GitHub 上来发布我们的应用版本，不过需要注意的是，`secrets.GITHUB_TOKEN`这个变量的值是由 Actions 平台自动注入的，所以不需要我们单独手动去添加了，这样就方便很多了。

然后我们创建一个新的 tag 并推送到代码仓库中去：
```shell
$ git tag v0.1.0
$ git push --tags
Counting objects: 5, done.
Writing objects: 100% (5/5), 799 bytes | 0 bytes/s, done.
Total 5 (delta 0), reused 0 (delta 0)
To git@github.com:cnych/go-github-actions.git
 * [new tag]         v0.1.0 -> v0.1.0
```

如果一切正常就会立刻触发任务构建，Job 任务构建完成后会在 GitHub 上面创建一个新的版本，其中包含由`GoReleaser`工具自动生成的应用包和 Changelog。

![github actions release](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/github-actions-release.png)


到这里我们就完成了第一个 GitHub Actions 的 Pipeline😄，这是一个非常基础的例子，但是对于我们了解 GitHub Actions 的工作方式是一个很好的案例。

## 总结
对于大部分托管在 GitHub 上的开源项目，GitHub Actions 应该足够了，对于更高级的用法，比如手动批准和参数化构建这些企业项目会经常使用的功能目前还不支持，不过 GitHub Actions 现在还处于测试阶段，或许不久的将来就会支持这些功能了，对于 Jenkins、GitLab CI 这些在企业中非常受欢迎的工具来说影响或许不大，但是对于一些依赖 GitHub 的第三方 CI/CD 工具影响就很大了，比如 Travis CI 或者 Circle CI 之类的，因为对于托管在 GitHub 上面的项目来说 GitHub Actions 已经足够优秀了，更重要的是属于内置的功能，所以前面说 Travis CI 现在在某个墙角瑟瑟发抖🤣不是没有道理的。


## 参考文档
* [Features • GitHub Actions](https://github.com/features/actions)
* [Workflow syntax for GitHub Actions
](https://help.github.com/en/articles/workflow-syntax-for-github-actions)
* [Building a basic CI/CD pipeline for a Golang application using GitHub Actions](https://dev.to/brpaz/building-a-basic-ci-cd-pipeline-for-a-golang-application-using-github-actions-icj)

<!--adsense-self-->
