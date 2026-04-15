const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

delete process.env.LLM_API_KEY;
const { extractMemories, parseSources, validateSources } = require('../server/llm');

describe('Memory System', () => {

  describe('extractMemories (mock mode)', () => {
    it('returns empty array in mock mode', async () => {
      const result = await extractMemories('I work at a hospital', []);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });
  });

  describe('parseSources', () => {
    it('extracts sources from response text', () => {
      const text = `Here is the answer.

SOURCES:
- [Password Reset](https://support-epic.maxawad.com/docs/authentication/password-reset)
- [Login Help](https://support-epic.maxawad.com/docs/authentication/login-troubleshooting)`;

      const sources = parseSources(text);
      assert.equal(sources.length, 2);
      assert.equal(sources[0].title, 'Password Reset');
      assert.ok(sources[0].url.includes('password-reset'));
    });

    it('deduplicates sources by URL', () => {
      const text = `First mention [Reset](https://support-epic.maxawad.com/docs/authentication/password-reset) and again [Reset](https://support-epic.maxawad.com/docs/authentication/password-reset)

SOURCES:
- [Reset](https://support-epic.maxawad.com/docs/authentication/password-reset)`;

      const sources = parseSources(text);
      assert.equal(sources.length, 1);
    });

    it('ignores non-domain URLs', () => {
      const text = `Check [Google](https://google.com) for more info.

SOURCES:
- [External](https://example.com/page)`;

      const sources = parseSources(text);
      assert.equal(sources.length, 0);
    });

    it('returns empty array for no sources', () => {
      const sources = parseSources('Just a plain response with no links.');
      assert.deepEqual(sources, []);
    });

    it('handles response that is only a SOURCES section', () => {
      const text = `SOURCES:
- [Password Reset](https://support-epic.maxawad.com/docs/authentication/password-reset)`;
      const sources = parseSources(text);
      assert.equal(sources.length, 1);
    });

    it('extracts sources from inline markdown links before SOURCES section', () => {
      const text = `See [Password Reset](https://support-epic.maxawad.com/docs/authentication/password-reset) for details.

SOURCES:
- [Password Reset](https://support-epic.maxawad.com/docs/authentication/password-reset)`;
      const sources = parseSources(text);
      assert.equal(sources.length, 1, 'should deduplicate across inline and SOURCES section');
    });

    it('handles empty string', () => {
      const sources = parseSources('');
      assert.deepEqual(sources, []);
    });
  });

  describe('validateSources', () => {
    it('passes valid FAQ slugs through', () => {
      const sources = [
        { title: 'Password Reset', url: 'https://support-epic.maxawad.com/docs/authentication/password-reset' },
        { title: 'Invoices', url: 'https://support-epic.maxawad.com/docs/billing/invoices' },
      ];
      const valid = validateSources(sources);
      assert.equal(valid.length, 2);
    });

    it('strips hallucinated slugs', () => {
      const sources = [
        { title: 'Password Reset', url: 'https://support-epic.maxawad.com/docs/authentication/password-reset' },
        { title: 'Fake Page', url: 'https://support-epic.maxawad.com/docs/fake/does-not-exist' },
      ];
      const valid = validateSources(sources);
      assert.equal(valid.length, 1);
      assert.equal(valid[0].title, 'Password Reset');
    });

    it('returns empty for all-invalid sources', () => {
      const sources = [
        { title: 'Fake', url: 'https://support-epic.maxawad.com/docs/nonexistent/page' },
      ];
      const valid = validateSources(sources);
      assert.deepEqual(valid, []);
    });

    it('handles empty sources array', () => {
      const valid = validateSources([]);
      assert.deepEqual(valid, []);
    });
  });
});
