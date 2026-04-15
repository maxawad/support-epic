# AI Usage Documentation

This document describes how AI tools were used in the development of the Epic Vendor Services Support Copilot.

## Development AI Tools

### Cursor (AI-assisted IDE)
- **Used for:** Code generation, architecture decisions, debugging
- **How:** Cursor's agent mode was used to scaffold the project structure, generate boilerplate, and iterate on the implementation. All generated code was reviewed and modified to fit the specific requirements.

### Key AI-Assisted Areas

| Area | AI Contribution | Human Review |
|------|----------------|--------------|
| Project structure | Suggested file organization | Adjusted to match monorepo conventions |
| FAQ seed data | Generated initial Q&A content based on Epic's public FAQ topics | Reviewed for accuracy and completeness |
| System prompt | Drafted initial prompt with grounding rules | Refined citation format and safety behaviors |
| CSS styling | Generated base styles from mockup reference | Tuned colors, spacing, and responsive breakpoints |
| Test cases | Generated test structure and assertions | Added edge cases and validated coverage |
| Memory extraction prompt | Drafted initial extraction logic | Refined third-person format and deduplication |

## Runtime AI Usage

The application uses LLM APIs at runtime for two purposes:

### 1. Chat Responses (Frontier Model)
- **Model:** Configurable (default: GPT-4o or GPT-5 via LiteLLM)
- **Purpose:** Generate FAQ-grounded support responses with source citations
- **Prompt engineering:** System prompt includes the full FAQ knowledge base and strict grounding rules
- **Temperature:** 0.3 (low, for factual consistency)

### 2. Memory Extraction (Fast Model)
- **Model:** Configurable (default: GPT-4o-mini or `fast` alias via LiteLLM)
- **Purpose:** Analyze user messages for memorable personal facts
- **Output:** JSON array of third-person statements
- **Temperature:** 0 (deterministic)
- **Runs in parallel** with the chat completion for minimal latency impact

### Mock Mode
When no API key is configured, the app uses a keyword-matching algorithm against the FAQ data to generate responses. This ensures the product is fully functional for evaluation without requiring API access.

## Principles

1. **AI as accelerator, not replacement** — AI tools sped up development but every line was reviewed and understood
2. **No copy-paste from external sources** — All code is original, written with AI assistance
3. **Transparency** — This document exists to clearly communicate AI involvement
