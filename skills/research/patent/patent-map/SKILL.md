---
name: patent-map
description: "专利地图：基于通俗解读已入库的 Obsidian 案例，点名后打开五种图。地形按 bge-small-zh 向量摊开。"
user-invocable: false
---
> [dsh-zrwang-plugin] 本技能的数据都在插件设置「科研服务 → 专利数据目录」下面：Obsidian 库是它下面的 `vault/`（`PATENT_READER_OBSIDIAN_VAULT`），向量索引与模型在 `patent-map/`（`PATENT_MAP_HOME`），审查答复在 `oa/`（`PATENT_OA_HOME`），产物在 `outputs/`。不要写 `~/Documents/patent-disclosure-skill`、`~/.patent-disclosure-skill` 或工作区 `.agents/patent/`；没设置好时插件不会注入本技能。
# 专利地图

## 用途

把已经解读入库的案例摊成五种图（语义地形），给代理师找相近案子、看申请人重叠和文内引证。本包只读 vault、起本地页。空白点只表示「库里没读到」。

## 何时用

须用户点名（专利地图 / 案例地图 / `/专利地图` / `/patent-map`）。解读继续只入库。

## 输入

已有解读入库的 vault（与解读同一份：`PATENT_READER_OBSIDIAN_VAULT`，由插件设置指定）。取数优先扫 `Research/Patents/**/*_解读_*.md`。若本机 `obsidian` CLI 可用且库已打开，用 `obsidian vaults` / `base:query` 核对，不替代磁盘扫描。

## 步骤

1. **`Read`** `prompts/guardrails.md` → `intake.md`
2. 确认库路径
3. 启动：

```bash
python ../patent-map/tools/serve_map.py
```

stdout 机读前缀：`MAP_URL:` / `MAP_PORT:` / `MAP_VAULT:` / `MAP_SOURCE:` / `MAP_CACHE:` / `MAP_MODEL:`。端口由系统随机分配（`127.0.0.1:0`）。对话里把 URL 发给用户。

地形图按解读短文向量摊开。加载名 `BAAI/bge-small-zh-v1.5`，磁盘只装 **Qdrant ONNX**（见 `prompts/guardrails.md` 取数）。数据与模型在插件设置的专利数据目录下 `patent-map/`（与 oa 同级，Obsidian 库在旁边的 `vault/`）。未装 `fastembed` 时图仍能开，地形退回 IPC 簇。

可选：

```bash
pip install -r ../patent-map/tools/requirements.txt
python ../patent-map/tools/ensure_model.py
```

单独拷走本包时：`python tools/serve_map.py`。

## 护栏

- 细则 `prompts/guardrails.md`。地图脚本只用本包 `tools/`；解读笔记直接读 vault 文件。

## 产出物

本机页面 URL（`MAP_URL`）。索引与模型在插件设置的专利数据目录下 `patent-map/`。本包**不设**「交付后请确认」。
