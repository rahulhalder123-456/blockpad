/* Blockpad AI. Default: a tiny model that runs on this computer (no account, no key, no network). Optional: your own Ollama / OpenAI-compatible endpoint. */
(function () {
  const BP = (window.BP = window.BP || {});
  const { h } = BP;
  BP.AI_ACTIONS = [
    { id: 'improve', label: 'Improve writing', mode: 'replace', prompt: 'Improve the writing of the following text. Keep the meaning and the language. Return only the revised text.' },
    { id: 'grammar', label: 'Fix spelling and grammar', mode: 'replace', prompt: 'Fix spelling and grammar in the following text without changing its meaning. Return only the corrected text.' },
    { id: 'shorter', label: 'Make shorter', mode: 'replace', prompt: 'Make the following text shorter while keeping the key points. Return only the new text.' },
    { id: 'longer', label: 'Make longer', mode: 'replace', prompt: 'Expand the following text with more detail, keeping the same tone. Return only the new text.' },
    { id: 'translate', label: 'Translate to English', mode: 'replace', prompt: 'Translate the following text to English. Return only the translation.' },
    { id: 'summarize', label: 'Summarize', mode: 'insert', prompt: 'Summarize the following text in a few concise bullet points (Markdown list).' },
    { id: 'explain', label: 'Explain simply', mode: 'insert', prompt: 'Explain the following text in simple terms.' },
    { id: 'todo', label: 'Extract action items', mode: 'insert', prompt: 'Extract the action items from the following text as a Markdown checklist using "- [ ] " items. If there are none, say so.' },
    { id: 'continue', label: 'Continue writing', mode: 'insert', prompt: 'Continue writing the page below in the same style. Write one or two paragraphs.' },
  ];
  const hasEngine = () => !!(window.bp && window.bp.llm);
  const builtin = () => (BP.state.settings.ai || {}).provider !== 'custom' && hasEngine();

  /* live state of the built-in engine, pushed from the main process */
  BP.llm = { st: { state: 'stopped', models: [], totalMB: 0, budgetMB: 0, rssMB: 0 }, subs: [] };
  BP.llm.on = (fn) => { BP.llm.subs.push(fn); return () => { BP.llm.subs = BP.llm.subs.filter((x) => x !== fn); }; };
  const setSt = (st) => { BP.llm.st = st; BP.llm.subs.slice().forEach((fn) => { try { fn(st); } catch (_) {} }); };
  BP.llm.refresh = async () => { if (window.bp && window.bp.llm) setSt(await window.bp.llm.status()); return BP.llm.st; };
  BP.llm.cfg = () => { const l = (BP.state.settings.ai || {}).local || {}; return { model: l.model, ramPct: l.ramPct, idleMin: l.idleMin, autoStart: l.autoStart }; };
  BP.llm.start = async () => { if (!window.bp || !window.bp.llm) return; setSt(Object.assign({}, BP.llm.st, { state: 'starting' })); const st = await window.bp.llm.start(BP.llm.cfg()); setSt(st); return st; };
  BP.llm.stop = async () => { if (!window.bp || !window.bp.llm) return; setSt(await window.bp.llm.stop()); };
  BP.llm.toggle = async () => { const s = BP.llm.st.state; if (s === 'running') return BP.llm.stop(); if (s === 'starting' || s === 'stopping') return; const st = await BP.llm.start(); if (st && st.state === 'error') BP.toast(st.error, 7000); };
  BP.llm.init = () => { if (!window.bp || !window.bp.llm) return; window.bp.llm.onEvent(setSt); BP.llm.refresh(); };

  BP.aiConfigured = () => { const a = BP.state.settings.ai || {}; return builtin() ? hasEngine() : !!(a.endpoint && a.model); };
  BP.aiChat = async function (messages, opts) {
    opts = opts || {};
    const a = BP.state.settings.ai || {};
    if (!window.bp || !window.bp.aiChat) return browserChat(a, messages, opts);
    const r = builtin() ? await window.bp.aiChat({ provider: 'builtin', local: Object.assign({}, BP.llm.cfg(), { temperature: opts.temperature, maxTokens: opts.maxTokens }), messages }) : await window.bp.aiChat({ endpoint: a.endpoint, model: a.model, key: a.key, messages });
    if (r.error) throw new Error(r.error);
    return r.text;
  };
  /* browser / phone: the page talks to your own endpoint directly (Ollama needs OLLAMA_ORIGINS to allow this site; a browser cannot run the built-in engine) */
  async function browserChat(a, messages, opts) {
    if (!a.endpoint || !a.model) throw new Error('In the browser the AI needs your own endpoint. Set one in Settings → AI.');
    const base = String(a.endpoint).trim().replace(/\/+$/, '');
    const url = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
    const res = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, a.key ? { authorization: 'Bearer ' + a.key } : {}), body: JSON.stringify({ model: a.model, messages, stream: false, temperature: (opts && opts.temperature) != null ? opts.temperature : 0.4 }) }).catch((e) => { throw new Error('Could not reach the endpoint (' + e.message + '). The server must allow this website (CORS).'); });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!out) throw new Error('The model returned an empty response');
    return out;
  }
  BP.aiSetupHint = () => { BP.toast('AI is not set up yet. Opening Settings → AI.', 3500); BP.openSettings && BP.openSettings('ai'); };
  BP.aiError = (e) => BP.toast('AI failed: ' + (e && e.message ? e.message : e) + (builtin() ? '' : '. Check Settings → AI (is Ollama running?).'), 7000);
  BP.busy = function (msg) {
    if (builtin() && BP.llm.st.state !== 'running') msg = 'Starting the built-in AI… ' + msg;
    const el = h('div', { class: 'busy' }, h('span', { class: 'spin' }), msg);
    document.body.append(el);
    return () => el.remove();
  };
  BP.currentPageMd = (page) => { try { return BP.pageToMd(page); } catch (_) { return ''; } };
})();
