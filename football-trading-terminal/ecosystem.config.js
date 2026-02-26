/**
 * ============================================================
 * LIVEPRO FOOTBALL TERMINAL
 * PM2 Ecosystem Configuration
 * ARCHITECTURE_FREEZE_V1
 * ============================================================
 *
 * 使用方法:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --only livepro-live
 *   pm2 stop all
 *   pm2 logs livepro-live
 * ============================================================
 */

module.exports = {
  apps: [
    // ============================================================
    // 实时更新服务 - 持续运行
    // ============================================================
    {
      name: 'livepro-live',
      script: 'scripts/ingest/live-update.ts',
      interpreter: '/usr/local/bin/bun',
      cwd: '/app',

      // 自动重启配置
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,

      // 每天凌晨4点重启（清理内存）
      cron_restart: '0 4 * * *',

      // 环境变量
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',

      // 日志配置
      out_file: '/var/log/livepro/live-out.log',
      error_file: '/var/log/livepro/live-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 资源限制
      max_memory_restart: '500M',

      // 实例配置（单实例）
      instances: 1,
      exec_mode: 'fork',
    },

    // ============================================================
    // 每日增量更新 - 定时执行
    // ============================================================
    {
      name: 'livepro-daily',
      script: 'scripts/ingest/daily-incremental.ts',
      interpreter: '/usr/local/bin/bun',
      cwd: '/app',

      // 不自动重启（一次性任务）
      autorestart: false,
      watch: false,

      // 每天 UTC 00:00 执行
      cron_restart: '0 0 * * *',

      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',

      out_file: '/var/log/livepro/daily-out.log',
      error_file: '/var/log/livepro/daily-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },

    // ============================================================
    // Web 应用服务器（可选）
    // ============================================================
    {
      name: 'livepro-web',
      script: 'node_modules/.bin/vite',
      args: 'preview --host 0.0.0.0 --port 3000',
      cwd: '/app',

      autorestart: true,
      watch: false,

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env',

      out_file: '/var/log/livepro/web-out.log',
      error_file: '/var/log/livepro/web-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      instances: 1,
      exec_mode: 'fork',
    },
  ],

  // ============================================================
  // 部署配置（可选）
  // ============================================================
  deploy: {
    production: {
      user: 'livepro',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/livepro-football-terminal.git',
      path: '/app',
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'bun install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
  },
};
