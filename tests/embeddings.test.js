const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { VectorStore, buildFaqStore, rankMemories, cosineSimilarity, tokenize } = require('../server/embeddings');

describe('Embeddings & Vector Store', () => {

  describe('tokenize', () => {
    it('lowercases and removes stop words', () => {
      const tokens = tokenize('How do I reset my password?');
      assert.ok(!tokens.includes('how'));
      assert.ok(!tokens.includes('do'));
      assert.ok(!tokens.includes('i'));
      assert.ok(!tokens.includes('my'));
      assert.ok(tokens.includes('reset'));
      assert.ok(tokens.includes('password'));
    });

    it('removes punctuation', () => {
      const tokens = tokenize('Hello, world! (test)');
      assert.ok(tokens.includes('hello'));
      assert.ok(tokens.includes('world'));
      assert.ok(tokens.includes('test'));
    });

    it('filters single-character tokens', () => {
      const tokens = tokenize('I am a big cat');
      assert.ok(!tokens.includes('a'));
      assert.ok(tokens.includes('big'));
      assert.ok(tokens.includes('cat'));
    });
  });

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = { a: 1, b: 2, c: 3 };
      assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 0.001);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = { x: 1 };
      const b = { y: 1 };
      assert.equal(cosineSimilarity(a, b), 0);
    });

    it('returns 0 for empty vectors', () => {
      assert.equal(cosineSimilarity({}, {}), 0);
    });

    it('handles partial overlap', () => {
      const a = { x: 1, y: 1 };
      const b = { y: 1, z: 1 };
      const sim = cosineSimilarity(a, b);
      assert.ok(sim > 0 && sim < 1, `Expected 0 < sim < 1, got ${sim}`);
    });
  });

  describe('VectorStore', () => {
    it('throws if queried before build()', () => {
      const store = new VectorStore();
      store.add('test document');
      assert.throws(() => store.query('test'), /not built/i);
    });

    it('returns empty array for empty store', () => {
      const store = new VectorStore();
      store.build();
      const results = store.query('anything');
      assert.deepEqual(results, []);
    });

    it('finds relevant documents', () => {
      const store = new VectorStore();
      store.add('How to reset your password in the admin console', { id: 'pw' });
      store.add('View your monthly invoices and billing statements', { id: 'billing' });
      store.add('Submit a new insurance claim with documentation', { id: 'claims' });
      store.build();

      const results = store.query('password reset');
      assert.ok(results.length > 0, 'should find at least one result');
      assert.equal(results[0].id, 'pw', 'top result should be the password entry');
    });

    it('respects topK parameter', () => {
      const store = new VectorStore();
      for (let i = 0; i < 10; i++) {
        store.add(`document number ${i} about testing`, { id: i });
      }
      store.build();

      const results = store.query('testing document', 3);
      assert.ok(results.length <= 3, `should return at most 3 results, got ${results.length}`);
    });

    it('returns results sorted by score descending', () => {
      const store = new VectorStore();
      store.add('password reset admin console user management', { id: 'exact' });
      store.add('billing invoices payment methods', { id: 'unrelated' });
      store.add('reset your account password', { id: 'partial' });
      store.build();

      const results = store.query('password reset');
      if (results.length >= 2) {
        assert.ok(results[0].score >= results[1].score,
          `scores should be descending: ${results.map(r => r.score.toFixed(3))}`);
      }
    });

    it('preserves metadata in results', () => {
      const store = new VectorStore();
      store.add('test content', { id: 'test-id', category: 'testing', custom: 42 });
      store.build();

      const results = store.query('test content');
      assert.ok(results.length > 0);
      assert.equal(results[0].id, 'test-id');
      assert.equal(results[0].category, 'testing');
      assert.equal(results[0].custom, 42);
    });

    it('filters out zero-score results', () => {
      const store = new VectorStore();
      store.add('apple banana cherry', { id: 'fruit' });
      store.add('car truck motorcycle', { id: 'vehicles' });
      store.build();

      const results = store.query('apple banana');
      const hasVehicles = results.some(r => r.id === 'vehicles');
      assert.ok(!hasVehicles, 'unrelated document should be filtered out');
    });
  });

  describe('buildFaqStore', () => {
    it('builds a store from the real FAQ data', () => {
      const faqData = require('../SEED_DATA/epic_vendor_faq.json');
      const store = buildFaqStore(faqData, 'https://support-epic.maxawad.com');
      assert.ok(store instanceof VectorStore);

      const results = store.query('How do I reset my password?');
      assert.ok(results.length > 0, 'should find password-related entries');
      assert.ok(results[0].source_slug, 'results should have source_slug metadata');
      assert.ok(results[0].question, 'results should have question metadata');
      assert.ok(results[0].answer, 'results should have answer metadata');
    });

    it('retrieves relevant billing entries for billing queries', () => {
      const faqData = require('../SEED_DATA/epic_vendor_faq.json');
      const store = buildFaqStore(faqData, 'https://support-epic.maxawad.com');

      const results = store.query('How do I view my invoices?');
      const hasBilling = results.some(r => r.categoryId === 'billing');
      assert.ok(hasBilling, 'should retrieve billing entries for billing queries');
    });

    it('retrieves relevant auth entries for password queries', () => {
      const faqData = require('../SEED_DATA/epic_vendor_faq.json');
      const store = buildFaqStore(faqData, 'https://support-epic.maxawad.com');

      const results = store.query('password reset account locked');
      const hasAuth = results.some(r => r.categoryId === 'authentication');
      assert.ok(hasAuth, 'should retrieve auth entries for password queries');
    });

    it('retrieves entries for claims submission', () => {
      const faqData = require('../SEED_DATA/epic_vendor_faq.json');
      const store = buildFaqStore(faqData, 'https://support-epic.maxawad.com');

      const results = store.query('submit a new claim');
      const hasClaims = results.some(r => r.categoryId === 'claims');
      assert.ok(hasClaims, 'should retrieve claims entries');
    });

    it('source URLs point to the provided domain', () => {
      const faqData = require('../SEED_DATA/epic_vendor_faq.json');
      const store = buildFaqStore(faqData, 'https://support-epic.maxawad.com');

      const results = store.query('password');
      for (const r of results) {
        assert.ok(r.sourceUrl.startsWith('https://support-epic.maxawad.com/docs/'),
          `sourceUrl should use the provided domain: ${r.sourceUrl}`);
      }
    });
  });

  describe('rankMemories', () => {
    it('returns all memories when count <= topK', () => {
      const memories = ['The user works at Chipotle', 'The user likes billing reports'];
      const ranked = rankMemories('billing', memories, 3);
      assert.equal(ranked.length, 2);
    });

    it('returns empty array for no memories', () => {
      const ranked = rankMemories('test', [], 3);
      assert.deepEqual(ranked, []);
    });

    it('returns empty array for null memories', () => {
      const ranked = rankMemories('test', null, 3);
      assert.deepEqual(ranked, []);
    });

    it('ranks relevant memories higher', () => {
      const memories = [
        'The user works at Chipotle',
        'The user is interested in billing reports and invoice management',
        'The user likes to play chess on weekends',
        'The user has a red car parked outside',
        'The user prefers email communication for billing matters',
      ];
      const ranked = rankMemories('billing invoice payment', memories, 3);
      assert.ok(ranked.length > 0, 'should return at least one memory');
      assert.ok(ranked.length <= 3, 'should respect topK');
      const hasBilling = ranked.some(m => m.includes('billing'));
      assert.ok(hasBilling, 'should include the billing-related memory');
    });

    it('respects topK limit', () => {
      const memories = Array.from({ length: 10 }, (_, i) => `Memory item ${i}`);
      const ranked = rankMemories('test query', memories, 3);
      assert.ok(ranked.length <= 3, `should return at most 3, got ${ranked.length}`);
    });
  });
});
