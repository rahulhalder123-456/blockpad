const http = require('http');
const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
const listen = (handler) => new Promise((res) => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
module.exports = async (t) => {
  const J = async (code) => { const s = await t.eval(`Promise.resolve(${code}).then((v) => JSON.stringify(v === undefined ? null : v))`); return JSON.parse(s); };
  const log = async (label, code) => console.log(label.padEnd(34), JSON.stringify(await J(code)));
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };

  /* ---------- synced blocks ---------- */
  await t.eval(`(()=>{ const A=BP.createPage(null,{title:'Sync A'}); const B=BP.createPage(null,{title:'Sync B'}); A.blocks=[BP.newBlock('p','shared text'),BP.newBlock('p','after')]; BP.state.__A=A.id; BP.state.__B=B.id; BP.open(A.id); 0;})()`);
  await t.wait(250);
  await t.eval(`(()=>{ const ed=BP.currentEditor; ed.makeSynced(BP.page(BP.state.__A).blocks[0]); 0;})()`); await t.wait(150);
  const sid = await J(`BP.syncClip`);
  check('synced block created', !!sid && (await J(`BP.page(BP.state.__A).blocks[0].type`)) === 'synced');
  await t.eval(`BP.open(BP.state.__B)`); await t.wait(250);
  await t.eval(`(()=>{ const ed=BP.currentEditor; const b=BP.page(BP.state.__B).blocks[0]; ed.applyItem(b,'syncedpaste'); 0;})()`); await t.wait(200);
  check('pasted synced copy on page B', await J(`BP.page(BP.state.__B).blocks.some(b=>b.type==='synced' && BP.textOf(b.children[0].text)==='shared text')`));
  await t.eval(`(()=>{ const ed=BP.currentEditor; const sb=BP.page(BP.state.__B).blocks.find(b=>b.type==='synced'); sb.children[0].text='EDITED on B'; ed.typed(); ed.flushTyping(); 0;})()`); await t.wait(150);
  check('edit on B mirrors to A', (await J(`BP.textOf(BP.page(BP.state.__A).blocks.find(b=>b.type==='synced').children[0].text)`)) === 'EDITED on B');
  await t.shot(path.join(out, '40-synced.png'));

  /* ---------- tabs, button, html, linked view ---------- */
  await t.eval(`BP.open(BP.state.__A)`); await t.wait(200);
  await t.eval(`(()=>{ const ed=BP.currentEditor; const p=BP.page(BP.state.__A); const mk=BP.editorHelpers.makeBlock; const tabs=mk('tabs'); tabs.children[0].children=[BP.newBlock('p','content of tab one')]; tabs.children[1].children=[BP.newBlock('p','content of tab two')]; const btn=mk('button'); btn.template='## Added by button {date}\\n- [ ] follow up'; const html=mk('html'); p.blocks.push(tabs,btn,html); BP.renderAll(); 0;})()`); await t.wait(250);
  check('tabs render with active pane', (await J(`[...document.querySelectorAll('.tab-btn')].map(b=>b.textContent).join('|')`)).startsWith('Tab 1|Tab 2'));
  await t.eval(`document.querySelectorAll('.tab-btn')[1].click()`); await t.wait(150);
  check('switching tab shows tab two', await J(`document.querySelector('.tab-pane').textContent.includes('tab two')`));
  const before = (await J(`BP.page(BP.state.__A).blocks.length`));
  await t.eval(`document.querySelector('.bp-button').click()`); await t.wait(200);
  check('button inserted blocks', (await J(`BP.page(BP.state.__A).blocks.length`)) > before && await J(`BP.page(BP.state.__A).blocks.some(b=>b.type==='h2' && BP.textOf(b.text).startsWith('Added by button'))`));
  check('html block has sandboxed iframe', await J(`document.querySelector('.html-frame').getAttribute('sandbox')===''`));
  await t.shot(path.join(out, '41-tabs-button-html.png'));

  /* ---------- database: new props, nested filters, templates, linked view ---------- */
  await t.eval(`(()=>{ const db=BP.createDatabase(null,{title:'Everything',icon:'🧪'}); BP.state.__D=db.id; BP.state.settings.people=['Asha','Ben'];
    db.props.push({id:'pp',name:'Owner',type:'people',w:140},{id:'ff',name:'Docs',type:'files',w:140},{id:'pl',name:'Where',type:'place',w:160},{id:'vv',name:'Check',type:'verification',w:160},{id:'cb',name:'By',type:'created_by',w:100},{id:'eb',name:'Edited by',type:'last_edited_by',w:100},{id:'bt',name:'Done!',type:'button',label:'Mark done',sets:[{propId:db.props[1].id,value:db.props[1].options[2].id}],w:120});
    const r1=BP.addRow(db.id,'London office',{pp:['Asha'],pl:{text:'London',lat:51.5072,lng:-0.1276}});
    const r2=BP.addRow(db.id,'Paris office',{pp:['Ben'],pl:{text:'Paris',lat:48.8566,lng:2.3522}});
    const r3=BP.addRow(db.id,'Remote team',{pp:['Asha','Ben']});
    0;})()`);
  const dbq = `BP.page(BP.state.__D)`;
  await t.eval(`BP.open(BP.state.__D)`); await t.wait(300);
  await t.shot(path.join(out, '42-new-props-table.png'));
  const stat = `${dbq}.props[1].id`;
  // nested group: (Owner contains Asha) AND ( title contains London OR title contains Remote )
  await t.eval(`(()=>{ const db=${dbq}; const v=db.views[0]; v.filters=[{propId:'pp',op:'contains',value:'Asha'},{group:true,op:'or',items:[{propId:'title',op:'contains',value:'London'},{propId:'title',op:'contains',value:'Remote'}]}]; 0;})()`);
  await log('nested AND/OR -> rows', `BP.viewRows(${dbq}, ${dbq}.views[0], '').map(r=>r.title)`);
  check('nested filter result', JSON.stringify(await J(`BP.viewRows(${dbq}, ${dbq}.views[0], '').map(r=>r.title).sort()`)) === JSON.stringify(['London office', 'Remote team']));
  await t.eval(`(()=>{ const v=${dbq}.views[0]; v.filterOp='or'; v.filters=[{propId:'title',op:'contains',value:'Paris'},{group:true,op:'and',items:[{propId:'pp',op:'contains',value:'Ben'},{propId:'title',op:'contains',value:'Remote'}]}]; 0;})()`);
  check('OR at root with nested AND', JSON.stringify(await J(`BP.viewRows(${dbq}, ${dbq}.views[0], '').map(r=>r.title).sort()`)) === JSON.stringify(['Paris office', 'Remote team']));
  await t.eval(`(()=>{ const v=${dbq}.views[0]; v.filters=[]; v.filterOp='and'; 0;})()`);
  // button property + verification + created by
  const row = `BP.rows(${dbq}.id)[0]`;
  await t.eval(`(()=>{ const db=${dbq}; const r=${row}; const bt=db.props.find(p=>p.id==='bt'); BP.cellEditor(db,bt,r,document.createElement('div'),null); document.querySelectorAll('.cell-btn')[0].click(); 0;})()`); await t.wait(150);
  check('button column set the status', (await J(`BP.optById(${dbq}.props[1], ${row}.values[${stat}]).name`)) === 'Done');
  check('created by is the workspace user', (await J(`BP.propVal(${row}, ${dbq}.props.find(p=>p.id==='cb'))`)) === 'You');
  // templates
  await t.eval(`(()=>{ const db=${dbq}; db.templates=[{id:'t1',name:'Office',title:'New office {date}',values:{pp:['Ben']},body:'## Checklist\\n- [ ] keys',default:true}]; BP.renderAll(); 0;})()`); await t.wait(200);
  await t.eval(`document.querySelector('.split .btn:first-child').click()`); await t.wait(200);
  check('default row template applied', await J(`BP.rows(${dbq}.id).some(r=>r.title.startsWith('New office') && r.values.pp[0]==='Ben' && r.blocks.some(b=>b.type==='h2'))`));
  // views: form, map, dashboard
  await t.eval(`(()=>{ const db=${dbq}; db.views.push({id:'vf',type:'form',name:'Form',filters:[],sorts:[],hidden:[],form:{title:'Report',desc:'',hidden:[],required:['title'],button:'Send',msg:'ok'}},{id:'vm',type:'map',name:'Map',filters:[],sorts:[],hidden:[]},{id:'vd',type:'dashboard',name:'Dash',filters:[],sorts:[],hidden:[],widgets:[{id:'w1',kind:'stat',title:'Offices',prop:'count',fn:'count'},{id:'w2',kind:'chart',title:'By owner',chart:{type:'bar',x:'pp'}},{id:'w3',kind:'list',title:'Recent',limit:3}]}); BP.dbUi[db.id].view='vf'; BP.renderAll(); 0;})()`); await t.wait(250);
  check('form renders fields', (await J(`document.querySelectorAll('.form-field').length`)) >= 5);
  const n0 = await J(`BP.rows(${dbq}.id).length`);
  await t.eval(`document.querySelector('.form .btn.primary').click()`); await t.wait(100);
  check('form blocks empty required title', (await J(`BP.rows(${dbq}.id).length`)) === n0 && (await J(`document.querySelector('.form-err').textContent`)) === 'Required');
  await t.eval(`(()=>{ const i=document.querySelector('.form .cell-in.title'); i.value='Submitted via form'; i.dispatchEvent(new Event('change')); 0;})()`);
  await t.eval(`document.querySelector('.form .btn.primary').click()`); await t.wait(150);
  check('form submit adds a row', (await J(`BP.rows(${dbq}.id).length`)) === n0 + 1 && await J(`BP.rows(${dbq}.id).some(r=>r.title==='Submitted via form')`));
  await t.eval(`(()=>{ BP.dbUi[${dbq}.id].view='vm'; BP.renderAll(); 0;})()`); await t.wait(900);
  check('map shows 2 pins', (await J(`document.querySelectorAll('.map-pin').length`)) === 2);
  await t.shot(path.join(out, '43-map.png'));
  await t.eval(`(()=>{ BP.dbUi[${dbq}.id].view='vd'; BP.renderAll(); 0;})()`); await t.wait(300);
  check('dashboard renders 3 widgets', (await J(`document.querySelectorAll('.widget').length`)) === 3 && (await J(`document.querySelector('.stat-num').textContent`)) === String(n0 + 1));
  await t.shot(path.join(out, '44-dashboard.png'));
  // linked view of this database inside a page
  await t.eval(`BP.open(BP.state.__A)`); await t.wait(200);
  await t.eval(`(()=>{ const ed=BP.currentEditor; const p=BP.page(BP.state.__A); const db=${dbq}; const nb=Object.assign(BP.newBlock('dbview'),{ref:db.id,linked:true,views:db.views.map(v=>Object.assign(JSON.parse(JSON.stringify(v)),{id:'L'+v.id}))}); p.blocks.push(nb); BP.state.__L=nb.id; BP.renderAll(); 0;})()`); await t.wait(300);
  check('linked view renders and is independent', await J(`document.querySelectorAll('.dbview .db').length>=1 && BP.page(BP.state.__A).blocks.find(b=>b.id===BP.state.__L).views[0].id.startsWith('L')`));

  /* ---------- inline comments with replies ---------- */
  await t.eval(`(()=>{ const p=BP.page(BP.state.__A); const b=BP.newBlock('p','This sentence has a <span class="cmt-abc123">commented part</span> inside.'); p.blocks.unshift(b); p.comments=[{id:'abc123',text:'Please check',t:Date.now(),resolved:false,quote:'commented part',replies:[{text:'Done',t:Date.now(),author:'Ben'}],author:'You'}]; BP.renderAll(); BP.openComments('abc123'); 0;})()`); await t.wait(300);
  check('comment mark highlighted + thread panel', (await J(`document.querySelectorAll('.txt span.cmt-abc123').length`)) === 1 && (await J(`document.querySelectorAll('.cm .cm-reply').length`)) === 1 && (await J(`document.querySelector('.cm-quote').textContent`)).includes('commented part'));
  await t.shot(path.join(out, '45-inline-comment.png'));
  await t.eval(`document.querySelector('.cm-act .btn').click()`); await t.wait(200);
  check('resolving removes the highlight', (await J(`document.querySelectorAll('.txt span.cmt-abc123').length`)) === 0 && (await J(`BP.textOf(BP.page(BP.state.__A).blocks[0].text)`)).includes('commented part'));

  /* ---------- local REST API over real HTTP ---------- */
  const token = 'tok_' + Math.random().toString(16).slice(2);
  const port = 17000 + Math.floor(Math.random() * 2000);
  const r0 = await J(`window.bp.apiConfigure({enabled:true, port:${port}, token:${JSON.stringify(token)}})`);
  check('API server started', r0 && r0.ok, JSON.stringify(r0));
  const call = async (method, p, body, headers) => { const res = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: Object.assign({ authorization: 'Bearer ' + token, 'content-type': 'application/json' }, headers || {}), body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await res.json(); } catch (_) {} return { status: res.status, j }; };
  check('API rejects missing token', (await fetch(`http://127.0.0.1:${port}/api/pages`)).status === 401);
  check('API rejects browser Origin', (await call('GET', '/api/pages', null, { origin: 'https://evil.example' })).status === 403);
  const created = await call('POST', '/api/pages', { title: 'Made by API', markdown: '# Hi\n\n- one\n- two' });
  check('API create page', created.status === 201 && created.j.title === 'Made by API');
  const got = await call('GET', '/api/pages/' + created.j.id);
  check('API read page as markdown', got.status === 200 && got.j.markdown.includes('- one'));
  await call('PATCH', '/api/pages/' + created.j.id, { markdown: 'appended line', mode: 'append' });
  check('API append', (await call('GET', '/api/pages/' + created.j.id)).j.markdown.includes('appended line'));
  const dbId = await J(`BP.state.__D`);
  const apiRow = await call('POST', `/api/databases/${dbId}/rows`, { title: 'API row', properties: { Owner: ['Ben'], Status: 'In progress' } });
  check('API create db row with typed props', apiRow.status === 201 && apiRow.j.properties.Owner[0] === 'Ben' && apiRow.j.properties.Status === 'In progress', JSON.stringify(apiRow.j && apiRow.j.properties));
  const rows = await call('GET', `/api/databases/${dbId}/rows?q=API`);
  check('API query rows', rows.status === 200 && rows.j.rows.length === 1);
  check('API search', (await call('GET', '/api/search?q=Made%20by')).j.results.length >= 1);
  check('API bad property is a clean 400', (await call('POST', `/api/databases/${dbId}/rows`, { title: 'x', properties: { Nope: 1 } })).status === 400);
  check('API delete → trash', (await call('DELETE', '/api/pages/' + created.j.id)).status === 200 && (await J(`BP.isTrashed(BP.page(${JSON.stringify(created.j.id)}))`)));
  await t.eval(`window.bp.apiConfigure({enabled:false})`);
  let stopped = false; try { await fetch(`http://127.0.0.1:${port}/api`); } catch (_) { stopped = true; }
  check('API stops when disabled', stopped);

  /* ---------- AI through the main process against a fake OpenAI-compatible server ---------- */
  let seen = null;
  const fakeAI = await listen((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { seen = { url: req.url, auth: req.headers.authorization, body: JSON.parse(b || '{}') }; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: 'Improved: ' + (seen.body.messages.slice(-1)[0].content.split('Text:\n')[1] || 'ok') } }] })); }); });
  await t.eval(`(()=>{ const a=BP.state.settings.ai; a.endpoint='http://127.0.0.1:${fakeAI.address().port}/v1'; a.model='test-model'; a.key='k123'; a.provider='custom'; 0;})()`);
  const ans = await J(`BP.aiChat([{role:'user',content:'Text:\\nhello'}]).then(x=>x,e=>'ERR '+e.message)`);
  check('AI proxy round trip', ans === 'Improved: hello' && seen.url === '/v1/chat/completions' && seen.auth === 'Bearer k123' && seen.body.model === 'test-model', JSON.stringify(ans));
  // run a full editor AI action that rewrites a block
  await t.eval(`BP.open(BP.state.__A)`); await t.wait(200);
  await t.eval(`(()=>{ const ed=BP.currentEditor; const b=BP.page(BP.state.__A).blocks.find(x=>x.type==='p'); BP.state.__AIB=b.id; b.text='rough draft'; ed.aiRun(BP.AI_ACTIONS[0], 'rough draft', null, b); 0;})()`); await t.wait(700);
  check('AI action replaced the block text', (await J(`BP.textOf(BP.findBlock(BP.page(BP.state.__A).blocks, BP.state.__AIB).block.text)`)) === 'Improved: rough draft');
  fakeAI.close();
  const bad = await J(`BP.aiChat([{role:'user',content:'x'}]).then(x=>x,e=>'ERR '+e.message)`);
  check('AI failure is reported, not thrown', String(bad).startsWith('ERR'), String(bad).slice(0, 60));

  /* ---------- link preview ---------- */
  const site = await listen((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<html><head><title>Fallback</title><meta property="og:title" content="Nice &amp; Title"><meta name="description" content="A page about things"><meta property="og:image" content="/pic.png"></head><body>x</body></html>'); });
  const meta = await J(`window.bp.fetchMeta('http://127.0.0.1:${site.address().port}/page')`);
  check('link preview metadata', meta.title === 'Nice & Title' && meta.description === 'A page about things' && meta.image.endsWith('/pic.png'), JSON.stringify(meta));
  check('link preview rejects non-http', (await J(`window.bp.fetchMeta('file:///etc/passwd')`)).error === 'bad url');
  site.close();

  /* ---------- multi-device merge ---------- */
  const remote = await J(`(()=>{ const s=JSON.parse(JSON.stringify(BP.state)); const ids=Object.keys(s.pages); const edit=s.pages[BP.state.__B]; edit.title='Edited elsewhere'; edit.updated=Date.now()+5000; const stale=s.pages[BP.state.__A]; stale.title='STALE REMOTE'; stale.updated=1; const fresh={...JSON.parse(JSON.stringify(s.pages[ids[0]])), id:'remotenew', title:'Only on the other device', updated:Date.now()}; s.pages.remotenew=fresh; s.purged={}; s.purged[BP.state.__D]=Date.now()+9000; return JSON.stringify(s); })()`);
  const merged = await J(`BP.mergeExternal(${JSON.stringify(remote)})`);
  check('merge: newer remote page wins', (await J(`BP.page(BP.state.__B).title`)) === 'Edited elsewhere');
  check('merge: older remote page loses', (await J(`BP.page(BP.state.__A).title`)) === 'Sync A');
  check('merge: remote-only page added', (await J(`!!BP.page('remotenew')`)));
  check('merge: remote permanent delete propagates', (await J(`!BP.page(BP.state.__D)`)) && merged.changed);

  console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  if (fails) throw new Error(fails + ' checks failed');
};
