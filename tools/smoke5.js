module.exports = async (t) => {
  const tasks = `BP.allPages().find(p=>p.title==='Tasks')`;
  await t.eval(`BP.open(${tasks}.id)`); await t.wait(200);
  await t.eval(`(()=>{const db=${tasks}; db.views.push({id:'vc',type:'calendar',name:'cal',filters:[],sorts:[],hidden:[]}); BP.dbUi[db.id].view='vc'; BP.renderAll();})()`);
  await t.wait(200);
  console.log(await t.eval(`JSON.stringify({chips:document.querySelectorAll('.cal-chip').length, rows:BP.viewRows(${tasks}, ${tasks}.views.find(v=>v.id==='vc'), '').map(r=>[r.title, Object.values(r.values)]) , dateProp:${tasks}.props.filter(p=>p.type==='date').map(p=>p.id), today:new Date().toString()})`));
};
