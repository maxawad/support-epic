const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','is','it',
  'that','this','with','from','by','as','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should','may',
  'might','shall','can','need','dare','ought','must','i','me','my','mine','we',
  'our','ours','you','your','yours','he','him','his','she','her','hers','they',
  'them','their','theirs','what','which','who','whom','how','where','when','why',
  'not','no','nor','so','if','then','than','too','very','just','about','also',
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }
  const max = Math.max(...Object.values(tf), 1);
  for (const t in tf) {
    tf[t] = tf[t] / max;
  }
  return tf;
}

class VectorStore {
  constructor() {
    this.documents = [];
    this.vocabulary = new Set();
    this.idf = {};
    this.vectors = [];
    this._built = false;
  }

  add(text, metadata = {}) {
    const tokens = tokenize(text);
    this.documents.push({ text, tokens, metadata });
  }

  build() {
    const N = this.documents.length;
    if (N === 0) { this._built = true; return; }

    for (const doc of this.documents) {
      for (const t of doc.tokens) this.vocabulary.add(t);
    }

    const df = {};
    for (const doc of this.documents) {
      const unique = new Set(doc.tokens);
      for (const t of unique) {
        df[t] = (df[t] || 0) + 1;
      }
    }

    for (const t of this.vocabulary) {
      this.idf[t] = Math.log((N + 1) / (df[t] + 1)) + 1;
    }

    this.vectors = this.documents.map(doc => this._tfidfVector(doc.tokens));
    this._built = true;
  }

  query(text, topK = 3) {
    if (!this._built) throw new Error('VectorStore not built — call build() first');
    if (this.documents.length === 0) return [];

    const queryTokens = tokenize(text);
    const queryVec = this._tfidfVector(queryTokens);

    const scored = this.vectors.map((docVec, i) => ({
      score: cosineSimilarity(queryVec, docVec),
      document: this.documents[i],
    }));

    return scored
      .filter(s => s.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => ({ ...s.document.metadata, text: s.document.text, score: s.score }));
  }

  _tfidfVector(tokens) {
    const tf = termFrequency(tokens);
    const vec = {};
    for (const t in tf) {
      if (this.idf[t]) {
        vec[t] = tf[t] * this.idf[t];
      }
    }
    return vec;
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    const va = a[k] || 0;
    const vb = b[k] || 0;
    dot += va * vb;
    magA += va * va;
    magB += vb * vb;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function buildFaqStore(faqData, domain) {
  const store = new VectorStore();
  for (const cat of faqData.categories) {
    for (const entry of cat.entries) {
      const chunkText = `${entry.question} ${entry.answer}`;
      store.add(chunkText, {
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        source_slug: entry.source_slug,
        tags: entry.tags,
        categoryId: cat.id,
        categoryTitle: cat.title,
        categoryIcon: cat.icon,
        sourceUrl: `${domain}/docs/${entry.source_slug}`,
      });
    }
  }
  store.build();
  return store;
}

function rankMemories(query, memories, topK = 3) {
  if (!memories || memories.length === 0) return [];
  if (memories.length <= topK) return [...memories];

  const store = new VectorStore();
  memories.forEach((mem, i) => store.add(mem, { index: i, text: mem }));
  store.build();

  const results = store.query(query, topK);
  if (results.length === 0) return memories.slice(0, topK);

  return results.map(r => memories[r.index]);
}

module.exports = { VectorStore, buildFaqStore, rankMemories, cosineSimilarity, tokenize };
