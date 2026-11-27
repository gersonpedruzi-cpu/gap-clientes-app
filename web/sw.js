// GAP Clientes · service worker: avisos no celular + (27/11, área Campo) cópia das telas para abrir sem internet · v4 27/11
// Sempre busca na internet primeiro (o app fica sempre atualizado); só sem internet usa a última cópia guardada.
// Guarda só as telas do app (/cliente/…), o config.js, a biblioteca do Supabase e as letras; nunca os dados (supabase.co).
const CACHE = 'gap-cli-v4';
self.addEventListener('install', () => self.skipWaiting());
const guardar = u => (u.origin === self.location.origin && (u.pathname.startsWith('/cliente/') || u.pathname === '/config.js'))
  || (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('@supabase/supabase-js')) || u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  let u; try { u = new URL(r.url); } catch (_) { return; }
  if (!guardar(u) || u.pathname.endsWith('/sw.js')) return;
  const inicio = r.mode === 'navigate' && (u.pathname === '/cliente/' || u.pathname === '/cliente/index.html');   // a tela do app, com ?av=… ou #…
  e.respondWith((async () => {
    const c = await caches.open(CACHE), chave = inicio ? '/cliente/' : r;
    const rede = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(chave, res.clone()).catch(() => {}); return res; });
    // (revisão) sinal fraco (telhado): espera a internet até 4 s; passou disso e tem cópia guardada, abre a cópia
    rede.catch(() => {});
    const guardada = await c.match(chave);
    if (!guardada) return rede;
    return Promise.race([rede.catch(() => guardada), new Promise(ok => setTimeout(() => ok(guardada), 4000))]);
  })());
});
self.addEventListener('activate', e => e.waitUntil((async () => {   // apaga as cópias de versões antigas
  for (const k of await caches.keys()) if (k.startsWith('gap-cli-') && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || 'GAP', {
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
