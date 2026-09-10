# QQ 邮箱 MCP (@ethanli666/qqmail-mcp)

[English](README.md) | 简体中文

让你的 AI 助手（Claude Desktop、Cursor、Google Antigravity 等）能够直接帮你查收邮件、阅读正文、搜索信息、下载附件和安全发信。

无需配置复杂的邮箱账号密码或 IMAP 授权码，拿出手机 QQ 扫一扫二维码，即可在 2 分钟内轻松搞定！

---

## 什么是 QQ 邮箱 MCP？

简单来说，**这是一个连接你的 AI 客户端与 QQ 邮箱的桥梁插件**。

腾讯官方现已开放了官方 QQ 邮箱的 AI 接口。但在实际使用时，我们日常使用的本地 AI 客户端（例如 Claude Desktop、Cursor、Antigravity 等）无法直接与腾讯的网页接口对接，还会遇到协议版本不匹配和权限拦截。

本项目就是为了解决这些麻烦而设计的傻瓜式中继工具：
- **真正零密码**：无需寻找和输入繁琐的 IMAP 授权码，直接通过腾讯官方 OAuth 网页扫码登录，本地绝不保存任何明文密码。
- **一次扫码，永久免登**：首次扫码后，授权凭据会自动安全缓存在你电脑的本地目录，后续每次启动 AI 客户端都会静默复用，再也不用反复扫码。
- **防误发误删安全护栏**：AI 想要发送邮件、删除邮件或清空垃圾箱时，界面会自动弹出确认卡片。只有你亲自核对并点击允许，AI 才能真正执行，彻底杜绝 AI 幻觉乱发乱删。
- **全功能官方支持**：完整透传腾讯官方 12 项邮件工具，查未读、读全文、关键词搜索、下载附件、发信回信一应俱全。

---

## 3 步傻瓜式使用指南

只需跟着下面 3 个步骤，2 分钟内即可配好用上。

### 第 1 步：把配置填入你的 AI 客户端

找到你正在使用的 AI 软件，把下方的配置信息填入即可。

#### 常用客户端 A：Claude Desktop
打开配置文件所在位置：
- **Mac 电脑**：打开访达，按快捷键 `Cmd + Shift + G`，输入：
  `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows 电脑**：按键盘 `Win + R`，输入并回车：
  `%APPDATA%\Claude\claude_desktop_config.json`

在文件中的 `mcpServers` 节点下粘贴：
```json
{
  "mcpServers": {
    "qq-mail": {
      "command": "npx",
      "args": ["-y", "@ethanli666/qqmail-mcp@latest"]
    }
  }
}
```

#### 常用客户端 B：Cursor / Antigravity / 其他 Stdio 工具
在客户端的 MCP 设置面板中添加：
- **Name**: `qq-mail`
- **Command**: `npx`
- **Args**: `-y @ethanli666/qqmail-mcp@latest`

> 小技巧：你也可以在电脑终端运行 `npx -y @ethanli666/qqmail-mcp --print-config` 查看标准配置内容。

---

### 第 2 步：手机 QQ 扫码授权（仅需一次）

配置完成后，首次使用只需扫码一次：

1. **触发授权（二选一）**：
   - **方式一（推荐）**：打开电脑终端（Terminal 或命令提示符），直接运行：
     ```bash
     npx -y @ethanli666/qqmail-mcp
     ```
   - **方式二**：直接打开你的 AI 客户端（如 Claude Desktop），在对话框里给 AI 发一条消息（例如：“帮我看一下邮件”）。
2. **电脑自动弹开浏览器**：
   - 电脑会自动调起你的默认浏览器，打开腾讯官方的安全登录页面（使用本地监听端口 `39300`）。
   - 如果浏览器没有自动弹出，终端或客户端日志里会打印一串授权链接，复制到浏览器打开即可。
3. **打开手机 QQ 扫一扫**：
   - 电脑网页上会显示“QQ 邮箱 Agent 授权登录”的二维码。
   - 拿出手机打开 **手机 QQ**，点击右上角“+”号选择“扫一扫”，扫描电脑屏幕上的二维码（也可以在页面直接登录你的 QQ 账号）。
   - 手机上勾选授权范围，点击**确认授权**。
4. **授权完成**：
   - 网页提示“授权成功，请返回客户端”后，直接关掉网页即可。
   - 授权文件已自动保存在本地 `~/.qqmail-mcp/` 目录中。
   - **后续完全免扫码**：下次启动客户端或与 AI 聊天，程序会自动使用本地凭据，无需再掏出手机扫码。

---

### 第 3 步：直接跟 AI 说话使用

授权完成后，你现在可以像日常找助理一样，用自然语言向 AI 提要求：

```markdown
- "帮我查看收件箱最近 5 封未读邮件"
- "搜索上周来自 GitHub 的通知邮件，并总结重点内容"
- "下载最新那封发票邮件里的 PDF 附件"
- "起草一封回信给张三（zhangsan@example.com），确认明天下午两点参加会议"
```

> 💡 **防误发提示**：当 AI 执行回复、发信、删除等写操作时，界面会自动弹出一个交互确认卡片（展示收件人、标题等）。只有你在卡片上点击允许，邮件才会发出；若你点击拒绝或 5 分钟未操作，本次操作会自动取消，安全有保障！

---

## 进阶：系统架构与原理解析

对于希望了解底层原理的开发者，中继内部结构如下：

![QQ Mail MCP 架构](docs/assets/architecture.svg)

- **透明协议转写**：将客户端发来的旧版协议（如 `2024-11-05`、`2025-11-25`）自动转换为腾讯官方支持的 `2025-03-26`。
- **准入身份智能轮转**：依次按 `Codex` -> `Claude` -> `WorkBuddy` 探测腾讯 OAuth 准入，并自动保存可用客户端名称。
- **两阶段安全拦截**：捕获腾讯官方对写操作返回的 `42801` 挑战与 `confirmation_token`，转为 MCP 标准 `elicitation/create` 交互弹窗由用户审批。

---

## 官方功能与工具列表

腾讯官方服务当前提供 12 项完整的邮件管理工具（建议会话开始时优先调用 `GetMe` 获取基础信息）：

| 工具名称 | 操作类型 | 功能说明 |
| --- | --- | --- |
| `GetMe` | 读操作 | 获取当前授权邮箱的别名列表、权限范围与额度限制（建议会话启动优先调用） |
| `ListMessages` | 读操作 | 获取邮件列表，支持收件箱、已发送、草稿箱、垃圾箱等分类过滤 |
| `GetMessage` | 读操作 | 获取单封邮件的完整正文内容（HTML/纯文本）及详细元数据 |
| `SearchMessages` | 读操作 | 按关键词、发件人、收件人、时间日期和文件夹进行多条件复合搜索 |
| `ListAttachments` | 读操作 | 查看指定邮件所包含的附件列表与大小规格 |
| `DownloadAttachment` | 读操作 | 下载邮件附件的 Base64 编码数据 |
| `SendMessage` | 写操作 | 编写并发送新邮件（需用户在弹窗中二次确认） |
| `ReplyMessage` | 写操作 | 回复指定邮件（需用户在弹窗中二次确认） |
| `ForwardMessage` | 写操作 | 转发指定邮件到其他收件人（需用户在弹窗中二次确认） |
| `DeleteMessage` | 写操作 | 将邮件移至垃圾箱（需用户在弹窗中二次确认） |
| `PermanentDeleteMessage` | 写操作 | 彻底物理删除邮件，不可恢复（需用户在弹窗中二次确认） |
| `ClearTrash` | 写操作 | 清空整个垃圾箱（需用户在弹窗中二次确认） |

> 所有工具的定义和参数均在运行时由腾讯云端动态下发，本包不改动任何官方工具定义。

---

## 环境变量配置（可选）

绝大多数用户使用默认设置即可。如有特殊网络或多账号需求，可配置环境变量：

| 环境变量 | 默认值 | 作用说明 |
| --- | --- | --- |
| `QQMAIL_OAUTH_CLIENT_NAME` | 自动探测 | 强制指定腾讯 OAuth 准入的客户端名称（可选：`Codex`、`Claude`、`WorkBuddy`） |
| `QQMAIL_OAUTH_CALLBACK_PORT` | `39300` | 指定本地 OAuth 网页重定向端口，遇端口冲突时可更改（如 `8080`） |
| `MCP_REMOTE_CONFIG_DIR` | `~/.qqmail-mcp` | 自定义本地 OAuth 凭据保存路径 |

---

## 原生 Remote 客户端直连（可选）

若你的客户端原生支持 Streamable HTTP 远程端点与 OAuth 认证，也可以直接接入腾讯官方：

- **Codex CLI**:
  ```bash
  codex mcp add qqmail --url https://api.mail.qq.com/mcp
  codex mcp login qqmail --scopes alias:read,mail:read,mail:send,mail:delete
  ```
- **Claude Code**:
  ```bash
  claude mcp add --transport http qq-mail https://api.mail.qq.com/mcp
  ```
- **WorkBuddy**: 直接引用仓库根目录的 [`mcp.json`](mcp.json)。

---

## 从 1.x 版本升级说明

1.x 版本使用的是传统的 `QQMAIL_USER`、`QQMAIL_PASS` 与 `imap.qq.com` 账号密码模式。2.x 已彻底废弃该方式。
- 如果环境变量中残留有旧的 `QQMAIL_USER` 或 `QQMAIL_PASS`，程序会报错退出以防止明文凭据泄露。
- 请在客户端配置中删去旧环境变量，改用第 1 步中的最新配置即可。

---

## 开发者指令

```bash
# 安装依赖
npm install

# 运行代码格式校验与全部测试
npm test

# 检查打包完整度
npm pack --dry-run
```

---

## 免责声明

本项目是由社区独立维护的开源连接器。QQ 邮箱、官方 Remote MCP 服务及相关商标权均归腾讯公司所有。
