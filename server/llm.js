const faqData = require('../SEED_DATA/epic_vendor_faq.json');

const BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.LLM_API_KEY || '';
const CHAT_MODEL = process.env.LLM_CHAT_MODEL || 'gpt-4o';
const FAST_MODEL = process.env.LLM_FAST_MODEL || 'gpt-4o-mini';

const REASONING_MODELS = /^(gpt-5|o[1-4])/;

const DOMAIN = 'https://support-epic.maxawad.com';

const MAX_RECENT_MESSAGES = 10;

const ALL_SLUGS = new Set();
for (const cat of faqData.categories) {
  for (const entry of cat.entries) {
    ALL_SLUGS.add(entry.source_slug);
  }
}

function isMockMode() {
  return !API_KEY;
}

function buildFaqContext() {
  const sections = [];
  for (const cat of faqData.categories) {
    for (const entry of cat.entries) {
      sections.push(
        `[${cat.title} — ${entry.question}]\n` +
        `Source: ${DOMAIN}/docs/${entry.source_slug}\n` +
        `Answer: ${entry.answer}`
      );
    }
  }
  return sections.join('\n\n---\n\n');
}

function formatRetrievedContext(chunks) {
  if (!chunks || chunks.length === 0) return '';
  return chunks.map(c =>
    `[${c.categoryTitle} — ${c.question}]\n` +
    `Source: ${DOMAIN}/docs/${c.source_slug}\n` +
    `Answer: ${c.answer}`
  ).join('\n\n---\n\n');
}

const BASE_SYSTEM_PROMPT = `You are the Epic Vendor Services Support Copilot — a helpful, professional AI assistant that answers questions using official FAQ documentation.

RULES:
1. Answer based on the RETRIEVED FAQ CONTEXT provided below. Do not invent information about Epic systems or processes. If the retrieved context does not contain the answer, say so and suggest contacting support.
2. When answering FAQ-related questions, ALWAYS cite your source(s). Format each source as: [Source Title](URL)
3. If the user asks about password resets, account access, or admin tasks — these are ALWAYS about their **Epic Vendor Services** account. Direct them to their Epic organization administrator. NEVER assume they mean their employer's IT system. NEVER invent reset steps.
4. If the information is missing or ambiguous, ask a clarifying question before giving a definitive answer.
5. Be concise but thorough. Use bullet points or numbered lists for multi-step processes.
6. If the question is completely outside the FAQ scope, say so politely and suggest contacting support.
7. If the user asks a question about themselves (e.g. "where do I work?", "what's my name?") and you have USER CONTEXT from session memory, answer using that context. These are conversational questions — no FAQ citation is needed.
8. At the end of your response, include a SOURCES section listing all FAQ entries you referenced, formatted as:

SOURCES:
- [Title](URL)

If no FAQ sources were used (e.g. you answered from memory or conversation context), omit the SOURCES section entirely.`;

function buildSystemPrompt(retrievedChunks, memories, conversationSummary) {
  let prompt = BASE_SYSTEM_PROMPT;

  const context = formatRetrievedContext(retrievedChunks);
  if (context) {
    prompt += `\n\nRETRIEVED FAQ CONTEXT (most relevant entries for this query):\n${context}`;
  } else {
    prompt += '\n\nRETRIEVED FAQ CONTEXT:\n(No matching FAQ entries found for this query.)';
  }

  if (conversationSummary) {
    prompt += `\n\nCONVERSATION SUMMARY (earlier messages):\n${conversationSummary}`;
  }

  if (memories && memories.length > 0) {
    prompt += '\n\nUSER CONTEXT (from session memory):\n' +
      memories.map(m => `- ${m}`).join('\n') +
      '\n\nUse this context to personalize your responses when relevant.';
  }

  return prompt;
}

async function summarizeConversation(messages) {
  if (isMockMode()) {
    return messages.map(m => `${m.role}: ${m.content.slice(0, 100)}`).join('; ');
  }

  const prompt = `Summarize the following conversation between a user and a support copilot into a brief paragraph (2-4 sentences). Preserve key facts, decisions, and any user preferences mentioned.\n\n` +
    messages.map(m => `${m.role === 'user' ? 'User' : 'Copilot'}: ${m.content}`).join('\n\n');

  try {
    const isReasoningFast = REASONING_MODELS.test(FAST_MODEL);
    const body = {
      model: FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
    };
    if (isReasoningFast) {
      body.max_completion_tokens = 512;
    } else {
      body.temperature = 0.2;
      body.max_tokens = 256;
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function windowConversation(messages) {
  if (messages.length <= MAX_RECENT_MESSAGES) {
    return { summary: null, recentMessages: messages };
  }

  const cutoff = messages.length - MAX_RECENT_MESSAGES;
  const olderMessages = messages.slice(0, cutoff);
  const recentMessages = messages.slice(cutoff);

  const summary = await summarizeConversation(olderMessages);
  return { summary, recentMessages };
}

async function chatCompletion(messages, memories = [], retrievedChunks = []) {
  const { summary, recentMessages } = await windowConversation(messages);

  const systemContent = buildSystemPrompt(retrievedChunks, memories, summary);

  const fullMessages = [
    { role: 'system', content: systemContent },
    ...recentMessages
  ];

  if (isMockMode()) {
    return mockChatResponse(messages[messages.length - 1]?.content || '', retrievedChunks, memories);
  }

  const isReasoning = REASONING_MODELS.test(CHAT_MODEL);
  const body = {
    model: CHAT_MODEL,
    messages: fullMessages,
  };

  if (isReasoning) {
    body.max_completion_tokens = 16384;
  } else {
    body.temperature = 0.3;
    body.max_tokens = 2048;
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (!content && data.usage) {
    const rt = data.usage.completion_tokens_details?.reasoning_tokens || 0;
    const ct = data.usage.completion_tokens || 0;
    console.warn(`[llm] Empty content — reasoning_tokens=${rt}, completion_tokens=${ct}, finish_reason=${data.choices?.[0]?.finish_reason}`);
  }

  return content;
}

async function extractMemories(userMessage, existingMemories = []) {
  const prompt = `Analyze the following user message and determine if it contains any personal facts, preferences, or context worth remembering for future conversations.

Existing memories:
${existingMemories.length > 0 ? existingMemories.map(m => `- ${m}`).join('\n') : '(none)'}

User message: "${userMessage}"

If the message contains memorable facts, respond with a JSON array of new memory strings written in third person (e.g. "The user works at a hospital", "The user is interested in billing reports"). Only include NEW information not already in existing memories.

If there is nothing worth remembering, respond with an empty JSON array: []

Respond with ONLY the JSON array, no other text.`;

  if (isMockMode()) {
    return [];
  }

  try {
    const isReasoningFast = REASONING_MODELS.test(FAST_MODEL);
    const memBody = {
      model: FAST_MODEL,
      messages: [{ role: 'user', content: prompt }],
    };
    if (isReasoningFast) {
      memBody.max_completion_tokens = 1024;
    } else {
      memBody.temperature = 0;
      memBody.max_tokens = 256;
    }

    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(memBody),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    const match = content.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed.filter(m => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

function mockChatResponse(query, retrievedChunks = [], memories = []) {
  const q = query.toLowerCase();

  if (memories.length > 0) {
    const personalKeywords = ['my name', 'who am i', 'where do i work', 'what do i do', 'my job', 'about me'];
    if (personalKeywords.some(kw => q.includes(kw))) {
      return 'Based on what I remember about you:\n\n' +
        memories.map(m => `- ${m}`).join('\n');
    }
  }

  if (retrievedChunks && retrievedChunks.length > 0) {
    const best = retrievedChunks[0];
    let response = best.answer + '\n\n' +
      `For more details, you can refer to the source: [${best.categoryTitle} — ${best.question}](${DOMAIN}/docs/${best.source_slug})`;

    response += '\n\nSOURCES:\n' + retrievedChunks.map(c =>
      `- [${c.question}](${DOMAIN}/docs/${c.source_slug})`
    ).join('\n');

    return response;
  }

  return "I don't have specific information about that in my FAQ knowledge base. Could you try rephrasing your question, or would you like me to help with one of these topics?\n\n" +
    "- Authentication & account access\n- Billing & invoices\n- Claims & submissions\n- Reporting & analytics\n- Training & learning resources\n- Technical support\n\n" +
    "If your question is outside these areas, I recommend contacting support directly.";
}

function parseSources(responseText) {
  const sources = [];
  const sourceRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const sourcesSection = responseText.split(/SOURCES:/i)[1] || responseText;

  let match;
  while ((match = sourceRegex.exec(sourcesSection)) !== null) {
    const title = match[1];
    const url = match[2];
    if (url.includes('support-epic.maxawad.com/docs/')) {
      sources.push({ title, url });
    }
  }

  const seen = new Set();
  return sources.filter(s => {
    const key = s.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateSources(sources) {
  return sources.filter(s => {
    const slug = s.url
      .replace('https://support-epic.maxawad.com/docs/', '')
      .replace('http://support-epic.maxawad.com/docs/', '');
    return ALL_SLUGS.has(slug);
  });
}

module.exports = {
  chatCompletion,
  extractMemories,
  parseSources,
  validateSources,
  isMockMode,
  buildFaqContext,
  windowConversation,
  MAX_RECENT_MESSAGES,
};
