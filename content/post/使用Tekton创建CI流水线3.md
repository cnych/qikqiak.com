---
title: 使用 Tekton 创建 CI/CD 流水线（3/4）
subtitle: Tekton Trigger 的使用
date: 2020-05-29
tags: ["kubernetes", "tekton"]
slug: create-ci-pipeline-with-tekton-3
keywords: ["kubernetes", "tekton", "github", "git", "gitlab", "流水线"]
gitcomment: true
notoc: true
bigimg:
  [
    {
      src: "https://picdn.youdianzhishi.com/images/20200529181158.png",
      desc: "https://unsplash.com/photos/aV31XuctrM8",
    },
  ]
category: "kubernetes"
---

前面我们都是通过手动创建一个 `TaskRun` 或者一个 `PipelineRun` 对象来触发任务。但是在实际的工作中更多的是开发人员提交代码过后来触发任务，这个时候就需要用到 Tekton 里面的 Triggers 了。

Triggers 同样通过下面的几个 CRD 对象对 Tekton 进行了一些扩展：

- TriggerTemplate: 创建资源的模板，比如用来创建 PipelineResource 和 PipelineRun
- TriggerBinding: 校验事件并提取相关字段属性
- ClusterTriggerBinding: 和 TriggerBinding 类似，只是是全局的
- EventListener: 连接 TriggerBinding 和 TriggerTemplate 到事件接收器，使用从各个 TriggerBinding 中提取的参数来创建 TriggerTemplate 中指定的 resources，同样通过 `interceptor` 字段来指定外部服务对事件属性进行预处理

<!--more-->

![Tekton Triggers](https://picdn.youdianzhishi.com/images/20200527093100.png)

同样要使用 Tekton Triggers 就需要安装对应的控制器，可以直接通过 [tektoncd/triggers](https://github.com/tektoncd/triggers) 的 GitHub 仓库说明进行安装，如下所示的命令：

```shell
$ kubectl apply --filename https://storage.googleapis.com/tekton-releases/triggers/latest/release.yaml
```

同样由于官方使用的镜像是 `gcr` 的镜像，所以正常情况下我们是获取不到的，如果你的集群由于某些原因获取不到镜像，可以使用下面的资源清单文件，我已经将镜像替换成了 Docker Hub 上面的镜像：

```shell
$ kubectl apply -f https://www.qikqiak.com/k8strain/devops/manifests/tekton/trigger.yaml
```

可以使用如下命令查看 Triggers 的相关组件安装状态，直到都为 `Running` 状态：

```shell
$ kubectl get pods --namespace tekton-pipelines
NAME                                           READY   STATUS    RESTARTS   AGE
tekton-dashboard-69656879d9-7bbkl              1/1     Running   0          2d6h
tekton-pipelines-controller-67f4dc98d8-pgxrq   1/1     Running   0          22d
tekton-pipelines-webhook-59df55445c-jw76v      1/1     Running   0          22d
tekton-triggers-controller-779fc9f557-vj6xs    1/1     Running   0          17m
tekton-triggers-webhook-c77f8dbd6-ctmlm        1/1     Running   0          17m
```

现在我们来将前面的 Jenkins Pipeline 流水线转换成使用 Tekton 来构建，代码我们已经推送到了私有仓库 GitLab，地址为：`http://git.k8s.local/course/devops-demo.git`。

首先我们需要完成触发器的配置，当我们提交源代码到 GitLab 的时候，需要触发 Tekton 的任务运行。所以首先需要完成这个触发器。这里就可以通过 `EventListener` 这个资源对象来完成，创建一个名为 `gitlab-listener` 的 EventListener 资源对象，文件内容如下所示：(gitlab-push-listener.yaml)

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: EventListener
metadata:
  name: gitlab-listener
spec:
  serviceAccountName: tekton-triggers-gitlab-sa
  triggers:
    - name: gitlab-push-events-trigger
      interceptors:
        - gitlab:
            secretRef: # 引用 gitlab-secret 的 Secret 对象中的 secretToken 的值
              secretName: gitlab-secret
              secretKey: secretToken
            eventTypes:
              - Push Hook # 只接收 GitLab Push 事件
      bindings:
        - name: gitlab-push-binding # TriggerBinding 对象
      template:
        name: gitlab-echo-template # TriggerTemplate 对象
---
apiVersion: traefik.containo.us/v1alpha1
kind: IngressRoute
metadata:
  name: el-gitlab-listener
spec:
  routes:
    - match: Host(`tekton-trigger.k8s.local`)
      kind: Rule
      services:
        - name: el-gitlab-listener # 关联 EventListener 服务
          port: 8080
```

由于 `EventListener` 创建完成后会生成一个 Listener 的服务，用来对外暴露用于接收事件响应，比如上面我们创建的对象名为 `gitlab-listener`，创建完成后会生成一个名为 `el-gitlab-listener` 的 Service 对象，这里我们通过 IngressRoute 对象来暴露该服务，当然直接修改 Service 为 NodePort 类型也可以，如果 GitLab 也在集群内部，当然我们用 Service 的 DNS 形式来访问 `EventListener` 当然也可以。

另外需要注意的是在上面的 `EventListener` 对象中我们添加了 `interceptors` 属性，其中有一个内置的 `gitlab` 属性可以用来配置 GitLab 相关的信息，比如配置 WebHook 的 `Secret Token`，可以通过 Secret 对象引入进来：

```yaml
interceptors:
  - gitlab:
      secretRef: # 引用 gitlab-secret 的 Secret 对象中的 secretToken 的值
        secretName: gitlab-secret
        secretKey: secretToken
      eventTypes:
        - Push Hook # 只接收 GitLab Push 事件
```

对应的 Secret 资源对象如下所示，一个用于 WebHook 的 `Secret Token`，另外一个是用于 GitLab 登录认证使用的：(secret.yaml)

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gitlab-secret
type: Opaque
stringData:
  secretToken: "1234567"
---
apiVersion: v1
kind: Secret
metadata:
  name: gitlab-auth
  annotations:
    tekton.dev/git-0: http://git.k8s.local
type: kubernetes.io/basic-auth
stringData:
  username: myusername
  password: mypassword
```

由于 `EventListener` 对象需要访问其他资源对象，所以需要声明 RBAC，如下所示：（rbac.yaml）

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: tekton-triggers-gitlab-sa
secrets:
  - name: gitlab-secret
  - name: gitlab-auth
---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: tekton-triggers-gitlab-minimal
rules:
  # Permissions for every EventListener deployment to function
  - apiGroups: ["triggers.tekton.dev"]
    resources: ["eventlisteners", "triggerbindings", "triggertemplates"]
    verbs: ["get"]
  - apiGroups: [""]
    # secrets are only needed for Github/Gitlab interceptors, serviceaccounts only for per trigger authorization
    resources: ["configmaps", "secrets", "serviceaccounts"]
    verbs: ["get", "list", "watch"]
  # Permissions to create resources in associated TriggerTemplates
  - apiGroups: ["tekton.dev"]
    resources: ["pipelineruns", "pipelineresources", "taskruns"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: tekton-triggers-gitlab-binding
subjects:
  - kind: ServiceAccount
    name: tekton-triggers-gitlab-sa
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: tekton-triggers-gitlab-minimal
```

然后接下来就是最重要的 `TriggerBinding` 和 `TriggerTemplate` 对象了，我们在上面的 `EventListener` 对象中将两个对象组合在一起：

```yaml
bindings:
  - name: gitlab-push-binding # TriggerBinding 对象
template:
  name: gitlab-echo-template # TriggerTemplate 对象
```

这样就可以将 `TriggerBinding` 中的参数传递到 `TriggerTemplate` 对象中进行模板化。比如这里我们定义一个如下所示的 `TriggerBinding` 对象：

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerBinding
metadata:
  name: gitlab-push-binding
spec:
  params:
    - name: gitrevision
      value: $(body.checkout_sha)
    - name: gitrepositoryurl
      value: $(body.repository.git_http_url)
```

这里需要注意的是参数的值我们是通过读取 GitLab WebHook 发送过来的数据值，通过 `$()` 包裹的 JSONPath 表达式来提取的，关于表达式的更多用法可以查看[官方文档说明](https://github.com/tektoncd/triggers/blob/master/docs/triggerbindings.md#event-variable-interpolation)，至于能够提取哪些参数值，则可以查看 WebHook 的说明，比如这里我们是 GitLab Webhook 的 Push Hook，对应的请求体数据如下所示：

```json
{
  "object_kind": "push",
  "before": "95790bf891e76fee5e1747ab589903a6a1f80f22",
  "after": "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
  "ref": "refs/heads/master",
  "checkout_sha": "da1560886d4f094c3e6c9ef40349f7d38b5d27d7",
  "user_id": 4,
  "user_name": "John Smith",
  "user_username": "jsmith",
  "user_email": "john@example.com",
  "user_avatar": "https://s.gravatar.com/avatar/d4c74594d841139328695756648b6bd6?s=8://s.gravatar.com/avatar/d4c74594d841139328695756648b6bd6?s=80",
  "project_id": 15,
  "project": {
    "id": 15,
    "name": "Diaspora",
    "description": "",
    "web_url": "http://example.com/mike/diaspora",
    "avatar_url": null,
    "git_ssh_url": "git@example.com:mike/diaspora.git",
    "git_http_url": "http://example.com/mike/diaspora.git",
    "namespace": "Mike",
    "visibility_level": 0,
    "path_with_namespace": "mike/diaspora",
    "default_branch": "master",
    "homepage": "http://example.com/mike/diaspora",
    "url": "git@example.com:mike/diaspora.git",
    "ssh_url": "git@example.com:mike/diaspora.git",
    "http_url": "http://example.com/mike/diaspora.git"
  },
  "repository": {
    "name": "Diaspora",
    "url": "git@example.com:mike/diaspora.git",
    "description": "",
    "homepage": "http://example.com/mike/diaspora",
    "git_http_url": "http://example.com/mike/diaspora.git",
    "git_ssh_url": "git@example.com:mike/diaspora.git",
    "visibility_level": 0
  },
  "commits": [
    {
      "id": "b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327",
      "message": "Update Catalan translation to e38cb41.\n\nSee https://gitlab.com/gitlab-org/gitlab for more information",
      "title": "Update Catalan translation to e38cb41.",
      "timestamp": "2011-12-12T14:27:31+02:00",
      "url": "http://example.com/mike/diaspora/commit/b6568db1bc1dcd7f8b4d5a946b0b91f9dacd7327",
      "author": {
        "name": "Jordi Mallach",
        "email": "jordi@softcatala.org"
      },
      "added": ["CHANGELOG"],
      "modified": ["app/controller/application.rb"],
      "removed": []
    }
  ],
  "total_commits_count": 4
}
```

请求体中的任何属性都可以提取出来，作为 `TriggerBinding` 的参数，如果是其他的 Hook 事件，对应的请求体结构可以[查看 GitLab 文档说明](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html)。

这样我们就可以在 `TriggerTemplate` 对象中通过参数来读取上面 `TriggerBinding` 中定义的参数值了，定义一个如下所示的 `TriggerTemplate` 对象，声明一个 `TaskRun` 的模板，定义的 Task 任务也非常简单，只需要在容器中打印出代码的目录结构即可：

```yaml
apiVersion: triggers.tekton.dev/v1alpha1
kind: TriggerTemplate
metadata:
  name: gitlab-echo-template
spec:
  params: # 定义参数，和 TriggerBinding 中的保持一致
    - name: gitrevision
    - name: gitrepositoryurl
  resourcetemplates:
    - apiVersion: tekton.dev/v1alpha1
      kind: TaskRun # 定义 TaskRun 模板
      metadata:
        generateName: gitlab-run- # TaskRun 名称前缀
      spec:
        serviceAccountName: tekton-triggers-gitlab-sa
        taskSpec: # Task 任务声明
          inputs:
            resources: # 定义一个名为 source 的 git 输入资源
              - name: source
                type: git
          steps:
            - name: show-path
              image: ubuntu # 定义一个执行步骤，列出代码目录结构
              script: |
                #! /bin/bash
                ls -la $(inputs.resources.source.path)
        inputs: # 声明具体的输入资源参数
          resources:
            - name: source # 和 Task 中的资源名保持一直
              resourceSpec: # 资源声明
                type: git
                params:
                  - name: revision
                    value: $(params.gitrevision) # 读取参数值
                  - name: url
                    value: $(params.gitrepositoryurl)
```

定义完过后，直接创建上面的资源对象，创建完成后会自动生成 `EventListener` 的 Pod 和 Service 对象：

```shell
$ kubectl get svc -l eventlistener=gitlab-listener
NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
el-gitlab-listener   ClusterIP   10.98.145.130   <none>        8080/TCP   91m
$ kubectl get pod -l eventlistener=gitlab-listener
NAME                                  READY   STATUS    RESTARTS   AGE
el-gitlab-listener-6bff9b55bc-qdpjh   1/1     Running   0          91m
$ kubectl get ingressroute
NAME                 AGE
el-gitlab-listener   74m
```

接下来我们就可以到 GitLab 的项目中配置 WebHook，注意需要配置 `Secret Token`，我们在上面的 Secret 对象中声明过：

![Secret Token](https://picdn.youdianzhishi.com/images/20200528205104.png)

创建完成后，我们可以测试下该 WebHook 的 `Push events` 事件，直接点击测试即可，正常会返回 ` Hook executed successfully: HTTP 201` 的提示信息，这个时候在 Kubernetes 集群中就会出现如下所示的任务 Pod：

```shell
$ kubectl get pod -l triggers.tekton.dev/eventlistener=gitlab-listener
NAME                         READY   STATUS      RESTARTS   AGE
gitlab-run-2jfcf-pod-8smb7   0/2     Completed   0          5m22s
$ kubectl get taskrun -l triggers.tekton.dev/eventlistener=gitlab-listener
NAME               SUCCEEDED   REASON      STARTTIME   COMPLETIONTIME
gitlab-run-2jfcf   True        Succeeded   12h         12h
$ kubectl logs -f gitlab-run-2jfcf-pod-8smb7 --all-containers
{"level":"info","ts":1590718126.8466494,"caller":"git/git.go:136","msg":"Successfully cloned http://git.k8s.local/course/devops-demo.git @ e8b2dd4cac9bfaa79f1998215b4c3fd0e98ea84d (grafted, HEAD) in path /workspace/source"}
{"level":"info","ts":1590718126.9744687,"caller":"git/git.go:177","msg":"Successfully initialized and updated submodules in path /workspace/source"}
{"level":"info","ts":1590717929.8761587,"caller":"creds-init/main.go:44","msg":"Credentials initialized."}
total 36
drwxr-xr-x 4 root root  136 May 29 10:08 .
drwxrwxrwx 3 root root   19 May 29 10:08 ..
drwxr-xr-x 8 root root 4096 May 29 10:08 .git
-rw-r--r-- 1 root root  192 May 29 10:08 .gitignore
-rw-r--r-- 1 root root  376 May 29 10:08 Dockerfile
-rw-r--r-- 1 root root 4788 May 29 10:08 Jenkinsfile
-rw-r--r-- 1 root root   42 May 29 10:08 README.md
-rw-r--r-- 1 root root   97 May 29 10:08 go.mod
-rw-r--r-- 1 root root 3370 May 29 10:08 go.sum
drwxr-xr-x 3 root root   96 May 29 10:08 helm
-rw-r--r-- 1 root root  444 May 29 10:08 main.go
```

到这里我们就完成了通过 GitLab 的 Push 事件来触发 Tekton 的一个任务。

<!--adsense-self-->
