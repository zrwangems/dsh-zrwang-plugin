---
name: qinyan-nature-figures
description: 面向 Nature Portfolio 与高影响力期刊的证据驱动科研绘图技能。用于从原始或汇总数据设计单图与多面板 figure、选择合适图形语法、编写 Python/R 绘图代码、重绘现有图件、生成机制示意图草案、撰写图注并导出可编辑 SVG/PDF 与高分辨率 TIFF/PNG；同时检查数据完整性、颜色可访问性、统计标注和最终尺寸可读性。触发场景包括 Nature 绘图、科研作图、论文配图、scientific figure、publication plot、multi-panel figure、graphical abstract、机制图、图形摘要和 figure audit。
---

# 沁言 Nature 科研绘图

先定义图要证明什么，再决定画什么。期刊级图件是证据结构、视觉层级、数据诚信和可复现导出的共同产物。

## 路由

- **定量图件**：使用 Python（matplotlib/seaborn）或 R（ggplot2/patchwork/ComplexHeatmap）。
- **机制图或图形摘要**：先建立概念与关系清单，再使用矢量工具或可用的图像生成能力制作草案；不得用 AI 图替代定量证据。
- **已有图件审查**：同时检查图源代码、最终导出和最终版面尺寸，不能只看屏幕截图。

优先服从用户现有语言与项目栈。用户未指定且不存在项目约束时，默认使用 Python，并在交付中说明；只有选择会显著影响复现或协作时才询问。

## 图件契约

绘图前写出：

1. `Conclusion`：读者看完图后应能复述的一句话。
2. `Evidence hierarchy`：主证据、支持证据、对照与边界。
3. `Panel map`：每个面板的任务、数据和与其他面板的关系。
4. `Data contract`：变量、单位、独立样本、缺失、排除和变换规则。
5. `Statistics contract`：估计量、误差、检验、校正、`n` 与配对/重复结构。
6. `Export contract`：栏宽、目标尺寸、字体、矢量/栅格、分辨率和 source data。

详细模板读取 [references/figure-contract.md](references/figure-contract.md)。

## 执行流程

1. **审计数据。** 保留输入行数、排除规则、变换和聚合前后计数；不得静默删除异常或缺失值。
2. **选择图形。** 根据科学问题、变量类型和实验层级选图，不按“看起来像顶刊”选图。读取 [references/chart-selection.md](references/chart-selection.md)。
3. **规划版面。** 先安排主面板与阅读顺序，再写绘图代码；面板数量服务论证，不追求填满页面。
4. **编码与导出。** 固定随机种子、字体、尺寸、颜色、排序和导出参数；保留可运行源码。
5. **写图注。** 说明样本、`n`、中心量、误差、检验、校正、符号和缩写，使图注可独立理解。
6. **自动预检。** 执行 `python scripts/figure_preflight.py <source.py|source.R> --artifact <figure.svg> ...`。
7. **视觉核验。** 在最终印刷尺寸检查标签、图例、线宽、遮挡、色盲可辨识、面板一致性和缩放后的栅格清晰度。
8. **交付溯源包。** 提供源码、导出文件、source data、参数说明、排除记录和剩余风险。

视觉与导出标准读取 [references/visual-standards.md](references/visual-standards.md)。

## 默认交付

```text
Figure contract
- Conclusion:
- Evidence hierarchy:
- Panel map:
- Data/statistics contract:
- Export contract:

Artifacts
- source:
- vector:
- raster:
- source data:

Integrity log
- input rows:
- exclusions:
- transformations:
- output rows:

Preflight and visual QA
- passed:
- warnings:
- author checks:
```

## 质量门槛

- 图形类型与数据结构、实验单位和统计推断一致。
- 主图尽量展示观测分布或个体点，而非只显示柱高与星号。
- 颜色不作为唯一编码；使用色盲可辨且语义稳定的配色。
- 面板标签、字体、线宽、单位和小数精度一致。
- 矢量文本保持可编辑；照片或显微图按目标尺寸满足分辨率要求。
- 所有排除、平滑、截断、归一化和聚合均可追溯。
- 图注与正文使用相同 `n`、检验、误差和比较方向。
- 机制示意图明确区分已证实关系、推测路径和视觉隐喻。

## 资料路由

| 任务 | 读取 |
|---|---|
| 结论、证据层级、面板、数据与导出契约 | `references/figure-contract.md` |
| 按变量和科学问题选择图形 | `references/chart-selection.md` |
| 字体、颜色、尺寸、矢量/栅格、图注和最终 QA | `references/visual-standards.md` |
