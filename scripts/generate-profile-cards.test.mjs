import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectData, generateCards, renderLanguages, summarizeLanguages } from './generate-profile-cards.mjs';

function mockGitHub({ incomplete = false, failLanguages = false } = {}) {
  return async url => {
    const endpoint = new URL(url);
    let payload;
    if (endpoint.pathname === '/users/example') payload = { followers: 8 };
    else if (endpoint.pathname === '/users/example/repos') payload = [
      { name: 'original', owner: { login: 'example' }, private: false, fork: false, stargazers_count: 3, forks_count: 1 },
      { name: 'fork', owner: { login: 'example' }, private: false, fork: true, stargazers_count: 100, forks_count: 20 },
      { name: 'private', owner: { login: 'example' }, private: true, fork: false, stargazers_count: 200, forks_count: 30 },
    ];
    else if (endpoint.pathname.startsWith('/search/')) {
      assert.match(endpoint.searchParams.get('q'), /is:public/);
      assert.match(endpoint.searchParams.get('q'), /2026-01-01\.\.2026-12-31/);
      payload = { total_count: endpoint.pathname.endsWith('commits') ? 12 : 2, incomplete_results: incomplete };
    } else if (endpoint.pathname === '/repos/example/original/languages') {
      if (failLanguages) return { ok: false, status: 403 };
      payload = { 'C#': 300, HLSL: 100 };
    } else throw new Error(`Unexpected request: ${url}`);
    return { ok: true, status: 200, json: async () => payload };
  };
}

const now = new Date('2026-10-10T12:00:00Z');

test('public metrics exclude private repositories and forks', async () => {
  const data = await collectData('example', { fetchImpl: mockGitHub(), now });
  assert.equal(data.repositories, 1);
  assert.equal(data.stars, 3);
  assert.equal(data.forks, 1);
  assert.equal(data.commits, 12);
  assert.equal(data.pullRequests, 2);
  assert.equal(data.languages[0].share, 0.75);
});

test('language shares use code bytes and preserve all bytes in Other', () => {
  const languages = summarizeLanguages([{ A: 600, B: 200, C: 100, D: 50, E: 25, F: 15, G: 10 }, { A: 100 }]);
  assert.equal(languages.length, 6);
  assert.equal(languages.at(-1).name, 'Other');
  assert.equal(languages.at(-1).bytes, 25);
  assert.ok(Math.abs(languages.reduce((sum, language) => sum + language.share, 0) - 1) < 1e-12);
  assert.deepEqual(summarizeLanguages([{}, { A: 0 }]), []);
});

test('SVG escapes language names and supports empty repositories', () => {
  const svg = renderLanguages({ username: 'example', updated: '2026-10-10', languages: summarizeLanguages([{ '<C & C++>': 100 }]) });
  assert.match(svg, /&lt;C &amp; C\+\+&gt;/);
  assert.doesNotMatch(svg, /<C &/);
  assert.match(renderLanguages({ username: 'example', updated: '2026-10-10', languages: [] }), /No language data yet/);
});

for (const [name, options] of [['incomplete search', { incomplete: true }], ['API failure', { failLanguages: true }]]) {
  test(`${name} leaves both existing cards unchanged`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'profile-cards-'));
    try {
      await writeFile(join(directory, 'github-stats.svg'), 'previous stats');
      await writeFile(join(directory, 'top-languages.svg'), 'previous languages');
      await assert.rejects(generateCards({ username: 'example', outputDirectory: directory, fetchImpl: mockGitHub(options), now }));
      assert.equal(await readFile(join(directory, 'github-stats.svg'), 'utf8'), 'previous stats');
      assert.equal(await readFile(join(directory, 'top-languages.svg'), 'utf8'), 'previous languages');
      assert.equal((await readdir(directory)).length, 2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('successful queries generate both cards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'profile-cards-'));
  try {
    await generateCards({ username: 'example', outputDirectory: directory, fetchImpl: mockGitHub(), now });
    assert.match(await readFile(join(directory, 'github-stats.svg'), 'utf8'), /Public commits · 2026/);
    assert.match(await readFile(join(directory, 'top-languages.svg'), 'utf8'), /75\.00%/);
    assert.equal((await readdir(directory)).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
