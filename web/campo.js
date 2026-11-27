// GAP · CAMPO (27/11/2026, Gerson) — área do instalador dentro do app da GAP (GAP Clientes).
// Quem entra: o INSTALADOR (login com senha, tabela campo_instaladores) cai direto aqui; Gerson e Adriano (equipe, login Google)
// escolhem "Campo" ou "Usinas" toda vez que abrem o app. O cliente nunca vê esta área.
// Telas: serviços liberados → 1 Fotos (7 itens obrigatórios; telhado até 6) → 2 Strings (por MPPT, entradas em paralelo, tensão
// esperada = placas × Voc da placa do MATERIAL DA COMPRA) → 3 Enviar (concluir).
// Sem internet: tudo fica guardado no celular (IndexedDB "gap-campo") e vai sozinho quando o sinal voltar — o instalador não vê
// aviso nenhum disso (pedido do Gerson). As fotos são reduzidas na hora (lado maior 1600 px, JPEG ~300 KB) e vão para a pasta do
// serviço no Drive (subpasta "Fotos da Instalação") pela função "campo" do servidor.
(function(){
  'use strict';
  const ITENS = [
    {id: 'telhado', nome: 'Telhado com as placas', dica: 'Uma foto por água do telhado, até 6 fotos', max: 6},
    {id: 'padrao', nome: 'Padrão de entrada', dica: 'Com a placa da concessionária', max: 1},
    {id: 'quadro', nome: 'Quadro CA aberto', dica: 'Disjuntor e DPS à mostra', max: 1},
    {id: 'caixa', nome: 'Caixa de passagem aberta', dica: 'Ramal → cabo de cobre, conectores', max: 1},
    {id: 'inversor', nome: 'Inversor instalado', dica: 'Vista geral, fixação e ventilação', max: 1},
    {id: 'etiqueta', nome: 'Etiqueta do inversor', dica: 'Nº de série legível', max: 1},
    {id: 'aterramento', nome: 'Aterramento', dica: 'Ligação da estrutura', max: 1}
  ];
  const K = {papel: null, email: '', nome: '', lista: [], tela: 'lista', sid: null, aberto: false, decidido: false, sinc: false, modal: null};
  const $c = () => document.getElementById('s-campo');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = (v, d = 1) => (v == null || v === '' || !isFinite(+v)) ? '' : (+v).toLocaleString('pt-BR', {maximumFractionDigits: d});
  const sbf = () => (window.GAP_CLI && GAP_CLI.sb) ? GAP_CLI.sb() : null;
  const toast = t => { let el = document.getElementById('cp-toast'); if(!el){ el = document.createElement('div'); el.id = 'cp-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('cp-toast-on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('cp-toast-on'), 3200); };

  // ---------- guardado no celular (IndexedDB; sem ele, memória)
  const MEM = new Map();
  const db = (() => { let p = null; return () => p || (p = new Promise((ok, no) => { try{ const r = indexedDB.open('gap-campo', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }catch(e){ no(e); } }).catch(() => null)); })();
  async function get(k){ const d = await db(); if(!d) return MEM.get(k); return new Promise(ok => { try{ const q = d.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(MEM.get(k)); }catch(_){ ok(MEM.get(k)); } }); }
  async function put(k, v){ MEM.set(k, v); const d = await db(); if(!d) return; return new Promise(ok => { try{ const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => ok(); t.onerror = () => ok(); }catch(_){ ok(); } }); }
  async function del(k){ MEM.delete(k); const d = await db(); if(!d) return; return new Promise(ok => { try{ const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => ok(); t.onerror = () => ok(); }catch(_){ ok(); } }); }
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(_){ return null; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(_){} };

  // (revisão) ler-e-gravar da fila e do rascunho um de cada vez: duas gravações ao mesmo tempo não apagam uma à outra
  let corrente = Promise.resolve();
  function trava(fn){ const p = corrente.then(() => fn()); corrente = p.catch(() => {}); return p; }

  // ---------- servidor
  async function chamar(corpo, ms = 20000){
    const sb = sbf(); if(!sb) throw new Error('sem_app');
    const r = await Promise.race([sb.functions.invoke('campo', {body: corpo}), new Promise((_, no) => setTimeout(() => no(new Error('tempo')), ms))]);
    if(r.error){ let j = null; try{ j = await r.error.context.json(); }catch(_){} const e = new Error((j && j.erro) || r.error.message || 'erro'); e.status = r.error.context && r.error.context.status; e.j = j; throw e; }
    if(r.data && r.data.ok === false){ const e = new Error(r.data.erro || 'erro'); e.j = r.data; throw e; }
    return r.data;
  }

  // ---------- estado de cada serviço: o do servidor + o rascunho do celular + as fotos esperando envio
  const rk = sid => 'r:' + K.email + ':' + sid;
  async function rascunho(sid){ return (await get(rk(sid))) || {}; }
  async function fila(){ return (await get('fila:' + K.email)) || []; }
  const servico = sid => K.lista.find(x => x.id === sid);
  async function estado(sid){
    const s = servico(sid) || {}, r = await rascunho(sid), F = (await fila()).filter(f => f.sid === sid);
    const fotos = {}; for(const it of ITENS){ const srv = ((s.dados && s.dados.fotos && s.dados.fotos[it.id]) || []).map(f => ({...f, enviada: true}));
      const loc = F.filter(f => f.item === it.id).map(f => ({chave: f.chave, thumb: f.thumb}));
      const th = r.thumbs || {}; let L = srv.map(f => ({...f, thumb: th[f.chave] || null})).concat(loc.filter(l => !srv.some(x => x.chave === l.chave)));
      if(it.max <= 1 && L.length > 1) L = L.slice(-1);   // item de uma foto: vale a última (Refazer)
      fotos[it.id] = L; }
    return {s, r, fotos, feitas: ITENS.filter(it => fotos[it.id].length).length};
  }

  // ---------- strings: configuração do inversor (material da compra) e a tensão esperada
  function placaDe(s){ const m = (s && s.material) || {}; return m.placa || {}; }
  function configMppts(s){
    const m = (s && s.material) || {}, I = Array.isArray(m.inversores) && m.inversores.length ? m.inversores : [{mppts: [1]}];
    const totInv = I.reduce((t, inv) => t + Math.max(1, Math.round(+inv.qtd) || 1), 0), out = []; let n = 0;
    I.forEach(inv => { const mp = Array.isArray(inv.mppts) && inv.mppts.length ? inv.mppts : [1];
      for(let q = 0; q < Math.max(1, Math.round(+inv.qtd) || 1); q++){ n++;
        mp.forEach((e, mi) => out.push({nome: (totInv > 1 ? 'Inversor ' + n + ' · ' : '') + 'MPPT ' + (mi + 1), mi, entradas: Math.max(1, Math.min(6, Math.round(+e) || 1))})); } });
    return out;
  }
  function mpptsIniciais(s){
    const C = configMppts(s), tot = C.reduce((t, m) => t + m.entradas, 0), qtd = Math.round(+placaDe(s).qtd || 0);
    let resto = qtd, base = tot ? Math.floor(qtd / tot) : 0, extra = tot ? qtd - base * tot : 0;
    return C.map(m => ({entradas: Array.from({length: m.entradas}, () => { const p = qtd ? base + (extra-- > 0 ? 1 : 0) : 0; resto -= p; return {placas: p, tensao: null}; })}));
  }
  // classificação da tensão medida (circuito aberto, com sol): no calor a tensão cai uns 10–15 % abaixo do Voc em STC
  function classe(placas, tensao, voc){
    if(!voc || !placas || tensao == null || tensao === '' || !isFinite(+tensao)) return null;
    const esp = placas * voc, r = +tensao / esp;
    return {esp, r, tipo: r < 0.8 ? 'baixo' : r > 1.08 ? 'alto' : 'ok'};
  }
  const tensaoNum = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) && x > 0 ? x : null; };

  // ---------- telas
  const ic = {
    volta: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    cam: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    ok: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    campo: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>',
    usinas: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M3 10h18M9 4v12M15 4v12M8 20h8M12 16v4"/></svg>',
    wifi: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f5c916" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>'
  };
  const topo = (titulo, sub, volta) => `<header class="cp-top">${volta ? `<button type="button" class="cp-volta" data-cp="${volta}" aria-label="Voltar">${ic.volta}</button>` : ''}<div class="cp-tt"><span class="cp-ey">${volta ? '' : 'GAP · Campo'}</span><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${!volta ? (K.papel === 'equipe' ? '<button type="button" class="cp-trocar" data-cp="escolha">Trocar</button>' : '<button type="button" class="cp-trocar" data-cp="sair">Sair</button>') : ''}</header>`;
  const passos = at => `<nav class="cp-passos" aria-label="Etapas">${[['fotos', 'Fotos'], ['strings', 'Strings'], ['enviar', 'Enviar']].map(([id, t], i) => id === at ? `<span class="cp-on">${i + 1} · ${t}</span>` : `<button type="button" data-cp="${id}">${i + 1} · ${t}</button>`).join('')}</nav>`;
  const infoServ = s => [s.cidade && (s.cidade + (s.uf ? '-' + s.uf : '')), s.potencia && (num(s.potencia, 2) + ' kWp'), placaDe(s).qtd && (placaDe(s).qtd + ' placas')].filter(Boolean).join(' · ');

  function telaEscolha(){
    const n = (K.nome || '').trim().split(/\s+/)[0];
    return `<div class="cp-esc"><div class="cp-logo"><b>GAP</b><small>Engenharia</small></div><h1>Olá${n ? ', ' + esc(n) : ''}</h1><p>O que você vai fazer agora?</p>
      <button type="button" class="cp-op cp-op-y" data-cp="ir-campo">${ic.campo}<span><b>Campo</b><small>Checklist da instalação, fotos, strings e colocar o inversor online</small></span></button>
      <button type="button" class="cp-op" data-cp="ir-usinas">${ic.usinas}<span><b>Usinas</b><small>Geração, alarmes e clientes</small></span></button></div>`;
  }
  async function telaLista(){
    const L = K.lista, ab = [], fe = [];
    for(const s of L){ const e = await estado(s.id), concl = s.status === 'concluida' || e.r.concluir; (concl ? fe : ab).push({s, e}); }
    const card = ({s, e}) => `<button type="button" class="cp-card" data-cp="abrir" data-sid="${esc(s.id)}"><div class="cp-cl"><span><b>${esc(s.cliente || 'Serviço')}</b><small>${esc(infoServ(s))}</small></span>
      <i class="cp-pill ${e.feitas ? 'cp-pill-and' : ''}">${e.feitas ? 'Em andamento' : 'Não começou'}</i></div><div class="cp-bar"><div style="width:${Math.round(e.feitas / ITENS.length * 100)}%"></div></div><small class="cp-n">${e.feitas} de ${ITENS.length} fotos</small>${e.r.faltou && e.feitas < ITENS.length ? '<small class="cp-falta">Faltam fotos para concluir: ' + esc(ITENS.filter(it => !e.fotos[it.id].length).map(it => it.nome).join(', ')) + '</small>' : ''}</button>`;
    return topo('Meus serviços') + `<main class="cp-main">
      ${ab.length ? '<h2 class="cp-h">Para instalar</h2>' + ab.map(card).join('') : '<p class="cp-vazio">Nenhum serviço liberado para você agora.</p>'}
      ${fe.length ? '<h2 class="cp-h">Concluídas</h2>' + fe.map(({s}) => `<div class="cp-card cp-feito"><span><b>${esc(s.cliente || 'Serviço')}</b><small>${esc(infoServ(s))}</small></span><i class="cp-pill cp-pill-ok">✓ Concluída</i></div>`).join('') : ''}
      ${K.papel === 'equipe' ? `<button type="button" class="cp-con" data-cp="conectar">${ic.wifi}<span><b>Conectar inversor (colocar online)</b><small>Só para administradores · comissionamento</small></span></button>` : ''}
    </main>`;
  }
  async function telaFotos(){
    const {s, r, fotos, feitas} = await estado(K.sid);
    const linha = it => { const F = fotos[it.id], tem = F.length, mult = it.max > 1;
      const mini = f => f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<span class="cp-ph"></span>';
      return `<div class="cp-it${mult ? ' cp-mult' : ''}"><div class="cp-itl">${!mult ? (tem ? `<div class="cp-th">${mini(F[F.length - 1])}<span class="cp-ck">${ic.ok}</span></div>` : `<div class="cp-th cp-vaz">${ic.cam}</div>`) : ''}
        <div class="cp-itt"><b>${esc(it.nome)}</b><small>${esc(it.dica)}</small></div>
        ${mult ? `<span class="cp-cnt ${tem ? 'cp-cnt-ok' : ''}">${tem ? '✓ ' + tem + (tem > 1 ? ' fotos' : ' foto') : ''}</span>` : `<button type="button" class="cp-tirar" data-cp="foto" data-item="${it.id}">${tem ? 'Refazer' : 'Tirar'}</button>`}</div>
        ${mult ? `<div class="cp-tira">${F.map(f => `<div class="cp-th cp-g">${mini(f)}</div>`).join('')}${tem < it.max ? `<button type="button" class="cp-mais" data-cp="foto" data-item="${it.id}" aria-label="Mais uma foto: ${esc(it.nome)}">+</button>` : ''}</div>` : ''}</div>`; };
    return topo(s.cliente || 'Serviço', infoServ(s), 'lista') + passos('fotos') + `<main class="cp-main">
      <div class="cp-hh"><h2 class="cp-h">Fotos obrigatórias</h2><b class="cp-ok">${feitas} de ${ITENS.length}</b></div>
      ${ITENS.map(linha).join('')}
      <label class="cp-lab">Nº de série do inversor<span class="cp-sn"><input type="text" id="cp-sn" autocomplete="off" autocapitalize="characters" value="${esc(r.sn != null ? r.sn : ((s.dados && s.dados.sn) || ''))}"><button type="button" data-cp="ler">Ler código</button></span></label>
    </main><footer class="cp-pe"><button type="button" class="cp-btn" data-cp="strings">Próximo: strings</button></footer>`;
  }
  async function telaStrings(){
    const {s, r} = await estado(K.sid), pl = placaDe(s), voc = +pl.voc || 0, C = configMppts(s);
    const M = r.mppts || (s.dados && s.dados.mppts) || mpptsIniciais(s);
    const inv = ((s.material && s.material.inversores) || [])[0] || {}, mudou = s.material && s.material.projeto && s.material.projeto.placa && s.material.projeto.placa.w && pl.w && +s.material.projeto.placa.w !== +pl.w;
    const total = M.reduce((t, m) => t + (m.entradas || []).reduce((a, e) => a + (+e.placas || 0), 0), 0);
    const blocos = C.map((c, mi) => { const m = M[mi] || {entradas: []}, E = Array.from({length: c.entradas}, (_, ei) => (m.entradas || [])[ei] || {placas: 0, tensao: null});
      const ps = E.map(e => +e.placas || 0), ts = E.map(e => tensaoNum(e.tensao)).filter(x => x);
      const par = E.length > 1, difP = par && new Set(ps).size > 1, difT = par && ts.length > 1 && (Math.max(...ts) - Math.min(...ts)) / Math.max(...ts) > 0.06;
      return `<section class="cp-mp"><div class="cp-mph"><b>${esc(c.nome)}</b><small>${par ? E.length + ' entradas em paralelo' : '1 entrada'}</small></div>
        <div class="cp-eg cp-egh"><span>Entrada</span><span>Placas</span><span>Tensão (V)</span></div>
        ${E.map((e, ei) => { const k = classe(+e.placas, tensaoNum(e.tensao), voc);
          return `<div class="cp-en"><div class="cp-eg"><b>${String.fromCharCode(65 + ei)}</b>
            <span class="cp-step"><button type="button" data-cp="pl" data-mi="${mi}" data-ei="${ei}" data-d="-1" aria-label="Menos uma placa">−</button><b>${+e.placas || 0}</b><button type="button" data-cp="pl" data-mi="${mi}" data-ei="${ei}" data-d="1" aria-label="Mais uma placa">+</button></span>
            <input type="text" inputmode="decimal" class="cp-v" data-mi="${mi}" data-ei="${ei}" aria-label="Tensão medida" placeholder="—" value="${esc(e.tensao != null ? String(e.tensao).replace('.', ',') : '')}"></div>
            ${k ? `<small class="cp-k cp-k-${k.tipo}">${k.tipo === 'ok' ? '✓ ok · esperado ~' + num(k.esp, 0) + ' V' : k.tipo === 'baixo' ? '⚠ bem abaixo de ~' + num(k.esp, 0) + ' V: faltando placa ou conexão invertida?' : '⚠ acima de ~' + num(k.esp, 0) + ' V: string com placa a mais?'}</small>` : (voc && +e.placas ? `<small class="cp-k">esperado ~${num(+e.placas * voc, 0)} V</small>` : '')}</div>`; }).join('')}
        ${difP ? '<small class="cp-aviso">⚠ Entradas em paralelo com quantidades diferentes de placas.</small>' : difT ? '<small class="cp-aviso">⚠ Entradas em paralelo com tensões bem diferentes: confira as conexões.</small>' : par && ts.length > 1 ? '<small class="cp-par">Entradas em paralelo: tensões parecidas ✓</small>' : ''}</section>`; }).join('');
    return topo(s.cliente || 'Serviço', 'Strings e tensão CC', 'fotos') + passos('strings') + `<main class="cp-main">
      <div class="cp-mat"><small>Material da compra</small>
        <span>Placa: <b>${esc(pl.modelo || 'não informada')}${pl.w ? ' · ' + num(pl.w, 0) + ' W' : ''}${voc ? ' · Voc ' + num(voc, 1) + ' V' : ''}</b>${mudou ? ` <i>(projeto: ${num(s.material.projeto.placa.w, 0)} W)</i>` : ''}</span>
        <span>Inversor: <b>${esc(inv.modelo || 'não informado')}${inv.kw ? ' · ' + num(inv.kw, 1) + ' kW' : ''}</b></span>
        ${pl.qtd ? `<span>Placas nas strings: <b class="${total === +pl.qtd ? 'cp-ok' : 'cp-ruim'}">${total} de ${pl.qtd}</b></span>` : ''}
        <button type="button" class="cp-lnk" data-cp="outro">${r.materialDiferente ? 'Material na obra é outro: ' + esc(r.materialDiferente.slice(0, 40)) + (r.materialDiferente.length > 40 ? '…' : '') : 'O material na obra é outro?'}</button></div>
      ${blocos}
      ${voc ? '' : '<p class="cp-dica">A tensão esperada aparece quando o Voc da placa estiver no material da compra (GAP Administração › Campo).</p>'}
    </main><footer class="cp-pe"><button type="button" class="cp-btn" data-cp="enviar">Próximo: enviar</button></footer>`;
  }
  async function telaEnviar(){
    const {s, r, fotos, feitas} = await estado(K.sid), pl = placaDe(s), voc = +pl.voc || 0;
    const M = r.mppts || (s.dados && s.dados.mppts) || mpptsIniciais(s), C = configMppts(s);
    const nf = ITENS.reduce((t, it) => t + fotos[it.id].length, 0);
    let alertas = 0; M.forEach(m => (m.entradas || []).forEach(e => { const k = classe(+e.placas, tensaoNum(e.tensao), voc); if(k && k.tipo !== 'ok') alertas++; }));
    const strs = M.map((m, i) => (C[i] ? C[i].nome : 'MPPT ' + (i + 1)) + ': ' + (m.entradas || []).map(e => +e.placas || 0).join(' ∥ ')).join(' · ');
    const thumbs = ITENS.map(it => { const f = fotos[it.id][0]; return f ? (f.thumb ? `<img src="${esc(f.thumb)}" alt="${esc(it.nome)}">` : '<span class="cp-ph"></span>') : '<span class="cp-ph cp-vaz"></span>'; }).join('');
    const sn = r.sn != null ? r.sn : ((s.dados && s.dados.sn) || ''), obs = r.obs != null ? r.obs : ((s.dados && s.dados.obs) || ''), pronto = feitas === ITENS.length;
    return topo(s.cliente || 'Serviço', 'Conferir e concluir', 'strings') + passos('enviar') + `<main class="cp-main">
      <div class="cp-res"><div><span>Fotos</span><b class="${pronto ? 'cp-ok' : 'cp-ruim'}">${feitas} de ${ITENS.length} itens${pronto ? ' ✓' : ''} · ${nf} fotos</b></div>
        <div class="cp-mini">${thumbs}</div>
        <div><span>Nº de série</span><b>${esc(sn || '—')}</b></div>
        <div><span>Strings</span><b>${esc(strs)}</b></div>
        ${pl.w ? `<div><span>Placa</span><b>${num(pl.w, 0)} W${s.material && s.material.projeto && s.material.projeto.placa && s.material.projeto.placa.w && +s.material.projeto.placa.w !== +pl.w ? ' (projeto: ' + num(s.material.projeto.placa.w, 0) + ' W)' : ''}</b></div>` : ''}
        <div><span>Tensão CC</span><b class="${alertas ? 'cp-ruim' : ''}">${alertas ? alertas + (alertas > 1 ? ' alertas' : ' alerta') : 'sem alerta'}</b></div></div>
      <label class="cp-lab">Observações / o que mudou do projeto<textarea id="cp-obs" rows="4">${esc(obs)}</textarea></label>
      ${!pronto ? `<p class="cp-dica">Faltam fotos: ${ITENS.filter(it => !fotos[it.id].length).map(it => esc(it.nome)).join(', ')}.</p>` : ''}
    </main><footer class="cp-pe"><button type="button" class="cp-btn" data-cp="concluir"${pronto ? '' : ' disabled'}>Concluir instalação</button><small>${alertas ? 'O alerta de tensão não impede concluir · o Gerson vê na conferência' : ''}</small></footer>`;
  }
  function telaModal(){
    if(!K.modal) return '';
    return `<div class="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-mt"><div class="cp-mc"><b id="cp-mt">O material na obra é outro?</b><p>Escreva o que chegou (marca, potência da placa, modelo do inversor). O Gerson recebe junto com o checklist.</p>
      <textarea id="cp-outro" rows="4">${esc(K.modal.txt || '')}</textarea><div class="cp-mb"><button type="button" class="cp-btn2" data-cp="modal-fecha">Cancelar</button><button type="button" class="cp-btn" data-cp="modal-ok">Salvar</button></div></div></div>`;
  }

  let rendering = 0;
  async function render(){
    const el = $c(); if(!el || !K.aberto) return;
    const meu = ++rendering;
    let h = '';
    try{ h = K.tela === 'escolha' ? telaEscolha() : !K.sid || K.tela === 'lista' ? await telaLista() : K.tela === 'strings' ? await telaStrings() : K.tela === 'enviar' ? await telaEnviar() : await telaFotos(); }
    catch(e){ h = topo('Campo') + '<main class="cp-main"><p class="cp-vazio">Não consegui abrir esta tela. Volte e tente de novo.</p></main>'; console.log('campo render', e); }
    if(meu !== rendering) return;
    const rol = el.querySelector('.cp-main'), y = rol ? rol.scrollTop : 0, mesma = el.dataset.tela === K.tela + ':' + K.sid;
    el.innerHTML = h + telaModal(); el.dataset.tela = K.tela + ':' + K.sid;
    const r2 = el.querySelector('.cp-main'); if(r2 && mesma) r2.scrollTop = y;
  }

  // ---------- fotos: reduz no celular
  function lerImg(file){ return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { ok(im); setTimeout(() => URL.revokeObjectURL(u), 1000); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('imagem')); }; im.src = u; }); }
  async function reduzir(file){
    let src = null; try{ src = await createImageBitmap(file, {imageOrientation: 'from-image'}); }catch(_){ src = await lerImg(file); }
    const w = src.width, h = src.height, f = Math.min(1, 1600 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.round(w * f); cv.height = Math.round(h * f); cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    const jpeg = cv.toDataURL('image/jpeg', 0.8);
    const t = document.createElement('canvas'), g = 160 / Math.max(w, h); t.width = Math.round(w * g); t.height = Math.round(h * g); t.getContext('2d').drawImage(src, 0, 0, t.width, t.height);
    return {jpeg: jpeg.split(',')[1], thumb: t.toDataURL('image/jpeg', 0.6), src};
  }
  async function lerCodigo(src){
    if(!('BarcodeDetector' in window)) return '';
    try{ const det = new window.BarcodeDetector(); const R = await det.detect(src); const L = (R || []).map(x => String(x.rawValue || '').trim()).filter(v => /^[A-Z0-9-]{8,40}$/i.test(v));
      return L.sort((a, b) => b.length - a.length)[0] || ''; }catch(_){ return ''; }
  }
  function pedirFoto(fn){
    let inp = document.getElementById('cp-file');
    if(!inp){ inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment'); inp.id = 'cp-file'; inp.hidden = true; document.body.appendChild(inp); }
    inp.value = ''; inp.onchange = () => { const f = inp.files && inp.files[0]; if(f) fn(f); }; inp.click();
  }
  async function novaFoto(item, file){
    const sid = K.sid; let red = null;
    try{ red = await reduzir(file); }catch(_){ toast('Não consegui ler esta foto. Tente de novo.'); return; }
    const it = ITENS.find(x => x.id === item), e = await estado(sid);
    const chave = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
    const umaSo = it.max <= 1;
    if(!umaSo && e.fotos[item].length >= it.max){ toast('Já tem ' + it.max + ' fotos do telhado.'); return; }
    await trava(async () => { const F = await fila();
      // item de uma foto: "Refazer" troca (a que ainda não foi sai da fila; no servidor a nova substitui a antiga)
      if(umaSo){ const i = F.findIndex(f => f.sid === sid && f.item === item); if(i >= 0) F.splice(i, 1); }
      F.push({sid, item, chave, jpeg: red.jpeg, thumb: red.thumb, substituir: umaSo, em: Date.now()}); await put('fila:' + K.email, F);
      const r = await rascunho(sid); r.thumbs = {...(r.thumbs || {}), [chave]: red.thumb}; delete r.faltou; await put(rk(sid), r); });
    if(item === 'etiqueta'){ const sn = await lerCodigo(red.src); if(sn){ let usou = false; await trava(async () => { const r = await rascunho(sid); if(!(r.sn || '').trim()){ r.sn = sn; r.sujo = true; r.v = (r.v || 0) + 1; await put(rk(sid), r); usou = true; } }); if(usou) toast('Nº de série lido da etiqueta: ' + sn); } }
    await render(); sincronizar();
  }

  // ---------- envio (por trás, sem aviso para o instalador)
  async function sincronizar(){
    if(K.sinc || !K.email || navigator.onLine === false) return; K.sinc = true;
    try{
      const F = await fila(), presos = new Set();
      for(const f of F){
        if(presos.has(f.sid)) continue;
        try{ await chamar({acao: 'foto', servico: f.sid, item: f.item, chave: f.chave, jpeg: f.jpeg, substituir: !!f.substituir}, 60000); }
        catch(e){
          if(!e.j || !e.j.erro) throw e;   // sem internet / função fora do ar: tudo fica no celular e vai depois
          // a PRÓPRIA função respondeu: serviço não liberado ou foto inválida → não adianta mandar de novo;
          // outro problema (Drive desligado, serviço sem pasta…) → a foto fica guardada e as dos outros serviços seguem
          if(!(e.status === 404 || /inválida|Item/.test(e.j.erro))){ console.log('campo foto adiada', e.j.erro); presos.add(f.sid); continue; }
          console.log('campo foto recusada', e.j.erro);
        }
        await trava(async () => { await put('fila:' + K.email, (await fila()).filter(x => x.chave !== f.chave)); });
      }
      const L = await chamar({acao: 'lista'}); K.lista = L.servicos || []; await put('lista:' + K.email, K.lista);
      for(const s of K.lista){
        const r = await rascunho(s.id); if(!r.sujo && !r.concluir) continue;
        const pend = (await fila()).some(f => f.sid === s.id); if(pend) continue;
        const v = r.v || 0;   // (revisão) o que mudar durante o envio vai na próxima rodada
        try{ await chamar({acao: 'salvar', servico: s.id, dados: {sn: r.sn, obs: r.obs, mppts: r.mppts, materialDiferente: r.materialDiferente}, concluir: !!r.concluir});
          await trava(async () => { const r2 = await rascunho(s.id); if((r2.v || 0) === v) delete r2.sujo; if(r.concluir) delete r2.concluir; await put(rk(s.id), r2); }); }
        catch(e){
          if(!e.j || !e.j.erro) throw e;
          if(e.status === 404){ await trava(() => del(rk(s.id))); continue; }
          // concluir recusado porque faltam fotos (alguma não chegou): volta para "Para instalar" mostrando o que falta
          if(e.j.faltam){ await trava(async () => { const r2 = await rascunho(s.id); delete r2.concluir; r2.faltou = e.j.faltam; await put(rk(s.id), r2); }); continue; }
          console.log('campo salvar adiado', e.j.erro);
        }
      }
      const L2 = await chamar({acao: 'lista'}); K.lista = L2.servicos || []; await put('lista:' + K.email, K.lista);
    }catch(e){ /* sem internet ou servidor fora: tenta de novo depois */ console.log('campo sinc', e && e.message); }
    finally{ K.sinc = false; if(K.aberto && !digitando()) render(); }
  }
  const digitando = () => { const a = document.activeElement; return !!(a && $c() && $c().contains(a) && /INPUT|TEXTAREA/.test(a.tagName)); };
  async function marcar(fn){ const sid = K.sid; await trava(async () => { const r = await rascunho(sid); fn(r); r.sujo = true; r.v = (r.v || 0) + 1; await put(rk(sid), r); }); clearTimeout(marcar.t); marcar.t = setTimeout(sincronizar, 1500); }

  // ---------- cliques e campos
  document.addEventListener('click', async ev => {
    const b = ev.target.closest && ev.target.closest('#s-campo [data-cp]'); if(!b) return;
    const a = b.dataset.cp;
    if(a === 'ir-campo'){ K.tela = 'lista'; render(); sincronizar(); return; }
    if(a === 'ir-usinas'){ fechar(); if(window.GAP_CLI && GAP_CLI.carregar) GAP_CLI.carregar(true); return; }
    if(a === 'escolha'){ K.tela = 'escolha'; render(); return; }
    if(a === 'sair'){ try{ await sbf().auth.signOut(); }catch(_){} lsSet('gapcampo-papel:' + K.email, ''); location.reload(); return; }
    if(a === 'conectar'){ fechar(); location.hash = 'conectar'; if(window.GAP_CLI && GAP_CLI.carregar) GAP_CLI.carregar(true); return; }
    if(a === 'lista'){ K.sid = null; K.tela = 'lista'; render(); return; }
    if(a === 'abrir'){ K.sid = b.dataset.sid; K.tela = 'fotos'; render(); return; }
    if(a === 'fotos' || a === 'strings' || a === 'enviar'){ await guardarCampos(); K.tela = a; render(); const m = $c().querySelector('.cp-main'); if(m) m.scrollTop = 0; return; }
    if(a === 'foto'){ const item = b.dataset.item; pedirFoto(f => novaFoto(item, f)); return; }
    if(a === 'ler'){ pedirFoto(async f => { let red = null; try{ red = await reduzir(f); }catch(_){}
        const sn = red ? await lerCodigo(red.src) : ''; if(!sn){ toast(('BarcodeDetector' in window) ? 'Não achei o código na foto. Tente mais perto ou digite o número.' : 'Este celular não lê o código: digite o número.'); return; }
        await marcar(r => { r.sn = sn; }); toast('Nº de série: ' + sn); render(); }); return; }
    if(a === 'pl'){ const mi = +b.dataset.mi, ei = +b.dataset.ei, d = +b.dataset.d, s = servico(K.sid);
      await marcar(r => { const M = r.mppts || (s && s.dados && s.dados.mppts) || mpptsIniciais(s); const C = configMppts(s);
        while(M.length < C.length) M.push({entradas: []}); const m = M[mi]; while(m.entradas.length < C[mi].entradas) m.entradas.push({placas: 0, tensao: null});
        m.entradas[ei].placas = Math.max(0, Math.min(40, (+m.entradas[ei].placas || 0) + d)); r.mppts = M; });
      render(); return; }
    if(a === 'outro'){ const r = await rascunho(K.sid); K.modal = {txt: r.materialDiferente || ''}; render(); setTimeout(() => { const t = document.getElementById('cp-outro'); if(t) t.focus(); }, 50); return; }
    if(a === 'modal-fecha'){ K.modal = null; render(); return; }
    if(a === 'modal-ok'){ const t = document.getElementById('cp-outro'), v = t ? t.value.trim() : ''; K.modal = null; await marcar(r => { r.materialDiferente = v; }); render(); return; }
    if(a === 'concluir'){ await guardarCampos(); const e = await estado(K.sid); if(e.feitas < ITENS.length){ toast('Faltam fotos.'); return; }
      await marcar(r => { r.concluir = true; }); toast('Instalação concluída. Obrigado!'); K.sid = null; K.tela = 'lista'; render(); sincronizar(); return; }
  });
  async function guardarCampos(){
    const el = $c(); if(!el || !K.sid) return;
    const sn = el.querySelector('#cp-sn'), obs = el.querySelector('#cp-obs'), V = el.querySelectorAll('.cp-v');
    if(!sn && !obs && !V.length) return;
    const s = servico(K.sid);
    await marcar(r => {
      if(sn) r.sn = sn.value.trim();
      if(obs) r.obs = obs.value;
      if(V.length){ const M = r.mppts || (s && s.dados && s.dados.mppts) || mpptsIniciais(s), C = configMppts(s);
        while(M.length < C.length) M.push({entradas: []});
        V.forEach(v => { const mi = +v.dataset.mi, ei = +v.dataset.ei, m = M[mi]; while(m.entradas.length <= ei) m.entradas.push({placas: 0, tensao: null}); m.entradas[ei].tensao = tensaoNum(v.value); });
        r.mppts = M; }
    });
  }
  document.addEventListener('change', ev => { if(ev.target.closest && ev.target.closest('#s-campo') && /INPUT|TEXTAREA/.test(ev.target.tagName) && ev.target.id !== 'cp-outro'){ guardarCampos().then(() => { if(ev.target.classList.contains('cp-v')) render(); }); } });
  window.addEventListener('online', () => { if(K.aberto) sincronizar(); });
  setInterval(() => { if(K.aberto && !document.hidden) sincronizar(); }, 60000);

  // ---------- abrir / decidir (chamado pelo app logo depois do login)
  function montar(){
    if($c()) return;
    const s = document.createElement('section'); s.id = 's-campo'; s.hidden = true; document.body.appendChild(s);
  }
  function abrir(tela){ montar(); K.aberto = true; K.tela = tela || 'lista'; $c().hidden = false; document.documentElement.classList.add('cp-on'); render();
    try{ if('serviceWorker' in navigator) navigator.serviceWorker.register('/cliente/sw.js', {scope: '/cliente/'}).catch(() => {}); }catch(_){} }
  function fechar(){ K.aberto = false; if($c()) $c().hidden = true; document.documentElement.classList.remove('cp-on'); }
  async function decidir(sb){
    K.decidido = true;
    let email = ''; try{ const {data} = await sb.auth.getSession(); email = String((data && data.session && data.session.user && data.session.user.email) || '').toLowerCase(); }catch(_){}
    if(!email) return false;
    K.email = email;
    let q = null; try{ q = await chamar({acao: 'quem'}, 4000); }catch(_){ q = null; }
    const salvo = lsGet('gapcampo-papel:' + email) || '';
    const papel = q ? (q.instalador ? 'instalador' : q.equipe ? 'equipe' : '') : salvo;
    if(q){ lsSet('gapcampo-papel:' + email, papel); if(q.nome) lsSet('gapcampo-nome:' + email, q.nome); }
    K.papel = papel || null; K.nome = (q && q.nome) || lsGet('gapcampo-nome:' + email) || '';
    if(!K.papel) return false;
    K.lista = (await get('lista:' + email)) || [];
    if(K.papel === 'equipe' && (/^#(conectar|usina|chamado)/.test(location.hash) || /[?&]av=/.test(location.search))) return false;   // aviso tocado / voltou do "Conectar inversor"
    abrir(K.papel === 'instalador' ? 'lista' : 'escolha');
    if(K.papel === 'instalador') sincronizar();
    return true;
  }
  const reset = () => { fechar(); K.decidido = false; K.papel = null; K.email = ''; K.lista = []; K.sid = null; };
  window.GAP_CAMPO = {decidir, aberto: () => K.aberto, decidido: () => K.decidido, abrir, fechar, reset, sincronizar,
    _t: {classe, configMppts, mpptsIniciais, tensaoNum, ITENS, K, estado}};
})();
