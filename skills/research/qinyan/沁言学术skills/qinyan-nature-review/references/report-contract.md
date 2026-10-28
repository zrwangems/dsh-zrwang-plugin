# 评审报告契约

## Review setup

必须列出：

- 输入范围；
- 评审边界；
- 核心命题；
- 可见证据；
- 影响可信度的缺失材料。

## 三种评审视角

每个视角包含：

- Overall assessment；
- Major strengths；
- Major concerns；
- Minor concerns；
- Not assessable；
- 本视角的风险总结。

视角差异来自问题权重，不来自虚构人物。

## 问题台账字段

| 字段 | 规则 |
|---|---|
| Concern ID | 每条唯一，例如 `A-M1` |
| Issue key | 跨视角合并使用的稳定键，例如 `sampling-external-validity-01` |
| Severity | P0、P1 或 P2 |
| Axis | 概念、证据、方法、统计、复现、图文、伦理 |
| Claim pointer | 稿件中的可定位声称；不可定位写 `NOT_LOCATABLE` |
| Evidence pointer | 图、表、段落、数据或 `NOT_PROVIDED` |
| Concern | 问题本身，不混入解决方案 |
| Why it matters | 对推断或读者的影响 |
| Resolution test | 什么结果或修改能客观表明问题已解决 |

## 共识规则

- 同一 `Issue key` 出现在至少两个视角，才列入 consensus。
- 只因措辞相似不能视为同一问题。
- 共同事实可以复用；问题说明应避免整段重复。
- 一个视角没有提出某问题，不代表它反对该问题。

## Cross-review synthesis

按以下顺序输出：

1. 共同认可的优势；
2. P0 共识风险；
3. P1 共识风险；
4. 仅单一视角提出但值得保留的问题；
5. 各视角权重差异；
6. 最小修复路径；
7. 当前材料无法评估的事项。

不得把综合写成编辑决定或伪造的“多数票”。

## 最终 QA

- Concern ID 全局唯一；
- 所有实质性问题都有 claim/evidence pointer；
- 所有 resolution test 可验证；
- consensus 均满足至少两个视角；
- 没有虚构行号、数据或政策；
- strengths 与 concerns 均来自稿件；
- P0/P1/P2 使用一致；
- 局限与缺失材料没有被当成已证实缺陷。
