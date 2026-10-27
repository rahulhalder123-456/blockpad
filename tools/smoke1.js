const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  console.log('state', await t.eval(`JSON.stringify({pages:Object.keys(BP.state.pages).length, cur:BP.state.current, blocks:BP.page(BP.state.current).blocks.length, sidebar:document.querySelectorAll('.sb-item').length, editorBlocks:document.querySelectorAll('.editor .block').length})`));
  await t.shot(path.join(out, '01-welcome.png'));
  // open Tasks db
  await t.eval(`BP.open(BP.allPages().find(p=>p.title==='Tasks').id)`);
  await t.wait(300);
  await t.shot(path.join(out, '02-tasks-table.png'));
  await t.eval(`document.querySelectorAll('.db-tab')[1].click()`);
  await t.wait(200);
  await t.shot(path.join(out, '03-tasks-board.png'));
  await t.eval(`document.documentElement.dataset.theme='dark'`);
  await t.wait(150);
  await t.shot(path.join(out, '04-dark-board.png'));
};
