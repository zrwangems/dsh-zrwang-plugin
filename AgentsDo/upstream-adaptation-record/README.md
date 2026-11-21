# 上游技能适配记录（升级前必读）

本目录记录 **dsh-zrwang-plugin 对每个上游技能仓库做的全部改动**，以及每个技能/组件的配置接入状态。它不是过程草稿，而是升级上游前必须对照的基线。

## 为什么要有这个目录

`skills/` 下的技能不是上游原样副本。为了让它们在 DSH + Windows 下单独注入后能运行，插件对上游做了三类改动：

1. **vendor 规则改动**：`vendor/upstreams.json` 的 `rewrite` / `renames` / `extraDirs` / `sharedFiles` / `scriptClosure` / `headerNote(s)` / `aliases`；
2. **文件补丁**：`vendor/skill-patches.json` 里的字面替换（改配置路径、加环境桥接、修 Windows 误判等）；
3. **本地副本**：`vendor/local/` 下的 archify、zotero-cli。

这些改动每次 `vendor-skills.mjs` 重建都会重放。直接手改 `skills/` 会被下次 vendor 覆盖，而且不可审计，所以**禁止手改上游文件**。

## 升级上游前必须做的事

1. 读本文件的「更新流程」和 `upstream-modifications.md`，确认要升级的仓库有哪些既有改动；
2. 读 `skill-config-matrix.md`，确认受影响技能当前的配置接入状态和验证命令；
3. 升级/重建后，重新跑 `node scripts/audit-skill-config.mjs`，更新矩阵；
4. 更新 `upstream-modifications.md` 和 `records.json` 的 `lastAuditedLockSha`；
5. 跑完整检查（见根目录 `AGENTS.md` 的「改代码之后的检查顺序」），通过后才算完成。

`scripts/verify.mjs` 会检查 `records.json` 里的 `lastAuditedLockSha` 与 `vendor/upstreams.lock.json` 是否一致；不一致会直接失败，提示先复核上游改动。这条检查就是“升级时必须看本目录”的强制机制。

## 文件说明

| 文件 | 内容 |
| --- | --- |
| `README.md` | 本文件：用途、流程、格式 |
| `upstream-modifications.md` | 上游改动台账：仓库、技能、文件、改动类型、原因、验证方式 |
| `skill-config-matrix.md` | 329 个技能 + 16 个组件的配置接入状态矩阵（人读） |
| `skill-config-matrix.json` | 同上的机器可读版本，由 `scripts/audit-skill-config.mjs` 生成 |
| `nature-config-matrix.md` | 24 个 nature 技能的逐项配置面审计（源码依据、插件落点、未暴露项原因） |
| `component-status.md` | 组件级状态：ARS、officecli、zotero、MATLAB MCP、Polyspace、draw.io、运行时等 |
| `verification-log.md` | 每次检查的命令、日期、结果摘要 |
| `records.json` | 每个上游最后一次审计时的 lock SHA 与日期，供 verify 校验 |
| `backup-<日期>/` | 大改前的 `skills/` 与 `vendor/*.json` 备份（按需） |

## 台账格式

`upstream-modifications.md` 每行一条：

| 字段 | 说明 |
| --- | --- |
| ID | 稳定编号，如 `PPT-01`、`NAT-02` |
| 仓库/技能 | 上游仓库 id 与技能目录 |
| 文件 | 被改的文件（相对技能根） |
| 类型 | `rewrite` / `patch` / `headerNote` / `local-copy` / `runtime-config` / `doc-note` |
| 改动 | 改了什么（字面或规则 id） |
| 原因 | 为什么必须改（DSH/Windows/配置冲突） |
| 验证 | 哪条命令/测试能证明有效 |

新增或修改任何上游改动，必须同时更新台账与矩阵；只改 vendor 不登记视为未完成。

## 复跑命令

```powershell
node scripts/audit-skill-config.mjs            # 重新生成矩阵
node scripts/audit-skill-config.mjs --check    # 有「需修复/未分类」时失败
node scripts/audit-upstreams.mjs --proxy=http://127.0.0.1:7897
node scripts/verify.mjs
```
