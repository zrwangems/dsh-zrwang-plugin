# 验证日志

记录每次配置/适配改动后的检查命令与结果摘要。

## 2026-11-13 基线（改动前）

环境：

```text
python (PATH)      = D:\anaconda3\python.exe  3.14.6
python3 (PATH)     = C:\Users\17745\AppData\Local\Microsoft\WindowsApps\python3.exe  （Store 空壳）
bash (PATH)        = C:\Windows\system32\bash.exe  （WSL 空壳，本机无发行版）
convert (PATH)     = C:\Windows\system32\convert.exe  （FAT→NTFS，不是 ImageMagick）
drawio / magick / jq = 未安装
officecli          = 1.0.157（后续自更新到 1.0.161）
zotero-cli         = config 正常（ZOTERO_LOCAL=true）
Agentpy Python     = D:\anaconda3\envs\Agentpy\python.exe  3.11.15，已装 requests/PIL/pptx/playwright/yaml/jsonschema/pypdf/openpyxl/docx/win32com
```

ppt-master：

```text
python <ppt-master>\scripts\image_gen.py --list-backends
  Resolved backend: qwen
  Configuration source: C:\Users\17745\.ppt-master\.env
  （设置里模型是 qwen-image-3.0-pro，但 backend_qwen.py 只支持 qwen-image-2.0-pro）
```

nature-image2ppt：

```text
python <image2ppt>\cli\image2ppt\cli.py doctor
  config: ...\nature-image2ppt\config.yaml (exists)
  OCR: paddleocr-vl token=set source=config
  image CLI fallback: openai-compatible-api (ready)
  image processing: Pillow=ready ImageMagick=C:\Windows\system32\convert.EXE   ← 误判
```

nature-academic-search：

```text
python <academic-search>\scripts\preflight.py
  PubMed  OK
  CrossRef OK
  arXiv   OK
  3/3 endpoints reachable
```

审阅：

```text
node scripts/audit-skill-config.mjs
  技能 301 个，组件 14 个
  待处置=36  已接入设置=241  无需配置=18  不可用=18  可选配置=2
```

## 2026-11-13 审计规则首轮处置后

```text
node scripts/audit-skill-config.mjs
  技能 301 个，组件 14 个
  无需配置=35  已接入设置=253  不可用=22  可选配置=5
```

处置说明：36 个待处置全部人工核对；MATLAB/Simulink 的 home/apikey 命中均为文档示例或第三方服务（NOAA/Databricks/ARTIFACTORY），标为无需配置或可选；officecli/polyspace 的 python3/bash/home/config 属文档内容，profile 忽略；archify 的 home/env 属更新检查缓存，由插件注入 `ARCHIFY_UPDATE_CHECK_DISABLED=1`。

## 2026-11-13 修复后

### 生图配置与 ppt-master 桥接

```text
$env:ZRWANG_IMAGE_BASE_URL='https://example.com/v1'
$env:ZRWANG_IMAGE_MODEL='demo-image-1'
$env:ZRWANG_IMAGE_API_KEY='sk-test'
python <ppt-master>\scripts\image_gen.py --list-backends
  Resolved backend: openai
  Configuration source: process environment
```

在带 `.env`（内容 `IMAGE_BACKEND=qwen`）的临时 cwd 再跑一次，结果仍是 `openai` / `process environment`，证明进程环境优先、项目 `.env` 不再抢配置。

### 设置页到技能文件的链路

在临时 `DSH_HOME` 下保存 `image.{baseUrl,model,apiKey}` 与 OCR 后：

```text
image-check      ✓ 后端：openai；来源：process environment
python-check     ✓ D:\anaconda3\envs\Agentpy\python.exe；依赖齐全
image2ppt        ✓ config: ...\nature-image2ppt\config.yaml (exists) · OCR token=set source=config · image CLI fallback=openai-compatible-api (ready) · next: no action needed
config.yaml      IMAGE2PPT_IMAGE_BACKEND=openai-compatible-api / OPENAI_BASE_URL / IMAGE2PPT_IMAGE_MODEL / OPENAI_API_KEY 均为设置值
```

### Windows 运行时

```text
python3 -c "import sys, pptx, playwright; print(sys.executable)"
  D:\anaconda3\envs\Agentpy\python.exe

PATH 前加 state\bin 后：
  python3 -V  -> Python 3.11.15
  bash -lc 'python -V; python3 -V' -> 均 Python 3.11.15（BASH_ENV 函数注入）
```

### ImageMagick 误判

```text
python <image2ppt>\cli\image2ppt\cli.py doctor
  image processing: Pillow=ready ImageMagick=optional/missing   ← 不再误判 system32\convert
```

### ppt-master 项目目录

创建 `skills/office/ppt-master/projects` 目录联接指向临时目录后：

```text
python <ppt-master>\scripts\project_manager.py init demo_probe --format ppt169
  Project created: ...\skills\office\ppt-master\projects\demo_probe_ppt169_20261113
  （真实落盘在 <项目根>/.agents/ppt-master/projects/demo_probe_ppt169_20261113）
```

### 专利工作目录

```text
oa_home()                         -> D:\Projects\dsh-zrwang-plugin\.agents\patent\oa
map_home()                        -> D:\Projects\dsh-zrwang-plugin\.agents\patent\patent-map
persisted_vault_path()            -> D:\Projects\dsh-zrwang-plugin\.agents\patent\obsidian_vault.txt
persisted_vault_config_path()     -> D:\Projects\dsh-zrwang-plugin\.agents\patent\obsidian_vault.txt
```

### 其他组件

```text
officecli --version     -> 1.0.161
zotero-cli config       -> ZOTERO_LOCAL=true
nature-figure path/get  -> NATURE_FIGURE_CONFIG 指向插件配置目录；backend=python
nature-downloader       -> CONFIG_DIR=<技能目录>/config；school.json 存在
ARS 依赖                -> ✓ 依赖齐全（Agentpy）
MATLAB MCP              -> failed to attach（MATLAB 未运行，需 shareMATLABSession()）
Polyspace / draw.io     -> 未安装，侧栏置灰
```

### 全套静态检查

```text
node scripts/build-client.mjs   -> built lib/client.js
node scripts/verify.mjs         -> 通过 94 项；verify: 全部通过
node scripts/smoke-host.mjs     -> smoke: 全部通过
node scripts/smoke-routes.mjs   -> routes smoke: 全部通过
node scripts/audit-skill-config.mjs --check -> 无需配置=35 已接入设置=253 不可用=22 可选配置=5（无待处置）
```

## 2026-11-13 第二轮重构（插件自带 Python / 配置集中）

```text
runtime/python/venv/Scripts/python.exe --version
  Python 3.11.17
插件依赖检查（yaml/jsonschema/ruamel.yaml/pypdf/defusedxml/openpyxl/
requests/bs4/lxml/markdownify/mammoth/ebooklib/nbconvert/curl_cffi/aiohttp/dateutil/
pptx/XlsxWriter/docx/latex2mathml/PIL/numpy/matplotlib/skia-pathops/uharfbuzz/
edge-tts/fitz/pdfplumber/pypdfium2/cairosvg/cairocffi/colorama/openai/google-genai/
playwright/flask/pybliometrics/mcp/fastembed/sqlite-vec/huggingface_hub/pywin32）
  → 全部可导入（pathops 的包名是 pathops，不是 skia_pathops）
```

生图与 `.env` 隔离：

```text
在含 .env（IMAGE_BACKEND=qwen）的临时 cwd：
python <ppt-master>/scripts/image_gen.py --list-backends
  Resolved backend: openai
  Configuration source: process environment
```

配置集中：

```text
image2ppt doctor
  config: C:\Users\17745\.dsh\zrwang-plugin-config\nature-image2ppt\config.yaml (exists)
  OCR: token=set source=config
  image CLI fallback: openai-compatible-api (ready)
  PPTX renderer: powerpoint-com (ready)
```

`~/.dsh/zrwang-plugin-config/` 下新增：

```text
nature-academic-search/config.toml
nature-image2ppt/config.yaml
nature-downloader/school.json
nature-figure.json
```

`skills/` 下旧的 `nature-image2ppt/config.yaml`、`nature-academic-search/mcp-server/config.toml`、
`nature-downloader/config/school.json` 已移到 `backup-20261113/skill-config-moved/`。

```text
node scripts/verify-skill-config.mjs  -> 14 项通过
node scripts/verify.mjs               -> 通过 92 项
node scripts/smoke-host.mjs           -> 全部通过
node scripts/smoke-routes.mjs         -> 全部通过
node scripts/audit-skill-config.mjs --check -> 无待处置
```

### Playwright Chromium

```text
runtime/python/ms-playwright/chromium-1254/chrome-win64/chrome.exe  已存在
```

经 `PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright` 下载；`applyRuntimeEnv` 会把 `PLAYWRIGHT_BROWSERS_PATH` 指向该目录。

### 配置路径（插件 Python 读取）

```text
ZRWANG_NATURE_ACADEMIC_CONFIG=...\nature-academic-search\config.toml
  academic email=<空> rows=50
patent oa_home()  -> <仓库>/.agents/patent/oa
patent map_home() -> <仓库>/.agents/patent/patent-map
```

### 正常 dsh web 目视

```text
http://127.0.0.1:3080/?token=...
插件 → 已安装插件 → 查看 My DSH
页面文本包含：生图模型 / 科研服务 / 运行环境
GET /dsh-zrwang-plugin/settings cards：
  image(models) / nature-image2ppt(models) / optional-search(research, autoSave) /
  nature-academic-search(research, autoSave) / components(runtime)
组件状态：✓ 插件 Python · ✓ officecli · ✓ zotero-cli · ✗ draw.io · ✗ Polyspace · ✗ MATLAB
```

### nature-skills 配置面补全（2026-11-13）

扫描 24 个 nature 技能的全部源码/配置/文档，结果见 `nature-config-matrix.md`；本轮补齐：

```text
设置页「科研服务」新增：
  Nature 文献下载凭据（Elsevier / Springer Nature / IEEE）
  学校图书馆访问（SSO / CARSI / 资源入口 / WoS / 知网 / EZproxy / 订阅库）
  Nature 生图（OpenRouter Key / 模型 / images endpoint）
  Nature 学术检索增加 Unpaywall 邮箱
  可选检索增加 Firecrawl Key
生成：
  nature-downloader/credentials.json
  nature-downloader/settings.json（open_access.contact_email）
  nature-downloader/school.json（设置驱动）
  nature-image2ppt/config.yaml
  nature-academic-search/config.toml
注入：
  NCBI_EMAIL / NCBI_API_KEY / UNPAYWALL_EMAIL / CROSSREF_MAILTO /
  OPENROUTER_API_KEY / OPENROUTER_IMAGE_MODEL / SCHEMATIC_IMAGE_API_URL /
  FIRECRAWL_API_KEY
```

验证：

```text
node scripts/verify-skill-config.mjs -> 18 项通过
configure_credentials.py show -> 掩码显示 elsevier/springer/ieee
configure_school.py show/validate -> ok（学校 schema 通过）
nature_citation.py --help -> --mailto/--ncbi-email 默认读环境变量
generate_openrouter_schematic.py --dry-run -> 读取 OPENROUTER_IMAGE_MODEL
node scripts/verify.mjs -> 92 项通过
node scripts/smoke-host.mjs / smoke-routes.mjs -> 全部通过
node scripts/audit-skill-config.mjs --check -> 无待处置
```

### 桌面端插件卸载残留清理（2026-11-13）

`~/.dsh/profiles/desktop` 检查结果：`package.json` 的 dependencies / `dsh.profile.bundles`、`pnpm-lock.yaml`、
`cordis.patch.yml`、`node_modules` 均无 `dsh-zrwang-plugin` 引用；桌面端没有插件实体。

已移入回收站：

```text
~/.dsh/profiles/desktop/.plugin-manager/logs/operation-A0Fs47
```

已清理桌面端应用操作历史中的插件记录（原文件备份到
`backup-20261113/desktop-app-operations.jsonl`）：

```text
%APPDATA%\@deepseek-ai\dsh-desktop\plugin-operations\operations.jsonl
  122 行 -> 108 行，删除 14 条 dsh-zrwang-plugin install/remove 记录
```

保留项：

- `~/.dsh/zrwang-plugin-config/`：插件配置目录，当前 **web** 实例仍在使用（不是桌面端专属），未删；
- `~/.dsh/profiles/web/node_modules/dsh-zrwang-plugin`：web 测试实例的插件，未删；
- 桌面端 Chromium `Code Cache` / `Local Storage` 中的编译缓存/界面草稿：属于应用缓存与 UI 状态，不是插件配置；未做破坏性清理。

### 按用户要求收敛设置项并重装 web（2026-11-13）

- 删除「学校图书馆访问」设置卡：学校固定北航，`school.json` 直接随技能放在 `skills/research/nature-skills/nature-downloader/config/school.json`，插件用 `LIT_DL_SCHOOL_FILE` 指向它，不复制到插件配置目录。
- 删除「Nature 生图」设置卡：`OPENROUTER_API_KEY` / `OPENROUTER_IMAGE_MODEL` / `SCHEMATIC_IMAGE_API_URL` 由模型服务的生图 URL/模型/Key 派生。
- 生图模型卡不再从旧 `pptMaster.providers` 迁移出 `qwen-image-3.0-pro`；没有旧 providers 时保持空白，不填任何厂商默认模型。
- 删除 web profile 中该插件的全部配置：`~/.dsh/zrwang-plugin-config` 整个目录移入回收站；卸载 web profile 插件后重新安装。
- 重新安装后设置页只剩：
  - 模型服务：生图（空）、OCR；
  - 科研服务：可选检索、Nature 学术检索、Nature 文献下载凭据；
  - 运行环境：组件状态。
- 生图卡实测值：`baseUrl=''`、`model=''`、`apiKey` 未设置，无 qwen 默认。
- `skills/research/nature-skills/nature-downloader/config/school.json` 为北航固定配置；`~/.dsh/zrwang-plugin-config/nature-downloader/` 只放 credentials/settings，不再复制 school.json。

```text
node scripts/verify.mjs -> 87 项通过，未配置 settings.json 时跳过相关检查
node scripts/verify-skill-config.mjs -> 19 项通过
node scripts/smoke-host.mjs / smoke-routes.mjs -> 全部通过
node scripts/audit-skill-config.mjs --check -> 无待处置
```

## 待补

- DSH 端到端实测（临时 `DSH_HOME` + 临时 profile；需用户同意，不装 Desktop）。
- 用户填好真实生图 URL/模型/Key 后，如需真实出图/OCR，再单独征得同意后验证。
- MATLAB 启动并 `shareMATLABSession()` 后复测 `mcp__matlab__detect_matlab_toolboxes`。

### 上游完整性（局部）

```text
node scripts/audit-upstreams.mjs --only=ppt-master,nature,patent --proxy=...
  yuan1z0825/nature-skills        24/24  0  0  ok
  hugohe3/ppt-master              1/1    0  0  ok
  handsomestWei/patent-...        9/9    0  0  ok
  上游完整性：全部通过
```

另外 `matlab-agentic` 158/158、`simulink` 49/49、`polyspace` 19/19、`playground` 4/4 也通过（同一轮 `--only=matlab-agentic,simulink,polyspace,playground`）。
