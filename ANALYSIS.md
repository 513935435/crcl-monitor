# CrazyRich.ai 中文站分析

## 1. 站点架构判断

基于 `https://crazyrich.ai/zh`、`/zh/portfolio`、`/zh/reports`、`/zh/research/sources` 的页面结构，可以较高置信度判断该站点采用了以下架构：

- 前端框架：`Next.js App Router`
- 渲染模式：服务端预渲染 + 客户端补数
- 样式系统：`Tailwind CSS` 风格原子类
- 国际化：路由级多语言，至少支持 `en` / `zh`
- 数据层：服务端输出首屏摘要，复杂模块在客户端加载
- 持久化：站内文案明确提到 `PostgreSQL`
- 市场数据：站内文案明确提到 `Polygon.io`
- 社媒提取：站内文案明确提到 `Grok AI` 用于 X/Twitter 信息抽取
- API：站内文案明确提到公开接口 `/api/claw/breakouts`

### 页面层级

首页聚合了 6 类核心模块：

1. 品牌与市场状态
2. 供应链总览 KPI
3. Heatmap / Layer Strength / RS 排行
4. 实时快讯
5. 深度研报
6. 页面跳转入口（组合、报告、突破、社媒 Alpha）

### 技术实现特征

- HTML 中出现了 `/_next/static/chunks/*`、`self.__next_f.push(...)`，这是典型 Next App Router + RSC（React Server Components）痕迹。
- 导航、文案、路由都按 locale 切分，说明国际化在应用层完成，而不是单纯静态翻译。
- 首页部分图表区域首屏显示 `Loading...`，说明图表与某些表格数据是客户端水合后请求或计算。
- `portfolio` 和 `research/sources` 页面出现明显客户端根组件与延迟加载，说明图形/排行类页面更偏交互型。

## 2. 投资逻辑

这个站并不是“泛 AI 资讯站”，而是一个围绕“AI 供应链”构建的主题投资操作系统。

### 核心投资框架

- 主线不是直接押注大模型公司，而是押注 AI 基础设施供给链
- 资产组织方式不是按国家/行业，而是按供应链层级
- 决策偏好不是叙事优先，而是“价格结构 + 产业链位置 + 信息源胜率”三者结合

### 站内明确的策略逻辑

#### 1. 产业链分层

站内把 AI 主题拆成多个 layer，例如：

- Raw Materials
- Semiconductor Equipment
- Foundries
- Memory & Storage
- Processors
- Networking
- Data Centers
- Energy Infrastructure
- Software & Models

这意味着它不是在“找热门 AI 股票”，而是在寻找：

- 哪个环节最强
- 强势环节内部谁最强
- 主题轮动正从哪里流向哪里

#### 2. 相对强度优先

首页和报告页反复出现：

- Mansfield RS
- RS Leaderboard
- Layer Strength
- Alpha vs SMH
- Alpha vs QQQ

这说明它并不只看绝对涨跌，而是看：

- 个股是否跑赢板块
- 板块是否跑赢大盘
- 来源信号是否真能提升选股质量

#### 3. 形态驱动交易框架

站内“关于”文案明确列出 5 类扫描器：

- VCP
- Episodic Pivot
- Power Breakout
- O'Neil pattern
- Base Recovery

这属于典型的成长股 / 趋势交易体系，不是价值投资框架。其交易逻辑是：

- 用技术形态识别可进场时点
- 用评分系统过滤低质量 setup
- 用 breakout -> strong -> trim -> exit 的生命周期管理仓位

#### 4. 投资组合不是等权静态持有

站内明确披露两套组合：

- V5.3 milestone system
- 4-Pool tiered system

也就是说核心思想不是“选出好股票后拿着”，而是：

- 小仓试错
- 给赢家加仓
- 给输家止损
- 用制度化的升降级和再配置提高资金效率

### 投资逻辑总结

一句话概括：

> 用 AI 供应链主题约束研究范围，用相对强度确定主战场，用形态扫描决定时点，用组合管理放大赢家。

## 3. 信息采集与处理逻辑

该站最有差异化的，不是页面，而是“把信息源量化”的这一层。

### 采集对象

从 `research/sources` 页面可见，其重点采集对象是 X/Twitter 上的垂直 KOL / 研究账号，而非泛财经媒体。

页面中出现大量 `source_handle`，并针对每个 handle 计算：

- total_signals
- hit_rate_5d
- hit_rate_20d
- hit_rate_any_horizon
- avg_alpha_vs_smh
- avg_alpha_vs_qqq
- alpha_hit_rate
- avg_return_hit
- avg_return_miss
- edge_score
- inflection_attempts
- inflection_hits
- best_signal_type
- signal_noise_ratio

这说明它的信息采集不是“抓帖子展示”，而是：

1. 抓取 KOL 发言
2. 从发言里抽出 ticker / 方向 / 逻辑
3. 把发言转成可回测信号
4. 按时间窗口统计这些信号的结果
5. 反过来为信息源本身打分

### 信息处理链路推断

高置信度推断的数据流如下：

1. 市场行情入库
2. 建立 AI 供应链股票池与 layer 映射
3. 每日跑技术扫描器
4. 从 X 抽取文本信号
5. 识别 ticker、方向、主题、催化剂
6. 将信号与后续价格表现对齐
7. 计算 Alpha / Edge / 命中率
8. 生成快讯、日报、研报与排行榜

### 这种采集逻辑的商业价值

它解决了两个传统痛点：

- 社交媒体信息太多，难以判断谁长期有效
- 单一热门板块中“都看多”不等于“能选出跑赢者”

因此它卖的不是“资讯”，而是：

- 信号筛选
- 来源排序
- 主题地图
- 策略执行上下文

## 4. 商业与产品逻辑

CrazyRich 本质上更像：

- 主题投资 intelligence terminal
- AI 供应链垂直版 Bloomberg / FinChat / Koyfin + social alpha layer

它的产品飞轮大致是：

1. 先定义窄而强的主题宇宙
2. 用自动化扫描生成可消费内容
3. 用社媒来源排名建立差异化数据资产
4. 用报告和组合页增强用户粘性
5. 最终形成订阅型研究产品

## 5. 适合复刻的范围

若要做“中文版复刻”，建议先复刻以下最有价值的 80%：

- 首页总览
- 供应链 layer 强弱
- RS 排行榜
- 快讯流
- 研报卡片
- 来源排行榜
- 组合策略说明

短期不必一开始就复刻：

- 真实行情接入
- 用户系统
- 全量回测引擎
- 全部 ticker 详情页

## 6. 本项目复刻策略

本仓库采用“静态高保真 + 数据结构可扩展”的方式复刻：

- 纯前端，无需先接数据库
- 数据以本地 JS 对象模拟
- 模块结构按未来接 API 的方式拆分
- 页面内容为中文优先
- 明确保留“架构、投资逻辑、信息采集逻辑”说明，方便后续继续产品化

## 7. 原站依据

分析依据来自以下页面在 2026-03-13 的在线抓取结果：

- [CrazyRich 首页](https://crazyrich.ai/zh)
- [CrazyRich 组合页](https://crazyrich.ai/zh/portfolio)
- [CrazyRich 报告页](https://crazyrich.ai/zh/reports)
- [CrazyRich 来源页](https://crazyrich.ai/zh/research/sources)
