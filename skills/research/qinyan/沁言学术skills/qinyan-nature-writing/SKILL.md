---
name: qinyan-nature-writing
description: 面向 Nature、Nature Communications 及同等级综合期刊的证据驱动论文写作技能。用于从已核验的结果、图表、实验记录或中英文草稿构建标题、摘要、引言、结果、方法、讨论、结论和首次投稿材料；也用于重组论文论证、建立 claim–evidence map、控制声称边界和开展投稿前完整性检查。触发场景包括 Nature 写作、论文起草、章节重写、scientific writing、manuscript drafting、abstract、introduction、results narrative、discussion、cover letter、投稿材料。
---

# 沁言 Nature 论文写作

把论文视为一条可审计的论证链，而不是一组“像顶刊”的句子。先锁定事实和证据，再安排读者路径，最后写作。

## 工作边界

- 处理从材料到论文章节的起草、重构与首次投稿材料。
- 将纯语言精修交给 `qinyan-nature-polishing`。
- 将投稿前同行评审交给 `qinyan-nature-review`。
- 将统计设计与报告核验交给 `qinyan-nature-statistics`。
- 将科研图设计和导出交给 `qinyan-nature-figures`。
- 不生成不存在的结果、机制、统计显著性、参考文献、实验细节或期刊政策。

## 必须先建立的写作底稿

从用户材料中提取并明确标注：

1. `Central claim`：论文实际证明或支持的核心命题。
2. `Evidence set`：支撑命题的图、表、实验、模型、数据集和统计结果。
3. `Boundary`：证据不能支持的外推范围、机制解释或因果结论。
4. `Audience`：跨领域读者为何应关心，以及专业读者需要看到什么。
5. `Terminology ledger`：方法、数据集、指标、缩写、符号的唯一标准写法。
6. `Unresolved facts`：仍需作者确认的事实；统一写为 `AUTHOR_INPUT_NEEDED`。

如果核心命题、关键证据或边界缺失，先给出可继续工作的框架与缺口清单，不补造正文事实。

## 执行流程

1. **分类任务。** 确定论文类型、目标章节、目标期刊、源语言、字数限制和交付格式。
2. **构建论证脊柱。** 用一句话表达“研究对象—关键进展—方法—证据—适用边界”。
3. **建立证据矩阵。** 为每个主要声称绑定至少一个证据位置；把无证据声称降级、删除或标为待补。
4. **设计章节职责。** 让每段只承担一个主要功能：背景、缺口、方法、发现、比较、解释、意义或局限。
5. **按证据顺序起草。** 先写结果与图件逻辑，再写方法和讨论，最后收束摘要与标题；用户指定其他顺序时服从用户。
6. **校准表达强度。** 区分观察、关联、预测、干预和机制证据；使动词强度与证据层级一致。
7. **运行结构审计。** 对文本文件执行 `python scripts/manuscript_audit.py <file>`，处理 blocker 与 warning。
8. **交付并暴露缺口。** 给出可粘贴正文、关键编辑说明、证据风险和作者待确认项。

需要章节级结构时读取 [references/section-blueprints.md](references/section-blueprints.md)。需要完整论证与证据映射方法时读取 [references/argument-workflow.md](references/argument-workflow.md)。需要首次投稿材料时读取 [references/submission-package.md](references/submission-package.md)。

## 默认输出

```text
写作设定
- 论文类型 / 章节 / 目标期刊：
- 核心命题：
- 证据边界：

论证与段落地图
- P1:
- P2:

可粘贴正文
[draft]

证据与措辞风险
- [claim] → [evidence pointer / missing]

AUTHOR_INPUT_NEEDED
- [仅列事实性问题]
```

用户只要求正文且材料充分时，简化输出，但仍保留必要的风险标记。

## 质量门槛

- 每个主要声称都能回指用户提供的证据。
- 摘要中的结果、方向和数值与正文一致。
- 引言提出的缺口由本研究真正回应。
- 结果段不把解释冒充观察，讨论段不引入未展示的新结果。
- 局限具体说明适用边界，不写成礼貌性尾句。
- 标题与摘要避免无法核验的“首次”“突破性”“普适”等表述。
- 首次投稿材料中的作者、单位、利益冲突和推荐审稿人信息均由作者确认。

## 资料路由

| 任务 | 读取 |
|---|---|
| 建立 claim–evidence map、论证脊柱或术语账本 | `references/argument-workflow.md` |
| 起草或重构具体章节 | `references/section-blueprints.md` |
| cover letter、title page、声明与投稿检查 | `references/submission-package.md` |
