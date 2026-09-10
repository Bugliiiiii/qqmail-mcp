# QQ 邮箱 MCP (@ethanli666/qqmail-mcp)

[English](README.md)

基于腾讯官方 QQ 邮箱 Remote MCP 服务（`https://api.mail.qq.com/mcp`）的本地适配器与连接器。

从 2.0 版本开始，项目彻底摒弃了传统的本地 IMAP/SMTP 密码连接方式，全面拥抱腾讯官方 Remote MCP。用户无需在本地配置明文邮箱密码或授权码，直接通过腾讯官方 OAuth 2.0 网页/手机扫码完成安全授权。

本中继专为 Claude Desktop、Google Antigravity、Cursor、Codex 等本地 MCP 客户端打造，内置双向协议版本转写、进程候选轮转与写操作两阶段确认机制。

---

## 架构

![QQ Mail MCP 架构](docs/assets/architecture.svg)

---

## 快速配置

### 1. 本地 Stdio 客户端（推荐：Claude Desktop / Antigravity / Cursor 等）

在对应客户端的 MCP 配置文件（如 `claude_desktop_config.json` 或 `mcp_config.json`）中添加：

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

也可以通过 CLI 输出通用模板：
```bash
npx -y @ethanli666/qqmail-mcp --print-config
```

### 2. 原生支持 Remote OAuth 的客户端

如果客户端已原生支持 Streamable HTTP 远程端点与 OAuth 流程，可直接连入腾讯官方服务：

- **Codex CLI**:
  ```bash
  codex mcp add qqmail --url https://api.mail.qq.com/mcp
  codex mcp login qqmail --scopes alias:read,mail:read,mail:send,mail:delete
  ```
- **Claude Code**:
  ```bash
  claude mcp add --transport http qq-mail https://api.mail.qq.com/mcp
  ```
- **WorkBuddy / 连接器配置**:
  直接引用仓库中的 [`mcp.json`](mcp.json)。

---

## 首次使用与扫码授权说明

首次配置完成后，按照以下步骤完成一次性扫码授权，后续即可免登录静默使用。

### 授权完整流程

1. **触发连接**：
   - 重启你的 MCP 客户端（如 Claude Desktop），或者在对话中首次尝试向 Agent 提问关于邮件的问题（例如：“查看我最近收到的 5 封邮件”）。
   - 你也可以在终端直接运行 `npx -y @ethanli666/qqmail-mcp` 进行预先登录验证。

2. **自动拉起浏览器授权页**：
   - 中继启动后，系统会自动调用你的默认浏览器，打开腾讯官方 OAuth 授权网页。
   - 若浏览器未自动弹出，可查看终端/客户端日志中输出的授权链接（默认使用本地回调端口 `39300`）。

3. **手机 QQ 扫码确认**：
   - 页面显示“QQ 邮箱 Agent 授权登录”。
   - 打开手机 QQ，使用右上角“扫一扫”扫描屏幕上的二维码；或在网页中直接登录你的 QQ 账号。
   - 在手机端勾选授权范围（别名读取、邮件收发、邮件管理），点击**确认授权**。

4. **授权完成与静默缓存**：
   - 网页提示“授权成功，请返回客户端”即可关闭浏览器。
   - 中继会自动将 OAuth 授权凭据保存在本地 `~/.qqmail-mcp/` 目录下（目录权限严格限制为 `0700`，凭证文件为 `0600`）。
   - **一次授权，持久有效**：后续每次启动客户端或调用 Agent 均会自动复用本地凭证，无需反复扫码。

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

> 所有工具的定义和参数模式在运行时由腾讯云端动态下发，本包不修改工具定义，完全保持腾讯官方接口原貌。

---

## 安全机制与两阶段确认

### 1. 本地零密码
本工具不存储、不中转任何明文 QQ 密码或 IMAP 授权码。所有访问令牌均由腾讯官方 OAuth 签发与校验。

### 2. 写操作两阶段确认（Elicitation）
为防止 AI Agent 产生幻觉误发或误删邮件，腾讯官方对写操作实施了两阶段挑战机制：
- Agent 第一次尝试调用写工具（如 `SendMessage`、`DeleteMessage`、`ClearTrash`）时，腾讯会返回错误码 `42801`，并附带操作摘要与一次性确认令牌。
- 本中继会自动拦截此挑战，并通过 MCP 标准 `elicitation/create` 协议向用户弹出交互确认卡片（显示发送对象、删除目标等）。
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
