/* tool-card-rise — dispara a entrada reta dos cartões internos UMA vez por abertura de ferramenta.
   Só adiciona/remove uma classe em #view (nada mais é escrito); não repete em atualizações de dados da mesma tela. */
(function () {
  'use strict'; if (window.__bpEntradas) return; window.__bpEntradas = true;
  const D = document; let ultimo = '', t = 0, off = 0;
  const mm = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function checa() {
    t = 0; const v = D.getElementById('view'), app = D.getElementById('appScreen'), core = window.__bpCore; if (!v || !app || !core || app.classList.contains('bp-home') || mm()) { if (app && app.classList.contains('bp-home')) ultimo = ''; return; }
    const S = core.getS && core.getS(); if (!S) return; const k = S.page + '|' + ((D.getElementById('pageTitle') || {}).textContent || ''); if (k === ultimo) return; ultimo = k;
    v.classList.remove('tool-card-rise-on'); void v.offsetWidth; v.classList.add('tool-card-rise-on'); clearTimeout(off); off = setTimeout(() => v.classList.remove('tool-card-rise-on'), 1300);
  }
  const agenda = () => { if (!t) t = setTimeout(checa, 60); };
  function ini() {
    const v = D.getElementById('view'), a = D.getElementById('appScreen'), p = D.getElementById('pageTitle'), mo = new MutationObserver(agenda);
    if (v) mo.observe(v, { childList: true }); if (a) mo.observe(a, { attributes: true, attributeFilter: ['class'] }); if (p) mo.observe(p, { childList: true, characterData: true, subtree: true }); agenda();
  }
  window.__bpEntradas = { checa, reset: () => { ultimo = ''; } };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', ini); else ini();
})();
