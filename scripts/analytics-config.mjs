export function analyticsEndpoint(value = process.env.JOT_ANALYTICS_URL ?? 'https://jot-statistics.wasdtornado.workers.dev/events') {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname || url.pathname !== '/events' || url.search || url.hash || url.username || url.password) {
    throw Error('JOT_ANALYTICS_URL 必须是 HTTPS /events 地址，不能包含凭据、查询参数或片段');
  }
  return url.href;
}
