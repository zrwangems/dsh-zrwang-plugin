# 技能选择态 v3（按 DSH 工作区）

> 2026-11 变更：把选择态从「按项目 + 对话」改成「按项目 + DSH 工作区」。本文记录数据模型、
> 用户可见行为、v2 迁移方式，以及「基于此新建」的排障结论，供后续维护与审查。

## 1 用户可见行为

- 每个项目初始只有「默认」：所有层级门禁关闭，注入数恒为 0，不可改名/删除。
- 在「默认」上勾技能、开门禁、批量全选或开关 ARS 时，插件自动为**当前 DSH 工作区**建立模式；
  模式名 = 工作区名（去空白、最多 20 字，重名追加 ` (2)`）。
- 一个工作区只有一个自动模式；**同工作区所有对话共享**同一模式与同一份内容，改动立即写盘。
- 自动模式只在本工作区可见。打开新对话、新建工作区本身不会创建模式。
- 右键自动模式「重命名」→ 升级为项目级命名模式，同项目所有工作区可见，修改同样自动保存。
- 右键任意模式都有「基于此新建」：
  - 「默认」/ 项目级模式 → 复制进当前工作区的自动模式并切过去；
  - 当前工作区的自动模式 → 生成一个项目级副本（命名「源名 (2)」），原自动模式保留。
- 「默认」右键只有「基于此新建」（不可改名/删除）；删除自动模式回「默认」，下次改动会重新生成。
- 工作区在 DSH 侧栏改名且模式名仍是自动生成的，模式名跟随新标题。

## 2 数据模型（`state/presets.json` v3）

```
{
  "version": 3,
  "projects": {
    "<项目根>": {
      "baselineStamp": "<catalog.generatedAt>",
      "modes": [{ "name": "默认", "builtin": true, "gates": {}, "selection": {} },
                { "name": "方案A", "builtin": false, "gates": {}, "selection": {} }],
      "auto":   { "w:<workspaceId>": { "name": "工作区名", "title": "工作区名", "path": "...",
                                       "gates": {}, "selection": {} } },
      "active": { "w:<workspaceId>": "工作区名" },
      "legacy": { "auto": { "<sessionId>": {} }, "active": { "<sessionId>": "未命名" } }
    }
  }
}
```

- 工作区键：`w:<workspaceRegistry 工作区 id>`；没有工作区服务的环境回退成 `p:<项目根>`。
- `active` 按工作区保存（不再按会话），这是「同工作区所有对话一样」的实现基础。
- `legacy` 只在 v2 迁移期存在：某个会话首次访问时把它那份「未命名」搬到当前工作区的自动模式，
  搬完即删；迁移前 `state/backups/` 会留一份 `presets-v2` 备份。

## 3 代码路径

| 文件 | 职责 |
| --- | --- |
| `host/workspaces.mjs` | 会话 → 工作区解析（sessionIds → resolveByPath → 项目根回退）与命名规则 |
| `host/presets.mjs` | v3 状态读写、自动模式创建/复用/改名/升级、v2 迁移 |
| `host/routes.mjs` | 每个读写接口先 `contextOf()` 解析项目根与工作区，再调用 presets |
| `client/tree.mjs` | chips 与右键菜单（「默认」无菜单、自动模式无「基于此新建」） |

## 4 「基于此新建」排障结论（2026-11，DSH 0.2.2-rc.1）

在隔离的 `dsh web` 实例（DSH_HOME 在 `AgentsDo/web-test/`）里逐项验证：

1. HTTP 层：`POST /presets` 的 `create-from` 对「默认 / 项目级模式 / 当前未命名」三种来源都返回 200，
   新模式的 gates/selection 与源一致；`rename`、`delete`、`apply` 也都正常。
2. UI 层：右键 chip 弹菜单 →「基于此新建」→ 新 chip 出现并成为活跃模式，计数正确。
3. 因此旧版不存在“请求发不出去/服务端报错”的功能性故障；用户感知到的“用不了”来自：
   **从「默认」克隆得到的是 0 注入的空壳副本**（默认本身门禁全关），界面看起来什么都没发生。
4. v3 的处理（2026-11 按用户要求调整）：**所有模式（含「默认」和当前工作区自动模式）都提供「基于此新建」**：
   - 从「默认」新建 → 内容复制进当前工作区自动模式（基础态），chips 里会立刻多出以工作区命名的模式；
   - 从项目级模式新建 → 同样覆盖当前工作区自动模式；
   - 从当前工作区自动模式新建 → 因为复制到自己没有意义，改为生成项目级副本「源名 (2)」；
   - 每次操作都会在 `state/events.jsonl` 写 `presets-action`（成功/失败、来源、工作区），便于排障。
5. 每次模式操作都会往 `state/events.jsonl` 写 `presets-action`（成功/失败、来源、工作区）
   便于以后再遇到类似问题时直接看事件日志。

回归测试：`node scripts/smoke-routes.mjs` 覆盖上述三种来源、默认拒绝、跨工作区共享与隔离、
改名升级、删除回默认，并断言事件日志里同时有成功与失败记录。

## 5 本机测试实例（必须先征得用户同意）

> 2026-11 教训：不得私自新建 profile 或把插件装进用户已有 profile（web / desktop）。
> 需要一次性测试环境时先问用户，同意后再建，用完删除（只进回收站），不在机器上留残留。

经用户同意后可用下面的模板；`<一次性目录>` 由当次任务决定，测试结束整体删除：

```powershell
$env:DSH_HOME = 'D:\Projects\dsh-zrwang-plugin\AgentsDo\<一次性目录>\home'
$env:ZRWANG_PLUGIN_STATE_DIR = 'D:\Projects\dsh-zrwang-plugin\AgentsDo\<一次性目录>\state'
dsh --profile <测试 profile> --from-default-profile web --port 60335 --no-open
```

- 插件设置目录跟随 `$DSH_HOME`（`host/plugin-params.mjs`），所以测试不会写用户真实的
  `~/.dsh/zrwang-plugin-config`。
- 测试 profile 的 `cordis.patch.yml` 把 `workspace-controller.documentsDirectory` 指到项目内，
  避免首次启动在用户文档目录创建默认工作区。
- 浏览器验证用 ego lite 全路径：
  `C:\Program Files\Citro Labs\ego lite\Application\<版本>\ego-browser.exe`。
