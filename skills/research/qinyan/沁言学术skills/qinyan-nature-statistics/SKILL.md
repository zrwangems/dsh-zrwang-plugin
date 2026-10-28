---
name: qinyan-nature-statistics
description: 面向 Nature Portfolio 与高影响力期刊的实验设计一致型统计分析、审查和报告技能。用于定义独立实验单位与重复层级、制定统计分析计划、检查数据质量、选择模型与估计量、计算效应量和不确定性、处理多重比较与敏感性分析，并重写 Methods、Results、表格和图注中的统计文本。触发场景包括 Nature 统计、数据统计、statistical analysis、p value、sample size、effect size、confidence interval、replicates、multiple comparisons、统计方法、图注统计和审稿人统计意见。
---

# 沁言 Nature 统计分析与报告

从研究设计和估计目标出发，再选择模型和检验。统计显著性不能替代效应大小、数据质量或科学意义。

## 工作模式

- `plan`：在分析前定义问题、实验单位、主要终点、模型、校正与敏感性分析。
- `analyse`：用户提供数据后执行可复现分析，并保留数据处理与诊断记录。
- `audit`：审查现有统计方法、结果、表格与图注。
- `rewrite`：在事实充分时生成可粘贴的统计方法或结果文本。
- `review-response`：解析审稿人统计问题，给出验证路径与保守回复要点。

复杂临床试验、监管分析或患者级决策必须服从协议、统计分析计划和专业统计师审核。

## 必须先回答的设计问题

1. 科学问题和主要 estimand 是什么？
2. 独立实验单位是什么，`n` 如何定义？
3. 生物重复、技术重复、子样本、批次和重复测量如何嵌套？
4. 主要与次要终点、组别、时间点和协变量是什么？
5. 分配、随机化、盲法、纳排、缺失和异常如何处理？
6. 哪些比较是预设，哪些是探索性？

这些事实不清时，不给出最终检验选择；使用 `AUTHOR_INPUT_NEEDED`。

## 执行流程

1. **建立设计图。** 画出实验单位、层级、配对、重复测量、批次与时间结构。
2. **定义 estimand。** 指明要估计的差异、比值、斜率、关联、预测性能或时间效应及其目标人群。
3. **审计数据。** 记录数据类型、单位、缺失、范围、重复、异常、排除和变换；保留前后计数。
4. **选择分析策略。** 根据设计、分布、样本量和 estimand 选择模型，不仅依赖正态性检验。读取 [references/analysis-plan.md](references/analysis-plan.md)。
5. **执行与诊断。** 报告模型假设、残差/拟合诊断、收敛、影响点、多重比较和敏感性分析。
6. **解释效应。** 优先给出效应量、置信区间和实际意义，再报告精确 p 值。
7. **对齐图表。** 确保图中数据层级、误差、星号、图注和正文与分析完全一致。读取 [references/reporting-and-figures.md](references/reporting-and-figures.md)。
8. **运行报告审计。** 对统计文本执行 `python scripts/reporting_audit.py <file> --context methods|results|legend`。
9. **交付复现信息。** 提供分析代码、软件版本、随机种子、数据字典、处理日志和未解决风险。

实验单位、伪重复和常见故障读取 [references/design-integrity.md](references/design-integrity.md)。

## 默认输出

```text
Statistical scope
- Mode / input / boundary:
- Scientific question and estimand:
- Independent unit and n:
- Design hierarchy:

Analysis specification
- Outcome / predictors / contrasts:
- Model or test:
- Assumptions and diagnostics:
- Multiplicity:
- Sensitivity analyses:

Results
- Effect estimate and uncertainty:
- Exact inferential result:
- Practical interpretation:

Ready-to-paste reporting
[Methods / Results / legend]

AUTHOR_INPUT_NEEDED
- [事实性缺口]

Reviewer-risk note
- [剩余风险]
```

## 红线

- 不虚构样本量、p 值、自由度、区间、功效、软件版本、排除、随机化或盲法。
- 不把细胞、视野、技术读数、模拟运行或同一个体的多次测量默认为独立 `n`。
- 不用“显著”表示重要、巨大、因果或生物学相关。
- 不因 p > 0.05 宣称“无差异”或“等效”，除非设计支持相应推断。
- 不用组内显著/不显著差异推断组间交互。
- 不通过删除数据、改变终点或尝试多个模型后只报告最佳结果来追求显著性。
- 不把探索性分析包装成预设确认性分析。

## 资料路由

| 任务 | 读取 |
|---|---|
| 实验单位、嵌套、重复测量、伪重复、缺失与排除 | `references/design-integrity.md` |
| estimand、模型选择、诊断、效应量、多重比较与敏感性 | `references/analysis-plan.md` |
| Methods、Results、表格、图注和统计图形报告 | `references/reporting-and-figures.md` |
