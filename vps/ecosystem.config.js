/**
 * PM2 Ecosystem 配置 — VPS Paper Trading 服务
 *
 * 用法:
 *   pm2 start ecosystem.config.js
 *   pm2 logs
 *   pm2 stop all
 */

module.exports = {
  apps: [
    {
      name: 'pt-scanner',
      script: 'paper-trade-scanner.js',
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 5000,
      max_memory_restart: '100M',
      env_file: '.env',
      out_file: './logs/scanner-out.log',
      error_file: './logs/scanner-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
    {
      name: 'pt-settler',
      script: 'auto-settler.js',
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 10000,
      max_memory_restart: '100M',
      env_file: '.env',
      out_file: './logs/settler-out.log',
      error_file: './logs/settler-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
