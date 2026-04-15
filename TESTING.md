# Testing Strategy

## Running Tests

```bash
npm test
```

All tests use Node.js's built-in test runner (`node:test`) — no additional test framework dependencies required.

## Test Structure

### `tests/retrieval.test.js` — FAQ Data & Search
Tests the core FAQ retrieval module that powers both the documentation browser and the chat system.

| Test | What it validates |
|------|------------------|
| Returns all 6 categories | Seed data integrity |
| Category required fields | Schema validation (id, title, icon, entryCount) |
| At least 12 entries | Meets the minimum requirement from the spec |
| Source URLs point to our domain | No links leak to external Epic URLs |
| Entry schema validation | Every entry has question, answer, and tags |
| Category lookup by ID | Valid and invalid category handling |
| Entry lookup by slug | Slug-to-entry resolution for doc pages |
| Keyword search | Relevance scoring and result ranking |
| Empty query handling | Returns empty array, no errors |
| Result cap (max 5) | Prevents oversized search results |

### `tests/api.test.js` — HTTP Endpoint Integration
Spins up a real Express server on a random port and tests all API endpoints.

| Test | What it validates |
|------|------------------|
| Health check | Server is running, reports mock mode correctly |
| Categories endpoint | Returns all categories |
| Category detail | Returns entries for valid category, 404 for invalid |
| Search endpoint | Returns results for matching queries, empty for non-matches |
| Chat — valid message | Returns response, sources, and newMemories in mock mode |
| Chat — empty messages | Returns 400 |
| Chat — missing messages | Returns 400 |
| Chat — blank content | Returns 400 |
| Chat — unrelated question | Handles gracefully (doesn't crash) |
| Chat — with memories | Accepts memories parameter without error |

### `tests/memory.test.js` — Memory System
Tests memory extraction and source parsing logic.

| Test | What it validates |
|------|------------------|
| Mock mode returns empty | Memory extraction gracefully degrades without API |
| Source extraction | Parses `[Title](URL)` from response text |
| Source deduplication | Same URL appears only once |
| Non-domain URL filtering | External URLs are excluded |
| No-source handling | Returns empty array for plain text |

## Coverage Notes

- **Mock mode** is fully tested — all tests run without an API key
- **Live LLM** testing is manual (requires API key); the system prompt and response parsing are the same in both modes
- **Frontend** is tested manually via browser; the client-side code is straightforward DOM manipulation with no complex state management
- **Edge cases** covered: empty inputs, invalid categories, unrelated questions, duplicate sources, external URLs

## Manual Test Checklist

For evaluators who want to manually verify the UI:

- [ ] Load `http://localhost:3000` — welcome screen displays correctly
- [ ] Click a quick action button — chat starts with that query
- [ ] Type a question and press Enter — response appears with sources
- [ ] Click "Docs" tab — documentation browser loads with all categories
- [ ] Expand a FAQ entry — answer and source link appear
- [ ] Search in docs — filters categories in real-time
- [ ] Click memory icon — memory panel opens (empty initially)
- [ ] (With API key) Chat includes personal info — memory badge appears
- [ ] Click memory badge — panel shows extracted memories
- [ ] Delete a memory — removed from list and localStorage
- [ ] Click "New Chat" — conversation clears, welcome screen returns
- [ ] Open in mobile viewport — layout is responsive
