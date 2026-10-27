const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  const phase = process.env.BP_PHASE || '1';
  if (phase === '2') {
    console.log('PERSIST CHECK:', await t.eval(`JSON.stringify({pages:BP.allPages().length, titles:BP.allPages().filter(p=>!p.rowOf).map(p=>p.title), current:BP.state.current===BP.allPages().find(p=>p.title==='Persist me').id, blocks:BP.allPages().find(p=>p.title==='Persist me').blocks.map(b=>BP.textOf(b.text))})`));
    return;
  }
  const j = (code) => t.eval(`JSON.stringify(${code})`);
  // --- database operations
  const tasks = `BP.allPages().find(p=>p.title==='Tasks')`;
  await t.eval(`BP.open(${tasks}.id)`); await t.wait(250);
  await t.eval(`document.querySelector('.db-new').click()`); await t.wait(150);
  console.log('rows after New:', await t.eval(`BP.rows(${tasks}.id).length`));
  // add property, set a number, filter by status, sort
  await t.eval(`(()=>{const db=${tasks}; db.props.push({id:'pn',name:'Hours',type:'number',w:100}); BP.rows(db.id).forEach((r,i)=>BP.setProp(r,db.props.find(p=>p.id==='pn'),(i+1)*3)); BP.renderAll();})()`);
  await t.wait(150);
  await t.eval(`(()=>{const db=${tasks}; const v=db.views[0]; const st=db.props.find(p=>p.type==='status'); v.filters=[{propId:st.id,op:'is_not',value:st.options.find(o=>o.name==='Done').id}]; v.sorts=[{propId:'pn',dir:'desc'}]; BP.renderAll();})()`);
  await t.wait(150);
  console.log('filtered+sorted titles:', await j(`BP.viewRows(${tasks}, ${tasks}.views[0], '').map(r=>r.title+':'+r.values.pn)`));
  await t.shot(path.join(out, '10-db-filter.png'));
  // select popover
  await t.eval(`document.querySelector('.chips').click()`); await t.wait(150);
  console.log('option popover rows:', await t.eval(`document.querySelectorAll('.opt-pop .opt-row').length`));
  await t.shot(path.join(out, '11-option-pop.png'));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  // calendar + gallery + list view types
  for (const ty of ['calendar', 'gallery', 'list']) {
    await t.eval(`(()=>{const db=${tasks}; db.views.push({id:'v_${ty}',type:'${ty}',name:'${ty}',filters:[],sorts:[],hidden:[]}); BP.dbUi[db.id].view='v_${ty}'; BP.renderAll();})()`);
    await t.wait(150);
    await t.shot(path.join(out, `12-view-${ty}.png`));
  }
  // row page
  await t.eval(`BP.open(BP.rows(${tasks}.id)[0].id)`); await t.wait(200);
  console.log('row page props rows:', await t.eval(`document.querySelectorAll('.rp-row').length`));
  await t.shot(path.join(out, '13-row-page.png'));
  // --- sidebar nesting + duplicate
  const ids = await j(`[BP.allPages().find(p=>p.title==='Journal').id, BP.allPages().find(p=>p.title==='Welcome to Blockpad').id]`);
  await t.eval(`BP.movePage(${ids}[0], ${ids}[1]); BP.state.pages[${ids}[1]].open=true; BP.renderAll();`); await t.wait(100);
  console.log('Journal parent is Welcome:', await t.eval(`BP.page(${ids}[0]).parent===${ids}[1]`), '| link block in Welcome:', await t.eval(`BP.page(${ids}[1]).blocks.filter(b=>b.type==='page'&&b.ref===${ids}[0]).length`));
  console.log('cycle blocked:', await t.eval(`BP.movePage(${ids}[1], ${ids}[0])`));
  await t.eval(`(()=>{const c=BP.clonePage(${ids}[1]); BP.open(c.id);})()`); await t.wait(200);
  console.log('clone has child copy:', await t.eval(`BP.children(BP.state.current).length`), '| pages total', await t.eval(`BP.allPages().length`));
  await t.shot(path.join(out, '14-sidebar-nest.png'));
  // --- comments panel, history, templates, settings, share, trash
  await t.eval(`document.querySelector('.topbar .icon-btn[title="Comments"]').click()`); await t.wait(150);
  await t.eval(`(()=>{const ta=document.querySelector('.cm-new textarea'); ta.value='Looks good'; document.querySelector('.cm-new .btn.primary').click();})()`); await t.wait(150);
  console.log('comments:', await t.eval(`BP.page(BP.state.current).comments.length`));
  await t.shot(path.join(out, '15-comments.png'));
  await t.eval(`document.querySelector('.topbar .btn.ghost').click()`); await t.wait(200);
  await t.shot(path.join(out, '16-share.png'));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(100);
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:',',ctrlKey:true,bubbles:true}))`); await t.wait(300);
  await t.shot(path.join(out, '17-settings.png'));
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(100);
  await t.eval(`document.querySelectorAll('.sb-bottom .sb-nav')[0].click()`); await t.wait(200);
  await t.shot(path.join(out, '18-templates.png'));
  await t.eval(`document.querySelectorAll('.tpl')[3].click()`); await t.wait(300);
  console.log('template made:', await t.eval(`BP.page(BP.state.current).title+' / views '+BP.page(BP.state.current).views.length+' / rows '+BP.rows(BP.state.current).length`));
  await t.shot(path.join(out, '19-project-tracker.png'));
  // history
  await t.eval(`(()=>{const p=BP.allPages().find(p=>p.title==='Welcome to Blockpad'); BP.open(p.id);})()`); await t.wait(200);
  await t.eval(`BP.currentEditor.mutate(()=>{BP.currentEditor.page.blocks.push(BP.newBlock('p','added later'))})`); await t.wait(100);
  console.log('history entries:', await t.eval(`BP.page(BP.state.current).history.length`));
  // --- create the page used for persistence phase
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  await t.eval(`(()=>{const p=BP.page(BP.state.current); p.title='Persist me'; p.blocks=[BP.newBlock('h1','Saved heading'),BP.newBlock('p','survives restart')]; BP.touch(p); BP.renderAll();})()`);
  await t.eval(`BP.flush()`); await t.wait(300);
};
