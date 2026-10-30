export function statisticsDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
function validDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validateEvent(value, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'date,event,installation_id,version') return false;
  if (!validDay(value.date) || Math.abs(Date.parse(value.date) - Date.parse(statisticsDay(now))) > 86400_000 ||
      typeof value.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(value.version) || value.version.length > 40) return false;
  if (value.event === 'download_click') return value.installation_id === null;
  return value.event === 'active_install' && typeof value.installation_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.installation_id);
}
async function authorized(request, secret) {
  if (!secret || secret.length < 32) return false;
  const hash = async text => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [expected, actual] = await Promise.all([hash(`Bearer ${secret}`), hash(request.headers.get('Authorization') ?? '')]);
  return expected.reduce((difference, byte, i) => difference | (byte ^ actual[i]), 0) === 0;
}
async function body(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('empty');
  const chunks = []; let size = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 512) { await reader.cancel(); throw Error('large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS ?? 'https://wasdtornado.github.io').split(',').includes(origin);
    const headers = {'Cache-Control':'no-store', 'Vary':'Origin'};
    if (allowed) Object.assign(headers, {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type'});
    const respond = (status, value) => new Response(value === undefined ? null : JSON.stringify(value), {status, headers:{...headers, 'Content-Type':'application/json'}});
    if (url.pathname === '/events') {
      if (origin && !allowed) return respond(403);
      if (request.method === 'OPTIONS') return respond(204);
      if (request.method !== 'POST') return respond(405);
      let event;
      try { event = await body(request); } catch { return respond(400); }
      if (!validateEvent(event) || (event.event === 'download_click' && !allowed) ||
          (event.event === 'active_install' && origin)) return respond(400);
      try {
        if (event.event === 'active_install') {
          // 主键跨版本去重，客户端重试与当天升级都不会重复增加 DAU。
          await env.DB.prepare('INSERT OR IGNORE INTO daily_active (date, installation_id, version) VALUES (?, ?, ?)')
            .bind(event.date, event.installation_id.toLowerCase(), event.version).run();
        } else {
          await env.DB.prepare('INSERT INTO download_clicks (date, version, count) VALUES (?, ?, 1) ON CONFLICT (date, version) DO UPDATE SET count = count + 1')
            .bind(event.date, event.version).run();
        }
        return respond(204);
      } catch { return respond(503); }
    }
    if (url.pathname === '/stats' && request.method === 'GET') {
      if (!await authorized(request, env.STATS_TOKEN)) return respond(401);
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      if (!validDay(from) || !validDay(to) || from > to || Date.parse(to) - Date.parse(from) > 89 * 86400_000) return respond(400);
      try {
        const {results} = await env.DB.prepare(`SELECT date, SUM(dau) AS active_installs, SUM(clicks) AS download_clicks FROM (
          SELECT date, COUNT(*) AS dau, 0 AS clicks FROM daily_active WHERE date BETWEEN ? AND ? GROUP BY date
          UNION ALL SELECT date, 0, SUM(count) FROM download_clicks WHERE date BETWEEN ? AND ? GROUP BY date
        ) GROUP BY date ORDER BY date`).bind(from, to, from, to).all();
        return respond(200, {timezone:'Asia/Shanghai', days:results});
      } catch { return respond(503); }
    }
    return respond(404);
  }
};
