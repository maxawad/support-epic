const path = require('path');
const fs = require('fs');

async function main() {
  // Load .env manually (no dotenv dependency)
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env is optional */ }

  const express = (await import('express')).default;
  const { chatCompletion, extractMemories, parseSources, validateSources, isMockMode } = require('./llm');
  const { getAllCategories, getEntriesByCategory, getEntryBySlug, searchEntries } = require('./retrieval');
  const { buildFaqStore, rankMemories } = require('./embeddings');
  const { readProjectFile, listProjectStructure, isInfrastructureQuery } = require('./sandbox');
  const { trackChatMessage, trackChatError, trackMemoryExtraction, trackEditMessage, trackEditBlock, trackEditError, trackDocView, trackDocSearch, getStats } = require('./stats');

  const faqData = require('../SEED_DATA/epic_vendor_faq.json');
  const DOMAIN = 'https://support-epic.maxawad.com';
  const RAG_TOP_K = parseInt(process.env.RAG_TOP_K, 10) || 4;
  const MEMORY_TOP_K = parseInt(process.env.MEMORY_TOP_K, 10) || 3;

  const EDIT_DURATION_MS = parseInt(process.env.EDIT_DURATION_MS, 10) || (2 * 60 * 60 * 1000);
  const EDIT_START_TIME = Date.now();

  const faqStore = buildFaqStore(faqData, DOMAIN);
  console.log(`[rag] FAQ vector store built — ${faqData.categories.reduce((a, c) => a + c.entries.length, 0)} entries indexed`);
  console.log(`[edit] Session active until ${new Date(EDIT_START_TIME + EDIT_DURATION_MS).toISOString()} (${EDIT_DURATION_MS / 60000}min)`);

  const app = express();
  const PORT = process.env.PORT || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  function isEditExpired() {
    return Date.now() > EDIT_START_TIME + EDIT_DURATION_MS;
  }

  // --- API Routes ---

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mock: isMockMode(), rag: true, edit: !isEditExpired(), timestamp: new Date().toISOString() });
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
    const q = req.query.q || '';
    trackDocSearch();
    res.json(searchEntries(q));
  });

  app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    try {
      const { messages, memories } = req.body;
      const sessionId = req.headers['x-session-id'] || req.ip;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array is required' });
      }

      const lastMsg = messages[messages.length - 1];
      if (!lastMsg?.content || lastMsg.content.trim().length === 0) {
        return res.status(400).json({ error: 'Last message content cannot be empty' });
      }

      const userQuery = lastMsg.content;

      const retrievedChunks = faqStore.query(userQuery, RAG_TOP_K);
      console.log(`[rag] Query: "${userQuery.slice(0, 80)}..." → ${retrievedChunks.length} chunks (scores: ${retrievedChunks.map(c => c.score.toFixed(3)).join(', ')})`);

      const relevantMemories = rankMemories(userQuery, memories || [], MEMORY_TOP_K);

      const [responseText, newMemories] = await Promise.all([
        chatCompletion(messages, relevantMemories, retrievedChunks),
        extractMemories(lastMsg.content, memories || []),
      ]);

      const raw = responseText || '';
      const rawSources = parseSources(raw);
      const sources = validateSources(rawSources);
      const cleanResponse = raw.replace(/\n*SOURCES:\n[\s\S]*$/, '').trim();

      if (rawSources.length !== sources.length) {
        console.warn(`[rag] Stripped ${rawSources.length - sources.length} hallucinated source(s)`);
      }

      if (!cleanResponse) {
        console.warn('[chat] Empty response after cleanup. Raw length:', raw.length, 'Raw preview:', raw.slice(0, 200));
      }

      const elapsed = Date.now() - startTime;
      trackChatMessage(elapsed, sessionId);
      if (newMemories && newMemories.length > 0) trackMemoryExtraction(newMemories.length);

      res.json({
        response: cleanResponse || 'I\'m sorry, I wasn\'t able to generate a response. Please try rephrasing your question.',
        sources,
        newMemories,
      });
    } catch (err) {
      console.error('Chat error:', err.message || err);
      trackChatError();
      res.status(500).json({ error: 'Failed to generate response. Please try again.' });
    }
  });

  // --- Edit / Code Explorer ---

  app.get('/edit', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'edit.html'));
  });

  app.get('/api/edit/status', (_req, res) => {
    if (isEditExpired()) {
      return res.json({ expired: true, remainingMs: 0 });
    }
    const elapsed = Date.now() - EDIT_START_TIME;
    res.json({ expired: false, remainingMs: EDIT_DURATION_MS - elapsed });
  });

  app.post('/api/edit/chat', async (req, res) => {
    if (isEditExpired()) {
      return res.json({ error: 'expired', response: 'This editing session has expired.' });
    }

    try {
      const { messages } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'bad_request', response: 'messages array is required' });
      }

      const lastMsg = messages[messages.length - 1];
      if (!lastMsg?.content || lastMsg.content.trim().length === 0) {
        return res.status(400).json({ error: 'bad_request', response: 'Message cannot be empty' });
      }

      const userQuery = lastMsg.content;

      if (isInfrastructureQuery(userQuery)) {
        console.log(`[edit:blocked] "${userQuery.slice(0, 100)}"`);
        trackEditBlock();
        return res.json({
          error: 'blocked',
          response: 'This question is about infrastructure, API keys, or resources outside this project. That information is not available in this sandbox.\n\nFor more advanced capabilities, visit [codingschool.dev](https://codingschool.dev).',
        });
      }

      const projectTree = listProjectStructure();
      const treeStr = projectTree.map(f =>
        f.type === 'directory' ? `${f.name}/` : f.name
      ).join('\n');

      let fileContext = '';
      const filePatterns = [
        /(?:show|read|open|display|cat|view)\s+(?:me\s+)?(.+)/i,
        /(?:what(?:'s| is) in)\s+(.+)/i,
        /^(server\/[\w./-]+|public\/[\w./-]+|tests\/[\w./-]+|SEED_DATA\/[\w./-]+|[\w]+\.\w+)$/i,
      ];

      for (const pattern of filePatterns) {
        const match = userQuery.match(pattern);
        if (match) {
          const filePath = match[1].trim().replace(/[`'"]/g, '');
          const result = readProjectFile(filePath);
          if (result.type === 'file') {
            fileContext = `\n\nFILE CONTENT (${filePath}):\n\`\`\`\n${result.content}\n\`\`\``;
          } else if (result.type === 'directory') {
            fileContext = `\n\nDIRECTORY LISTING (${filePath}):\n` +
              result.entries.map(e => e.type === 'directory' ? `${e.name}/` : e.name).join('\n');
          }
          break;
        }
      }

      const systemPrompt = `You are a code explorer for the Epic Vendor Services Support Copilot project. You help users understand, browse, and suggest edits to this codebase.

RULES:
1. You can ONLY discuss files within THIS project. Never reference other repos, servers, or infrastructure.
2. When showing file contents, use markdown code blocks with the filename.
3. You can suggest code changes but cannot execute them. Show diffs or proposed code.
4. If asked about API keys, credentials, .env files, deployment infrastructure, or anything outside this project — refuse and say it's not available in this sandbox. Link to codingschool.dev for more.
5. Be helpful, concise, and technical. Assume the user is a developer.
6. When referencing project structure, use the tree provided below.

PROJECT STRUCTURE:
${treeStr}${fileContext}`;

      const recentMessages = messages.slice(-10);
      const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
      ];

      const FAST_MODEL = process.env.LLM_FAST_MODEL || 'gpt-4o-mini';
      const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
      const API_KEY = process.env.LLM_API_KEY || '';

      if (!API_KEY) {
        return res.json({ response: 'LLM is not configured. Running in mock mode.' });
      }

      const REASONING_MODELS = /^(gpt-5|o[1-4])/;
      const isReasoning = REASONING_MODELS.test(FAST_MODEL);
      const body = {
        model: FAST_MODEL,
        messages: fullMessages,
      };

      if (isReasoning) {
        body.max_completion_tokens = 4096;
      } else {
        body.temperature = 0.3;
        body.max_tokens = 2048;
      }

      const llmRes = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify(body),
      });

      if (!llmRes.ok) {
        const errBody = await llmRes.text();
        console.error(`[edit:llm] Error ${llmRes.status}:`, errBody);
        throw new Error(`LLM error ${llmRes.status}`);
      }

      const llmData = await llmRes.json();
      const content = llmData.choices?.[0]?.message?.content || '';

      if (!content) {
        console.warn('[edit] Empty LLM response');
      }

      trackEditMessage();
      res.json({
        response: content || 'I wasn\'t able to generate a response. Please try rephrasing.',
      });

    } catch (err) {
      console.error('[edit:error]', err.message || err);
      trackEditError();
      res.status(500).json({ error: 'server_error', response: 'Failed to process request. Please try again.' });
    }
  });

  // --- Stats ---
  app.get('/stats', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'stats.html'));
  });

  app.get('/api/stats', (_req, res) => {
    res.json(getStats());
  });

  // --- Documentation pages (our hosted clone) ---
  app.get('/docs', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'docs', 'index.html'));
  });

  app.get('/docs/:category/:slug', (req, res) => {
    const fullSlug = `${req.params.category}/${req.params.slug}`;
    const entry = getEntryBySlug(fullSlug);
    if (!entry) {
      return res.status(404).sendFile(path.join(__dirname, '..', 'public', 'docs', '404.html'));
    }
    trackDocView();
    res.type('html').send(renderDocPage(entry));
  });

  function renderDocPage(entry) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${entry.question} — Epic Vendor Services Docs</title>
  <meta property="og:title" content="${entry.question}">
  <meta property="og:description" content="${entry.answer.slice(0, 160)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://support-epic.maxawad.com/docs/${entry.source_slug}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #f8f9fb; color: #1a1a2e; line-height: 1.7; }
    .doc-container { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
    .breadcrumb { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
    .breadcrumb a { color: #5b4cd4; text-decoration: none; }
    .breadcrumb a:hover { text-decoration: underline; }
    .doc-category { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #5b4cd4; background: #ede9fe; padding: 4px 12px; border-radius: 20px; margin-bottom: 16px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 24px; line-height: 1.3; }
    .doc-answer { font-size: 16px; background: #fff; padding: 32px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .back-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 32px; color: #5b4cd4; text-decoration: none; font-weight: 500; }
    .back-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="doc-container">
    <div class="breadcrumb">
      <a href="/">Home</a> / <a href="/#docs">Docs</a> / <a href="/#docs">${entry.categoryTitle}</a>
    </div>
    <div class="doc-category">${entry.categoryIcon} ${entry.categoryTitle}</div>
    <h1>${entry.question}</h1>
    <div class="doc-answer">${entry.answer}</div>
    <a class="back-link" href="/#docs">← Back to Documentation</a>
  </div>
</body>
</html>`;
  }

  app.listen(PORT, HOST, () => {
    console.log(`\n  Epic Vendor Services Support Copilot`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://${HOST}:${PORT}`);
    console.log(`  Mode:    ${isMockMode() ? 'MOCK (no API key)' : 'LIVE (' + (process.env.LLM_CHAT_MODEL || 'gpt-4o') + ')'}`);
    console.log(`  RAG:     top-${RAG_TOP_K} retrieval, memory top-${MEMORY_TOP_K}`);
    console.log(`  Edit:    http://localhost:${PORT}/edit (expires ${new Date(EDIT_START_TIME + EDIT_DURATION_MS).toLocaleTimeString()})`);
    console.log();
  });
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
