import test from 'node:test';
import assert from 'node:assert/strict';
import { editMarkdown, markdownTools, fileCompletion, insertFileLink, filterFiles } from '../src/frontend/lib/markdown-edit';
import { readFileSync } from 'node:fs';

test('file insertion escapes labels, encodes paths and preserves Unicode selection and suffix', () => {
  const result = insertFileLink('前研究😀後', 1, 5, 'w /()', { id: 'r/#()', name: 'ignored' });
  assert.equal(result.text, '前[研究😀](/api/workspaces/w%20%2F%28%29/files/r%2F%23%28%29)後');
  assert.equal(result.start, result.end);
  assert.equal(result.text.slice(result.end), '後');
  assert.equal(insertFileLink('', 0, 0, 'w', { id: 'r', name: '[x]*<a>&' }).text, '[\\[x\\]\\*\\<a\\>\\&](/api/workspaces/w/files/r)'.replace(/\\(?![\\[\]*<>&])/g, '\\'));
});

test('file completion preserves custom Markdown label and trailing text', () => {
  const text = '前[自訂\\*](研究 suffix';
  const end = text.indexOf(' suffix');
  const completion = fileCompletion(text, end);
  assert.equal(completion?.query, '研究');
  const result = insertFileLink(text, end, end, 'w', { id: 'r', name: 'other' }, completion);
  assert.equal(result.text, '前[自訂\\*](/api/workspaces/w/files/r) suffix');
  assert.equal(fileCompletion('[[報告.pdf', 8)?.query, '報告.pdf');
});

test('file hints ignore selection, complete links, images and external URLs', () => {
  for (const text of ['[x](https://example.com', '[x](/api/file', '[x](www.example', '![x](query', '[x](done)', '[[done]]', '`[x](query']) assert.equal(fileCompletion(text, text.length), null, text);
  assert.equal(fileCompletion('[x](query)', 8), null);
  assert.equal(fileCompletion('[[query', 2, 7), null);
});

test('file search stays workspace scoped, uploaded only, current or all tabs', () => {
  const files = [
    { workspace_id: 'w', project_id: 'p', type: 'file', name: '研究ＰＤＦ' },
    { workspace_id: 'w', project_id: 'q', type: 'file', name: '研究pdf' },
    { workspace_id: 'other', project_id: 'p', type: 'file', name: '研究pdf' },
    { workspace_id: 'w', project_id: 'p', type: 'url', name: '研究pdf' },
  ];
  assert.equal(filterFiles(files, 'w', 'p', 'pdf').length, 1);
  assert.equal(filterFiles(files, 'w', '', '研究').length, 2);
});

test('editor wires local draft split preview, accessible icon controls and IME guards', () => {
  const source = readFileSync(new URL('../src/frontend/components/NotesPanel.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('renderMarkdown(content)'));
  assert.ok(source.includes('xl:grid-cols-2'));
  assert.ok(source.includes('mode !== "edit"'));
  assert.ok(source.includes('aria-label={label} title={label}'));
  assert.ok(source.includes('<EditorIcon name={tool} />'));
  assert.ok(source.includes('event.nativeEvent.isComposing'));
  assert.ok(source.includes('compositionEnded.current < 100'));
  assert.ok(source.includes('onBlur={event => remember(event.currentTarget)}'));
});

for (const [tool] of markdownTools) {
  test(`Markdown ${tool}: empty, Unicode selection and multiline selection`, () => {
    for (const value of ['', '研究😀', 'first\n第二行😀']) {
      const result = editMarkdown(value, 0, value.length, tool);
      if (tool === 'rule') assert.equal(result.text, '---\n\n');
      else assert.ok(result.text.length > value.length);
      assert.ok(result.start >= 0);
      assert.ok(result.end >= result.start);
      assert.ok(result.end <= result.text.length);
      if (tool !== 'rule') assert.ok(result.text.includes(value) || value.includes('\n'));
    }
  });
}

test('inline tools preserve surrounding text and select inserted content', () => {
  for (const [tool, marker] of [['bold', '**'], ['italic', '*'], ['strike', '~~'], ['code', '`']] as const) {
    const result = editMarkdown('a研究😀z', 1, 5, tool);
    assert.equal(result.text, `a${marker}研究😀${marker}z`);
    assert.equal(result.text.slice(result.start, result.end), '研究😀');
    const empty = editMarkdown('az', 1, 1, tool);
    assert.equal(empty.text, `a${marker}text${marker}z`);
    assert.equal(empty.text.slice(empty.start, empty.end), 'text');
  }
});

test('links select the URL placeholder', () => {
  const result = editMarkdown('研究😀', 0, 4, 'link');
  assert.equal(result.text, '[研究😀](https://)');
  assert.equal(result.text.slice(result.start, result.end), 'https://');
});

test('line tools expand to whole lines without consuming the next line', () => {
  for (const [tool, expected] of [
    ['heading', '## one\n## two\nthree'], ['bullet', '- one\n- two\nthree'],
    ['number', '1. one\n2. two\nthree'], ['task', '- [ ] one\n- [ ] two\nthree'],
    ['quote', '> one\n> two\nthree'],
  ] as const) assert.equal(editMarkdown('one\ntwo\nthree', 1, 8, tool).text, expected);
  assert.equal(editMarkdown('one\ntwo', 5, 5, 'bullet').text, 'one\n- two');
});

test('code blocks and rules have block boundaries', () => {
  assert.equal(editMarkdown('one\ntwo', 0, 7, 'fence').text, '```\none\ntwo\n```');
  assert.equal(editMarkdown('```', 0, 3, 'fence').text, '````\n```\n````');
  assert.equal(editMarkdown('ab', 1, 1, 'rule').text, 'a\n\n---\n\nb');
  assert.equal(editMarkdown('', 0, 0, 'rule').text, '---\n\n');
});
