# 架构与关键取舍

## 1 总体形状

```
右侧栏「My DSH」（dsh-better-sidebar 页签）
        │  HTTP /dsh-zrwang-plugin/*
        ▼
宿主半侧 host/
  ├─ catalog.mjs   读 <configDir>/catalog.json 与 defaults.json（种子在包内 catalog/）
  ├─ sessions.mjs  每个会话的一级勾选（新会话三类全关）
  ├─ selection.mjs 全局技能勾选（初值=旧插件启用集合）
  ├─ farm.mjs      按目标集合建/摘目录联接；ppt-master 的 projects 也走链接
  ├─ skill-settings.mjs  .env / TOML / YAML 表单读写与技能配置卡片
  └─ routes.mjs    同源栅栏 + JSON 接口
        │
        ▼
<项目根>/.agents/skills/<技能>  →  插件 skills/<厂商>/<类别>/<技能>
        │
        ▼
DSH 自带 dsh-skill-filesystem 扫描项目技能根（rank 200），watcher 自动刷新
```

## 2 为什么这样做

### 2.1 技能实体只放插件里，不注册、不改 customSkillDirs

DSH 的 skill 提供商只扫描固定根（项目 `.dsh/skills`、`.agents/skills`、custom、用户根），
插件无法按会话动态改变目录。改成：插件不参与 skill 注册，只把「当前会话勾选的技能」
以目录联接放进项目 `.agents/skills/`，让官方 provider 自然发现。

好处：不改任何预设/补丁；勾选立刻生效（watcher 失效目录）；取消只摘链接，实体只有一份。

代价：链接是项目级的，同项目多会话共享一套，以最近一次同步为准。

### 2.2 一级是会话开关，二/三/四是持久选择

用户明确：三类一级默认都不勾；一级不勾时下级选了也不注入；下级选过之后一直沿用。
所以：

- `state/sessions.json`：`sessionId → { projectRoot, categories }`，只记录一级开关；
- `state/selection.json`：`技能名 → 勾选`，全局持久，初值来自 `catalog.defaults`；
- 每一级目录都是注入闸门：点目录只改这一级的开关（存在插件 `state/gates.json`），不改下一级的技能勾选；注入集合 = 所有祖先目录都开启、叶子勾选为 true 且配置就绪的技能并集。未配置的技能在树上禁选，服务端也会跳过。

### 2.3 官方类别作为三级目录

MATLAB 156 个、Simulink 44 个都来自上游 `skills-catalog/<类别>/<技能>`，
`vendor-skills.mjs` 保留类别层级；Polyspace 19 个与 playground 4 个作为与
matlab/simulink 并列的二级目录，默认关。科研下的 zotero-cli、办公下的 ppt-master 与
html-ppt 是独立技能，直接作为二级技能叶子；任何只剩一个技能的类别也会被折叠成技能叶子。

## 3 状态文件与备份

| 文件 | 内容 |
| --- | --- |
| `state/selection.json` | 技能勾选（全局） |
| `state/gates.json` | 目录级注入开关 |
| `state/sessions.json` | 会话一级开关（最多保留 300 个） |
| `state/links.json` | 每个项目由本插件建立的链接清单 |
| `state/ui.json` | 右侧栏展开状态 |
| `state/events.jsonl` | 客户端 apply/打开页签/设置保存事件，用于排查 |
| `state/backups/` | 写技能配置前的原文件备份 |

## 3.1 技能配置

插件设置（供应商、URL/模型/API Key、nature 检索与图片转 PPT 参数）只放在固定配置目录的 `settings.json`（`~/.dsh/zrwang-plugin-config/settings.json`），设置界面保存时写回这里；插件包与 profile 的 `cordis.patch.yml` 都不含设置或密钥。
`<configDir>`（默认 `~/.dsh/zrwang-plugin-config`）只放“文件类”内容：

| 文件 | 内容 |
| --- | --- |
| `settings.json` | 图片服务供应商与 URL/模型/API Key、nature 检索与图片转 PPT 参数 |
| `catalog.json` | 技能目录树（结构+中文文案） |
| `defaults.json` | 默认勾选集合 |
| `nature-downloader/` | 学校访问信息与凭据（技能默认配置目录已改到这里） |

目录开关属于插件运行态，写在插件自己的 `state/gates.json`，不放进配置根。

保存时同时镜像到技能目录里的同名文件，技能本体照常读取；密钥只回 `hasValue`，保存时留空表示沿用旧值。
设置界面只有插件详情页的 `plugins.bundle.config` 一个入口，侧栏页签只负责勾选。

## 4 技能版本

技能实体随插件版本固定发布，普通安装和日常使用不会自动更新技能。只有维护者在进行项目级升级时，才统一更新 `skills/`、`catalog/` 和上游锁文件；这些操作不属于面向用户的安装流程。`vendor/upstreams.lock.json` 记录每个技能的来源仓库与提交，`catalog.json` 保留同样的溯源字段。

## 5 明确不做

- 不在 profile 补丁里写任何行（本包补丁只插入自己一行）；
- 不注册 `ctx.skills.register`，不改官方预设的 `customSkillDirs`；
- 不删项目里的真实目录或外部链接；同名冲突只报告；
- 不改 SKILL.md（中文只用于界面；模型看到的说明保持上游原文）。
