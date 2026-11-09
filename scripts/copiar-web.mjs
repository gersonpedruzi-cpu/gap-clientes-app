// Copia o GAP Clientes já montado (site/cliente, saída do build_cliente.py) para www/ do app.
// O app leva o site DENTRO dele: o supabase-js vai junto (não depende da CDN) e o sw.js/manifest (aviso de navegador) não vão:
// no app o aviso vem pelo Firebase.
import fs from 'fs'; import path from 'path';
const ORIG = path.resolve(process.argv[2] || 'web'), DEST = path.resolve('www');
fs.rmSync(DEST, {recursive: true, force: true}); fs.mkdirSync(DEST, {recursive: true});
for(const f of fs.readdirSync(ORIG)){ if(f === 'sw.js' || f === 'manifest.webmanifest') continue; fs.cpSync(path.join(ORIG, f), path.join(DEST, f), {recursive: true}); }
fs.copyFileSync('node_modules/@supabase/supabase-js/dist/umd/supabase.js', path.join(DEST, 'supabase.min.js'));
let h = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
const n0 = h.length;
h = h.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+"><\/script>/, '<script src="supabase.min.js"></script>');
h = h.replace(/<link rel="manifest"[^>]*>\n?/, '');
// (08/11 20h14, tablet do Gerson: "Não foi possível abrir") o site pega a ligação com o banco em ../config.js (raiz do site);
// dentro do app não existe "..": o config.js vai junto em www/ (web/config.js, cópia de site/config.js: só valores públicos)
if(!fs.existsSync(path.join(ORIG, 'config.js'))) throw new Error('falta web/config.js (copie de site/config.js)');
h = h.replace('<script src="../config.js"></script>', '<script src="config.js"></script>');
if(!h.includes('<script src="config.js"></script>')) throw new Error('não achei o <script> do config.js no index.html');
if(h.length === n0) throw new Error('não achei o <script> do supabase no index.html');
fs.writeFileSync(path.join(DEST, 'index.html'), h);
// (09/11 18h20, Gerson) a partir da 1.0.10 o app ABRE O SITE (capacitor.config.json → server.url = gap-controle.pages.dev/cliente/):
// o que subir no Cloudflare aparece no app na hora, sem versão nova na Play Store. A cópia de www/ fica só como reserva;
// sem internet o Capacitor mostra esta página (server.errorPath).
fs.writeFileSync(path.join(DEST, 'sem-conexao.html'), `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>GAP Clientes</title>
<style>html,body{margin:0;height:100%;background:#141414;color:#f2f0ea;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;box-sizing:border-box}
img{width:72px;height:72px;border-radius:16px}h1{margin:6px 0 0;font-size:22px}p{margin:0;color:#b9b6ad;max-width:320px}
button{margin-top:10px;padding:13px 26px;border:0;border-radius:12px;background:#f5c518;color:#141414;font:inherit;font-weight:700}</style></head>
<body><main><img src="icon-192.png" alt=""><h1>Sem conexão</h1><p>O GAP Clientes precisa de internet para mostrar a sua usina. Verifique o Wi-Fi ou os dados móveis e tente de novo.</p>
<button type="button" onclick="location.href='https://gap-controle.pages.dev/cliente/'">Tentar de novo</button></main>
<script>addEventListener('online',()=>{location.href='https://gap-controle.pages.dev/cliente/';});</script></body></html>`);
console.log('www/ pronto:', fs.readdirSync(DEST).join(', '));
