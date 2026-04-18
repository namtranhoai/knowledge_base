import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalize,
  tokenize,
  summarize,
  extractKeywords,
  scorePageQuality,
  rankPages,
  get3DChartRows,
} from './core.js';

test('normalize removes accents and lowercases', () => {
  assert.equal(normalize('Tối Ưu Hóa'), 'toi uu hoa');
});

test('tokenize removes punctuation and short tokens', () => {
  assert.deepEqual(tokenize('AI, eval và QA!'), ['eval']);
});

test('summarize returns compact text', () => {
  const text = 'Cau 1. Cau 2. Cau 3 co them thong tin.';
  assert.ok(summarize(text).includes('Cau 1.'));
});

test('extractKeywords finds frequent terms', () => {
  const keys = extractKeywords('agent agent evaluation evaluation benchmark benchmark benchmark');
  assert.equal(keys[0], 'benchmark');
});

test('scorePageQuality remains within range', () => {
  const q = scorePageQuality('abc '.repeat(40), ['a', 'b', 'c']);
  assert.ok(q >= 1 && q <= 100);
});

test('rankPages ranks most relevant page first', () => {
  const pages = [
    { id: 'p1', sourceId: 's1', title: 'Agent eval', summary: 'offline benchmark', keywords: ['agent', 'benchmark'], quality: 80 },
    { id: 'p2', sourceId: 's2', title: 'Cooking', summary: 'food recipe', keywords: ['food'], quality: 40 },
  ];
  const sources = [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }];
  const { scored } = rankPages({ pages, sources, question: 'agent benchmark', topK: 2, mode: 'balanced' });
  assert.equal(scored[0].page.id, 'p1');
});

test('get3DChartRows returns sorted values', () => {
  const pages = [
    { title: 'A', sourceId: 's1', quality: 20, keywords: ['x'] },
    { title: 'B', sourceId: 's2', quality: 80, keywords: ['x', 'y'] },
  ];
  const sources = [{ id: 's1', length: 100 }, { id: 's2', length: 50 }];
  const rows = get3DChartRows({ pages, sources, metric: 'quality', limit: 8 });
  assert.equal(rows[0].title, 'B');
});


test('rankPages strict mode filters weak matches', () => {
  const pages = [
    { id: 'p1', sourceId: 's1', title: 'Agent eval', summary: 'offline benchmark rollout', keywords: ['agent', 'benchmark'], quality: 80 },
    { id: 'p2', sourceId: 's2', title: 'Random', summary: 'unrelated words only', keywords: ['other'], quality: 90 },
  ];
  const sources = [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }];
  const { scored } = rankPages({ pages, sources, question: 'agent benchmark rollout latency', mode: 'strict', topK: 5 });
  assert.equal(scored.length, 1);
  assert.equal(scored[0].page.id, 'p1');
});
