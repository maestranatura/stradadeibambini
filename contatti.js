// Pannello Contatti nel menu: apre/chiude, Esc, clic fuori. Nessuna dipendenza esterna.
(() => {
  const pulsante = w => w.querySelector('[data-contatti-btn]');
  const pannello = w => w.querySelector('[data-contatti-panel]');
  const chiudi = (w) => {
    const b = pulsante(w), p = pannello(w);
    if (b) b.setAttribute('aria-expanded', 'false');
    if (p) p.hidden = true;
  };
  const apri = (w) => {
    document.querySelectorAll('[data-contatti]').forEach(x => { if (x !== w) chiudi(x); });
    const b = pulsante(w), p = pannello(w);
    if (b) b.setAttribute('aria-expanded', 'true');
    if (p) p.hidden = false;
  };
  const isOpen = w => pulsante(w)?.getAttribute('aria-expanded') === 'true';

  document.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-contatti-btn]');
    if (btn) {
      ev.preventDefault();
      const w = btn.closest('[data-contatti]');
      if (isOpen(w)) chiudi(w); else apri(w);
      return;
    }
    if (!ev.target.closest('[data-contatti]')) {
      document.querySelectorAll('[data-contatti]').forEach(chiudi);
    }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    const aperto = document.querySelector('[data-contatti-btn][aria-expanded="true"]');
    document.querySelectorAll('[data-contatti]').forEach(chiudi);
    if (aperto) aperto.focus();
  });
})();
