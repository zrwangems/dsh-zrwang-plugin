# 审查答复案例库

运行时数据落在插件设置「科研服务 → 专利数据目录」下的 `oa/`（插件注入 `PATENT_OA_HOME`；不写项目目录）：

| 路径 | 用途 |
|------|------|
| `<PATENT_OA_HOME>/data/oa_vectors.sqlite` | sqlite-vec 向量库 |
| `<PATENT_OA_HOME>/cases/` | 无 Obsidian 库时的 oa 回退根 |
| `<PATENT_OA_HOME>/embedding-state.json` 之外 | 没有 embedding.config.yaml，也没有 embedding.secrets.yaml |

嵌入模型、向量维度、API Key 都在 DSH 插件设置「科研服务 → 专利检索向量模型」里（专利数据目录也在同一张卡片）；本技能只读注入的 `PATENT_EMBEDDING_*` / `ZRWANG_PATENT_EMBEDDING_CRED`。

正式案例优先写入 **Obsidian**（方案 C）：

```
{vault}/oa/
  _OA索引.md
  _OA看板.base
  _OA关联.canvas
  cases/history/   # status=history，可检索
  pending/         # 待答复
  drafts/          # 人审草稿
```

`{vault}` 来自插件设置的「专利数据目录」下的 `vault/`（`PATENT_READER_OBSIDIAN_VAULT`）。

刷新：`python ../patent-oa/tools/refresh_vault.py`  
只读统计（不写索引）：`python ../patent-oa/tools/refresh_vault.py --inventory`  
仓库源稿是 `assets/obsidian/oa.base.yaml`（部分技能市场不允许提交 `.base`）；写入库时仍为 `_OA看板.base`。  
流程见 `../patent-oa/prompts/` 与 [SKILL.md](../SKILL.md)。
