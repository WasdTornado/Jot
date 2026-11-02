export function installDownloadStatistics(document, navigator, endpoint, version, send = fetch) {
  if (!endpoint || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return () => {};
  const click = event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    const url = new URL(link.href, document.baseURI);
    if (!/^https?:$/.test(url.protocol) || !/\/Jot-[^/]+\.dmg$/i.test(url.pathname)) return;
    const date = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    // 点击不是安装；网站不生成用户或安装标识，也不拦截下载导航。
    const body = JSON.stringify({installation_id:null, date, version, event:'download_click'});
    try { void send(endpoint, {method:'POST', body, keepalive:true, credentials:'omit', referrerPolicy:'no-referrer'}).catch(() => {}); } catch {}
  };
  document.addEventListener('click', click);
  document.addEventListener('auxclick', click);
  return () => { document.removeEventListener('click', click); document.removeEventListener('auxclick', click); };
}
