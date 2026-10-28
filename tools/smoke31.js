/* update popup: an app that thinks it is 1.0.0 must show "Update available" with the right platform link; an up-to-date app must not.
   needs internet (reads https://blockpad-umber.vercel.app/version.json) */
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : '')); if (!cond) fails++; };
  await t.wait(7000);      // let the automatic launch check (4 s after load) run first
  check('installed app is detected (not the web app)', await t.eval('BP.isInstalledApp === true'));
  check('app knows its version', await t.eval('BP.appVersion.split(".").length === 3 && BP.appVersion.split(".").every((x) => x !== "" && !isNaN(x))'), await t.eval('BP.appVersion'));
  await t.eval('BP.checkUpdate(false)'); await t.wait(1500);
  check('up to date: no popup', await t.eval(`![...document.querySelectorAll('.modal')].some(m => /Update available/.test(m.textContent))`));
  await t.eval(`BP.appVersion = '1.0.0'; BP.checkUpdate(false)`); await t.wait(3000);
  const txt = await t.eval(`(([...document.querySelectorAll('.modal')].find(m => /Update available/.test(m.textContent)) || {}).textContent) || ''`);
  check('old version: popup shows', /Update available/.test(txt), txt.slice(0, 90));
  check('popup lists notes and a Download button', /Download/.test(txt) && /Skip this version/.test(txt) && /Later/.test(txt));
  await t.eval(`[...document.querySelectorAll('.modal button')].find(b => /Skip this version/.test(b.textContent)).click()`); await t.wait(300);
  await t.eval(`BP.checkUpdate(false)`); await t.wait(2000);
  check('skipped version does not pop up again', await t.eval(`![...document.querySelectorAll('.modal')].some(m => /Update available/.test(m.textContent))`));
  await t.eval(`BP.checkUpdate(true)`); await t.wait(2000);
  check('manual check shows it even if skipped', await t.eval(`[...document.querySelectorAll('.modal')].some(m => /Update available/.test(m.textContent))`));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke31 failed');
};
