const fs = require('fs');
const path = require('path');
const out = process.env.BP_SMOKE_OUT;
module.exports = async (t) => {
  const J = async (code) => JSON.parse(await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`));
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };
  // a page with real content (text, code, table, image, sub-page) so exports have something to chew on
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'Export me',icon:'📦'}); const sub=BP.createPage(p.id,{title:'Child page'}); sub.blocks=[BP.newBlock('p','child body')];
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    p.blocks=[BP.newBlock('h2','Heading'),BP.newBlock('p','Some <b>bold</b> text'),Object.assign(BP.newBlock('code',''),{lang:'bash',text:'curl -L http://x/'}),Object.assign(BP.newBlock('image'),{src:png,caption:'pic'}),Object.assign(BP.newBlock('table'),{rows:[['a','b'],['1','2']],header:true}),Object.assign(BP.newBlock('page'),{ref:sub.id})];
    BP.state.__P=p.id; BP.open(p.id); 0;})()`);
  await t.wait(300);
  const openMenu = async () => { await t.eval(`document.querySelector('.topbar .icon-btn[title="More"]').click()`); await t.wait(120); };
  const clickItem = async (label) => {
    await openMenu();
    const ok = await J(`(()=>{ const it=[...document.querySelectorAll('.popover .menu-item')].find(x=>(x.querySelector('.mi-label')||x).textContent.trim().startsWith(${JSON.stringify(label)})); if(!it) return false; it.click(); return true; })()`);
    await t.wait(250);
    return ok;
  };
  const P = `BP.page(BP.state.__P)`;
  await openMenu();
  const items = await J(`[...document.querySelectorAll('.popover .menu-item')].map(x=>x.textContent.trim())`);
  console.log('   menu items:', JSON.stringify(items));
  check('menu opens and lists items', items.length >= 8);
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(100);
  check('Small text toggles', (await clickItem('Small text')) && (await J(`${P}.small===true && !!document.querySelector('.pagewrap.small')`)));
  await clickItem('Small text');
  check('Full width toggles', (await clickItem('Full width')) && (await J(`${P}.full===true && !!document.querySelector('.pagewrap.full')`)));
  await clickItem('Full width');
  await openMenu();
  await t.eval(`[...document.querySelectorAll('.popover .menu-item')].find(x=>(x.querySelector('.mi-label')||x).textContent.trim().startsWith('Font')).click()`); await t.wait(250);
  const fontOk = await J(`(()=>{ const it=[...document.querySelectorAll('.popover .menu-item')].find(x=>(x.querySelector('.mi-label')||x).textContent.trim()==='Serif'); if(!it) return false; it.click(); return true; })()`); await t.wait(250);
  check('Font → Serif applies', fontOk && (await J(`${P}.font==='serif' && !!document.querySelector('.pagewrap.font-serif')`)));
  check('Lock page makes the editor read-only', (await clickItem('Lock page')) && (await J(`${P}.locked===true && !!document.querySelector('.editor.readonly')`)));
  check('Unlock page', (await clickItem('Lock page')) && (await J(`!${P}.locked && !document.querySelector('.editor.readonly')`)));
  await t.eval(`BP.currentEditor.mutate(()=>{ BP.currentEditor.page.blocks.push(BP.newBlock('p','history edit')) })`);
  check('Page history dialog opens', (await clickItem('Page history')) && (await J(`!!document.querySelector('.hist') || !!document.querySelector('.modal .muted')`)));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(150);
  const tn = await J(`(BP.state.templates||[]).length`);
  check('Save as template stores one', (await clickItem('Save as template')) && (await J(`BP.state.templates.length`)) === tn + 1);
  const pn = await J(`BP.allPages().length`);
  check('Duplicate creates a copy (with sub-page)', (await clickItem('Duplicate')) && (await J(`BP.allPages().length`)) >= pn + 2 && (await J(`BP.page(BP.state.current).title.endsWith('(copy)')`)));
  await t.eval(`BP.open(BP.state.__P)`); await t.wait(250);

  check('Export / print opens the dialog', (await clickItem('Export')) && (await J(`!!document.querySelector('.modal .share-row')`)));
  const rows = await J(`[...document.querySelectorAll('.modal .share-row')].map(r=>r.textContent.trim())`);
  console.log('   export options:', JSON.stringify(rows));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(150);

  const openExport = async () => { await openMenu(); await t.eval(`[...document.querySelectorAll('.popover .menu-item')].find(x=>(x.querySelector('.mi-label')||x).textContent.trim().startsWith('Export')).click()`); await t.wait(250); };
  const clickRow = async (starts) => { const ok = await J(`(()=>{ const r=[...document.querySelectorAll('.modal .share-row')].find(x=>x.textContent.includes(${JSON.stringify(starts)})); if(!r) return false; r.click(); return true; })()`); await t.wait(1200); return ok; };
  fs.mkdirSync(out, { recursive: true });
  const before = new Set(fs.readdirSync(out));
  const fresh = () => fs.readdirSync(out).filter((f) => !before.has(f));
  for (const [needle, ext, mustHave] of [['Markdown (.md)', '.md', 'curl -L'], ['Web page', '.html', '<h2'], ['Page data', '.json', '"pages"']]) {
    await openExport();
    const clicked = await clickRow(needle);
    const f = fresh().find((x) => x.endsWith(ext));
    let body = ''; try { body = f ? fs.readFileSync(path.join(out, f), 'utf8') : ''; } catch (_) {}
    check('Export ' + needle + ' writes a file', clicked && !!f && body.includes(mustHave), f ? f + ' (' + body.length + ' bytes)' : 'no file');
    await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(150);
  }
  await openExport();
  const pdfRow = await clickRow('PDF');
  await t.wait(1500);
  const pdf = fresh().find((x) => x.endsWith('.pdf'));
  const pdfHead = pdf ? fs.readFileSync(path.join(out, pdf)).slice(0, 5).toString() : '';
  check('Export PDF writes a real PDF', pdfRow && pdfHead === '%PDF-', pdf ? pdf + ' ' + fs.statSync(path.join(out, pdf)).size + ' bytes' : 'no file');
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(150);

  await openExport();
  const folderRow = await clickRow('Folder with');
  const dirs = fs.readdirSync(out).filter((x) => x.startsWith('export-'));
  const tree = [];
  if (dirs.length) { const walk = (d, base) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name), base + e.name + '/') : tree.push(base + e.name))); walk(path.join(out, dirs[dirs.length - 1]), ''); }
  console.log('   folder export tree:', JSON.stringify(tree));
  check('Folder export has page, sub-page and image file', folderRow && tree.some((x) => /Export me\.md$/.test(x)) && tree.some((x) => /Child page\.md$/.test(x)) && tree.some((x) => /\.png$/.test(x)));
  const mdPath = dirs.length && tree.find((x) => /Export me\.md$/.test(x));
  const md = mdPath ? fs.readFileSync(path.join(out, dirs[dirs.length - 1], mdPath), 'utf8') : '';
  check('Markdown references the image file (not base64)', md.includes('![pic](') && !md.includes('base64'));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(150);

  check('menu has Move to, Page info, Copy link, favorites', ['Move to','Page info','Copy link','Add to favorites'].every((l)=>items.some((i)=>i.includes(l))));
  check('print stylesheet hides modals/popovers', await J(`[...document.styleSheets].some(s=>{ try{ return [...s.cssRules].some(r=>r.media && /print/.test(r.media.mediaText) && /modal-back/.test(r.cssText)); }catch(e){return false} })`));
  check('Move to trash trashes the page', (await clickItem('Move to trash')) && (await J(`${P}.trashed===true`)));
  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  if (fails) throw new Error(fails + ' checks failed');
};
