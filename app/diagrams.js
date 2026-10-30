/* Diagrams from text: a code block in the "mermaid" language is drawn as a diagram (flowcharts, sequence, class,
   state, ER, Gantt, pie, mind maps, timelines …). The drawing library (vendor/mermaid.min.js, MIT) is 3.5 MB, so it
   is loaded the first time a page has a diagram, not at start. Diagrams are drawn in its strict mode (no scripts, no
   click handlers, labels sanitised). */
(function () {
  const BP = (window.BP = window.BP || {});
  const D = (BP.diagrams = {});
  let loading = null, n = 0, themeUsed = null;
  const dark = () => document.documentElement.dataset.theme === 'dark';
  D.load = () => {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/mermaid.min.js';
      s.onload = () => (window.mermaid ? res(window.mermaid) : rej(new Error('The diagram library did not load')));
      s.onerror = () => { loading = null; rej(new Error('The diagram library could not be loaded')); };
      document.head.append(s);
    });
    return loading;
  };
  const setup = (m) => {
    const t = dark() ? 'dark' : 'default';
    if (themeUsed === t) return;
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: t, fontFamily: getComputedStyle(document.body).fontFamily, flowchart: { htmlLabels: false } });
    themeUsed = t;
  };
  // draw `code` into `el`; a mistake in the text shows the library's message instead of a diagram
  D.render = async (el, code) => {
    code = String(code || '').trim();
    const mine = ++n;
    el.dataset.n = mine;
    if (!code) { el.innerHTML = ''; el.append(BP.h('div', { class: 'mm-msg muted small' }, 'Write the diagram in the code box, e.g.  graph TD; A-->B')); return; }
    const id = 'bp-mm-' + mine + '-' + Date.now().toString(36);
    try {
      const m = await D.load();
      setup(m);
      const { svg } = await m.render(id, code);
      if (el.dataset.n !== String(mine)) return;       // a newer drawing started meanwhile
      el.innerHTML = svg;
      el.classList.remove('err');
    } catch (e) {
      if (el.dataset.n !== String(mine)) return;
      el.innerHTML = '';
      el.classList.add('err');
      el.append(BP.h('div', { class: 'mm-msg' }, '⚠ ' + String((e && (e.str || e.message)) || e).split('\n').slice(0, 4).join(' ')));
      ['d' + id, id].forEach((x) => { const s = document.getElementById(x); if (s && !el.contains(s)) s.remove(); });   // the library leaves a scratch node behind on errors
    }
  };
  // when the theme switches, redraw what is on screen so diagrams match it
  new MutationObserver(() => {
    if (!window.mermaid || themeUsed === (dark() ? 'dark' : 'default')) return;
    document.querySelectorAll('.mm-out').forEach((el) => el.__draw && el.__draw());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
