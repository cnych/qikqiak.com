---
title: 深入体验全新 Cursor AI IDE 后，说杀疯了真不为过！
date: 2024-08-31
tags: ["AI", "Cursor"]
keywords: ["AI", "Cursor", "IDE", "Copilot"]
slug: cursor-ai-ide
gitcomment: true
category: "AI"
wechat: "ai"
---

[Cursor AI IDE](https://www.cursor.com/) 是一个基于 AI 的 IDE，它可以帮助你编写代码，支持多种编程语言，包括但不限于 Go、Python、JavaScript、TypeScript、Rust 等。之前在 ChatGPT 爆火的时候，Cursor 也跟着火了一把，不过当时很多人是为了薅羊毛，白嫖 GPT-4 的体验，所以并没有多少人是真正使用它，而且之前的版本体验并不好，经常卡顿，官方在意识到这个问题后，重新基于 Visual Studio Code 重新开发了新的版本，体验直接上升了一个档次。而近期因为知名大 V（Andrej Karpathy） 的宣传，Cursor 再次引爆了整个 AI 圈，最近他连发了几条推特夸赞 Cursor 的智能程度，说 Cursor 的体验已经碾压了 GitHub Copilot。我也重新下载了最新的版本，体验了一下，确实比之前好用了很多，非常惊艳，说完爆 GitHub Copilot 不为过。

![Cursor IDE](https://picdn.youdianzhishi.com/images/1725019761906.png)

<!--more-->

而 Cursor 体验大大增强的背后可以说是 Cursor 的一次“叛逃”，因为 Cursor 之前获得了 OpenAI 的投资，所以之前版本默认是基于 gpt 的模型进行开发的，而新版本默认基于 Claude 3.5 Sonnet 模型进行开发，所以说新版本更加智能本质上也是因为背后的 `Sonnet` 模型对于代码的编写能力非常强。

## 安装配置

Cursor 是 VS Code 的一个分支，继承了 VS Code 的所有基础功能和用户界面。Cursor 的开发团队会定期更新其使用的 VS Code 版本，以确保包括最新的 VS Code 功能和改进。这样，Cursor 用户不仅能享受到 VS Code 稳定的开发环境，还能体验到 Cursor 的 AI 功能优势。

### 安装

Cursor 的安装非常简单，只需要在 [Cursor 官网](https://www.cursor.com/) 下载对应系统的安装包，比如我这里是 Mac 系统，下载的包名为 `Cursor Mac Installer.zip`，可以直接解压这个压缩包，会得到一个 `Install Cursor` 的二进制文件，直接双击打开即可开始在线安装 Cursor。

![](https://picdn.youdianzhishi.com/images/1725020188792.png)

安装完成后，会自动打开 Cursor 的配置页面，如下所示：

![](https://picdn.youdianzhishi.com/images/1725020468551.png)

可以选择键盘快捷键的方式，默认为 VS Code，然后可以指定一个用于 AI 的非英文的语言，我们这里填写“中文”，另外还有一个比较重要的配置 `Codebase-wide`，如果开启的话则可以基于整个代码库进行问答，推荐开启。最后可以选择安装一个 `code` 或者 `cursor` 命令来启动 Cursor，我这里选择 `Install "cursor"`，配置完成后点击“Continue”即可。

如果之前我们已经在使用 VS Code，那么接下来我们可以选择导入现有 VS Code 的插件、配置、快捷键等，当然也可以选择不导入，如果想有之前 VS Code 一样的体验，推荐导入。

![VS Code 插件](https://picdn.youdianzhishi.com/images/1725020501824.png)

如果之前你有在使用 Github Copilot，同样也可以选择继续使用，但是会覆盖 Cursor Tab 了，这样也就失去了我们选择使用 Cursor 的意义了，所以这里我们选择不切换。

![](https://picdn.youdianzhishi.com/images/1725020639931.png)

最后我们可以决定是否开启隐私模式，开启隐私模式的话我们的提问和代码不会在任何第三方平台进行保留（OpenAI 会保留 30 天），所以大家如果对隐私比较看重的话开启该模式即可。

![](https://picdn.youdianzhishi.com/images/1725020785559.png)

最后选择登录或注册账户即可开始使用 Cursor 了，现阶段普通用户可以有 7 天的免费体验时间，如果大家不想付费的话，可以选择多注册账户，不过话说回来，这个 IDE 给我们带来的效率提升来看付费还是非常值得的，我已经将 Github Copilot 取消了，订阅了一年的 Cursor ～～～

![](https://picdn.youdianzhishi.com/images/1725021141305.png)

> 要订阅 Cursor 的，可以使用之前我们推荐用于 ChatGPT 订阅的 `WildCard`(`https://bewildcard.com/?code=YDZS`) 服务，支持支付宝付款，非常方便。

### 配置

打开 Cursor IDE 后同样有一个简单的欢 ß 迎界面，可以选择打开一个文件夹或者通过 SSH 打开。

![](https://picdn.youdianzhishi.com/images/1725021884211.png)

我们先点击 IDE 右上角的“设置”按钮，打开 Cursor 的设置页面。

![](https://picdn.youdianzhishi.com/images/1725022204280.png)

**通用配置**

在普通设置页面，可以进行账号管理、VS Code 导入等，这里我们重点关注下 `Rules for AI` 选项，可以设置 AI 回答的规则，这里我们设置的 `Always respond in 中文`，这样在和 AI 交互的时候，AI 就会使用中文进行回答了，当然还可以设置其他规则，这里设置的规则属于全局规则，会应用到所有和 AI 交互的场景中。仔细看下放还有一个 `Include .cursorrules file` 的选项，如果启用该选项，则我们可以在项目中创建 `.cursorrules` 文件，来指定更加详细的规则，比如我们可以指定某些文件或者文件夹不使用 AI 进行回答，使用什么技术栈等等，也就相当于为我们项目编写的一个 Prompt 提示词。

有爱好者做了一个 `https://cursor.directory/` 的网站，里面提供了很多项目的 `.cursorrules` 文件，我们可以直接复制下来使用。

![](https://picdn.youdianzhishi.com/images/1725022690445.png)

当然还有其他 IDE 设置，这些就和 VS Code 的设置是一样的方式，这里就不赘述了。

**模型配置**

接着可以切换到 `Models` 配置选项，在这里我们可以选择 Cursor 可以使用的模型，比如 `GPT-4o`、`GPT-4`、`Claude 3.5 Sonnet` 等。此外我们也可以直接配置 `OpenAI AIP Key` 或者 `Anthropic API Key` 来直接使用 OpenAI 或者 Anthropic 的模型，但是需要注意这样的话就不能使用 Cursor 定制的一些模型特性了，所以建议还是使用默认的模型。

![](https://picdn.youdianzhishi.com/images/1725022779568.png)

**特性配置**

然后接着就是 `Features` 配置选项，在这里我们可以配置 Cursor 的特性，比如 `Cursor Tab`、`Composer`、`Codebase indexing` 等。

首先看下 `Cursor Tab`，默认是开启的，这是 Github Copilot 的替代品，可以跨多行进行建议更改，以前称为 `Copilot++`，现在改名为 `Cursor Tab`。
![](https://picdn.youdianzhishi.com/images/1725075640834.png)

- `Partial Accepts`：允许用户使用 `editor.action.inlineSuggest.acceptNextWord` 快捷键接受建议的下一个单词。这种方式可以让用户更精细地控制接受自动完成或代码建议的过程，而不是一次性接受整个建议。
- `Cursor Prediction`：预测在接受 Cursor Tab 建议后你将移动到的下一行，可以通过 tab 键接受，允许你通过连续按 tab 键来完成编辑。
- `Trigger in Comments`：是否可以在注释中触发 Cursor Tab 建议。
- `Auto Import`：使用 Cursor Tab 导入必要的模块（目前仅支持 TypeScript）。

接着看下 `Composer` 的配置，`Composer` 是 Cursor 的另一个重要特性，这是 Cursor 首次推出的**多文件代码编辑**功能，可以使用 `Ctrl/Cmd + I` 快捷键来打开 `Composer` 面板。
![](https://picdn.youdianzhishi.com/images/1725075665103.png)

- `Always keep composer in bound`：这个选项的作用是确保 `Composer` 面板不会完全贴近屏幕边缘，而是保留一些间距，以提高可读性和使用体验。
- `Composer projects`：这个选项允许用户在不同的 `Composer` 实例之间创建和共享项目上下文，可能包括代码片段、配置或其他相关信息，以便更好地组织和管理多个相关的 `Composer` 任务或项目。
- `Cmd+P for file picker`：这个选项允许用户在 `Composer` 中使用 `Cmd+P` 快捷键来打开文件选择器，以便选择要编辑的文件。
- `Show suggested files`：这个选项允许用户在 `Composer` 中显示建议的文件，以便更好地组织和管理多个相关的 `Composer` 任务或项目。

接着一个比较重要的配置是 `Codebase indexing`，也就是代码库索引，通过嵌入模型的方式来提高整个代码库范围的智能提示能力，所有代码都存储在本地，不会上传到任何第三方平台，所以大家不用担心隐私问题。
![](https://picdn.youdianzhishi.com/images/1725076496559.png)

- `Index new folders by default`：这个配置选项允许用户控制 Cursor 是否自动为新打开的项目文件夹创建代码索引。启用后可以提高 AI 对整个代码库的理解和建议能力，但对于大型项目可能会消耗较多资源，超过 10000 个文件的文件夹不会自动索引。用户可以根据需要灵活开启或关闭此功能。
- `Ignore files`：这个配置选项允许用户指定一些文件或文件夹不进行索引，比如一些临时文件、日志文件、缓存文件等，我们可以将忽略的文件添加到 `.cursorignore` 文件中，这样这些文件就不会被索引了。
- `Git graph file relationships`：这个功能允许 Cursor 通过分析 Git 历史来更好地理解项目中文件之间的关联。这可以提高 AI 对整个代码库结构的理解，从而提供更准确的建议和智能提示。值得注意的是，虽然代码和提交信息保存在本地以保护隐私，但一些非敏感的元数据会上传到服务器，以便进行更高效的分析和处理。

然后接下来有一个 `Docs` 配置，我们可以添加问答让 Cursor 学习更多关于我们项目的知识，然后在 `chat` 或者 `edit` 中可以使用 `@Add` 来添加这些文档库进行问答。

![](https://picdn.youdianzhishi.com/images/1725076742554.png)

我们还可以对 `Chat` 功能进行配置，`Chat` 功能是 Cursor 的一个非常重要的特性，可以使用 `Ctrl/Cmd + L` 快捷键来打开 `Chat` 面板，然后在聊天界面中我们就可以和 AI 进行交互了。

![](https://picdn.youdianzhishi.com/images/1725085131378.png)

- `Always search the web`：这个选项允许用户在和 AI 交互的时候，可以搜索互联网，以获取最新的信息和答案。这和在每次交互时使用 `@web` 命令的效果是一样的。
- `Fade chat stream`：这个选项允许用户控制 AI 回答的显示方式。如果启用，AI 的回答不会立即完整显示,而是会以渐进的方式慢慢呈现出来,产生一种淡入的视觉效果。这种效果可以让用户有更多时间阅读和处理 AI 的回答,特别是对于较长的回复来说更有帮助。它可以提供一种更平滑和不那么突兀的阅读体验。
- `Default no context`：这个选项允许用户在默认情况下聊天时不包含任何上下文。这个设置适合那些希望得到更通用答案，或者不希望 AI 被之前的对话影响的用户。这意味着：

  - AI 在回答问题时不会考虑之前的对话历史或当前打开的文件内容。
  - 每次提问都会被视为独立的查询，不依赖于之前的交互。
  - 可能会提高 AI 的响应速度，因为它不需要处理额外的上下文信息。
  - 但也可能导致 AI 的回答不够准确或相关，因为它缺少了可能有用的背景信息。
  - 用户如果需要上下文，可以在每次提问时手动添加相关信息。

- `Narrow scrollbar`：这个选项允许用户在 AI 聊天界面中使用窄滚动条。使用窄滚动条可以节省屏幕空间，让聊天界面看起来更加整洁,同时仍然保留滚动功能，以提高可读性和使用体验。
- `Auto scroll chat`：这个选项允许用户在 AI 聊天界面中自动滚动到底部。启用后，当 AI 生成更多文本时，如果用户当前位于聊天底部，聊天界面会自动滚动以显示最新内容。这样可以提高用户的阅读体验，特别是在长对话或快速更新的情况下。
- `Show chat history`：是否在空聊天界面中显示聊天历史记录。
- `Show suggested files`：是否在聊天界面中显示建议的文件。

接下来就是 `Editor` 配置，这里可以配置一些编辑器的特性，比如 `Cursor`、`Line`、`Word` 等。

![](https://picdn.youdianzhishi.com/images/1725085994343.png)

- `Show chat/edit tooltip`：在编辑器中高亮代码附近显示 `chat/edit` 提示框。这可以让用户更方便地对特定代码段进行交互或编辑。
- `Auto parse inline edit links`：当在 `Ctrl/⌘ + K` 输入框中粘贴链接时，自动解析这些链接，这可能会提供额外的功能或信息，比如预览链接内容、提取相关信息等，从而提高编辑效率。
- `Auto select for Ctrl/⌘ + K`：自动选择代码区域进行内联编辑。这可以提高编辑效率，让用户更快地对特定代码块进行修改或查询。
- `Use themed diff backgrounds`：为内联差异使用主题的背景颜色。这个选项允许用户在查看代码差异时使用与当前 IDE 主题相匹配的背景颜色。启用此选项后，代码差异的显示将更加协调，与整体 IDE 界面风格保持一致，提高可读性和视觉体验。这对于经常需要比较和审查代码变更的开发者来说特别有用，可以让差异部分更加醒目，同时又不会显得突兀。
- `Use character-level diffs`：对内联差异使用字符级别的比较。这个选项允许用户在查看代码差异时，以字符为单位而不是以行为单位来显示变化。启用此功能后，代码差异的展示将更加精确，能够清晰地呈现每个字符的变动。这对于仔细审查和比对代码修改非常有帮助，特别是在需要识别细微变化的情况下。相比于行级差异，字符级差异能够提供更详细的修改信息，有助于开发者更准确地理解和评估代码的变更。

最后还有一个 `Terminal` 配置，这里可以配置一些终端的特性。
![](https://picdn.youdianzhishi.com/images/1725086248747.png)

- `Terminal hint`：在终端底部显示提示文本。这个选项允许在终端窗口底部显示一些提示信息。启用后，用户可以在终端底部看到一些有用的提示文本，比如当前工作目录、Git 分支信息、环境变量等。这些提示可以帮助用户更快地了解当前终端的状态和上下文，提高工作效率。对于经常需要在终端中切换目录或项目的开发者来说，这个功能特别有用，可以避免因忘记当前位置而导致的错误操作。
- `Show terminal hover hint`：在终端中显示类似 `Add to chat` 的提示。启用后，当用户将鼠标悬停在终端的某些元素上时，会出现一些有用的提示，比如 `Add to chat` 或者`Add to composer`。这些提示可以帮助用户更方便地与终端内容进行交互，该功能可以提高终端使用的效率，让用户更容易地将终端操作与 Cursor 的 AI 功能结合起来。

**Beta 功能**

最后一项 Cursor 是一些处于 `Beta` 状态的功能，目前有两个功能 `LONG CONTEXT CHAT` 和 `AI PREVIEW`，这两个功能都是处于 `Beta` 状态，所以可能会有一些不稳定的情况，默认禁用，如果大家想要体验这些功能的话，可以手动开启。

![](https://picdn.youdianzhishi.com/images/1725086780949.png)

- `LONG CONTEXT CHAT (Beta)`：这个功能允许用户在聊天中使用更长的上下文，从而提高 AI 的回答准确性和相关性。它具有以下特点：
  - 利用 Claude 模型的大规模上下文处理能力，可以处理多达 20 万个 token 的内容。
  - 用户可以通过 `@` 的方式将整个文件夹的内容添加到聊天中，使 AI 能够理解更广泛的项目背景。
  - 提供更强大的代码库聊天功能，可以更全面地理解和分析整个代码库，但由于处理的信息量更大，响应速度可能会相对较慢。
  - 这个功能特别适合需要 AI 理解大量上下文信息的场景，如复杂项目的代码审查、大型文档的分析等。
- `AI PREVIEW (ALPHA)`：该功能使用 GPT-4 扫描当前的 git diff 或 PR 来查找错误。使用时需要谨慎，不应完全依赖它来进行 bug 检测。

## 使用

上面我们根据自己的需求配置好了 Cursor IDE，接下来我们就可以开始使用 Cursor IDE 了。由于 Cursor 的功能非常强大，下面我们就以一个简单的示例来演示下如何使用 Cursor IDE。

这里我们使用 `nextjs` 来开发一个简单的在线课程网站，首先我们使用 `create-next-app` 来初始化一个 nextjs 项目，这里我们命名为 `techedu`。

```bash
$ npx create-next-app@latest techedu
✔ Would you like to use TypeScript? … No / Yes
✔ Would you like to use ESLint? … No / Yes
✔ Would you like to use Tailwind CSS? … No / Yes
✔ Would you like to use `src/` directory? … No / Yes
✔ Would you like to use App Router? (recommended) … No / Yes
✔ Would you like to customize the default import alias (@/*)? … No / Yes
✔ What import alias would you like configured? … @/*
Creating a new Next.js app in /Users/cnych/Documents/learn/个人笔记/微信文章/techedu.

Using npm.

Initializing project with template: app-tw


Installing dependencies:
- react
- react-dom
- next

Installing devDependencies:
- typescript
- @types/node
- @types/react
- @types/react-dom
- postcss
- tailwindcss
- eslint
- eslint-config-next

added 363 packages, and audited 364 packages in 28s

136 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Initialized a git repository.

Success! Created techedu at /Users/cnych/Documents/learn/个人笔记/微信文章/techedu
```

项目初始化完成后，我们就可以使用 Cursor 来打开这个项目了，可以直接在命令行中输入 `cursor techedu` 来打开项目，或者在 Cursor IDE 中选择 `Open Folder` 来打开项目。

![](https://picdn.youdianzhishi.com/images/1725087463166.png)

打开后我们可以在 Cursor 的终端中运行命令 `npm run dev` 来启动项目，启动完成我们可以在浏览器中通过 `http://localhost:3000` 来访问项目。

![](https://picdn.youdianzhishi.com/images/1725087553525.png)

上图是默认的首页内容。我们可以先将 `app/page.tsx` 文件中的内容清空，也就是首页内容清空。然后我们可以在 `app/page.tsx` 文件中选中所有代码，然后使用快捷键 `⌘ + k` 来打开 `Edit` 面板，然后我们就可以开始和 AI 进行交互了。

![](https://picdn.youdianzhishi.com/images/1725091194625.png)

然后我们只需要输入我们想要实现的功能，AI 就会自动帮我们实现这个功能，比如我们这里想要实现一个 landingpage 的页面，我们只需要在 `Edit` 面板中输入我们的需求，然后点击 `Submit Edit` 按钮，AI 就会开始帮我们实现这个功能。

![](https://picdn.youdianzhishi.com/images/1725091347580.png)

这个时候其实我们就可以直接去浏览器中预览效果了，如下图所示：

![](https://picdn.youdianzhishi.com/images/1725091413373.png)

如果效果基本满意，我们就可以点击 `Accept` 按钮，这样代码就生效了。然后我们还可以继续微调，比如让其支持响应式布局，同样选中所有代码，然后使用快捷键 `⌘ + k` 来打开 `Edit` 面板，在面板中输入我们的需求：

![](https://picdn.youdianzhishi.com/images/1725091582827.png)

点击 `Submit Edit` 按钮，同样 AI 就会开始修改我们的代码，修改的代码和之前的代码之间会用不同的背景颜色进行区分，这样我们可以很方便的看到修改的内容。

![](https://picdn.youdianzhishi.com/images/1725091657620.png)

同样现在可以预览效果了，如下图所示：

![](https://picdn.youdianzhishi.com/images/1725091742903.png)

现在移动端效果也实现了，我们就可以点击 `Accept` 按钮接受这部分代码，但还需要继续微调，比如 Header 部分，当页面不足以显示的时候，希望在 Header 右侧加一个 `menu` 按钮，当点击 `menu` 按钮的时候，再显示一个侧边栏，在这个侧边栏中包含这些链接。这个时候我们可以只需要选中 `header` 部分的代码，然后使用快捷键 `⌘ + k` 来打开 `Edit` 面板，在面板中输入我们的需求：

![](https://picdn.youdianzhishi.com/images/1725092003656.png)

同样继续点击 `Submit Edit` 按钮，然 AI 帮我们实现该功能，如下图所示：

![](https://picdn.youdianzhishi.com/images/1725092082962.png)

这个时候我们可以看到我们的代码出现了错误，因为这部分代码中用到了一个为定义的变量 `menuOpen`，我们可以先接受这部分代码，然后将鼠标放到 `menuOpen` 变量上，这个时候就会有该错误的相关提示和修复方法。

![](https://picdn.youdianzhishi.com/images/1725092161054.png)

我们可以点击 `AI Fix In Chat` 按钮来打开 `Chat` 面板，在 `Chat` 面板中我们可以看到 AI 帮我们生成的修复方法。

![](https://picdn.youdianzhishi.com/images/1725092678466.png)

我们可以 Review 下这部分代码，如果没问题的话，点击 `Apply` 按钮，就会把这部分代码应用到我们的项目中，但是还需要点击 `Accept` 按钮接受这部分代码。当然我们也通过 `edit` 来修复。最后修复完成的效果如下图所示：

![](https://picdn.youdianzhishi.com/images/1725094193802.png)

然后我们再来微调精选课程这部分内容，比如我们希望加一些标签，多加一个元素来展示：

![](https://picdn.youdianzhishi.com/images/1725094463943.png)

如果微调预览效果不佳我们还可以在 `edit` 面板中继续当前这次编辑，在 `Follow-up instructions` 中继续输入我们的需求，然后点击 `Submit Edit` 按钮，AI 就会继续帮我们实现这个功能。

![](https://picdn.youdianzhishi.com/images/1725094830107.png)

我们还可以让 AI 通过一个课程列表来渲染课程卡片，不用直接在代码中写死，同样在 `edit` 面板中输入我们的需求进行微调即可。最后我们暂时微调后的效果如下所示：

![](https://picdn.youdianzhishi.com/images/1725099715257.png)

到这里我们现在说涉及到的操作都是在一个文件里面了，如果我们想要在多个文件之间进行修改，这个时候我们可以使用 `Composer` 功能，比如现在我们的 Logo 是写死在页面中的，这样使用其他非常不方便，正常的方法是封装一个 Logo 的组件，然后引入到页面中来，这里我们可以使用 `Composer` 功能来实现。

可以在 `page.tsx` 文件中使用快捷键 `Ctrl/Cmd + I` 来打开 `Composer` 面板，也可以使用 `Ctrl/Cmd + Shift + I` 快捷键来展开 `Composer` 面板。

![](https://picdn.youdianzhishi.com/images/1725100462194.png)

然后我们需要将要操作的相关文件添加到 `Composer` 中来，我们这里可以看到已经默认将当前的 `page.tsx` 文件添加到 `Composer` 中来了，由于我们的需求是将 Logo 封装成新的组件，也就是会去创建一个新的文件，所以这里我们不需要添加其他文件进来了，只需要在 `Composer` 中输入我们的指令即可，如下图所示：

![](https://picdn.youdianzhishi.com/images/1725100737336.png)

可以看到当 `Composer` 执行我们的指令的时候，首先就会自动帮我们生成一个 `Logo` 组件的目录和文件，然后我们就可以在 `page.tsx` 文件中导入这个组件，对生成的代码预览后如果没问题，我们可以点击右下角的 `Accept all` 按钮，这样代码就生效了。如果我们涉及到更多的文件，只需要将这些文件加入到 `Composer` 中来即可。

比如现在我们想要为我们的网站增加一个暗黑模式，因为该功能涉及到多个文件，比如需要增加一个切换主题的组件，需要修改现有页面的样式，可能还会修改 Tailwind 的配置文件，所以这个时候使用 `Composer` 功能最方便。同样使用快捷键 `Ctrl/Cmd + Shift + I` 打开 `Composer` 面板，然后将 `page.tsx`、`tailwind.config.js`、`Logo.tsx`、`global.css` 这些文件添加到 `Composer` 中来，然后我们就可以在 `Composer` 中输入我们的需求**让整个网页支持暗黑模式，请在首页的 header 部分添加一个切换主题的入口**，提交后 `Composer` 就会自动帮我们完成这些操作。

![](https://picdn.youdianzhishi.com/images/1725104960427.png)

可以看到 Cursor 首先帮我们修改了首页的样式，然后创建了一个 `ThemeToggle` 组件，最后还修改了 `tailwind.config.js` 文件以支持暗黑模式，这样我们就实现了一个暗黑模式的功能。预览过后如果没问题，我们就可以点击 `Accept all` 按钮，这样代码就生效了。

最后对于 `chat` 的使用，还有更强大的功能，使用 `ctrl/cmd + l` 快捷键可以打开 `chat` 面板，我们可以切换不同的模型，使用快捷键 `ctrl/cmd + /` 可以快速切换这些模型。

![](https://picdn.youdianzhishi.com/images/1725101444782.png)

然后还可以使用 `@` 前缀来添加一些文件、文件夹、代码、Web 搜索、文档、Git 甚至整个代码库来作为上下文，这样 AI 就可以更好的理解我们的需求。

![](https://picdn.youdianzhishi.com/images/1725101521643.png)

如果选择使用 `Codebase` 作为上下文，也就是整个代码库，这需要对整个代码库进行索引，然后我们就可以在 `chat` 中直接提问，比如我们这里想问下 `page.tsx` 文件中有什么问题，我们可以直接在 `chat` 中提问，AI 就会回答我们。

![](https://picdn.youdianzhishi.com/images/1725101788713.png)

这些都是 Cursor 的一些强大功能，当然除了 `chat`、`edit`、`composer` 之外，当我们在编写文档或者代码的时候，Cursor 还可以为我们自动提示，只需要使用 `tab` 键就可以快速获得建议的内容。

最后如果项目中有不希望被索引的文件，我们可以使用 `.cursorignore` 文件来忽略这些文件，这样这些文件就不会被索引了。另外如果你觉得你的 Cursor 不够智能，除了可以通过 `@web` 命令来搜索互联网之外，我们还可以创建一个 `.cursorrules` 文件来告诉 Cursor 一些规则，这些规则我们参考 `https://cursor.directory/` 这个网站，里面有很多的规则，我们可以根据我们的需求来选择合适的规则。

最后我们就用 Cursor 快速的开发了一个适配移动端并支持暗黑模式的在线课程网站，效果如下图所示，当然我们还可以继续优化，增加更多的功能，或者使用更好的设计，同样还可以使用 Cursor 继续开发对应的后端应用。

![](https://picdn.youdianzhishi.com/images/1725105097503.png)

## 总结

我们前面为大家编写的这个简单网页，全程没有收到编写任何代码（除了一些初始化操作之外，事实上这也可以交给 AI 来完成），都是通过 Cursor 的 `chat`、`edit`、`composer` 等功能来实现的，虽然这个示例非常简单，但是大家可以看到，使用 Cursor 我们完全可以实现一个非常复杂的项目，基本上以**白话文**的方式为主就可以完成对项目的编写，当然这是否就意味着我们不需要学习了，答案当然不是，因为这些工具也只是辅助我们进行开发的工具，并不能完全替代我们，AI 生成的代码不一定能满足我们的需求，我们很可能还需要对项目进行进一步的优化和调整，所以会编程是前提，不然做出来的项目只是一些很小的 Demo。
