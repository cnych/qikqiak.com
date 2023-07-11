---
title: Helm Chart 兼容不同 Kubernetes 版本
date: 2021-11-10
tags: ["kubernetes", "helm", "chart"]
slug: helm-chart-compatible-different-kube-version
keywords: ["kubernetes", "helm", "chart", "template", "兼容"]
gitcomment: true
notoc: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20211110192940.png",
      desc: "图片来源 -> https://unsplash.com/photos/sf99zPcy8dQ",
    },
  ]
category: "kubernetes"
---

随着 Kubernetes 的版本不断迭代发布，很多 Helm Chart 包压根跟不上更新的进度，导致在使用较新版本的 Kubernetes 的时候很多 Helm Chart 包不兼容，所以我们在开发 Helm Chart 包的时候有必要考虑到对不同版本的 Kubernetes 进行兼容。

<!--more-->

要实现对不同版本的兼容核心就是利用 Helm Chart 模板提供的内置对象 `Capabilities`，该对象提供了关于 Kubernetes 集群支持功能的信息，包括如下特性：

- `Capabilities.APIVersions` 获取集群版本集合
- `Capabilities.APIVersions.Has $version` 判断集群中的某个版本 (e.g., batch/v1) 或是资源 (e.g., apps/v1/Deployment) 是否可用
- `Capabilities.KubeVersion` 和 `Capabilities.KubeVersion.Version` 可以获取 Kubernetes 版本号
- `Capabilities.KubeVersion.Major` 获取 Kubernetes 的主版本
- `Capabilities.KubeVersion.Minor` 获取 Kubernetes 的次版本
- `Capabilities.HelmVersion` 包含 Helm 版本详细信息的对象，和 `helm version` 的输出一致
- `Capabilities.HelmVersion.Version` 是当前 Helm 版本的语义格式
- `Capabilities.HelmVersion.GitCommit` Helm 的 `git sha1` 值
- `Capabilities.HelmVersion.GitTreeState` 是 Helm git 树的状态
- `Capabilities.HelmVersion.GoVersion` 使用的 Go 编译器版本

利用上面的几个对象我们可以判断资源对象需要使用的 API 版本或者属性，下面我们以 Ingress 资源对象为例进行说明。

Kubernetes 在 1.19 版本为 Ingress 资源引入了一个新的 API：`networking.k8s.io/v1`，这与之前的 `networking.k8s.io/v1beta1` beta 版本使用方式基本一致，但是和前面的 `extensions/v1beta1` 这个版本在使用上有很大的不同，资源对象的属性上有一定的区别，所以要兼容不同的版本，我们就需要对模板中的 Ingress 对象做兼容处理。

新版本的资源对象格式如下所示：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minimal-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - http:
        paths:
          - path: /testpath
            pathType: Prefix
            backend:
              service:
                name: test
                port:
                  number: 80
```

而旧版本的资源对象格式如下：

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: minimal-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
    - http:
        paths:
          - path: /testpath
            backend:
              serviceName: test
              servicePort: 80
```

具体使用哪种格式的资源对象需要依赖我们的集群版本，首先我们在 Chart 包的 `_helpers.tpl` 文件中添加几个用于判断集群版本或 API 的命名模板：

```go
{{/* Allow KubeVersion to be overridden. */}}
{{- define "ydzs.kubeVersion" -}}
  {{- default .Capabilities.KubeVersion.Version .Values.kubeVersionOverride -}}
{{- end -

{{/* Get Ingress API Version */}}
{{- define "ydzs.ingress.apiVersion" -}}
  {{- if and (.Capabilities.APIVersions.Has "networking.k8s.io/v1") (semverCompare ">= 1.19-0" (include "ydzs.kubeVersion" .)) -}}
      {{- print "networking.k8s.io/v1" -}}
  {{- else if .Capabilities.APIVersions.Has "networking.k8s.io/v1beta1" -}}
    {{- print "networking.k8s.io/v1beta1" -}}
  {{- else -}}
    {{- print "extensions/v1beta1" -}}
  {{- end -}}
{{- end -}}

{{/* Check Ingress stability */}}
{{- define "ydzs.ingress.isStable" -}}
  {{- eq (include "ydzs.ingress.apiVersion" .) "networking.k8s.io/v1" -}}
{{- end -}}

{{/* Check Ingress supports pathType */}}
{{/* pathType was added to networking.k8s.io/v1beta1 in Kubernetes 1.18 */}}
{{- define "ydzs.ingress.supportsPathType" -}}
  {{- or (eq (include "ydzs.ingress.isStable" .) "true") (and (eq (include "ydzs.ingress.apiVersion" .) "networking.k8s.io/v1beta1") (semverCompare ">= 1.18-0" (include "ydzs.kubeVersion" .))) -}}
{{- end -}}
```

上面我们通过 `.Capabilities.APIVersions.Has` 来判断我们应该使用的 APIVersion，如果版本为 `networking.k8s.io/v1`，则定义为 `isStable`，此外还根据版本来判断是否需要支持 `pathType` 属性，然后在 Ingress 对象模板中就可以使用上面定义的命名模板来决定应该使用哪些属性，如下 `ingress.yaml` 文件所示：

```yaml
{{- $apiIsStable := eq (include "ydzs.ingress.isStable" .) "true" -}}
{{- $ingressSupportsPathType := eq (include "ydzs.ingress.supportsPathType" .) "true" -}}
{{- $ingressClass := index .Values "ingress-nginx" "controller" "ingressClass" }}
apiVersion: {{ include "ydzs.ingress.apiVersion" . }}
kind: Ingress
metadata:
  name: portal-ingress
  annotations:
    {{- if $ingressClass }}
    kubernetes.io/ingress.class: {{ $ingressClass }}
    {{- end }}
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/ssl-redirect: "false"
  labels:
    {{- include "ydzs.labels" . | nindent 4 }}
spec:
  rules:
  {{- if eq .Values.endpoint.type "FQDN" }}
  - host: {{ required ".Values.endpoint.FQDN is required for FQDN" .Values.endpoint.FQDN }}
    http:
  {{- else }}
  - http:
  {{- end }}
      paths:
      - path: /
        {{- if $ingressSupportsPathType }}
        pathType: Prefix
        {{- end }}
        backend:
          {{- if $apiIsStable }}
          service:
            name: portal
            port:
              number: 80
          {{- else }}
          serviceName: portal
          servicePort: 80
          {{- end }}
```

在 Ingress 模板中使用命名模板中的变量来判断应该使用哪些属性，这样我们定义的这个 Chart 模板就可以兼容 Kubernetes 的不同版本了，如果还有其他版本之间的差异，我们也可以分别判断进行定义即可，对于其他的资源对象，比如 Deployment 也可以用同样的方式进行兼容。
