---
title: 使用 Kustomize 定制 Helm Charts
date: 2020-09-23
tags: ["kubernetes", "Kustomize", "Helm"]
keywords: ["Kustomize", "kubernetes", "Helm"]
slug: use-kustomize-custom-helm-charts
gitcomment: true
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200923163428.png", desc: "https://unsplash.com/photos/nk4OAb64-Rk"}]
category: "kubernetes"
---
如果你经常使用 Kubernetes，那么应该对 Helm 和 Kustomize 不陌生，这两个工具都是用来管理 Kubernetes 的资源清单的，但是二者有着不同的工作方式。

Helm 使用的是模板，一个 Helm Chart 包中包含了很多模板和值文件，当被渲染时模板中的变量会使用值文件中对应的值替换。而 Kustomize 使用的是一种无模板的方式，它对 YAML 文件进行修补和合并操作，此外 Kustomize 也已经被原生内置到 kubectl 中了。这两个工具在 Kubernetes 的生态系统中都被广泛使用，而且这两个工具也可以一起结合使用。

<!--more-->

## 是否要 fork

我们知道很多项目其实都会为应用程序提供 Helm Chart 包，而模板变量的值通过值文件来控制。一个长期存在的问题就是我们应该如何定制上游的 Helm Chart 包，例如从 Helm Chart 包中添加或者一个 Kubernetes 资源清单，如果是通用的变更，最好的选择当然是直接贡献给上游仓库，但是如果是自定义的变更呢？

通常我们可以自己 fork 上游的 Helm Chart 仓库，然后在自己的 repo 中对 Chart 包进行额外的变动。但是这样做，显然会带来额外的负担，特别是当 Chart 包只需要一点小改动的时候。

这个时候我们可以使用 Kustomize 来定制现有的 Helm Chart，而不需要执行 fork 操作。

> 本文使用的 Helm 版本为 3.3.1、Kustomize 3.8.2。

## 使用 Chart 插件自定义

Kustomize 提供了一个很好的插件生态系统，允许扩展 Kustomize 的功能。其中就有一个名为 [ChartInflator](https://github.com/kubernetes-sigs/kustomize/blob/v3.3.1/plugin/someteam.example.com/v1/chartinflator/ChartInflator) 的非内置插件，它允许 Kustomize 来渲染 Helm Charts，并执行任何需要的变更。

首先先安装 `ChartInflator` 插件：

```bash
$ chartinflator_dir="./kustomize/plugin/kustomize.config.k8s.io/v1/chartinflator"

# 创建插件目录
$ mkdir -p ${chartinflator_dir}

# 下载插件
$ curl -L https://raw.githubusercontent.com/kubernetes-sigs/kustomize/kustomize/v3.8.2/plugin/someteam.example.com/v1/chartinflator/ChartInflator > ${chartinflator_dir}/ChartInflator

# 设置插件执行权限
$ chmod u+x ${chartinflator_dir}/ChartInflator
```

比如我们要定制 [Vault Helm Chart](https://github.com/hashicorp/vault-helm) 包，接下来创建 ChartInflator 资源清单和 Helm 的 values.yaml 值文件：

```bash
# ChartInflator 资源清单
$ cat << EOF >> chartinflator-vault.yaml
apiVersion: kustomize.config.k8s.io/v1
kind: ChartInflator
metadata:
  name: vault-official-helm-chart
chartRepo: https://helm.releases.hashicorp.com  
chartName: vault
chartRelease: hashicorp
chartVersion: 0.7.0
releaseName: vault
values: values.yaml
EOF

# 创建 values 值文件
$ helm repo add hashicorp https://helm.releases.hashicorp.com 
$ helm show values --version 0.7.0 hashicorp/vault > values.yaml

# 创建 Kustomize 文件
$ kustomize init
$ cat << EOF >> kustomization.yaml
generators:
- chartinflator-vault.yaml
EOF

# 为所有资源添加一个 label 标签
$ kustomize edit add label env:dev

# 最后生成的 kustomize 文件如下所示：
$ cat kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
generators:
- chartinflator-vault.yaml
commonLabels:
  env: dev

# 整个资源清单目录结构
$ tree .
.
├── chartinflator-vault.yaml
├── kustomization.yaml
├── kustomize
│   └── plugin
│       └── kustomize.config.k8s.io
│           └── v1
│               └── chartinflator
│                   └── ChartInflator
└── values.yaml

5 directories, 4 files
```

现在就可以来渲染 Chart 模板了，执行如下所示的命令即可：

```bash
$ kustomize build --enable_alpha_plugins .
```

正常渲染完成后我们可以看到所有的资源上都被添加了一个 `env: dev` 的标签，这是实时完成的，不需要维护任何额外的文件的。
<!--adsense-text-->
## 用单一的 Chart 文件定制

另一种使用 Kustomize 定制 Chart 的方法是使用 `helm template` 命令来生成一个单一的资源清单，这种方式可以对 Chart 进行更多的控制，但它需要更多的工作来出来处理更新该生成文件的版本控制。

通常我们可以使用 Make 来进行辅助处理，如下示例所示：

```bash
# Makefile
CHART_REPO_NAME   := hashicorp
CHART_REPO_URL    := https://helm.releases.hashicorp.com
CHART_NAME        := vault
CHART_VERSION     := 0.7.0
CHART_VALUES_FILE := values.yaml

add-chart-repo:
    helm repo add ${CHART_REPO_NAME} ${CHART_REPO_URL}
    helm repo update

generate-chart-manifest:
    helm template ${CHART_NAME} ${CHART_REPO_NAME}/${CHART_NAME} \
        --version ${CHART_VERSION} \
        --values ${CHART_VALUES_FILE} > ${CHART_NAME}.yaml

get-chart-values:
    @helm show values --version ${CHART_VERSION} \
    ${CHART_REPO_NAME}/${CHART_NAME}

generate-chart-values:
    @echo "Create values file: ${CHART_VALUES_FILE}"
    @$(MAKE) -s get-chart-values > ${CHART_VALUES_FILE}

diff-chart-values:
    @echo "Diff: Local <==> Remote"
    @$(MAKE) -s get-chart-values | \
    diff --suppress-common-lines --side-by-side ${CHART_VALUES_FILE} - || \
    exit 0
```

要定制上游的 Vault Helm Chart，我们可以做如下操作：

```bash
# 初始化 chart 文件
$ make generate-chart-values generate-chart-manifest 

# 创建 Kustomize 文件并添加一个 label 标签
$ kustomize init
$ kustomize edit add resource vault.yaml
$ kustomize edit add label env:dev

# 最后生成的文件结构如下所示
$ tree .
.
├── kustomization.yaml
├── makefile
├── values.yaml
└── vault.yaml

0 directories, 4 files

# kustomize 文件内容如下所示
$ cat kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- vault.yaml
commonLabels:
  env: dev
```

最后同样用 `kustomize build` 命令来渲染：

```bash
$ kustomize build .
```

在渲染的结果中同样可以看到所有的资源里面都被添加进了一个 `env: dev` 的标签。

这种方法，需要以某种方式运行 make 命令来生成更新的一体化资源清单文件，另外，要将更新过程与你的 GitOps 工作流整合起来可能有点麻烦。

## 使用 Helm post rendering 定制

[Post Rendering](https://helm.sh/docs/topics/advanced/#post-rendering) 是 Helm 3 带来的新功能之一，在前面的2种方法中，Kustomize 是用来处理生成图表清单的主要工具，但在这里，Kustomize 是作为 Helm 的助手进行工作的。

下面我们来看下如何使用这种方法来进行定制：

```bash
# 创建 Kustomize 文件并添加一个 label 标签
$ kustomize init
$ kustomize edit add label env:dev

# 创建一个包装 Kustomize 的脚本文件，后面在 Helm 中会使用到
$ cat << EOF > kustomize-wrapper.sh
#!/bin/bash
cat <&0 > chart.yaml
kustomize edit add resource chart.yaml
kustomize build . && rm chart.yaml
EOF
$ chmod +x kustomize-wrapper.sh
```

然后我们可以直接使用 Helm 渲染或者安装 Chart：

```bash
$ helm repo add hashicorp https://helm.releases.hashicorp.com 
$ helm template vault hashicorp/vault --post-renderer ./kustomize-wrapper.sh
```

正常情况下我们也可以看到最后渲染出来的每一个资源文件中都被添加进了一个 `env:dev` 的标签。

这种方法就是需要管理一个额外的脚本，其余的和第一种方式基本上差不多，只是不使用 Kustomize 的插件，而是直接使用 Helm 本身的功能来渲染上游的 Chart 包。

## 总结

我们可以看到上面几种方法都各有优缺点，使用哪种方式主要还是取决于我们自己的工作环境和工作流程，不过至少我们已经看到了 Kustomize 与 Helm 结合使用的高效了。

<!--adsense-self-->
