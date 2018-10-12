---
title: kubernetes 下实现socket.io 的集群模式
date: 2017-11-21
tags: ["kubernetes", "socket.io", "cluster"]
keywords: ["kubernetes", "socket.io", "cluster", "集群", "nodejs"]
slug: socketio-multiple-nodes-in-kubernetes
gitcomment: true
bigimg: [{src: "/img/posts/23498828_2151213871773296_819155850823204864_n.jpg", desc: "A pal and a skateboard and headed outside in South Australia."}]
category: "kubernetes"
---

`socket.io` 单节点模式是很容易部署的，但是往往在生产环境一个节点不能满足业务需求，况且还要保证节点挂掉的情况仍能正常提供服务，所以多节点模式就成为了生成环境的一种必须的部署模式。

本文将介绍如何在kubernetes 集群上部署多节点的`socket.io`服务。

文章中涉及到的代码可以前往[https://github.com/cnych/k8s-socketio-cluster-demo](https://github.com/cnych/k8s-socketio-cluster-demo)查看。

<!--more-->

### 问题

现在正在准备将线上环境一步步迁移到[kubernetes 集群](/tags/kubernetes/)上，这样我们可以根据实际情况部署多个POD 来提供服务，但是`socket.io`服务并不是单纯的无状态应用，只需要将POD 部署成多个就可以正常提供服务了，因为其底层需要建立很多连接来保持长连接，但是这样的话上一个请求可能会被路由到一个POD，下一个请求则很有可能会被路由到另外一个POD 中去了，这样就会出现错误了，如下图：

![socket-io errors](/img/posts/WX20171121-135349.png)

从上面的错误中我们可以看出是有的请求找不到对应的Session ID，也证明了上面提到的引起错误的原因。


### 解决方法

我们从[socket.io 官方文档](https://socket.io/docs/using-multiple-nodes/)中可以看到对于多节点的介绍，其中通过`Nginx`的**ip_hash** 配置用得比较多，同一个ip 访问的请求通过hash 计算过后会被路由到相同的后端程序去，这样就不会出现上面的问题了。我们这里是部署在`kubernetes`集群上面的，通过`traefik ingress`来连接外部和集群内部间的请求的，所以这里中间就省略了`Nginx`这一层，当然你也可以多加上这一层，但是这样显然从架构上就冗余了，而且还有更好的解决方案的：**sessionAffinity**（也称会话亲和力）

> 什么是sessionAffinity？
> sessionAffinity是一个功能，将来自同一个客户端的请求总是被路由回服务器集群中的同一台服务器的能力。

在`kubernetes`中启用`sessionAffinity`很简单，只需要简单的`Service`中配置即可：
```json
service.spec.sessionAffinity = "ClientIP"
```

默认情况下sessionAffinity=None，会随机选择一个后端进行路由转发的，设置成`ClientIP`后就和上面的`ip_hash`功能一样了，由于我们使用的是`traefik ingress`，这里还需要在`Service`中添加一个`traefik`的`annotation`：
```yaml
apiVersion: v1
kind: Service
metadata:
  name: socket-demo
  namespace: kube-apps
  annotations:
    traefik.backend.loadbalancer.stickiness: "true"
    traefik.backend.loadbalancer.stickiness.cookieName: "socket"
  labels:
    k8s-app: socket-demo
spec:
  sessionAffinity: "ClientIP"
  ports:
    - name: socketio
      port: 80
      protocol: TCP
      targetPort: 3000
  selector:
    k8s-app: socket-demo
```
注意上面的**annotations**和**sessionAffinity**两项配置，然后我们再来看看我们的`socket.io`服务吧

![socket.io](/img/posts/WX20171121-140324.png)
已经正常了吧，注意看上面打印出来的`hostname`都是一样的，因为我们这里去访问的都是来自同一个IP，多刷新几次是不是还是这样，证明上面的`sessionAffinity`配置生效了。

如果是另外的地方去访问，会路由到不一样的后端去吗？我们这里启用一个代理来测试下：
![socket.io](/img/posts/WX20171121-10000.png)
从上图中打印出来的`hostname`可以看出两个请求被路由到了不同的POD 中，但是现在又有一个新的问题了：**绘制的图形并没有被广播出去**，这是为什么呢？其实在上面提到的`socket.io 官方文档中已经提到过了`：

> Now that you have multiple Socket.IO nodes accepting connections, if you want to broadcast events to everyone (or even everyone in a certain room) you’ll need some way of passing messages between processes or computers.

> The interface in charge of routing messages is what we call the Adapter. You can implement your own on top of the socket.io-adapter (by inheriting from it) or you can use the one we provide on top of Redis: socket.io-redis:

```javascript
var io = require('socket.io')(3000);
var redis = require('socket.io-redis');
io.adapter(redis({ host: 'localhost', port: 6379 }));
```

总结起来就是你如果想在进程间或者节点之前发送信息，那么就需要实现自己实现一个`socket.io-adapter`或者利用官方提供的`socket.io-redis`。

我们这里利用`socket.io-redis` 这个adapter 来实现消息的广播，最终的服务端代码如下：
```javascript
const express = require('express');
const socketRedis = require('socket.io-redis');
const os = require('os');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + '/static'));

app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');

app.get('/', function (req, res) {
    res.render('index', {
        'os': os.hostname()
    });
});

function onConnection(socket){
  socket.on('drawing', (data) => socket.broadcast.emit('drawing', data));
}

io.adapter(socketRedis({host: 'redis', port: 6379}));
io.on('connection', onConnection);

http.listen(port, () => console.log('listening on port ' + port));
```

部署在`kubernetes`集群上的`yaml`文件如下：
```yaml
apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: socket-demo
  namespace: kube-apps
  labels:
    k8s-app: socket-demo
spec:
  replicas: 3
  template:
    metadata:
      labels:
        k8s-app: socket-demo
    spec:
      containers:
        - image: cnych/socketdemo:k8s
          imagePullPolicy: Always
          name: socketdemo
          ports:
            - containerPort: 3000
              protocol: TCP
          resources:
            limits:
              cpu: 100m
              memory: 100Mi
            requests:
              cpu: 50m
              memory: 50Mi

---
apiVersion: v1
kind: Service
metadata:
  name: socket-demo
  namespace: kube-apps
  annotations:
    traefik.backend.loadbalancer.stickiness: "true"
    traefik.backend.loadbalancer.stickiness.cookieName: "socket"
  labels:
    k8s-app: socket-demo
spec:
  sessionAffinity: None
  ports:
    - name: socketio
      port: 80
      protocol: TCP
      targetPort: 3000
  selector:
    k8s-app: socket-demo
```

现在看看最终的效果吧：
![socket.io cluster](/img/posts/WX20171121-141623.png)

不同节点间也可以传递数据了，到这里我们就实现了在`kubernetes`集群下部署`socket.io`多节点。

> 上面的根据`traefik.backend.loadbalancer.stickiness.cookieName`来进行路由的规则在测试环境生效了，在线上没生效，可能这个地方有什么问题？


> 上面没有生效是因为客户端连接`socket.io`的协议的时候没有使用**polling**造成的，客户端连接`socket.io`要按照标准的方式指定trasports=['polling', 'websocket']


> `sessionAffinity` 与 `traefik`设置cookieName的方式貌似不能同时存在，如果遇到不生效的，将`sessionAffinity`设置为**None** ，只保留`traefik`的annotaions。

> 在使用`socket.io-redis`的时候一定要注意，在`join`和`leave`房间的时候一定要使用`adapter`提供的`remoteJoin`和`remoteLeave`方法，不然多个节点间的数据同步有问题，这个被坑了好久......

### 参考文档

* [traefik sticky-sessions](https://docs.traefik.io/basics/#sticky-sessions)
* [kubernetes service](https://kubernetes.io/docs/concepts/services-networking/service/)
* [socket.io docs](https://socket.io/docs/using-multiple-nodes/)
* [socket.io redis](https://github.com/socketio/socket.io-redis)


扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)
