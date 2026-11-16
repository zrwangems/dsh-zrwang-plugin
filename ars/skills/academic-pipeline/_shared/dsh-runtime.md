# DSH 下的 ARS 运行说明（由 dsh-zrwang-plugin 生成，不要手改）

- Python 解释器：系统 Python（`D:\anaconda3\python.exe`，来源：自动（PATH: python，尚未校验））。插件不自带 Python，也不安装任何依赖。
- 依赖检查通过；插件已把 python / python3 指向上面的解释器，不要另建 venv。
- bash：已指向 `C:\Program Files\Git\bin\bash.exe`；bash 代码块可以直接执行，不要依赖没有发行版的 WSL。
- 本环境没有 Claude Code 的 hooks：上游的写作用域硬护栏不生效，请把上游的 `PreToolUse` 约束当作正文规则遵守。
- 多角色流程（评审团、十阶段流水线、角色扮演）必须用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话没有这些工具时，先提示用户开启 Agent Team，不要退化成单会话顺序扮演。
- 子代理角色默认在同一会话内顺序扮演；确实需要并行时用 DSH 的 `subagent` 或 Agent Team。
- 路径约定：`references/`、`agents/`、`templates/` 相对本技能目录；`_shared/` 是上游仓库根的 `shared/`；`scripts/` 是上游 `scripts/` 用到的那部分（已并入本技能自带的脚本目录）。
- 跨技能引用写成 `../<技能名>/...`：右侧栏里 ARS 的五个技能要一起勾选才能互相读到；只勾一个时，缺文件的引用按提示降级。
- `shared/` 与 `scripts/` 里的上游脚本可能假设仓库根布局，缺文件时按提示降级，不要因此中断流程。
