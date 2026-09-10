# QQ 邮箱 MCP (@ethanli666/qqmail-mcp)

[English](README.md) | 简体中文

让你的 AI 助手（Claude Desktop、Cursor、Google Antigravity 等）安全、便捷地接入腾讯 QQ 邮箱。

---

## 项目介绍

### 什么是 QQ 邮箱 MCP？

腾讯官方推出了基于 Streamable HTTP 协议的 QQ 邮箱 Remote MCP 服务（`https://api.mail.qq.com/mcp`），为 AI 智能体提供了完整的邮件收发与邮箱管理工具能力。

**`@ethanli666/qqmail-mcp`** 是专为本地 MCP 客户端打造的**官方协议透明适配器与安全中继**。主流本地桌面客户端（如 Claude Desktop、Cursor、Antigravity 等）目前普遍基于标准输入输出（stdio）与本地子进程交互，且腾讯官方对接入端的身份有严格的 OAuth 白名单限制与特定协议版本要求。

本项目充当本地 Agent 与腾讯官方云端之间的智能连接桥梁，解决协议协商、身份准入与安全护栏问题：

- **零明文密码**：彻底告别传统的 IMAP/SMTP 授权码与账户密码。采用腾讯官方 OAuth 2.0 网页/手机扫码授权，本地不保存任何明文凭证。
- **开箱即用与自动协议适配**：内置双向协议版本转写，自动在旧版协议（`2024-11-05`、`2025-11-25`）与腾讯官方当前采用的 `2025-03-26` 之间透明转换，消除客户端协议协商不匹配报错。
- **白名单容错轮转**：智能轮转已验证的 OAuth 客户端身份（`Codex` -> `Claude` -> `WorkBuddy`），首次握手成功后自动记住首选，启动完全免等待。
- **持久化静默凭证**：首次扫码后凭证安全存储于本地（目录权限 `0700`，凭据文件 `0600`），后续会话全自动静默重用，无需频繁扫码。
- **两阶段写操作安全护栏**：拦截发信、删信等高风险操作，通过 MCP 标准 Elicitation 交互卡片向用户请求明确核对，彻底杜绝 AI Agent 幻觉误发误删。
- **全量官方工具支持**：完整透传腾讯官方 12 项邮件处理工具，保持云端定义原汁原味。

### 系统架构

![QQ Mail MCP 架构](docs/assets/architecture.svg)

---

## 快速开始

只需三步，即可让 AI Agent 接管你的 QQ 邮箱工作流。

### 第一步：添加客户端配置

在你的 MCP 客户端配置文件中添加 stdio 中继服务。

#### Claude Desktop
配置文件位置：
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

#### Cursor / Google Antigravity / 其他 Stdio 客户端
在对应工具的 MCP 设置中添加服务：
- **Command**: `npx`
- **Args**: `-y @ethanli666/qqmail-mcp@latest`

> 提示：你也可以在终端直接运行 `npx -y @ethanli666/qqmail-mcp --print-config` 查看标准配置 JSON。

#### 原生支持 Remote OAuth 的客户端（可选）
如果你的客户端已原生支持 Streamable HTTP 远程端点与 OAuth 流程，可直接接入腾讯官方服务：
- **Codex CLI**:
  ```bash
  codex mcp add qqmail --url https://api.mail.qq.com/mcp
  codex mcp login qqmail --scopes alias:read,mail:read,mail:send,mail:delete
  ```
- **Claude Code**:
  ```bash
  claude mcp add --transport http qq-mail https://api.mail.qq.com/mcp
  ```
- **WorkBuddy / 连接器配置**: 直接引用项目中的 [`mcp.json`](mcp.json)。

---

### 第二步：首次扫码授权

完成配置后，只需进行一次手机扫码授权。

1. **触发授权**：
   - 可以在终端提前运行一次以完成预先登录：
     ```bash
     npx -y @ethanli666/qqmail-mcp
     ```
   - 或者直接启动你的 MCP 客户端（如 Claude Desktop），在对话中首次尝试询问邮件相关内容。

2. **浏览器自动弹出**：
   - 中继启动后会自动调用系统默认浏览器，打开腾讯官方 OAuth 登录网页（本地回调监听端口默认使用 `39300`）。
   - 若未自动打开浏览器，请复制终端日志中提示的授权链接手动粘贴至浏览器。

3. **手机 QQ 扫码确认**：
   - 页面展示“QQ 邮箱 Agent 授权登录”二维码。
   - 打开手机 QQ，点击右上角“扫一扫”扫描屏幕二维码（或直接在页面输入账号登录）。
   - 勾选授权范围（别名读取、邮件收发、邮件管理），点击**确认授权**。

4. **授权成功，后续免登**：
   - 网页提示“授权成功，请返回客户端”即可关闭页面。
   - 凭证将自动加密保存在本地目录 `~/.qqmail-mcp/` 中。
   - **一次授权，持久生效**：后续使用客户端对话时会自动加载凭证，无需再次扫码。

---

### 第三步：开始与 Agent 对话

授权完成后，在客户端中直接向 Agent 发出指令即可：

```markdown
- "帮我查看收件箱里最近 5 封未读邮件"
- "搜索上周来自 GitHub 的通知邮件，并总结主要内容"
- "帮我下载最新那封带有报表附件的邮件中的 Excel 文件"
- "给张三（zhangsan@example.com）回复邮件，确认明天下午两点的会议"
```

当 Agent 尝试回复、发送或删除邮件时，系统会自动弹出安全确认卡片，经你点击确认后才会真正执行。

---

## 官方功能与工具列表

腾讯官方服务当前提供 12 项完整的 Agent 邮件处理工具：

| 工具名称 | 操作类型 | 功能说明 |
| --- | --- | --- |
| `GetMe` | 读操作 | 获取当前授权邮箱的别名列表、权限范围、调用额度与附件规格（会话启动建议先调用） |
| `ListMessages` | 读操作 | 列出邮件列表，支持按收件箱、已发送、草稿箱、垃圾箱等过滤 |
| `GetMessage` | 读操作 | 读取指定邮件的完整正文（HTML/纯文本）与详细元数据 |
| `SearchMessages` | 读操作 | 依关键词、发件人、收件人、时间范围和文件夹进行复合搜索 |
| `ListAttachments` | 读操作 | 获取指定邮件的附件列表与大小规格 |
| `DownloadAttachment` | 读操作 | 下载附件的 Base64 编码数据 |
| `SendMessage` | 写操作 | 编辑并发送新邮件（需用户二次确认） |
| `ReplyMessage` | 写操作 | 回复指定邮件（需用户二次确认） |
| `ForwardMessage` | 写操作 | 转发指定邮件至目标地址（需用户二次确认） |
| `DeleteMessage` | 写操作 | 将指定邮件移入垃圾箱（需用户二次确认） |
| `PermanentDeleteMessage` | 写操作 | 彻底物理删除邮件，不可恢复（需用户二次确认） |
| `ClearTrash` | 写操作 | 清空整个垃圾箱（需用户二次确认） |

> 说明：所有工具的定义与入参模式均在运行时由腾讯云端动态下发，本包不修改任何工具定义，完全保持腾讯官方接口原貌。

---

## 安全机制与两阶段确认

### 1. 本地零密码
本工具不存储、不中转任何明文 QQ 密码或 IMAP 授权码。所有访问令牌均由腾讯官方 OAuth 签发与校验。

### 2. 写操作两阶段确认（Elicitation）
为防止 AI Agent 产生幻觉误发或误删邮件，腾讯官方对写操作实施了两阶段挑战机制：
- Agent 第一次尝试调用写工具（如 `SendMessage`、`DeleteMessage`、`ClearTrash`）时，腾讯会返回错误码 `42801`，并附带操作摘要与一次性确认令牌。
- 本中继会自动拦截此挑战，并通过 MCP 标准 `elicitation/create` 协议向用户弹出交互确认卡片（展示收件人、主题、删除邮件标题等关键信息）。
- 只有用户在界面上明确核对并勾选确认后，中继才会带上确认令牌执行操作；若用户取消或 5 分钟内超时，操作将被直接熔断并抛弃。

---

## 高级环境变量配置

通常情况下使用默认配置即可。特殊网络或多账户环境可通过环境变量微调：

| 环境变量 | 默认值 | 作用说明 |
| --- | --- | --- |
| `QQMAIL_OAUTH_CLIENT_NAME` | 自动探测 | 强制指定腾讯 OAuth 准入的客户端名称（可选：`Codex`、`Claude`、`WorkBuddy`） |
| `QQMAIL_OAUTH_CALLBACK_PORT` | `39300` | 指定本地 OAuth 网页重定向监听端口，遇端口冲突时可更改（如 `8080`） |
| `MCP_REMOTE_CONFIG_DIR` | `~/.qqmail-mcp` | 自定义本地 OAuth 凭据存储目录 |

---

## 从 1.x 版本迁移

1.x 旧版本使用 `QQMAIL_USER`、`QQMAIL_PASS` 环境变量和 `imap.qq.com` 账号密码。2.x 已彻底废弃该方式。
- 若启动时环境变量中仍残留 `QQMAIL_USER` 或 `QQMAIL_PASS`，程序会主动报错退出以防凭据泄露。
- 请在客户端配置中移除旧版环境变量，改用上文给出的最新 stdio 配置即可。

---

## 开发者指令

```bash
# 安装依赖
npm install

# 运行代码检查与全量测试
npm test

# 检查 npm 打包产物
npm pack --dry-run
```

---

## 免责声明

本项目是由社区独立维护的开源连接器。QQ 邮箱、官方 Remote MCP 服务及相关商标权归腾讯公司所有。
