# ARS 与上游项目的对齐记录

本插件里的 ARS 组件不是另写一套，而是把上游 **Imbad0202/academic-research-skills** 的五个技能和命令复制进来，只做 DSH 运行所需的机械适配。这份记录说明当前 pin 在哪一版、改了哪些地方、哪些 Claude Code 专有能力没有搬过来。

## 当前 pin

| 项 | 值 |
| --- | --- |
| 上游仓库 | `Imbad0202/academic-research-skills` |
| 版本 | `3.24.4`（2026-11-19） |
| 提交 | `00315dfea67cba974583debae32b77bdce659301` |
| 同步时间 | 2026-11-21 |
| 许可 | CC-BY-NC-4.0（`vendor/licenses/ars/`） |
| 范围 | 5 个技能、16 个 `/ars-*` 命令、35 个模式 |

同步与核对：

```bash
node scripts/vendor-skills.mjs --only=ars
node scripts/audit-ars-alignment.mjs --upstream=<ARS 仓库检出> --strict
```

`npm run verify:ars` 跑离线审计（pin、目录、命令正文、脚本引用）。有上游检出时用 `node scripts/audit-ars-alignment.mjs --upstream=<ARS 检出> --strict` 做逐文件对照。

## 对齐结果

以 `00315df` 为基准，把每个技能的目录和上游根 `shared/` 逐文件对照：

| 技能 | 上游文件 | 缺失 | 字节一致 | 已知适配 |
| --- | ---: | ---: | ---: | ---: |
| deep-research | 208 | 0 | 134 | 74 |
| academic-paper | 218 | 0 | 139 | 79 |
| academic-paper-reviewer | 184 | 0 | 126 | 58 |
| academic-pipeline | 185 | 0 | 124 | 61 |
| sr-screener | 180 | 0 | 134 | 46 |
| 合计（含 5 份 shared） | 975 | 0 | 657 | 318 |

“已知适配”指差异能被下面这套规则完整解释；审计脚本会先按规则还原，再和上游逐字节比较，还原不了才算漂移。当前漂移为 0。

## 复制与适配规则

1. **技能正文原样复制**：五个技能目录（`SKILL.md`、`agents/`、`references/`、`templates/`、`examples/`、`scripts/`）整目录复制，不删文件、不改方法步骤。
2. **`shared/` 变成技能内的 `_shared/`**：DSH 的技能资源根是技能目录本身，所以每个技能带一份上游根 `shared/`，正文里的 `shared/...` 改成 `_shared/...`。
3. **跨技能引用改相对技能根**：`deep-research/...` 改成 `../deep-research/...`，五个技能一起勾选时能互相读到。
4. **根文件随技能分发**：`MODE_REGISTRY.md`、`docs/ARCHITECTURE.md` 复制到每个技能的 `_shared/`；写作用域清单 `scripts/ars_phase_scope_manifest.json` 原样复制到每个技能的 `scripts/`。
5. **脚本闭包**：扫描技能内 `.md`/`.json` 里点名的 `scripts/*.py`，只带运行时会用到的脚本及其本地 import；测试、fixture、设计文档里的脚本不随包。上游 `sr-screener/scripts/` 本身就在技能里，直接保留。
6. **顶部运行说明**：`SKILL.md`、`agents/*.md`、`references/*.md` 顶部加两行 DSH 事实：输出简体中文；多角色流程用 DSH Agent Team 工具，不要退化成单会话扮演；派发单阶段子代理时在 prompt 首行写 `ARS-ROLE: <角色名>`，供写作用域护栏识别。
7. **描述换短版**：DSH 技能目录只显示前 500 字，上游 2–3 KB 的 description 会把触发词挤掉，所以 frontmatter 换成 `vendor/ars/descriptions.json` 里的双语短描述；原文留档 `_shared/description-original.md`。
8. **`_shared/dsh-runtime.md`**：构建时写入的 DSH 运行说明（Python/bash 由插件注入、写作用域护栏如何生效、路径约定）。
9. **命令重新生成**：上游 `commands/ars-*.md` 是 Claude Code 的薄包装（调用 Skill 工具、指向 `${CLAUDE_PLUGIN_ROOT}`）。插件保留它的模式说明和脚本步骤，把开头换成“加载对应技能”，清掉 Claude 占位路径，`python3` 改成 `python`，`$ARGUMENTS` 改成 `<用户输入>`，再加一条 DSH 运行说明。
10. **工具名对齐 DSH**：`WebSearch`/`WebFetch`/`AskUserQuestion` 改成 DSH 的 `web_search`/`web_fetch`/`ask_user_question`。

## 16 个命令与技能/模式

| 命令 | 技能 | 模式 |
| --- | --- | --- |
| `/ars-full` | academic-pipeline | 十阶段流水线（无独立模式名） |
| `/ars-plan` | academic-paper | plan |
| `/ars-lit-review` | academic-paper | lit-review |
| `/ars-outline` | academic-paper | outline-only |
| `/ars-abstract` | academic-paper | abstract-only |
| `/ars-revision` | academic-paper | revision |
| `/ars-revision-coach` | academic-paper | revision-coach |
| `/ars-citation-check` | academic-paper | citation-check |
| `/ars-format-convert` | academic-paper | format-convert |
| `/ars-disclosure` | academic-paper | disclosure |
| `/ars-rebuttal-audit` | academic-paper | rebuttal-audit |
| `/ars-reviewer` | academic-paper-reviewer | full |
| `/ars-3w` | deep-research | three-way-scan |
| `/ars-mark-read` | （脚本） | 标记人工读阅 |
| `/ars-unmark-read` | （脚本） | 取消标记 |
| `/ars-cache-invalidate` | （脚本） | 清引用核验缓存 |

模式总表在每个技能的 `_shared/MODE_REGISTRY.md`，与上游同一份（只做了路径改写）。

## Claude Code 专有能力对照

| Claude Code | DSH 里的替代 | 影响 |
| --- | --- | --- |
| `SessionStart` 钩子（公告 ARS 已加载） | 不需要；技能目录会列出 ARS | 无 |
| `PreToolUse` 写作用域守卫（`hooks/run_guard.sh` + `scripts/ars_write_scope_guard.py`） | 已用 DSH 官方 `tools/pre-execute` 重写为 [`host/ars-write-scope.mjs`](../host/ars-write-scope.mjs)：Bucket A 子代理只能写 `phaseN_*/**`，`bash`/`pwsh`/`terminal_send` 全拒绝；角色由任务 prompt 的 `ARS-ROLE:` 标记识别。详见 [ars-write-scope.md](ars-write-scope.md) | 行为与上游一致；DSH 没有 `agent_type`，改成 prompt 标记 + frontmatter/角色声明兜底 |
| 插件市场清单、根 `agents/` 子代理声明 | 五个技能内的 `agents/` 角色提示原样保留；多角色由 DSH Agent Team 拉起 | 角色内容不丢，编排方式从 Claude subagent 换成 Agent Team |
| `/plugin` 安装与更新 | DSH 插件安装/升级 | 升级后需重新 vendor 同步 ARS |

## 已知差异（有意为之）

- **输出语言固定简体中文**。上游默认 `zh-TW` 语言对和繁体示例，插件在技能顶部声明与命令正文里统一改成简体；`zh-tw-en` 等代码保留为上游参数名。
- **文件落点**：上游让 Claude Code 按插件根解析资源；DSH 里资源根是技能目录，脚本用对应技能内的 `scripts/` 副本，Python/bash 由插件设置注入。
- **Agent Team 自动开启**：多角色命令执行前插件会替用户打开 DSH 的「智能体团队协作」，与 Claude Code 里直接 Task 派生的体验对齐；无法改开关时（例如子会话）才提示手动开。
