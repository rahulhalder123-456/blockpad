const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  for (const tab of ['ai', 'api', 'members', 'data']) {
    await t.eval(`BP.openSettings('${tab}')`); await t.wait(450);
    await t.shot(path.join(out, `50-settings-${tab}.png`));
    await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await t.wait(100);
  }
  await t.eval(`(()=>{ const db=BP.createDatabase(null,{title:'Offices',icon:'🏢'}); db.props.push({id:'pl',name:'Where',type:'place',w:160}); BP.addRow(db.id,'London',{pl:{text:'London',lat:51.5072,lng:-0.1276}}); BP.addRow(db.id,'Paris',{pl:{text:'Paris',lat:48.8566,lng:2.3522}}); BP.addRow(db.id,'Berlin',{pl:{text:'Berlin',lat:52.52,lng:13.405}}); db.views=[{id:'m',type:'map',name:'Map',filters:[],sorts:[],hidden:[]}]; BP.open(db.id); 0;})()`);
  await t.wait(900);
  await t.shot(path.join(out, '51-map.png'));
};
