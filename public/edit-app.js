(function () {
  'use strict';

  let conversationHistory = [];
  let expired = false;

  const welcomeScreen = document.getElementById('welcomeScreen');
  const messagesEl = document.getElementById('messages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const expiryBadge = document.getElementById('expiryBadge');
  const expiryText = document.getElementById('expiryText');
  const expiredOverlay = document.getElementById('expiredOverlay');
  const quickBtns = document.querySelectorAll('.quick-btn');

  checkExpiry();
  setInterval(checkExpiry, 10_000);
  setupEventListeners();

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

    quickBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        chatInput.value = btn.dataset.query;
        sendBtn.disabled = false;
        sendMessage();
      });
    });
  }

  async function checkExpiry() {
    try {
      const res = await fetch('/api/edit/status');
      const data = await res.json();

      if (data.expired) {
        expired = true;
        expiryBadge.classList.add('expired');
        expiryText.textContent = 'EXPIRED';
        expiredOverlay.hidden = false;
        chatInput.disabled = true;
        sendBtn.disabled = true;
        return;
      }

      const remaining = data.remainingMs;
      const mins = Math.floor(remaining / 60_000);
      const secs = Math.floor((remaining % 60_000) / 1000);
      expiryText.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      if (mins < 10) {
        expiryBadge.classList.add('expired');
      }
    } catch {
      expiryText.textContent = '--:--';
    }
  }

  async function sendMessage() {
    if (expired) return;
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    sendBtn.disabled = true;

    welcomeScreen.classList.add('hidden');
    messagesEl.classList.add('active');

    appendMessage('user', text);
    conversationHistory.push({ role: 'user', content: text });

    const typingEl = showTyping();

    try {
      const res = await fetch('/api/edit/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      const data = await res.json();

      removeTyping(typingEl);

      if (data.error === 'expired') {
        expired = true;
        expiredOverlay.hidden = false;
        chatInput.disabled = true;
        return;
      }

      if (data.error === 'blocked') {
        appendMessage('error', data.response);
        return;
      }

      const responseText = data.response || 'I wasn\'t able to generate a response. Please try again.';
      appendMessage('assistant', responseText);
      conversationHistory.push({ role: 'assistant', content: responseText });

    } catch (err) {
      removeTyping(typingEl);
      appendMessage('assistant', 'Sorry, I encountered an error. Please try again.');
      console.error('Edit chat error:', err);
    }

    sendBtn.disabled = !chatInput.value.trim();
  }

  function appendMessage(role, text) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;

    let html = '';

    if (role === 'assistant') {
      html += '<span class="message-label"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#1e1e2e"/><text x="16" y="21" text-anchor="middle" font-size="12" font-weight="700" fill="#89b4fa" font-family="monospace">&lt;/&gt;</text></svg> Code Explorer</span>';
    }

    if (role === 'error') {
      msgEl.className = 'message error';
      html += '<span class="message-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Blocked</span>';
    }

    html += `<div class="message-bubble">${formatContent(text)}</div>`;

    msgEl.innerHTML = html;
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = `
      <span class="message-label"><svg width="12" height="12" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#1e1e2e"/><text x="16" y="21" text-anchor="middle" font-size="12" font-weight="700" fill="#89b4fa" font-family="monospace">&lt;/&gt;</text></svg> Code Explorer</span>
      <div class="message-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    `;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function formatContent(text) {
    let html = escapeHtml(text);

    // Code blocks with optional language
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const headerHtml = lang ? `<div class="file-header">${lang}</div>` : '';
      return `${headerHtml}<pre><code>${code.trim()}</code></pre>`;
    });

    // Images/GIFs: ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const decodedUrl = url.replace(/&amp;/g, '&');
      const safeAlt = alt || 'image';
      return `<img src="${decodedUrl}" alt="${safeAlt}" class="chat-image" loading="lazy" onerror="this.style.display='none'">`;
    });

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Bare image URLs on their own line
    html = html.replace(/(^|<\/p><p>|<br>)(https?:\/\/\S+\.(?:gif|png|jpg|jpeg|webp|svg))(\s|$|<)/gi, (_, before, url, after) => {
      const decodedUrl = url.replace(/&amp;/g, '&');
      return `${before}<img src="${decodedUrl}" alt="image" class="chat-image" loading="lazy" onerror="this.style.display='none'">${after}`;
    });

    html = html.replace(/(?:^|\n)(\d+\.\s.+(?:\n(?!\n).*)*)/g, (match) => {
      const items = match.trim().split('\n').map(l => {
        const content = l.replace(/^\d+\.\s/, '');
        return `<li>${content}</li>`;
      }).join('');
      return `<ol>${items}</ol>`;
    });

    html = html.replace(/(?:^|\n)([•\-]\s.+(?:\n(?!\n).*)*)/g, (match) => {
      const items = match.trim().split('\n').map(l => {
        const content = l.replace(/^[•\-]\s/, '');
        return `<li>${content}</li>`;
      }).join('');
      return `<ul>${items}</ul>`;
    });

    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p>\s*<\/p>/g, '');

    return html;
  }

  function escapeHtml(str) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return str.replace(/[&<>"']/g, c => map[c]);
  }
})();
