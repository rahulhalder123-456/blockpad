const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
module.exports = async (t) => {
  const dump = async (label) => console.log(label, await t.eval(`JSON.stringify(BP.page(BP.state.current).blocks.map(b=>[b.type,BP.textOf(b.text||''),b.checked||undefined]))`));
  await t.eval(`BP.newPage(null)`);
  await t.wait(200);
  await t.type('Typing test');
  t.key('Enter');
  await t.wait(100);
  await t.type('/head');
  await t.wait(150);
  console.log('slash open:', await t.eval(`!!document.querySelector('.slash') && document.querySelectorAll('.slash-item').length`));
  t.key('Enter');
  await t.wait(150);
  await t.type('Big heading');
  t.key('Enter');
  await t.wait(80);
  await t.type('- first');
  t.key('Enter'); await t.wait(60);
  await t.type('second');
  t.key('Enter'); await t.wait(60);
  t.key('Enter'); await t.wait(80);   // empty bullet -> paragraph
  await t.type('[] buy milk');
  t.key('Enter'); await t.wait(60);
  t.key('Enter'); await t.wait(80);
  await t.type('1. one');
  t.key('Enter'); await t.wait(60);
  await t.type('two');
  await dump('after typing');
  // undo / redo
  await t.eval(`BP.currentEditor.flushTyping()`);
  t.key('z', ['control']); await t.wait(150);
  await dump('after undo');
  t.key('y', ['control']); await t.wait(150);
  await dump('after redo');
  // backspace merge: go to last block start and backspace
  t.key('Home'); await t.wait(40);
  t.key('Backspace'); await t.wait(100);
  await dump('after backspace at start (number->p)');
  t.key('Backspace'); await t.wait(100);
  await dump('after 2nd backspace (merge)');
  await t.shot(path.join(out, '05-typing.png'));
  // bold via ctrl+b on selected text
  t.key('Home', []);
  t.key('End', ['shift']); await t.wait(120);
  t.key('b', ['control']); await t.wait(150);
  await t.shot(path.join(out, '06-toolbar.png'));
  await dump('after bold');
  console.log('html of last:', await t.eval(`BP.page(BP.state.current).blocks.slice(-1)[0].text`));
  // persistence
  await t.eval(`BP.flush()`); await t.wait(200);
  console.log('saved file bytes:', await t.eval(`window.bp.dataPath().then(async p=>p)`));
};
