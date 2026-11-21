# DSH 下的 ARS 运行说明（由 dsh-zrwang-plugin 生成，不要手改）

- Python：直接用 `python` / `python3`。DSH 插件已把它们指向用户在「设置 → 运行环境 → Python 解释器」里选定的系统解释器；插件不自带 Python，也不安装依赖。
- 依赖缺失时按报错提示在所选 Python 环境里自行补齐，不要另建 venv，也不要改本技能目录里的文件。
- bash：直接用 `bash` 代码块；插件已把 `bash` 指向系统的 Git Bash（Windows）或 `/bin/bash`（macOS/Linux）。
- 本环境没有 Claude Code 的 hooks：上游的写作用域硬护栏不生效，请把上游的 `PreToolUse` 约束当作正文规则遵守。
- 多角色流程（评审团、十阶段流水线、角色扮演）必须用 DSH 的 Agent Team 工具（`spawn_teammate`、`team_task_*`、`wait_agent`、`send_message`）；当前会话没有这些工具时，先提示用户开启 Agent Team，不要退化成单会话顺序扮演。
- 路径约定：`references/`、`agents/`、`templates/` 相对本技能目录；`_shared/` 是上游仓库根的 `shared/`；`scripts/` 是上游 `scripts/` 里正文与合同登记表引用到的运行脚本（测试与 fixture 不分发）。
- 跨技能引用写成 `../<技能名>/...`：侧栏里 ARS 的五个技能要一起勾选才能互相读到；只勾一个时，缺文件的引用按提示降级。
- `shared/` 与 `scripts/` 里的上游脚本可能假设仓库根布局，缺文件时按提示降级，不要因此中断流程。
