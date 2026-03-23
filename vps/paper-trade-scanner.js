#!/usr/bin/env node
/**
 * Paper Trade 扫描器 — VPS 常驻脚本
 *
 * 每 30 秒调 Vercel /api/paper-trade/scan 端点，
 * 由 Vercel 端完成所有评估逻辑（读 KV → 情景引擎 → 写 Supabase）。
 *
 * 用法:
 *   node paper-trade-scanner.js
 *   或通过 pm2: pm2 start paper-trade-scanner.js --name pt-scanner
 *
 * 环境变量:
 *   VERCEL_API_BASE — Vercel 部署域名（如 https://your-app.vercel.app）
 *   SCAN_INTERVAL   — 扫描间隔毫秒，默认 30000
 */

const API_BASE = process.env.VERCEL_API_BASE || 'https://football-trading-terminal.vercel.app';
const SCAN_INTERVAL = Number(process.env.SCAN_INTERVAL) || 30000;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function scan() {
  try {
    const resp = await fetch(`${API_BASE}/api/paper-trade/scan`, {
      headers: { 'User-Agent': 'LivePro-VPS-Scanner/1.0' },
      signal: AbortSignal.timeout(25000),
    });
    const data = await resp.json();

    if (data.triggered > 0) {
      console.log(`[${ts()}] ✅ 触发 ${data.triggered} 单 | 扫描 ${data.scanned} 场 | 候选 ${data.candidates} 场`);
      for (const t of data.trades || []) {
        console.log(`  → ${t.home} vs ${t.away} | ${t.rule} | score=${t.score}`);
      }
    } else if (data.candidates > 0) {
      // 有候选但没触发，静默（避免刷屏）
    } else {
      // 每 10 分钟打一次心跳日志
      if (Date.now() % (10 * 60 * 1000) < SCAN_INTERVAL) {
        console.log(`[${ts()}] 💓 运行中 | ${data.scanned || 0} 场 live | cache ${data.cacheAge || '?'}s`);
      }
    }
  } catch (err) {
    console.error(`[${ts()}] ❌ 扫描失败:`, err.message || err);
  }
}

console.log(`[${ts()}] 🚀 Paper Trade Scanner 启动`);
console.log(`  API: ${API_BASE}`);
console.log(`  间隔: ${SCAN_INTERVAL / 1000}s`);
console.log('');

scan();
setInterval(scan, SCAN_INTERVAL);
