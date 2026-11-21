# MCP 组件（MathWorks / Windows MCP）

插件把两个外部 MCP 服务器收进自己的生命周期：DSH 启动时按上次保存的会话选择自动拉起，之后随进程保持、由插件自愈守护；侧栏组件开关只控制当前对话能不能看到工具。不需要改 profile 补丁、不用重启 DSH。注册走 DSH 0.2.2-rc.2 起提供的 `ctx.mcpManager`（`@deepseek-ai/dsh-mcp-manager`）。两个组件所需的文件都随包分发或在插件自带运行时里安装，**不依赖任何作者本机路径**。

## MathWorks组件

- 触发条件：**工程技能组门禁打开，且确有工程技能注入**（被配置原因置灰的不算）。关掉工程组、或工程组一个技能都没注入时，本会话看不到这些工具；服务器随 DSH 保持，不会因此注销。
- 注册的服务器：`matlab-mcp`（stdio），工具前缀 `mcp__matlab-mcp__*`，一次提供 14 个工具：
  - MATLAB 基础 5 个：`check_matlab_code`、`detect_matlab_toolboxes`、`evaluate_matlab_code`、`run_matlab_file`、`run_matlab_test_file`；
  - Simulink 9 个（扩展文件 `mathworks/simulink-agentic-toolkit/tools/tools.json`）：`model_overview`、`model_read`、`model_query_params`、`model_resolve_params`、`model_edit`、`model_read_diagnostics`、`model_check`、`model_scan`、`model_test`。
- 包内 `mathworks/` 的结构：
  - `matlab-mcp-server-windows-x64.exe`：MathWorks 官方 MATLAB MCP 服务器（v0.16.1）；
  - `simulink-agentic-toolkit/`：完整的 Simulink Agentic Toolkit 运行时 2026.11.c（`VERSION`、`satk_initialize.p`、`tools/VERSION` 1.0.35、`satk-libraries.json`、`validate_installation.p`、`tools/` 里的 MATLAB 函数与 `tools.json`、`toolbox-kb/`），由 BSD-2 变体许可分发，许可说明另存 `vendor/licenses/mathworks/`。
- **MATLAB 侧初始化**：组件本身只负责启动 MCP 服务器；MATLAB 每次启动后需要在 MATLAB 里执行一次：

  ```matlab
  addpath('<插件安装目录>/mathworks/simulink-agentic-toolkit');
  satk_initialize(MCPServerPath='<插件安装目录>/mathworks/matlab-mcp-server-windows-x64.exe')
  ```

  它会加好工具路径、调用 `shareMATLABSession()` 共享当前会话并校验安装。把这几行写进 `startup.m` 可以每次自动执行。插件的这个目录随包分发，不需要作者机器上的任何外部路径。
- `existing` 模式要求 MATLAB 已运行并共享过会话（`satk_initialize` 已经包含 `shareMATLABSession()`）；MATLAB 没开时服务器仍会注册，但状态显示连接失败/重连中。

## Windows MCP组件

- 手动勾选才注册 `windows-mcp`（stdio），工具前缀 `mcp__windows-mcp__*`；取消只影响本会话工具可见性，服务器随 DSH 保持。与工程技能组无关。
- 直接用**系统已安装的 `windows-mcp`**（`uv tool install windows-mcp` 等，需在 PATH 里；本机为 0.8.x）。插件**不再自带** Windows MCP 运行时，包内没有 `runtime/windows-mcp`。
- 默认参数 `serve`，默认环境变量 `ANONYMIZED_TELEMETRY=false`、`WINDOWS_MCP_SCREENSHOT_SCALE=0.5`。
- 它会占用桌面控制权；不勾选时这些工具不会出现在模型上下文里。

## 工具何时可用（动态生效）

DSH 的 Agent 每走一步都会重新解析工具表（	ools.resolve），并在工具表变化时自动向会话追加 	ool-addition / 	ool-removal 开发消息。所以插件里的 mcpManager.register() 是**纯动态**的：组件显示「已启动（N 个工具）」后，**当前对话的下一条消息**就能看到 mcp__matlab-mcp__* 这类工具，不需要新开会话。

- 注意时序：勾选后到连接完成前发出的那一轮请求，工具表在该步已经固定，看不到新工具；等状态变成「已启动」再发下一条消息即可。
- 若「已启动」之后仍看不到工具，那才是问题（会话仍在用旧请求/工具被限制），把会话 id 和 /health 的 mcp 输出给我排查。

## 稳定性：重连、自动恢复、状态面

稳定性分两层，都用 DSH 官方面，没有插件自己维护的重连循环：

1. **mcp-client 自己重连**。断线或首次启动失败后按注册条目的 `reconnect` 预算退避重连。插件把两个组件固定成 **30 次、500ms 起步、10s 封顶**（官方默认是 10 次、30s 封顶），一轮预算约 4.4 分钟，够 MATLAB 完整重启一次。
2. **插件的自愈守护**。控制器订阅官方 `mcp-manager/status` 事件；当某个组件变成 `failed: gave-up`（或 `reconnect-disabled`）且当前还有会话在用它时，按 **15s → 30s → 1m → 2m → 5m** 的间隔调用 `ctx.mcpManager.restart()` 重建实例。重建成功、状态回到 `connected` 就清空退避；MATLAB 重开并重新 `shareMATLABSession()` 后会自动接上，不需要守着屏幕点「重启」。

界面上能看到整个过程：

- 「启动中…」→「已启动（N 个工具）」；重连期间显示「重连中（第 N/30 次，约 X 秒后重试）」。
- 预算用完时显示「连接失败，约 X 秒后自动恢复（第 K 次）」，连上后回到绿字。
- 只有以下情况不自动重建，组件行会直接说明原因：
  - `failed: cleanup`：上一次连接没有确认关闭，DSH 要求重启 Host 才能换实例；
  - `failed: load`：组件加载本身出错（例如包内 exe 缺失），重建也不会好；
  - 组件已被所有会话关掉，或手动点了「重启」（手动重启会重置预算和自愈计数）。
- 面板轮询会一直跟到有明确结论（重连/自愈期间约 4 秒一次），不再 20 次后停掉。

**开关**：设置 → 运行环境 → MCP 组件稳定性 → 「断线自动恢复」，默认开启。关掉后只保留 mcp-client 自己的重连，预算用完需要手动点「重启」。

**手动重启 / 探测**：组件行右侧「重启」重建实例并重置预算；`POST /dsh-zrwang-plugin/mcp` 的 `probe` 会单独连一次、列工具再关闭，不扰动正在运行的实例。完整状态面（`state/attempt/maxAttempts/toolCount/lastError/nextRetryAtMs/recover`）可从 `GET /dsh-zrwang-plugin/health` 的 `mcp` 字段查；自愈的每次排队、重建也会写进运行事件日志。

## 固定参数

MCP 的连接参数全部固定，保证开箱即用；设置页只有一个「断线自动恢复」开关：

| 组件 | 固定参数 |
| --- | --- |
| `matlab-mcp` | 命令 = 包内 `mathworks/matlab-mcp-server-windows-x64.exe`；参数 `--matlab-session-mode=existing`、`--extension-file=<包内>/simulink-agentic-toolkit/tools/tools.json`、`--disable-telemetry=true`；env `WINDIR=%SystemRoot%`（代码里取 `SystemRoot`，缺省才用 `C:\Windows`）；工具调用超时 120000ms、启动超时 30000ms、重连 30 次/10s 封顶、`failOnStartupError=false` |
| `windows-mcp` | 命令 = 系统 PATH 里的 `windows-mcp`；参数 `serve`；env `ANONYMIZED_TELEMETRY=false`、`WINDOWS_MCP_SCREENSHOT_SCALE=0.5`；工具调用超时 120000ms、启动超时 30000ms、重连 30 次/10s 封顶、`failOnStartupError=false` |

设置页的「运行环境 → 组件状态 → 重新检查」会校验两个组件的文件（包内 exe、SATK 扩展文件、Windows MCP 运行时）并显示当前连接状态和自动恢复开关；MCP 没有连接参数配置卡片，也没有「MCP配置」页签。

## 边界

- 只在 Web / 桌面端 profile 有效：headless、sdk profile 没有 `ctx.mcpManager`，组件行显示「当前 profile 不支持」，不影响其它功能。
- 组件开关按会话保存。DSH 启动时插件把已保存会话的组件需求取并集，直接把需要的服务器拉起来（不用先打开对话）；服务器一旦启动就随本进程保持，由插件守护状态，侧栏关掉只影响对应会话的工具可见性。为了做到“每个对话只用自己勾选的组件”，插件在每个 agent 作用域调用 DSH 官方的 `ctx.tools.restrict({ deny })`：本会话没启用的 `mcp__matlab-mcp__*` / `mcp__windows-mcp__*` 会从该会话的工具列表、提示词上下文和执行里一起移除，别的会话不受影响。工具表因 MCP 重连变化时会重新计算限制。要彻底停掉服务器，重启 DSH。
- `serverName` 固定为 `matlab-mcp` / `windows-mcp`。如果 profile 的 `cordis.patch.yml` 里还留着同名的静态 MCP 行（例如旧的 `mcp-matlab` / `mcp-windows`），注册会报冲突，组件行会显示原因；装到该 profile 前先删掉静态行。
- 服务器名与工具前缀变化会影响按名字引用工具的说明文字：旧文档里的 `mcp__matlab__*` 现在应写作 `mcp__matlab-mcp__*`。
- MATLAB 本体（R2023a 及以上）仍需用户自己安装；这是 MathWorks 服务器本身的运行前提，不是插件的本机依赖。
- 自动重建有一个短暂的「工具暂时消失」窗口：`restart()` 会先卸旧实例再挂新实例，期间该组件的工具不在工具表里，连上后会以 `tool-addition` 开发消息重新出现。这是 mcp-manager 的重建语义，不是插件额外造成的。

