# UI 设计指南

> **设计类型**: App 设计（应用架构设计）
> **确认检查**: 本指南适用于可交互的应用/网站/工具。

> ℹ️ Section 1 为设计意图与决策上下文。Code agent 实现时以 Section 2 及之后的具体参数为准。

## 1. Design Archetype (设计原型)

### 1.1 内容理解（每项一句话，不展开）

- **目标用户**: 东风奕派整车性能工程师，高频处理百兆级 CSV 测试数据，需确定感与掌控感
- **核心目的**: 同步飞书多维表格车型配置数据，通过 AI 智能查询实现数据探索与分析
- **情绪基调**: 专注高效 / 避免焦虑与信息过载

### 1.2 设计方向（每项一行）

- **Design Style**: Grid 网格 + Soft Blocks 混合 — 数据工具需精确对齐感，同时用柔色块区分分块状态降低认知负荷
- **Application Type**: SaaS Tool — 单页 AI 查询工作台，无全局导航
- **Aesthetic Direction**: 工业精密感：深蓝主色 + 等宽数字 + 状态色脉冲动画，传递「大数据已拆解就绪」的掌控感

## 2. Color System (色彩系统)

**色彩关系**: 深蓝主色（汽车工程权威感）+ 冷灰蓝底（长时间使用不疲劳）+ 语义状态色（导入进度可视化）
**配色设计理由**: 汽车行业性能数据场景需专业克制，避免高饱和干扰；状态色仅用于分块卡片和进度条，收敛注意力
**主色推导**: Primary 取深蓝 hsl(215 60% 42%)，呼应东风奕派品牌调性，用于「同步数据」「查询」等关键行动按钮
**使用比例**: 70% 中性冷灰底 / 20% 白色卡片容器 / 10% 深蓝主色+状态色点缀；primary 仅出现在 CTA 按钮、激活态 Tab、进度条填充

### 2.1 主题颜色

| Token                | HSL 值              | 说明                                     |
| -------------------- | ------------------- | ---------------------------------------- |
| `background`         | hsl(216 25% 97%)    | 冷灰蓝页面底色，减少大屏眩光             |
| `card`               | hsl(0 0% 100%)      | 纯白卡片容器，与背景形成层次             |
| `foreground`         | hsl(215 30% 14%)    | 深墨蓝主文字，比纯黑更护眼               |
| `muted-foreground`   | hsl(215 15% 52%)    | 次要说明文字                             |
| `primary`            | hsl(215 60% 42%)    | 深蓝主交互色                             |
| `primary-foreground` | hsl(0 0% 100%)      | 主按钮文字                               |
| `accent`             | hsl(215 40% 95%)    | 次级交互反馈（hover/focus/骨架屏）       |
| `accent-foreground`  | hsl(215 30% 25%)    | accent 上的文字                          |
| `border`             | hsl(215 20% 88%)    | 细分隔线与边框                           |

### 2.2 Topbar/Header 设计策略

- **背景策略**: `bg-card` + 底部 `border-b border-border`
- **文字/图标**: 默认 `text-muted-foreground` / 激活态 `text-primary font-semibold` + 底部 2px `bg-primary` 指示条 / Hover `text-foreground`
- **边框与分隔**: 底部 `border-border` 细线，Tab 间距 `gap-8`

### 2.3 语义颜色

| 用途           | HSL 值              | 衍生说明                                  |
| -------------- | ------------------- | ----------------------------------------- |
| 成功/已完成    | hsl(152 55% 42%)    | 分块卡片绿色勾、统计卡数字跳动完成态      |
| 警告/导入中    | hsl(215 60% 55%)    | 蓝色脉冲动画，与 primary 同色相不同明度   |
| 错误/失败      | hsl(4 70% 52%)      | 分块卡片红色叹号、删除确认               |
| 待处理/禁用    | hsl(215 15% 72%)    | 未导入分块灰色态                          |

## 3. Typography (字体排版)

- **Heading**: Inter + "PingFang SC", "Microsoft YaHei", sans-serif
- **Body**: Inter + "PingFang SC", "Microsoft YaHei", sans-serif
- **Mono/数字**: JetBrains Mono, "SF Mono", monospace — 统计卡数字、分块大小、表格数值、代码块专用
- **字体策略**: Inter 提供西文精密感；JetBrains Mono 确保数据列对齐与可读性；中文回退栈覆盖 macOS/Windows

## 4. Layout Strategy (布局策略)

- **导航策略**: 无 Tab 导航 — 单页应用，Header 仅显示品牌标识
- **页面架构**: 单栏居中工作台 `max-w-5xl`，垂直流式布局：统计栏+同步按钮 → AI 查询区 → 查询结果 → API 指南
- **响应式**: 移动端 Tab 缩略为图标+文字、统计卡 2×2 网格、表格横向滚动；桌面端保持单栏 5xl 宽度

## 5. Visual Language (视觉语言)

- **形态参数**: 圆角 `rounded-lg (0.5rem)` · 阴影 `shadow-sm` 卡片 / `shadow-none` 内部元素 · 间距基调 `standard (gap-4/p-6)`
- **识别签名**: ① 统计卡数字用 JetBrains Mono + font-bold ② 同步按钮带实时进度显示 ③ 查询结果表格紧凑排版
- **装饰策略**: 仅用状态色条和进度条脉冲动画作为功能性装饰，无纯装饰元素
- **动效原则**: 数字跳动 300ms ease-out；分块状态切换 200ms；导入中脉冲 1.5s infinite
- **可及性**: 正文对比度 ≥ 4.5:1；状态色不作为唯一信息载体（配图标/文字标签）；复杂背景加遮罩

## 6. Component Principles (组件原则)

- **状态完整性**: 同步按钮覆盖 待同步/同步中(旋转动画+进度数字)/已完成 三态；查询按钮覆盖 Default/Hover/Active/Focus/Disabled
- **层级清晰**: 「查询」用 `bg-primary text-primary-foreground`；同步按钮用 `variant="outline"`；示例提示词卡片用 `bg-accent text-accent-foreground`
- **一致性**: 所有卡片统一 `rounded-lg shadow-sm p-6`；表格行高 `h-12`；状态标签统一胶囊形 `rounded-full px-2.5 py-0.5 text-xs font-medium`

## 7. Image Direction (图片与视觉资产，按需)

- **Image Role**: 空状态插画（AI 查询无结果时）
- **Image Art Direction**: 线性描边风格，深蓝单色，几何抽象的数据图表+放大镜组合，留白充足，与 Grid 风格一致
- **Image Prompt Keywords**: line art, minimalist, data visualization, magnifying glass, blueprint style, single color blue, geometric, clean background
- **Image Avoidance**: 3D 渲染人物、渐变彩色插图、通用科技感粒子图、写实照片

## 8. 应避免 (Anti-patterns)

- ❌ 使用紫色/粉色渐变或默认 Tailwind blue-500 作为主色 — 偏离汽车行业专业调性
- ❌ 统计卡和表格使用衬线字体或大字号标题体 — 破坏数据密度与对齐精度
- ❌ 给分块卡片添加投影重叠或 3D 效果 — 增加视觉噪音，削弱「精密工具」感

## 9. 技术架构

### 页面路由
- `/` → AI 智能数据查询（含多维表格同步功能）

### 后端模块
- `server/modules/import/` — 多维表格全表同步、数据统计、CSV 分块入库
- `server/modules/ai/` — 两阶段 AI 查询（意图理解→SQL生成）、支持多轮对话上下文、OpenAPI 对外接口
- `server/modules/feishu/` — 飞书 SDK 集成（Wiki Token 解析）

### 插件实例
- `query_intent_understanding_1` — 查询意图理解，拆分关键词、推荐搜索字段（服务端调用，两阶段查询第一阶段）
- `natural_language_to_sql_query_1` — 自然语言转 SQL 查询条件（服务端调用，两阶段查询第二阶段）
- `csv_file_structure_analysis_1` — CSV 文件结构分析与导入建议（服务端调用）

### 数据库表
- `csv_file` — CSV 文件基础信息（名称、大小、列名、分块数、状态）
- `csv_chunk` — 分块导入状态（关联文件、行号、行数、大小、状态）
- `imported_data` — 导入的结构化数据（JSONB 动态字段）
- `query_cache` — AI 查询缓存（归一化查询文本→SQL条件+回答，命中时跳过AI调用）

### 前端页面结构
- `client/src/pages/AiQuery/` — AI 多轮对话查询页（含 ConversationBubble.tsx、DataStatsBar.tsx、ApiGuidePanel.tsx）
- `client/src/api/import.ts` — 同步/统计相关 API
- `client/src/api/ai.ts` — AI 查询 API
- `shared/import.ts` / `shared/ai.ts` — 前后端共享类型