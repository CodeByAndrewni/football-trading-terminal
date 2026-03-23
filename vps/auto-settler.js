#!/usr/bin/env node
/**
 * Paper Trade 自动结算器 — VPS 常驻脚本
 *
 * 每 5 分钟调 Vercel /api/paper-trade/settle 端点，
 * 自动结算已结束比赛的 OPEN 订单。
 *
 * 用法:
 *   node auto-settler.js
 *   或通过 pm2: pm2 start auto-settler.js --name pt-settler
 *
 * 环境变量:
 *   VERCEL_API_BASE  — Vercel 部署域名
 *   SETTLE_INTERVAL  — 结算间隔毫秒，默认 300000（5 分钟）
 */

const API_BASE = process.env.VERCEL_API_BASE || 'https://football-trading-terminal.vercel.app';
const SETTLE_INTERVAL = Number(process.env.SETTLE_INTERVAL) || 5 * 60 * 1000;

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function settle() {
  try {
    const resp = await fetch(`${API_BASE}/api/paper-trade/settle`, {
      headers: { 'User-Agent': 'LivePro-VPS-Settler/1.0' },
      signal: AbortSignal.timeout(60000),
    });
    const data = await resp.json();

    if (data.settledCount > 0) {
      console.log(`[${ts()}] ✅ 结算 ${data.settledCount} 单（共 ${data.openCount} 单 OPEN）`);
      for (const s of data.settled || []) {
        const emoji = s.status === 'WON' ? '💰' : s.status === 'LOST' ? '❌' : '↔️';
        console.log(`  ${emoji} fixture ${s.fixture_id} → ${s.status} | ${s.final_score_home}-${s.final_score_away} | pnl=${s.pnl}`);
      }
    } else if (data.openCount > 0) {
      console.log(`[${ts()}] ⏳ ${data.openCount} 单 OPEN，比赛未结束`);
    }
    // 无 OPEN 订单时静默
  } catch (err) {
    console.error(`[${ts()}] ❌ 结算失败:`, err.message || err);
  }
}

console.log(`[${ts()}] 🚀 Auto Settler 启动`);
console.log(`  API: ${API_BASE}`);
console.log(`  间隔: ${SETTLE_INTERVAL / 1000}s`);
console.log('');

settle();
setInterval(settle, SETTLE_INTERVAL);
