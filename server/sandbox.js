const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const BLOCKED_PATTERNS = [
  /\.env/i,
  /node_modules/i,
  /\.git\//,
  /package-lock\.json/,
];

const ALLOWED_EXTENSIONS = new Set([
  '.js', '.json', '.html', '.css', '.md', '.txt', '.yaml', '.yml',
  '.ts', '.jsx', '.tsx', '.sh', '.toml', '.cfg', '.conf',
]);

function isPathSafe(requestedPath) {
  const resolved = path.resolve(PROJECT_ROOT, requestedPath);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return { safe: false, reason: 'outside_project' };
  }
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(resolved)) {
      return { safe: false, reason: 'blocked_file' };
    }
  }
  const ext = path.extname(resolved).toLowerCase();
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    return { safe: false, reason: 'blocked_extension' };
  }
  return { safe: true, resolved };
}

function readProjectFile(relativePath) {
  const check = isPathSafe(relativePath);
  if (!check.safe) return { error: check.reason };

  try {
    const stat = fs.statSync(check.resolved);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(check.resolved, { withFileTypes: true })
        .filter(e => {
          if (e.name.startsWith('.')) return false;
          if (e.name === 'node_modules') return false;
          return true;
        })
        .map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
        }));
      return { type: 'directory', path: relativePath, entries };
    }

    if (stat.size > 100_000) {
      return { error: 'file_too_large', size: stat.size };
    }

    const content = fs.readFileSync(check.resolved, 'utf8');
    return { type: 'file', path: relativePath, content, size: stat.size };
  } catch (err) {
    if (err.code === 'ENOENT') return { error: 'not_found' };
    return { error: 'read_error', message: err.message };
  }
}

function listProjectStructure() {
  const tree = [];
  function walk(dir, prefix) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => {
        if (e.name.startsWith('.')) return false;
        if (e.name === 'node_modules') return false;
        return true;
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        tree.push({ name: rel, type: 'directory' });
        walk(path.join(dir, e.name), rel);
      } else {
        tree.push({ name: rel, type: 'file' });
      }
    }
  }
  walk(PROJECT_ROOT, '');
  return tree;
}

const HARD_BLOCK_PATTERNS = [
  /api.*key/i, /secret/i, /credential/i,
  /\.env\b/i, /environment.*variable/i,
  /cloudflare/i, /tunnel/i, /launchd/i, /plist/i, /systemd/i,
  /digitalocean/i, /droplet/i, /ssh\b/i, /vpn/i, /wireguard/i,
  /dns\b/i, /nginx/i, /apache/i, /firewall/i,
  /litellm/i, /license.*server/i,
  /mac.*mini/i, /linux.*server/i,
];

const SOFT_BLOCK_PATTERNS = [
  /server.*infra/i, /deploy(?!ment\s+of\s+this)/i,
  /proxy/i,
  /other.*project/i, /other.*repo/i, /other.*package/i,
  /redxam\.com/i, /maxawad\.com(?!.*support-epic)/i,
];

const SAFE_OVERRIDES = [
  /this\s+(project|app|chatbot|copilot|code|repo)/i,
  /support-epic/i,
  /epic.*vendor/i,
  /faq/i,
  /how\s+does\s+(this|the)\s+(code|app|server|chat)/i,
  /edit|change|fix|update|refactor|improve/i,
  /what\s+files/i,
  /show\s+me/i,
  /read\s+the\s+(file|code)/i,
];

function isInfrastructureQuery(query) {
  if (HARD_BLOCK_PATTERNS.some(p => p.test(query))) return true;

  const hasOverride = SAFE_OVERRIDES.some(p => p.test(query));
  if (hasOverride) return false;

  return SOFT_BLOCK_PATTERNS.some(p => p.test(query));
}

module.exports = {
  isPathSafe,
  readProjectFile,
  listProjectStructure,
  isInfrastructureQuery,
  PROJECT_ROOT,
};
