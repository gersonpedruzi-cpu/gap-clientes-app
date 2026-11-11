// GAP Clientes · service worker só para os avisos no celular (não guarda páginas em cache) · v2 10/11
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || 'GAP Clientes', {
    body: d.body || '', icon: '/cliente/icon-192.png', badge: '/cliente/icon-192.png', tag: d.tag || 'gap-cliente', renotify: true,
    data: {url: d.url || '/cliente/'}
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  // (10/11, Gerson) abrir NA TELA do aviso (antes só trazia o app para frente). Endereço do GAP Controle (/#usinas, /#usina=…,
  // /#chamado=…) que chegou aqui vira a tela equivalente do GAP Clientes. ?av=… força recarregar (no iPhone só o # não muda a tela).
  const u = new URL((e.notification.data && e.notification.data.url) || '/cliente/', self.location.origin);
  let h = u.hash || ''; if (!u.pathname.startsWith('/cliente/')) h = /^#usina/.test(h) ? '#usinas' : /^#chamado/.test(h) ? '#chamados' : '';
  const url = new URL('/cliente/?av=' + Date.now() + h, self.location.origin).href;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const app = cs.find(c => new URL(c.url).pathname.startsWith('/cliente/'));
    if (app) { try { const n = await app.navigate(url); if (n) { try { await n.focus(); } catch (_) {} return; } } catch (_) {}
      try { await app.focus(); } catch (_) {} app.postMessage({abrir: h}); return; }
    await self.clients.openWindow(url);
  })());
});
