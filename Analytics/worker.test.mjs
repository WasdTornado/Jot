import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker, {statisticsDay, validateEvent} from './worker.mjs';
import {analyticsEndpoint} from '../scripts/analytics-config.mjs';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const env = {STATS_TOKEN:'test-secret-at-least-32-characters-long', DB:{prepare:sql => ({bind:(...values) => ({run:async () => db.prepare(sql).run(...values), all:async () => ({results:db.prepare(sql).all(...values)})})})}};
  const event = {date:statisticsDay(), installation_id:'11111111-1111-4111-8111-111111111111', version:'0.2.3', event:'active_install'};
  const post = (body, origin) => worker.fetch(new Request('https://test/events', {method:'POST', headers:origin ? {Origin:origin} : {}, body:JSON.stringify(body)}), env);
  const report = token => worker.fetch(new Request(`https://test/stats?from=${event.date}&to=${event.date}`, {headers:token ? {Authorization:`Bearer ${token}`} : {}}), env);
  return {db,env,event,post,report};
}
test('真实 SQLite 验证每日跨版本去重、下载累计与私有报表', async () => {
  const {db,env,event,post,report} = setup();
  try {
    assert.equal((await post(event)).status, 204);
    assert.equal((await post({...event, version:'0.2.4'})).status, 204);
    assert.equal((await post({...event, installation_id:'22222222-2222-4222-8222-222222222222'})).status, 204);
    const click = {...event, installation_id:null, event:'download_click'};
    assert.equal((await post(click, 'https://wasdtornado.github.io')).status, 204);
    assert.equal((await post(click, 'https://wasdtornado.github.io')).status, 204);
    assert.equal((await report()).status, 401);
    assert.equal((await report('wrong')).status, 401);
    const result = await (await report(env.STATS_TOKEN)).json();
    assert.deepEqual(result.days, [{date:event.date, active_installs:2, download_clicks:2}]);
    assert.equal(JSON.stringify(result).includes('11111111'), false);
  } finally { db.close(); }
});
test('拒绝额外字段、非法日期、来源、事件与超大内容', async () => {
  const {db,event,post,env} = setup();
  try {
    for (const invalid of [{...event, text:'secret'}, {...event, date:'2020-01-01'}, {...event, date:'2026-02-30'}, {...event, event:'startup'}, {...event, installation_id:'invalid'}, {...event, version:'0.2.3\nsecret'}, {...event, version:'x'.repeat(600)}]) {
      assert.equal((await post(invalid)).status, 400);
    }
    assert.equal((await post(event,'https://evil.example')).status, 403);
    assert.equal((await post(event,'https://wasdtornado.github.io')).status, 400);
    assert.equal((await post({...event, installation_id:null, event:'download_click'})).status, 400);
    assert.equal((await worker.fetch(new Request('https://test/stats?from=2020-01-01&to=2026-01-01', {headers:{Authorization:`Bearer ${env.STATS_TOKEN}`}}),env)).status,400);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_active').get().n,0);
  } finally {db.close();}
});
test('服务端失败不确认成功，预检不落库', async () => {
  const {db,env,event,post} = setup();
  try {
    const preflight = await worker.fetch(new Request('https://test/events',{method:'OPTIONS',headers:{Origin:'https://wasdtornado.github.io'}}),env);
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://wasdtornado.github.io');
    env.DB.prepare = () => {throw Error('database unavailable');};
    assert.equal((await post(event)).status,503);
  } finally {db.close();}
});
test('北京时间跨日和构建地址校验', () => {
  assert.equal(statisticsDay(new Date('2026-10-29T16:00:00Z')),'2026-10-30');
  assert.equal(validateEvent(null),false);
  assert.equal(analyticsEndpoint(''),'');
  for (const value of ['http://example.com/events','https://example.com/?token=secret','https://user:secret@example.com/events']) assert.throws(() => analyticsEndpoint(value));
  assert.equal(analyticsEndpoint('https://example.com/events'),'https://example.com/events');
});
