// Pure helpers shared by app.js and core.test.js (no DOM, so Node can test them).

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

const META = ['created', 'updated', 'pinned', 'archived', 'trashed'];

export const toFile = n => `---\n${META.map(k => `${k}: ${n[k]}`).join('\n')}\n---\n${n.text}`;

export function fromFile(id, raw) {
  raw = raw.replace(/\r\n/g, '\n');
  const n = { id, text: raw, created: 0, updated: 0, pinned: false, archived: false, trashed: false };
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return n; // a plain .md dropped into the repo by hand still loads
  n.text = raw.slice(m[0].length);
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (META.includes(k)) n[k] = v === 'true' ? true : v === 'false' ? false : Number(v) || 0;
  }
  return n;
}

export const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// Live editor markup. Marks stay in the text (dimmed by CSS), so the rendered
// textContent is always exactly the note text and the caret offset maps 1:1.
const mk = s => `<span class="mk">${s}</span>`;
const inline = s => s // s is already escaped
  .replace(/`([^`]+)`/g, (_, c) => `${mk('`')}<code>${c}</code>${mk('`')}`)
  .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, (_, m, t) => `${mk(m)}<b>${t}</b>${mk(m)}`)
  .replace(/(^|[^*\w])([*_])(?=[^\s*_])(.+?)(?<=[^\s*_])\2(?![*\w])/g, (_, p, m, t) => `${p}${mk(m)}<i>${t}</i>${mk(m)}`)
  .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, (_, t) => `${mk('~~')}<s>${t}</s>${mk('~~')}`)
  .replace(/(^|\s)(#[\p{L}\p{N}_\-/]+)/gu, '$1<span class="tag">$2</span>')
  .replace(/https?:\/\/[^\s<]+/g, u => `<a class="url" href="${u}">${u}</a>`);

export function renderLines(text) {
  if (!text) return ''; // empty editor shows the CSS placeholder
  let fence = false;
  return text.split('\n').map((line, i) => {
    const e = esc(line);
    let cls = '', html, m;
    if (line.startsWith('```')) { fence = !fence; cls = 'fence'; html = mk(e); }
    else if (fence) { cls = 'codeblock'; html = e; }
    else if ((m = line.match(/^#{1,6}(?=\s)/))) { cls = 'h' + m[0].length; html = mk(m[0]) + inline(e.slice(m[0].length)); }
    else if ((m = line.match(/^\s*[-*+] \[([ xX])\]/))) {
      cls = m[1] === ' ' ? 'task' : 'task done';
      html = `<span class="box" data-line="${i}">${m[0]}</span>${inline(e.slice(m[0].length))}`;
    }
    else if ((m = line.match(/^\s*(?:[-*+]|\d+\.)(?=\s)/))) { cls = 'li'; html = `<span class="bullet">${m[0]}</span>${inline(e.slice(m[0].length))}`; }
    else if (line.startsWith('>')) { cls = 'quote'; html = mk('&#62;') + inline(e.slice(5)); } // esc('>') is 5 chars
    else if (/^(-{3,}|\*{3,})$/.test(line)) { cls = 'hr'; html = mk(e); }
    else html = inline(e);
    return `<div${cls && ` class="${cls}"`}>${html || '<br>'}</div>`;
  }).join('');
}

// Enter inside a list keeps the list going, like Bear; Enter on an empty item ends the list.
export function enter(text, start, end) {
  const ls = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(ls, start);
  const m = line.match(/^(\s*)(?:([-*+]) \[[ xX]\] |([-*+]) |(\d+)\. |> )/);
  if (m && line === m[0] && end === start) return { text: text.slice(0, ls) + text.slice(start), at: ls };
  const next = !m ? '' : m[1] + (m[2] ? `${m[2]} [ ] ` : m[3] ? `${m[3]} ` : m[4] ? `${+m[4] + 1}. ` : '> ');
  return { text: text.slice(0, start) + '\n' + next + text.slice(end), at: start + 1 + next.length };
}

// btoa only takes Latin-1, so Korean text goes through UTF-8 bytes first.
export function b64encode(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const b64decode = b64 =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
