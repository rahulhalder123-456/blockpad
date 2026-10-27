/* Blockpad formulas, rollups, relations and date ranges. Pure functions; no eval. */
(function () {
  const BP = (window.BP = window.BP || {});

  /* ---------- date ranges: "YYYY-MM-DD" or "YYYY-MM-DD→YYYY-MM-DD" ---------- */
  BP.dateParts = (v) => {
    if (!v) return { s: '', e: '' };
    const [s, e] = String(v).split('→');
    return { s: s || '', e: e || '' };
  };
  BP.dateJoin = (s, e) => (s ? (e && e !== s ? s + '→' + e : s) : '');
  const dayMs = 864e5;
  const toDate = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00') : null);
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  BP.isoDay = iso;

  /* ---------- tokenizer + parser ---------- */
  function tokenize(src) {
    const t = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      let m;
      if ((m = /^\d+(?:\.\d+)?/.exec(src.slice(i)))) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (c === '"' || c === "'") {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== c) { if (src[j] === '\\' && j + 1 < src.length) { j++; s += src[j] === 'n' ? '\n' : src[j]; } else s += src[j]; j++; }
        if (j >= src.length) throw new Error('Unterminated string');
        t.push({ k: 'str', v: s }); i = j + 1; continue;
      }
      if ((m = /^[A-Za-z_][\w.]*/.exec(src.slice(i)))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
      if ((m = /^(==|!=|<=|>=|&&|\|\|)/.exec(src.slice(i)))) { t.push({ k: 'op', v: m[0] }); i += 2; continue; }
      if ('+-*/%^<>!(),'.includes(c)) { t.push({ k: 'op', v: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return t;
  }
  const PREC = { '||': 1, or: 1, '&&': 2, and: 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const expect = (v) => { const t = next(); if (!t || t.v !== v) throw new Error('Expected ' + v); };
    function primary() {
      const t = next();
      if (!t) throw new Error('Unexpected end');
      if (t.k === 'num' || t.k === 'str') return { t: 'lit', v: t.v };
      if (t.k === 'op' && t.v === '(') { const e = expr(0); expect(')'); return e; }
      if (t.k === 'op' && (t.v === '-' || t.v === '!')) return { t: 'un', op: t.v, a: expr(7) };
      if (t.k === 'id') {
        if (t.v === 'true' || t.v === 'false') return { t: 'lit', v: t.v === 'true' };
        if (t.v === 'not' && !(peek() && peek().v === '(')) return { t: 'un', op: '!', a: expr(7) };
        if (peek() && peek().v === '(') {
          next();
          const args = [];
          if (!(peek() && peek().v === ')')) { do args.push(expr(0)); while (peek() && peek().v === ',' && next()); }
          expect(')');
          return { t: 'call', f: t.v.toLowerCase(), a: args };
        }
        throw new Error('Unknown name ' + t.v);
      }
      throw new Error('Unexpected ' + t.v);
    }
    function expr(minPrec) {
      let left = primary();
      for (;;) {
        const t = peek();
        if (!t) break;
        const op = t.k === 'id' && (t.v === 'and' || t.v === 'or') ? t.v : t.k === 'op' ? t.v : null;
        const pr = op && PREC[op];
        if (!pr || pr < minPrec || pr === undefined) break;
        next();
        const right = expr(op === '^' ? pr : pr + 1);
        left = { t: 'bin', op, a: left, b: right };
      }
      return left;
    }
    const ast = expr(0);
    if (p < toks.length) throw new Error('Unexpected ' + toks[p].v);
    return ast;
  }
  const cache = new Map();
  const astOf = (src) => { let a = cache.get(src); if (!a) { a = parse(src); if (cache.size > 300) cache.clear(); cache.set(src, a); } return a; };

  /* ---------- evaluation ---------- */
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? +v : v === '' || v == null ? 0 : isNaN(parseFloat(v)) ? NaN : parseFloat(v));
  const str = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : typeof v === 'number' ? String(+v.toFixed(10)) : String(v));
  const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v && v !== '0' && v !== 'false');
  function displayValue(row, prop) {
    const db = BP.page(row.rowOf);
    const v = BP.propVal(row, prop);
    if (['select', 'status'].includes(prop.type)) return (BP.optById(prop, v) || {}).name || '';
    if (prop.type === 'multi_select') return (v || []).map((id) => (BP.optById(prop, id) || {}).name).filter(Boolean);
    if (prop.type === 'relation') return (v || []).map((id) => (BP.page(id) || {}).title || 'Untitled');
    if (prop.type === 'date') return BP.dateParts(v).s;
    if (prop.type === 'created_time' || prop.type === 'last_edited_time') return iso(new Date(v));
    if (prop.type === 'unique_id') return (prop.prefix ? prop.prefix + '-' : '') + v;
    if (prop.type === 'people') return v || [];
    if (prop.type === 'files') return (v || []).map((f) => f.name);
    if (prop.type === 'place') return v ? v.text || '' : '';
    if (prop.type === 'verification') return v && v.status === 'verified' ? 'Verified' : '';
    if (prop.type === 'button') return '';
    return v == null ? '' : v;
  }
  BP.displayValue = displayValue;
  function evalAst(n, ctx, depth) {
    if (depth > 60) throw new Error('Too deep');
    switch (n.t) {
      case 'lit': return n.v;
      case 'un': { const a = evalAst(n.a, ctx, depth + 1); return n.op === '-' ? -num(a) : !truthy(a); }
      case 'bin': {
        if (n.op === '&&' || n.op === 'and') { const a = evalAst(n.a, ctx, depth + 1); return truthy(a) ? evalAst(n.b, ctx, depth + 1) : a; }
        if (n.op === '||' || n.op === 'or') { const a = evalAst(n.a, ctx, depth + 1); return truthy(a) ? a : evalAst(n.b, ctx, depth + 1); }
        const a = evalAst(n.a, ctx, depth + 1), b = evalAst(n.b, ctx, depth + 1);
        switch (n.op) {
          case '+': return typeof a === 'string' || typeof b === 'string' || Array.isArray(a) ? str(a) + str(b) : num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': return num(b) === 0 ? NaN : num(a) / num(b);
          case '%': return num(a) % num(b);
          case '^': return Math.pow(num(a), num(b));
          case '==': return str(a) === str(b);
          case '!=': return str(a) !== str(b);
          case '<': return typeof a === 'string' && typeof b === 'string' ? a < b : num(a) < num(b);
          case '>': return typeof a === 'string' && typeof b === 'string' ? a > b : num(a) > num(b);
          case '<=': return typeof a === 'string' && typeof b === 'string' ? a <= b : num(a) <= num(b);
          case '>=': return typeof a === 'string' && typeof b === 'string' ? a >= b : num(a) >= num(b);
        }
        return null;
      }
      case 'call': return call(n.f, n.a, ctx, depth + 1);
    }
  }
  function call(f, args, ctx, depth) {
    const ev = (i) => evalAst(args[i], ctx, depth);
    const all = () => args.map((_, i) => ev(i));
    switch (f) {
      case 'prop': {
        const name = str(ev(0));
        const p = ctx.db.props.find((x) => x.name === name);
        if (!p) throw new Error('No property "' + name + '"');
        if (p === ctx.self) throw new Error('A formula cannot read itself');
        if (p.type === 'formula' && ctx.stack.includes(p.id)) throw new Error('Circular formula');
        return displayValue(ctx.row, p);
      }
      case 'if': return truthy(ev(0)) ? ev(1) : args.length > 2 ? ev(2) : '';
      case 'ifs': { for (let i = 0; i + 1 < args.length; i += 2) if (truthy(ev(i))) return ev(i + 1); return args.length % 2 ? ev(args.length - 1) : ''; }
      case 'and': return all().every(truthy);
      case 'or': return all().some(truthy);
      case 'not': return !truthy(ev(0));
      case 'empty': { const v = ev(0); return v == null || v === '' || (Array.isArray(v) && !v.length); }
      case 'length': { const v = ev(0); return Array.isArray(v) ? v.length : str(v).length; }
      case 'concat': return all().map(str).join('');
      case 'join': { const v = ev(0); return (Array.isArray(v) ? v : [v]).map(str).join(args.length > 1 ? str(ev(1)) : ', '); }
      case 'lower': return str(ev(0)).toLowerCase();
      case 'upper': return str(ev(0)).toUpperCase();
      case 'trim': return str(ev(0)).trim();
      case 'slice': return str(ev(0)).slice(num(ev(1)), args.length > 2 ? num(ev(2)) : undefined);
      case 'replace': return str(ev(0)).replace(str(ev(1)), str(ev(2)));
      case 'replaceall': return str(ev(0)).split(str(ev(1))).join(str(ev(2)));
      case 'contains': { const a = ev(0), b = ev(1); return Array.isArray(a) ? a.map(str).includes(str(b)) : str(a).toLowerCase().includes(str(b).toLowerCase()); }
      case 'round': { const d = args.length > 1 ? num(ev(1)) : 0, k = Math.pow(10, d); return Math.round(num(ev(0)) * k) / k; }
      case 'floor': return Math.floor(num(ev(0)));
      case 'ceil': return Math.ceil(num(ev(0)));
      case 'abs': return Math.abs(num(ev(0)));
      case 'sqrt': return Math.sqrt(num(ev(0)));
      case 'pow': return Math.pow(num(ev(0)), num(ev(1)));
      case 'min': return Math.min(...all().flat().map(num));
      case 'max': return Math.max(...all().flat().map(num));
      case 'sum': return all().flat().map(num).reduce((a, b) => a + b, 0);
      case 'mean': { const a = all().flat().map(num); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
      case 'tonumber': return num(ev(0));
      case 'format': return str(ev(0));
      case 'now': return new Date().toISOString().slice(0, 16).replace('T', ' ');
      case 'today': return iso(new Date());
      case 'year': { const d = toDate(ev(0)); return d ? d.getFullYear() : NaN; }
      case 'month': { const d = toDate(ev(0)); return d ? d.getMonth() + 1 : NaN; }
      case 'day': { const d = toDate(ev(0)); return d ? d.getDate() : NaN; }
      case 'dateadd': { const d = toDate(ev(0)); if (!d) return ''; const n = num(ev(1)), u = str(ev(2)); if (/month/.test(u)) d.setMonth(d.getMonth() + n); else if (/year/.test(u)) d.setFullYear(d.getFullYear() + n); else if (/week/.test(u)) d.setDate(d.getDate() + 7 * n); else d.setDate(d.getDate() + n); return iso(d); }
      case 'datebetween': { const a = toDate(ev(0)), b = toDate(ev(1)); if (!a || !b) return NaN; const u = str(ev(2) || 'days'); const days = Math.round((a - b) / dayMs); return /week/.test(u) ? Math.trunc(days / 7) : /month/.test(u) ? Math.trunc(days / 30.4375) : /year/.test(u) ? Math.trunc(days / 365.25) : days; }
      default: throw new Error('Unknown function ' + f + '()');
    }
  }
  BP.evalFormula = function (row, prop) {
    const db = BP.page(row.rowOf);
    if (!db || !prop.formula || !prop.formula.trim()) return '';
    try {
      const stack = (BP._fstack = BP._fstack || []);
      if (stack.includes(prop.id)) return '⚠ circular';
      stack.push(prop.id);
      try {
        const v = evalAst(astOf(prop.formula), { row, db, self: prop, stack }, 0);
        return typeof v === 'number' && !isFinite(v) ? '⚠ NaN' : v;
      } finally { stack.pop(); }
    } catch (e) { return '⚠ ' + e.message; }
  };
  BP.checkFormula = (db, src) => { try { astOf(src); return null; } catch (e) { return e.message; } };

  /* ---------- rollups ---------- */
  BP.ROLLUPS = [['count', 'Count all'], ['count_values', 'Count not empty'], ['unique', 'Count unique'], ['sum', 'Sum'], ['average', 'Average'], ['min', 'Min'], ['max', 'Max'], ['percent_checked', 'Percent checked'], ['show', 'Show original']];
  BP.rollup = function (row, prop) {
    const db = BP.page(row.rowOf);
    const rel = db && db.props.find((p) => p.id === prop.relation);
    if (!rel || rel.type !== 'relation') return '';
    const tdb = BP.page(rel.target);
    const tp = tdb && tdb.props && tdb.props.find((p) => p.id === prop.target);
    const rows = ((row.values || {})[rel.id] || []).map((id) => BP.page(id)).filter((r) => r && !r.trashed);
    if (prop.fn === 'count') return rows.length;
    if (!tp) return '';
    const vals = rows.map((r) => displayValue(r, tp));
    const flat = vals.flat();
    const nonEmpty = flat.filter((v) => v !== '' && v != null && v !== false);
    const nums = flat.map(num).filter((n) => !isNaN(n));
    switch (prop.fn) {
      case 'count_values': return nonEmpty.length;
      case 'unique': return new Set(nonEmpty.map(str)).size;
      case 'sum': return nums.reduce((a, b) => a + b, 0);
      case 'average': return nums.length ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4) : 0;
      case 'min': return nums.length ? Math.min(...nums) : '';
      case 'max': return nums.length ? Math.max(...nums) : '';
      case 'percent_checked': return rows.length ? Math.round((flat.filter(Boolean).length / rows.length) * 100) + '%' : '0%';
      default: return flat.map(str).join(', ');
    }
  };
  BP.fmtComputed = (v) => (Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? '✓' : '✗') : typeof v === 'number' ? String(+v.toFixed(6)) : v == null ? '' : String(v));
})();
