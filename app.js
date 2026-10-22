import { tags, title, toFile, fromFile, b64encode, b64decode, esc, renderLines, enter } from './core.js';

const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

// Note: { id, text, created, updated, pinned, archived, trashed, sha?, dirty?, gone? }
// sha = last synced GitHub blob, dirty = local change not pushed yet, gone = deleted, waiting to delete on GitHub.
const notes = load('frog.notes', {});
const cfg = load('frog.cfg', { repo: 'jinuleee/frog-notes', token: '', theme: 'auto' });
const view = { filter: 'all', tag: null, q: '', current: null };

let warned = false;
function save() {
  // shortcut: localStorage holds ~5MB of text (thousands of notes); move to IndexedDB if that fills up.
  try { localStorage.setItem('frog.notes', JSON.stringify(notes)); }
  catch (e) {
    if (!warned) status('이 기기의 저장 공간이 가득 찼습니다 · 휴지통을 비우세요');
    warned = true;
  }
}

/* ---------- rendering ---------- */

function visible() {
  const q = view.q.toLowerCase();
  return Object.values(notes)
    .filter(n => !n.gone
      && (view.filter === 'trashed' ? n.trashed : !n.trashed && n.archived === (view.filter === 'archived'))
      && (!view.tag || tags(n.text).some(t => t === view.tag || t.startsWith(view.tag + '/')))
      && (!q || n.text.toLowerCase().includes(q)))
    .sort((a, b) => b.pinned - a.pinned || b.updated - a.updated);
}

function renderSide() {
  for (const b of document.querySelectorAll('[data-filter]'))
    b.setAttribute('aria-current', !view.tag && b.dataset.filter === view.filter);
  const tree = {};
  for (const n of Object.values(notes))
    if (!n.gone && !n.trashed) for (const t of tags(n.text)) t.split('/').reduce((o, p) => (o[p] ??= {}), tree);
  const html = (o, path) => Object.keys(o).sort().map(k => {
    const p = path ? `${path}/${k}` : k;
    const kids = html(o[k], p);
    return `<li><button data-tag="${esc(p)}" aria-current="${view.tag === p}">#${esc(k)}</button>${kids && `<ul>${kids}</ul>`}</li>`;
  }).join('');
  $('#tags').innerHTML = html(tree, '');
}

function renderList() {
  $('#items').innerHTML = visible().map(n => {
    const body = n.text.trimStart().split('\n').slice(1).join(' ').replace(/\[[ xX]\]|[#*_>`~\[\]-]/g, '').trim().slice(0, 120);
    return `<li><button data-id="${esc(n.id)}" aria-current="${n.id === view.current}">
      <strong>${n.pinned ? '<span class="pin">고정</span>' : ''}${esc(title(n.text))}</strong>
      <span>${esc(body)}</span>
      <time>${new Date(n.updated).toLocaleDateString('ko-KR')}</time></button></li>`;
  }).join('') || '<li class="none">노트가 없습니다</li>';
}

function renderEditor() {
  const n = notes[view.current];
  $('#editor header').hidden = ed.hidden = !n;
  $('#empty').hidden = !!n;
  if (!n) return;
  paint();
  const trash = view.filter === 'trashed';
  $('#pinBtn').textContent = n.pinned ? '고정 해제' : '고정';
  $('#archiveBtn').textContent = trash ? '복원' : n.archived ? '보관 해제' : '보관';
  $('#trashBtn').textContent = trash ? '영구 삭제' : '삭제';
  $('#trashBtn').classList.toggle('danger', trash);
}

function render() { renderSide(); renderList(); renderEditor(); }

const setPane = p => (document.body.dataset.pane = p);
const status = s => ($('#status').textContent = s);

/* ---------- live markdown editor ---------- */

const ed = $('#text');
try { ed.contentEditable = 'plaintext-only'; } catch { ed.contentEditable = 'true'; } // older Firefox
let painted = '', composing = false;
const history = { id: null, undo: [], redo: [], at: 0 };

const lineText = node => node.nodeType === 3 ? node.data : node.nodeName === 'BR' ? '' : node.textContent;
const readText = () => [...ed.childNodes].map(lineText).join('\n');

// Offset in the note text of a DOM point inside the editor (each line div adds one "\n").
function offsetOf(node, off) {
  if (node === ed) return [...ed.childNodes].slice(0, off).reduce((s, n) => s + lineText(n).length + 1, 0);
  let line = node;
  while (line.parentNode !== ed) line = line.parentNode;
  const r = document.createRange();
  r.selectNodeContents(line);
  r.setEnd(node, off);
  return offsetOf(ed, [...ed.childNodes].indexOf(line)) + r.toString().length;
}

function selection() {
  const s = getSelection();
  if (!s.rangeCount || !ed.contains(s.anchorNode)) return null;
  const a = offsetOf(s.anchorNode, s.anchorOffset), b = offsetOf(s.focusNode, s.focusOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

function setCaret(pos) {
  const place = (node, off) => {
    const r = document.createRange();
    r.setStart(node, off);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  };
  for (const line of ed.childNodes) {
    const len = lineText(line).length;
    if (pos <= len) {
      const w = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      for (let t; (t = w.nextNode()); pos -= t.length) if (pos <= t.length) return place(t, pos);
      return place(line, 0);
    }
    pos -= len + 1;
  }
  place(ed, ed.childNodes.length);
}

function paint() {
  const n = notes[view.current];
  const html = renderLines(n.text);
  if (composing || (html === painted && ed.dataset.id === n.id)) return; // never repaint under the Korean IME
  const sel = document.activeElement === ed ? selection() : null;
  ed.innerHTML = painted = html;
  ed.dataset.id = n.id;
  if (sel) setCaret(sel[1]);
}

function remember(n, force) {
  if (history.id !== n.id) Object.assign(history, { id: n.id, undo: [], redo: [] });
  if (force || Date.now() - history.at > 800) history.undo.push(n.text); // one undo step per typing burst
  history.at = Date.now();
  history.redo = [];
}

function setText(text, caret) {
  const n = notes[view.current];
  remember(n, true);
  n.text = text;
  changed(n);
  setCaret(caret);
}

function step(from, to) {
  const n = notes[view.current];
  if (history.id !== n.id || !from.length) return;
  to.push(n.text);
  n.text = from.pop();
  history.at = 0;
  changed(n);
  setCaret(n.text.length);
}

ed.addEventListener('compositionstart', () => (composing = true));
ed.addEventListener('compositionend', () => { composing = false; ed.dispatchEvent(new Event('input')); });
ed.addEventListener('input', e => {
  const n = notes[view.current];
  const text = readText();
  if (text === n.text) return;
  remember(n);
  n.text = text;
  if (composing || e.isComposing) return save(); // keep the text, repaint after the IME finishes
  changed(n);
});

ed.addEventListener('beforeinput', e => {
  if (e.inputType === 'historyUndo') { e.preventDefault(); step(history.undo, history.redo); }
  if (e.inputType === 'historyRedo') { e.preventDefault(); step(history.redo, history.undo); }
});

ed.addEventListener('keydown', e => {
  if (composing || e.isComposing) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    return e.shiftKey ? step(history.redo, history.undo) : step(history.undo, history.redo);
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const sel = selection();
  if (!sel) return;
  const r = enter(notes[view.current].text, ...sel);
  setText(r.text, r.at);
});

ed.addEventListener('paste', e => {
  e.preventDefault();
  const sel = selection();
  if (!sel) return;
  const t = notes[view.current].text, add = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
  setText(t.slice(0, sel[0]) + add + t.slice(sel[1]), sel[0] + add.length);
});

ed.addEventListener('click', e => {
  const box = e.target.closest('.box');
  if (box) {
    const n = notes[view.current], lines = n.text.split('\n'), i = +box.dataset.line;
    lines[i] = lines[i].replace(/\[([ xX])\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
    return setText(lines.join('\n'), offsetOf(ed, i + 1) - 1);
  }
  const link = e.target.closest('a.url');
  if (link && (e.metaKey || e.ctrlKey)) window.open(link.href, '_blank', 'noopener');
});

/* ---------- actions ---------- */

function open(id) {
  const prev = notes[view.current];
  if (prev && prev.id !== id && !prev.text.trim() && !prev.sha) delete notes[prev.id]; // drop blank new notes
  view.current = id;
  save(); render();
  setPane(id ? 'editor' : 'list');
}

function changed(n, bumpTime = true) {
  if (bumpTime) n.updated = Date.now();
  n.dirty = true;
  save(); render(); queueSync();
}

$('#newBtn').onclick = () => {
  const now = Date.now(), id = crypto.randomUUID();
  notes[id] = { id, text: '', created: now, updated: now, pinned: false, archived: false, trashed: false };
  if (view.filter !== 'all') view.filter = 'all';
  open(id);
  ed.focus();
};

$('#search').oninput = e => { view.q = e.target.value; renderList(); };
$('#pinBtn').onclick = () => { const n = notes[view.current]; n.pinned = !n.pinned; changed(n, false); };

$('#archiveBtn').onclick = () => {
  const n = notes[view.current];
  if (n.trashed) n.trashed = false; else n.archived = !n.archived;
  changed(n, false);
  open(null);
};

// Permanent delete asks twice in the button itself (confirm() is blocked in some embedded views).
$('#trashBtn').onclick = e => {
  const n = notes[view.current], b = e.currentTarget;
  if (!n.trashed) { n.trashed = true; changed(n, false); return open(null); }
  if (b.textContent !== '정말 삭제?') { b.textContent = '정말 삭제?'; return setTimeout(() => renderEditor(), 3000); }
  if (n.sha) { n.gone = true; changed(n, false); } else delete notes[n.id];
  open(null);
};

$('#exportBtn').onclick = () => {
  const n = notes[view.current];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([n.text], { type: 'text/markdown' }));
  a.download = title(n.text).replace(/[\\/:*?"<>|]/g, '_') + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#side').onclick = e => {
  const b = e.target.closest('button[data-filter], button[data-tag]');
  if (!b) return;
  view.filter = b.dataset.filter || 'all';
  view.tag = b.dataset.tag || null;
  open(null);
};
$('#items').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) open(b.dataset.id); };
$('#menuBtn').onclick = () => setPane('side');
$('#backBtn').onclick = () => open(null);

/* ---------- settings ---------- */

const applyTheme = () => (document.documentElement.dataset.theme = cfg.theme);

$('#settingsBtn').onclick = () => {
  const f = $('#settings form');
  for (const k of ['repo', 'token', 'theme']) f[k].value = cfg[k];
  $('#settings').showModal();
};
$('#settings').onclose = () => {
  if ($('#settings').returnValue !== 'ok') return;
  const f = $('#settings form');
  for (const k of ['repo', 'token', 'theme']) cfg[k] = f[k].value.trim();
  try { localStorage.setItem('frog.cfg', JSON.stringify(cfg)); } catch {}
  applyTheme();
  sync();
};

/* ---------- GitHub sync ---------- */

async function api(path, opt = {}) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}/${path}`, {
    ...opt,
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) {
    const msg = (await r.json().catch(() => ({}))).message || r.statusText;
    throw Object.assign(new Error(`${r.status} ${msg}`), { status: r.status });
  }
  return r.json();
}

async function push() {
  for (const n of Object.values(notes).filter(n => n.dirty)) {
    const path = `contents/notes/${n.id}.md`;
    const write = sha => n.gone
      ? api(path, { method: 'DELETE', body: JSON.stringify({ message: `delete ${n.id}`, sha }) })
      : api(path, { method: 'PUT', body: JSON.stringify({ message: title(n.text), content: b64encode(toFile(n)), ...(sha && { sha }) }) });
    const sent = n.updated, sentText = n.text;
    let res;
    try { res = await write(n.sha); }
    catch (e) {
      if (![404, 409, 422].includes(e.status)) throw e;
      // Changed on another device: last write wins; the other version stays in git history.
      const cur = await api(path).catch(() => null);
      res = n.gone && !cur ? null : await write(cur?.sha);
    }
    if (n.gone) delete notes[n.id];
    else {
      n.sha = res.content.sha;
      if (n.updated === sent && n.text === sentText) n.dirty = false; // edits made during upload go next round
    }
    save();
  }
}

async function pull() {
  let tree;
  try { tree = await api('git/trees/HEAD?recursive=1'); }
  catch (e) { if (e.status === 409) return; throw e; } // 409 = repository has no commits yet
  // shortcut: one request per changed note; first sync of thousands of notes takes a while (GitHub allows 5000/hour).
  const remote = new Map(tree.tree.filter(f => /^notes\/[^/]+\.md$/.test(f.path)).map(f => [f.path.slice(6, -3), f.sha]));
  for (const [id, sha] of remote) {
    const n = notes[id];
    if (n?.dirty || n?.sha === sha) continue;
    const blob = await api(`git/blobs/${sha}`);
    notes[id] = { ...fromFile(id, b64decode(blob.content)), sha };
  }
  for (const n of Object.values(notes))
    if (n.sha && !n.dirty && !remote.has(n.id)) delete notes[n.id]; // deleted on another device
  if (view.current && !notes[view.current]) view.current = null;
}

let syncing = false, again = false, timer;
const queueSync = () => { clearTimeout(timer); timer = setTimeout(sync, 3000); };

async function sync() {
  if (!cfg.token) return status('이 기기에만 저장 중 · 설정에서 GitHub 연결');
  if (!navigator.onLine) return status('오프라인 · 연결되면 동기화');
  if (syncing) return void (again = true);
  syncing = true;
  status('동기화 중…');
  try {
    await push();
    await pull();
    save(); render();
    status('동기화 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    status(e.status === 401 ? '토큰이 맞지 않습니다 · 설정 확인' : '동기화 실패 · ' + e.message);
  } finally {
    syncing = false;
    if (again) { again = false; sync(); }
  }
}

addEventListener('online', sync);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());

/* ---------- start ---------- */

applyTheme();
render();
sync();
navigator.serviceWorker?.register('sw.js').catch(() => {}); // unavailable in some embedded previews
