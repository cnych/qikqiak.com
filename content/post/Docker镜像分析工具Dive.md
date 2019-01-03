---
title: Docker 镜像分析工具 Dive(附视频)
date: 2018-12-08
tags: ["docker", "镜像", "dive"]
slug: docker-image-explore-tool-dive
keywords: ["docker", "镜像", "dive"]
gitcomment: true
notoc: true
bigimg: [{src: "/img/posts/photo-1544137105-295758788545.jpeg", desc: "Monte Due Mani, Italy"}]
category: "docker"
---

我们知道用`docker inspect`命令可以查看一个 docker 镜像的 meta 信息，用`docker history`命令可以了解一个镜像的构建历史，但是这些信息对我们去分析一个镜像的具体一层的组成来说还是不太够，不够清晰明了。

<!--more-->

```shell
$ docker images
REPOSITORY                         TAG                 IMAGE ID            CREATED             SIZE
python                             3.6.4               07d72c0beb99        8 months ago        689MB
$ docker inspect python:3.6.4
[
    {
        ......
        "RootFS": {
            "Type": "layers",
            "Layers": [
                "sha256:8fad67424c4e7098f255513e160caa00852bcff347bc9f920a82ddf3f60229de",
                "sha256:86985c679800f423275a0ea3ad540e9b7f522dcdcd65ec2b20f407996162f2e0",
                "sha256:6e5e20cbf4a7246b94f7acf2a2ceb2c521e95daca334dd1e8ba388fa73443dfe",
                "sha256:ff57bdb79ac820da132ad1fdc1e2d250de5985b264dbdf60aa4ce83a05c4da75",
                "sha256:6e1b48dc2cccd7c0faf316e5975f1a02f5897723d7fa3b0367b28a20173931d6",
                "sha256:325a22db58ea59d76568ded2fac6b783554f8cd5fa8e851c260da4b141c55c6c",
                "sha256:a4a7a3673769ce5035e06f56458cab872bb5dc561bebe3571ac62fe2b52f0aaf",
                "sha256:c83faac49cbc38f1e458dfffb71b1c87860f56ac34602befefe6005177474ba3"
            ]
        },
        "Metadata": {
            "LastTagTime": "0001-01-01T00:00:00Z"
        }
    }
]
$ docker history python:3.6.4
IMAGE               CREATED             CREATED BY                                      SIZE                COMMENT
07d72c0beb99        8 months ago        /bin/sh -c #(nop)  CMD ["python3"]              0B
<missing>           8 months ago        /bin/sh -c set -ex;   wget -O get-pip.py 'ht…   6.06MB
<missing>           8 months ago        /bin/sh -c #(nop)  ENV PYTHON_PIP_VERSION=9.…   0B
<missing>           8 months ago        /bin/sh -c cd /usr/local/bin  && ln -s idle3…   32B
<missing>           8 months ago        /bin/sh -c set -ex  && buildDeps='   dpkg-de…   62.9MB
<missing>           8 months ago        /bin/sh -c #(nop)  ENV PYTHON_VERSION=3.6.4     0B
<missing>           8 months ago        /bin/sh -c #(nop)  ENV GPG_KEY=0D96DF4D4110E…   0B
<missing>           8 months ago        /bin/sh -c apt-get update && apt-get install…   8.67MB
<missing>           8 months ago        /bin/sh -c #(nop)  ENV LANG=C.UTF-8             0B
<missing>           8 months ago        /bin/sh -c #(nop)  ENV PATH=/usr/local/bin:/…   0B
<missing>           8 months ago        /bin/sh -c set -ex;  apt-get update;  apt-ge…   320MB
<missing>           8 months ago        /bin/sh -c apt-get update && apt-get install…   123MB
<missing>           8 months ago        /bin/sh -c set -ex;  if ! command -v gpg > /…   0B
<missing>           8 months ago        /bin/sh -c apt-get update && apt-get install…   44.6MB
<missing>           8 months ago        /bin/sh -c #(nop)  CMD ["bash"]                 0B
<missing>           8 months ago        /bin/sh -c #(nop) ADD file:bc844c4763367b5f0…   123MB
```

### 介绍
接下来我们给大家介绍一个用来分析 docker 镜像层信息的一个工具：dive，地址：[https://github.com/wagoodman/dive](https://github.com/wagoodman/dive)，该工具主要用于探索 docker 镜像层内容以及发现减小 docker 镜像大小的方法。

{{% video mp4="http://vdn.haimaxy.com/course/2019/1/3/dive.mp4" poster="https://ws3.sinaimg.cn/large/006tNc79gy1fyt9wm1k5cj30zk0llwss.jpg" %}}

要分析一个 docker 镜像，只需要在 dive 工具后面添加上镜像的 tag 即可：
```shell
$ dive <镜像TAG>
```

除此之外，还可以通过 build 命令去构建 docker 镜像后，直接进入分析结果：
```shell
$ dive build -t <镜像TAG> .
```

### 基本功能
* 显示每层的 docker 镜像内容：当您在左侧选择一个层时，将在右侧线上显示该层的所有内容，此外，您可以使用箭头按键来浏览整个文件树内容。
* 指出每层中发生了哪些变化：在文件树中标明已修改、添加或删除的文件，可以调整此值以显示特定层的更改。
* 估计“镜像效率”：左下方窗格显示基本层信息和一个实验指标，用于猜测图像所包含的空间浪费。这可能是跨层的一些重复文件，跨层移动文件或不完全删除的文件。提供了一个百分比的“得分”和总浪费的文件空间。
* 快速构建/分析周期：您可以构建 docker 镜像并使用一个命令立即进行分析：`dive build -t some-tag .`，您只需要将`docker build`命令用相同的`dive build`命令替换即可。

### 安装
安装非常简单，我们这里为了方便，直接使用 docker 镜像的方式，其他的安装方法在 dive 文档中查看即可。
```shell
$ docker pull wagoodman/dive
```

镜像 pull 下来后，然后使用该镜像运行一个临时的容器，加上我们需要分析的镜像即可：
```shell
$ docker run --rm -it \
    -v /var/run/docker.sock:/var/run/docker.sock \
    wagoodman/dive:latest <dive arguments...>
```

比如，我们这里来分析下`python:3.6.4`这个镜像：
```shell
$ docker run --rm -it \
    -v /var/run/docker.sock:/var/run/docker.sock \
    wagoodman/dive:latest python:3.6.4
Analyzing Image
  Fetching metadata...
  Fetching image...
    ├─ [layer:  0] 2f1b3001b085f94 : [========================================>] 100 % (465/465)
    ├─ [layer:  1] 383de4491c61a96 : [========================================>] 100 % (7/7)
    ├─ [layer:  2] 5a18124b107698b : [========================================>] 100 % (1382/1382)
    ├─ [layer:  3] 68c6148e6856d76 : [========================================>] 100 % (568/568)
    ├─ [layer:  4] 872e2e8e6109ee2 : [========================================>] 100 % (5421/5421)
    ├─ [layer:  5] 8aa62fd66ae0210 : [========================================>] 100 % (8252/8252)
    ├─ [layer:  6] 93e9cefe47e6b15 : [========================================>] 100 % (11545/11545)
    ├─ [layer:  7] f1a4ff99e76e332 : [========================================>] 100 % (1482/1482)
    ╧
  Building tree...
  Analyzing layers...
```

分析完成后，我们就可以进入到一个可操作的界面之中，然后可以使用键盘上的`上下按键`去切换镜像的每一层，在左下角会出现这一层的详细信息，有的层就会出现计算出的一些浪费空间的结果，我们就可以根据这个信息去分析如何减少镜像大小，而右侧区域则是显示当前镜像层的内容文件树：
![dive](/img/posts/dive.png)

更多的信息可以查看 dive 的[github](https://github.com/wagoodman/dive)仓库页面，也可以查看上面的视频教程。

## 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
