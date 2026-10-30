// @vitest-environment jsdom
import { test, expect, vi } from 'vitest';
// @ts-expect-error 官网模块直接作为浏览器 JavaScript 发布。
import { installDownloadStatistics } from '../../Website/analytics.js';

test('只统计 DMG 点击，不阻断导航，也不发送网页或便签内容', () => {
 document.body.innerHTML = '<a href="download.html">安装说明</a><a href="https://example.com/Jot-0.2.3-preview.dmg"><span>下载</span></a>';
 const send = vi.fn().mockResolvedValue({status:204});
 const cleanup = installDownloadStatistics(document, {}, 'https://stats.example/events','0.2.3', send);
 const event = new MouseEvent('click', {bubbles:true, cancelable:true});
 document.querySelector('a')!.dispatchEvent(event);
 expect(send).not.toHaveBeenCalled();
 document.querySelector('span')!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 expect(send).toHaveBeenCalledTimes(1);
 const options = send.mock.calls[0][1];
 expect(Object.keys(JSON.parse(options.body)).sort()).toEqual(['date','event','installation_id','version']);
 expect(JSON.parse(options.body)).toMatchObject({installation_id:null,event:'download_click',version:'0.2.3'});
 expect(options).toMatchObject({keepalive:true,credentials:'omit',referrerPolicy:'no-referrer'});
 expect(event.defaultPrevented).toBe(false);
 cleanup();
});
test('未配置或浏览器要求不跟踪时不发送，网络失败不影响点击', () => {
 const send = vi.fn().mockRejectedValue(Error('offline'));
 document.body.innerHTML = '<a href="https://example.com/Jot-0.2.3-preview.dmg">下载</a>';
 for (const [nav, endpoint] of [[{},''],[{doNotTrack:'1'},'https://stats.example/events'],[{globalPrivacyControl:true},'https://stats.example/events']]) {
  const cleanup=installDownloadStatistics(document,nav,endpoint,'0.2.3',send);
  document.querySelector('a')!.dispatchEvent(new MouseEvent('click',{bubbles:true})); cleanup();
 }
 expect(send).not.toHaveBeenCalled();
 const cleanup=installDownloadStatistics(document,{},'https://stats.example/events','0.2.3',send);
 expect(() => document.querySelector('a')!.dispatchEvent(new MouseEvent('click',{bubbles:true}))).not.toThrow(); cleanup();
});

// @ts-expect-error 构建配置使用原生 ESM。
import { analyticsEndpoint } from '../../scripts/analytics-config.mjs';
test('正式构建带接收地址，可显式关闭且拒绝不安全地址', () => {
 vi.stubEnv('JOT_ANALYTICS_URL', undefined);
 try {
  expect(analyticsEndpoint()).toBe('https://jot-statistics.wasdtornado.workers.dev/events');
  expect(analyticsEndpoint('')).toBe('');
  for (const value of ['http://example.com/events','https://user:secret@example.com/events','https://example.com/events?key=secret','https://example.com/other']) expect(() => analyticsEndpoint(value)).toThrow();
 } finally {
  vi.unstubAllEnvs();
 }
});
