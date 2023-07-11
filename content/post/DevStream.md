---
title: DevOps 工具链管理器 DevStream 还真是神器
date: 2022-07-02
tags: ["kubernetes", "devops"]
keywords: ["kubernetes", "devops", "devstream", "工具链"]
slug: devops-tools-chain-devstream
gitcomment: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/1658384199220.jpg",
      desc: "https://unsplash.com/photos/6gZDIWrsfTs",
    },
  ]
category: "kubernetes"
---

[DevStream](https://github.com/devstream-io/devstream) 是一个开源的 DevOps 工具链管理器，因开发者而生，由开发者开发，为开发者服务。

想象你正在开始一个新的项目或组建一个新的团队。在写第一行代码之前，你需要一个能够高效运转 SDLC(软件开发生命周期)和承载开发至部署全过程的工具。

通常情况下，你需要以下几个部分来高效地工作。

- 项目管理软件或  `issue`  追溯工具（JIRA 等）
- 源代码管理（GitHub、Bitbucket 等）
- 持续集成（Jenkins、CircleCI、Travis CI 等）
- 持续交付/部署（Flux CD/Flux2、Argo CD 等)
- 密钥和证书的单一事实来源(A single source of truth)（密钥管理器，如 HashiCorp 的 Vault）
- 集成化的日志和监控工具（例如，ELK、Prometheus/Grafana）
- ......

实际的情况可能远不止这些，要找到合适的组件本身就不容易了，再将这些工具整合起来就更难了，需要花费大量的时间和精力。而 `DevStream` 就是为简化整合 DevOps 组件而构建的工具，有点类似于 `yum`、`apt` 这些软件包管理工具，`DevStream` 就是 DevOps 工具领域的软件包管理器。

<!--more-->

## 核心概念

DevOps 中通用的一些概念，比如 Git、Docker、Kubernetes、Continuous Integratoin、Continuous Delivery 和 GitOps，这些也是 DevStream 的核心概念。

`DevStream` 中涉及到几个自己的概念：Config（配置）、Tool（工具）、State（状态）、Resource（资源），这几个概念构成了 `DevStream` 的整个工作流，下面我们来具体了解下这几个概念。

### Config（配置）

`DevStream` 通过配置文件来定义你的 DevOps 工具链，一共包括 3 个配置文件：

- main config file（主配置文件）
- variable config file（变量配置文件）
- tool config file（工具配置文件）

**主配置文件**

默认情况下，dtm（DevStream 的命令行工具）会尝试使用 `./config.yaml` 作为主配置文件。主配置文件主要包含 3 个部分：

- `varFile`：var 文件的文件路径
- `toolFile`：工具文件的文件路径
- `state`：与状态相关的设置

如下所示的 `config.yaml` 文件就是一个主配置文件：

```yaml
# config.yaml
varFile: variables.yaml

toolFile: tools.yaml

state:
  backend: local
  options:
    stateFile: devstream.state
```

**变量配置文件**

变量配置文件是一个包含键值对的 YAML 文件，可以在工具配置文件中使用。

如下所示的 `variables.yaml` 文件就是一个变量配置文件：

```yaml
# variables.yaml
githubUsername: cnych
repoName: dtm-test-go
defaultBranch: main
dockerhubUsername: cnych
```

**工具配置文件**

工具配置文件包含工具列表。工具文件包含以下内容：

- 目前只有一个配置块，即 `tools`
- `tools` 是一个字典列表
- 每个字典都定义了一个由 `DevStream` 插件管理的 DevOps **工具**
- 每个字典（工具）都有以下必填字段：
  - `name`：工具/插件的名称，字符串，不带下划线
  - `instanceID`：该工具实例的 id
  - 一个配置文件中可以有重复的名称，也可以在一个配置文件中有重复的 `instanceID`，但是 `name + instanceID` 的组合在一个配置文件中必须是唯一的
- 每个工具都有一个可选字段，即 `options`，它是一个包含该特定插件参数的字典
- 每个工具都有一个可选字段，即 `dependsOn`，用来定义相关依赖项

如下所示的 `tools.yaml` 文件就定义了一个工具配置文件：

```yaml
# tools.yaml
tools:
- name: github-repo-scaffolding-golang
  instanceID: default
  options:
    owner: [[ githubUsername ]]
    org: ""
    repo: [[ repoName ]]
    branch: [[ defaultBranch ]]
    image_repo: [[ dockerhubUsername ]]/[[ repoName ]]
- name: jira-github-integ
  instanceID: default
  dependsOn: [ "github-repo-scaffolding-golang.default" ]
  options:
    owner: [[ githubUsername ]]
    repo: [[ repoName ]]
    jiraBaseUrl: https://xxx.atlassian.net
    jiraUserEmail: foo@bar.com
    jiraProjectKey: zzz
    branch: main
```

配置文件中的变量可以看到我们是通过 `[[ varNameHere ]]` 来定义的。`DevStream` 将使用提供的 var 文件来渲染上面的配置。

**state**

主配置文件中还包括一个 `state` 属性，`state` 部分指定存储 `DevStream` 状态的位置。到目前的 v0.6.0 版本开始，`DevStream` 同时支持 `local` 和 `s3` 后端存储来保存 `DevStream` 的状态。

如果使用的是 `local` 模式，那么 `state.options.stateFile` 是必须配置的属性。如果使用 `s3` 这种后端存储模式，则对应的配置如下所示：

```yaml
varFile: variables.yaml
toolFile: tools.yaml
state:
  backend: s3
  options:
    bucket: devstream-remote-state
    region: ap-southeast-1
    key: devstream.state
```

其中 `state.options` 属性下的 `bucket`、`region` 和 `key` 都是 `s3` 后端的必填字段。在真正使用的时候我们需要通过环境变量来配置 AWS 的相关密钥信息：

```shell
export AWS_ACCESS_KEY_ID=ID_HERE
export AWS_SECRET_ACCESS_KEY=SECRET_HERE
export AWS_DEFAULT_REGION=REGION_HERE
```

> 注意：同样我们也可以将多个 YAML 文件放在同一个文件中，并用三个破折号 (---) 分隔不同的文件。

### Tool（工具）

- 每个工具对应着一个插件，可以用来安装、配置或集成一些 DevOps 工具。
- 每个工具都有其名称、InstanceID 和选项。
- 每个工具都可以有其依赖项，这些依赖项由 `dependsOn` 字段指定。

`dependsOn` 是一个字符串数组，每个元素都是一个依赖。每个依赖项都以 `TOOL_NAME.INSTANCE_ID` 的格式命名。

### State（状态）

State 记录了您的 DevOps 工具链的当前状态，它包含每个工具的配置和当前状态。

- 状态是一个 Map
- Map 中的每个状态都是一个包含名称、插件、选项和资源的结构

### Resource（资源）

我们将创建的插件称为资源，插件的 `Read()` 接口将返回对该资源的描述，该描述又存储为状态的一部分。

`DevStream` 的整个工作流如下图所示：
![](https://picdn.youdianzhishi.com/images/1656729342474.jpg)

- 首先获取工具状态
- 如果状态中没找到工具，则调用 `Create()` 接口创建
- 如果状态中找到了工具，则从状态中进行配置对比，如果有变化，则调用 `Update()` 接口进行更新
- 如果没有变化则调用 `Read()` 接口从资源中获取描述信息
- 如果没有对应的资源，则调用 `Create()` 接口创建资源
- 如果有对应的资源，则从状态中进行资源对比，如果有变化，同样调用 `Update()` 接口更新
- 如果没任何变化则忽略

## 安装

`DevStream` 的命令行工具叫 `dtm`，我们只需要下载该文件即可，前往 Release 页面 <https://github.com/devstream-io/devstream/releases> 打开最新的版本，下载对应平台的安装包（目前只支持 Linux 和 MacOS 系统）。

比如我这里是 Mac m1 平台，则下载 <https://devstream.gateway.scarf.sh/releases/v0.7.0/dtm-darwin-arm64> 这个安装包，

标记 dtm 为可执行文件，然后将其移动到 PATH 路径下面去：

```shell
mv dtm-darwin-arm64 dtm
chmod +x dtm
sudo mv dtm /usr/local/bin
```

现在我们可以通过执行 dtm 命令来验证是否安装成功。

![](https://picdn.youdianzhishi.com/images/1656732896001.png)

## 使用

### 基本命令

安装完成后我们就可以使用 `dtm` 工具了，直接执行 `dtm` 命令会显示目前所有的可用命令。

比如使用 `dtm list plugins` 命令可以查看目前 `DevStream` 支持的插件列表。

```shell
$ dtm list plugins
argocd
argocdapp
devlake
github-repo-scaffolding-golang
githubactions-golang
githubactions-nodejs
githubactions-python
gitlab-ce-docker
gitlab-repo-scaffolding-golang
gitlabci-generic
gitlabci-golang
hashicorp-vault
helm-generic
jenkins
jira-github-integ
kube-prometheus
openldap
tekton
trello
trello-github-integ
```

使用 `dtm show config` 命令可以显示默认的配置信息，其实就是 3 个主要配置文件的配置样例，如下所示：

```shell
$ dtm show config
# defaultconfig.yaml sample:
# var file path, you can set it to absolute path or relative path.
varFile: variables.yaml # here is a relative path. (defaults is ./variables.yaml)
# tool file path, you can set it to absolute path or relative path.
toolFile: tools.yaml # here is a relative path.
# state config
state:
  backend: local # backend can be local or s3
  options:
    stateFile: devstream.state

# tools.yaml sample:
tools:
  - name: github-repo-scaffolding-golang
    instanceID: default
    options:
      owner: [ [ githubUsername ] ]
      org: ""
      repo: [ [ repoName ] ]

# variables.yaml sample:
githubUsername: daniel-hutao
repo: go-webapp-demo
```

此外我们还可以在 `show config` 命令后面添加一个 `--plugin` 参数，来显示指定插件的配置信息，比如我们查看 argocd 的配置，如下所示：

```shell
$ dtm show config --plugin argocd
tools:
  # name of the tool
  - name: argocd
    # id of the tool instance
    instanceID: default
    # format: name.instanceID; If specified, dtm will make sure the dependency is applied first before handling this tool.
    dependsOn: [ ]
    # options for the plugin
    options:
      # need to create the namespace or not, default: false
      create_namespace: true
      repo:
        # name of the Helm repo
        name: argo
        # url of the Helm repo
        url: https://argoproj.github.io/argo-helm
      # Helm chart information
      chart:
        # name of the chart
        chart_name: argo/argo-cd
        # release name of the chart
        release_name: argocd
        # k8s namespace where ArgoCD will be installed
        namespace: argocd
        # whether to wait for the release to be deployed or not
        wait: true
        # the time to wait for any individual Kubernetes operation (like Jobs for hooks). This defaults to 5m0s
        timeout: 5m
        # whether to perform a CRD upgrade during installation
        upgradeCRDs: true
        # custom configuration (Optional). You can refer to [ArgoCD values.yaml](https://github.com/argoproj/argo-helm/blob/master/charts/argo-cd/values.yaml)
        values_yaml: |
          controller:
            service:
              port: 8080
```

如果我们想要开发自己的插件，可以使用 `dtm develop` 命令：

```shell
$ dtm develop
Develop is used for develop a new plugin

Usage:
  dtm develop [command]

Available Commands:
  create-plugin   Create a new plugin
  validate-plugin Validate a plugin

Flags:
  -h, --help   help for develop

Global Flags:
      --debug   debug level log

Use "dtm develop [command] --help" for more information about a command.
```

其中包含 `create-plugin` 和 `validate-plugin` 两个子命令，一个用于创建一个新的插件，一个用于校验插件使用，比如创建一个名为 `plugin-demo` 的插件：

```shell
$ dtm develop create-plugin
2022-07-02 12:10:29 ✖ [FATAL]  the name must be not "", you can specify it by --name flag
$ dtm develop create-plugin --name plugin-demo
2022-07-02 12:10:45 ℹ [INFO]  Render template files finished.
2022-07-02 12:10:45 ℹ [INFO]  Persist all files finished.

The DevStream PMC (project management committee) sincerely thank you for your devotion and enthusiasm in creating new plugins!

To make the process easy as a breeze, DevStream(dtm) has generated some templated source code files for you to flatten the learning curve and reduce manual copy-paste.
In the generated templates, dtm has left some special marks in the format of "TODO(dtm)".
Please look for these TODOs by global search. Once you find them, you will know what to do with them. Also, please remember to check our documentation on creating a new plugin:

**README_when_create_plugin.md**

Source code files created.

Happy hacking, buddy!
Please give us feedback through GitHub issues if you encounter any difficulties. We guarantee that you will receive unrivaled help from our passionate community!
```

上面的命令会创建一个插件开发的脚手架，结构如下所示：

```shell
$ tree .
.
├── README_when_create_plugin.md
├── cmd
│   └── plugin
│       └── plugin-demo
│           └── main.go
├── docs
│   └── plugins
│       └── plugin-demo.md
└── internal
    └── pkg
        ├── plugin
        │   └── plugindemo
        │       ├── create.go
        │       ├── delete.go
        │       ├── options.go
        │       ├── plugindemo.go
        │       ├── read.go
        │       ├── update.go
        │       └── validate.go
        └── show
            └── config
                └── plugins
                    └── plugin-demo.yaml

12 directories, 11 files
```

然后可以根据我们自己的实际需求去开发对应的插件即可，开发完成后可以校验插件的有效性。

```shell
$ dtm develop validate-plugin --name plugin-demo
2022-07-02 12:13:05 ✔ [SUCCESS]  Plugin <plugin-demo> passed validation.
```

### 实践

接下来我们使用 `DevStream` 来实践下如何快速创建我们的 DevOps 工具链。

首先创建一个名为 `devstream-demo` 的目录：

```shell
mkdir devstream-demo && cd devstream-demo
```

然后在该目录下创建一个名为 `config.yaml` 的主配置文件，文件内容如下所示：

```yaml
# config.yaml
varFile: variables-gitops.yaml

toolFile: tools-gitops.yaml

state:
  backend: local
  options:
    stateFile: devstream.state
```

在该主配置文件中我们指定了 `varFile` 和 `toolFile` 两个配置文件，已经使用了本地存储状态信息。

同样在该目录下面创建对应的变量配置文件 `variables-gitops.yaml`，内容如下所示：

```yaml
# variables-gitops.yaml
githubUsername: cnych
repoName: dtm-test-go
defaultBranch: main

dockerhubUsername: cnych

argocdNamespace: argocd
argocdDeployTimeout: 5m
```

该配置文件中我们定义了一些后面工具中需要使用到的变量。

接下来创建工具配置文件 `tools-gitops.yaml`，文件内容如下所示：

```yaml
# tools-gitops.yaml
tools:
- name: github-repo-scaffolding-golang
  instanceID: default
  options:
    owner: [[ githubUsername ]]
    org: ""
    repo: [[ repoName ]]
    branch: [[ defaultBranch ]]
    image_repo: [[ dockerhubUsername ]]/[[ repoName ]]
- name: githubactions-golang
  instanceID: default
  dependsOn: ["github-repo-scaffolding-golang.default"]
  options:
    owner: ${{ github-repo-scaffolding-golang.default.outputs.owner }}
    org: ""
    repo: ${{ github-repo-scaffolding-golang.default.outputs.repo }}
    language:
      name: go
      version: "1.17"
    branch: [[ defaultBranch ]]
    build:
      enable: True
      command: "go build ./..."
    test:
      enable: True
      command: "go test ./..."
      coverage:
        enable: True
        profile: "-race -covermode=atomic"
        output: "coverage.out"
    docker:
      enable: True
      registry:
        type: dockerhub
        username: [[ dockerhubUsername ]]
        repository: ${{ github-repo-scaffolding-golang.default.outputs.repo }}
- name: argocd
  instanceID: default
  options:
    create_namespace: true
    repo:
      name: argo
      url: https://argoproj.github.io/argo-helm
    chart:
      chart_name: argo/argo-cd
      release_name: argocd
      namespace: [[ argocdNamespace ]]
      wait: true
      timeout: [[ argocdDeployTimeout ]]
      upgradeCRDs: true
- name: argocdapp
  instanceID: default
  dependsOn: ["argocd.default", "github-repo-scaffolding-golang.default"]
  options:
    app:
      name: ${{ github-repo-scaffolding-golang.default.outputs.repo }}
      namespace: [[ argocdNamespace ]]
    destination:
      server: https://kubernetes.default.svc
      namespace: default
    source:
      valuefile: values.yaml
      path: helm/${{ github-repo-scaffolding-golang.default.outputs.repo }}
      repoURL: ${{ github-repo-scaffolding-golang.default.outputs.repoURL }}
```

上面的配置文件中我们定义了 4 个工具，每个工具的 `name+instanceID` 需要唯一。

其中第一个工具为 [github-repo-scaffolding-golang](https://docs.devstream.io/en/latest/plugins/github-repo-scaffolding-golang/) ，该插件使用一个 Golang Web 应用程序的脚手架代码去创建一个 GitHub 代码仓库，使用该插件之前需要配置一个名为 `GITHUB_TOKEN` 的环境变量，可以前往 <https://github.com/settings/tokens> 创建一个 `Personal access tokens`，记得要有 repo 和 GitHub Actions 相关权限。

第二个工具插件为 [githubactions-golang](https://docs.devstream.io/en/latest/plugins/githubactions-golang/) ，这个插件会创建一些 Golang GitHub Actions 的工作流，同样该插件依赖 `GITHUB_TOKEN` 这个环境变量，如果启用了 Docker 镜像构建/推送，则还需要设置另外两个环境变量：`DOCKERHUB_USERNAME` 与 `DOCKERHUB_TOKEN`，Docker 的 Token 信息可以访问页面 <https://hub.docker.com/settings/security?generateToken=true> 去创建获取。

![](https://picdn.youdianzhishi.com/images/1656738623638.png)

第三个插件是 [argocd](https://docs.devstream.io/en/latest/plugins/argocd/) ，该插件会使用 Helm chart 的方式在现有 Kubernetes 集群中安装 ArgoCD。

第四个插件是 [argocdapp](https://docs.devstream.io/en/latest/plugins/argocdapp/) ，此插件会创建一个 ArgoCD Application 的自定义资源。需要注意使用该插件之前必须要保证 ArgoCD 已经安装。

配置定义完之后，我们只需要在根目录下面执行 `dtm init`，该命令就会下载所有定义的相关插件，如果你使用的是 `s3` 来存储状态信息，则当再次执行该命令的时候会先从远程下载对应的状态信息。

```shell
$ dtm init
2022-07-02 12:36:03 ℹ [INFO]  Got Backend from config: local
2022-07-02 12:36:03 ℹ [INFO]  Using dir <.devstream> to store plugins.
2022-07-02 12:36:05 ℹ [INFO]  Downloading: [github-repo-scaffolding-golang-darwin-arm64_0.7.0.so] ...
 15.05 MiB / 15.05 MiB [=================================] 100.00% 3.30 MiB/s 4s
2022-07-02 12:36:10 ✔ [SUCCESS]  [github-repo-scaffolding-golang-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:36:11 ℹ [INFO]  Downloading: [github-repo-scaffolding-golang-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [===============================================] 100.00% 49 B/s 0s
2022-07-02 12:36:11 ✔ [SUCCESS]  [github-repo-scaffolding-golang-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:36:11 ℹ [INFO]  Plugin: github-repo-scaffolding-golang-darwin-arm64_0.7.0.so doesn't match with .md5 and will be downloaded.
2022-07-02 12:36:12 ℹ [INFO]  Downloading: [github-repo-scaffolding-golang-darwin-arm64_0.7.0.so] ...
 15.05 MiB / 15.05 MiB [=================================] 100.00% 4.71 MiB/s 3s
2022-07-02 12:36:15 ✔ [SUCCESS]  [github-repo-scaffolding-golang-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:36:15 ℹ [INFO]  Downloading: [github-repo-scaffolding-golang-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 133.44 KiB/s 0s
2022-07-02 12:36:15 ✔ [SUCCESS]  [github-repo-scaffolding-golang-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:36:16 ℹ [INFO]  Downloading: [githubactions-golang-darwin-arm64_0.7.0.so] ...
 17.49 MiB / 17.49 MiB [=================================] 100.00% 4.05 MiB/s 4s
2022-07-02 12:36:20 ✔ [SUCCESS]  [githubactions-golang-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:36:21 ℹ [INFO]  Downloading: [githubactions-golang-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 206.08 KiB/s 0s
2022-07-02 12:36:21 ✔ [SUCCESS]  [githubactions-golang-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:36:21 ℹ [INFO]  Plugin: githubactions-golang-darwin-arm64_0.7.0.so doesn't match with .md5 and will be downloaded.
2022-07-02 12:36:22 ℹ [INFO]  Downloading: [githubactions-golang-darwin-arm64_0.7.0.so] ...
 17.49 MiB / 17.49 MiB [=================================] 100.00% 4.50 MiB/s 3s
2022-07-02 12:36:25 ✔ [SUCCESS]  [githubactions-golang-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:36:26 ℹ [INFO]  Downloading: [githubactions-golang-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 104.90 KiB/s 0s
2022-07-02 12:36:26 ✔ [SUCCESS]  [githubactions-golang-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:36:27 ℹ [INFO]  Downloading: [argocd-darwin-arm64_0.7.0.so] ...
 78.22 MiB / 78.22 MiB [================================] 100.00% 1.99 MiB/s 39s
2022-07-02 12:37:06 ✔ [SUCCESS]  [argocd-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:37:07 ℹ [INFO]  Downloading: [argocd-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 186.01 KiB/s 0s
2022-07-02 12:37:07 ✔ [SUCCESS]  [argocd-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:37:07 ℹ [INFO]  Plugin: argocd-darwin-arm64_0.7.0.so doesn't match with .md5 and will be downloaded.
2022-07-02 12:37:08 ℹ [INFO]  Downloading: [argocd-darwin-arm64_0.7.0.so] ...
 78.22 MiB / 78.22 MiB [================================] 100.00% 2.53 MiB/s 30s
2022-07-02 12:37:39 ✔ [SUCCESS]  [argocd-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:37:40 ℹ [INFO]  Downloading: [argocd-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 136.46 KiB/s 0s
2022-07-02 12:37:40 ✔ [SUCCESS]  [argocd-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:37:41 ℹ [INFO]  Downloading: [argocdapp-darwin-arm64_0.7.0.so] ...
 68.19 MiB / 68.19 MiB [================================] 100.00% 2.41 MiB/s 28s
2022-07-02 12:38:09 ✔ [SUCCESS]  [argocdapp-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:38:10 ℹ [INFO]  Downloading: [argocdapp-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 256.96 KiB/s 0s
2022-07-02 12:38:10 ✔ [SUCCESS]  [argocdapp-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:38:10 ℹ [INFO]  Plugin: argocdapp-darwin-arm64_0.7.0.so doesn't match with .md5 and will be downloaded.
2022-07-02 12:38:10 ℹ [INFO]  Downloading: [argocdapp-darwin-arm64_0.7.0.so] ...
 68.19 MiB / 68.19 MiB [================================] 100.00% 1.39 MiB/s 48s
2022-07-02 12:38:59 ✔ [SUCCESS]  [argocdapp-darwin-arm64_0.7.0.so] download succeeded.
2022-07-02 12:39:01 ℹ [INFO]  Downloading: [argocdapp-darwin-arm64_0.7.0.md5] ...
 33 B / 33 B [=========================================] 100.00% 120.98 KiB/s 0s
2022-07-02 12:39:01 ✔ [SUCCESS]  [argocdapp-darwin-arm64_0.7.0.md5] download succeeded.
2022-07-02 12:39:01 ✔ [SUCCESS]  Initialize finished.
```

当我们再次执行 `dtm init` 命令的时候可以看到没有任何相关操作，这是因为前面我们已经将相关的插件全部下载到了本地。

```shell
$ dtm init
2022-07-02 12:39:42 ℹ [INFO]  Got Backend from config: local
2022-07-02 12:39:42 ℹ [INFO]  Using dir <.devstream> to store plugins.
2022-07-02 12:39:42 ℹ [INFO]  Plugin: github-repo-scaffolding-golang-darwin-arm64_0.7.0.so already exists, no need to download.
2022-07-02 12:39:42 ℹ [INFO]  Plugin: githubactions-golang-darwin-arm64_0.7.0.so already exists, no need to download.
2022-07-02 12:39:43 ℹ [INFO]  Plugin: argocd-darwin-arm64_0.7.0.so already exists, no need to download.
2022-07-02 12:39:43 ℹ [INFO]  Plugin: argocdapp-darwin-arm64_0.7.0.so already exists, no need to download.
2022-07-02 12:39:43 ✔ [SUCCESS]  Initialize finished.
```

初始化完成后会在当前目录下面创建一个 `.devstream` 的目录，该目录下面就是保存下载下来的插件相关文件。

<!--adsense-text-->

接下来我们只需要在根目录下面执行 `dtm apply` 命令即可根据我们的配置文件创建或更新 DevOps 工具链了。

首先要记得配置需要的环境变量，比如我们这里上面的定义几个插件需要配置下面的 3 个环境变量：

```shell
export GITHUB_TOKEN=xxx
export DOCKERHUB_USERNAME=cnych
export DOCKERHUB_TOKEN=xxx
```

另外还需要一个在本地可访问的 Kubernetes 集群。

配置完成后直接执行 `dtm apply` 命令即可：

```shell
$ dtm apply
2022-07-02 13:17:15 ℹ [INFO]  Apply started.
2022-07-02 13:17:15 ℹ [INFO]  Got Backend from config: local
2022-07-02 13:17:15 ℹ [INFO]  Using dir <.devstream> to store plugins.
2022-07-02 13:17:15 ℹ [INFO]  Using local backend. State file: devstream.state.
2022-07-02 13:17:17 ℹ [INFO]  Tool (argocd/default) found in config but doesn't exist in the state, will be created.
2022-07-02 13:17:17 ℹ [INFO]  Tool (argocdapp/default) found in config but doesn't exist in the state, will be created.
Continue? [y/n]
Enter a value (Default is n): y

2022-07-02 12:54:38 ℹ [INFO]  Start executing the plan.
2022-07-02 12:54:38 ℹ [INFO]  Changes count: 4.
2022-07-02 12:54:38 ℹ [INFO]  -------------------- [  Processing progress: 1/4.  ] --------------------
2022-07-02 12:54:38 ℹ [INFO]  Processing: (github-repo-scaffolding-golang/default) -> Create ...
2022-07-02 12:54:43 ℹ [INFO]  The repo dtm-test-go has been created.
2022-07-02 12:54:55 ✔ [SUCCESS]  Tool (github-repo-scaffolding-golang/default) Create done.
2022-07-02 12:54:55 ℹ [INFO]  -------------------- [  Processing progress: 3/4.  ] -
2022-07-02 13:17:19 ℹ [INFO]  Processing: (argocd/default) -> Create ...
2022-07-02 13:17:28 ℹ [INFO]  Creating or updating helm chart ...
2022/07/02 13:17:33 creating 1 resource(s)
2022/07/02 13:17:33 creating 1 resource(s)
2022/07/02 13:17:33 creating 1 resource(s)
2022/07/02 13:17:33 creating 1 resource(s)
2022/07/02 13:17:33 Clearing discovery cache
2022/07/02 13:17:33 beginning wait for 4 resources with timeout of 1m0s
2022/07/02 13:17:39 creating 43 resource(s)
2022/07/02 13:17:39 beginning wait for 43 resources with timeout of 5m0s
2022/07/02 13:17:40 Deployment is not ready: argocd/argocd-applicationset-controller. 0 out of 1 expected pods are ready
2022/07/02 13:17:42 Deployment is not ready: argocd/argocd-applicationset-controller. 0 out of 1 expected pods are ready
......
2022/07/02 13:19:44 Deployment is not ready: argocd/argocd-applicationset-controller. 0 out of 1 expected pods are ready
2022/07/02 13:38:27 Deployment is not ready: argocd/argocd-dex-server. 0 out of 1 expected pods are ready
2022/07/02 13:38:30 release installed successfully: argocd/argo-cd-4.9.11
2022-07-02 13:38:30 ✔ [SUCCESS]  Tool (argocd/default) Create done.
2022-07-02 13:38:30 ℹ [INFO]  -------------------- [  Processing progress: 4/4.  ] --------------------
2022-07-02 13:38:30 ℹ [INFO]  Processing: (argocdapp/default) -> Create ...
2022-07-02 13:38:31 ℹ [INFO]  application.argoproj.io/dtm-test-go created
2022-07-02 13:38:31 ✔ [SUCCESS]  Tool (argocdapp/default) Create done.
2022-07-02 13:38:31 ℹ [INFO]  -------------------- [  Processing done.  ] --------------------
2022-07-02 13:38:31 ✔ [SUCCESS]  All plugins applied successfully.
2022-07-02 13:38:31 ✔ [SUCCESS]  Apply finished.
```

在 `apply` 的过程中会将执行的状态保存在定义的状态后端存储中，比如我们这里使用的是本地存储，则会在根目录的 `devstream.state` 文件中保存执行的状态，比如我们这里一共 4 个工具链，如果前两个执行完成，后面两个执行识别了，则会在该文件中保存前两个插件的状态，下一次重新 apply 的时候则只需要执行后面两个工具链即可。

![](https://picdn.youdianzhishi.com/images/1656740036542.png)

我们上面定义的工具链最终会为我们在 GitHub 上创建一个 Golang Web 的脚手架应用代码仓库。
![](https://picdn.youdianzhishi.com/images/1656740453666.jpg)

会使用 Github Actions 来进行 CI 操作，构建 Docker 镜像。
![](https://picdn.youdianzhishi.com/images/1656740502749.jpg)

CI 流程最后会推送镜像到 Docker Hub。
![](https://picdn.youdianzhishi.com/images/1656740570211.jpg)

然后会在 Kubernetes 中部署 ArgoCD。

```shell
$ kubectl get pods -n argocd
NAME                                                READY   STATUS    RESTARTS   AGE
argocd-application-controller-0                     1/1     Running   0          5m55s
argocd-applicationset-controller-64d8c477f4-2wrg6   1/1     Running   0          5m55s
argocd-dex-server-dbdbf5499-krmfz                   1/1     Running   0          5m35s
argocd-notifications-controller-b67c4bdb4-22t9l     1/1     Running   0          5m55s
argocd-redis-df9db799b-8gbpv                        1/1     Running   0          5m55s
argocd-repo-server-56769cdd47-zs65j                 1/1     Running   0          5m55s
argocd-server-7d4745f689-w5pp7                      1/1     Running   0          5m55s
```

最后会通过 ArgoCD 来进行 CD 操作，将我们的示例应用部署到 Kubernetes 集群中去，其实就是创建了一个 ArgoCD 的 Application 对象。

```shell
$ kubectl get applications -n argocd
NAME          SYNC STATUS   HEALTH STATUS
dtm-test-go   Unknown       Healthy
```

我们也可以通过 ArgoCD 查看部署的应用详情。
![](https://picdn.youdianzhishi.com/images/1656741508757.jpg)

最后如果想要删除整个工具链则只需要执行 `dtm delete` 命令即可。

整个流程体验非常顺畅（除了因为某些原因访问 GitHub 超级慢之外），我们只需要根据需要在配置文件中定义对应的插件即可，关于插件的具体配置方式可以参考官方文档 <https://docs.devstream.io/en/latest/plugins/plugins-list/> 了解更多相关信息。

只需要在一个  `YAML`  配置文件中定义你所需要的 DevOps 工具，只需按一个命令就能建立起整个 DevOps 工具链和 SDLC 工作流了，所以说 `DevStream` 是神器完全不为过。

<!--adsense-self-->
