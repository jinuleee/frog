import { tags, title, toFile, fromFile, b64encode, b64decode, esc, renderLines, enter, renameTag, removeTag, toggleTodo, openTodos, hasOpenTodo, wrap, linePrefix, tableKey, IMG } from './core.js?v=12';

const $ = s => document.querySelector(s);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

// Note: { id, text, created, updated, pinned, archived, trashed, category, order?, sha?, dirty?, gone? }
// List order: a note dragged by hand keeps its 'order'; others sort by last edit.
const rank = n => n.order || n.updated;
// sha = last synced GitHub blob, dirty = local change not pushed yet, gone = deleted, waiting to delete on GitHub.
const notes = load('frog.notes', {});
const cfg = load('frog.cfg', { repo: 'jinuleee/frog-notes', token: '', theme: 'auto' });
const view = { filter: 'all', tag: null, cat: null, q: '', current: null };
// Categories: [{ name, color }], synced as categories.json next to the notes. meta.sha/dirty work like a note's.
let cats = load('frog.cats', []);
const catMeta = load('frog.catMeta', { sha: null, dirty: false });
const folds = load('frog.folds', {});
const saveCats = () => { try { localStorage.setItem('frog.cats', JSON.stringify(cats)); localStorage.setItem('frog.catMeta', JSON.stringify(catMeta)); } catch {} };
const catColor = name => cats.find(c => c.name === name)?.color;
const PALETTE = ['#c678dd', '#f0883e', '#3fb68b', '#e5534b', '#79c0ff', '#e3b341', '#8b949e'];

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
      && (view.filter === 'trashed' ? n.trashed
        : view.filter === 'todo' ? !n.trashed && !n.archived && hasOpenTodo(n.text)
        : !n.trashed && n.archived === (view.filter === 'archived'))
      && (!view.tag || tags(n.text).some(t => t === view.tag || t.startsWith(view.tag + '/')))
      && (!view.cat || n.category === view.cat)
      && (!q || n.text.toLowerCase().includes(q)))
    .sort((a, b) => b.pinned - a.pinned || rank(b) - rank(a));
}

function renderSide() {
  for (const b of document.querySelectorAll('[data-filter]'))
    b.setAttribute('aria-current', !view.tag && !view.cat && b.dataset.filter === view.filter);
  const live = Object.values(notes).filter(n => !n.gone && !n.trashed);
  $('#cats').innerHTML = cats.map(c => `<li><button data-cat="${esc(c.name)}" aria-current="${view.cat === c.name}">
    <i class="swatch" style="background:${esc(c.color)}"></i>${esc(c.name)}<span class="count">${live.filter(n => n.category === c.name).length}</span></button></li>`).join('')
    || '<li class="none-side">No categories yet</li>';
  const todo = live.filter(n => !n.archived && hasOpenTodo(n.text)).length;
  $('#todoCount').textContent = todo || '';
  for (const g of document.querySelectorAll('.group')) {
    const open = !folds[g.dataset.group];
    g.classList.toggle('folded', !open);
    g.querySelector('.fold').setAttribute('aria-expanded', open);
  }
  const tree = {};
  for (const n of Object.values(notes))
    if (!n.gone && !n.trashed) for (const t of tags(n.text)) t.split('/').reduce((o, p) => (o[p] ??= {}), tree);
  const html = (o, path) => Object.keys(o).sort().map(k => {
    const p = path ? `${path}/${k}` : k;
    const kids = html(o[k], p);
    return `<li><button data-tag="${esc(p)}" aria-current="${view.tag === p}"><svg class="i" viewBox="0 0 24 24"><path d="M3 12V3h9l9 9-9 9-9-9Zm4.5-4.5h.01"/></svg>${esc(k)}</button>${kids && `<ul>${kids}</ul>`}</li>`;
  }).join('');
  $('#tags').innerHTML = html(tree, '');
}

// List dates like Bear: 방금 전, 5분 전, 3시간 전, 어제, 7월 10일, 2025년 7월 8일.
function when(t) {
  const min = (Date.now() - t) / 6e4, d = new Date(t), now = new Date();
  if (min < 1) return '방금 전';
  if (min < 60) return `${min | 0}분 전`;
  if (d.toDateString() === now.toDateString()) return `${(min / 60) | 0}시간 전`;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return '어제';
  return d.toLocaleDateString('ko-KR', { year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric', month: 'long', day: 'numeric' });
}
setInterval(() => renderList(), 6e4); // keep "5분 전" honest

const VIEWS = { all: 'Notes', todo: 'Todo', archived: 'Archive', trashed: 'Trash' };
function renderList() {
  $('#viewName').textContent = view.tag ? '#' + view.tag : view.cat || VIEWS[view.filter];
  $('#items').innerHTML = visible().map(n => {
    const pic = n.text.match(/!\[[^\]]*\]\(((?:https?:\/\/|images\/)[^)\s]+)\)/);
    const body = n.text.trimStart().split('\n').slice(1).join(' ').replace(/!?\[([^\]]*)\]\([^)\s]*\)/g, '$1').replace(/\{[^{}:]+:([^{}]*)\}/g, '$1').replace(/\[[ xX]?\]|[#*_>`~=^\[\]|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return `<li draggable="true"><button data-id="${esc(n.id)}" aria-current="${n.id === view.current}">
      <strong>${catColor(n.category) ? `<i class="swatch" style="background:${esc(catColor(n.category))}" title="${esc(n.category)}"></i>` : ''}${n.pinned ? '<span class="pin" title="고정">&#x1F4CC;</span>' : ''}${esc(title(n.text))}</strong>
      <span>${esc(body)}</span>${pic ? `<img class="pic" ${IMG.test(pic[1]) ? 'data-img' : 'src'}="${esc(pic[1])}" alt="" loading="lazy">` : ''}
      <time>${when(n.updated)}${openTodos(n.text) ? ` · <span class="todo-left">할 일 ${openTodos(n.text)}</span>` : ''}</time></button></li>`;
  }).join('') || '<li class="none">노트가 없습니다</li>';
  showImgs($('#items'));
}

function renderEditor() {
  const n = notes[view.current];
  $('#editor header').hidden = $('.page').hidden = $('#tools').hidden = !n;
  $('#empty').hidden = !!n;
  if (!n) return;
  paint();
  $('#catSel').innerHTML = `<option value="">카테고리 없음</option>` + cats.map(c => `<option>${esc(c.name)}</option>`).join('');
  $('#catSel').value = cats.some(c => c.name === n.category) ? n.category : '';
  const day = t => new Date(t).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  $('#rail').hidden = cfg.showDates === false;
  $('#railTop').textContent = day(n.created);
  $('#railBottom').textContent = day(n.updated);
  rail();
  const trash = view.filter === 'trashed';
  icon('#pinBtn', 'pin', n.pinned ? '고정 해제' : '고정');
  $('#pinBtn').classList.toggle('on', !!n.pinned);
  icon('#archiveBtn', trash ? 'restore' : 'archive', trash ? '복원' : n.archived ? '보관 해제' : '보관');
  $('#archiveBtn').classList.toggle('on', !trash && !!n.archived);
  icon('#trashBtn', 'trash', trash ? '영구 삭제' : '삭제');
  $('#trashBtn').classList.toggle('danger', trash);
}

// Header buttons are icons; the label lives in the tooltip and for screen readers.
const ICONS = {
  pin: 'M9 3h6l-1 6 4 4H6l4-4zM12 17v4',
  archive: 'M2 3h20v4H2zM4 7v13h16V7M9 12h6',
  restore: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
};
function icon(sel, name, label, text = '') {
  const b = $(sel);
  b.innerHTML = `<svg class="i" viewBox="0 0 24 24"><path d="${ICONS[name]}"/></svg>${text}`;
  b.title = label;
  b.setAttribute('aria-label', label);
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

const hidden = t => t.parentNode.classList?.contains('mk') && t.parentNode.closest('.tr, .tsep');

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
      let seen = null;
      for (let t; (t = w.nextNode()); ) {
        if (hidden(t)) { pos = Math.max(0, pos - t.length); continue; } // table pipes are invisible: step past them
        if (pos <= t.length) return place(t, pos);
        pos -= t.length;
        seen = t;
      }
      return seen ? place(seen, seen.length) : place(line, 0);
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
  showImgs(ed);
  if (sel) setCaret(sel[1]);
  markActive();
}

// The line holding the caret shows its markdown marks; every other line shows the result only.
function markActive() {
  const s = getSelection();
  let line = s.rangeCount && ed.contains(s.focusNode) && s.focusNode !== ed ? s.focusNode : null;
  while (line && line.parentNode !== ed) line = line.parentNode;
  for (const d of ed.querySelectorAll(':scope > .active')) if (d !== line) d.classList.remove('active');
  line?.classList?.add('active');
}
document.addEventListener('selectionchange', markActive);

// Arrow keys can land the caret on a hidden table border or the hidden "|---|" line: hop to the next visible spot.
let caretWas = 0;
document.addEventListener('selectionchange', () => {
  const s = getSelection(), sel = s.isCollapsed && document.activeElement === ed && selection();
  if (!sel) return;
  const el = s.focusNode.nodeType === 3 ? s.focusNode : s.focusNode.childNodes[s.focusOffset] || s.focusNode;
  const sep = el.parentElement?.closest('.tsep') || (el.classList?.contains('tsep') && el);
  if (sep) {
    const text = notes[view.current].text, ls = text.lastIndexOf('\n', sel[1] - 1);
    return setCaret(sel[1] < caretWas ? Math.max(ls, 0) : text.indexOf('\n', sel[1]) + 1 || text.length); // moving up: end of row above
  }
  if (el.nodeType === 3 && hidden(el)) return setCaret(sel[1]);
  caretWas = sel[1];
});

// Date rail: created on top, last edit at the bottom; the thumb marks the caret's line out of all lines.
// With no caret yet (note just opened), it marks the first line on screen instead.
let lastSel = null; // the select box steals focus, so remember where the caret was
function rail() {
  const n = notes[view.current];
  if ($('#rail').hidden || !n) return;
  const total = n.text.split('\n').length;
  const line = lastSel ? n.text.slice(0, lastSel[1]).split('\n').length
    : Math.max([...ed.children].findIndex(d => d.offsetTop + d.offsetHeight > ed.scrollTop), 0) + 1;
  $('.thumb').style.top = `calc(${total > 1 ? (line - 1) / (total - 1) : 0} * (100% - 44px))`;
  $('#railPos').textContent = `${line} / ${total}`;
}
ed.addEventListener('scroll', () => lastSel || rail());
document.addEventListener('selectionchange', () => { if (document.activeElement === ed && (lastSel = selection())) rail(); });


// Formatting toolbar (Bear's bottom bar). Buttons never take focus, so the editor keeps its selection.
const TABLE = '|  |  |  |\n| --- | --- | --- |\n|  |  |  |';
const ACTS = {
  h: (t, a, b) => linePrefix(t, b, '#'), ul: (t, a, b) => linePrefix(t, b, '- '),
  ol: (t, a, b) => linePrefix(t, b, '1. '), quote: (t, a, b) => linePrefix(t, b, '> '),
  todo: (t, a, b) => toggleTodo(t, b),
  b: (t, a, b) => wrap(t, a, b, '**'), i: (t, a, b) => wrap(t, a, b, '_'), u: (t, a, b) => wrap(t, a, b, '~'),
  s: (t, a, b) => wrap(t, a, b, '~~'), mark: (t, a, b) => wrap(t, a, b, '=='), code: (t, a, b) => wrap(t, a, b, '`'),
  link: (t, a, b) => { const r = wrap(t, a, b, '[', '](https://)'); return { text: r.text, at: a === b ? r.at : r.at - 1 }; },
  img: (t, a, b) => { const r = wrap(t, a, b, '![', '](https://)'); return { text: r.text, at: r.at + (a === b ? 0 : -1) }; },
  // Blocks go on their own lines after the caret's line.
  table: (t, a, b) => tableKey(t, b, 'AddColumn') || block(t, b, TABLE, 2), // inside a table: one more column
  hr: (t, a, b) => block(t, b, '---', 3),
};
function block(t, pos, s, caret) {
  const le = (t.indexOf('\n', pos) + 1 || t.length + 1) - 1, lead = le ? '\n' : '';
  return { text: t.slice(0, le) + lead + s + '\n' + t.slice(le), at: le + lead.length + caret };
}
function act(name) {
  const n = notes[view.current];
  if (!n) return;
  if (name === 'more') return void ($('#tools .more').hidden = !$('#tools .more').hidden);
  const [a, b] = (document.activeElement === ed && selection()) || lastSel || [n.text.length, n.text.length];
  const r = ACTS[name](n.text, a, b);
  ed.focus();
  setText(r.text, r.at);
}
const todo = () => act('todo');
$('#tools').addEventListener('mousedown', e => e.preventDefault());
$('#tools').onclick = e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); };
$('#colorSel').onchange = e => {
  const c = e.target.value, n = notes[view.current];
  e.target.value = '';
  if (!c || !n) return;
  const [a, b] = lastSel || [n.text.length, n.text.length];
  ed.focus();
  setText(`${n.text.slice(0, a)}{${c}:${n.text.slice(a, b)}}${n.text.slice(b)}`, a === b ? a + c.length + 2 : b + c.length + 3);
};
$('#catSel').onchange = e => { const n = notes[view.current]; n.category = e.target.value; changed(n, false); };

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
  if (['Tab', 'Enter', 'Backspace', 'Delete'].includes(e.key) && !e.metaKey && !e.ctrlKey) {
    const sel = selection();
    const r = sel && sel[0] === sel[1] && tableKey(notes[view.current].text, sel[1], e.shiftKey && e.key === 'Tab' ? 'ShiftTab' : e.key);
    if (r) { e.preventDefault(); return r.text === notes[view.current].text ? setCaret(r.at) : setText(r.text, r.at); }
  }
  const key = (e.metaKey || e.ctrlKey) && { b: 'b', i: 'i', u: 'u' }[e.key.toLowerCase()];
  if (key) { e.preventDefault(); return act(key); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (e.metaKey || e.ctrlKey) return todo();
  const sel = selection();
  if (!sel) return;
  const r = enter(notes[view.current].text, ...sel);
  setText(r.text, r.at);
});

ed.addEventListener('paste', e => {
  e.preventDefault();
  const sel = selection();
  if (!sel) return;
  const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'));
  if (file) return void pasteImage(file, sel);
  const t = notes[view.current].text, add = e.clipboardData.getData('text/plain').replace(/\r\n?|\n/g, inTable(t, sel[0]) ? ' ' : '\n');
  setText(t.slice(0, sel[0]) + add + t.slice(sel[1]), sel[0] + add.length);
});

ed.addEventListener('click', e => {
  const box = e.target.closest('.box');
  if (box) {
    const n = notes[view.current], lines = n.text.split('\n'), i = +box.dataset.line;
    lines[i] = lines[i].replace(/\[([ xX]?)\]/, (_, c) => (c.trim() ? '[]' : '[x]'));
    return setText(lines.join('\n'), offsetOf(ed, i + 1) - 1);
  }
  // Links work on a plain click, like Bear; to edit one, put the caret next to it with the keyboard.
  const link = e.target.closest('a.url');
  if (link) { e.preventDefault(); return window.open(link.href, '_blank', 'noopener'); }
  const wiki = e.target.closest('a.wiki');
  if (wiki) {
    const want = wiki.dataset.note.trim().toLowerCase();
    const hit = Object.values(notes).find(n => !n.gone && !n.trashed && title(n.text).toLowerCase() === want);
    if (hit) return open(hit.id);
    const now = Date.now(), id = crypto.randomUUID(); // [[new title]] creates that note
    notes[id] = { id, text: `# ${wiki.dataset.note.trim()}\n\n`, created: now, updated: now, pinned: false, archived: false, trashed: false };
    changed(notes[id]);
    return open(id);
  }
  const fn = e.target.closest('.fn');
  if (fn) {
    const t = notes[view.current].text, at = t.search(new RegExp(`^\\[\\^${fn.dataset.fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]:`, 'm'));
    if (at >= 0) setCaret(at);
  }
});

/* ---------- actions ---------- */

function open(id) {
  const prev = notes[view.current];
  if (prev && prev.id !== id && !prev.text.trim() && !prev.sha) delete notes[prev.id]; // drop blank new notes
  if (view.current !== id) lastSel = null;
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
  notes[id] = { id, text: '', created: now, updated: now, pinned: false, archived: false, trashed: false, category: view.cat || '' };
  if (view.filter !== 'all') view.filter = 'all';
  open(id);
  ed.focus();
};

$('#search').oninput = e => { view.q = e.target.value; renderList(); };
// Search hides behind its icon like Bear; it closes again when left empty.
const showSearch = on => { $('#search').hidden = !on; $('#viewName').hidden = on; if (on) $('#search').focus(); };
$('#searchBtn').onclick = () => showSearch($('#search').hidden);
$('#search').onblur = e => e.target.value || showSearch(false);
$('#search').onkeydown = e => { if (e.key === 'Escape') { e.target.value = view.q = ''; renderList(); showSearch(false); } };
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
  if (!b.textContent) { icon('#trashBtn', 'trash', '한 번 더 누르면 영구 삭제', '정말 삭제?'); return setTimeout(() => renderEditor(), 3000); }
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
  const fold = e.target.closest('.fold');
  if (fold) { const g = fold.closest('.group').dataset.group; folds[g] = !folds[g]; try { localStorage.setItem('frog.folds', JSON.stringify(folds)); } catch {} return renderSide(); }
  const b = e.target.closest('button[data-filter], button[data-tag], button[data-cat]');
  if (!b) return;
  view.filter = b.dataset.filter || 'all';
  view.tag = b.dataset.tag || null;
  view.cat = b.dataset.cat || null;
  open(null);
};
$('#sideToggle').onclick = () => { document.body.classList.toggle('side-closed'); if (innerWidth <= 760) setPane('list'); };

/* ---------- category manager ---------- */

const catRow = (c = {}) => `<li data-old="${esc(c.name || '')}"><input type="color" value="${esc(c.color || PALETTE[$('#catRows').children.length % PALETTE.length])}" aria-label="색">
  <input class="name" value="${esc(c.name || '')}" maxlength="30" placeholder="카테고리 이름" aria-label="이름"><button type="button" class="del">삭제</button></li>`;
$('#catManage').onclick = () => { $('#catRows').innerHTML = ''; for (const c of cats) $('#catRows').insertAdjacentHTML('beforeend', catRow(c)); $('#catDlg').showModal(); };
$('#catAdd').onclick = () => { $('#catRows').insertAdjacentHTML('beforeend', catRow()); $('#catRows').lastElementChild.querySelector('.name').focus(); };
$('#catRows').onclick = e => e.target.closest('.del')?.closest('li').remove();
$('#catDlg form').onsubmit = () => {
  const next = [], moved = {};
  for (const li of $('#catRows').children) {
    const name = li.querySelector('.name').value.trim().replace(/\s+/g, ' ');
    if (!name || next.some(c => c.name === name)) continue;
    next.push({ name, color: li.querySelector('[type=color]').value });
    if (li.dataset.old) moved[li.dataset.old] = name;
  }
  for (const n of Object.values(notes)) {
    if (!n.category || n.gone) continue;
    const to = moved[n.category] ?? '';
    if (to !== n.category) { n.category = to; n.dirty = true; } // renamed or deleted category
  }
  if (view.cat && !next.some(c => c.name === view.cat)) view.cat = moved[view.cat] || null;
  cats = next; catMeta.dirty = true;
  saveCats(); save(); render(); queueSync();
};

/* ---------- tag manager ---------- */

function renderTagRows() {
  const count = {};
  for (const n of Object.values(notes)) {
    if (n.gone || n.trashed) continue;
    const own = new Set(tags(n.text).flatMap(t => t.split('/').map((_, i, p) => p.slice(0, i + 1).join('/')))); // #a/b also counts for #a
    for (const t of own) count[t] = (count[t] || 0) + 1;
  }
  $('#tagRows').innerHTML = Object.keys(count).sort().map(t => `<li data-tag="${esc(t)}"><input class="name" value="${esc(t)}" aria-label="태그 이름">
    <span class="count">${count[t]}</span><button type="button" class="ren">변경</button><button type="button" class="del">삭제</button></li>`).join('')
    || '<li class="none-side">아직 태그가 없습니다. 노트에 #태그 를 써 보세요.</li>';
}
$('#tagRows').oninput = e => e.target.setCustomValidity?.('');
$('#tagManage').onclick = () => { renderTagRows(); $('#tagDlg').showModal(); };
$('#tagRows').onclick = e => {
  const li = e.target.closest('li[data-tag]'), b = e.target.closest('button');
  if (!li || !b) return;
  const from = li.dataset.tag, to = li.querySelector('.name').value.trim().replace(/^#+/, '');
  if (b.classList.contains('ren') && !/^[\p{L}\p{N}_\-/]+$/u.test(to)) return void (li.querySelector('.name').setCustomValidity('글자·숫자·_·-·/ 만 쓸 수 있어요'), li.querySelector('.name').reportValidity());
  if (b.classList.contains('del') && b.textContent !== '정말 삭제?') return void (b.textContent = '정말 삭제?');
  for (const n of Object.values(notes)) {
    if (n.gone || n.trashed) continue;
    const t = b.classList.contains('ren') ? renameTag(n.text, from, to) : removeTag(n.text, from);
    if (t !== n.text) { n.text = t; n.updated = Date.now(); n.dirty = true; }
  }
  if (view.tag === from || view.tag?.startsWith(from + '/')) view.tag = null;
  save(); render(); queueSync(); renderTagRows();
};
$('#items').onclick = e => { const b = e.target.closest('button[data-id]'); if (b) open(b.dataset.id); };

// Drag a note up or down the list; it lands halfway between its new neighbours.
let dragId = null;
const dropAt = e => {
  const li = e.target.closest('li[draggable]');
  return li && { li, after: e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2 };
};
const clearDrop = () => $('#items').querySelectorAll('.drop-before, .drop-after').forEach(li => li.className = '');
$('#items').addEventListener('dragstart', e => {
  dragId = e.target.closest('li')?.firstElementChild.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', ''); // Firefox will not start a drag without data
});
$('#items').addEventListener('dragover', e => {
  const d = dragId && dropAt(e);
  if (!d) return;
  e.preventDefault();
  clearDrop();
  d.li.className = d.after ? 'drop-after' : 'drop-before';
});
$('#items').addEventListener('dragend', () => { dragId = null; clearDrop(); });
$('#items').addEventListener('drop', e => {
  const d = dragId && dropAt(e);
  clearDrop();
  if (!d) return;
  e.preventDefault();
  const list = visible().filter(n => n.id !== dragId);
  const i = list.findIndex(n => n.id === d.li.firstElementChild.dataset.id) + d.after;
  const above = list[i - 1], below = list[i], n = notes[dragId];
  n.order = above && below ? (rank(above) + rank(below)) / 2 : above ? rank(above) - 60000 : below ? rank(below) + 60000 : n.order;
  dragId = null;
  changed(n, false);
});
$('#menuBtn').onclick = () => { document.body.classList.remove('side-closed'); setPane('side'); };
$('#backBtn').onclick = () => open(null);

/* ---------- settings ---------- */

const applyTheme = () => (document.documentElement.dataset.theme = cfg.theme);

$('#settingsBtn').onclick = () => {
  const f = $('#settings form');
  for (const k of ['repo', 'token', 'theme']) f[k].value = cfg[k];
  f.showDates.checked = cfg.showDates !== false;
  $('#settings').showModal();
};
// Save on submit, not on the dialog's close event: some browsers deliver that late or never.
$('#settings form').onsubmit = () => {
  const f = $('#settings form');
  for (const k of ['repo', 'token', 'theme']) cfg[k] = f[k].value.trim();
  cfg.showDates = f.showDates.checked;
  try { localStorage.setItem('frog.cfg', JSON.stringify(cfg)); } catch {}
  applyTheme();
  renderEditor();
  sync();
};

/* ---------- pasted images ---------- */
// A pasted image is shrunk, kept in this browser's cache at once, and uploaded to the notes repo
// (images/…) on the next sync, so every device can show it. The note only holds ![](images/…).
const IMG_CACHE = 'frog-img', imgReq = p => new Request(new URL(`__img/${p}`, location.href)), imgs = {};
const queue = { get: () => JSON.parse(localStorage['frog.imgQueue'] || '[]'), set: q => (localStorage['frog.imgQueue'] = JSON.stringify(q)) };

const inTable = (t, pos) => /^\s*\|.*\|\s*$/.test(t.slice(t.lastIndexOf('\n', pos - 1) + 1).split('\n')[0]);

async function pasteImage(file, [a, b]) {
  let blob = file, ext = 'gif';
  if (file.type !== 'image/gif') { // keep GIFs animated; everything else becomes a JPEG up to 1600px wide
    const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / bmp.width);
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; // transparent screenshots would turn black in a JPEG
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    ext = 'jpg';
  }
  const path = `images/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
  await (await caches.open(IMG_CACHE)).put(imgReq(path), new Response(blob, { headers: { 'Content-Type': blob.type } }));
  queue.set([...queue.get(), path]);
  const t = notes[view.current].text, md = inTable(t, a) ? `![](${path})` // a table cell must stay on one line
    : `${a && t[a - 1] !== '\n' ? '\n' : ''}![](${path})\n`; // otherwise on a line of its own
  setText(t.slice(0, a) + md + t.slice(b), a + md.length);
}

// Show images[data-img]: from the cache, or fetched once from the notes repo (private, so it needs the token).
function loadImg(p) {
  return (imgs[p] ??= (async () => {
    const c = await caches.open(IMG_CACHE);
    let r = await c.match(imgReq(p));
    if (!r && cfg.token) {
      const res = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${p}`, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github.raw' } });
      if (!res.ok) return delete imgs[p], ''; // not uploaded yet from the other device: try again later
      await c.put(imgReq(p), res.clone());
      r = res;
    }
    return r ? URL.createObjectURL(await r.blob()) : (delete imgs[p], '');
  })().catch(() => (delete imgs[p], '')));
}
const showImgs = root => root.querySelectorAll('img[data-img]').forEach(async img => { const u = await loadImg(img.dataset.img); if (u) img.src = u; });

async function pushImgs() {
  for (const path of queue.get()) {
    const r = await (await caches.open(IMG_CACHE)).match(imgReq(path));
    if (r) {
      const blob = await r.blob();
      const content = await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result.split(',')[1]); f.readAsDataURL(blob); });
      await api(`contents/${path}`, { method: 'PUT', body: JSON.stringify({ message: path, content }) })
        .catch(e => { if (e.status !== 422) throw e; }); // 422: already uploaded
    }
    queue.set(queue.get().filter(p => p !== path));
  }
}

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

async function syncCats() {
  const path = 'contents/categories.json';
  if (catMeta.dirty) {
    const write = sha => api(path, { method: 'PUT', body: JSON.stringify({ message: 'categories', content: b64encode(JSON.stringify(cats, null, 2)), ...(sha && { sha }) }) });
    let res;
    try { res = await write(catMeta.sha); }
    catch (e) {
      if (![404, 409, 422].includes(e.status)) throw e;
      res = await write((await api(path).catch(() => null))?.sha); // changed elsewhere: last write wins
    }
    Object.assign(catMeta, { sha: res.content.sha, dirty: false });
  } else {
    const cur = await api(path).catch(e => { if (e.status === 404) return null; throw e; });
    if (cur && cur.sha !== catMeta.sha) {
      const list = JSON.parse(b64decode(cur.content));
      cats = Array.isArray(list) ? list.filter(c => typeof c?.name === 'string' && /^#[0-9a-f]{6}$/i.test(c.color)) : [];
      catMeta.sha = cur.sha;
    }
  }
  saveCats();
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
    await pushImgs();
    await push();
    await pull();
    await syncCats();
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
