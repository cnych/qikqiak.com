---
title: 解决 CoreDNS 自定义域名失效的问题
date: 2020-05-14
tags: ["kubernetes", "coredns"]
keywords: ["kubernetes", "coredns", "hosts", "rewrite", "插件", "A 记录"]
slug: resolve-coredns-hosts-invalid
gitcomment: true
notoc: true
category: "kubernetes"
bigimg: [{src: "https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200514172611.png", desc: "https://unsplash.com/photos/xqSDI58vkUY"}]
---
前几天我们在解决 CoreDNS 的5秒超时问题的时候，使用了 [NodeLocal DNSCache](/post/use-nodelocal-dns-cache/) 来解决这个问题，集群 DNS 的解析性能也明显大幅提升了。但是今天确遇到一个很大的坑，我们在做 DevOps 实验的时候，相关的工具都使用的是自定义的域名，这个时候要互相访问的话就需要添加自定义的域名解析，我们可以通过给 Pod 添加 `hostAlias` 来解决，但是在使用 Jenkins 的 Kubernetes 插件的时候却不支持这个参数，需要使用 YAML 来自定义，比较麻烦，所以想着通过 CoreDNS 来添加 A 记录解决这个问题。

<!--more-->

正常我们只需要在 CoreDNS 的 ConfigMap 中添加 hosts 插件就可以使用了：
```shell
hosts {
  10.151.30.11 git.k8s.local
  fallthrough
}
```

但是在配置完成后，始终解析不了这个自定义的域名：
```shell
$ kubectl run -it --image busybox:1.28.4 test --restart=Never --rm /bin/sh
If you don't see a command prompt, try pressing enter.
/ # nslookup git.k8s.local
Server:    169.254.20.10
Address 1: 169.254.20.10

nslookup: can't resolve 'git.k8s.local'

```

这有点奇怪，难道 `hosts` 插件不能这样使用吗？在经过一番查阅过后确信这样配置是正确的方式。然后将 `CoreDNS` 的日志开启，来过滤上面域名的解析日志：

![](https://bxdc-static.oss-cn-beijing.aliyuncs.com/images/20200514165339.png)

可以看到走了一遍 search 域，但是没有获取到正确的解析结果，这就有点不解了。在折腾了一番过后，想到我们在集群中启用了 `NodeLocal DNSCache`，难道是这个组件导致的吗？这个不是解析没有命中的时候会转发到 CoreDNS 查询吗？

为了验证这个问题，我们就直接使用 CoreDNS 的地址来进行解析测试一番：
```shell
/ # nslookup git.k8s.local 10.96.0.10
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      git.k8s.local
Address 1: 10.151.30.11 git.k8s.local
```

发现居然是正确的，那也就说明 CoreDNS 的配置是没有任何问题的，问题肯定就是 `NodeLocal DNSCache` 导致的，直接用 LocalDNS 的地址（169.254.20.10）解析发现确实是失败的：
```shell
/ # nslookup git.k8s.local 169.254.20.10
Server:    169.254.20.10
Address 1: 169.254.20.10

nslookup: can't resolve 'git.k8s.local'
```

这个时候只能去查看 LocalDNS 的 Pod 日志了：
```shell
$ 
......
2020/05/14 05:30:21 [INFO] Updated Corefile with 0 custom stubdomains and upstream servers /etc/resolv.conf
2020/05/14 05:30:21 [INFO] Using config file:
cluster.local:53 {
    errors
    cache {
            success 9984 30
            denial 9984 5
    }
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . 10.96.207.156 {
            force_tcp
    }
    prometheus :9253
    health 169.254.20.10:8080
    }
in-addr.arpa:53 {
    errors
    cache 30
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . 10.96.207.156 {
            force_tcp
    }
    prometheus :9253
    }
ip6.arpa:53 {
    errors
    cache 30
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . 10.96.207.156 {
            force_tcp
    }
    prometheus :9253
    }
.:53 {
    errors
    cache 30
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . /etc/resolv.conf {
            force_tcp
    }
    prometheus :9253
    }
......
[INFO] plugin/reload: Running configuration MD5 = 3e3833f9361872f1d34bc97155f952ca
CoreDNS-1.6.7
linux/amd64, go1.11.13,
```

仔细分析上面的 LocalDNS 的配置信息，其中 10.96.0.10 为 CoreDNS 的 Service ClusterIP，169.254.20.10 为 LocalDNS 的 IP 地址，10.96.207.156 是 LocalDNS 新建的一个 Service ClusterIP，该 Service 和 CoreDNS 一样都是关联以前的 CoreDNS 的 Endpoints 列表。

仔细观察可以发现 `cluster.local`、`in-addr.arpa` 以及 `ip6.arpa` 都会通过 `forward` 转发到 10.96.207.156，也就是去 CoreDNS 解析，其他的则是 `forward . /etc/resolv.conf` 通过 `resolv.conf` 文件去解析，该文件的内容如下所示：
```shell
nameserver 169.254.20.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

所以当我们解析域名 `git.k8s.local` 的时候需要走一遍搜索域，而 `cluster.local` 的域名是直接 forward 到 CoreDNS 解析的，CoreDNS 自然解析不出来这几天记录了。那么我们是不是自然可以想到把 `hosts` 插件配置在 LocalDNS 这边不就可以了吗？这种思路应该是完全正确的：
```shell
$ kubectl edit cm node-local-dns -n kube-system
......
.:53 {
    errors
    hosts {  # 添加 A 记录
      10.151.30.11 git.k8s.local
      fallthrough
    }
    cache 30
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . __PILLAR__UPSTREAM__SERVERS__ {
            force_tcp
    }
    prometheus :9253
}
......
```

更新完成后，我们可以手动重建 NodeLocalDNS Pod，重建过后确发现 NodeLocalDNS 的 Pod 启动失败了，会出现如下所示的错误信息：
```shell
no action found for directive 'hosts' with server type 'dns'
```

原来压根就不支持 `hosts` 这个插件。那么我们就只有去 CoreDNS 解析了，所以这个时候我们需要把 `forward . /etc/resolv.conf` 更改成 `forward . 10.96.207.156`，这样就会去 CoreDNS 解析了，在 NodeLocalDNS 的 ConfigMap 中做如下的修改即可：
```shell
$ kubectl edit cm node-local-dns -n kube-system
......
.:53 {
    errors
    cache 30
    reload
    loop
    bind 169.254.20.10 10.96.0.10
    forward . __PILLAR__CLUSTER__DNS__ {
            force_tcp
    }
    prometheus :9253
}
......
```

同样修改完成后，需要重建 NodeLocalDNS 的 Pod 才会生效。

>  `__PILLAR__CLUSTER__DNS__` 和 `__PILLAR__UPSTREAM__SERVERS__` 这两个参数在镜像 1.15.6 版本以上中会自动进行配置，对应的值来源于 kube-dns 的 ConfigMap 和定制的 Upstream Server 地址。

现在我们再去测试就可以正常解析自定义的域名了：
```shell
/ # nslookup git.k8s.local
Server:    169.254.20.10
Address 1: 169.254.20.10

Name:      git.k8s.local
Address 1: 10.151.30.11 git.k8s.local
```

对于使用 NodeLocalDNS 的用户一定要注意这个问题，如果使用 hosts 或者 rewrite 插件失效，基本上就是这个问题造成的。排查问题通过日志去分析始终是最好的手段。

<!--adsense-self-->
