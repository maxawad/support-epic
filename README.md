# Epic Vendor Services — FAQ Support Copilot

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000?logo=express&logoColor=white)
![Tests](https://img.shields.io/badge/tests-98%20passing-brightgreen)
![Lines of Code](https://img.shields.io/badge/LOC-3%2C200%2B-blue)
![Dependencies](https://img.shields.io/badge/deps-1%20(express)-orange)
![License](https://img.shields.io/badge/license-MIT-green)

An AI-powered support copilot that answers Epic Vendor Services FAQ questions with **retrieval-augmented generation (RAG)**, **session memory**, and **source-grounded responses**. Zero build step. One dependency. Ships with a working API key.

<p align="center">
  <img src="public/demo.svg" alt="Chat interface demo" width="720"/>
</p>

---

## Quick Start

```bash
git clone https://github.com/maxawad/support-epic.git
cd support-epic
npm install
npm start
```

Open **http://localhost:3000** — that's it. The `.env` ships with a working API key.

> **Setup time:** < 60 seconds on any machine with Node.js 18+. No database, no Docker, no build step.

---

## Live Demo

**https://support-epic.maxawad.com** — try it now.

| Page | Description |
|------|-------------|
| [`/`](https://support-epic.maxawad.com) | Chat interface — ask anything about Epic Vendor Services |
| [`/edit`](https://support-epic.maxawad.com/edit) | Code explorer — browse and ask about the source code |
| [`/docs/...`](https://support-epic.maxawad.com/docs/authentication/password-reset) | Documentation pages — one per FAQ entry |
| [`/downloads`](https://support-epic.maxawad.com/downloads) | Download the source code and build prompts |

---

## Features

### RAG-Powered Chat
- TF-IDF vector embeddings with cosine similarity — retrieves only the top-K relevant FAQ entries per query (not the entire knowledge base)
- Source citations linking to hosted documentation pages on our domain
- Quick-action buttons for common queries (Password Reset, View Invoices, etc.)
- Routes sensitive issues to proper channels (never invents password reset steps)

### Session Memory
- Extracts memorable facts automatically ("The user works in billing at a hospital")
- Stored in `localStorage` — no server-side tracking, fully client-side
- Only **relevant** memories are injected per query (cosine-ranked, top-3)
- Memory panel to view, manage, and delete individual memories

### Conversation Windowing
- Keeps last 10 messages in full context
- Older messages are summarized into a rolling paragraph by the fast model
- Prevents context window exhaustion on long multi-turn sessions

### Source Validation
- Every cited URL is validated against known FAQ slugs before returning
- Hallucinated sources are silently stripped and logged
- All source links point to our hosted docs, never external sites

### Code Explorer (`/edit`)
- Dark-themed interface to browse and ask about the project source code
- Sandboxed: blocks all infrastructure, credential, and out-of-scope queries
- Time-limited sessions (configurable, default 2 hours)

### Documentation Browser
- Browsable FAQ organized by 6 categories
- Search/filter across all 18 entries
- Dedicated `/docs/{category}/{slug}` pages with OG meta tags for iMessage previews

---

## Architecture

```
                              ┌─────────────────────┐
                              │   Browser (Client)   │
                              │                     │
                              │  Chat UI            │
                              │  Memory (localStorage)
                              │  Docs Browser       │
                              │  Code Explorer       │
                              └─────────┬───────────┘
                                        │ HTTP
                              ┌─────────▼───────────┐
                              │   Express Server     │
                              │                     │
  ┌───────────────┐           │  POST /api/chat     │           ┌──────────────┐
  │  FAQ Vector   │◀──query──▶│  GET  /api/faq/*    │──llm────▶│  LLM Provider │
  │  Store        │  top-K    │  POST /api/edit/chat│           │              │
  │  (TF-IDF)     │           │  GET  /docs/*       │           │  Chat: gpt-5 │
  └───────────────┘           │  GET  /api/health   │           │  Fast: 4.1-mini│
                              └─────────────────────┘           └──────────────┘
```

### Chat Request Flow

```
User message
  → TF-IDF embed query
  → Cosine similarity vs FAQ vector store → top-4 entries
  → Rank memories by relevance → top-3
  → Window conversation (last 10 msgs + rolling summary)
  → Build system prompt with retrieved chunks + relevant memories
  → LLM generates response
  → Validate source URLs against known FAQ slugs
  → Extract new memories (fast model, parallel)
  → Return { response, sources[], newMemories[] }
```

### Stack Rationale

| Choice | Reason |
|--------|--------|
| **Vanilla HTML/CSS/JS** | Zero build step, instant setup, maximum portability |
| **Express 5** | Minimal server; serves static files + API in one process |
| **TF-IDF embeddings** | Same RAG pipeline as neural embeddings, zero dependencies, works offline |
| **No database** | FAQ is a static JSON; memory lives in client localStorage |
| **OpenAI-compatible API** | Works with OpenAI, LiteLLM, Azure, or any compatible provider |
| **Dual-model approach** | Fast model for memory extraction (low latency), frontier model for quality chat |

---

## Project Statistics

| Metric | Value |
|--------|-------|
| **Server code** | 1,017 lines across 5 modules |
| **Frontend code** | 2,203 lines (HTML + CSS + JS) |
| **Test code** | 1,172 lines across 5 test files |
| **Total lines** | 3,200+ |
| **Tests passing** | 98 / 98 |
| **Test suites** | 33 |
| **Dependencies** | 1 (`express`) |
| **FAQ entries** | 18 across 6 categories |
| **Build step** | None |

---

## API Reference

### `POST /api/chat`

Send a message and get a RAG-grounded response with sources.

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
All FAQ categories with entry counts.

### `GET /api/faq/category/:id`
A single category with all its entries.

### `GET /api/faq/search?q=query`
Search FAQ entries by keyword.

### `GET /api/health`
Health check — returns `{ status: "ok", mock: true/false, rag: true }`.

### `POST /api/edit/chat`
Code explorer chat (sandboxed, time-limited).

### `GET /api/edit/status`
Edit session countdown status.

---

## Running Tests

```bash
npm test
```

**98 tests, 33 suites, 0 failures** covering:
- TF-IDF tokenization, cosine similarity, vector store operations
- FAQ retrieval (categories, entries, search, slug lookup)
- API endpoints (chat, categories, search, error handling)
- Memory system (extraction, source parsing, deduplication, relevance ranking)
- E2E conversations (single-turn, multi-turn, multi-part queries)
- Source citation validation against known FAQ slugs

See [TESTING.md](TESTING.md) for strategy details.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | _(ships in .env)_ | API key for the LLM provider |
| `LLM_CHAT_MODEL` | `gpt-5` | Model for chat responses |
| `LLM_FAST_MODEL` | `fast` | Model for memory extraction + summarization |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `RAG_TOP_K` | `4` | FAQ entries retrieved per query |
| `MEMORY_TOP_K` | `3` | Relevant memories injected per query |
| `EDIT_DURATION_MS` | `7200000` | Code explorer session duration (ms) |

If `LLM_API_KEY` is not set, the app runs in **mock mode** with keyword-matched FAQ responses — fully functional for evaluation.

---

## Project Structure

```
├── SEED_DATA/
│   └── epic_vendor_faq.json        # 18 Q&A entries across 6 categories
├── server/
│   ├── index.js                    # Express server, routing, doc page renderer
│   ├── llm.js                      # LLM client, system prompt, RAG prompt builder
│   ├── retrieval.js                # FAQ search, category/entry lookups, slug validation
│   ├── embeddings.js               # TF-IDF vectorizer, cosine similarity, vector store
│   └── sandbox.js                  # Sandboxed file reader for code explorer
├── public/
│   ├── index.html                  # Chat SPA with OG meta tags
│   ├── app.js                      # Client: chat, docs browser, memory manager
│   ├── styles.css                  # Responsive stylesheet (light theme)
│   ├── edit.html                   # Code explorer page (dark theme)
│   ├── edit-app.js                 # Code explorer client logic
│   ├── edit-styles.css             # Code explorer styles
│   ├── og-image.svg                # Open Graph preview image
│   ├── demo.svg                    # Chat interface mockup for README
│   └── downloads/                  # Downloadable project + prompts ZIPs
├── tests/
│   ├── retrieval.test.js           # FAQ data + search tests
│   ├── api.test.js                 # HTTP endpoint integration tests
│   ├── memory.test.js              # Memory extraction + source parsing tests
│   ├── embeddings.test.js          # TF-IDF, cosine similarity, vector store tests
│   └── e2e.test.js                 # End-to-end conversation tests
├── .env                            # Working API key (ships with repo)
├── .env.example                    # Environment template with docs
├── package.json                    # 1 dependency: express
├── README.md                       # This file
├── AI_USAGE.md                     # AI tool usage documentation
├── TESTING.md                      # Testing strategy documentation
└── PROMPTS.md                      # All prompts used to build this project
```

---

## AI Usage

This project was built with AI assistance. See [AI_USAGE.md](AI_USAGE.md) for full details on tools, models, and prompts used. All build prompts are documented in [PROMPTS.md](PROMPTS.md).
