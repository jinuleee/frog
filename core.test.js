// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tags, title, toFile, fromFile, b64encode, b64decode } from './core.js';

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
  const n = { id: 'a', text: '# 안녕\n---\n본문', created: 1, updated: 2, pinned: true, archived: false, trashed: false };
  assert.deepEqual(fromFile('a', toFile(n)), n);
  assert.equal(fromFile('b', '그냥 마크다운').text, '그냥 마크다운');
});

test('base64 survives Korean and emoji bytes', () => {
  const s = '개구리 frog \u{1F438}';
  assert.equal(b64decode(b64encode(s)), s);
  assert.equal(b64decode('7JWI\n64WV'), '안녕'); // GitHub wraps base64 with newlines
});
