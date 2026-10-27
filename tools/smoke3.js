const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  const dump = async (label) => console.log(label.padEnd(34), await t.eval(`JSON.stringify((function f(l){return l.map(b=>[b.type,BP.textOf(b.text||'')].concat(b.children?[f(b.children)]:[]))})(BP.page(BP.state.current).blocks))`));
  const H = `
    window.kd = (key, o={}) => { const el=document.activeElement; const e=new KeyboardEvent('keydown',Object.assign({key,bubbles:true,cancelable:true},o)); el.dispatchEvent(e); return e.defaultPrevented; };
    window.focusBlock = (i, where) => { const ed=BP.currentEditor; const id=BP.page(BP.state.current).blocks[i].id; BP.editorHelpers.setCaret(ed.txtOf(id), where); };
    window.ins = (s) => document.execCommand('insertText', false, s);
    0;
  `;
  await t.eval(H);
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  await t.eval(`(()=>{const p=BP.page(BP.state.current); p.title='Ops test'; p.blocks=[BP.newBlock('p','alpha beta'),BP.newBlock('bullet','item'),BP.newBlock('p','tail')]; BP.renderAll();})()`);
  await t.wait(200);
  // split in the middle with Enter
  await t.eval(`focusBlock(0,5)`); await t.eval(`kd('Enter')`); await t.wait(100);
  await dump('split alpha|beta');
  // merge back with backspace at start of block 1
  await t.eval(`focusBlock(1,'start')`); await t.eval(`kd('Backspace')`); await t.wait(100);
  await dump('merge back');
  // indent tail under bullet, outdent
  await t.eval(`focusBlock(2,'start')`); await t.eval(`kd('Tab')`); await t.wait(100);
  await dump('tab: tail into bullet');
  await t.eval(`document.activeElement.closest('.block') && kd('Tab',{shiftKey:true})`); await t.wait(100);
  await dump('shift+tab: out again');
  // slash -> toggle, columns, table, code, page, inline database, divider
  for (const q of ['toggle', '2 col', 'table', 'code', 'divider', 'image', 'toc', 'board']) {
    await t.eval(`(()=>{const p=BP.page(BP.state.current); const nb=BP.newBlock('p',''); p.blocks.push(nb); BP.renderAll(); BP.editorHelpers.setCaret(BP.currentEditor.txtOf(nb.id),'start'); ins('/${q}');})()`);
    await t.wait(120);
    const open = await t.eval(`!!document.querySelector('.slash') && document.querySelectorAll('.slash-item').length`);
    await t.eval(`kd('Enter')`); await t.wait(150);
    console.log('slash', q, 'items', open);
  }
  await dump('after inserting blocks');
  await t.shot(path.join(out, '07-blocks.png'));
  // selection toolbar
  await t.eval(`focusBlock(0,'start')`);
  await t.eval(`(()=>{const el=document.activeElement; const r=document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r);})()`);
  await t.wait(250);
  console.log('toolbar visible:', await t.eval(`getComputedStyle(document.querySelector('.sel-toolbar')||document.body).display`));
  await t.eval(`document.querySelector('.tb-btn[data-cmd="bold"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}))`);
  await t.wait(150);
  console.log('bold html:', await t.eval(`BP.page(BP.state.current).blocks[0].text`));
  await t.shot(path.join(out, '08-toolbar.png'));
  // search
  await t.eval(`document.querySelector('.sb-nav').click()`); await t.wait(150);
  await t.type('ops'); await t.wait(200);
  console.log('search results:', await t.eval(`document.querySelectorAll('.sr-item').length`));
  await t.shot(path.join(out, '09-search.png'));
  await t.eval(`kd('Escape')`);
  // drag reorder via API + duplicate + trash/restore
  const ed = `BP.currentEditor`;
  const ids = await t.eval(`JSON.stringify(BP.page(BP.state.current).blocks.slice(0,3).map(b=>b.id))`);
  await t.eval(`${ed}.moveBlock(${ids}[0], ${ids}[2], 'after')`); await t.wait(80);
  await dump('moved block 0 after 2');
  await t.eval(`BP.trash(BP.state.current); BP.state.current=BP.children(null)[0].id; BP.renderAll();`); await t.wait(100);
  console.log('trashed count:', await t.eval(`BP.allPages().filter(p=>p.trashed).length`));
  // exports
  console.log('md:\n' + await t.eval(`BP.pageToMd(BP.allPages().find(p=>p.title==='Ops test'))`));
  console.log('html bytes:', await t.eval(`BP.pageToHtml(BP.allPages().find(p=>p.title==='Ops test')).length`));
};
