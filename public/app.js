(function () {
  'use strict';

  // ── State ──
  const STORAGE_KEY = 'epic-support-memories';
  let conversationHistory = [];
  let memories = loadMemories();
  let pendingRequests = 0;

  // ── DOM refs ──
  const chatView = document.getElementById('chatView');
  const docsView = document.getElementById('docsView');
  const welcomeScreen = document.getElementById('welcomeScreen');
  const messagesEl = document.getElementById('messages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const newChatBtn = document.getElementById('newChatBtn');
  const memoryBtn = document.getElementById('memoryBtn');
  const memoryBadge = document.getElementById('memoryBadge');
  const memoryOverlay = document.getElementById('memoryOverlay');
  const memoryList = document.getElementById('memoryList');
  const memoryEmpty = document.getElementById('memoryEmpty');
  const closeMemoryBtn = document.getElementById('closeMemoryBtn');
  const clearMemoryBtn = document.getElementById('clearMemoryBtn');
  const docsContent = document.getElementById('docsContent');
  const docsSearch = document.getElementById('docsSearch');
  const modelLabel = document.getElementById('modelLabel');
  const modelTooltip = document.getElementById('modelTooltip');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const quickBtns = document.querySelectorAll('.quick-btn');

  // ── Init ──
  updateMemoryUI();
  loadDocs();
  setupEventListeners();

  // ── Event Listeners ──
  function setupEventListeners() {
    chatInput.addEventListener('input', () => {
      sendBtn.disabled = !chatInput.value.trim();
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && chatInput.value.trim()) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);

    newChatBtn.addEventListener('click', () => {
      conversationHistory = [];
      messagesEl.innerHTML = '';
      messagesEl.classList.remove('active');
      welcomeScreen.classList.remove('hidden');
      chatInput.value = '';
      sendBtn.disabled = true;
      switchTab('chat');
    });

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chatInput.value = btn.dataset.query;
        sendBtn.disabled = false;
        sendMessage();
      });
    });

    memoryBtn.addEventListener('click', openMemoryPanel);
    closeMemoryBtn.addEventListener('click', closeMemoryPanel);
    clearMemoryBtn.addEventListener('click', clearAllMemories);

    memoryOverlay.addEventListener('click', (e) => {
      if (e.target === memoryOverlay) closeMemoryPanel();
    });

    docsSearch.addEventListener('input', debounce(() => {
      filterDocs(docsSearch.value.trim());
    }, 250));

    let tooltipTimeout;
    function toggleTooltip() {
      const showing = modelTooltip.classList.contains('visible');
      modelTooltip.classList.toggle('visible', !showing);
      clearTimeout(tooltipTimeout);
      if (!showing) {
        tooltipTimeout = setTimeout(() => modelTooltip.classList.remove('visible'), 2500);
      }
    }
    modelLabel.addEventListener('click', toggleTooltip);
    modelLabel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTooltip(); }
    });
    document.addEventListener('click', (e) => {
      if (!modelLabel.contains(e.target) && !modelTooltip.contains(e.target)) {
        modelTooltip.classList.remove('visible');
      }
    });
  }

  // ── Tab Switching ──
  function switchTab(tab) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    chatView.classList.toggle('active', tab === 'chat');
    docsView.classList.toggle('active', tab === 'docs');
  }

  // ── Chat ──
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    sendBtn.disabled = true;

    welcomeScreen.classList.add('hidden');
    messagesEl.classList.add('active');

    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    const typingEl = showTyping();
    const messagesCopy = [...conversationHistory];
    const memoriesCopy = [...memories];
    pendingRequests++;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesCopy,
          memories: memoriesCopy,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const responseText = data.response || 'I wasn\'t able to generate a response. Please try again.';

      removeTyping(typingEl);
      appendMessage('assistant', responseText, data.sources, memoriesCopy.length > 0);
      conversationHistory.push({ role: 'assistant', content: responseText });

      if (data.newMemories && data.newMemories.length > 0) {
        for (const mem of data.newMemories) {
          if (!memories.includes(mem)) {
            memories.push(mem);
          }
        }
        saveMemories();
        updateMemoryUI();
      }
    } catch (err) {
      removeTyping(typingEl);
      appendMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
      console.error('Chat error:', err);
    }

    pendingRequests--;
    sendBtn.disabled = !chatInput.value.trim();
  }

  function appendMessage(role, text, sources, usedMemory) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;

    let html = '';

    if (role === 'assistant') {
      let labelHtml = '<span class="message-label"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#5b4cd4"/><text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="white" font-family="system-ui">E</text></svg> Copilot';
      if (usedMemory) {
        labelHtml += '<span class="memory-used-indicator"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h4"/></svg> memory used</span>';
      }
      labelHtml += '</span>';
      html += labelHtml;
    }

    html += `<div class="message-bubble">${formatMarkdown(text)}</div>`;

    if (sources && sources.length > 0) {
      html += '<div class="message-sources"><div class="message-sources-title">Sources</div>';
      for (const src of sources) {
        html += `<a href="${escapeHtml(src.url)}" target="_blank">${escapeHtml(src.title)}</a>`;
      }
      html += '</div>';
    }

    msgEl.innerHTML = html;
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = `
      <span class="message-label"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="14" fill="#5b4cd4"/><text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="white" font-family="system-ui">E</text></svg> Copilot</span>
      <div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ── Markdown ──
  function formatMarkdown(text) {
    let html = escapeHtml(text);

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // Numbered lists
    html = html.replace(/(?:^|\n)(\d+\.\s.+(?:\n(?!\n).*)*)/g, (match) => {
      const items = match.trim().split('\n').map(l => {
        const content = l.replace(/^\d+\.\s/, '');
        return `<li>${content}</li>`;
      }).join('');
      return `<ol>${items}</ol>`;
    });

    // Bullet lists
    html = html.replace(/(?:^|\n)([•\-]\s.+(?:\n(?!\n).*)*)/g, (match) => {
      const items = match.trim().split('\n').map(l => {
        const content = l.replace(/^[•\-]\s/, '');
        return `<li>${content}</li>`;
      }).join('');
      return `<ul>${items}</ul>`;
    });

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }

  // ── Memory ──
  function loadMemories() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  function saveMemories() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  }

  function updateMemoryUI() {
    const count = memories.length;
    memoryBtn.disabled = false;
    memoryBtn.classList.toggle('has-memories', count > 0);

    if (count > 0) {
      memoryBadge.textContent = count;
      memoryBadge.hidden = false;
    } else {
      memoryBadge.hidden = true;
    }

    renderMemoryList();
  }

  function renderMemoryList() {
    memoryList.innerHTML = '';
    memoryEmpty.style.display = memories.length === 0 ? 'flex' : 'none';

    memories.forEach((mem, idx) => {
      const item = document.createElement('div');
      item.className = 'memory-item';
      item.innerHTML = `
        <span class="memory-item-text">${escapeHtml(mem)}</span>
        <button class="memory-item-delete" data-idx="${idx}" title="Remove">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      item.querySelector('.memory-item-delete').addEventListener('click', () => {
        memories.splice(idx, 1);
        saveMemories();
        updateMemoryUI();
      });
      memoryList.appendChild(item);
    });
  }

  function openMemoryPanel() {
    memoryOverlay.hidden = false;
    renderMemoryList();
  }

  function closeMemoryPanel() {
    memoryOverlay.hidden = true;
  }

  function clearAllMemories() {
    if (!confirm('Clear all session memories? This cannot be undone.')) return;
    memories = [];
    saveMemories();
    updateMemoryUI();
  }

  // ── Docs ──
  let allDocsData = null;

  async function loadDocs() {
    try {
      const res = await fetch('/api/faq/categories');
      const categories = await res.json();

      const full = [];
      for (const cat of categories) {
        const catRes = await fetch(`/api/faq/category/${cat.id}`);
        full.push(await catRes.json());
      }

      allDocsData = full;
      renderDocs(full);
    } catch (err) {
      console.error('Failed to load docs:', err);
      docsContent.innerHTML = '<p class="docs-no-results">Failed to load documentation.</p>';
    }
  }

  function renderDocs(categories) {
    docsContent.innerHTML = '';

    if (categories.length === 0) {
      docsContent.innerHTML = '<p class="docs-no-results">No matching documentation found.</p>';
      return;
    }

    for (const cat of categories) {
      const catEl = document.createElement('div');
      catEl.className = 'docs-category';

      let entriesHtml = '';
      for (const entry of cat.entries) {
        const sourceUrl = entry.sourceUrl || `https://support-epic.maxawad.com/docs/${entry.source_slug}`;
        entriesHtml += `
          <div class="docs-entry">
            <div class="docs-entry-question">
              <span>${escapeHtml(entry.question)}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="docs-entry-answer">
              <p>${escapeHtml(entry.answer)}</p>
              <a class="docs-entry-source" href="${sourceUrl}" target="_blank">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                View source
              </a>
            </div>
          </div>
        `;
      }

      catEl.innerHTML = `
        <div class="docs-category-header">
          <span class="docs-category-icon">${cat.icon}</span>
          <h2>${escapeHtml(cat.title)}</h2>
        </div>
        ${entriesHtml}
      `;

      catEl.querySelectorAll('.docs-entry-question').forEach(q => {
        q.addEventListener('click', () => {
          q.parentElement.classList.toggle('open');
        });
      });

      docsContent.appendChild(catEl);
    }
  }

  function filterDocs(query) {
    if (!allDocsData) return;
    if (!query) {
      renderDocs(allDocsData);
      return;
    }

    const q = query.toLowerCase();
    const filtered = allDocsData
      .map(cat => ({
        ...cat,
        entries: cat.entries.filter(e =>
          e.question.toLowerCase().includes(q) ||
          e.answer.toLowerCase().includes(q) ||
          (e.tags && e.tags.some(t => t.includes(q)))
        ),
      }))
      .filter(cat => cat.entries.length > 0);

    renderDocs(filtered);
  }

  // ── Utils ──
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }
})();
