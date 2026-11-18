/* =====================================================================================================
   SWARM REBUILD — camada visual temporária de "reconstrução" com vários cursores (V24)
   Técnica própria (Web Animations API + overlay), inspirada na ideia de reconstrução por enxame. Nenhum código de terceiros.
   • NÃO altera o DOM funcional: o texto aparece por clip-path/opacity animados por element.animate() (cancelados ao final;
     nenhum atributo/estilo/nó é gravado nos elementos). Os cursores vivem num overlay fixo próprio (#bpSwarm, pointer-events:none).
   • Roda uma vez por tela por sessão, nunca em loop, termina sozinha (≤ ~3 s no desktop, ≤ ~1,8 s no celular).
   • Pula: botão "Pular animação", Esc, qualquer clique/toque/tecla/rolagem do usuário. Desligada com prefers-reduced-motion.
   • Não anima campos (input/textarea/select), nem textos sensíveis (valores R$, CPF/CNPJ, e-mail, senhas) — estes ficam visíveis e sem cursor.
   Desativável para suítes: window.__BP_SWARM_OFF = true.   API de teste: window.__bpSwarm
   ===================================================================================================== */
(function () {
  'use strict';
  if (window.__bpSwarm) return;
  const D = document, W = window;
  const COLORS = ['#5b7cff', '#35c79a', '#9a6bff', '#28c7e8', '#f0a23a'];
  const BOX = '.panel,.card,.stat,.tool,.sector,.bp-compact-sector,.notice,.v10-kpi,.mn69-panel,.mn69-kpi,.ig-kpis>div,.dialog,table,figure,.bpm-photo,.v7-mini,.activity';
  const SKIP = 'input,textarea,select,option,script,style,svg,canvas,video,iframe,[contenteditable],[data-no-swarm],#bpSwarm,.rh-card,.bp-s-cinema-background,.bp-s-cinema-scene';
  const SENS = /R\$\s?\d|\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}|[\w.+-]+@[\w-]+\.[\w.-]+|\bsenha\b|\bpassword\b|\btoken\b|\bchave\b/i;
  const mm = q => { try { return W.matchMedia(q).matches; } catch (e) { return false; } };
  const off = () => W.__BP_SWARM_OFF === true || mm('(prefers-reduced-motion: reduce)');
  const core = () => W.__bpCore;
  const cfg = () => { const mob = mm('(pointer:coarse)') || W.innerWidth < 760, low = (navigator.hardwareConcurrency || 4) <= 2; return { cursores: mob || low ? 3 : 5, orcamento: mob ? 1700 : 2800, maxAlvos: mob ? 45 : 80, movel: mob }; };

  let seen = new Set(), run = null, timer = 0;
  try { JSON.parse(sessionStorage.getItem('bpSwarmSeen') || '[]').forEach(k => seen.add(k)); } catch (e) { }
  const marca = k => { seen.add(k); try { sessionStorage.setItem('bpSwarmSeen', JSON.stringify([...seen].slice(-80))); } catch (e) { } };

  /* ---------- seleção de alvos (somente leitura do DOM) ---------- */
  const visivel = (el, vh) => {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > vh) return null;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null; return { r, cs };
  };
  const proprio = el => { let t = ''; for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue; return t.trim(); };
  function alvos(roots, max) {
    const vh = W.innerHeight, boxes = [], leaves = [], tabelas = new Set(); const vistos = new Set();
    roots.forEach(root => {
      if (!root || !root.isConnected) return;
      root.querySelectorAll('*').forEach(el => {
        if (vistos.has(el) || el.closest(SKIP)) return; vistos.add(el);
        if (el.matches(BOX)) { const v = visivel(el, vh); if (v && v.cs.clipPath === 'none' && v.r.width < W.innerWidth * 1.2) boxes.push({ el, kind: 'box', r: v.r, op: +v.cs.opacity === 1 }); }
        const t = proprio(el); if (t.length < 2) return;
        if (SENS.test(t) || SENS.test(el.textContent.slice(0, 120)) && el.children.length === 0) return;
        if (el.matches('td,th')) { const tb = el.closest('table'); if (tb && tb.querySelectorAll('td,th').length > 30) { tabelas.add(tb); return; } }
        const v = visivel(el, vh); if (!v || v.cs.clipPath !== 'none') return; if (v.cs.display === 'inline' && el.children.length) return;
        leaves.push({ el, kind: 'leaf', r: v.r, len: t.length });
      });
    });
    tabelas.forEach(tb => tb.querySelectorAll('tr').forEach((tr, i) => { if (i < 14) { const v = visivel(tr, vh); if (v) boxes.push({ el: tr, kind: 'box', r: v.r, op: false }); } }));
    const todos = boxes.concat(leaves); if (todos.length <= max) return { boxes, leaves };
    const lim = Math.max(8, max - Math.min(boxes.length, 18)); return { boxes: boxes.slice(0, 18), leaves: leaves.slice(0, lim) };
  }
  const emb = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };   // ordem aleatória (sem fila fixa)
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  /* ---------- execução ---------- */
  function iniciar(key, roots) {
    if (off() || seen.has(key)) return false;
    const ae = D.activeElement; if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return false;
    if (run) finalizar('nova-tela');
    const c = cfg(), { boxes, leaves } = alvos(roots, c.maxAlvos);
    if (boxes.length + leaves.length < 3) return false;
    marca(key);
    const ov = D.createElement('div'); ov.id = 'bpSwarm'; ov.setAttribute('aria-hidden', 'true');
    const pular = D.createElement('button'); pular.type = 'button'; pular.className = 'bp-sw-skip'; pular.textContent = 'Pular animação'; pular.setAttribute('aria-hidden', 'false'); pular.onclick = e => { e.stopPropagation(); finalizar('pular'); };
    ov.appendChild(pular); D.body.appendChild(ov);
    const anims = [], curs = [];
    const R = run = { key, ov, anims, curs, t0: performance.now(), raf: 0, fim: 0, fps: [], n: boxes.length + leaves.length, cfg: c };
    /* 1) planejamento (ordem aleatória, fila por cursor) e escala única para caber no orçamento */
    const fila = emb(leaves.slice()), seqs = Array.from({ length: c.cursores }, () => ({ t: 0, segs: [] }));
    const bd = c.movel ? 260 : 380;
    boxes.forEach(b => { b.delay = Math.random() * 600; b.dur = bd; });
    fila.forEach(l => {
      const sq = seqs.reduce((a, b) => b.t < a.t ? b : a);
      const pai = boxes.filter(b => b.el.contains(l.el)).pop(), min = pai ? pai.delay + pai.dur * .55 : 0;
      const dur = Math.max(140, Math.min(640, l.len * 16)), travel = 110 + Math.random() * 120, ini = Math.max(sq.t + travel, min + travel);
      sq.t = ini + dur + 20 + Math.random() * 60; sq.segs.push({ l, t0: ini - travel, t1: ini, t2: ini + dur, dur });
    });
    const bruto = Math.max(1, ...seqs.map(s => s.t), ...boxes.map(b => b.delay + b.dur)), k = Math.min(1, (c.orcamento - 220) / bruto);
    boxes.forEach(b => { b.delay *= k; b.dur *= k; });
    seqs.forEach(sq => sq.segs.forEach(g => { g.t0 *= k; g.t1 *= k; g.t2 *= k; g.dur *= k; }));
    boxes.forEach(b => {
      const kf = b.op ? [{ clipPath: 'inset(-24px -24px 100% -24px)', opacity: 0 }, { clipPath: 'inset(-24px)', opacity: 1 }] : [{ clipPath: 'inset(-24px -24px 100% -24px)' }, { clipPath: 'inset(-24px)' }];
      try { anims.push(b.el.animate(kf, { duration: Math.max(60, b.dur), delay: b.delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' })); } catch (e) { }
    });
    seqs.forEach(sq => sq.segs.forEach(g => {
      const passos = Math.max(4, Math.min(48, g.l.len));
      try { anims.push(g.l.el.animate([{ clipPath: 'inset(-8px 100% -8px -8px)' }, { clipPath: 'inset(-8px)' }], { duration: Math.max(60, g.dur), delay: g.t1, easing: 'steps(' + passos + ',end)', fill: 'backwards' })); } catch (e) { }
    }));
    /* 3) cursores (overlay) */
    seqs.forEach((sq, i) => {
      if (!sq.segs.length) return;
      const el = D.createElement('div'); el.className = 'bp-sw-cur'; el.style.setProperty('--c', COLORS[i % COLORS.length]);
      el.innerHTML = '<svg viewBox="0 0 20 24" width="20" height="24"><path d="M2 1.5 18 12.5 10.6 13.9 14.2 21.8 11 23 7.4 15.2 2 19.5Z" fill="var(--c)" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
      ov.appendChild(el); curs.push({ el, segs: sq.segs, from: { x: Math.random() < .5 ? -30 : W.innerWidth + 30, y: Math.random() * W.innerHeight * .8 } });
    });
    R.fim = Math.max(0, ...seqs.map(s => s.segs.length ? s.segs[s.segs.length - 1].t2 : 0), ...boxes.map(b => b.delay + b.dur)) + 220;
    R.raf = requestAnimationFrame(quadro);
    return true;
  }
  function quadro(now) {
    const R = run; if (!R) return; const t = now - R.t0;
    R.fps.push(now); if (R.fps.length > 14) { const d = (R.fps[R.fps.length - 1] - R.fps[0]) / 13; R.fps.shift(); if (d > 55) return finalizar('lento'); }
    R.curs.forEach(cu => {
      let x = cu.from.x, y = cu.from.y, op = 0, prev = cu.from;
      for (const s of cu.segs) {
        const r = s.l.r, sx = r.left + 2, sy = r.top + r.height * .62, ex = r.right - 2;
        if (t < s.t0) { break; }
        if (t < s.t1) { const k = ease((t - s.t0) / Math.max(1, s.t1 - s.t0)); x = prev.x + (sx - prev.x) * k; y = prev.y + (sy - prev.y) * k; op = 1; prev = null; break; }
        if (t < s.t2) { const k = (t - s.t1) / Math.max(1, s.t2 - s.t1); x = sx + (ex - sx) * k; y = sy; op = 1; prev = null; break; }
        x = ex; y = sy; op = 1; prev = { x, y };
      }
      if (t > R.fim - 200) op = Math.max(0, (R.fim - t) / 200);
      cu.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)'; cu.el.style.opacity = op;
    });
    if (t >= R.fim) return finalizar('fim');
    R.raf = requestAnimationFrame(quadro);
  }
  function finalizar(motivo) {
    const R = run; if (!R) return; run = null; cancelAnimationFrame(R.raf);
    R.anims.forEach(a => { try { a.cancel(); } catch (e) { } }); if (R.ov) R.ov.remove(); R.motivo = motivo; W.__bpSwarm.ultimo = { key: R.key, motivo, alvos: R.n, ms: Math.round(performance.now() - R.t0) };
  }

  /* ---------- gatilhos: primeira apresentação de cada tela/ferramenta/modal na sessão ---------- */
  const $ = id => D.getElementById(id), vis = el => !!el && !el.hidden && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  function consulta(origem) {
    timer = 0; if (off()) return;
    const app = $('appScreen'), auth = $('authScreen');
    if (vis(app)) {
      const S = core() && core().getS && core().getS(); if (!S) return;
      const rh = $('bpRh') && !$('bpRh').hidden;
      const home = app.classList.contains('bp-home'), titulo = ($('pageTitle') || {}).textContent || '', key = home ? 'home' : 'v:' + S.page + '|' + titulo;
      if (home && !seen.has(key) && !W.__bpSwHomeEsperou) { W.__bpSwHomeEsperou = true; timer = setTimeout(consulta, 800); return; }   /* deixa o início terminar de montar */
      const roots = home ? [$('bpAppIntro'), $('bpPortfolio') && null, $('view')] : [$('view')];
      if (!seen.has('menu')) { roots.push($('bpShellNavigation'), D.querySelector('.topbar')); }
      if (home && !seen.has(key)) { /* boas-vindas e hero */ roots.push(D.querySelector('.bp-s-cinema-welcome')); }
      if (iniciar(key, roots.filter(Boolean)) && !seen.has('menu')) marca('menu');
    } else if (vis(auth)) iniciar('auth', [auth]);
  }
  const agenda = () => { if (timer) clearTimeout(timer); timer = setTimeout(consulta, 220); };
  function modal() { const m = $('modalRoot'); if (!m || off()) return; const d = m.querySelector('.dialog'); if (!d) return; const h = d.querySelector('h2,h3,h1'), key = 'm:' + (h ? h.textContent.trim().slice(0, 50) : 'dialog'); setTimeout(() => { if (D.contains(d)) iniciar(key, [d]); }, 120); }
  function ini() {
    const v = $('view'), m = $('modalRoot'), app = $('appScreen'), au = $('authScreen');
    const mo = new MutationObserver(agenda);
    if (v) mo.observe(v, { childList: true }); if (app) mo.observe(app, { attributes: true, attributeFilter: ['class', 'hidden'] }); if (au) mo.observe(au, { attributes: true, attributeFilter: ['class', 'hidden'] });
    const t = $('pageTitle'); if (t) mo.observe(t, { childList: true, characterData: true, subtree: true });
    if (m) new MutationObserver(modal).observe(m, { childList: true });
    agenda();
  }
  /* o usuário nunca é bloqueado: qualquer interação encerra a animação (o clique segue normalmente) */
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => D.addEventListener(ev, e => { if (run && !(e.target && e.target.closest && e.target.closest('#bpSwarm'))) finalizar('usuario'); }, { capture: true, passive: true }));
  D.addEventListener('visibilitychange', () => { if (D.hidden) finalizar('oculto'); });
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ini); else ini();
  W.__bpSwarm = { iniciar, finalizar, alvos, consulta, seen: () => [...seen], reset: () => { seen = new Set(); try { sessionStorage.removeItem('bpSwarmSeen'); } catch (e) { } }, ativo: () => !!run, cfg, ultimo: null, _run: () => run };
})();
