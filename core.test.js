// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tags, title, toFile, fromFile, b64encode, b64decode, renderLines, enter, renameTag, removeTag, toggleTodo, openTodos, hasOpenTodo } from './core.js';

// What the editor shows as plain text must equal the note, or the caret drifts.
const plain = html => html.split('</div>').slice(0, -1)
  .map(d => d.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))).join('\n');

test('live markdown keeps the exact text', () => {
  const s = "# 제목 #업무/홈쇼핑\n\n**굵게** _기울임_ `코드` ~~취소~~ a*b*c 2*3*4\n- [ ] 할 일\n- [x] 끝\n1. 하나\n> 인용 <script>\n```\n# 코드 안\n```\n---\nhttps://example.com/?a=1&b='2'";
  assert.equal(plain(renderLines(s)), s);
  assert.match(renderLines('# 제목'), /class="h1"/);
  assert.match(renderLines('**굵게**'), /<b>굵게<\/b>/);
  assert.match(renderLines('- [x] 끝'), /class="task done"/);
  assert.doesNotMatch(renderLines('```\n# 아님\n```'), /h1/);
  assert.doesNotMatch(renderLines('<img src=x onerror=alert(1)>'), /<img/);
});

test('Bear-only syntax: underline, highlight, wiki links, footnotes', () => {
  const s = '~밑줄~ ~~취소~~ ==형광펜== [[회의 메모]] 각주[^1]\n[^1]: 각주 내용 ~~a~~\n~ 혼자 ~ 물결';
  const h = renderLines(s);
  assert.equal(plain(h), s);
  assert.match(h, /<u>밑줄<\/u>/);
  assert.match(h, /<s>취소<\/s>/);
  assert.doesNotMatch(h, /<u>~/);
  assert.match(h, /<mark>형광펜<\/mark>/);
  assert.match(h, /<a class="wiki" data-note="회의 메모">회의 메모<\/a>/);
  assert.match(h, /<sup class="fn" data-fn="1">/);
  assert.match(h, /class="fndef"/);
  assert.equal(h.match(/<u>/g).length, 1); // "~ 혼자 ~" has spaces inside, so it is not underline
});

test('every syntax from the cheat sheet renders', () => {
  const s = "###### 작은 제목\n*기울임* __굵게__ ~~취소~~\n* 별 목록\n+ 더하기 목록\n2. 둘\n>인용\n[네이버](https://naver.com) ![개구리](https://x.com/a_b_c.png)\n위<br>아래\n___\n* * *\n[나쁜](javascript:alert(1)) ![나쁜](javascript:x)\nhttps://a.com/x_y_z_ 끝";
  const h = renderLines(s);
  assert.equal(plain(h), s);
  assert.match(h, /class="h6"/);
  assert.match(h, /<i>기울임<\/i>/);
  assert.match(h, /<b>굵게<\/b>/);
  assert.match(h, /<s>취소<\/s>/);
  assert.equal(h.match(/class="li"/g).length, 3);
  assert.match(h, /class="quote"/);
  assert.match(h, /<a class="url" href="https:\/\/naver.com">네이버<\/a>/);
  assert.match(h, /<img src="https:\/\/x.com\/a_b_c.png" alt="개구리"/);
  assert.match(h, /<\/span><br>아래/);
  assert.equal(h.match(/class="hr"/g).length, 2);
  assert.doesNotMatch(h, /href="javascript|src="javascript/);
  assert.match(h, /href="https:\/\/a.com\/x_y_z_"/); // underscores in a URL are not italics
});

test('enter continues and ends lists', () => {
  assert.deepEqual(enter('- 사과', 4, 4), { text: '- 사과\n- ', at: 7 });
  assert.deepEqual(enter('- [x] 끝', 7, 7), { text: '- [x] 끝\n[] ', at: 11 });
  assert.deepEqual(enter('9. 아홉', 5, 5), { text: '9. 아홉\n10. ', at: 10 });
  assert.deepEqual(enter('- 사과\n- ', 7, 7), { text: '- 사과\n', at: 5 });
  assert.deepEqual(enter('보통 글', 2, 4), { text: '보통\n', at: 3 });
});

test('tags: nested, Korean, not headings or anchors', () => {
  assert.deepEqual(tags('# 제목\n본문 #업무/홈쇼핑 #일기 a#b #업무/홈쇼핑'), ['업무/홈쇼핑', '일기']);
  assert.deepEqual(tags('#todo/'), ['todo']);
  assert.deepEqual(tags('## 소제목'), []);
});

test('title: first line without heading marks', () => {
  assert.equal(title('\n# 회의 메모\n내용'), '회의 메모');
  assert.equal(title('   '), '새 노트');
});

test('file round trip keeps text and meta', () => {
  const n = { id: 'a', text: '# 안녕\n---\n본문', created: 1, updated: 2, pinned: true, archived: false, trashed: false, category: '업무' };
  assert.deepEqual(fromFile('a', toFile(n)), n);
  assert.equal(fromFile('b', '그냥 마크다운').text, '그냥 마크다운');
  assert.equal(fromFile('c', toFile({ ...n, order: 1.5 })).order, 1.5); // hand-made list order survives sync
});

test('base64 survives Korean and emoji bytes', () => {
  const s = '개구리 frog \u{1F438}';
  assert.equal(b64decode(b64encode(s)), s);
  assert.equal(b64decode('7JWI\n64WV'), '안녕'); // GitHub wraps base64 with newlines
});

test('tag manager: rename and remove keep other text', () => {
  const s = '#업무 회의 #업무/홈쇼핑 #업무용 a#업무\n#개인';
  assert.equal(renameTag(s, '업무', '일'), '#일 회의 #일/홈쇼핑 #업무용 a#업무\n#개인');
  assert.equal(removeTag(s, '업무'), ' 회의  #업무용 a#업무\n#개인');
});

test('color text keeps the exact text', () => {
  const s = '{빨강:뉴스} {blue:**굵은 파랑**} {없는색:그대로}';
  const h = renderLines(s);
  assert.equal(plain(h), s);
  assert.match(h, /<span class="c-red">뉴스<\/span>/);
  assert.match(h, /<span class="c-blue">.*<b>굵은 파랑<\/b>/);
  assert.doesNotMatch(h, /c-없는색/);
});

test('todo toggle: [] style, make, check, uncheck; count open ones', () => {
  assert.deepEqual(toggleTodo('장보기\n우유', 5), { text: '장보기\n[] 우유', at: 8 });
  assert.deepEqual(toggleTodo('- 우유', 3), { text: '[] 우유', at: 4 });
  assert.deepEqual(toggleTodo('  [] 우유', 6), { text: '  [x] 우유', at: 7 });
  assert.equal(toggleTodo('[x] 우유', 5).text, '[] 우유');
  assert.equal(toggleTodo('- [ ] 옛 형식', 7).text, '- [x] 옛 형식');
  assert.equal(openTodos('[] a\n[x] b\n  [ ] c\n- [ ] d\n[링크](https://a.com)'), 3);
  assert.equal(hasOpenTodo('[x] done'), false);
});

test('[] renders as a checkbox, links do not', () => {
  assert.match(renderLines('[] 할 일'), /class="task"><span class="box" data-line="0">\[\]<\/span>/);
  assert.match(renderLines('[x] 끝'), /class="task done"/);
  assert.doesNotMatch(renderLines('[](https://a.com) [링크](https://a.com)'), /task/);
  assert.deepEqual(enter('[] 우유', 5, 5), { text: '[] 우유\n[] ', at: 9 });
  assert.deepEqual(enter('[] 우유\n[] ', 9, 9), { text: '[] 우유\n', at: 6 });
});
