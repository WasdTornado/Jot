import {analyticsEndpoint} from './analytics-config.mjs';
const [from, to = from] = process.argv.slice(2);
const endpoint = analyticsEndpoint();
if (!endpoint || !process.env.JOT_STATS_TOKEN || !/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
  console.error('请配置 JOT_ANALYTICS_URL、JOT_STATS_TOKEN，并传入起止日期：node scripts/usage-report.mjs 2026-10-30 2026-10-30');
  process.exitCode = 1;
} else {
  try {
    const url = new URL('/stats', endpoint); url.searchParams.set('from',from); url.searchParams.set('to',to);
    const response = await fetch(url, {headers:{Authorization:`Bearer ${process.env.JOT_STATS_TOKEN}`},signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw Error(`统计查询失败（HTTP ${response.status}）`);
    const report = await response.json();
    console.log('北京时间；下载为点击次数，活跃为去重安装数。');
    console.table(report.days.map(day => ({日期:day.date,下载点击:day.download_clicks,活跃安装:day.active_installs})));
    if (!report.days.length) console.log('所选日期没有统计数据。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
