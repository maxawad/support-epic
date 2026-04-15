const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

let server;
let baseUrl;

async function startServer() {
  delete process.env.LLM_API_KEY;
  process.env.PORT = '0';

  const express = (await import('express')).default;
  const { chatCompletion, extractMemories, parseSources, validateSources, isMockMode } = require('../server/llm');
  const { getAllCategories, getEntriesByCategory, getEntryBySlug, searchEntries } = require('../server/retrieval');
  const { buildFaqStore, rankMemories } = require('../server/embeddings');

  const faqData = require('../SEED_DATA/epic_vendor_faq.json');
  const DOMAIN = 'https://support-epic.maxawad.com';
  const faqStore = buildFaqStore(faqData, DOMAIN);

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mock: isMockMode(), rag: true });
  });

  app.get('/api/faq/categories', (_req, res) => {
    res.json(getAllCategories());
  });

  app.get('/api/faq/category/:id', (req, res) => {
    const cat = getEntriesByCategory(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    res.json(cat);
  });

  app.get('/api/faq/search', (req, res) => {
    res.json(searchEntries(req.query.q || ''));
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { messages, memories } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
      }
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg?.content || lastMsg.content.trim().length === 0) {
        return res.status(400).json({ error: 'Last message content cannot be empty' });
      }

      const userQuery = lastMsg.content;
      const retrievedChunks = faqStore.query(userQuery, 4);
      const relevantMemories = rankMemories(userQuery, memories || [], 3);

      const [responseText, newMemories] = await Promise.all([
        chatCompletion(messages, relevantMemories, retrievedChunks),
        extractMemories(lastMsg.content, memories || []),
      ]);
      const raw = responseText || '';
      const rawSources = parseSources(raw);
      const sources = validateSources(rawSources);
      const cleanResponse = raw.replace(/\n*SOURCES:\n[\s\S]*$/, '').trim();
      res.json({
        response: cleanResponse || "I'm sorry, I wasn't able to generate a response.",
        sources,
        newMemories,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate response.' });
    }
  });

  app.get('/docs/:category/:slug', (req, res) => {
    const fullSlug = `${req.params.category}/${req.params.slug}`;
    const entry = getEntryBySlug(fullSlug);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
  });

  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

async function chat(messages, memories = []) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, memories }),
  });
  return { status: res.status, data: await res.json() };
}

describe('End-to-End Chat Tests (RAG)', () => {
  before(async () => {
    await startServer();
  });

  after(() => {
    if (server) server.close();
  });

  // ── Basic conversation flows ──

  describe('Single-turn FAQ queries with retrieval', () => {
    it('answers a password reset question with sources', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'How do I reset my password?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.length > 20, 'response should be substantial');
      assert.ok(data.response.toLowerCase().includes('admin') || data.response.toLowerCase().includes('administrator'),
        'should mention administrator');
      assert.ok(data.sources.length > 0, 'should have at least one source');
      assert.ok(data.sources[0].url.includes('support-epic.maxawad.com/docs/'),
        'source URL should point to our domain');
    });

    it('answers a billing question with relevant retrieval', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'How do I view my invoices?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.toLowerCase().includes('invoice') || data.response.toLowerCase().includes('billing'),
        'should mention invoices or billing');
      assert.ok(data.sources.length > 0, 'should have sources');
    });

    it('answers a claims question', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'How do I submit a new claim?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.toLowerCase().includes('claim'), 'should mention claims');
    });

    it('answers a support contact question', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'How do I contact technical support?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.length > 30, 'should give a detailed answer');
    });

    it('answers a reporting question', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'How do I generate a usage report?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.toLowerCase().includes('report'), 'should mention reports');
    });
  });

  describe('Multi-part queries', () => {
    it('handles a question spanning two topics', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'I want to reset my password and also view my invoices' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.length > 20, 'should not be empty');
      assert.notEqual(data.response, "I'm sorry, I wasn't able to generate a response.",
        'should not return fallback error');
    });

    it('handles a long descriptive question', async () => {
      const { status, data } = await chat([
        { role: 'user', content: "I'd love to be able to reset my password so I'm able to access my account. Also, tell me more about what epic vendor services are" },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.length > 20, 'should produce a real answer');
    });
  });

  // ── Multi-turn conversation ──

  describe('Multi-turn conversations', () => {
    it('handles a two-message conversation', async () => {
      const msg1 = [{ role: 'user', content: 'How do I reset my password?' }];
      const r1 = await chat(msg1);
      assert.equal(r1.status, 200);

      const msg2 = [
        ...msg1,
        { role: 'assistant', content: r1.data.response },
        { role: 'user', content: 'What if my account is locked?' },
      ];
      const r2 = await chat(msg2);
      assert.equal(r2.status, 200);
      assert.ok(r2.data.response.length > 20);
    });

    it('handles three sequential messages building context', async () => {
      const messages = [{ role: 'user', content: 'What training resources are available?' }];
      const r1 = await chat(messages);
      assert.equal(r1.status, 200);

      messages.push(
        { role: 'assistant', content: r1.data.response },
        { role: 'user', content: 'Is there a certification program?' },
      );
      const r2 = await chat(messages);
      assert.equal(r2.status, 200);

      messages.push(
        { role: 'assistant', content: r2.data.response },
        { role: 'user', content: 'How about product updates?' },
      );
      const r3 = await chat(messages);
      assert.equal(r3.status, 200);
      assert.ok(r3.data.response.length > 20);
    });
  });

  // ── Memory integration ──

  describe('Memory in chat context (with relevance filtering)', () => {
    it('accepts memories without crashing', async () => {
      const { status, data } = await chat(
        [{ role: 'user', content: 'How do I view my invoices?' }],
        ['The user works in the billing department', 'The user works at a hospital'],
      );
      assert.equal(status, 200);
      assert.ok(data.response.length > 20);
    });

    it('handles empty memories array', async () => {
      const { status, data } = await chat(
        [{ role: 'user', content: 'How do I view my invoices?' }],
        [],
      );
      assert.equal(status, 200);
      assert.ok(data.response.length > 20);
    });

    it('returns newMemories as array', async () => {
      const { data } = await chat(
        [{ role: 'user', content: 'I work at Chipotle and need help with billing' }],
      );
      assert.ok(Array.isArray(data.newMemories), 'newMemories should be an array');
    });
  });

  // ── Source citation validation ──

  describe('Source citations (validated against FAQ slugs)', () => {
    it('all source URLs point to support-epic.maxawad.com', async () => {
      const queries = [
        'How do I reset my password?',
        'How do I view my invoices?',
        'How do I submit a claim?',
        'How do I contact support?',
      ];

      for (const q of queries) {
        const { data } = await chat([{ role: 'user', content: q }]);
        for (const src of data.sources) {
          assert.ok(src.url.startsWith('https://support-epic.maxawad.com/docs/'),
            `Source URL for "${q}" should point to our domain, got: ${src.url}`);
        }
      }
    });

    it('source URLs resolve to valid doc pages', async () => {
      const { data } = await chat([
        { role: 'user', content: 'How do I reset my password?' },
      ]);
      assert.ok(data.sources.length > 0);

      for (const src of data.sources) {
        const slug = src.url.replace('https://support-epic.maxawad.com/docs/', '');
        const docRes = await fetch(`${baseUrl}/docs/${slug}`);
        assert.equal(docRes.status, 200,
          `Doc page for slug "${slug}" should return 200`);
      }
    });

    it('all returned sources have valid FAQ slugs', async () => {
      const { getAllSlugs } = require('../server/retrieval');
      const validSlugs = getAllSlugs();

      const { data } = await chat([
        { role: 'user', content: 'How do I reset my password?' },
      ]);
      for (const src of data.sources) {
        const slug = src.url.replace('https://support-epic.maxawad.com/docs/', '');
        assert.ok(validSlugs.has(slug), `"${slug}" should be a valid FAQ slug`);
      }
    });
  });

  // ── Edge cases and error handling ──

  describe('Error handling', () => {
    it('returns 400 for empty messages array', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 for missing messages', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 for whitespace-only message', async () => {
      const { status } = await chat([{ role: 'user', content: '   ' }]);
      assert.equal(status, 400);
    });

    it('handles unrelated off-topic questions gracefully', async () => {
      const { status, data } = await chat([
        { role: 'user', content: 'What is the weather like in Mars?' },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response.length > 10, 'should still give a response');
    });

    it('handles very long input without crashing', async () => {
      const longMessage = 'password '.repeat(200);
      const { status, data } = await chat([
        { role: 'user', content: longMessage },
      ]);
      assert.equal(status, 200);
      assert.ok(data.response, 'should return something');
    });
  });

  // ── FAQ API endpoints ──

  describe('FAQ API integrity', () => {
    it('all 6 categories are present', async () => {
      const res = await fetch(`${baseUrl}/api/faq/categories`);
      const cats = await res.json();
      assert.equal(cats.length, 6);

      const ids = cats.map(c => c.id).sort();
      assert.deepEqual(ids, ['authentication', 'billing', 'claims', 'learning', 'reporting', 'support']);
    });

    it('each category has at least 2 entries', async () => {
      const res = await fetch(`${baseUrl}/api/faq/categories`);
      const cats = await res.json();

      for (const cat of cats) {
        const catRes = await fetch(`${baseUrl}/api/faq/category/${cat.id}`);
        const catData = await catRes.json();
        assert.ok(catData.entries.length >= 2,
          `Category "${cat.id}" should have at least 2 entries, got ${catData.entries.length}`);
      }
    });

    it('search returns scored results', async () => {
      const res = await fetch(`${baseUrl}/api/faq/search?q=password+reset`);
      const results = await res.json();
      assert.ok(results.length > 0, 'should find results for "password reset"');
      assert.ok(results[0].score > 0, 'top result should have a positive score');
      if (results.length > 1) {
        assert.ok(results[0].score >= results[1].score, 'results should be ordered by score');
      }
    });

    it('search returns empty for gibberish', async () => {
      const res = await fetch(`${baseUrl}/api/faq/search?q=zzzzzzzzz`);
      const results = await res.json();
      assert.deepEqual(results, []);
    });
  });

  // ── Static assets ──

  describe('Static assets', () => {
    it('serves the main HTML page', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Epic Vendor Services'), 'should contain app title');
    });

    it('serves app.js', async () => {
      const res = await fetch(`${baseUrl}/app.js`);
      assert.equal(res.status, 200);
    });

    it('serves styles.css', async () => {
      const res = await fetch(`${baseUrl}/styles.css`);
      assert.equal(res.status, 200);
    });
  });

  // ── Response structure contract ──

  describe('Response contract', () => {
    it('chat response has response, sources, and newMemories fields', async () => {
      const { data } = await chat([
        { role: 'user', content: 'How do I reset my password?' },
      ]);
      assert.ok('response' in data, 'should have response field');
      assert.ok('sources' in data, 'should have sources field');
      assert.ok('newMemories' in data, 'should have newMemories field');
      assert.equal(typeof data.response, 'string');
      assert.ok(Array.isArray(data.sources));
      assert.ok(Array.isArray(data.newMemories));
    });

    it('each source has title and url', async () => {
      const { data } = await chat([
        { role: 'user', content: 'How do I view my invoices?' },
      ]);
      for (const src of data.sources) {
        assert.ok(src.title, 'source should have title');
        assert.ok(src.url, 'source should have url');
        assert.equal(typeof src.title, 'string');
        assert.equal(typeof src.url, 'string');
      }
    });

    it('health endpoint returns expected shape with rag flag', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      const data = await res.json();
      assert.ok('status' in data);
      assert.ok('mock' in data);
      assert.ok('rag' in data);
      assert.equal(data.status, 'ok');
      assert.equal(typeof data.mock, 'boolean');
      assert.equal(data.rag, true);
    });
  });
});
