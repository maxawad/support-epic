const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

let server;
let baseUrl;

async function startServer() {
  delete process.env.LLM_API_KEY;
  process.env.PORT = '0';

  const express = (await import('express')).default;
  const path = require('path');
  const { chatCompletion, extractMemories, parseSources, validateSources, isMockMode } = require('../server/llm');
  const { getAllCategories, getEntriesByCategory, searchEntries } = require('../server/retrieval');
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

  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

describe('API Integration Tests', () => {

  before(async () => {
    await startServer();
  });

  after(() => {
    if (server) server.close();
  });

  describe('GET /api/health', () => {
    it('returns ok status in mock mode with rag flag', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.equal(data.mock, true);
      assert.equal(data.rag, true);
    });
  });

  describe('GET /api/faq/categories', () => {
    it('returns all categories', async () => {
      const res = await fetch(`${baseUrl}/api/faq/categories`);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.equal(data.length, 6);
    });
  });

  describe('GET /api/faq/category/:id', () => {
    it('returns category entries', async () => {
      const res = await fetch(`${baseUrl}/api/faq/category/billing`);
      const data = await res.json();
      assert.equal(data.id, 'billing');
      assert.ok(data.entries.length >= 3);
    });

    it('returns 404 for unknown category', async () => {
      const res = await fetch(`${baseUrl}/api/faq/category/fake`);
      assert.equal(res.status, 404);
    });
  });

  describe('GET /api/faq/search', () => {
    it('returns results for valid query', async () => {
      const res = await fetch(`${baseUrl}/api/faq/search?q=invoice`);
      const data = await res.json();
      assert.ok(data.length > 0);
    });

    it('returns empty array for no match', async () => {
      const res = await fetch(`${baseUrl}/api/faq/search?q=xyznonexistent`);
      const data = await res.json();
      assert.deepEqual(data, []);
    });
  });

  describe('POST /api/chat', () => {
    it('returns response for valid message (mock mode with RAG)', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'How do I reset my password?' }],
          memories: [],
        }),
      });
      const data = await res.json();
      assert.ok(data.response, 'should have a response');
      assert.ok(data.response.length > 20, 'response should be substantial');
      assert.ok(Array.isArray(data.sources), 'should have sources array');
      assert.ok(Array.isArray(data.newMemories), 'should have newMemories array');
    });

    it('returns 400 for empty messages', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 for missing messages field', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    it('returns 400 for empty message content', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '   ' }],
        }),
      });
      assert.equal(res.status, 400);
    });

    it('handles unrelated questions gracefully in mock mode', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'What is the meaning of life?' }],
          memories: [],
        }),
      });
      const data = await res.json();
      assert.ok(data.response, 'should still return a response');
    });

    it('accepts memories parameter', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'How do I view my invoices?' }],
          memories: ['The user works in the billing department'],
        }),
      });
      const data = await res.json();
      assert.ok(data.response);
    });

    it('returns sources with title and url fields on our domain', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'How do I reset my password?' }],
          memories: [],
        }),
      });
      const data = await res.json();
      assert.ok(Array.isArray(data.sources));
      for (const src of data.sources) {
        assert.ok(src.title, 'source should have title');
        assert.ok(src.url, 'source should have url');
        assert.ok(src.url.includes('support-epic.maxawad.com/docs/'), 'source url should be on our domain');
      }
    });

    it('handles multi-turn conversation', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'How do I reset my password?' },
            { role: 'assistant', content: 'Contact your organization administrator.' },
            { role: 'user', content: 'What if my account is locked?' },
          ],
          memories: [],
        }),
      });
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.ok(data.response.length > 20, 'should provide a substantive follow-up answer');
    });

    it('validated sources are all real FAQ slugs', async () => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'How do I reset my password?' }],
          memories: [],
        }),
      });
      const data = await res.json();
      const { getAllSlugs } = require('../server/retrieval');
      const validSlugs = getAllSlugs();
      for (const src of data.sources) {
        const slug = src.url.replace('https://support-epic.maxawad.com/docs/', '');
        assert.ok(validSlugs.has(slug), `Source slug "${slug}" should be a real FAQ slug`);
      }
    });
  });
});
