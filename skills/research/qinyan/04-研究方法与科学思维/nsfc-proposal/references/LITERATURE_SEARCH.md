# NSFC 申请书 · 文献检索策略

撰写国家自然科学基金申请书时，文献检索贯穿"立项依据 → 研究内容（方法） → 研究基础（前期工作对照）"三大模块。本指南给出 Agent 应优先采用的检索路径与每个学部方向的数据源选择。

---

## 1. 优先使用沁言学术统一检索接口

如果运行环境已安装本仓库的 `qinyan-paper-search` Skill 并配置了 `QINYAN_API_KEY`：

```bash
# Google Scholar（综合）
bash ~/.claude/skills/qinyan-paper-search/scripts/search.sh google \
  '{"query": "your topic", "max_results": 20, "date_from": "2020"}'

# PubMed（生物医学，仅英文）
bash ~/.claude/skills/qinyan-paper-search/scripts/search.sh pubmed \
  '{"query": "your topic", "max_results": 50, "date_from": "2020"}'

# ArXiv（理工 / CS / 数学物理，仅英文）
bash ~/.claude/skills/qinyan-paper-search/scripts/search.sh arxiv \
  '{"query": "your topic", "max_results": 50}'

# 万方（中文文献）
bash ~/.claude/skills/qinyan-paper-search/scripts/search.sh wanfang \
  '{"query": "你的关键词", "max_results": 50}'
```

> 在不同工具中安装目录略有差异：Cursor 用 `~/.cursor/skills/`，Codex 用 `~/.codex/skills/`，依此类推。

---

## 2. 按学部方向选择检索库

NSFC 共分 9 个科学部，每个学部的文献覆盖优先级不同：

| 科学部 | 第一优先 | 第二优先 | 第三优先 | 备注 |
|---|---|---|---|---|
| 数学物理科学部 | ArXiv | Google Scholar | INSPIRE-HEP | 数学优先 MathSciNet |
| 化学科学部 | Web of Science | SciFinder / Reaxys | ACS / RSC 期刊网 | 反应/化合物检索用 SciFinder |
| 生命科学部 | PubMed | Web of Science | bioRxiv | PubMed query 必须英文 |
| 地球科学部 | Web of Science | GeoRef | ArXiv (astro-ph) | 大气海洋类可加 NOAA |
| 工程与材料 | Web of Science | IEEE Xplore | Engineering Village | 含材料数据库 MaterialsProject |
| 信息科学部 | ArXiv | DBLP | ACM/IEEE Digital Library | CS 顶会论文优先 ArXiv 预印 |
| 管理科学部 | Web of Science | EconLit | Google Scholar | SSCI 期刊为主 |
| 医学科学部 | PubMed | Embase | Cochrane Library | 临床证据优先 Cochrane |
| 交叉科学部 | OpenAlex | Google Scholar | 学科相关数据库 | OpenAlex 提供跨学科引用网络 |

---

## 3. 检索式模板

### 3.1 立项依据 — 找研究空白

目标：覆盖该方向近 5 年的代表性综述与争议性结论，定位"现有研究的核心矛盾或盲点"。

模板：

```
TS = ("核心研究对象") AND ("核心方法/机制") AND (review OR meta-analysis OR perspective)
TIME-SPAN: last 5 years
SORT: citations / year
```

示例（铁基超导拓扑相变方向）：
- Google Scholar / Web of Science:
  `"iron-based superconductor" AND ("topological phase transition" OR "spin-orbit coupling") AND review 2020..2025`
- ArXiv: `cat:cond-mat.supr-con AND ti:topological AND ti:iron`

### 3.2 研究内容 — 找方法 / 技术路径

目标：找到拟采用方法的奠基论文 + 近 3 年的方法改进。

模板：

```
TS = ("拟采用方法的精确技术名") AND ("应用对象")
FILTER: methods papers, protocol papers
```

### 3.3 研究基础 — 对照本人工作

目标：在写"本人前期工作"时，找到 2~3 篇同方向高引论文作为对照，论证"本人工作处在该方向 frontier"。

模板：

```
TS = ("本人代表作的核心议题") AND PY=最近5年
SORT: citations desc
```

---

## 4. 文献综述的写作要点（结合检索结果）

撰写综述部分时，Agent 应：

1. **按"宏观背景 → 中观研究脉络 → 微观研究空白"逐层聚焦**，每一层引用 2-4 篇代表论文。
2. **不堆砌他人工作**，每段须有评述：用"然而……""但现有研究尚未……"揭示研究缺口。
3. **国内研究单独成段**：评述国内同方向团队近 5 年成果，指出本研究与之的差异（避免重复资助嫌疑）。
4. **引用格式**：APA `(Smith, 2023)` 或编号引用 `[12]`，全文统一。
5. **图表引用须注明出处**并保证版权合规。

---

## 5. AI 辅助检索的合规声明

按 NSFC 2026 年规定：
- ✅ **允许**：使用 AI 辅助检索研究动态、整理参考文献，但**必须人工核实**所有信息真实性
- ❌ **禁止**：使用 AI 直接生成申请书内容；使用未经核实的 AI 生成内容
- ⚠️ **要求**：必须全面如实声明 AI 使用情况，按国家规定对相关内容进行标识

Agent 在协助检索后，应在交付文档末尾附一段建议申请人添加的声明文本，例如：

> 本申请书在文献检索阶段使用了 AI 助手（[工具名/版本]）协助筛选与归类近 5 年相关文献，所有引用的具体观点、数据与结论均由申请人本人核实原文后采纳。申请书正文内容由申请人独立撰写。
