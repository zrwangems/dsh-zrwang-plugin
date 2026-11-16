# MCP 组件（MathWorks / Windows MCP）

插件把两个外部 MCP 服务器收进自己的生命周期：在侧栏勾选组件才注册，取消即注销，不需要改 profile 补丁、不用重启 DSH。注册走 DSH 0.2.2-rc.2 起提供的 `ctx.mcpManager`（`@deepseek-ai/dsh-mcp-manager`）。两个组件所需的文件都随包分发或在插件自带运行时里安装，**不依赖任何作者本机路径**。

## MathWorks组件

- 触发条件：**工程技能组门禁打开，且确有工程技能注入**（被配置原因置灰的不算）。关掉工程组、或工程组一个技能都没注入时自动注销。
- 注册的服务器：`matlab-mcp`（stdio），工具前缀 `mcp__matlab-mcp__*`，一次提供 14 个工具：
  - MATLAB 基础 5 个：`check_matlab_code`、`detect_matlab_toolboxes`、`evaluate_matlab_code`、`run_matlab_file`、`run_matlab_test_file`；
  - Simulink 9 个（扩展文件 `mathworks/simulink-agentic-toolkit/tools/tools.json`）：`model_overview`、`model_read`、`model_query_params`、`model_resolve_params`、`model_edit`、`model_read_diagnostics`、`model_check`、`model_scan`、`model_test`。
- 包内 `mathworks/` 的结构：
  - `matlab-mcp-server-windows-x64.exe`：MathWorks 官方 MATLAB MCP 服务器；
  - `simulink-agentic-toolkit/`：完整的 Simulink Agentic Toolkit 运行时（`satk_initialize.p`、`satk-libraries.json`、`validate_installation.p`、`tools/` 里的 MATLAB 函数与 `tools.json`、`toolbox-kb/`），由 MIT 风格许可分发，许可说明另存 `vendor/licenses/mathworks/`。
- **MATLAB 侧初始化**：组件本身只负责启动 MCP 服务器；MATLAB 每次启动后需要在 MATLAB 里执行一次：

  ```matlab
  addpath('<插件安装目录>/mathworks/simulink-agentic-toolkit');
  satk_initialize(MCPServerPath='<插件安装目录>/mathworks/matlab-mcp-server-windows-x64.exe')
  ```

  它会加好工具路径、调用 `shareMATLABSession()` 共享当前会话并校验安装。把这几行写进 `startup.m` 可以每次自动执行。插件的这个目录随包分发，不需要作者机器上的任何外部路径。
- `existing` 模式要求 MATLAB 已运行并共享过会话（`satk_initialize` 已经包含 `shareMATLABSession()`）；MATLAB 没开时服务器仍会注册，但状态显示连接失败/重连中。

## Windows MCP组件

- 手动勾选才注册 `windows-mcp`（stdio），工具前缀 `mcp__windows-mcp__*`；取消即注销。与工程技能组无关。
- 直接用**系统已安装的 `windows-mcp`**（`uv tool install windows-mcp` 等，需在 PATH 里；本机为 0.8.x）。插件**不再自带** Windows MCP 运行时，包内没有 `runtime/windows-mcp`。
- 默认参数 `serve`，默认环境变量 `ANONYMIZED_TELEMETRY=false`、`WINDOWS_MCP_SCREENSHOT_SCALE=0.5`。
- 它会占用桌面控制权；不勾选时这些工具不会出现在模型上下文里。

## 工具何时可用（动态生效）

DSH 的 Agent 每走一步都会重新解析工具表（	ools.resolve），并在工具表变化时自动向会话追加 	ool-addition / 	ool-removal 开发消息。所以插件里的 mcpManager.register() 是**纯动态**的：组件显示「已启动（N 个工具）」后，**当前对话的下一条消息**就能看到 mcp__matlab-mcp__* 这类工具，不需要新开会话。

- 注意时序：勾选后到连接完成前发出的那一轮请求，工具表在该步已经固定，看不到新工具；等状态变成「已启动」再发下一条消息即可。
- 若「已启动」之后仍看不到工具，那才是问题（会话仍在用旧请求/工具被限制），把会话 id 和 /health 的 mcp 输出给我排查。

## 稳定性：启动标识、重启、探测、重连

- **启动标识**：组件行勾选后先显示「启动中…」，连上后变成绿色的「已启动（N 个工具）」，失败则显示红色的「启动失败」；面板顶部还会有一条同样的状态条。界面会自己轮询到结果（约每 1.2 秒，最多 20 次），不需要手动刷新。
  - 首次启动失败时 mcp-client 会按官方默认重连策略自动重试，这期间显示「启动中（第 N 次尝试）」；重连预算耗尽（默认 10 次退避，可能持续一两分钟）才变成「启动失败」，鼠标悬停可看 `lastError`。
- **重启**：组件行右侧的「重启」会重建该服务器实例并重置重连预算——MATLAB 重开会话、或后台崩溃后重连预算耗尽（`failed: gave-up`）时用它。
- **自动重连**：崩溃/断线由 mcp-client 按官方默认 `reconnect` 策略自动退避重连，期间状态是「重连中」；插件不暴露重连配置。
- 完整状态面还包括 `attempt/maxAttempts/toolCount/lastError`，`GET /dsh-zrwang-plugin/health` 的 `mcp` 字段可直接查；组件注册/注销遵守插件生命周期，卸载插件会先撤掉工具再退出。

## 固定参数（无设置项）

MCP 组件**不提供设置项**，注册参数全部固定，保证开箱即用：

| 组件 | 固定参数 |
| --- | --- |
| `matlab-mcp` | 命令 = 包内 `mathworks/matlab-mcp-server-windows-x64.exe`；参数 `--matlab-session-mode=existing`、`--extension-file=<包内>/simulink-agentic-toolkit/tools/tools.json`、`--disable-telemetry=true`；env `WINDIR=C:\Windows`；工具调用超时 120000ms、启动超时 30000ms |
| `windows-mcp` | 命令 = 系统 PATH 里的 `windows-mcp`；参数 `serve`；env `ANONYMIZED_TELEMETRY=false`、`WINDOWS_MCP_SCREENSHOT_SCALE=0.5`；工具调用超时 120000ms、启动超时 30000ms |

设置页的「运行环境 → 组件状态 → 重新检查」会校验两个组件的文件（包内 exe、SATK 扩展文件、Windows MCP 运行时）并显示当前连接状态；MCP 本身不再有配置卡片或「MCP配置」页签。

## 边界

- 只在 Web / 桌面端 profile 有效：headless、sdk profile 没有 `ctx.mcpManager`，组件行显示「当前 profile 不支持」，不影响其它功能。
- 组件状态是宿主全局的，不能按会话隔离；开关沿用「最后同步的会话优先生效」，与技能注入的全局态一致。
- `serverName` 固定为 `matlab-mcp` / `windows-mcp`。如果 profile 的 `cordis.patch.yml` 里还留着同名的静态 MCP 行（例如旧的 `mcp-matlab` / `mcp-windows`），注册会报冲突，组件行会显示原因；装到该 profile 前先删掉静态行。
- 服务器名与工具前缀变化会影响按名字引用工具的说明文字：旧文档里的 `mcp__matlab__*` 现在应写作 `mcp__matlab-mcp__*`。
- MATLAB 本体（R2023a 及以上）仍需用户自己安装；这是 MathWorks 服务器本身的运行前提，不是插件的本机依赖。

