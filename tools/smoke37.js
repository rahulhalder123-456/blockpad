/* Diagrams from text, Vim keys, the web clipper and slides, end to end in the real app.
   The clipper is tested against a small web server started here (127.0.0.1), so no internet is needed. */
const http = require('http');
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const W = (ms) => t.wait(ms);
  await t.eval(`window.kd = (key, o = {}) => { const el = document.activeElement; const e = new KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, o)); el.dispatchEvent(e); return e.defaultPrevented; }; 0`);

  // ---------- diagrams ----------
  const pid = await J(`(() => { const p = BP.createPage(null, { title: 'Diagrams', blocks: [Object.assign(BP.newBlock('code', 'graph TD\\n  A[Start] --> B{Ok?}\\n  B -- yes --> C[Done]\\n  B -- no --> D[Retry]'), { lang: 'mermaid' }), Object.assign(BP.newBlock('code', 'graph TD\\n  A --> ((('), { lang: 'mermaid' }), BP.newBlock('p', 'after')] }); BP.open(p.id); return p.id; })()`);
  await W(2500);
  const d = await J(`(() => { const o = [...document.querySelectorAll('.mm-out')]; return { n: o.length, svg: o[0] && !!o[0].querySelector('svg'), nodes: o[0] ? o[0].querySelectorAll('.node').length : 0, text: o[0] ? o[0].textContent : '', err: o[1] && o[1].classList.contains('err'), errMsg: o[1] ? o[1].textContent.slice(0, 80) : '', leftover: document.querySelectorAll('body > [id^="dbp-mm-"], body > [id^="bp-mm-"]').length }; })()`);
  check('a mermaid code block is drawn as a diagram', d.n === 2 && d.svg && d.nodes === 4 && d.text.includes('Retry'), JSON.stringify([d.n, d.svg, d.nodes]));
  check('a mistake in the diagram text shows a message, not a crash', d.err && d.errMsg.startsWith('⚠'), d.errMsg);
  check('failed drawings leave nothing behind on the page', d.leftover === 0, d.leftover);
  check('the code is hidden until Edit diagram', await J(`getComputedStyle(document.querySelector('.codebox.mm .codewrap')).display === 'none' && !!document.querySelector('.mm-edit')`));
  await t.eval(`document.querySelector('.mm-edit').click()`); await W(300);
  check('Edit diagram shows the code', await J(`getComputedStyle(document.querySelector('.codebox.mm .codewrap')).display !== 'none'`));
  await t.eval(`(() => { const ta = document.querySelector('.codebox.mm.editing textarea'); ta.value = 'pie title Pets\\n  "Dogs" : 5\\n  "Cats" : 3'; ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await W(1800);
  check('editing the text redraws the diagram', await J(`document.querySelector('.mm-out').textContent.includes('Dogs') || !!document.querySelector('.mm-out svg .pieCircle')`));
  check('the text is saved in the block', (await J(`BP.page('${pid}').blocks[0].text`)).startsWith('pie title Pets'));
  await t.eval(`BP.setTheme('dark')`); await W(1500);
  check('switching theme redraws diagrams', await J(`!!document.querySelector('.mm-out svg')`));
  await t.eval(`BP.setTheme('light')`);
  check('"/diagram" is in the block menu', await J(`(() => { const p = BP.createPage(null, { title: 'x', blocks: [BP.newBlock('p', '')] }); BP.open(p.id); const el = document.querySelector('.editor .block .txt'); el.focus(); document.execCommand('insertText', false, '/diagram'); return new Promise((r) => setTimeout(() => r(!!document.querySelector('.slash') && document.querySelector('.slash').textContent.includes('Diagram from text')), 250)); })()`));
  await t.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`); await W(2500);
  check('choosing it adds a ready-made diagram', await J(`(() => { const b = BP.page(BP.state.current).blocks.find(x => x.lang === 'mermaid'); return !!b && !!document.querySelector('.mm-out svg'); })()`));
  const exp = await J(`BP.pageToMd(BP.page('${pid}'))`);
  check('Markdown export writes a ```mermaid fence', exp.includes('```mermaid'), exp.slice(0, 60));
  const back = await J(`BP.vault.mdToBlocks('\`\`\`mermaid\\ngraph LR\\n  a --> b\\n\`\`\`').then(b => b[0])`);
  check('importing a ```mermaid fence gives a diagram block', back.type === 'code' && back.lang === 'mermaid');

  // ---------- vim keys ----------
  const vp = await J(`(() => { const p = BP.createPage(null, { title: 'Vim', blocks: [BP.newBlock('p', 'hello world'), BP.newBlock('p', 'second line'), BP.newBlock('p', 'third')] }); BP.open(p.id); BP.state.settings.vim = true; BP.vim.refresh(); return p.id; })()`);
  await W(400);
  const blockText = (i) => J(`BP.textOf(BP.page('${vp}').blocks[${i}] ? BP.page('${vp}').blocks[${i}].text : '')`);
  const nBlocks = () => J(`BP.page('${vp}').blocks.length`);
  const focusBlock = (i, where) => t.eval(`BP.editorHelpers.setCaret(BP.currentEditor.txtOf(BP.page('${vp}').blocks[${i}].id), '${where}')`);
  const activeIdx = () => J(`(() => { const id = document.activeElement.closest('.block') && document.activeElement.closest('.block').dataset.id; return BP.page('${vp}').blocks.findIndex(b => b.id === id); })()`);
  const key = async (k, o) => { await t.eval(`kd(${JSON.stringify(k)}, ${JSON.stringify(o || {})})`); await W(120); };
  await focusBlock(0, 'start'); await W(150);
  check('Vim mode shows -- NORMAL --', await J(`BP.vim.mode === 'normal' && document.querySelector('.vim-pill') && document.querySelector('.vim-pill').textContent.includes('NORMAL')`));
  await key('x');
  check('x deletes the letter under the cursor', (await blockText(0)) === 'ello world', await blockText(0));
  await key('l'); await key('l'); await key('x');
  check('l moves right, then x deletes there', (await blockText(0)) === 'elo world', await blockText(0));
  await key('5'); await key('x');
  check('a count repeats (5x)', (await blockText(0)) === 'elld', await blockText(0));
  await key('j');
  check('j moves into the next block', (await activeIdx()) === 1);
  await key('k');
  check('k moves back to the previous block', (await activeIdx()) === 0);
  await key('G');
  check('G jumps to the last block', (await activeIdx()) === 2);
  await key('g'); await key('g');
  check('gg jumps to the first block', (await activeIdx()) === 0);
  const before = await blockText(0);
  await t.type('qq'); await W(150);
  check('typing letters in NORMAL mode does not insert text', (await blockText(0)) === before, await blockText(0));
  await focusBlock(1, 'start'); await key('d'); await key('d');
  check('dd deletes the block', (await nBlocks()) === 2 && (await blockText(1)) === 'third', await J(`BP.page('${vp}').blocks.map(b => BP.textOf(b.text)).join('|')`));
  await key('y'); await key('y'); await key('p');
  check('yy then p copies the block below', (await nBlocks()) === 3 && (await blockText(2)) === 'third', await J(`BP.page('${vp}').blocks.map(b => BP.textOf(b.text)).join('|')`));
  await focusBlock(0, 'end'); await key('o');
  check('o opens a new block below and switches to INSERT', (await nBlocks()) === 4 && (await J(`BP.vim.mode`)) === 'insert' && (await activeIdx()) === 1);
  await t.eval(`document.execCommand('insertText', false, 'typed')`); await W(150);
  check('in INSERT mode typing works', (await blockText(1)) === 'typed', await blockText(1));
  await key('Escape');
  check('Esc returns to NORMAL', (await J(`BP.vim.mode`)) === 'normal');
  await key('i');
  check('i switches to INSERT', (await J(`BP.vim.mode`)) === 'insert');
  await key('Escape');
  await t.eval(`BP.state.settings.vim = false; BP.vim.refresh()`); await W(200);
  check('turning Vim keys off hides the mode label and restores typing', await J(`getComputedStyle(document.querySelector('.vim-pill')).display === 'none' && BP.vim.mode === 'insert'`));
  await t.type('z'); await W(150);
  check('…typing works again', (await J(`BP.textOf(BP.page('${vp}').blocks[1].text)`)).includes('z'));

  // ---------- web clipper ----------
  const long = 'This paragraph is deliberately long so the article is clearly the main content of the page. '.repeat(6);
  const server = http.createServer((req, res) => {
    if (req.url === '/article') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><head><title>Example Site | A Great Article</title><meta property="og:title" content="A Great Article"><meta property="og:site_name" content="Example Site"><meta name="author" content="Jane Doe"><meta property="article:published_time" content="2026-03-04T10:00:00Z"><meta property="og:image" content="/cover.png"></head>
<body><header><nav><a href="/">Home</a> <a href="/about">About us</a> <a href="/shop">Shop now</a></nav></header>
<div class="sidebar"><p>Related: buy cheap stuff today, subscribe to our newsletter</p></div>
<article><h1>A Great Article</h1><p>${long}First paragraph with <b>bold</b> and a <a href="/relative/page">relative link</a> and <em>emphasis</em>.</p>
<h2>A section</h2><ul><li>one</li><li>two<ul><li>nested item</li></ul></li></ul><ol><li>first</li><li>second</li></ol>
<pre><code class="language-js">const answer = 42;\nconsole.log(answer);</code></pre><blockquote>A wise quote</blockquote>
<figure><img src="/pic.png" alt="A picture"><figcaption>The caption</figcaption></figure>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>alpha</td><td>1</td></tr></table><p>${long}</p></article>
<div class="comments">Comment spam here, ignore me</div><footer>Copyright junk footer text</footer><script>window.bad = 1</script></body></html>`);
    } else if (req.url === '/json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"a":1}'); }
    else if (req.url === '/empty') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body><p>hi</p></body></html>'); }
    else { res.writeHead(404, { 'content-type': 'text/html' }); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const cp = await J(`BP.clip.clip('${base}/article').then(p => ({ id: p.id, title: p.title, tags: p.tags, meta: p.meta, cover: p.cover, blocks: p.blocks.map(b => ({ type: b.type, text: BP.textOf(b.text || '').slice(0, 60), html: b.text, src: b.src, cap: b.caption, lang: b.lang, rows: b.rows, header: b.header, kids: (b.children || []).length })) }))`);
  const types = cp.blocks.map((b) => b.type);
  check('clipper: page titled from the article', cp.title === 'A Great Article' && cp.tags.join() === 'clipped');
  check('clipper: source, site, author and date kept as properties', cp.meta.source === base + '/article' && cp.meta.site === 'Example Site' && cp.meta.author === 'Jane Doe' && cp.meta.published === '2026-03-04' && /^\d{4}-\d{2}-\d{2}$/.test(cp.meta.clipped), JSON.stringify(cp.meta));
  check('clipper: the title is not repeated as a heading', !(cp.blocks[0].type === 'h1' && cp.blocks[0].text === 'A Great Article'), cp.blocks[0].type + ':' + cp.blocks[0].text);
  const all = cp.blocks.map((b) => b.text).join(' ');
  check('clipper: menus, sidebar, comments, footer and scripts left out', !/Shop now|buy cheap|Comment spam|Copyright junk|window\.bad/.test(all), all.slice(0, 120));
  const para = cp.blocks.find((b) => b.type === 'p');
  check('clipper: bold, emphasis and links kept (relative link made absolute)', para.html.includes('<b>bold</b>') && para.html.includes('<i>emphasis</i>') && para.html.includes('href="' + base + '/relative/page"'));
  check('clipper: headings, bullet and numbered lists (nested)', types.includes('h1') && types.includes('bullet') && types.includes('number') && cp.blocks.find((b) => b.type === 'bullet' && b.text === 'two').kids === 1);
  const code = cp.blocks.find((b) => b.type === 'code');
  check('clipper: code block with its language (js -> javascript)', code && code.lang === 'javascript' && code.text.startsWith('const answer'), code && code.lang);
  check('clipper: quote, image with caption (absolute address), table', types.includes('quote') && cp.blocks.some((b) => b.type === 'image' && b.src === base + '/pic.png' && b.cap === 'The caption') && cp.blocks.some((b) => b.type === 'table' && b.header && JSON.stringify(b.rows) === '[["Name","Value"],["alpha","1"]]'));
  check('clipper: page cover from the site image when the article has none', cp.cover === null || cp.cover === base + '/cover.png');
  const bad = await t.eval(`BP.clip.clip('${base}/json').then(() => 'no error', (e) => e.message)`);
  check('clipper: a non-page address gives a clear message', /not a web page/i.test(bad), bad);
  const bad2 = await t.eval(`BP.clip.clip('${base}/empty').then(() => 'no error', (e) => e.message)`);
  check('clipper: a page with no article says so', /No article text/i.test(bad2), bad2);
  const bad3 = await t.eval(`BP.clip.clip('${base}/missing').then(() => 'no error', (e) => e.message)`);
  check('clipper: a missing page reports the site error', /404/.test(bad3), bad3);
  const bad4 = await t.eval(`BP.clip.clip('file:///etc/passwd').then(() => 'no error', (e) => e.message)`);
  check('clipper: only http(s) addresses are fetched', /http/i.test(bad4) && bad4 !== 'no error', bad4);
  await t.eval(`BP.clip.dialog()`); await W(200);
  check('clipper: the dialog opens', await J(`!!document.querySelector('.modal input') && document.querySelector('.modal').textContent.includes('Clip a web page')`));
  await t.eval(`(() => { const i = document.querySelector('.modal input'); i.value = '${base}/article'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  for (let k = 0; k < 40 && (await J(`!!document.querySelector('.modal-back')`)); k++) await W(250);      // the fetch can take a moment in a packaged app
  await W(400);
  check('clipper: the dialog clips and opens the new page', await J(`!document.querySelector('.modal-back') && BP.page(BP.state.current).title === 'A Great Article' && BP.allPages().filter(p => p.title === 'A Great Article').length === 2`));
  server.close();

  // ---------- slides ----------
  const sp = await J(`(() => { const b = BP.newBlock; const p = BP.createPage(null, { title: 'My talk', icon: '▶', blocks: [b('h1', 'One'), b('p', 'first slide text'), BP.newBlock('divider'), b('h1', 'Two'), b('bullet', 'point a'), b('bullet', 'point b'), BP.newBlock('divider'), b('p', 'three is plain')] }); BP.open(p.id); return p.id; })()`);
  const sl = await J(`(() => { const a = BP.slides.present(BP.page('${sp}')); return { n: a.count() }; })()`); await W(500);
  check('slides: a title slide plus one slide per divider section', sl.n === 4, sl.n);
  check('slides: the title slide shows the page title', await J(`document.querySelector('.sl-slide h1').textContent === 'My talk'`));
  await t.eval(`kd('ArrowRight')`); await W(300);
  check('slides: → goes to the next slide and renders its blocks', await J(`BP.slides.active.index() === 1 && document.querySelector('.sl-slide').textContent.includes('first slide text')`));
  await t.eval(`kd(' ')`); await W(300);
  check('slides: Space also advances', await J(`BP.slides.active.index() === 2 && document.querySelectorAll('.sl-slide .t-bullet, .sl-slide .block').length >= 2`));
  await t.eval(`kd('End')`); await W(200);
  check('slides: End goes to the last slide, counter shows 4 / 4', await J(`BP.slides.active.index() === 3 && document.querySelector('.sl-count').textContent === '4 / 4'`));
  await t.eval(`kd('ArrowRight')`); await W(100);
  check('slides: stays on the last slide', await J(`BP.slides.active.index() === 3`));
  await t.eval(`kd('ArrowLeft'); kd('Home')`); await W(200);
  check('slides: ← and Home go back', await J(`BP.slides.active.index() === 0`));
  await t.eval(`kd('Escape')`); await W(200);
  check('slides: Esc stops the presentation', await J(`!document.querySelector('.sl-deck') && BP.slides.active === null`));
  const byHead = await J(`(() => { const b = BP.newBlock; const p = BP.createPage(null, { title: 'No dividers', blocks: [b('p', 'intro'), b('h1', 'A'), b('p', 'a1'), b('h1', 'B'), b('p', 'b1'), b('h1', 'C')] }); return BP.slides.split(p).map(s => s.map(x => BP.textOf(x.text)).join('/')); })()`);
  check('slides: a page without dividers is split at its top headings', byHead.join(' | ') === 'intro | A/a1 | B/b1 | C', byHead.join(' | '));
  check('slides: databases and canvases give a message instead', await J(`(() => { BP.slides.present(BP.canvas.create(null, 'c')); return !document.querySelector('.sl-deck'); })()`));
  check('slides: "Present as slides" is in the page menu', await J(`(() => { BP.open('${sp}'); return true; })()`) && (await t.eval(`(() => { document.querySelectorAll('.topbar .icon-btn')[document.querySelectorAll('.topbar .icon-btn').length - 1].click(); return [...document.querySelectorAll('.popover .mi-label')].map(x => x.textContent).includes('Present as slides'); })()`)));
  await t.eval(`BP.closePopovers(0)`);
  check('slides, clipper and Vim are in the command palette', await J(`(() => { const n = BP.kb.commands().map(c => c.name); return n.includes('Present this page as slides') && n.includes('Clip a web page…') && n.includes('Turn Vim keys on / off'); })()`));

  // ---------- nothing in the way ----------
  check('no leftover name of another product in the app files', await J(`fetch('knowledge.js').then(r => r.text()).then(s => !/obsidian/i.test(s))`));
  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke37 failed');
};
