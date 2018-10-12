---
title: 给博客加上HTTPS
date: 2017-11-06
tags: ["https", "nginx", "ops"]
slug: make-https-blog
gitcomment: true
bigimg: [{src: "/img/posts/15802194_206063646464303_2027400919364141056_n.jpg", desc: "普吉岛@泰国 JANUARY 8,2017"}]
category: "ops"
---

谁都不愿意在使用网站服务的时候，被恶心的运营商劫持加上一些他们的服务(真的很贱，不是吗？)，不过这能难道我们程序员吗？当然不能，上`https`，老子全站`https`，你再劫持给我看看。

`https`证书服务大部分都是收费的，而且很贵，阿里云可以申请一个免费的证书，只能绑定一个域名，这里我们使用更加友好的免费`https`服务：[Let’s Encrypt](https://letsencrypt.org/)

<!--more-->

## Let's Encrypt 简介

如果要启用HTTPS，我们就需要从证书授权机构(以下简称CA) 处获取一个证书，`Let's Encrypt` 就是一个 CA。我们可以从`Let's Encrypt` 获得网站域名的免费的证书。这篇文章也主要讲的是通过 `Let's Encrypt + Nginx` 来让网站升级到`HTTPS`。

## 获取证书

**Certbot**是`Let's Encrypt`官方推荐的获取证书的客户端，可以帮我们获取免费的`Let's Encrypt` 证书。安装命令：
```shell
yum install certbot
```

生成证书：
```shell
certbot certonly --email icnych@gmail.com --agree-tos --webroot -w /var/www/blogs -d blog.qikqiak.com
```
> 其中-w后面是网站根目录，-d后面是网站域名，所以需要保证目录存在并且可以正常访问。

执行完生成证书的命令后，会生成相关的证书文件到`/etc/letsencrypt/live/blog.qikqiak.com/`目录下面：
```shell
$ ls /etc/letsencrypt/live/blog.qikqiak.com/
cert.pem  chain.pem  fullchain.pem  privkey.pem  README
```
至此证书生成完成。

## Nginx 配置https

证书生成完成后，还需要更改我们的`Nginx`配置服务，主要是监听**443**端口，启用`SSL`，并配置`SSL`的证书路径（公钥，私钥的路径）。如下：
```shell
server
{
    listen       443;
    ssl on;
    ssl_certificate /etc/letsencrypt/live/blog.qikqiak.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.qikqiak.com/privkey.pem;
    server_name blog.qikqiak.com;
    root /home/notes/apps/blog;
    index index.html;
}
```
配置更改过后重新加载`Nginx`即可生效：
```shell
nginx -s reload
```

现在我们访问`https://blog.qikqiak.com`已经可以正常访问了，但是还有一个问题就是访问`http://blog.qikqiak.com`依然还是`http`的，所以我们需要配置将`http`更改为`https`，这样就完美了。这里可以用到之前我们的[301跳转](/post/nginx-301-redirect/)来解决这个问题，完整的配置如下：
```shell
server {
    listen  80;
    server_name blog.qikqiak.com;
    rewrite ^(.*)$  https://$host$1 permanent;
}

server
{
    listen       443;
    ssl on;
    ssl_certificate /etc/letsencrypt/live/blog.qikqiak.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.qikqiak.com/privkey.pem;
    server_name blog.qikqiak.com;
    root /home/notes/apps/blog;
    index index.html;
}
```

## 更新证书

到这里我们已经将博客`https`化了，但是还没有完的，由于`Let's Encrypt`证书的有效期只有**90天**，所以在到期之前我们需要更新整数，`certbot`给我们已经提供了这样的更新命令，我们只需要将更新命令添加到`crontab`下面定期更新即可：
```shell
$ crontab -l
30 5 1 * * root /usr/bin/certbot renew --renew-hook "/usr/sbin/nginx -s reload"
```

到这一步才算革命成功了~~~ 我们再也不用担心恶心的害虫了~~~

