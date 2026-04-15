const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getAllCategories, getAllEntries, getEntriesByCategory, getEntryBySlug, searchEntries, getAllSlugs } = require('../server/retrieval');

describe('FAQ Retrieval', () => {

  describe('getAllCategories', () => {
    it('returns all 6 categories', () => {
      const cats = getAllCategories();
      assert.equal(cats.length, 6);
    });

    it('each category has required fields', () => {
      const cats = getAllCategories();
      for (const cat of cats) {
        assert.ok(cat.id, 'category should have id');
        assert.ok(cat.title, 'category should have title');
        assert.ok(cat.icon, 'category should have icon');
        assert.ok(cat.entryCount > 0, 'category should have entries');
      }
    });
  });

  describe('getAllEntries', () => {
    it('returns at least 12 entries (requirement minimum)', () => {
      const entries = getAllEntries();
      assert.ok(entries.length >= 12, `Expected >= 12 entries, got ${entries.length}`);
    });

    it('every entry has a sourceUrl pointing to our domain', () => {
      const entries = getAllEntries();
      for (const entry of entries) {
        assert.ok(entry.sourceUrl.startsWith('https://support-epic.maxawad.com/docs/'),
          `Source URL should point to our domain: ${entry.sourceUrl}`);
      }
    });

    it('every entry has question, answer, and tags', () => {
      const entries = getAllEntries();
      for (const entry of entries) {
        assert.ok(entry.question, 'entry should have question');
        assert.ok(entry.answer, 'entry should have answer');
        assert.ok(Array.isArray(entry.tags), 'entry should have tags array');
        assert.ok(entry.tags.length > 0, 'entry should have at least one tag');
      }
    });
  });

  describe('getEntriesByCategory', () => {
    it('returns entries for a valid category', () => {
      const cat = getEntriesByCategory('authentication');
      assert.ok(cat, 'should return a category');
      assert.equal(cat.id, 'authentication');
      assert.ok(cat.entries.length >= 3, 'authentication should have at least 3 entries');
    });

    it('returns null for invalid category', () => {
      const cat = getEntriesByCategory('nonexistent');
      assert.equal(cat, null);
    });
  });

  describe('getEntryBySlug', () => {
    it('finds entry by source_slug', () => {
      const entry = getEntryBySlug('authentication/password-reset');
      assert.ok(entry, 'should find the entry');
      assert.ok(entry.question.toLowerCase().includes('password'));
    });

    it('returns null for unknown slug', () => {
      const entry = getEntryBySlug('fake/slug');
      assert.equal(entry, null);
    });
  });

  describe('searchEntries', () => {
    it('finds entries matching "password"', () => {
      const results = searchEntries('password');
      assert.ok(results.length > 0, 'should find at least one result');
      const hasPassword = results.some(r =>
        r.question.toLowerCase().includes('password') ||
        r.answer.toLowerCase().includes('password')
      );
      assert.ok(hasPassword, 'results should be relevant to password');
    });

    it('finds entries matching "invoice billing"', () => {
      const results = searchEntries('invoice billing');
      assert.ok(results.length > 0);
    });

    it('returns empty array for empty query', () => {
      const results = searchEntries('');
      assert.deepEqual(results, []);
    });

    it('returns max 5 results', () => {
      const results = searchEntries('the');
      assert.ok(results.length <= 5, 'should cap results at 5');
    });

    it('results are scored with highest relevance first', () => {
      const results = searchEntries('password reset');
      if (results.length >= 2) {
        assert.ok(results[0].score >= results[1].score, 'first result should have highest score');
      }
    });
  });

  describe('getAllSlugs', () => {
    it('returns a Set of all source slugs', () => {
      const slugs = getAllSlugs();
      assert.ok(slugs instanceof Set);
      assert.ok(slugs.size >= 12, `Expected >= 12 slugs, got ${slugs.size}`);
    });

    it('contains known slugs', () => {
      const slugs = getAllSlugs();
      assert.ok(slugs.has('authentication/password-reset'));
      assert.ok(slugs.has('billing/invoices'));
      assert.ok(slugs.has('claims/submit-claim'));
    });

    it('does not contain fake slugs', () => {
      const slugs = getAllSlugs();
      assert.ok(!slugs.has('fake/does-not-exist'));
    });
  });
});
