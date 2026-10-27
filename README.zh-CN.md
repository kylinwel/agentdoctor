# AgentDoctor · AI 开发环境体检

本地运行的 Windows 工具，帮助检查 AI 编程工具和 MCP 的环境问题，提供可预览、带备份、可恢复的配置修复。

## 打开成品

[下载 Windows x64 便携版](https://github.com/kylinwel/agentdoctor/releases/tag/v0.1.0) · [反馈问题](https://github.com/kylinwel/agentdoctor/issues) · [贡献指南](CONTRIBUTING.md)

1. 解压 Windows 便携包。
2. 保持整个文件夹完整，双击 **AgentDoctor.exe**。
3. 点击「开始体检」，或先用「示例工作区」体验。
4. 在「切换目录」中填写你正在开发的项目绝对路径。

打开桌面工作台本身不需要安装 Node.js；你要检查的 MCP 服务可能仍需要自己的 Node/Python 等运行时。

当前版本是未签名的开发预览，不是 AI 客户端或 MCP Doctor 的官方产品。

## 这版能做什么

- 自动寻找 Cursor、Claude Code/Desktop、Codex、VS Code、Copilot CLI、Cline 的常见 MCP 配置。
- 真实调用 MIT 许可的 **MCP Doctor v0.1.17** 进行静态诊断，保留上游规则代码。
- 检查 Node、npm、Git、Python、uv、Bun 和 AI CLI 在当前进程 PATH 中的可用性。
- 发现缺失/过期启动路径、工作目录、环境变量占位符、服务名冲突、JSON/JSONC/TOML 格式等问题。
- 对支持的 JSON/JSONC 配置，预览修复差异，保存原文件备份后应用，完成后自动复检。
- 修复后如果你又编辑了文件，恢复操作会阻止覆盖后续改动。
- 显式对本地 Node/Python 脚本做 MCP 握手和工具清单查询，不调用实际工具。
- 导出脱敏 Markdown / JSON 报告。
- 提供使用真实引擎的示例配置，便于练习修复和恢复。

## 一次修复的流程

「环境体检」→「预览修复」→核对改动→「备份并应用修复」→查看自动复检结果。

需要撤销时，到「历史与备份」选择对应原文件备份。它会核对当前文件 Hash 和备份完整性，避免覆盖新编辑。

第一版提供两类保守修复：

- 将可识别的运行时 command 固定为当前可用的绝对程序路径。
- 对 Windows npx 启动兼容问题，使用本机 Node 直接运行 npm 自带的 npx-cli.js，保留原参数。

没有自动修复按钮的问题需要按建议人工核对，不会猜测软件包名称或修改系统 PATH。

## 数据与能力边界

- 静态体检不启动配置中的 MCP 服务，也不连接远程 MCP 地址。
- 版本检查只执行受限的固定运行时 --version 命令；不会执行 AI 客户端登录或模型调用。
- TOML 当前只读，自动修复针对 JSON/JSONC。
- 「连接探测」是显式进程执行，只支持已经存在的本地 Node/Python 脚本；不启动 shell、包下载器或远程服务。
- 静态检查通过不代表业务功能验证通过。
- 可选工具未安装不计入错误。
- 报告、历史、备份留在本地，没有遥测上传。
- 原始配置备份可能包含密钥，需按敏感文件保管。源码包和报告导出不会包含原始备份。
- 导出已隐藏常见凭据和解析到的环境变量值；发布前仍应核对自定义敏感字段。

## 从源码运行

需要 Node.js 22.12+，推荐 Node.js 24 LTS。

~~~powershell
git clone https://github.com/kylinwel/agentdoctor.git
cd agentdoctor
npm ci --ignore-scripts
npm run setup:engine
npm run build
npm start
~~~

访问 http://127.0.0.1:4318。已经安装好依赖和完成构建后，也可以双击 Start-AgentDoctor.cmd。

桌面开发版：

~~~powershell
npm run setup:desktop
npm run desktop
~~~

下载脚本只从官方 GitHub 发布页获取引擎/运行时，并验证 SHA-256。网络不通时需配置你自己的代理；脚本不会修改系统代理。

## 验证与打包

~~~powershell
npm run check
npm run package:source
npm run package:windows
~~~

实际测试包括上游引擎扫描、静态扫描不执行服务脚本、JSONC 注释保留、脱敏、过期预览、修复/恢复、后续编辑冲突、备份损坏拒绝、本地 MCP 握手和 API 跨站/会话检查。

## 开源复用

主要诊断能力直接复用 [Tinkora/mcp_doctor](https://github.com/Tinkora/mcp_doctor)，未修改其二进制；许可证保留在 vendor/mcp-doctor/LICENSE。

另外实际使用 Microsoft jsonc-parser、官方 MCP SDK、React、Lucide、Electron、jsdiff、TOML 解析器等。完整来源和用途见 THIRD_PARTY_NOTICES.md。

AgentDoctor 自有代码采用 MIT 许可。
