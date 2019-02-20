---
title: Harbor 源码浅析
date: 2019-02-20
tags: ["harbor", "docker", "kubernetes"]
keywords: ["harbor", "docker", "kubernetes", "源码", "registry"]
slug: harbor-code-analysis
gitcomment: true
notoc: true
category: "kubernetes"
---
[![harbor](https://ws4.sinaimg.cn/large/006tKfTcgy1g0cz18sku5j321r0kz0ux.jpg)](/post/harbor-code-analysis/)

[Harbor](https://github.com/goharbor/harbor) 是一个`CNCF`基金会托管的开源的可信的云原生`docker registry`项目，可以用于存储、签名、扫描镜像内容，Harbor 通过添加一些常用的功能如安全性、身份权限管理等来扩展 docker registry 项目，此外还支持在 registry 之间复制镜像，还提供更加高级的安全功能，如用户管理、访问控制和活动审计等，在新版本中还添加了`Helm`仓库托管的支持。

<!--more-->

> 本文所有源码基于 Harbor release-1.7.0 版本进行分析。

`Harbor`最核心的功能就是给 docker registry 添加上一层权限保护的功能，要实现这个功能，就需要我们在使用 docker login、pull、push 等命令的时候进行拦截，先进行一些权限相关的校验，再进行操作，其实这一系列的操作 docker registry v2 就已经为我们提供了支持，v2 集成了一个安全认证的功能，将安全认证暴露给外部服务，让外部服务去实现。

### docker registry v2 认证
上面我们说了 docker registry v2 将安全认证暴露给了外部服务使用，那么是怎样暴露的呢？我们在命令行中输入`docker login https://registry.qikqiak.com`为例来为大家说明下认证流程：

* 1. docker client 接收到用户输入的 docker login 命令，将命令转化为调用 engine api 的 RegistryLogin 方法
* 2. 在 RegistryLogin 方法中通过 http 盗用 registry 服务中的 auth 方法
* 3. 因为我们这里使用的是 v2 版本的服务，所以会调用 loginV2 方法，在 loginV2 方法中会进行 /v2/ 接口调用，该接口会对请求进行认证
* 4. 此时的请求中并没有包含 token 信息，认证会失败，返回 401 错误，同时会在 header 中返回去哪里请求认证的服务器地址
* 5. registry client 端收到上面的返回结果后，便会去返回的认证服务器那里进行认证请求，向认证服务器发送的请求的 header 中包含有加密的用户名和密码
* 6. 认证服务器从 header 中获取到加密的用户名和密码，这个时候就可以结合实际的认证系统进行认证了，比如从数据库中查询用户认证信息或者对接 ldap 服务进行认证校验
* 7. 认证成功后，会返回一个 token 信息，client 端会拿着返回的 token 再次向 registry 服务发送请求，这次需要带上得到的 token，请求验证成功，返回状态码就是200了
* 8. docker client 端接收到返回的200状态码，说明操作成功，在控制台上打印`Login Succeeded`的信息

至此，整个登录过程完成，整个过程可以用下面的流程图来说明：

![docker login](https://ws4.sinaimg.cn/large/006tKfTcgy1g0cwrqk1mqj310q0iuwgt.jpg)


要完成上面的登录认证过程有两个关键点需要注意：怎样让 registry 服务知道服务认证地址？我们自己提供的认证服务生成的 token 为什么 registry 就能够识别？

对于第一个问题，比较好解决，registry 服务本身就提供了一个配置文件，可以在启动 registry 服务的配置文件中指定上认证服务地址即可，其中有如下这样的一段配置信息：
```yaml
......
auth:
  token:
    realm: token-realm
    service: token-service
    issuer: registry-token-issuer
    rootcertbundle: /root/certs/bundle
......
```

其中 realm 就可以用来指定一个认证服务的地址，下面我们可以看到 Harbor 中该配置的内容

> 关于 registry 的配置，可以参考官方文档：[https://docs.docker.com/registry/configuration/](https://docs.docker.com/registry/configuration/)

第二个问题，就是 registry 怎么能够识别我们返回的 token 文件？如果按照 registry 的要求生成一个 token，是不是 registry 就可以识别了？所以我们需要在我们的认证服务器中按照 registry 的要求生成 token，而不是随便乱生成。那么要怎么生成呢？我们可以在 docker registry 的源码中可以看到 token 是如何定义的，文件路径在`distribution/registry/token/token.go`，从源码中我们可以看到 token 是通过`JWT（JSON Web Token）`来实现的，所以我们按照要求生成一个 JWT 的 token 就可以了。

### Harbor 认证
上面我们已经说明了 docker registry v2 认证的整个流程，Harbor 实际上核心的功能就是提供上面的认证服务的功能。我们在 Harbor 的源码目录中可以查看到 registry 服务的配置文件，路径为：`make/common/templates/registry/config.yml`，其中有两个非常重要的配置信息：
```yaml
......
auth:
  token:
    issuer: harbor-token-issuer
    realm: $public_url/service/token
    rootcertbundle: /etc/registry/root.crt
    service: harbor-registry
......
```

一个就是上面我们提到的 auth.token.realm，是用来提供 registry v2 安全认证的外部服务地址，这里默认的配置是`$public_url/service/token`，其中`$public_url`就是 Harbor 服务的主域地址，所以安全认证服务就是去请求`/service/token`这个地址了，由于 Harbor 是基于 beego 这个 web 框架进行开发的，所以我们只需要去查找下`/service/token`这个路由，就可以找到对应的请求处理方法了。可以很容易在文件`src/core/router.go`文件中找到改路由：
```golang
func initRouters() {
    ......
    beego.Router("/service/token", &token.Handler{})
    ......
}
```

上面的请求处理方法在`src/core/service/token.go`文件中，里面有一个`Get`方法就是用来处理该请求的：
```golang
func (h *Handler) Get() {
    request := h.Ctx.Request
    log.Debugf("URL for token request: %s", request.URL.String())
    service := h.GetString("service")
    tokenCreator, ok := creatorMap[service]
    if !ok {
        errMsg := fmt.Sprintf("Unable to handle service: %s", service)
        log.Errorf(errMsg)
        h.CustomAbort(http.StatusBadRequest, errMsg)
    }
    token, err := tokenCreator.Create(request)
    if err != nil {
        if _, ok := err.(*unauthorizedError); ok {
            h.CustomAbort(http.StatusUnauthorized, "")
        }
        log.Errorf("Unexpected error when creating the token, error: %v", err)
        h.CustomAbort(http.StatusInternalServerError, "")
    }
    h.Data["json"] = token
    h.ServeJSON()

}
```

上面的方法通过参数 service 来获取一个 tokenCreator，然后调用 Create 方法生成 token，方法如下：
```golang
func (g generalCreator) Create(r *http.Request) (*models.Token, error) {
    var err error
    scopes := parseScopes(r.URL)
    log.Debugf("scopes: %v", scopes)

    ctx, err := filter.GetSecurityContext(r)
    if err != nil {
        return nil, fmt.Errorf("failed to  get security context from request")
    }

    pm, err := filter.GetProjectManager(r)
    if err != nil {
        return nil, fmt.Errorf("failed to  get project manager from request")
    }

    // for docker login
    if !ctx.IsAuthenticated() {
        if len(scopes) == 0 {
            return nil, &unauthorizedError{}
        }
    }
    access := GetResourceActions(scopes)
    err = filterAccess(access, ctx, pm, g.filterMap)
    if err != nil {
        return nil, err
    }
    return MakeToken(ctx.GetUsername(), g.service, access)
}
```

这里就做了一系列的权限校验，如果没有问题就生成一个 token 对象返回，这里生成的 Token 对象结构体如下：
```golang
type Token struct {
    Token     string `json:"token"`
    ExpiresIn int    `json:"expires_in"`
    IssuedAt  string `json:"issued_at"`
}
```

和 JWT 定义的 token 格式是保持一致的，所以 docker registry v2 能够识别我们返回的 token 字符串。


### Harbor API
上面是 Harbor 提供的最核心的认证服务功能，除此之外还有很多其他的功能，比如 Harbor 还提供了一个额外的 Dashboard 可供我们操作，还支持 Helm Chart 仓库。同样我们再看下之前的`src/core/router.go`文件：
```golang
func initRouters() {

    // standalone
    if !config.WithAdmiral() {
        // Controller API:
        beego.Router("/c/login", &controllers.CommonController{}, "post:Login")
        beego.Router("/c/log_out", &controllers.CommonController{}, "get:LogOut")
        beego.Router("/c/reset", &controllers.CommonController{}, "post:ResetPassword")
        beego.Router("/c/userExists", &controllers.CommonController{}, "post:UserExists")
        beego.Router("/c/sendEmail", &controllers.CommonController{}, "get:SendResetEmail")

        // API:
        beego.Router("/api/projects/:pid([0-9]+)/members/?:pmid([0-9]+)", &api.ProjectMemberAPI{})
        beego.Router("/api/projects/", &api.ProjectAPI{}, "head:Head")
        beego.Router("/api/projects/:id([0-9]+)", &api.ProjectAPI{})

        beego.Router("/api/users/:id", &api.UserAPI{}, "get:Get;delete:Delete;put:Put")
        beego.Router("/api/users", &api.UserAPI{}, "get:List;post:Post")
        beego.Router("/api/users/:id([0-9]+)/password", &api.UserAPI{}, "put:ChangePassword")
        beego.Router("/api/users/:id/sysadmin", &api.UserAPI{}, "put:ToggleUserAdminRole")
        beego.Router("/api/usergroups/?:ugid([0-9]+)", &api.UserGroupAPI{})
        beego.Router("/api/ldap/ping", &api.LdapAPI{}, "post:Ping")
        beego.Router("/api/ldap/users/search", &api.LdapAPI{}, "get:Search")
        beego.Router("/api/ldap/groups/search", &api.LdapAPI{}, "get:SearchGroup")
        beego.Router("/api/ldap/users/import", &api.LdapAPI{}, "post:ImportUser")
        beego.Router("/api/email/ping", &api.EmailAPI{}, "post:Ping")
    }

    // API
    beego.Router("/api/ping", &api.SystemInfoAPI{}, "get:Ping")
    beego.Router("/api/search", &api.SearchAPI{})
    beego.Router("/api/projects/", &api.ProjectAPI{}, "get:List;post:Post")
    beego.Router("/api/projects/:id([0-9]+)/logs", &api.ProjectAPI{}, "get:Logs")
    beego.Router("/api/projects/:id([0-9]+)/_deletable", &api.ProjectAPI{}, "get:Deletable")
    beego.Router("/api/projects/:id([0-9]+)/metadatas/?:name", &api.MetadataAPI{}, "get:Get")
    beego.Router("/api/projects/:id([0-9]+)/metadatas/", &api.MetadataAPI{}, "post:Post")
    beego.Router("/api/projects/:id([0-9]+)/metadatas/:name", &api.MetadataAPI{}, "put:Put;delete:Delete")
    beego.Router("/api/repositories", &api.RepositoryAPI{}, "get:Get")
    beego.Router("/api/repositories/scanAll", &api.RepositoryAPI{}, "post:ScanAll")
    beego.Router("/api/repositories/*", &api.RepositoryAPI{}, "delete:Delete;put:Put")
    beego.Router("/api/repositories/*/labels", &api.RepositoryLabelAPI{}, "get:GetOfRepository;post:AddToRepository")
    beego.Router("/api/repositories/*/labels/:id([0-9]+)", &api.RepositoryLabelAPI{}, "delete:RemoveFromRepository")
    beego.Router("/api/repositories/*/tags/:tag", &api.RepositoryAPI{}, "delete:Delete;get:GetTag")
    beego.Router("/api/repositories/*/tags/:tag/labels", &api.RepositoryLabelAPI{}, "get:GetOfImage;post:AddToImage")
    beego.Router("/api/repositories/*/tags/:tag/labels/:id([0-9]+)", &api.RepositoryLabelAPI{}, "delete:RemoveFromImage")
    beego.Router("/api/repositories/*/tags", &api.RepositoryAPI{}, "get:GetTags;post:Retag")
    beego.Router("/api/repositories/*/tags/:tag/scan", &api.RepositoryAPI{}, "post:ScanImage")
    beego.Router("/api/repositories/*/tags/:tag/vulnerability/details", &api.RepositoryAPI{}, "Get:VulnerabilityDetails")
    beego.Router("/api/repositories/*/tags/:tag/manifest", &api.RepositoryAPI{}, "get:GetManifests")
    beego.Router("/api/repositories/*/signatures", &api.RepositoryAPI{}, "get:GetSignatures")
    beego.Router("/api/repositories/top", &api.RepositoryAPI{}, "get:GetTopRepos")
    beego.Router("/api/jobs/replication/", &api.RepJobAPI{}, "get:List;put:StopJobs")
    beego.Router("/api/jobs/replication/:id([0-9]+)", &api.RepJobAPI{})
    beego.Router("/api/jobs/replication/:id([0-9]+)/log", &api.RepJobAPI{}, "get:GetLog")
    beego.Router("/api/jobs/scan/:id([0-9]+)/log", &api.ScanJobAPI{}, "get:GetLog")

    beego.Router("/api/system/gc", &api.GCAPI{}, "get:List")
    beego.Router("/api/system/gc/:id", &api.GCAPI{}, "get:GetGC")
    beego.Router("/api/system/gc/:id([0-9]+)/log", &api.GCAPI{}, "get:GetLog")
    beego.Router("/api/system/gc/schedule", &api.GCAPI{}, "get:Get;put:Put;post:Post")

    beego.Router("/api/policies/replication/:id([0-9]+)", &api.RepPolicyAPI{})
    beego.Router("/api/policies/replication", &api.RepPolicyAPI{}, "get:List")
    beego.Router("/api/policies/replication", &api.RepPolicyAPI{}, "post:Post")
    beego.Router("/api/targets/", &api.TargetAPI{}, "get:List")
    beego.Router("/api/targets/", &api.TargetAPI{}, "post:Post")
    beego.Router("/api/targets/:id([0-9]+)", &api.TargetAPI{})
    beego.Router("/api/targets/:id([0-9]+)/policies/", &api.TargetAPI{}, "get:ListPolicies")
    beego.Router("/api/targets/ping", &api.TargetAPI{}, "post:Ping")
    beego.Router("/api/logs", &api.LogAPI{})
    beego.Router("/api/configs", &api.ConfigAPI{}, "get:GetInternalConfig")
    beego.Router("/api/configurations", &api.ConfigAPI{})
    beego.Router("/api/configurations/reset", &api.ConfigAPI{}, "post:Reset")
    beego.Router("/api/statistics", &api.StatisticAPI{})
    beego.Router("/api/replications", &api.ReplicationAPI{})
    beego.Router("/api/labels", &api.LabelAPI{}, "post:Post;get:List")
    beego.Router("/api/labels/:id([0-9]+)", &api.LabelAPI{}, "get:Get;put:Put;delete:Delete")
    beego.Router("/api/labels/:id([0-9]+)/resources", &api.LabelAPI{}, "get:ListResources")

    beego.Router("/api/systeminfo", &api.SystemInfoAPI{}, "get:GetGeneralInfo")
    beego.Router("/api/systeminfo/volumes", &api.SystemInfoAPI{}, "get:GetVolumeInfo")
    beego.Router("/api/systeminfo/getcert", &api.SystemInfoAPI{}, "get:GetCert")

    beego.Router("/api/internal/syncregistry", &api.InternalAPI{}, "post:SyncRegistry")
    beego.Router("/api/internal/renameadmin", &api.InternalAPI{}, "post:RenameAdmin")
    beego.Router("/api/internal/configurations", &api.ConfigAPI{}, "get:GetInternalConfig")

    // external service that hosted on harbor process:
    beego.Router("/service/notifications", &registry.NotificationHandler{})
    beego.Router("/service/notifications/clair", &clair.Handler{}, "post:Handle")
    beego.Router("/service/notifications/jobs/scan/:id([0-9]+)", &jobs.Handler{}, "post:HandleScan")
    beego.Router("/service/notifications/jobs/replication/:id([0-9]+)", &jobs.Handler{}, "post:HandleReplication")
    beego.Router("/service/notifications/jobs/adminjob/:id([0-9]+)", &admin.Handler{}, "post:HandleAdminJob")
    beego.Router("/service/token", &token.Handler{})

    beego.Router("/v2/*", &controllers.RegistryProxy{}, "*:Handle")

    // APIs for chart repository
    if config.WithChartMuseum() {
        // Charts are controlled under projects
        chartRepositoryAPIType := &api.ChartRepositoryAPI{}
        beego.Router("/api/chartrepo/health", chartRepositoryAPIType, "get:GetHealthStatus")
        beego.Router("/api/chartrepo/:repo/charts", chartRepositoryAPIType, "get:ListCharts")
        beego.Router("/api/chartrepo/:repo/charts/:name", chartRepositoryAPIType, "get:ListChartVersions")
        beego.Router("/api/chartrepo/:repo/charts/:name", chartRepositoryAPIType, "delete:DeleteChart")
        beego.Router("/api/chartrepo/:repo/charts/:name/:version", chartRepositoryAPIType, "get:GetChartVersion")
        beego.Router("/api/chartrepo/:repo/charts/:name/:version", chartRepositoryAPIType, "delete:DeleteChartVersion")
        beego.Router("/api/chartrepo/:repo/charts", chartRepositoryAPIType, "post:UploadChartVersion")
        beego.Router("/api/chartrepo/:repo/prov", chartRepositoryAPIType, "post:UploadChartProvFile")
        beego.Router("/api/chartrepo/charts", chartRepositoryAPIType, "post:UploadChartVersion")

        // Repository services
        beego.Router("/chartrepo/:repo/index.yaml", chartRepositoryAPIType, "get:GetIndexByRepo")
        beego.Router("/chartrepo/index.yaml", chartRepositoryAPIType, "get:GetIndex")
        beego.Router("/chartrepo/:repo/charts/:filename", chartRepositoryAPIType, "get:DownloadChart")

        // Labels for chart
        chartLabelAPIType := &api.ChartLabelAPI{}
        beego.Router("/api/chartrepo/:repo/charts/:name/:version/labels", chartLabelAPIType, "get:GetLabels;post:MarkLabel")
        beego.Router("/api/chartrepo/:repo/charts/:name/:version/labels/:id([0-9]+)", chartLabelAPIType, "delete:RemoveLabel")
    }

    // Error pages
    beego.ErrorController(&controllers.ErrorController{})

}
```

上面这个文件里面就定义了 Harbor 核心的一些 API，其中如果`!config.WithAdmiral()`为真，则定义的一些用登录相关接口就会生效，Admiral 是 Vmware 的一个容器管理平台，如果我们在配置文件中定义了参数`admiral_url`，那么 Harbor 就会和 Admiral 进行交互，如果没有配置这个参数，那么就会去和我们定义的 login 相关接口进行交互了。我们这里简单介绍一下主要的接口，第一个登录接口`post:Login`：
```golang
// Login handles login request from UI.
func (cc *CommonController) Login() {
    principal := cc.GetString("principal")
    password := cc.GetString("password")

    user, err := auth.Login(models.AuthModel{
        Principal: principal,
        Password:  password,
    })
    if err != nil {
        log.Errorf("Error occurred in UserLogin: %v", err)
        cc.CustomAbort(http.StatusUnauthorized, "")
    }

    if user == nil {
        cc.CustomAbort(http.StatusUnauthorized, "")
    }
    cc.SetSession("user", *user)
}
```

根据请求获取用户名和密码，然后调用`auth.Login`方法进行登录校验，方法位于文件`src/core/auth/authenticator.go`下：
```golang
// Login authenticates user credentials based on setting.
func Login(m models.AuthModel) (*models.User, error) {

    authMode, err := config.AuthMode()
    if err != nil {
        return nil, err
    }
    if authMode == "" || dao.IsSuperUser(m.Principal) {
        authMode = common.DBAuth
    }
    log.Debug("Current AUTH_MODE is ", authMode)

    authenticator, ok := registry[authMode]
    if !ok {
        return nil, fmt.Errorf("Unrecognized auth_mode: %s", authMode)
    }
    if lock.IsLocked(m.Principal) {
        log.Debugf("%s is locked due to login failure, login failed", m.Principal)
        return nil, nil
    }
    user, err := authenticator.Authenticate(m)
    if err != nil {
        if _, ok = err.(ErrAuth); ok {
            log.Debugf("Login failed, locking %s, and sleep for %v", m.Principal, frozenTime)
            lock.Lock(m.Principal)
            time.Sleep(frozenTime)
        }
        return nil, err
    }
    err = authenticator.PostAuthenticate(user)
    return user, err
}
```

通过`authenticator.Authenticate`方法进行验证，这里就需要通过 authMode 来进行判断应该调用哪个认证方法
验证，该参数就是 Harbor 全局配置文件中的`auth_mode`参数，默认情况下`auth_mode=db_auth`，除此之外还可以设置成`ldap_auth`来通过提供一个`LDAP Server`进行用户认证，也可以设置成`uaa_auth`来通过 cloud foundry 的 id manager 来进行用户认证。比如如果使用数据库验证的话，那么校验方法就在文件`src/core/auth/db/db.go`中，方法如下：
```golang
// Authenticate calls dao to authenticate user.
func (d *Auth) Authenticate(m models.AuthModel) (*models.User, error) {
    u, err := dao.LoginByDb(m)
    if err != nil {
        return nil, err
    }
    if u == nil {
        return nil, auth.NewErrAuth("Invalid credentials")
    }
    return u, nil
}
```

进入`LoginByDb`方法，位于`src/common/dao/user.go`文件：
```yaml
// LoginByDb is used for user to login with database auth mode.
func LoginByDb(auth models.AuthModel) (*models.User, error) {
    o := GetOrmer()

    var users []models.User
    n, err := o.Raw(`select * from harbor_user where (username = ? or email = ?) and deleted = false`,
        auth.Principal, auth.Principal).QueryRows(&users)
    if err != nil {
        return nil, err
    }
    if n == 0 {
        return nil, nil
    }

    user := users[0]

    if user.Password != utils.Encrypt(auth.Password, user.Salt) {
        return nil, nil
    }

    user.Password = "" // do not return the password

    return &user, nil
}
```

上面这段代码逻辑就很简单了，首先根据用户名获取用户，然后将密码加密进行比较，验证通过就将 user 对象返回，并保存到 session 里面，这个后面会用到。

其它的 API 操作类似，在此不再一一讲述，另外再和大家介绍一下镜像仓库的相关 API 操作，镜像操作相关 API 主要位于`/api/repositories`下面，请求处理方法主要位于文件`src/ui/api/repository.go`中，比如获取镜像分页列表数据：
```golang
func (ra *RepositoryAPI) Get() {
    projectID, err := ra.GetInt64("project_id")
    if err != nil || projectID <= 0 {
        ra.HandleBadRequest(fmt.Sprintf("invalid project_id %s", ra.GetString("project_id")))
        return
    }

    labelID, err := ra.GetInt64("label_id", 0)
    if err != nil {
        ra.HandleBadRequest(fmt.Sprintf("invalid label_id: %s", ra.GetString("label_id")))
        return
    }

    exist, err := ra.ProjectMgr.Exists(projectID)
    if err != nil {
        ra.ParseAndHandleError(fmt.Sprintf("failed to check the existence of project %d",
            projectID), err)
        return
    }

    if !exist {
        ra.HandleNotFound(fmt.Sprintf("project %d not found", projectID))
        return
    }

    if !ra.SecurityCtx.HasReadPerm(projectID) {
        if !ra.SecurityCtx.IsAuthenticated() {
            ra.HandleUnauthorized()
            return
        }
        ra.HandleForbidden(ra.SecurityCtx.GetUsername())
        return
    }

    query := &models.RepositoryQuery{
        ProjectIDs: []int64{projectID},
        Name:       ra.GetString("q"),
        LabelID:    labelID,
    }
    query.Page, query.Size = ra.GetPaginationParams()
    query.Sort = ra.GetString("sort")

    total, err := dao.GetTotalOfRepositories(query)
    if err != nil {
        ra.HandleInternalServerError(fmt.Sprintf("failed to get total of repositories of project %d: %v",
            projectID, err))
        return
    }

    repositories, err := getRepositories(query)
    if err != nil {
        ra.HandleInternalServerError(fmt.Sprintf("failed to get repository: %v", err))
        return
    }

    ra.SetPaginationHeader(total, query.Page, query.Size)
    ra.Data["json"] = repositories
    ra.ServeJSON()
}
```

上面的逻辑也相对比较简单，获取请求的参数，拼凑成一个 RepositoryQuery 对象，然后根据该对象去查询仓库列表数据，并支持分页返回，查询只是就是简单的操作数据库而已，其他操作也类似。不过我们仔细查看改文件中，并没有提供创建仓库的接口，这是因为创建 Repository 是在上传镜像的时候创建的，这里又回到 registry 的配置文件，里面有一段如下的配置：
```yaml
......
notifications:
  endpoints:
  - name: harbor
    disabled: false
    url: $core_url/service/notifications
......
```

其中配置的 url 就是仓库的一个回调 web hook 地址，在`pull`或者`push`镜像后就会触发该 hook 请求，比如 Harbor 这里就会去请求`/service/notifications`这个 url：
```golang
// Post handles POST request, and records audit log or refreshes cache based on event.
func (n *NotificationHandler) Post() {
    var notification models.Notification
    err := json.Unmarshal(n.Ctx.Input.CopyBody(1<<32), &notification)

    if err != nil {
        log.Errorf("failed to decode notification: %v", err)
        return
    }

    events, err := filterEvents(&notification)
    if err != nil {
        log.Errorf("failed to filter events: %v", err)
        return
    }

    for _, event := range events {
        repository := event.Target.Repository
        project, _ := utils.ParseRepository(repository)
        tag := event.Target.Tag
        action := event.Action

        user := event.Actor.Name
        if len(user) == 0 {
            user = "anonymous"
        }

        pro, err := config.GlobalProjectMgr.Get(project)
        if err != nil {
            log.Errorf("failed to get project by name %s: %v", project, err)
            return
        }
        if pro == nil {
            log.Warningf("project %s not found", project)
            continue
        }

        go func() {
            if err := dao.AddAccessLog(models.AccessLog{
                Username:  user,
                ProjectID: pro.ProjectID,
                RepoName:  repository,
                RepoTag:   tag,
                Operation: action,
                OpTime:    time.Now(),
            }); err != nil {
                log.Errorf("failed to add access log: %v", err)
            }
        }()

        if action == "push" {
            go func() {
                exist := dao.RepositoryExists(repository)
                if exist {
                    return
                }
                log.Debugf("Add repository %s into DB.", repository)
                repoRecord := models.RepoRecord{
                    Name:      repository,
                    ProjectID: pro.ProjectID,
                }
                if err := dao.AddRepository(repoRecord); err != nil {
                    log.Errorf("Error happens when adding repository: %v", err)
                }
            }()
            if !coreutils.WaitForManifestReady(repository, tag, 5) {
                log.Errorf("Manifest for image %s:%s is not ready, skip the follow up actions.", repository, tag)
                return
            }

            go func() {
                image := repository + ":" + tag
                err := notifier.Publish(topic.ReplicationEventTopicOnPush, rep_notification.OnPushNotification{
                    Image: image,
                })
                if err != nil {
                    log.Errorf("failed to publish on push topic for resource %s: %v", image, err)
                    return
                }
                log.Debugf("the on push topic for resource %s published", image)
            }()

            if autoScanEnabled(pro) {
                last, err := clairdao.GetLastUpdate()
                if err != nil {
                    log.Errorf("Failed to get last update from Clair DB, error: %v, the auto scan will be skipped.", err)
                } else if last == 0 {
                    log.Infof("The Vulnerability data is not ready in Clair DB, the auto scan will be skipped.", err)
                } else if err := coreutils.TriggerImageScan(repository, tag); err != nil {
                    log.Warningf("Failed to scan image, repository: %s, tag: %s, error: %v", repository, tag, err)
                }
            }
        }
        if action == "pull" {
            go func() {
                log.Debugf("Increase the repository %s pull count.", repository)
                if err := dao.IncreasePullCount(repository); err != nil {
                    log.Errorf("Error happens when increasing pull count: %v", repository)
                }
            }()
        }
    }
}
```

从上面代码中可以看到首先在 hook 中我们可以获取到当前操作的动作，如果是 push 操作，首先判断 repository 是否存在，如果不存在则创建，对于 pull 镜像操作通过 IncreasePullCount 更新数据库 pull 镜像次数：
```golang
// IncreasePullCount ...
func IncreasePullCount(name string) (err error) {
    o := GetOrmer()
    num, err := o.QueryTable("repository").Filter("name", name).Update(
        orm.Params{
            "pull_count":  orm.ColValue(orm.ColAdd, 1),
            "update_time": time.Now(),
        })
    if err != nil {
        return err
    }
    if num == 0 {
        return fmt.Errorf("Failed to increase repository pull count with name: %s", name)
    }
    return nil
}
```

除此之外，在路由文件中还可以看到`config.WithChartMuseum()`配置，如果在全局配置中配置了`with_chartmuseum=true`，则就会开启 Helm Chart 仓库所需要的 API，相关的请求处理方法位于文件`src/core/api/chart_repository.go`文件中。


除了上面的一些主要功能之外，Harbor 还有很多高级可能，感兴趣的同学可以下载 Harbor 的源码自行研究，当我们对源码比较熟悉之后，对于我们搭建 Harbor 显然是非常有帮助的，下节课给大家介绍怎样在 Kubernetes 集群中来搭建 Harbor。


### 推荐
给大家推荐一个本人精心打造的一个精品课程，现在限时优惠中：[从 Docker 到 Kubernetes 进阶](https://youdianzhishi.com/course/6n8xd6/)
[![从 Docker 到 Kubernetes 进阶](http://sdn.haimaxy.com/covers/2018/4/21/c4082e0f09c746aa848279a2567cffed.png)](https://youdianzhishi.com/course/6n8xd6/)

扫描下面的二维码(或微信搜索`k8s技术圈`)关注我们的微信公众帐号，在微信公众帐号中回复 **加群** 即可加入到我们的 kubernetes 讨论群里面共同学习。
![qrcode](/img/posts/qrcode_for_gh_d6dd87b6ceb4_430.jpg)



