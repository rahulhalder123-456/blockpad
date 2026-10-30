/* Diagrams from text: a code block in the "mermaid" language is drawn as a diagram (flowcharts, sequence, class,
   state, ER, Gantt, pie, mind maps, timelines …). The drawing library (vendor/mermaid.min.js, MIT) is 3.5 MB, so it
   is loaded the first time a page has a diagram, not at start. Diagrams are drawn in its strict mode (no scripts, no
   click handlers, labels sanitised), in the app's own colours so they read well on light and dark pages. */
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

  const PIE = ['#5b5bd6', '#e5484d', '#2f9e44', '#e08a00', '#0b8a8f', '#c2379a', '#7c4ddb', '#3b6fd8', '#c9a100', '#8a7a60', '#f76808', '#12a594'];
  const tok = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || '').trim() || fallback;
  // colours come from the app's own theme (the library's own dark theme made pie slices nearly black on a dark page)
  const setup = (m) => {
    const t = dark() ? 'dark' : 'default';
    if (themeUsed === t) return;
    const text = tok('--text', dark() ? '#e4e4e8' : '#37352f'), bg = tok('--bg', dark() ? '#1f2025' : '#ffffff'), bg2 = tok('--bg2', dark() ? '#25262c' : '#f7f7f5');
    const accent = tok('--accent', '#5b5bd6'), soft = tok('--accent-soft', dark() ? '#2e2f55' : '#ecebfd'), muted = tok('--muted', '#8a8880'), border = tok('--border', dark() ? '#34353d' : '#e6e4df');
    const v = {
      darkMode: dark(), background: bg, textColor: text, primaryColor: soft, primaryTextColor: text, primaryBorderColor: accent,
      secondaryColor: bg2, tertiaryColor: bg2, lineColor: muted, mainBkg: soft, nodeBorder: accent, clusterBkg: bg2, clusterBorder: border,
      titleColor: text, edgeLabelBackground: bg, noteBkgColor: bg2, noteTextColor: text, noteBorderColor: border,
      pieStrokeColor: bg, pieStrokeWidth: '2px', pieOuterStrokeColor: border, pieOuterStrokeWidth: '1px', pieOpacity: '0.95',
      pieTitleTextColor: text, pieSectionTextColor: '#ffffff', pieLegendTextColor: text,
    };
    PIE.forEach((c, i) => { v['pie' + (i + 1)] = c; });
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: v, fontFamily: getComputedStyle(document.body).fontFamily, flowchart: { htmlLabels: false } });
    themeUsed = t;
  };

  // the library's message is a parser dump: say which line is wrong and what to try, keep the dump under "Technical details"
  const friendly = (e, code) => {
    const raw = String((e && (e.str || e.message)) || e);
    const lines = String(code).split('\n');
    const m = /Parse error on line (\d+)/i.exec(raw) || /\bline (\d+)/i.exec(raw);
    const num = m ? +m[1] : 0;
    const src = num && lines[num - 1] != null ? lines[num - 1].trim() : '';
    let what, hint;
    if (/No diagram type detected|UnknownDiagram/i.test(raw)) {
      what = 'The first line should say which kind of diagram this is.';
      hint = 'For example: graph TD (flowchart), sequenceDiagram, pie, gantt, classDiagram, stateDiagram-v2, erDiagram, mindmap or timeline.';
    } else if (num) {
      what = 'Line ' + num + (src ? ' ("' + src.slice(0, 80) + '")' : '') + ' is not valid here.';
      hint = 'Check the brackets, arrows and quotes on that line. A box is A[Text], a question is B{Text}, an arrow is A --> B.';
    } else {
      what = raw.split('\n')[0].slice(0, 160);
      hint = 'Check the diagram text for a typo.';
    }
    return { what, hint, raw };
  };

  // draw `code` into `el`; a mistake in the text shows a readable message instead of a diagram
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
      const f = friendly(e, code);
      el.append(BP.h('div', { class: 'mm-msg' },
        BP.h('b', null, '⚠ This diagram can’t be drawn yet'),
        BP.h('div', { class: 'mm-what' }, f.what),
        BP.h('div', { class: 'mm-hint' }, f.hint),
        BP.h('details', { class: 'mm-raw' }, BP.h('summary', null, 'Technical details'), BP.h('pre', null, f.raw.slice(0, 700)))));
      // open the text for editing the first time it fails, so the fix is one click away (not again after the person closes it)
      const box = el.closest && el.closest('.codebox');
      if (box && box.classList.contains('mm') && !box.classList.contains('editing') && !el.__autoOpened) {
        el.__autoOpened = true;
        box.classList.add('editing');
        const b = box.querySelector('.mm-edit');
        if (b) b.textContent = 'Done';
        // the text box was hidden until now, so it has no height yet: size it to its text (the Edit button does the same)
        const ta = box.querySelector('textarea');
        if (ta) requestAnimationFrame(() => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; });
      }
      ['d' + id, id].forEach((x) => { const s = document.getElementById(x); if (s && !el.contains(s)) s.remove(); });   // the library leaves a scratch node behind on errors
    }
  };
  // when the theme switches, redraw what is on screen so diagrams match it
  new MutationObserver(() => {
    if (!window.mermaid || themeUsed === (dark() ? 'dark' : 'default')) return;
    document.querySelectorAll('.mm-out').forEach((el) => el.__draw && el.__draw());
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
