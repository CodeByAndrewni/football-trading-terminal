/**
 * 单函数覆盖 /api/football/fixtures、/odds、/stats、/standings（Hobby 12 函数限制）
 */
import routeFootballApi from '../lib/football-catchall.js';

export default routeFootballApi;

export const config = {
  maxDuration: 15,
};
