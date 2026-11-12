# Epic Vendor Services FAQ Support Copilot

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000?logo=express&logoColor=white)
![Dependencies](https://img.shields.io/badge/deps-1%20(express)-orange)

A small support chatbot that answers questions about a fictional vendor-services product by looking up the most relevant help articles first and then writing an answer based on them. Every answer links back to the help pages it came from, so you can check it.

<p align="center">
  <img src="public/demo.svg" alt="Chat interface demo" width="720"/>
</p>

## What it does

- **Chat with source links.** Your question is matched against 18 FAQ entries in 6 categories. The best matches are given to the language model, and the reply cites them.
- **Works without an API key.** With no key set, the app runs in mock mode and answers with keyword matching against the same FAQ. This is the easiest way to try it.
- **Session memory in the browser.** Facts you mention (for example "I work in billing") are stored in your browser's `localStorage`, and only the relevant ones are sent with each question. You can view and delete them.
- **Long conversations.** The last 10 messages are kept in full and older ones are summarized.
- **Source checking.** Cited links are checked against the known FAQ pages, and unknown ones are dropped.
- **Documentation pages.** Each FAQ entry has its own page at `/docs/{category}/{slug}`.
- **Code explorer at `/edit`.** A chat page for browsing this project's own source code. It blocks questions about secrets and infrastructure and is time limited (2 hours by default).
- **Downloads page at `/downloads`.** The source as a zip and the prompts used to build the project.

## Tech stack

- Node.js 18 or newer, Express 5 (the only dependency)
- Plain HTML, CSS and JavaScript on the front end, with no build step
- TF-IDF vectors and cosine similarity for retrieval, written from scratch in `server/embeddings.js`
- Any OpenAI-compatible chat API for live answers (OpenAI, a LiteLLM proxy, Azure, and similar)
- Node's built-in test runner

## Run it

```bash
git clone https://github.com/maxawad/support-epic.git
cd support-epic
npm install
npm start
```

Then open http://localhost:3000. With no configuration it starts in mock mode.

To use a live model, copy the example settings and add your own key:

```bash
cp .env.example .env
# edit .env and set LLM_API_KEY (and LLM_BASE_URL if you are not using the default)
npm start
```

`.env` is ignored by git. Never commit it.

### Run the tests

```bash
npm test
```

The tests run in mock mode and need no key.

### Static hosting

This is a Node server, not a static site. The chat, search and docs pages all need the Express server, so it cannot be hosted as plain static files. Any host that can run `npm start` will work.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base URL |
| `LLM_API_KEY` | none | Your API key. If empty, the app runs in mock mode |
| `LLM_CHAT_MODEL` | `gpt-4o` | Model for chat answers |
| `LLM_FAST_MODEL` | `gpt-4o-mini` | Model for memory extraction, summaries and the code explorer |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` to keep it local |
| `RAG_TOP_K` | `4` | FAQ entries retrieved per question |
| `MEMORY_TOP_K` | `3` | Memories sent per question |
| `EDIT_DURATION_MS` | `7200000` | How long the code explorer stays open after start |

The server has no login and no rate limiting. If you run it with a real API key on a public address, put it behind something that limits access, because anyone who can reach it can spend your quota.

## API

| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Body `{ "messages": [{ "role": "user", "content": "..." }], "memories": [] }`. Returns `{ response, sources, newMemories }` |
| `GET /api/faq/categories` | All categories with entry counts |
| `GET /api/faq/category/:id` | One category with its entries |
| `GET /api/faq/search?q=...` | Keyword search over the FAQ |
| `GET /api/health` | Returns status and whether mock mode is on |
| `POST /api/edit/chat` | Code explorer chat |
| `GET /api/edit/status` | Code explorer time remaining |

## How a question is answered

```
User message
  -> TF-IDF vector of the question
  -> cosine similarity against the FAQ vectors, top 4 entries
  -> rank saved memories by relevance, top 3
  -> last 10 messages plus a rolling summary of older ones
  -> prompt with the retrieved entries and memories
  -> language model reply
  -> drop cited links that are not real FAQ pages
  -> return { response, sources, newMemories }
```

## Project layout

```
SEED_DATA/epic_vendor_faq.json   FAQ content (18 entries)
server/index.js                  Express server, routes, doc page renderer
server/llm.js                    LLM client, prompts, mock mode
server/retrieval.js              FAQ lookups and slug checks
server/embeddings.js             TF-IDF vectors and cosine similarity
server/sandbox.js                Safe file reader for the code explorer
server/stats.js                  In-memory usage counters
public/                          Front end (chat, docs, code explorer, downloads)
tests/                           Unit, API and end-to-end tests
```

## Status

Working prototype. It runs in mock mode out of the box, and live answers need your own API key for an OpenAI-compatible service. The FAQ content is fictional sample data written for this demo, and the hosted links in the code (`support-epic.maxawad.com`) point to the author's own deployment.

## Credits

Built by Max Awad with AI assistance. See [AI_USAGE.md](AI_USAGE.md) for the tools used, [PROMPTS.md](PROMPTS.md) for the prompts, and [TESTING.md](TESTING.md) for the test approach. No license file is included yet, so all rights are reserved until one is added.
