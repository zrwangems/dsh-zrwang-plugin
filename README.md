# dsh-zrwang-plugin

DSH 右侧栏My DSH插件：把 262 个技能收在插件仓库里，按**会话**选择要注入的技能。
一级目录（工程/科研/办公）默认都不勾；勾选后才把该一级下已选技能以目录联接挂到
`<项目根>/.agents/skills/`，取消即摘除。技能实体始终只有插件里一份。

## 装什么、怎么生效

| 内容 | 位置 |
| --- | --- |
| 宿主半侧 | `host/`：项目根解析、勾选状态、目录联接、配置读写、HTTP 接口 |
| 浏览器半侧 | `client/` → `lib/client.js`：注册到 `dsh-better-sidebar` 的「My DSH」页签 |
| 组合包补丁 | `cordis.patch.yml`：只插入本插件一行；插件级配置（`configDir`）写在这一行的 `config` 里 |
| 技能实体 | `skills/`：262 个，按工程/科研/办公与官方类别分层 |
| 目录树 | `catalog/catalog.json` + `catalog/defaults.json`：构建种子；运行时读 `<configDir>` 下的同名文件 |
| 上游锁定 | `vendor/upstreams.lock.json`：每个技能的仓库与提交 |
| 插件设置 | `<configDir>/settings.json`：供应商、URL/模型/API Key、nature 检索与图片转 PPT 参数 |
| 目录开关 | 插件自己的 `state/gates.json`：每一级目录的开启/关闭，重开侧栏、换会话都保持 |
| 配置根 | `<configDir>`（固定 `~/.dsh/zrwang-plugin-config`）：`settings.json`、`catalog.json`（目录树）、`defaults.json`（默认启用）、`nature-downloader/`（学校信息与凭据） |

技能可见性完全由项目里的链接决定：未勾选时 DSH 看不到，勾选后由
`dsh-skill-filesystem` 的 watcher 自动刷新，下一步即可用。

## 安装

```powershell
# 桌面端用 plugin_manager / 插件管理界面安装本目录；命令行只对非 desktop profile 生效
dsh plugin --profile web add D:\AgentRelated\DSHRelated\dsh-zrwang-plugin
```

安装后刷新页面，右侧栏 `+` 菜单里出现「My DSH」。

## 用法

1. 新建或打开会话，打开右侧栏「My DSH」。
2. 展开 工程/科研/办公，勾选一级目录 → 该目录下已勾选的技能立即注入。
3. 每一级目录都是开关：点目录只开关这一级的注入，不会改下一级技能的勾选；下层选了哪些、上层关掉就都不注入，重新打开上层恢复原来的下层选择。
4. 技能参数只在「设置 → 插件 → My DSH」详情页的「My DSH 设置」里改（侧栏页签不再放设置）：保存时写回 `<configDir>/settings.json`；密钥填过之后只显示“留空使用已保存凭据”。
5. 没有配置好的技能（例如未填 OCR Token、未配置学校访问信息）在树里置灰、不能勾选，也不会被注入。

默认勾选沿用旧插件的启用集合（170 项）；Polyspace、playground 与新增技能默认关。配置未完成的技能即使默认勾着也不会注入。

## 更新技能

```powershell
node scripts/vendor-skills.mjs   # 重新下载上游、保留 .env 等用户配置
node scripts/gen-catalog.mjs     # 重新生成中文目录树
node scripts/build-client.mjs    # 改了 client/ 才需要
node scripts/verify.mjs          # 262 个技能、中文覆盖、默认集合、语法全检
node scripts/smoke-host.mjs      # 宿主冒烟（不装 DSH）
```

## 目录联接的边界

- 链接是**项目级**的：同一项目里的多个会话共用一套链接，以最近一次同步的会话为准；
  页签底部常显当前项目根。
- 只接管指向本插件 `skills/` 的链接；项目里同名的真实目录不会被覆盖，会作为冲突显示。
- ppt-master 的 `projects` 也以链接方式指向 `<项目根>/.agents/ppt-master/projects`；换项目时重指。
- 设置全部在 `~/.dsh/zrwang-plugin-config/settings.json`；插件源码与 profile 补丁都不含设置。技能运行时需要的 `.env`/TOML/YAML 由设置生成。

## 回滚

`plugin_manager remove_bundle dsh-zrwang-plugin` 卸载；技能实体留在本仓库，
项目里的链接可手动删除（只删链接，不影响插件里的实体）。

## 在 dsh web 里本地测试（不动 desktop）

```powershell
dsh plugin --profile web add dsh-better-sidebar@0.28.1
dsh plugin --profile web add "D:\AgentRelated\DSHRelated\dsh-zrwang-plugin"
dsh --profile web --no-open --port 5080
```

打开终端里打印的 `?token=` 链接。右侧栏 `+` 里是「My DSH」页签（只做勾选）；
「设置 → 插件 → My DSH」详情页里是「My DSH 设置」（ppt-master / nature 系列）。

## 技能详情中文

技能详情的简体中文来自 `catalog/skill-details.zh.json`，是用 Google 翻译预生成并随插件保存的静态内容；运行时**不联网、不调用翻译工具**，详情卡直接读取。
