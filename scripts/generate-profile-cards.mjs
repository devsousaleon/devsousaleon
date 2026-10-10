import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const colors = ['#bb9af7', '#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#2ac3de'];
const knownColors = { 'C#': '#bb9af7', ShaderLab: '#7aa2f7', HLSL: '#9ece6a', JavaScript: '#e0af68', Python: '#2ac3de' };
const number = value => new Intl.NumberFormat('en-US').format(value);

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

export function summarizeLanguages(repositories) {
  const totals = new Map();
  for (const languages of repositories) {
    for (const [name, bytes] of Object.entries(languages)) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid language size returned by GitHub.');
      totals.set(name, (totals.get(name) ?? 0) + bytes);
    }
  }
  const entries = [...totals].filter(([, bytes]) => bytes > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
  const displayed = entries.length > 6
    ? [...entries.slice(0, 5), ['Other', entries.slice(5).reduce((sum, [, bytes]) => sum + bytes, 0)]]
    : entries;
  return displayed.map(([name, bytes], index) => ({ name, bytes, share: bytes / total, color: knownColors[name] ?? colors[index] }));
}

function frame(width, title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="316" viewBox="0 0 ${width} 316" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#1a1b2e"/></linearGradient></defs>
  <rect x=".5" y=".5" width="${width - 1}" height="315" rx="18" fill="url(#bg)" stroke="#3b4261"/>
  <g font-family="Segoe UI, Arial, sans-serif">${body}</g>
</svg>
`;
}

export function renderStats(data) {
  const metrics = [
    ['Public repositories', data.repositories, '#7aa2f7'],
    ['Stars received', data.stars, '#e0af68'],
    ['Followers', data.followers, '#bb9af7'],
    ['Forks received', data.forks, '#2ac3de'],
    [`Public commits · ${data.year}`, data.commits, '#9ece6a'],
    [`Public PRs · ${data.year}`, data.pullRequests, '#f7768e'],
  ];
  const tiles = metrics.map(([label, value, color], index) => {
    const x = 24 + (index % 3) * 200;
    const y = 80 + Math.floor(index / 3) * 91;
    return `<g transform="translate(${x} ${y})">
      <rect width="192" height="79" rx="11" fill="#24283b" fill-opacity=".68"/>
      <circle cx="16" cy="20" r="3" fill="${color}"/>
      <text x="28" y="24" fill="#a9b1d6" font-size="12">${escapeXml(label)}</text>
      <text x="16" y="61" fill="${color}" font-size="29" font-weight="700">${number(value)}</text>
    </g>`;
  }).join('\n');
  return frame(640, `${data.username} — public GitHub activity`, metrics.map(([label, value]) => `${label}: ${value}`).join('; '), `
    <path d="M26 25L19 32L26 39M34 25L41 32L34 39" fill="none" stroke="#7aa2f7" stroke-width="2" stroke-linecap="round"/>
    <text x="52" y="39" fill="#c0caf5" font-size="22" font-weight="700">GitHub activity</text>
    <text x="24" y="61" fill="#a9b1d6" font-size="12">@${escapeXml(data.username)} · original public repositories</text>
    ${tiles}
    <path d="M24 272H616" stroke="#3b4261"/>
    <circle cx="28" cy="293" r="3" fill="#9ece6a"/>
    <text x="39" y="297" fill="#a9b1d6" font-size="11">GitHub public API</text>
    <text x="616" y="297" text-anchor="end" fill="#a9b1d6" font-size="11">Updated ${escapeXml(data.updated)}</text>
  `);
}

export function renderLanguages(data) {
  let offset = 24;
  const segments = data.languages.map(language => {
    const width = language.share * 392;
    const rectangle = `<rect x="${offset.toFixed(3)}" y="81" width="${width.toFixed(3)}" height="12" fill="${language.color}"/>`;
    offset += width;
    return rectangle;
  }).join('');
  const rows = data.languages.map((language, index) => {
    const y = 125 + index * Math.min(45, 132 / Math.max(1, data.languages.length - 1));
    return `<circle cx="30" cy="${y - 5}" r="5" fill="${language.color}"/>
      <text x="46" y="${y}" fill="#c0caf5" font-size="15">${escapeXml(language.name)}</text>
      <text x="416" y="${y}" text-anchor="end" fill="${language.color}" font-size="15" font-weight="600">${(language.share * 100).toFixed(2)}%</text>`;
  }).join('\n');
  const description = data.languages.length
    ? data.languages.map(language => `${language.name}: ${(language.share * 100).toFixed(2)}%`).join('; ')
    : 'No language data in the original public repositories yet.';
  return frame(440, `${data.username} — repository languages`, description, `
    <path d="M23 26V39M30 29V39M37 23V39" fill="none" stroke="#bb9af7" stroke-width="3" stroke-linecap="round"/>
    <text x="52" y="39" fill="#c0caf5" font-size="22" font-weight="700">Repository languages</text>
    <text x="24" y="61" fill="#a9b1d6" font-size="12">Share of code bytes · forks excluded</text>
    <defs><clipPath id="bar"><rect x="24" y="81" width="392" height="12" rx="6"/></clipPath></defs>
    <rect x="24" y="81" width="392" height="12" rx="6" fill="#24283b"/>
    <g clip-path="url(#bar)">${segments}</g>
    ${rows || '<text x="24" y="139" fill="#a9b1d6" font-size="14">No language data yet.</text>'}
    <path d="M24 272H416" stroke="#3b4261"/>
    <text x="24" y="297" fill="#a9b1d6" font-size="11">Updated ${escapeXml(data.updated)}</text>
  `);
}

function validateCount(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name} returned by GitHub.`);
  return value;
}

export async function collectData(username, { fetchImpl = fetch, token = '', now = new Date() } = {}) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) throw new Error('Invalid GitHub username.');
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `${username}-profile-cards` };
  if (token) headers.Authorization = `Bearer ${token}`;
  async function request(endpoint) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetchImpl(`https://api.github.com${endpoint}`, { headers, signal: AbortSignal.timeout(20000) });
      if (response.status >= 500 && attempt < 2) {
        await new Promise(done => setTimeout(done, (attempt + 1) * 1000));
        continue;
      }
      if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status} for ${endpoint.split('?')[0]}. Existing cards were kept.`);
      return response.json();
    }
  }
  const profile = await request(`/users/${username}`);
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await request(`/users/${username}/repos?type=owner&per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error('Invalid repository list returned by GitHub.');
    repos.push(...batch.filter(repo => repo.private === false && !repo.fork && repo.owner?.login?.toLowerCase() === username.toLowerCase()));
    if (batch.length < 100) break;
  }
  const year = now.getUTCFullYear();
  const dateRange = `${year}-01-01..${year}-12-31`;
  const [commits, pullRequests] = await Promise.all([
    request(`/search/commits?q=${encodeURIComponent(`author:${username} author-date:${dateRange} is:public`)}&per_page=1`),
    request(`/search/issues?q=${encodeURIComponent(`author:${username} type:pr created:${dateRange} is:public`)}&per_page=1`),
  ]);
  if (commits.incomplete_results !== false || pullRequests.incomplete_results !== false) {
    throw new Error('GitHub returned incomplete search results. Existing cards were kept.');
  }
  const languageMaps = [];
  // Keep requests bounded when the account has many repositories.
  for (let index = 0; index < repos.length; index += 4) {
    languageMaps.push(...await Promise.all(repos.slice(index, index + 4).map(repo => request(`/repos/${username}/${encodeURIComponent(repo.name)}/languages`))));
  }
  return {
    username, year, updated: now.toISOString().slice(0, 10), repositories: repos.length,
    followers: validateCount(profile.followers, 'follower count'),
    stars: repos.reduce((sum, repo) => sum + validateCount(repo.stargazers_count, 'star count'), 0),
    forks: repos.reduce((sum, repo) => sum + validateCount(repo.forks_count, 'fork count'), 0),
    commits: validateCount(commits.total_count, 'commit count'),
    pullRequests: validateCount(pullRequests.total_count, 'pull request count'),
    languages: summarizeLanguages(languageMaps),
  };
}

export async function generateCards({ username = 'devsousaleon', outputDirectory = join(root, 'assets'), ...options } = {}) {
  // Query and render everything before touching either existing card.
  const data = await collectData(username, options);
  const cards = [['github-stats.svg', renderStats(data)], ['top-languages.svg', renderLanguages(data)]];
  await mkdir(outputDirectory, { recursive: true });
  for (const [name, svg] of cards) await writeFile(join(outputDirectory, `${name}.tmp`), svg, 'utf8');
  for (const [name] of cards) await rename(join(outputDirectory, `${name}.tmp`), join(outputDirectory, name));
  return data;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const data = await generateCards({ username: process.env.PROFILE_USERNAME || 'devsousaleon', token: process.env.GITHUB_TOKEN || '' });
    console.log(`Updated ${data.username}: ${data.repositories} public repositories; ${data.languages.length} language groups.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
