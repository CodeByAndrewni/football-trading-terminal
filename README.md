# ⚽ 足球交易决策终端 | Football Trading Terminal

<div align="center">

**实时足球比赛分析与交易决策系统**

[![部署状态](https://img.shields.io/badge/Vercel-部署-success?style=flat&logo=vercel)](https://vercel.com)
[![技术栈](https://img.shields.io/badge/React-18.3-61dafb?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646cff?style=flat&logo=vite)](https://vitejs.dev/)
[![API端点](https://img.shields.io/badge/API端点-15个-green?style=flat)](./api/football)

[在线演示](https://github.com/CodeByAndrewni/football-trading-terminal) · [部署指南](./.same/vercel-deployment-guide.md) · [API文档](./.same/api-endpoints-status.md)

</div>

---

## 📖 项目简介

足球交易决策终端是一个专业的实时足球比赛分析系统，基于多维度数据分析提供 **80分钟进球概率评分**，帮助用户做出更明智的交易决策。

### 核心特性

🎯 **动态评分系统 (7大因子)**
- 比分因子 / 进攻因子 / 动量因子 / 历史因子 / 特殊因子
- **新增：赔率因子** (最高+20分)
- 实时 80+ 高评分比赛雷达监控
- 评分历史趋势可视化

📊 **实时数据分析**
- 集成 API-Football v3 真实数据
- **15个 API 端点全覆盖**
- 15-30秒自动刷新
- STRICT REAL DATA MODE (严格真实数据模式)

💰 **赔率分析系统 (新增)**
- 赛前赔率 / 滚球赔率
- 让球盘变化检测
- 大小球赔率监控
- 多家博彩公司同向变动检测

🔍 **多维度筛选**
- 场景快速筛选（强队落后/红牌/角球密集）
- 评分区间筛选（80-85/85-90/90+）
- 自定义筛选预设保存

⚡ **角球分析系统**
- 角球时间分布分析
- 角球累计趋势预测
- 盘口建议（大球/小球）

📈 **高级功能**
- API 官方预测数据
- 联赛积分榜
- 球员比赛统计
- 球队伤病信息
- 回测系统（策略验证）
- 历史记录追踪
- 数据导出（CSV/JSON）

---

## 🚀 快速开始

### 前置要求

- [Bun](https://bun.sh/) >= 1.0 或 [Node.js](https://nodejs.org/) >= 18
- [API-Football](https://www.api-football.com/) API Key（可选，用于真实数据）

### 本地开发

```bash
# 1. 克隆仓库
git clone https://github.com/CodeByAndrewni/football-trading-terminal.git
cd football-trading-terminal

# 2. 安装依赖
bun install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key

# 4. 启动开发服务器
bun run dev

# 5. 打开浏览器访问
# http://localhost:5173
```

### 环境变量配置

创建 `.env` 文件并添加：

```env
# API-Football v3 API Key
# 获取地址: https://www.api-football.com/
FOOTBALL_API_KEY=your_api_key_here
```

---

## 🔌 API 端点清单 (15个)

### 已集成的 API-Football 端点

| 端点 | 说明 | 缓存 |
|------|------|------|
| `/api/football/live` | 进行中比赛 | 10s |
| `/api/football/fixture/[id]` | 比赛详情 | 10s |
| `/api/football/fixture/[id]?stats=true` | 含统计数据 | 10s |
| `/api/football/fixture/[id]?events=true` | 含比赛事件 | 10s |
| `/api/football/lineups/[id]` | 阵容数据 | 60s |
| `/api/football/h2h` | 历史对战 | 300s |
| `/api/football/team-stats/[id]` | 球队赛季统计 | 3600s |
| `/api/football/odds/[id]` | 赛前赔率 | 300s |
| `/api/football/odds/live/[id]` | 滚球赔率 | 10s |
| `/api/football/predictions/[id]` | API官方预测 | 600s |
| `/api/football/standings/[league]` | 联赛积分榜 | 3600s |
| `/api/football/players/[id]` | 球员比赛统计 | 30s |
| `/api/football/injuries/[team]` | 伤病信息 | 3600s |
| `/api/football/leagues` | 联赛列表 | 86400s |

### API 使用示例

```typescript
import {
  getLiveMatches,
  getOdds,
  parseOddsData,
  getPredictions,
  getStandings
} from './services/api';

// 获取进行中比赛
const matches = await getLiveMatches();

// 获取赔率并解析
const odds = await getOdds(fixtureId);
const analysis = parseOddsData(odds);
// analysis.matchWinner → { home: 2.1, draw: 3.4, away: 3.2 }
// analysis.goalExpectation → 'HIGH' | 'MEDIUM' | 'LOW'

// 获取API预测
const prediction = await getPredictions(fixtureId);
// prediction.predictions.percent → { home: "45%", draw: "25%", away: "30%" }

// 获取积分榜
const standings = await getStandings(39); // 英超 ID=39
```

---

## 📊 评分系统

### 7大评分因子

| 因子 | 最高分 | 说明 |
|------|--------|------|
| 基础分 | 30 | 固定基础分 |
| 比分因子 | +25 | 平局/1球差/强队落后 |
| 进攻因子 | +30 | 射门/角球/xG |
| 动量因子 | +35 | 近期射门/下半场强度 |
| 历史因子 | +25 | 75+分钟进球率 |
| 特殊因子 | ±20 | 红牌/换人/VAR |
| **赔率因子** | **+20** | **赔率变化/市场预期** |
| **理论最高** | **135** | 含赔率因子 |

### 赔率因子详情 (新增)

| 条件 | 分数 |
|------|------|
| 让球盘收紧 (如 -1.5 → -1.0) | +10 |
| 大球赔率急跌 > 0.15 | +8 |
| 3家以上博彩同向变动 | +12 |
| 临场变盘 | +8 |
| 赔率与xG背离 | +6 |
| 市场高进球预期 | +6 |
| 让球盘放宽 | -5 |

### 使用含赔率的评分

```typescript
import { calculateDynamicScoreWithOdds } from './services/scoringEngine';

const result = calculateDynamicScoreWithOdds(match, {
  homeTeamStats,
  awayTeamStats,
  oddsAnalysis,
  previousOdds, // 用于检测变化
});

// result.totalScore 最高可达 120
// result.factors.oddsFactor 包含赔率因子详情
```

---

## 📦 部署到 Vercel

### 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/CodeByAndrewni/football-trading-terminal)

### 手动部署

详细步骤请参考：**[Vercel 部署指南](./.same/vercel-deployment-guide.md)**

#### 快速步骤：

1. Fork 或导入此仓库到你的 GitHub
2. 登录 [Vercel](https://vercel.com)
3. 导入 GitHub 仓库
4. 添加环境变量 `FOOTBALL_API_KEY`
5. 点击部署

---

## 🛠️ 技术栈

### 前端框架
- **React 18.3** - UI 框架
- **TypeScript 5.6** - 类型安全
- **Vite 6.3** - 构建工具
- **Tailwind CSS** - 样式框架
- **React Router 7** - 路由管理

### 数据管理
- **TanStack Query** - 数据获取和缓存
- **TanStack Virtual** - 虚拟滚动优化

### 可视化
- **Recharts** - 数据图表
- **Lucide Icons** - 图标库

### 后端服务
- **Vercel Serverless Functions** - API 代理
- **API-Football v3** - 足球数据源
- **Supabase** - 数据库（雷达记录）

---

## 📁 项目结构

```
football-trading-terminal/
├── api/                          # Vercel Serverless Functions
│   ├── health.ts                 # 健康检查
│   └── football/
│       ├── live.ts               # 实时比赛
│       ├── h2h.ts                # 历史对战
│       ├── leagues.ts            # 联赛列表
│       ├── fixture/[id].ts       # 比赛详情+统计+事件
│       ├── lineups/[id].ts       # 阵容数据
│       ├── team-stats/[id].ts    # 球队统计
│       ├── odds/
│       │   ├── [id].ts           # 赛前赔率
│       │   └── live/[id].ts      # 滚球赔率
│       ├── predictions/[id].ts   # API预测
│       ├── standings/[league].ts # 积分榜
│       ├── players/[id].ts       # 球员统计
│       └── injuries/[team].ts    # 伤病信息
├── src/
│   ├── components/               # React 组件
│   ├── pages/                    # 页面组件
│   ├── services/
│   │   ├── api.ts                # API 调用 (20+ 函数)
│   │   ├── apiConverter.ts       # 数据转换
│   │   ├── scoringEngine.ts      # 评分引擎 (7大因子)
│   │   ├── radarService.ts       # 雷达服务
│   │   └── ...
│   ├── hooks/                    # 自定义 Hooks
│   ├── types/                    # TypeScript 类型
│   └── lib/                      # 工具库
├── .same/
│   ├── todos.md                  # 开发进度
│   ├── api-endpoints-status.md   # API 端点文档
│   └── vercel-deployment-guide.md
├── vercel.json
├── .env.example
└── README.md
```

---

## 🎮 功能说明

### 1. 比赛大厅（首页）
- 实时比赛列表，按联赛分组
- 多维度筛选（评分/场景/时间）
- 评分颜色编码（80-85橙/85-90红/90+紫）

### 2. 比赛详情页
- 7大因子评分分解
- 评分趋势图
- 赔率分析面板 (新增)
- 预警信号

### 3. 80+ 雷达
- 实时追踪 80+ 高评分比赛
- 记录预警时刻和最终结果
- 统计命中率

### 4. 大屏监控
- 全屏监控模式
- TOP5 高评分排行
- 实时预警面板

### 5. 角球分析
- 角球时间分布
- 角球累计趋势
- 盘口建议

### 6. 回测系统
- 历史数据回测
- 策略验证
- 盈亏统计

---

## 📝 开发命令

```bash
# 开发服务器
bun run dev

# 构建生产版本
bun run build

# 代码检查
bun run lint

# 代码格式化
bun run format

# 预览生产构建
bun run preview
```

---

## 🔐 环境变量

| 变量名 | 说明 | 必需 | 默认值 |
|--------|------|------|--------|
| `FOOTBALL_API_KEY` | API-Football API Key | 否 | - |

**获取 API Key**: [https://www.api-football.com/](https://www.api-football.com/)

---

## 📊 版本历史

### v2.0.0 (2024-02-24)
- ✨ 新增 8 个 API 端点 (赔率/预测/排名/球员/伤病/联赛)
- ✨ 新增赔率因子评分系统
- ✨ 新增 `calculateDynamicScoreWithOdds()` 函数
- 📝 完善 TypeScript 类型 (15+ 新类型)
- 📝 更新文档

### v1.0.0
- 初始版本
- 6大因子评分系统
- API-Football 基础集成

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- [API-Football](https://www.api-football.com/) - 提供足球数据 API
- [Vercel](https://vercel.com/) - 部署平台
- [Supabase](https://supabase.com/) - 数据库服务
- [React](https://react.dev/) - UI 框架
- [Tailwind CSS](https://tailwindcss.com/) - 样式框架

---

<div align="center">

**⚽ 享受足球交易的乐趣！**

Made with ❤️ by [Same](https://same.new)

</div>
