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
  buildTimelineBuckets,
  jaccardTrigramSimilarity,
  bestTokenSimilarity,
  sanitizeImportedState,
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


test('buildTimelineBuckets groups log lines by type', () => {
  const logs = [
    '[2026-04-18] INGEST | abc',
    '[2026-04-18] QUERY | q1',
    '[2026-04-18] QUERY | q2',
    '[17/04/2026] EDIT | something',
  ];
  const rows = buildTimelineBuckets(logs, 2, new Date('2026-04-18T12:00:00Z'));
  assert.equal(rows.length, 2);
  assert.equal(rows[1].ingest, 1);
  assert.equal(rows[1].query, 2);
});


test('jaccard trigram similarity detects close words', () => {
  const sim = jaccardTrigramSimilarity('benchmark', 'benchmrk');
  assert.ok(sim > 0.3);
});

test('rankPages supports fuzzy matching typo query', () => {
  const pages = [
    { id: 'p1', sourceId: 's1', title: 'Benchmark setup', summary: 'evaluation harness', keywords: ['benchmark'], quality: 80 },
  ];
  const sources = [{ id: 's1', title: 'A' }];
  const { scored } = rankPages({ pages, sources, question: 'benchmrk', mode: 'balanced', topK: 1, fuzzyBoost: 0.9 });
  assert.equal(scored.length, 1);
});

test('bestTokenSimilarity returns max candidate score', () => {
  const best = bestTokenSimilarity('latncy', ['latency', 'quality', 'topic']);
  assert.ok(best > 0.2);
});


test('sanitizeImportedState normalizes malformed payload', () => {
  const payload = {
    sources: [{ id: 1, title: 99, content: 42 }],
    pages: [{ id: 2, sourceId: 'missing', title: 'Page', summary: null, keywords: ['a', 2] }],
    log: [1, null, 'ok'],
  };
  const out = sanitizeImportedState(payload, { maxSources: 10, maxPages: 10, maxLogs: 10 });
  assert.equal(out.sources.length, 1);
  assert.equal(typeof out.sources[0].title, 'string');
  assert.equal(out.pages[0].sourceId, out.sources[0].id);
  assert.ok(out.warnings.length >= 1);
});
