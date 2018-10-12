---
title: Nginx中如何设置301跳转
date: 2016-02-27 21:21:00
tags: ["ops", "nginx", "301"]
slug: nginx-301-redirect
category: "ops"
gitcomment: true
---

网站中带`www`和不带都可以访问，但是这样却会不利于网站`SEO`的，会分权，所以需要将二者的访问合并到一起，这特别在网站架设之初就应该好好规划。

有很多的第三方DNS解析服务，提供了直接的显示跳转的服务，比如`dnspod`，但是最近我在使用的过程中发现该服务非常的不稳定，导致网站经常性的访问不了。所以就打算自己来做，方法很简单，就是`301跳转`，**301是永久跳转**，**302是临时性跳转**。

<!--more-->

### nginx 配置

下面是我nginx中配置301跳转的方法：

```shell
server {
    listen       80;
    server_name kuaidiantv.com www.kuaidiantv.com;

    index index.html;

    if ($host != "www.kuaidiantv.com" ) {
        rewrite ^/(.*)$ http://www.kuaidiantv.com/$1 permanent;
    }
 }
```

### 相关链接
- [http://atulhost.com/301-redirect-in-nginx](http://atulhost.com/301-redirect-in-nginx)

