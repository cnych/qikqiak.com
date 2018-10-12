---
title: 为kubernetes dashboard访问用户添加权限控制
date: 2018-01-18
publishdate: 2017-01-18
tags: ["kubernetes", "dashboard", "rbac"]
keywords: ["kubernetes", "dashboard", "rbac", "权限"]
slug: add-authorization-for-kubernetes-dashboard
gitcomment: true
bigimg: [{src: "/img/posts/photo-1439209306665-700c9bca794c.jpeg", desc: "two boats"}]
category: "kubernetes"
---

前面我们在[kubernetes dashboard 升级之路](/post/update-kubernetes-dashboard-more-secure)一文中成功的将`Dashboard`升级到最新版本了，增加了身份认证功能，之前为了方便增加了一个`admin`用户，然后授予了`cluster-admin`的角色绑定，而该角色绑定是系统内置的一个超级管理员权限，也就是用该用户的`token`登录`Dashboard`后会很**强势**，什么权限都有，想干嘛干嘛，这样的操作显然是非常危险的。接下来我们来为一个新的用户添加访问权限控制。

<!--more-->

## Role
`Role`表示是一组规则权限，只能累加，`Role`可以定义在一个`namespace`中，只能用于授予对单个命名空间中的资源访问的权限。比如我们新建一个对默认命名空间中`Pods`具有访问权限的角色：
```yaml
kind: Role
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  namespace: default
  name: pod-reader
rules:
- apiGroups: [""] # "" indicates the core API group
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
```

## ClusterRole
`ClusterRole`具有与`Role`相同的权限角色控制能力，不同的是`ClusterRole`是集群级别的，可以用于:

* 集群级别的资源控制(例如 node 访问权限)
* 非资源型 endpoints(例如 /healthz 访问)
* 所有命名空间资源控制(例如 pods)

比如我们要创建一个授权某个特定命名空间或全部命名空间(取决于绑定方式)访问**secrets**的集群角色：
```yaml
kind: ClusterRole
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  # "namespace" omitted since ClusterRoles are not namespaced
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get", "watch", "list"]
```

## RoleBinding和ClusterRoleBinding
`RoloBinding`可以将角色中定义的权限授予用户或用户组，`RoleBinding`包含一组权限列表(`subjects`)，权限列表中包含有不同形式的待授予权限资源类型(users、groups、service accounts)，`RoleBinding`适用于某个命名空间内授权，而 `ClusterRoleBinding`适用于集群范围内的授权。

比如我们将默认命名空间的`pod-reader`角色授予用户jane，这样以后该用户在默认命名空间中将具有`pod-reader`的权限：
```yaml
# This role binding allows "jane" to read pods in the "default" namespace.
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: read-pods
  namespace: default
subjects:
- kind: User
  name: jane
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

`RoleBinding`同样可以引用`ClusterRole`来对当前 namespace 内用户、用户组或 ServiceAccount 进行授权，这种操作允许集群管理员在整个集群内定义一些通用的 ClusterRole，然后在不同的 namespace 中使用 RoleBinding 来引用

例如，以下 RoleBinding 引用了一个 ClusterRole，这个 ClusterRole 具有整个集群内对 secrets 的访问权限；但是其授权用户 dave 只能访问 development 空间中的 secrets(因为 RoleBinding 定义在 development 命名空间)
```yaml
# This role binding allows "dave" to read secrets in the "development" namespace.
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: read-secrets
  namespace: development # This only grants permissions within the "development" namespace.
subjects:
- kind: User
  name: dave
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

最后，使用 ClusterRoleBinding 可以对整个集群中的所有命名空间资源权限进行授权；以下 ClusterRoleBinding 样例展示了授权 manager 组内所有用户在全部命名空间中对 secrets 进行访问
```yaml
# This cluster role binding allows anyone in the "manager" group to read secrets in any namespace.
kind: ClusterRoleBinding
apiVersion: rbac.authorization.k8s.io/v1beta1
metadata:
  name: read-secrets-global
subjects:
- kind: Group
  name: manager
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: secret-reader
  apiGroup: rbac.authorization.k8s.io
```

## 限制dashboard 用户权限
有了上面的理论基础，我们就可以来新建一个用户，为该用户指定特定的访问权限了，比如我们的需求是：

* 新增一个新的用户`cnych`
* 该用户只能对命名空间`kube-system`下面的`pods`和`deployments`进行管理

第一步新建一个`ServiceAccount`：
```shell
$ kubectl create sa cnych -n kube-system
```

然后我们新建一个角色**role-cnych**：(role.yaml)
```yaml
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  namespace: kube-system
  name: role-cnych
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "watch", "list"]
- apiGroups: ["extensions", "apps"]
  resources: ["deployments"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
```
注意上面的`rules`规则：管理`pods`和`deployments`的权限。

然后我们创建一个角色绑定，将上面的角色`role-cnych`绑定到**cnych**的`ServiceAccount`上：(role-bind.yaml)
```yaml
kind: RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: role-bind-cnych
  namespace: kube-system
subjects:
- kind: ServiceAccount
  name: cnych
  namespace: kube-system
roleRef:
  kind: Role
  name: role-cnych
  apiGroup: rbac.authorization.k8s.io
```

分别执行上面两个`yaml`文件：
```shell
$ kubect create -f role.yaml
$ kubect create -f role-bind.yaml
```

接下来该怎么做？和前面一样的，我们只需要拿到`cnych`这个`ServiceAccount`的`token`就可以登录`Dashboard`了：
```shell
$ kubectl get secret -n kube-system |grep cnych
cnych-token-nxgqx                  kubernetes.io/service-account-token   3         47m
$ kubectl get secret cnych-token-nxgqx -o jsonpath={.data.token} -n kube-system |base64 -d
# 会生成一串很长的base64后的字符串
```

然后在`dashboard`登录页面上直接使用上面得到的`token`字符串即可登录，登录过后能看到下面的页面。
![unauth](/img/posts/WX20171113-112007.png)

这是因为当前的这个`token`对应的用户没有被授予访问默认命名空间的权限，所以会出现这种提示，然后我们访问`kube-system`这个命名空间试下看看（https://<dashboard_url>/#!/pod?namespace=kube-system）：
![auth](/img/posts/WX20180118-150156.png)

我们可以看到可以访问`pod`列表了，但是也会有一些其他额外的提示：**events is forbidden: User "system:serviceaccount:kube-system:cnych" cannot list events in the namespace "kube-system"**，这是因为当前登录用只被授权了访问`pod`和`deployment`的权限，同样的，访问下`deployment`看看可以了吗？

同样的，你可以根据自己的需求来对访问用户的权限进行限制，可以自己通过`Role`定义更加细粒度的权限，也可以使用系统内置的一些权限......

## 参考资料

* [https://kubernetes.io/docs/admin/authorization/rbac/](https://kubernetes.io/docs/admin/authorization/rbac/)
* [How to Add Users to Kubernetes (kubectl)?](https://stackoverflow.com/questions/42170380/how-to-add-users-to-kubernetes-kubectl)

欢迎大家加入我们的知识星球：`Kubernetes`。
![知识星球](/img/xq.png)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)



