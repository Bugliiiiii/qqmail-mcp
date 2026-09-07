# QQ Mail MCP

[English](README.md) | 简体中文

通过 IMAP 读取 QQ 邮箱和 Foxmail 邮箱的邮件与附件，并可将附件下载到本地。采用模型上下文协议（Model Context Protocol，MCP）的标准输入输出（STDIO）传输方式，可供支持该方式的本地智能体客户端使用，不依赖 Codex 专有接口。邮箱本身仍以只读方式打开。

## 使用前准备

- 安装 Node.js 20 或更新版本。
- 在 QQ 邮箱或 Foxmail 邮箱中开启 IMAP 服务。
- 获取邮箱的 IMAP 授权码，注意不是邮箱登录密码。
- 准备一个支持 STDIO 服务的 MCP 客户端。

## 支持的工具

| 工具 | 用途 |
| --- | --- |
| `qqmail_connection_status` | 检查只读 IMAP 连接状态 |
| `qqmail_list_new_messages` | 列出近期邮件信息，可选择包含正文预览 |
| `qqmail_get_snippet` | 按 IMAP UID 读取有长度限制的纯文本预览 |
| `qqmail_get_message` | 读取指定邮件头字段和有长度限制的纯文本正文 |
| `qqmail_list_attachments` | 列出附件信息，不下载附件内容 |
| `qqmail_download_attachment` | 将单个附件保存到本地目录，支持任意文件类型 |

所有工具都采用标准 MCP 参数定义和工具注解。五个邮箱读取工具标记为 `readOnlyHint: true`。附件下载会创建本地文件，因此标记为 `readOnlyHint: false`，但不会修改邮箱。

## 配置说明

直接在 MCP 客户端配置中填写邮箱地址和 IMAP 授权码即可，不需要另外设置系统环境变量，也不用执行 `export`。客户端会通过配置中的 `env` 将这些值传给服务。

| 配置项 | 必填 | 默认值 |
| --- | --- | --- |
| `QQMAIL_USER` | 是 | 无 |
| `QQMAIL_PASS` | 是 | 无 |
| `QQMAIL_FOLDER` | 否 | `INBOX` |
| `QQMAIL_IMAP_HOST` | 否 | `imap.qq.com` |
| `QQMAIL_IMAP_PORT` | 否 | `993` |
| `QQMAIL_IMAP_SECURE` | 否 | `true` |
| `QQMAIL_ATTACHMENT_DIR` | 否 | 系统临时目录下的 `qqmail-mcp-attachments` |

直接填写时，授权码会以明文保存在本地配置文件中。请将文件访问权限限制为自己的用户账号，不要提交到代码仓库，也不要通过截图或问题反馈分享。如果不想在配置中保存授权码，可使用下方的[进阶配置](#进阶配置)。

## 在 STDIO MCP 客户端中使用

如果客户端使用 `mcpServers` 格式的 JSON 配置，复制以下示例，替换两处占位值：

- `your-address@qq.com`：你的完整 QQ 邮箱或 Foxmail 邮箱地址。
- `your-imap-authorization-code`：你的邮箱 IMAP 授权码，不是登录密码。

如果已有其他 MCP 服务，只需把 `qqmail` 这一项合并到现有的 `mcpServers` 中，不要覆盖原有配置。

```json
{
  "mcpServers": {
    "qqmail": {
      "command": "npx",
      "args": ["-y", "@ethanli666/qqmail-mcp"],
      "env": {
        "QQMAIL_USER": "your-address@qq.com",
        "QQMAIL_PASS": "your-imap-authorization-code"
      }
    }
  }
}
```

保存配置并重启客户端，让智能体调用 `qqmail_connection_status` 检查连接，确认成功后再读取邮件。其他客户端的配置格式可能不同，但启动命令、参数和凭据名称相同。

## 在 Codex 中使用

在本地 `~/.codex/config.toml` 中添加以下内容，并替换邮箱地址和授权码。如果已经存在 `[mcp_servers.qqmail]`，请修改原有配置，不要重复添加。配置格式参照 [Codex 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。

```toml
[mcp_servers.qqmail]
command = "npx"
args = ["-y", "@ethanli666/qqmail-mcp"]
default_tools_approval_mode = "writes"

[mcp_servers.qqmail.env]
QQMAIL_USER = "your-address@qq.com"
QQMAIL_PASS = "your-imap-authorization-code"
```

保存文件并重启 Codex，然后让它调用 `qqmail_connection_status` 检查连接。

## 进阶配置

如果不想把凭据保存在 MCP 配置中，可以使用客户端的密钥管理功能，或通过启动脚本将 `QQMAIL_USER` 和 `QQMAIL_PASS` 注入服务进程。不同客户端的支持情况不同，不要假定 `${VARIABLE}` 占位符会被自动替换。

在 Codex 中，可以用下面的配置替代上面的直接填写方式。需要先在启动 Codex 的环境中设置这两个变量：

```toml
[mcp_servers.qqmail]
command = "npx"
args = ["-y", "@ethanli666/qqmail-mcp"]
env_vars = ["QQMAIL_USER", "QQMAIL_PASS"]
default_tools_approval_mode = "writes"
```

从直接填写方式切换过来时，删除原有的 `[mcp_servers.qqmail.env]` 配置段及其中的凭据，再从已设置变量的环境中重启 Codex。本服务不会自动读取 `.env` 文件，仅创建该文件不会生效。

## 从本地压缩包安装

尚未发布到 npm 时，可以执行 `npm pack` 生成 `.tgz` 压缩包，将其复制到目标电脑，再配置 MCP 客户端通过 `npx -y /absolute/path/to/the-package.tgz` 启动。请将路径替换为压缩包的实际绝对路径。

## 安全边界

- 仅使用 IMAP，不提供 SMTP 发信功能或修改邮箱的工具。
- 以只读方式打开邮箱。
- 使用稳定的 IMAP UID 查找邮件。
- 邮件内容标记为不可信数据，服务指令明确要求智能体不要执行邮件中的指令。
- 将 HTML 转换为纯文本，不返回完整邮件头。
- 对正文长度、查询时间范围、结果数量和附件大小设置上限。
- 支持任意类型的附件，包括脚本、应用程序和安装包。
- 下载时清理不安全的路径，禁止覆盖已有文件；在 POSIX 系统中使用 `0600` 文件权限。
- 在 macOS 上为下载的附件添加系统隔离属性。
- 附件仅保存到本地，服务不会执行、安装、打开或解压附件。

## 开发与验证

```sh
npm install
npm run check
npm run smoke
npm pack --dry-run
```

标准输出仅用于 MCP 协议消息，运行错误写入标准错误输出。
