# ARS 写作用域护栏（DSH 版）

上游 ARS 用 Claude Code 的 `PreToolUse` hook 实现“单阶段角色只能写自己阶段目录”的硬护栏。DSH 没有这个 hook，插件改用官方的 [`tools/pre-execute`](../host/ars-write-scope.mjs) waterfall，在每次工具执行前做同样的判定。

## 管什么

只约束 **Bucket A 单阶段角色**，而且只在这个角色作为**独立子代理**运行时生效：

- 写入工具（`write`、`edit`、`apply_patch`、`str_replace_editor`）只能落在 `allowed_write_globs` 允许的目录里，通常就是自己的 `phaseN_*/**`；
- `bash`、`pwsh`、`terminal_send` 一律拒绝。原因和上游一致：命令串既不能可靠判断“会不会写文件”，也不能可靠判断“是不是只读”，全拒绝是唯一不会 fail-open 的策略；
- 逃出会话工作目录的路径（`../`、跨盘绝对路径）拒绝；
- 补丁里没有可识别的文件路径，或写入工具缺 `file_path`，拒绝而不是静默放行；
- 插件自己的护栏文件（phase-scope 清单、`ars_write_scope_guard.py`、本模块等）任何 ARS 子代理都不能改。

主会话、inline 运行的角色、以及不在清单里的 Bucket B/C/D 角色不受这条硬护栏限制，仍按技能正文里的 Phase Boundary 执行。这和上游 `#134` 的范围一致。

## 角色怎么识别

Claude Code 的 subagent 有 `agent_type` 字段，DSH 没有。护栏按下面的顺序从子代理的第一条任务 prompt 里识别角色：

1. `ARS-ROLE: synthesis-agent`（推荐，五个 ARS 技能顶部说明里已经写明派发时要带这一行）；
2. prompt 开头的角色文件 frontmatter，例如 `name: synthesis-agent`；
3. 正文里的 `You are the ... Agent.` 角色声明。

识别到清单里的角色才启用护栏；识别不到就放行，由正文规则兜底。所以派发子代理时最好显式写第一行，别依赖模型的措辞。

## 清单

每个技能的 `scripts/ars_phase_scope_manifest.json` 都是上游 `scripts/ars_phase_scope_manifest.json` 的原样副本（23 个 Bucket A 角色及其 `allowed_write_globs`）。同步时由 `vendor/upstreams.json` 的 `sharedFiles` 规则写入；`npm run verify:ars -- --upstream=<ARS 检出> --strict` 会核对内容与上游一致。

## 和上游的差异

| 上游 | 插件 |
| --- | --- |
| `PreToolUse` hook + `hooks/run_guard.sh` + Python guard | `tools/pre-execute` + `host/ars-write-scope.mjs` |
| `agent_type` 标识角色 | 子代理 prompt 里的 `ARS-ROLE:` / frontmatter / 角色声明 |
| `Write` / `Edit` / `MultiEdit` | `write` / `edit` / `apply_patch` / `str_replace_editor` |
| `Bash` | `bash` / `pwsh` / `terminal_send` |
| 单文件写入 | `apply_patch` 多文件补丁逐个检查，任一越界整单拒绝 |
| workspace 根 = `CLAUDE_PROJECT_DIR` | 会话自己的 `cwd`（`session.header.cwd`） |

插件里的 `skill-guard` 仍然独立生效，负责禁止改插件内的 `skills/` 与 `ars/`；现在它也覆盖 `apply_patch` 和 `str_replace_editor`，不再只拦 `write` / `edit`。

## 自检

```bash
npm run smoke:ars   # 25 项：角色识别、glob、越界、bash/pwsh/terminal_send、多文件补丁、插件护栏文件、pre-execute 接线
npm run verify      # 包含清单分发与护栏接线检查
npm run verify:ars  # 有上游检出时核对清单与全部 ARS 文件
```
