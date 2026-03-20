# Supabase 接入与环境变量约定

> 本文仅记录 **变量名称与用途**，不包含任何真实 URL 或密钥。  
> 请在 Supabase Dashboard 的 `Project Settings → API` 中自行查阅实际值，并通过环境变量配置。

## 1. 三个核心标识

在 Supabase 项目控制台中，你会看到三个关键字段：

- **Project URL**  
  - 用途：Supabase 实例的基础 URL，所有 REST / Realtime / Storage 调用都会以此为前缀。  
  - 示例形态（伪）：`https://xxxxx.supabase.co`

- **anon public key**  
  - 用途：浏览器 / 前端环境使用的 **公开** Key，只能访问启用了 RLS 且对 `anon` 角色开放的权限。  
  - 适用场景：前端读取公共数据、写入受限数据（如 odds_snapshots、radar_alerts 等在策略允许下的插入）。

- **service_role key**  
  - 用途：仅在服务端（Node / Serverless / 批处理脚本）使用的 **最高权限密钥**，拥有绕过 RLS 的完全访问权限。  
  - 安全要求：绝不能暴露在前端或提交到仓库，只能放在 Vercel / 服务器环境变量中。

## 2. 统一的环境变量命名规范

推荐统一使用以下四个变量名，其它旧名字仅保留兼容读取：

### 2.1 前端（浏览器 / Vite）

- `VITE_SUPABASE_URL`  
  - 值：`Project URL`  
  - 作用：在打包时注入到前端代码，用于创建浏览器端 Supabase client。

- `VITE_SUPABASE_ANON_KEY`  
  - 值：`anon public key`  
  - 作用：前端 Supabase client 使用的公开密钥。

### 2.2 服务端 / Node / Serverless

- `SUPABASE_URL`  
  - 值：同 `Project URL`  
  - 作用：所有 Node 侧脚本（ingest、backfill、heartbeat 等）和 API Route 访问 Supabase 时使用的基础 URL。

- `SUPABASE_SERVICE_ROLE_KEY`  
  - 值：`service_role key`  
  - 作用：仅在服务端使用的最高权限密钥，供：
    - `scripts/ingest/*.ts` 仓库构建脚本
    - `scripts/sync_teams.ts` 同步 Teams 维表
    - `lib/vercel-api/supabase-heartbeat-route.ts`（经 `api/[...path].ts` 暴露 `GET /api/supabase-heartbeat`）心跳 API
    - 未来需要 service_role 能力的 server-only 逻辑

### 2.3 兼容的旧变量（不再推荐，但仍会被代码读取）

以下变量仍在代码中作为 **fallback** 使用，以兼容旧环境配置，但不再推荐在新环境中使用：

- `SUPABASE_SERVICE_KEY`（旧的 service role 名称）
- `SUPABASE_ANON_KEY`（旧的 anon key 名称）
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`（早期 Next.js 相关约定）

在新的部署 / 环境中，请优先设置：

- 前端：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- 服务端：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`

## 3. 代码中 Supabase client 的创建方式

### 3.1 通用前端 client：`src/lib/supabase.ts`

```ts
// 浏览器端 client（anon）
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 服务端 client（service_role），仅 Node / Serverless 环境使用
export function createServerSupabaseClient() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '';
  ...
}
```

- 前端（React/Vite 页面 & hooks）通过 `import { supabase } from '../lib/supabase'` 使用 **anon client**。
- 服务端逻辑（将来如需要）应使用 `createServerSupabaseClient()` 并只在 Node 环境调用。

### 3.2 批处理脚本（ingest / sync / backfill）

示例：`scripts/ingest/live-update.ts`：

```ts
const CONFIG = {
  API_HOST: 'v3.football.api-sports.io',
  API_KEY: process.env.API_FOOTBALL_KEY || '',

  // Supabase：统一 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY，旧变量仅作兼容
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    '',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
```

其它脚本（`scripts/ingest/daily-incremental.ts`、`scripts/ingest/historical-download.ts`、`scripts/sync_teams.ts`、`scripts/odds_pipeline_health.ts`）都遵循类似模式：

- **优先**读取：`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **兼容**读取：`SUPABASE_SERVICE_KEY` / `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` 仅作为 fallback

### 3.3 心跳 API：`/api/supabase-heartbeat`

```ts
const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  '';
```

- 通过 `ENABLE_SUPABASE_HEARTBEAT=true` 控制是否真正访问 Supabase。
- 主要用于防止免费项目因长期无访问被自动 Pause。

## 4. 实际配置步骤（简版）

1. 打开 Supabase Dashboard → **Project Settings → API**，记下：
   - Project URL
   - anon public key
   - service_role key
2. 在 **本地开发环境** 的 `.env.local` 或等效文件中设置：
   - `VITE_SUPABASE_URL=你的 Project URL`
   - `VITE_SUPABASE_ANON_KEY=你的 anon public key`
   - `SUPABASE_URL=你的 Project URL`
   - `SUPABASE_SERVICE_ROLE_KEY=你的 service_role key`
3. 在 **Vercel 项目环境变量** 中设置同样的四个变量（至少在 Preview/Production 环境），并按需设置：
   - `ENABLE_SUPABASE_HEARTBEAT=true`（若希望启用防休眠心跳）。

> 注意：**不要**把实际的 URL / Key 写入任何 `.ts` / `.tsx` / `.sql` / `*.md` 文件中。所有敏感值只能存在于环境变量或私密配置之中。

