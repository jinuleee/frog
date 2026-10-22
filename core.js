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

// btoa only takes Latin-1, so Korean text goes through UTF-8 bytes first.
export function b64encode(s) {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const b64decode = b64 =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));
