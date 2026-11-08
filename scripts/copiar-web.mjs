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
if(h.length === n0) throw new Error('não achei o <script> do supabase no index.html');
fs.writeFileSync(path.join(DEST, 'index.html'), h);
console.log('www/ pronto:', fs.readdirSync(DEST).join(', '));
