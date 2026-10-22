// Pure helpers shared by app.js and core.test.js (no DOM, so Node can test them).

const TAG_CHARS = '[\\p{L}\\p{N}_\\-/]';
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // '-' and '/' need no escape outside a class

// Rename #from (and its children #from/...) everywhere in a note.
export const renameTag = (text, from, to) =>
  text.replace(new RegExp(`(^|\\s)#${reEsc(from)}(?=/|\\s|$)`, 'gmu'), `$1#${to}`);

// Remove #tag and its children #tag/... from a note.
export const removeTag = (text, tag) =>
  text.replace(new RegExp(`(^|[ \\t])#${reEsc(tag)}(?:/${TAG_CHARS}*)?(?=\\s|$)`, 'gmu'), '$1');

// Text colors for {빨강:글자} or {red:글자}; values are CSS class suffixes.
export const COLORS = { 빨강: 'red', 주황: 'orange', 노랑: 'yellow', 초록: 'green', 파랑: 'blue', 보라: 'purple', 분홍: 'pink', 회색: 'gray' };
const COLOR_RE = new RegExp(`\\{(${[...Object.keys(COLORS), ...Object.values(COLORS)].join('|')}):([^{}]+)\\}`, 'g');

// A tag must follow whitespace or a line start, so "# Heading" and "a#b" are not tags.
export function tags(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu)) {
    const t = m[1].replace(/^\/+|\/+$/g, '');
    if (t) out.add(t);
  }
  return [...out];
}

export const title = text => text.trimStart().split('\n')[0].replace(/^#+\s*/, '').trim() || '새 노트';

const META = ['created', 'updated', 'pinned', 'archived', 'trashed', 'category', 'order'];

export const toFile = n => `---\n${META.map(k => `${k}: ${n[k] ?? ''}`).join('\n')}\n---\n${n.text}`;

export function fromFile(id, raw) {
  raw = raw.replace(/\r\n/g, '\n');
  const n = { id, text: raw, created: 0, updated: 0, pinned: false, archived: false, trashed: false, category: '' };
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return n; // a plain .md dropped into the repo by hand still loads
  n.text = raw.slice(m[0].length);
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (k === 'category') n.category = v;
    else if (META.includes(k) && v) n[k] = v === 'true' ? true : v === 'false' ? false : Number(v) || 0;
  }
  return n;
}

export const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Live editor markup. Marks stay in the text (CSS hides them except on the line
// being edited), so textContent is always exactly the note text and the caret maps 1:1.
// No lookbehind in these regexes: older iPhone Safari cannot parse it.
const mk = s => `<span class="mk">${s}</span>`;
const safe = u => /^https?:\/\//.test(u); // only web links become clickable or load images
export const IMG = /^images\/[\w.-]+$/; // pasted images, stored in the notes repo; app.js loads them
// Code, images and links are set aside first so emphasis rules never reach inside a URL.
function inline(s) { // s is already escaped
  const kept = [];
  const hold = html => `\u0000${kept.push(html) - 1}\u0000`;
  return s
    .replace(/`([^`]+)`/g, (_, c) => hold(`${mk('`')}<code>${c}</code>${mk('`')}`))
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => hold(`${mk('[[')}<a class="wiki" data-note="${t}">${t}</a>${mk(']]')}`))
    .replace(/\[\^([^\]\s]+)\]/g, (_, id) => hold(`<sup class="fn" data-fn="${id}">${mk('[^')}${id}${mk(']')}</sup>`))
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (all, alt, u) => hold(mk(all) + (safe(u) ? `<img src="${u}" alt="${alt}" contenteditable="false">`
      : IMG.test(u) ? `<img data-img="${u}" alt="${alt}" contenteditable="false">` : '')))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => hold(`${mk('[')}${safe(u) ? `<a class="url" href="${u}">${t}</a>` : t}${mk(`](${u})`)}`))
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (_, p, u) => p + hold(`<a class="url" href="${u}">${u}</a>`))
    .replace(/(\*\*|__)(\S(?:.*?\S)?)\1/g, (_, m, t) => `${mk(m)}<b>${t}</b>${mk(m)}`)
    .replace(/(^|[^*\w])([*_])([^\s*_](?:.*?[^\s*_])?)\2(?![*\w])/g, (_, p, m, t) => `${p}${mk(m)}<i>${t}</i>${mk(m)}`)
    .replace(/~~(\S(?:.*?\S)?)~~/g, (_, t) => `${mk('~~')}<s>${t}</s>${mk('~~')}`)
    .replace(/(^|[^~])~([^\s~](?:[^~]*?[^\s~])?)~(?!~)/g, (_, p, t) => `${p}${mk('~')}<u>${t}</u>${mk('~')}`)
    .replace(/==(\S(?:.*?\S)?)==/g, (_, t) => `${mk('==')}<mark>${t}</mark>${mk('==')}`)
    .replace(COLOR_RE, (_, c, t) => `${mk(`{${c}:`)}<span class="c-${COLORS[c] || c}">${t}</span>${mk('}')}`)
    .replace(/&#60;br\s*\/?&#62;/gi, b => mk(b) + '<br>')
    .replace(/(^|\s)(#[\p{L}\p{N}_\-/]+)/gu, '$1<span class="tag">$2</span>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => kept[i]);
}

export function renderLines(text) {
  if (!text) return ''; // empty editor shows the CSS placeholder
  let fence = false;
  return text.split('\n').map((line, i, all) => {
    const e = esc(line);
    let cls = '', html, m;
    if (line.startsWith('```')) { fence = !fence; cls = 'fence'; html = mk(e); }
    else if (fence) { cls = 'codeblock'; html = e; }
    else if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) { cls = 'hr'; html = mk(e); }
    // Table: "| a | b |" rows; pipes are marks, cells are grid columns (CSS), "|---|" is hidden.
    else if (/^\s*\|.*\|\s*$/.test(line)) {
      if (isSep(line)) { cls = 'tsep'; html = mk(e); }
      else {
        const parts = e.split('|'), last = parts.length - 1;
        cls = isSep(all[i + 1]) ? 'tr th' : 'tr';
        html = parts.map((p, k) => (k === 0 || k === last ? mk(p) : `<span class="td">${inline(p)}</span>`)).join(mk('|'));
        return `<div class="${cls}" style="--cols:${last - 1}">${html}</div>`;
      }
    }
    else if ((m = line.match(/^#{1,6}\s/))) { cls = 'h' + (m[0].length - 1); html = mk(m[0]) + inline(e.slice(m[0].length)); }
    // To-do: "[] 할 일" / "[x] 끝" (the older "- [ ]" form still works).
    else if ((m = line.match(/^(\s*)((?:[-*+] )?\[([ xX]?)\])(?=\s|$)/))) {
      cls = m[3].trim() ? 'task done' : 'task';
      html = `${m[1]}<span class="box" data-line="${i}">${m[2]}</span>${inline(e.slice(m[0].length))}`;
    }
    else if ((m = line.match(/^(\s*)([-*+]|\d+\.)(?=\s)/))) {
      cls = 'li';
      html = `${m[1]}<span class="bullet${/\d/.test(m[2]) ? '' : ' dot'}">${m[2]}</span>${inline(e.slice(m[0].length))}`;
    }
    else if ((m = line.match(/^\[\^[^\]\s]+\]:/))) { cls = 'fndef'; html = `<span class="fnlabel">${esc(m[0])}</span>${inline(e.slice(esc(m[0]).length))}`; }
    else if ((m = line.match(/^>\s?/))) { cls = 'quote'; const q = esc(m[0]); html = mk(q) + inline(e.slice(q.length)); }
    else html = inline(e);
    return `<div${cls && ` class="${cls}"`}>${html || '<br>'}</div>`;
  }).join('');
}

const isSep = l => /^\s*\|[\s|:-]*-[\s|:-]*$/.test(l || '');

const isRow = l => /^\s*\|.*\|\s*$/.test(l) && !isSep(l);

// Keys inside a table, like Bear: Tab/Shift+Tab move between cells, Enter adds a row
// (Enter on an empty row leaves the table), Backspace/Delete never eat a cell border.
// Returns null when the caret is not in a table row, so the key works as usual.
export function tableKey(text, pos, key) {
  const lines = text.split('\n');
  let i = text.slice(0, pos).split('\n').length - 1;
  if (!isRow(lines[i])) return null;
  const starts = (k, l = lines[k]) => { // where each line begins, and where each cell's text begins
    const base = lines.slice(0, k).reduce((s, x) => s + x.length + 1, 0), out = [];
    for (let p = l.indexOf('|'); p >= 0 && p < l.lastIndexOf('|'); p = l.indexOf('|', p + 1)) out.push(base + p + 1 + (l[p + 1] === ' '));
    return { base, cells: out };
  };
  const { base } = starts(i), at = pos - base, line = lines[i];
  if (key === 'Backspace') return line[at - 1] === '|' ? { text, at: pos } : null;
  if (key === 'Delete') return line[at] === '|' ? { text, at: pos } : null;
  const newRow = k => { // empty row after line k, caret in its first cell
    const end = starts(k).base + lines[k].length, cols = lines[k].split('|').length - 2;
    return { text: text.slice(0, end) + '\n|' + '  |'.repeat(cols) + text.slice(end), at: end + 3 };
  };
  if (key === 'Enter') return line.replace(/[\s|]/g, '') ? newRow(i) : { text: text.slice(0, base) + text.slice(base + line.length), at: base };
  // Tab: every cell of this table in reading order
  let top = i, end = i;
  while (top > 0 && (isRow(lines[top - 1]) || isSep(lines[top - 1]))) top--;
  while (end < lines.length - 1 && (isRow(lines[end + 1]) || isSep(lines[end + 1]))) end++;
  const all = [];
  for (let k = top; k <= end; k++) if (isRow(lines[k])) all.push(...starts(k).cells);
  const cur = all.filter(s => s <= pos).length - 1;
  if (key === 'AddColumn') {
    const out = lines.map((l, k) => (k < top || k > end ? l : l.replace(/\s*$/, '') + (isSep(l) ? ' --- |' : '  |')));
    return { text: out.join('\n'), at: pos };
  }
  if (key === 'Tab') return cur + 1 < all.length ? { text, at: all[cur + 1] } : newRow(end);
  if (key === 'ShiftTab') return { text, at: all[Math.max(cur - 1, 0)] };
  return null;
}

// Toolbar: wrap the selection in marks (or drop empty marks at the caret, ready to type into).
export const wrap = (text, a, b, open, close = open) =>
  ({ text: text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b), at: a === b ? a + open.length : b + open.length + close.length });

// Toolbar: line starters. '#' cycles # → ## → ### → none; '- ', '1. ', '> ' switch on/off (replacing another starter).
export function linePrefix(text, pos, kind) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const cur = text.slice(ls).match(/^(#{1,6} |[-*+] (?!\[)|\d+\. |> )?/)[0];
  const next = kind === '#' ? (cur[0] === '#' ? (cur.length < 4 ? '#' + cur : '') : '# ')
    : (kind === '1. ' ? /^\d/.test(cur) : cur === kind) ? '' : kind;
  return { text: text.slice(0, ls) + next + text.slice(ls + cur.length), at: Math.max(ls, pos + next.length - cur.length) };
}

// Enter inside a list keeps the list going, like Bear; Enter on an empty item ends the list.
export function enter(text, start, end) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(ls, start);
  const m = line.match(/^(\s*)(?:(?:[-*+] )?\[[ xX]?\] |([-*+]) |(\d+)\. |> )/);
  if (m && line === m[0] && end === start) return { text: text.slice(0, ls) + text.slice(start), at: ls };
  const next = !m ? '' : m[1] + (m[0].includes('[') ? '[] ' : m[2] ? `${m[2]} ` : m[3] ? `${+m[3] + 1}. ` : '> ');
  return { text: text.slice(0, start) + '\n' + next + text.slice(end), at: start + 1 + next.length };
}

const OPEN = /^\s*(?:[-*+] )?\[ ?\](?=\s|$)/gm;
export const hasOpenTodo = text => text.search(OPEN) >= 0;
export const openTodos = text => (text.match(OPEN) || []).length;

// One key for to-dos: a plain line or list item becomes "[] ", "[]" becomes "[x]" and back.
export function toggleTodo(text, pos) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1, le = (text.indexOf('\n', pos) + 1 || text.length + 1) - 1;
  const line = text.slice(ls, le);
  let next, m;
  if ((m = line.match(/^(\s*(?:[-*+] )?)\[([ xX]?)\]/))) next = m[1] + (m[2].trim() ? '[]' : '[x]') + line.slice(m[0].length);
  else if ((m = line.match(/^(\s*)[-*+] /))) next = `${m[1]}[] ` + line.slice(m[0].length);
  else next = line.replace(/^(\s*)/, '$1[] ');
  return { text: text.slice(0, ls) + next + text.slice(le), at: Math.max(ls, pos + next.length - line.length) };
}

// btoa only takes Latin-1, so Korean text goes through UTF-8 bytes first.
export function b64encode(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const b64decode = b64 =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
