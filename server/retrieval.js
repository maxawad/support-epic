const faqData = require('../SEED_DATA/epic_vendor_faq.json');

const DOMAIN = 'https://support-epic.maxawad.com';

function getAllCategories() {
  return faqData.categories.map(cat => ({
    id: cat.id,
    title: cat.title,
    icon: cat.icon,
    entryCount: cat.entries.length,
  }));
}

function getAllEntries() {
  return faqData.categories.flatMap(cat =>
    cat.entries.map(entry => ({
      ...entry,
      categoryId: cat.id,
      categoryTitle: cat.title,
      categoryIcon: cat.icon,
      sourceUrl: `${DOMAIN}/docs/${entry.source_slug}`,
    }))
  );
}

function getEntriesByCategory(categoryId) {
  const cat = faqData.categories.find(c => c.id === categoryId);
  if (!cat) return null;
  return {
    ...cat,
    entries: cat.entries.map(e => ({
      ...e,
      sourceUrl: `${DOMAIN}/docs/${e.source_slug}`,
    })),
  };
}

function getEntryBySlug(slug) {
  for (const cat of faqData.categories) {
    const entry = cat.entries.find(e => e.source_slug === slug);
    if (entry) {
      return {
        ...entry,
        categoryId: cat.id,
        categoryTitle: cat.title,
        categoryIcon: cat.icon,
        sourceUrl: `${DOMAIN}/docs/${entry.source_slug}`,
      };
    }
  }
  return null;
}

function searchEntries(query) {
  if (!query || query.trim().length === 0) return [];

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allEntries = getAllEntries();

  const scored = allEntries.map(entry => {
    let score = 0;
    const questionLower = entry.question.toLowerCase();
    const answerLower = entry.answer.toLowerCase();

    for (const term of terms) {
      if (questionLower.includes(term)) score += 3;
      if (entry.tags.some(t => t.includes(term))) score += 2;
      if (answerLower.includes(term)) score += 1;
    }

    return { ...entry, score };
  });

  return scored
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function getAllSlugs() {
  const slugs = new Set();
  for (const cat of faqData.categories) {
    for (const entry of cat.entries) {
      slugs.add(entry.source_slug);
    }
  }
  return slugs;
}

module.exports = { getAllCategories, getAllEntries, getEntriesByCategory, getEntryBySlug, searchEntries, getAllSlugs };
