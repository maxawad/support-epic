const stats = {
  startedAt: Date.now(),
  chat: {
    totalMessages: 0,
    totalSessions: 0,
    totalResponseTimeMs: 0,
    responseTimes: [],
    errorCount: 0,
    memoryExtractions: 0,
    ragQueries: 0,
  },
  edit: {
    totalMessages: 0,
    blockedQueries: 0,
    errorCount: 0,
  },
  docs: {
    pageViews: 0,
    searchQueries: 0,
  },
  activeSessions: new Set(),
};

const MAX_RESPONSE_TIMES = 200;

function trackChatMessage(responseTimeMs, sessionId) {
  stats.chat.totalMessages++;
  stats.chat.totalResponseTimeMs += responseTimeMs;
  stats.chat.ragQueries++;

  stats.chat.responseTimes.push(responseTimeMs);
  if (stats.chat.responseTimes.length > MAX_RESPONSE_TIMES) {
    stats.chat.responseTimes.shift();
  }

  if (sessionId && !stats.activeSessions.has(sessionId)) {
    stats.activeSessions.add(sessionId);
    stats.chat.totalSessions++;
  }
}

function trackChatError() {
  stats.chat.errorCount++;
}

function trackMemoryExtraction(count) {
  stats.chat.memoryExtractions += count;
}

function trackEditMessage() {
  stats.edit.totalMessages++;
}

function trackEditBlock() {
  stats.edit.blockedQueries++;
}

function trackEditError() {
  stats.edit.errorCount++;
}

function trackDocView() {
  stats.docs.pageViews++;
}

function trackDocSearch() {
  stats.docs.searchQueries++;
}

function getStats() {
  const uptime = Date.now() - stats.startedAt;
  const uptimeSec = Math.floor(uptime / 1000);
  const uptimeMin = Math.floor(uptimeSec / 60);
  const uptimeHours = Math.floor(uptimeMin / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  let uptimeStr;
  if (uptimeDays > 0) uptimeStr = `${uptimeDays}d ${uptimeHours % 24}h ${uptimeMin % 60}m`;
  else if (uptimeHours > 0) uptimeStr = `${uptimeHours}h ${uptimeMin % 60}m`;
  else uptimeStr = `${uptimeMin}m ${uptimeSec % 60}s`;

  const avgResponseTime = stats.chat.totalMessages > 0
    ? Math.round(stats.chat.totalResponseTimeMs / stats.chat.totalMessages)
    : 0;

  const recentTimes = stats.chat.responseTimes;
  const p50 = percentile(recentTimes, 50);
  const p95 = percentile(recentTimes, 95);

  return {
    uptime: uptimeStr,
    uptimeMs: uptime,
    startedAt: new Date(stats.startedAt).toISOString(),
    chat: {
      totalMessages: stats.chat.totalMessages,
      totalSessions: stats.chat.totalSessions,
      avgResponseTimeMs: avgResponseTime,
      p50ResponseTimeMs: p50,
      p95ResponseTimeMs: p95,
      errorCount: stats.chat.errorCount,
      memoryExtractions: stats.chat.memoryExtractions,
      ragQueries: stats.chat.ragQueries,
    },
    edit: {
      totalMessages: stats.edit.totalMessages,
      blockedQueries: stats.edit.blockedQueries,
      errorCount: stats.edit.errorCount,
    },
    docs: {
      pageViews: stats.docs.pageViews,
      searchQueries: stats.docs.searchQueries,
    },
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

module.exports = {
  trackChatMessage,
  trackChatError,
  trackMemoryExtraction,
  trackEditMessage,
  trackEditBlock,
  trackEditError,
  trackDocView,
  trackDocSearch,
  getStats,
};
