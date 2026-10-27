/* Blockpad syntax highlighter: small, offline, dependency-free. Returns escaped HTML with <span class="tk-*">. */
(function () {
  const BP = (window.BP = window.BP || {});
  const kw = (s) => new RegExp('^(?:' + s.split(' ').join('|') + ')$');
  const C_LIKE_KW = 'if else for while do switch case break continue return function var let const class new this super import export from default async await try catch finally throw typeof instanceof in of delete void yield static public private protected interface enum extends implements package namespace using struct union typedef int long short char float double unsigned signed bool boolean string byte void null undefined true false nil fn mut impl trait pub use mod match loop where go defer chan select range func type';
  const LANGS = {
    bash: {
      rules: [
        ['c', /#.*/y],
        ['s', /"(?:\\.|[^"\\])*"|'[^']*'/y],
        ['v', /\$(?:\{[^}]*\}|\(|[A-Za-z_]\w*|[0-9?$!#@*])/y],
        ['o', /(?<=^|[\s=])-{1,2}[A-Za-z][\w-]*/y],
        ['n', /\b\d+(?:\.\d+)?\b/y],
        ['p', /[|&;<>]+|\\$/y],
        ['w', /[\w./~:@%+,=-]+/y],
      ],
      words: { k: kw('if then else elif fi for while until do done case esac in function select time return exit break continue export local readonly unset source alias'), cmd: true },
    },
    python: {
      rules: [
        ['c', /#.*/y],
        ['s', /(?:[rRbBfFuU]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)/y],
        ['d', /@[\w.]+/y],
        ['n', /\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y],
        ['w', /[A-Za-z_]\w*/y],
      ],
      words: { k: kw('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None self'), b: kw('print len range str int float list dict set tuple open type isinstance enumerate zip map filter sorted sum min max abs input super bytes bool repr id') },
      defs: /^(def|class)$/,
    },
    javascript: {
      rules: [
        ['c', /\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/y],
        ['s', /`(?:\\.|[^`\\])*`?|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?/y],
        ['n', /\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y],
        ['w', /[A-Za-z_$][\w$]*/y],
      ],
      words: { k: kw(C_LIKE_KW), b: kw('console document window fetch Promise JSON Math Object Array String Number Boolean Date Map Set require module process URLSearchParams location localStorage setTimeout setInterval') },
      calls: true,
    },
    html: {
      rules: [
        ['c', /<!--[\s\S]*?(?:-->|$)/y],
        ['t', /<\/?[A-Za-z][\w:-]*|<!DOCTYPE|\/?>/y],
        ['s', /"[^"]*"?|'[^']*'?/y],
        ['a', /[A-Za-z_:][\w:.-]*(?==)/y],
      ],
    },
    css: {
      rules: [
        ['c', /\/\*[\s\S]*?(?:\*\/|$)/y],
        ['s', /"[^"]*"?|'[^']*'?/y],
        ['n', /#[\da-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg)?\b/y],
        ['t', /[.#]?[A-Za-z_-][\w-]*(?=[^{}]*\{)/y],
        ['a', /[a-z-]+(?=\s*:)/y],
      ],
    },
    json: {
      rules: [
        ['a', /"(?:\\.|[^"\\])*"(?=\s*:)/y],
        ['s', /"(?:\\.|[^"\\])*"/y],
        ['n', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
        ['k', /\b(?:true|false|null)\b/y],
      ],
    },
    sql: {
      rules: [
        ['c', /--.*|\/\*[\s\S]*?(?:\*\/|$)/y],
        ['s', /'(?:''|[^'])*'?/y],
        ['n', /\b\d+(?:\.\d+)?\b/y],
        ['w', /[A-Za-z_]\w*/y],
      ],
      words: { k: (w) => /^(select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|join|left|right|inner|outer|on|group|by|order|having|limit|offset|and|or|not|null|is|in|like|as|distinct|union|all|primary|key|foreign|references|index|view|case|when|then|else|end|count|sum|avg|min|max|asc|desc|between|exists)$/i.test(w) },
    },
  };
  LANGS.typescript = LANGS.javascript;
  ['c', 'cpp', 'java', 'go', 'rust', 'php', 'swift', 'kotlin'].forEach((l) => (LANGS[l] = LANGS.javascript));
  LANGS.markdown = { rules: [['k', /^#{1,6}\s.*/my], ['s', /`[^`]*`/y], ['o', /^\s*(?:[-*+]|\d+\.)\s/my]] };
  LANGS.yaml = { rules: [['c', /#.*/y], ['a', /[\w.-]+(?=\s*:)/y], ['s', /"[^"]*"?|'[^']*'?/y], ['n', /\b\d+(?:\.\d+)?\b/y], ['k', /\b(?:true|false|null|yes|no)\b/y]] };
  LANGS.xml = LANGS.html;
  LANGS.shell = LANGS.sh = LANGS.zsh = LANGS.powershell = LANGS.bash;
  LANGS.js = LANGS.javascript; LANGS.py = LANGS.python; LANGS.ts = LANGS.typescript;

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const span = (cls, s) => `<span class="tk-${cls}">${esc(s)}</span>`;

  BP.highlight = function (code, lang) {
    const L = LANGS[(lang || '').toLowerCase()];
    if (!L || !code) return esc(code || '') + '\n';
    let out = '', i = 0, expectDef = false, lineStart = true;
    const n = code.length;
    while (i < n) {
      const ch = code[i];
      if (ch === '\n') { out += '\n'; i++; lineStart = true; expectDef = false; continue; }
      if (/\s/.test(ch)) { out += ch; i++; continue; }
      let hit = null;
      for (const [cls, re] of L.rules) {
        re.lastIndex = i;
        const m = re.exec(code);
        if (m && m.index === i && m[0].length) { hit = [cls, m[0]]; break; }
      }
      if (!hit) { out += esc(ch); i++; lineStart = false; continue; }
      let [cls, text] = hit;
      if (cls === 'w') {
        const w = L.words || {};
        const has = (spec) => spec && (typeof spec === 'function' ? spec(text) : spec.test(text));
        if (has(w.k)) { cls = 'k'; expectDef = !!(L.defs && L.defs.test(text)); }
        else if (has(w.b)) cls = 'b';
        else if (expectDef) { cls = 'f'; expectDef = false; }
        else if (w.cmd && lineStart) cls = 'f';
        else if (L.calls && code[i + text.length] === '(') cls = 'f';
        else if (L.defs && code[i + text.length] === '(') cls = 'f';
        else cls = '';
      }
      out += cls ? span(cls, text) : esc(text);
      i += text.length;
      lineStart = cls === 'p' && /[|&;]/.test(text) ? true : false;
    }
    return out + '\n';
  };
})();
