# Epic Vendor Services — FAQ Support Copilot

An AI-powered support copilot that answers Epic Vendor Services FAQ questions with **source-grounded responses** and **session memory**. Built as a single-page chat application with a browsable documentation reference.

## Live Demo

**https://support-epic.maxawad.com**

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/maxawad/support-epic.git
cd support-epic

# 2. Install dependencies
npm install

# 3. Start the server (API key is pre-configured in .env)
npm start

# 4. Open in browser
open http://localhost:3000
```

A working `.env` with a pre-provisioned API key is included in this repo. The key has a **$10 budget cap** and expires after 30 days. No additional configuration needed — clone, install, run.

Setup time: **< 2 minutes** on a fresh machine with Node.js installed.

### Prerequisites

- **Node.js 18+** (tested on 22.x)
- No other dependencies — no database, no Docker, no build step

## Features

### Chat Support
- Natural language Q&A grounded in the FAQ knowledge base
- Source citations linking to hosted documentation pages
- Quick-action buttons for common queries (Password Reset, View Invoices, etc.)
- Proper domain-correct behavior: password/access questions route to org admins, never invents reset steps
- Asks clarifying questions when information is ambiguous

### Session Memory
- Automatically extracts memorable facts from conversations (e.g. "The user works in the billing department")
- Stored in **localStorage** on the user's device — no server-side tracking
- Memory icon with badge count in the input area
- Side panel to view, manage, and delete individual memories
- Memories are included as context in subsequent queries for personalized responses

### Documentation Browser
- Browsable FAQ organized by category (Authentication, Billing, Claims, Reporting, Learning, Support)
- Search/filter across all documentation
- Expandable Q&A entries with links to dedicated doc pages
- All source URLs point to our hosted domain (`support-epic.maxawad.com/docs/...`)

### Source Grounding
- Every response cites which FAQ entries influenced the answer
- Source links point to our own documentation pages, not external sites
- Dedicated `/docs/{category}/{slug}` pages for each FAQ entry

## Architecture

```
┌─────────────────────────────────────────┐
│  Browser (Client)                       │
│  ├── Chat UI (vanilla HTML/CSS/JS)      │
│  ├── Docs Browser                       │
│  └── Memory Manager (localStorage)      │
└──────────────┬──────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────┐
│  Express Server (Node.js)               │
│  ├── POST /api/chat                     │
│  ├── GET  /api/faq/categories           │
│  ├── GET  /api/faq/category/:id         │
│  ├── GET  /api/faq/search?q=            │
│  ├── GET  /api/health                   │
│  └── GET  /docs/:category/:slug         │
└──────────────┬──────────────────────────┘
               │ OpenAI-compatible API
┌──────────────▼──────────────────────────┐
│  LLM Provider                           │
│  ├── Chat model (frontier) — responses  │
│  └── Fast model (mini) — memory extract │
│  (or mock mode if no API key)           │
└─────────────────────────────────────────┘
```

### Stack Rationale

| Choice | Reason |
|--------|--------|
| **Vanilla HTML/CSS/JS** | Zero build step, maximum portability, instant setup |
| **Express 5** | Minimal, stable Node.js server; serves static files + API |
| **No database** | FAQ data is a static JSON file; memory lives in client localStorage |
| **OpenAI-compatible API** | Works with OpenAI, LiteLLM, Azure, or any compatible provider |
| **No auth** | Per requirements — no authentication needed |
| **Dual-model approach** | Fast model for memory extraction (low latency), frontier model for quality chat responses |

## API Reference

### `POST /api/chat`
Send a message and get an AI response with sources.

```json
{
  "messages": [
    { "role": "user", "content": "How do I reset my password?" }
  ],
  "memories": ["The user is an organization admin"]
}
```

Response:
```json
{
  "response": "To reset your password, contact your organization administrator...",
  "sources": [
    { "title": "Password Reset", "url": "https://support-epic.maxawad.com/docs/authentication/password-reset" }
  ],
  "newMemories": []
}
```

### `GET /api/faq/categories`
Returns all FAQ categories with entry counts.

### `GET /api/faq/category/:id`
Returns a category with all its entries.

### `GET /api/faq/search?q=query`
Searches FAQ entries by keyword.

### `GET /api/health`
Health check — returns `{ status: "ok", mock: true/false }`.

## Running Tests

```bash
npm test
```

Tests cover:
- FAQ retrieval (categories, entries, search, slug lookup)
- API endpoints (chat, categories, search, error handling)
- Memory system (extraction, source parsing, deduplication)

See [TESTING.md](TESTING.md) for details.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | _(none — mock mode)_ | API key for the LLM provider |
| `LLM_CHAT_MODEL` | `gpt-4o` | Model for chat responses |
| `LLM_FAST_MODEL` | `gpt-4o-mini` | Model for memory extraction |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |

If `LLM_API_KEY` is not set, the app runs in **mock mode** with keyword-matched responses from the FAQ data. This is fully functional for demo/evaluation purposes.

## Project Structure

```
├── SEED_DATA/
│   └── epic_vendor_faq.json    # 18 Q&A entries across 6 categories
├── server/
│   ├── index.js                # Express server, routing, doc page renderer
│   ├── llm.js                  # LLM client, system prompt, memory extraction, mock mode
│   └── retrieval.js            # FAQ search, category/entry lookups
├── public/
│   ├── index.html              # SPA with OG meta tags
│   ├── styles.css              # Full responsive stylesheet
│   ├── app.js                  # Client-side logic (chat, docs, memory)
│   ├── og-image.svg            # Open Graph preview image
│   └── docs/                   # Documentation page templates
├── tests/
│   ├── retrieval.test.js       # FAQ data + search tests
│   ├── api.test.js             # HTTP endpoint integration tests
│   └── memory.test.js          # Memory extraction + source parsing tests
├── .env                        # Pre-configured with working API key ($10 budget)
├── .env.example                # Environment template (for custom keys)
├── PROMPTS.md                  # All prompts used to build this project
├── README.md                   # This file
├── AI_USAGE.md                 # AI tool usage documentation
└── TESTING.md                  # Testing strategy documentation
```
