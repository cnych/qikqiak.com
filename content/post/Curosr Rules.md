---
title: 一文搞懂如何在 Cursor 新版本(0.45+)中使用规则
date: 2025-02-23
tags: ["Cursor", "AI"]
keywords: ["cursor", "ai", "ide", "cursor rules", "cursor 规则"]
slug: cursor-rules-guide
gitcomment: true
notoc: true
category: "AI"
wechat: "ai"
---

[![Cursor Rules](https://picdn.youdianzhishi.com/images/1740276347381.png)](https://fastclass.cn)

当我们在使用 [Cursor](/tags/cursor/) 来编写代码的时候，Cursor 规则可以说是最重要的，这个规则直接影响我们编写代码的质量。Cursor 规则是用户提供的一组指导说明，用来帮助 AI  更好地理解和处理代码库，这些规则可以包含特定的代码处理要求、项目规范或者其他重要信息，所以说其非常非常重要。

<!--more-->

**主要用途:**

- 提供项目上下文
- 设置编码风格指南
- 说明常用方法和框架的使用规范
- 自定义 AI 响应的行为方式

**使用建议:**

- 推荐使用 Markdown 格式来编写 Cursor 规则文件，避免使用 JSON 格式，因为测试显示效果较差。
- 定期更新规则以适应项目发展
- 可以让 AI 自己扫描代码库来生成或更新规则
- 建议包含项目特定的框架、库和编码约定

## 理解 Cursor 规则

在工作中我和同事们经常会忘记在下班之前检查办公室，所以我们制定了一套规则程序来确保每次离开之前都可以逐一检查。这其实基本上就相当于 Cursor AI 中的规则的工作方式。

![](https://picdn.youdianzhishi.com/images/1740229054593.png)

Cursor 中的规则文件就是你的 AI 编码助手的一份指南，它告诉 AI 如何来为你的项目编写代码，包括你使用的工具以及他们之间上如何进行组织的，这有助于 Cursor 创建更好、更准确的代码。

## 如何在 Cursor 中定义规则

在 `v0.45` 版本之前 Cursor 使用一个名为 `.cursorrule` 的文件来定义一个全局的规则，之前我们介绍的网站 [https://cursor.directory/rules](https://cursor.directory/rules) 上面就收录了非常多的 Cursor 规则文件，我们可以根据自己的需求获取然后粘贴到项目根目录下面的 `.cursorrule` 文件中即可，这样以后 Cursor 都会根据我们定义的规则来编写代码。

![](https://picdn.youdianzhishi.com/images/1740226532234.png)

但从 `v0.45` 版本开始，以前的 `.cursorrule` 文件被官方弃用了，其实也能理解，之前我们需要将所有规则放在一个单一的 `.cursorrules` 文件中，比如 `typescript`、`db`、`UI` 等所有内容都在一个地方，这显然缺乏灵活性，有的时候 Cursor Agent 不知道应该使用哪些规则，而且你也无法具体说明，这实际上只是用不必要的一些信息来填满了你的上下文窗口而已，只是白白的浪费了很多 Token，所以之前很多时候我并不喜欢使用 `Agent` 模式，还是喜欢使用普通模式，这样我可以只在 `.cursorrules` 里面放一些全局通用的规则，然后自己再创建一个 `prompts` 的目录，在里面分别写一些特殊的规则文件，比如 `db.md`、`ui.md`，然后需要用到哪个规则的时候，再用 `@` 的方式选择具体的规则文件，这种方式确实更加灵活了，但也比较累，需要自己明白现在应该使用什么规则来编写代码。

而 `v0.45` 版本开始 Cursor 定义了新的规则方式，在 `.cursor/rules` 目录中具有 `.mdc` 扩展名的特殊文件（是 `MarkdownCursor` 的缩写？），这个文件基本就是 Markdown 格式，这样其实和我们之前手动控制的方式非常类似了，只是现在是规定需要在 `.cursor` 目录中的 `.mdc` 文件中来定义规则，当我们项目越来越复杂后，可能我们希望为 `.ts` 文件、`.tsx` 文件、`.md` 文件等，甚至整个子文件夹来设置特定的规则，这样我们就可以分别来管理不同的规则了，而且最重要的是当我们在 `Agent` 模式下的时候，Cursor 可以自动为我们应用特定的规则文件。

此外在 Cursor 配置页面我们可以在 `Rules for AI` 中配置整个 IDE 范围的规则，也可以在这里点击创建项目范围内的规则文件。（`.cursorrules` 被废弃了，但是在 `v0.45` 版本还可以使用，后续版本预计会移除）

![](https://picdn.youdianzhishi.com/images/1740231596460.png)

要添加规则文件很简单，我们可以手动创建 `.cursor/rules` 目录，然后手动在该目录下面创建 `xx.mdc` 文件即可，打开这个文件后会出现如下图所示的视图：

![](https://picdn.youdianzhishi.com/images/1740227690248.png)

其中有 3 个主要部分：

- **Description**：描述规则的，Agent 会基于该描述来选择该规则
- **Globs**：指定文件模式（比如 `.tsx`）时，该规则将自动应用于与该模型匹配的文件的 AI 响应中
- **Content**：核心内容区域，编写具体的规则，可以用 Markdown 语法格式，此外我们也可以使用 `@` 来指定文件

现在我们就可以将规则分离成很多更小的规则文件了。
![rules 目录](https://picdn.youdianzhishi.com/images/1740230247083.png)

## 引导 Agent

更重要的是，使用 `.cursor/rules` 目录这种方式我们还可以构建一个完全自主控制的 Agent，当然首先我们需要在 Cursor 中启用 Agent 模式，然后只需要中规则文件中描述清楚应该处理哪个脚本或文档即可。在 Agent 模式下面，我们是在告诉 Agent 如何来操作，而不仅仅只是把规则列出来。

![](https://picdn.youdianzhishi.com/images/1740230754899.png)

当然即使我们不使用这种方式，Cursor Agent 也可以自动选择匹配的规则来应用。如下图所示：

![](https://picdn.youdianzhishi.com/images/1740230947448.png)

我们添加了一个本地搜索的规则文件，然后在 Agent 模式下面，我们只需要提到 `Local Search`，Agent 就会自动为我们应用对应的这个规则来执行操作，足见 Agent 语意理解能力是非常强大的，这样我们就可以做很多扩展操作了。

## 参考链接

- https://www.instructa.ai/en/blog/how-to-use-cursor-rules-in-version-0-45
- https://cursor.directory/
- https://forum.cursor.com/t/good-examples-of-cursorrules-file/4346

> 想要通过 Cursor IDE 快速构建应用吗？立即扫描下方二维码添加我的微信，获取全新的 [AI 全栈开发课程](https://fastclass.cn)。
> ![](https://sdn.youdianzhishi.com/images/2023/3/3/191aed05f51b41b485a2549ac997533b.png)
