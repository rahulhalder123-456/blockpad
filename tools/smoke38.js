/* Back button and drawer behaviour on a phone-sized window (and that a desktop-sized one is not changed):
   - every sidebar button closes the drawer; dialogs closing it too
   - Back (BP.handleBack, which the Android shell calls for the back key) closes the topmost thing over the page first,
     then goes to the previous page, skips deleted pages, and says false only when there is nothing left
   - a browser's Back / a mouse's back button (popstate on the guard entry) gets the same answers
   - swipe left on the drawer closes it */
module.exports = async (t) => {
  let fails = 0;
  const check = (label, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra != null ? '  ' + extra : '')); if (!cond) fails++; };
  const J = async (c) => JSON.parse(await t.eval(`Promise.resolve(${c}).then((v)=>JSON.stringify(v === undefined ? null : v))`));
  const W = (ms) => t.wait(ms);
  const win = require('electron').BrowserWindow.getAllWindows()[0];
  const back = async () => { await t.eval('BP.handleBack(); 0'); await W(450); };
  const fwd = async () => { await t.eval('BP.ui.go(1); 0'); await W(450); };
  const cur = () => J(`BP.state.current`);
  const drawerOpen = () => J(`!document.querySelector('#app').classList.contains('sb-hidden')`);
  const openDrawer = async () => { if (!(await drawerOpen())) { await t.eval(`BP.ui.toggleSidebar()`); await W(150); } };
  const modals = () => J(`document.querySelectorAll('.modal-back').length`);
  const clickNav = (label) => t.eval(`[...document.querySelectorAll('.sidebar .sb-nav')].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`);

  win.setSize(400, 860); await W(700);
  check('the window counts as a phone', await J(`matchMedia('(max-width: 760px)').matches`));
  check('the app answers Back through BP.handleBack', await J(`typeof BP.handleBack === 'function'`));
  check('the drawer is closed on start', !(await drawerOpen()));

  // ---------- every sidebar button closes the drawer ----------
  await openDrawer();
  await clickNav('Home'); await W(250);
  check('Home closes the drawer and shows home', (await cur()) === null && !(await drawerOpen()));
  for (const label of ['Search', 'Graph view', 'Templates', 'Tags', 'Trash', 'Settings']) {
    await openDrawer();
    await clickNav(label); await W(500);
    check(label + ' opens its dialog and closes the drawer', (await modals()) === 1 && !(await drawerOpen()));
    await back();
    check('Back closes the ' + label + ' dialog', (await modals()) === 0);
  }
  await openDrawer();
  await clickNav('Today'); await W(400);
  const today = await cur();
  check('Today opens today’s note and closes the drawer', !!today && (await J(`!!BP.page('${today}').daily`)) && !(await drawerOpen()));
  await openDrawer();
  await clickNav('New page'); await W(250);
  check('New page shows its menu and keeps the drawer for it', (await J(`!!document.querySelector('.popover .menu-item') || !!document.querySelector('.popover')`)) && (await drawerOpen()));
  await t.eval(`[...document.querySelectorAll('.popover .menu-item')].find(x => x.textContent.includes('Canvas')).click()`); await W(400);
  check('choosing from that menu opens it and closes the drawer', (await J(`BP.page(BP.state.current).type`)) === 'canvas' && !(await drawerOpen()));
  await openDrawer();
  await t.eval(`document.querySelector('.sidebar .sb-item').click()`); await W(300);
  check('opening a page from the tree closes the drawer', !(await drawerOpen()));

  // ---------- Back walks through the pages ----------
  const ids = await J(`(() => { const a = BP.createPage(null, { title: 'A', blocks: [BP.newBlock('p', 'a')] }), b = BP.createPage(null, { title: 'B', blocks: [BP.newBlock('p', 'b')] }), c = BP.createPage(null, { title: 'C', blocks: [BP.newBlock('p', 'c')] }); BP.open(a.id); BP.open(b.id); BP.open(c.id); return { a: a.id, b: b.id, c: c.id }; })()`);
  await W(300);
  await back();
  check('Back goes to the page before', (await cur()) === ids.b);
  await back();
  check('Back again goes one more page back', (await cur()) === ids.a);
  await fwd();
  check('Forward comes back', (await cur()) === ids.b);
  await t.eval(`BP.open('${ids.c}')`); await W(300);

  // ---------- Back closes what is on top first ----------
  await t.eval(`BP.openSettings(); 0`); await W(400);
  check('a dialog is open', (await modals()) === 1);
  await back();
  check('Back closes the dialog and stays on the page', (await modals()) === 0 && (await cur()) === ids.c);
  await back();
  check('the next Back goes to the previous page (the history was kept)', (await cur()) === ids.b);
  await t.eval(`BP.open('${ids.c}')`); await W(300);

  await t.eval(`BP.openSettings(); 0`); await W(300);
  await t.eval(`BP.kb.openTag(); 0`); await W(300);
  check('two dialogs stacked', (await modals()) === 2);
  await back();
  check('Back closes only the top dialog', (await modals()) === 1);
  await back();
  check('Back closes the next one', (await modals()) === 0 && (await cur()) === ids.c);

  await openDrawer();
  check('the drawer is open', await drawerOpen());
  await back();
  check('Back closes the drawer first', !(await drawerOpen()) && (await cur()) === ids.c);

  await t.eval(`BP.ui.togglePanel('links', true)`); await W(300);
  check('the links sheet is open', await J(`!!document.querySelector('.kb-panel')`));
  await back();
  check('Back closes the links sheet', !(await J(`!!document.querySelector('.kb-panel')`)) && (await cur()) === ids.c);
  await t.eval(`BP.ui.togglePanel('comments', true)`); await W(300);
  await back();
  check('Back closes the comments sheet', !(await J(`!!document.querySelector('.comments')`)) && (await cur()) === ids.c);

  await t.eval(`BP.menu(document.querySelector('.topbar'), [{ label: 'x', onClick: () => {} }]); 0`); await W(200);
  check('a menu is open', await J(`!!document.querySelector('.popover')`));
  await back();
  check('Back closes the menu', !(await J(`!!document.querySelector('.popover')`)) && (await cur()) === ids.c);

  await t.eval(`BP.slides.present(BP.page('${ids.c}')); 0`); await W(400);
  check('slides are showing', await J(`!!document.querySelector('.sl-deck')`));
  await back();
  check('Back stops the slides', !(await J(`!!document.querySelector('.sl-deck')`)) && (await cur()) === ids.c);

  await t.eval(`BP.slides.present(BP.page('${ids.c}')); 0`); await W(300); await t.eval(`BP.slides.active.stop(); 0`);
  await t.eval(`(() => { const p = BP.createPage(null, { title: 'slash', blocks: [BP.newBlock('p', '')] }); BP.open(p.id); })()`); await W(300);
  await t.eval(`(() => { const el = document.querySelector('.editor .block .txt'); el.focus(); document.execCommand('insertText', false, '/hea'); })()`); await W(300);
  check('the / menu is open', await J(`!!document.querySelector('.slash')`));
  const slashPage = await cur();
  await back();
  check('Back closes the / menu and stays on the page', !(await J(`!!document.querySelector('.slash')`)) && (await cur()) === slashPage);
  await back();
  check('…and the next Back leaves the page', (await cur()) === ids.c);

  // ---------- a deleted page is skipped ----------
  const sk = await J(`(() => { const p1 = BP.createPage(null, { title: 'P1' }), p2 = BP.createPage(null, { title: 'P2' }), p3 = BP.createPage(null, { title: 'P3' }); BP.open(p1.id); BP.open(p2.id); BP.open(p3.id); return { p1: p1.id, p2: p2.id, p3: p3.id }; })()`);
  await W(300);
  await t.eval(`BP.purge('${sk.p2}')`);
  await back();
  check('Back skips a page that was deleted', (await cur()) === sk.p1, await cur());

  // ---------- the topbar button, the keyboard, Home ----------
  await t.eval(`BP.open('${ids.a}'); BP.open('${ids.b}')`); await W(300);
  await t.eval(`document.querySelector('.topbar .icon-btn[title^="Back"]').click()`); await W(450);
  check('the Back button in the top bar goes back', (await cur()) === ids.a);
  await t.eval(`document.querySelector('.topbar .icon-btn[title^="Forward"]').click()`); await W(450);
  check('the Forward button goes forward', (await cur()) === ids.b);
  await t.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }))`); await W(450);
  check('Alt+← goes back', (await cur()) === ids.a);
  await t.eval(`BP.open('${ids.b}')`); await W(200);
  await openDrawer(); await clickNav('Home'); await W(300);
  await back();
  check('Back from Home returns to the page you were on', (await cur()) === ids.b);

  // ---------- Back all the way down to the start: nothing breaks, then it says there is nothing left ----------
  let guard = 0;
  while (guard++ < 40 && (await J('BP.handleBack()'))) await W(150);
  check('stepping back to the first page stops by itself and does not break the app', await J(`!!document.querySelector('.main')`) && guard < 40, 'steps ' + guard);
  check('with nothing left, Back says so (the caller may then leave)', (await J('BP.handleBack()')) === false);
  await t.eval(`BP.open('${ids.a}')`); await W(300);
  check('opening a page afterwards works and Back still works', (await J('BP.handleBack()')) === true);

  // ---------- a browser's Back / a mouse's back button (the guard entry) ----------
  const hl0 = await J('history.length');
  t.click(200, 400); await W(300); t.click(200, 420); await W(300);
  check('there is one guard entry on top of the history, and more touches add no more', (await J('history.length')) <= hl0 + 1 && (await J('history.length')) <= 3 && (await J('!!(history.state && history.state.bpGuard)')), hl0 + ' -> ' + (await J('history.length')));
  await t.eval(`BP.open('${ids.b}'); BP.openSettings(); 0`); await W(400);
  check('a dialog is open before the browser Back', (await modals()) === 1);
  await t.eval('history.back()'); await W(600);
  check('the browser Back closes the dialog and the page stays', (await modals()) === 0 && (await cur()) === ids.b);
  check('…and the guard is put back for the next Back', await J('!!(history.state && history.state.bpGuard)'));
  await t.eval('history.back()'); await W(600);
  check('the next browser Back goes to the previous page', (await cur()) !== ids.b);
  await t.eval('history.back()'); await W(400); await t.eval('history.back()'); await W(400);
  check('more browser Backs stay harmless inside the app', await J(`!!document.querySelector('.main')`));

  // ---------- swipe the drawer closed ----------
  await openDrawer();
  await t.eval(`(() => { const sb = document.querySelector('.sidebar'); const mk = (type, x) => { const tc = new Touch({ identifier: 1, target: sb, clientX: x, clientY: 300 }); sb.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [tc], changedTouches: [tc] })); }; mk('touchstart', 250); mk('touchend', 120); })()`); await W(300);
  check('swiping the drawer to the left closes it', !(await drawerOpen()));
  await openDrawer();
  await t.eval(`(() => { const sb = document.querySelector('.sidebar'); const mk = (type, x, y) => { const tc = new Touch({ identifier: 1, target: sb, clientX: x, clientY: y }); sb.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [tc], changedTouches: [tc] })); }; mk('touchstart', 250, 200); mk('touchend', 200, 500); })()`); await W(300);
  check('scrolling the drawer up and down does not close it', await drawerOpen());
  await t.eval(`BP.ui.toggleSidebar()`);

  // ---------- a big window is not changed ----------
  win.setSize(1300, 860); await W(900);
  check('the window counts as a desktop', await J(`!matchMedia('(max-width: 760px)').matches`));
  if (!(await drawerOpen())) await t.eval(`BP.ui.toggleSidebar()`);
  await clickNav('Home'); await W(250);
  check('on a desktop Home keeps the sidebar docked', await drawerOpen());
  await clickNav('Graph view'); await W(500);
  check('on a desktop a dialog keeps the sidebar docked', (await drawerOpen()) && (await modals()) === 1);
  await back();
  check('on a desktop Back also closes the dialog first', (await modals()) === 0);
  await t.eval(`BP.open('${ids.b}')`); await W(200); await t.eval(`BP.open('${ids.c}')`); await W(200);
  await back();
  check('on a desktop Back goes to the previous page', (await cur()) === ids.b);
  await fwd();
  check('on a desktop Forward comes back', (await cur()) === ids.c);
  await t.eval(`BP.ui.togglePanel('links', true)`); await W(250);
  await back();
  check('on a desktop the links panel is not closed by Back (it is a docked panel)', (await J(`!!document.querySelector('.kb-panel')`)) === false || (await cur()) !== ids.c);
  await t.eval(`BP.ui.togglePanel('links', false)`);

  // ---------- touch screens: controls that only appeared under the mouse are visible ----------
  win.setSize(400, 860); await W(700);
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  // device emulation is what switches the page to hover:none / pointer:coarse, like a phone
  const media = async (hover) => { if (hover) { await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false }); await dbg.sendCommand('Emulation.clearDeviceMetricsOverride'); } else { await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: 400, height: 860, deviceScaleFactor: 1, mobile: true }); await dbg.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); } await W(400); };
  const probe = await J(`(() => {
    const p = BP.createPage(null, { title: 'Touch', cover: 'g:ocean', blocks: [Object.assign(BP.newBlock('image'), { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', caption: '' }), Object.assign(BP.newBlock('table'), { rows: [['a', 'b'], ['c', 'd']], header: true })] });
    const db = BP.createDatabase(null, { title: 'Rows' }); BP.addRow(db.id, 'one');
    return { page: p.id, db: db.id };
  })()`);
  const visible = (sel) => J(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing'; const c = getComputedStyle(e); return c.display !== 'none' && +c.opacity > 0.3; })()`);
  await media(false);
  check('the test page really is in touch mode (no hover)', await J(`matchMedia('(hover: none)').matches && matchMedia('(pointer: coarse)').matches`), await J(`['hover: none','hover: on-demand','hover: hover','pointer: coarse','pointer: fine','any-hover: none'].filter(q => matchMedia('(' + q + ')').matches).join(', ')`));
  await t.eval(`BP.open('${probe.page}')`); await W(500);
  const touch = {}; for (const s2 of ['.cover-act', '.media-replace', '.tbl-tools', '.caption']) touch[s2] = await visible(s2);
  await t.eval(`BP.open('${probe.db}')`); await W(600);
  for (const s2 of ['.row-act .icon-btn', '.open-btn']) touch[s2] = await visible(s2);
  check('touch: cover buttons, replace image, caption and table tools are visible without hovering', touch['.cover-act'] === true && touch['.media-replace'] === true && touch['.tbl-tools'] === true && touch['.caption'] === true, JSON.stringify(touch));
  check('touch: database row buttons are visible without hovering', touch['.row-act .icon-btn'] === true && touch['.open-btn'] === true, JSON.stringify(touch));
  await media(true);
  check('…and back to mouse mode', await J(`matchMedia('(hover: hover)').matches`));
  await t.eval(`BP.open('${probe.page}')`); await W(500);
  const mouse = {}; for (const s2 of ['.cover-act', '.media-replace', '.tbl-tools']) mouse[s2] = await visible(s2);
  check('mouse: those controls still appear only on hover', mouse['.cover-act'] === false && mouse['.media-replace'] === false && mouse['.tbl-tools'] === false, JSON.stringify(mouse));
  dbg.detach();

  const errs = t.logs.filter((l) => /^\[3\]/.test(l));
  check('no errors in the console', !errs.length, errs.slice(0, 3).join(' || '));
  console.log(fails ? '\nFAIL ' + fails + ' check(s)' : '\nALL CHECKS PASSED');
  if (fails) throw new Error('smoke38 failed');
};
