const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  const J = (code) => t.eval(`JSON.stringify(${code})`);
  const log = async (label, code) => console.log(label.padEnd(34), await J(code));
  // ---- formulas / relation / rollup / unique id / date range
  await t.eval(`(()=>{
    const P = BP.createDatabase(null,{title:'Projects',icon:'🚀'}); P.props=[P.props[0]]; BP.state.__P=P.id;
    const C = BP.createDatabase(null,{title:'Costs',icon:'💰'}); BP.state.__C=C.id;
    const hrs = {id:'hrs',name:'Hours',type:'number',w:100}, rate={id:'rate',name:'Rate',type:'number',w:100};
    const rel = {id:'rel',name:'Project',type:'relation',target:P.id,w:140};
    C.props.push(hrs,rate,rel,
      {id:'cost',name:'Cost',type:'formula',formula:'prop("Hours") * prop("Rate")',w:100},
      {id:'lab',name:'Label',type:'formula',formula:'if(prop("Hours") > 10, "big", "small") + " / " + upper(prop("Name"))',w:140},
      {id:'uid',name:'ID',type:'unique_id',prefix:'C',w:80},
      {id:'dd',name:'Window',type:'date',w:200});
    const pa=BP.addRow(P.id,'Alpha'), pb=BP.addRow(P.id,'Beta');
    P.props.push({id:'tot',name:'Total cost',type:'rollup',relation:'back',target:'cost',fn:'sum'});
    // Alpha owns two cost rows, Beta one
    BP.addRow(C.id,'Design',{hrs:8,rate:50,rel:[pa.id],dd:'2026-10-20→2026-10-25'});
    BP.addRow(C.id,'Build',{hrs:20,rate:60,rel:[pa.id],dd:'2026-10-26→2026-11-03'});
    BP.addRow(C.id,'Test',{hrs:5,rate:40,rel:[pb.id],dd:'2026-11-01'});
    // rollup from Costs side: Project -> avg hours of related project's ... use a rollup on Costs through 'rel' to Projects count
    C.props.push({id:'roll',name:'Proj rows',type:'rollup',relation:'rel',target:'title',fn:'count_values'});
    0;})()`);
  await log('formula cost per row', `BP.rows(BP.state.__C).map(r=>[r.title, BP.propVal(r, BP.page(BP.state.__C).props.find(p=>p.id==='cost'))])`);
  await log('formula label', `BP.rows(BP.state.__C).map(r=>BP.propVal(r, BP.page(BP.state.__C).props.find(p=>p.id==='lab')))`);
  await log('unique ids', `BP.rows(BP.state.__C).map(r=>BP.displayValue(r, BP.page(BP.state.__C).props.find(p=>p.id==='uid')))`);
  await log('rollup count_values', `BP.rows(BP.state.__C).map(r=>BP.propVal(r, BP.page(BP.state.__C).props.find(p=>p.id==='roll')))`);
  await log('bad formula message', `BP.checkFormula(null,'prop("x") +')`);
  await log('formula funcs', `(()=>{const C=BP.page(BP.state.__C); const r=BP.rows(C.id)[0]; const p={id:'t',name:'t',type:'formula'}; const ev=(f)=>{p.formula=f; return BP.evalFormula(r,p)}; return [ev('round(10/3,2)'), ev('concat("a","b",1+2)'), ev('contains("Hello","ell")'), ev('dateAdd("2026-10-27",1,"months")'), ev('dateBetween("2026-10-30","2026-10-27","days")'), ev('1 + 2 * 3 ^ 2'), ev('not(false) and true'), ev('x'), ev('max(1,5,3)')]})()`);
  // ---- views: table group + footer, timeline, chart, calendar range
  await t.eval(`BP.open(BP.state.__C)`); await t.wait(250);
  await t.eval(`(()=>{const C=BP.page(BP.state.__C); const v=C.views[0]; v.calc={hrs:'sum',rate:'average',cost:'max'}; v.group='rel'; BP.renderAll(); 0;})()`); await t.wait(250);
  await t.shot(path.join(out, '30-table-group-calc.png'));
  console.log('footer cells:', await t.eval(`[...document.querySelectorAll('tfoot .calc-btn')].map(b=>b.textContent.trim()).join(' | ')`));
  await t.eval(`(()=>{const C=BP.page(BP.state.__C); C.views.push({id:'vt',type:'timeline',name:'Timeline',filters:[],sorts:[],hidden:[],dateProp:'dd',zoom:1}); BP.dbUi[C.id].view='vt'; BP.renderAll(); 0;})()`); await t.wait(300);
  console.log('timeline bars:', await t.eval(`document.querySelectorAll('.tl-bar').length`));
  await t.shot(path.join(out, '31-timeline.png'));
  await t.eval(`(()=>{const C=BP.page(BP.state.__C); C.views.push({id:'vc',type:'chart',name:'Chart',filters:[],sorts:[],hidden:[],chart:{type:'bar',x:'rel',y:'hrs',fn:'sum'}}); BP.dbUi[C.id].view='vc'; BP.renderAll(); 0;})()`); await t.wait(300);
  console.log('chart svg rects:', await t.eval(`document.querySelectorAll('.chart-svg rect').length`));
  await t.shot(path.join(out, '32-chart.png'));
  // ---- CSV round trip
  const csv = await t.eval(`BP.dbToCsv(BP.page(BP.state.__C))`);
  console.log('CSV:\n' + csv.trim());
  const imp = await t.eval(`(()=>{const r=BP.importCsv('Name,Qty,Due,Done,Status,Email\\nApple,3,2026-11-01,yes,Open,a@x.com\\nPear,5,2026-11-02,no,Open,b@x.com\\nFig,7,2026-11-03,yes,Closed,c@x.com\\nKiwi,9,2026-11-04,no,Open,d@x.com\\n"Plum, big",11,2026-11-05,yes,Closed,e@x.com',null,null,'Fruit'); return JSON.stringify({added:r.added, props:r.db.props.map(p=>p.name+':'+p.type)})})()`);
  console.log('CSV import:', imp);
  // ---- equation + highlight + blocks
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  await t.eval(`(()=>{const p=BP.page(BP.state.current); p.title='Blocks lab'; const eq=Object.assign(BP.newBlock('equation',''),{text:'\\\\int_0^1 x^2\\\\,dx = \\\\frac{1}{3}'}); const code=Object.assign(BP.newBlock('code',''),{lang:'python',text:'def add(a, b):\\n    return a + b  # sum\\nprint(add(1, "x"))'}); const th=Object.assign(BP.newBlock('h2','Toggle head'),{tg:true,open:true,children:[BP.newBlock('p','hidden child')]}); p.blocks=[eq,code,th,BP.newBlock('p','one'),BP.newBlock('p','two'),BP.newBlock('p','three')]; BP.renderAll(); 0;})()`); await t.wait(300);
  console.log('katex rendered:', await t.eval(`document.querySelectorAll('.eq-render .katex').length`), '| highlight spans:', await t.eval(`document.querySelectorAll('.codewrap pre.hl span').length`), '| toggle heading arrow:', await t.eval(`!!document.querySelector('.t-h2 .tog')`));
  await t.shot(path.join(out, '33-blocks-lab.png'));
  // multi-select + copy + delete + move to other page
  await t.eval(`(()=>{const ed=BP.currentEditor; const bl=BP.page(BP.state.current).blocks; ed.selectOnly(bl[3].id); ed.setSel(ed.selRange(bl[3].id, bl[4].id)); 0;})()`); await t.wait(100);
  console.log('selected:', await t.eval(`document.querySelectorAll('.block.selected').length`));
  await t.eval(`BP.currentEditor.copySel(false)`);
  console.log('clip md:', await t.eval(`JSON.stringify(BP.blockClip.md)`));
  await t.shot(path.join(out, '34-selection.png'));
  const target = await t.eval(`(()=>{const p=BP.createPage(null,{title:'Target page'}); return p.id})()`);
  await t.eval(`BP.moveBlocksToPage({ed:BP.currentEditor, ids:BP.currentEditor.selBlocks().map(b=>b.id)}, ${JSON.stringify(target)})`); await t.wait(150);
  await log('source page after move', `BP.page(BP.state.current).blocks.map(b=>b.type+':'+BP.textOf(b.text||''))`);
  await log('target page after move', `BP.page(${JSON.stringify(target)}).blocks.map(b=>b.type+':'+BP.textOf(b.text||''))`);
  // template save/use
  await t.eval(`BP.saveTemplate(BP.state.current)`);
  const used = await t.eval(`(()=>{const tpl=BP.state.templates[0]; const r=BP.useTemplate(tpl,null); return JSON.stringify([r.title, r.blocks.length, r.id!==tpl.root])})()`);
  console.log('template used:', used);
  // highlight sanity for several languages
  for (const [l, c] of [['bash', 'curl -L -H "A: b" $URL | jq .x # note'], ['javascript', 'const a = fetch("/x").then(r => r.text()); // hi'], ['json', '{"a": [1, true, null]}'], ['html', '<a href="x">hi</a>'], ['sql', "SELECT name FROM t WHERE id = 3 -- c"]]) {
    console.log('hl ' + l.padEnd(10), (await t.eval(`BP.highlight(${JSON.stringify(c)}, '${l}')`)).replace(/<span class="tk-(\w)">/g, '[$1:').replace(/<\/span>/g, ']').trim());
  }
};
