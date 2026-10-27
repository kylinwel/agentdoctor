# AgentDoctor v0.1.0 — 开发预览

首个公开版本：用于检查 AI 编程工具和 MCP 配置的本地 Windows 工作台。

## 功能

- 自动发现常见客户端的 JSON、JSONC、TOML 配置，调用 MCP Doctor v0.1.17 进行静态诊断。
- 查看 Node、npm、Git、Python 等运行环境与程序路径。
- 预览受支持的 JSON/JSONC 修复，备份原文件，应用后自动复检；支持有冲突检查的恢复。
- 按需执行本地 Node/Python MCP 握手和工具清单查询，不调用工具。
- 导出脱敏 Markdown / JSON 报告。
- 提供真实引擎扫描的示例工作区，以及紧凑的诊断列表界面。

## 下载

- `AgentDoctor-0.1.0-win-x64.zip`：Windows x64 便携版，完整解压后运行 `AgentDoctor.exe`。
- `AgentDoctor-0.1.0-source.zip`：源码与已构建前端，不包含依赖和本地运行数据。
- `SHA256SUMS`：发布附件的 SHA-256 校验值。

## 验证与限制

Windows 本地生产构建及 24 项回归测试通过。CI 配置随源码提供，运行状态以仓库 Actions 为准。

这是未签名的开发预览。TOML 当前只读，自动修复仅支持已识别的路径/启动器问题；连接探测只支持已有的本地 Node/Python 脚本。静态扫描通过不代表服务器业务功能已经验证。

自有代码使用 MIT 许可证。实际复用未修改的 [MCP Doctor](https://github.com/Tinkora/mcp_doctor)，并保留第三方许可证和来源说明。
