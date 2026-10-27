const fs = require('fs');
const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', 'cheatsheet.txt'), 'utf8').replace(/\r/g, '').replace(/^<TAB>$/gm, '\t');
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  await t.eval(`(()=>{const p=BP.page(BP.state.current); const nb=BP.newBlock('p',''); p.blocks=[nb]; BP.renderAll(); const el=BP.currentEditor.txtOf(nb.id); BP.editorHelpers.setCaret(el,'start');
    const dt=new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(raw)}); el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); 0;})()`);
  await t.wait(400);
  const r = JSON.parse(await t.eval(`JSON.stringify({title:BP.page(BP.state.current).title, blocks:BP.page(BP.state.current).blocks.map(b=>b.type==='code'?['CODE:'+b.lang,b.text]:b.type==='flow'?['FLOW', b.steps.length+' steps', b.steps.map(s=>s.t+': '+s.d).join(' > ')]:b.type==='table'?['TABLE',b.rows.length+'x'+b.rows[0].length+(b.mono?' mono:'+b.mono.join(','):''), b.rows[0].join(' | ')]:[b.type,BP.textOf(b.text)])})`));
  console.log('PAGE TITLE:', r.title);
  r.blocks.forEach((x, i) => console.log(String(i).padStart(2), (x[0] + '          ').slice(0, 12), '|', String(x[1]).replace(/\n/g, '⏎').slice(0, 95), x[2] ? '| ' + x[2] : ''));
  await t.shot(path.join(out, '21-cheatsheet-top.png'));
  await t.eval(`(()=>{ const f=document.querySelector('.flow'); f && f.scrollIntoView({block:'center'}); })()`); await t.wait(200);
  await t.shot(path.join(out, '22-cheatsheet-mid.png'));
};
