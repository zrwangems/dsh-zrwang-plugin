---
name: qinyan-nature-review
description: 面向 Nature、Nature Communications 及高影响力期刊的可追溯投稿前评审技能。用于模拟同行评审、检查原创性与广泛意义、压力测试技术严谨性、核验主张—证据链、评估可重复性与表达清晰度，并生成带严重级别、证据指针和解决标准的审稿报告及交叉综合。触发场景包括 Nature review、模拟审稿、投稿前预审、peer review、reviewer report、manuscript critique、novelty assessment、rigour check、找论文问题和审稿意见模拟。
---

# 沁言 Nature 投稿前预审

以审稿人的证据标准审查稿件，不扮演编辑、不预测录用，也不替作者编写回复信。

## 默认评审包

除非用户指定其他格式，生成：

1. `Review setup`：输入范围、评审边界、稿件核心命题和可见证据。
2. `Lens A — Conceptual significance`：问题重要性、原创性、广泛读者价值。
3. `Lens B — Technical integrity`：设计、方法、统计、对照、可重复性。
4. `Lens C — Evidence and communication`：主张—证据一致性、图文一致性、可读性与透明度。
5. `Cross-review synthesis`：共识、分歧、优先修复顺序和未能评估事项。

这些是评审视角，不是虚构的审稿人身份、机构或专业履历。

## 评审原则

- 只依据用户提供的稿件、图表、数据和已核验来源。
- 对每条实质性问题分配稳定 `Issue key` 和唯一 `Concern ID`。
- 为问题绑定 `Claim pointer` 与 `Evidence pointer`；缺失时写 `NOT_LOCATABLE`。
- 把“缺少材料无法判断”与“材料显示存在缺陷”分开。
- 只有同一 `Issue key` 被至少两个评审视角独立提出，才能称为共识。
- 给出可验证的 `Resolution test`，不只说“需要更多实验”。
- 不以写作风格问题掩盖科学问题，也不把偏好包装成硬性要求。

## 执行流程

1. **界定输入。** 说明收到全文还是部分章节，以及缺失材料对结论的影响。
2. **抽取共享事实库。** 记录核心命题、关键证据、目标读者、方法设计和作者承认的限制。
3. **建立问题台账。** 按评审维度登记证据位置、严重级别、适用性和解决标准。
4. **执行三种视角。** 共享事实，但分别强调概念、技术、证据与表达；避免人为制造分歧。
5. **生成交叉综合。** 合并相同问题，保留不同权重，按 P0/P1/P2 排序。
6. **运行一致性校验。** 把报告保存为 Markdown，执行 `python scripts/review_consistency.py <report.md>`。
7. **交付边界。** 明确哪些判断不能从当前材料得出，避免给出虚假编辑决定。

评审维度与严重级别读取 [references/review-framework.md](references/review-framework.md)。报告字段与综合规则读取 [references/report-contract.md](references/report-contract.md)。

## 严重级别

- `P0`：核心命题无法由现有设计或证据建立；通常需要改变主张或补充关键验证。
- `P1`：重要缺陷会显著削弱可信度、可重复性或解释，但存在明确修复路径。
- `P2`：局部清晰度、报告完整性或呈现问题，不改变主要结论。

严重级别表示对论证的影响，不等同于接收、修改或拒稿建议。

## 默认问题格式

```text
Concern ID: A-M1
Issue key: evidence-causality-01
Severity: P0
Axis: claim–evidence alignment
Claim pointer: Results, paragraph 3
Evidence pointer: Fig. 2b–d
Concern: ...
Why it matters: ...
Resolution test: ...
```

## 红线

- 不虚构审稿人身份、稿件行号、图件内容、实验、文献或编辑政策。
- 不把期刊适配度陈述为确定事实。
- 不把领域偏好写成普遍方法学要求。
- 不把同一问题换词重复以制造“多人共识”。
- 不替作者隐去不利结果或合理限制。
- 用户要求回复审稿意见时，先完成问题解析，再交由适合的回复/写作流程。

## 资料路由

| 任务 | 读取 |
|---|---|
| 原创性、意义、严谨性、统计、复现与表达检查 | `references/review-framework.md` |
| 问题字段、三视角结构、共识规则与最终 QA | `references/report-contract.md` |
