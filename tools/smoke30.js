/* desktop owner for the desktop -> web sharing test (see tools/web-join-test.js): shares a big page, writes the link, waits for the web client */
module.exports = async (t) => {
  const fs = require('fs'); const path = require('path');
  const dir = process.env.BP_SYNC_DIR; fs.mkdirSync(dir, { recursive: true });
  await t.eval(`(()=>{ const p=BP.createPage(null,{title:'Big shared'}); p.blocks=[]; for(let i=0;i<150;i++) p.blocks.push(BP.newBlock('p','line '+i+' '+'x'.repeat(200))); BP.state.__R=p.id; 0; })()`);
  const link = await t.eval(`BP.share.start(BP.state.__R).then((sp)=>BP.share.link(sp,${process.env.VIEW ? 'false' : 'true'},true))`);
  fs.writeFileSync(path.join(dir, 'link.txt'), link);
  console.log('PASS [desktop] shared 150 blocks, link written');
  const end = Date.now() + 150000;
  while (Date.now() < end && !fs.existsSync(path.join(dir, 'done.txt'))) await t.wait(500);
  const r = fs.existsSync(path.join(dir, 'done.txt')) ? fs.readFileSync(path.join(dir, 'done.txt'), 'utf8') : 'timeout';
  console.log(r === 'ok' ? '\n[desktop] ALL CHECKS PASSED' : '\nFAIL [desktop] web client result: ' + r);
  if (r !== 'ok') throw new Error(r);
};
