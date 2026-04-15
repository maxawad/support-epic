# Build Prompts — Epic Vendor Services FAQ Support Copilot

All prompts used to build and iterate on this project, in chronological order.

---

## Prompt 1 — Initial Build

> Build a chat interface that lets you communicate with documentation. Set up an OpenAI key, Cloudflare domain, iMessage preview. Build memory stored client-side in localStorage with third-person facts. Use LiteLLM proxy. Fast model for memory extraction, frontier model (gpt-5) for chat. Show "Powered by a frontier model" in the UI.

## Prompt 2 — Make It Live

> Make it live. Go to Cloudflare and create a subdomain that points to a tunnel that's already running. No setup required.

## Prompt 3 — Fix Bad Gateway

> Curl the website yourself. It's showing Cloudflare 502 bad gateway.

## Prompt 4 — UX Fixes

> 1. Allow sending multiple messages without waiting for response
> 2. Make "frontier model" clickable with tooltip showing the model name
> 3. Fix crash when asking memory-based follow-up questions ("where do I work?")
> 4. Fix password reset context (don't confuse employer IT with Epic Vendor Services)

## Prompt 5 — Fix Empty Responses & Add Tests

> The chatbot returns "I'm sorry, I wasn't able to generate a response" for multi-part queries like "I'd love to reset my password. Also tell me about Epic Vendor Services." Run tests before publishing.

## Prompt 6 — Architecture Assessment

> Summarize the current implementation status. Describe architecture, how memory/context is handled, what's missing. Assess what components (RAG, LangChain) might help.

## Prompt 7 — Implement RAG

> Implement real RAG without rewriting the whole app:
> 1. Chunk FAQ entries for embedding
> 2. Add embeddings + top-k semantic retrieval
> 3. Retrieve only relevant FAQ chunks per user query
> 4. Keep last N messages plus rolling summary
> 5. Retrieve only relevant memories, not all
> 6. Validate cited sources against real FAQ slugs
> 7. Keep code simple, minimal deps

## Prompt 8 — Package & Distribute

> Create ZIPs of the project and all prompts. Email to recipients. Push to public GitHub repo (github.com/maxawad/support-epic). Generate a capped API key ($10, 30 days) and embed in `.env` so anyone can clone and run.
