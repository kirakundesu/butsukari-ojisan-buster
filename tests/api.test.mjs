// ランキング API を、手元の workerd と D1 で実際に動かして確かめる。Cloudflare には接続しない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { LIMITS } from '../worker/validate.mjs';

const ROOT = new URL('..', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');
const newToken = () => randomBytes(24).toString('hex');
const HOUR = 3600000;

function statements(file) {
  return read(`migrations/${file}`)
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

// wrangler.toml と同じ回数制限で、空の D1 から始める
async function startWorker(t) {
  const mf = new Miniflare({
    ...convertV4MiniflareOptions({
      logRequests: false,
      modules: [
        { type: 'ESModule', path: 'worker/index.mjs', contents: read('worker/index.mjs') },
        { type: 'ESModule', path: 'worker/validate.mjs', contents: read('worker/validate.mjs') },
      ],
      modulesRoot: '.',
      compatibilityDate: '2026-10-01',
      d1Databases: { DB: 'test' },
      ratelimits: {
        API_LIMIT: { namespace_id: '1001', simple: { limit: 60, period: 60 } },
        SCORE_LIMIT: { namespace_id: '1002', simple: { limit: 10, period: 60 } },
        RUN_LIMIT: { namespace_id: '1003', simple: { limit: 20, period: 60 } },
        NET_LIMIT: { namespace_id: '1004', simple: { limit: 600, period: 60 } },
      },
      cache: true,
    }),
    enableDevRegistry: false,
  });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_init.sql', '0002_bans.sql']) {
    for (const sql of statements(file)) await db.prepare(sql).run();
  }
  const call = async (path, { body, ip = '203.0.113.1', headers = {} } = {}) => {
    const res = await mf.dispatchFetch(new URL(path, 'https://game.example/').href, {
      method: body ? 'POST' : 'GET',
      headers: { 'CF-Connecting-IP': ip, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
  };
  // 遊びを始めて、少し時間がたったことにしてから記録を送る
  const play = async ({ name, ip, token = newToken(), elapsed = 60000 }) => {
    const { data } = await call('/api/runs', { body: { token }, ip });
    await db.prepare('UPDATE runs SET started_at = started_at - ?').bind(elapsed).run();
    const res = await call('/api/scores', { body: { token, runId: data.runId, name, distance: 7000, flown: 14, level: 1, maxCombo: 5 }, ip });
    return { token, ...res };
  };
  return { mf, db, call, play };
}

async function insertScores(db, count, { updatedAt, distance = (i) => 100000 - i }) {
  const insert = db.prepare('INSERT INTO scores (player_hash, name, name_key, distance, flown, level, max_combo, updated_at) VALUES (?, ?, ?, ?, 10, 1, 1, ?)');
  for (let i = 0; i < count; i += 200) {
    const rows = [];
    for (let k = i; k < Math.min(i + 200, count); k++) rows.push(insert.bind(`h${k}`, `n${k}`, `n${k}`, distance(k), updatedAt));
    await db.batch(rows);
  }
}

test('limit を変えても一覧のキャッシュを避けられない', async (t) => {
  const { db, call } = await startWorker(t);
  await insertScores(db, 10, { updatedAt: 1 });
  const before = await call('/api/ranking?limit=5');
  assert.equal(before.data.entries.length, 5);
  await db.prepare('UPDATE scores SET name = ?, distance = 999999 WHERE player_hash = ?').bind('変更後', 'h9').run();
  const after = await call('/api/ranking?limit=6');
  assert.equal(after.data.entries.length, 6);
  assert.equal(after.data.entries[0].name, 'n0', 'キャッシュから返る');
});

test('一覧の応答に識別子のハッシュを含めない', async (t) => {
  const { call, play } = await startWorker(t);
  const { token } = await play({ name: 'テスト' });
  const res = await call('/api/ranking', { headers: { 'X-Player-Token': token } });
  assert.equal(res.data.me.name, 'テスト');
  assert.equal(res.data.me.isMe, true);
  assert.ok(!JSON.stringify(res.data).includes('player_hash'));
});

test('上位の外にいる人の順位も出す', async (t) => {
  const { db, call, play } = await startWorker(t);
  await insertScores(db, 120, { updatedAt: 1, distance: () => 50000 });
  const { token } = await play({ name: 'テスト' });
  const res = await call('/api/ranking?limit=1', { headers: { 'X-Player-Token': token } });
  assert.equal(res.data.me.rank, 121);
  assert.equal(res.data.entries.length, 1);
});

test('遊びの開始は同じ接続元から 1 分 20 回まで', async (t) => {
  const { call } = await startWorker(t);
  const statuses = [];
  for (let i = 0; i < 21; i++) statuses.push((await call('/api/runs', { body: { token: newToken() } })).status);
  assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
  assert.equal(statuses[20], 429);
  assert.equal((await call('/api/runs', { body: { token: newToken() }, ip: '203.0.113.2' })).status, 200);
});

test('名前の変更は記録の送信と同じ 1 分 10 回まで', async (t) => {
  const { call, play } = await startWorker(t);
  const { token } = await play({ name: 'かわる', ip: '203.0.113.5' });
  const statuses = [];
  for (let i = 0; i < 10; i++) statuses.push((await call('/api/name', { body: { token, name: `かわる${i}` }, ip: '203.0.113.5' })).status);
  // 最初の記録の送信で 1 回使っている
  assert.equal(statuses[8], 200);
  assert.equal(statuses[9], 429);
});

test('IPv6 は /64 を変えても /48 全体の枠を超えられない', async (t) => {
  const { call } = await startWorker(t);
  for (let net = 0; net < 10; net++) {
    for (let i = 0; i < 60; i++) {
      const res = await call('/api/ranking', { ip: `2001:db8:1:${net.toString(16)}::1` });
      assert.equal(res.status, 200);
    }
  }
  assert.equal((await call('/api/ranking', { ip: '2001:db8:1:ff::1' })).status, 429);
  assert.equal((await call('/api/ranking', { ip: '2001:db8:2:ff::1' })).status, 200);
});

test('新しいプレイヤーは接続元、/48、サイト全体の 3 段階で抑える', async (t) => {
  const { db, play } = await startWorker(t);
  const first = await play({ name: 'さいしょ', ip: '2001:db8:1:1::1' });
  assert.equal(first.status, 200);

  await db.prepare('UPDATE ip_daily SET n = ?').bind(LIMITS.newPlayersPerDay).run();
  assert.equal((await play({ name: 'ふたり目', ip: '2001:db8:1:1::2' })).data.error, 'too_many_players');
  assert.equal((await play({ name: 'さんにん目', ip: '2001:db8:1:2::1' })).status, 200, '同じ /48 でも /64 が違えば枠が残っている');

  await db.prepare('UPDATE ip_daily SET n = ?').bind(LIMITS.newPlayersPerNetwork).run();
  assert.equal((await play({ name: 'よにん目', ip: '2001:db8:1:3::1' })).data.error, 'too_many_players');
  assert.equal((await play({ name: 'ごにん目', ip: '2001:db8:2:1::1' })).status, 200, '/48 が違えば枠が残っている');

  await db.prepare('UPDATE ip_daily SET n = ?').bind(LIMITS.newPlayersPerDayAll).run();
  assert.equal((await play({ name: 'ろくにん目', ip: '2001:db8:3:1::1' })).data.error, 'too_many_players');

  const again = await play({ name: 'さいしょ', ip: '2001:db8:1:1::1', token: first.token });
  assert.equal(again.status, 200, 'すでにいるプレイヤーは上限のあとでも送れる');
});

test('長く放っておいた遊びの記録も受け取る', async (t) => {
  const { play } = await startWorker(t);
  const res = await play({ name: '長考', elapsed: 3 * HOUR });
  assert.equal(res.status, 200);
});

test('毎日の掃除は、順位の外で更新のない行と古い一時データだけを消す', async (t) => {
  const { mf, db } = await startWorker(t);
  const now = Date.now();
  await insertScores(db, LIMITS.keepScores, { updatedAt: now });
  const insert = db.prepare('INSERT INTO scores (player_hash, name, name_key, distance, flown, level, max_combo, updated_at) VALUES (?, ?, ?, 1, 10, 1, 1, ?)');
  await db.batch([
    insert.bind('stale', '古い人', '古い人', now - LIMITS.keepStaleMs - 1000),
    insert.bind('recent', '最近の人', '最近の人', now - HOUR),
    db.prepare('INSERT INTO runs VALUES (?, ?, ?)').bind('oldrun', 'id', now - LIMITS.keepRunsMs - 1000),
    db.prepare('INSERT INTO runs VALUES (?, ?, ?)').bind('newrun', 'id', now - 3 * HOUR),
  ]);
  const worker = await mf.getWorker();
  await worker.scheduled({ cron: '30 18 * * *' });
  const hashes = (await db.prepare("SELECT player_hash FROM scores WHERE player_hash IN ('stale', 'recent')").all()).results.map((r) => r.player_hash);
  assert.deepEqual(hashes, ['recent']);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM scores').first()).n, LIMITS.keepScores + 1);
  const runs = (await db.prepare('SELECT player_hash FROM runs').all()).results.map((r) => r.player_hash);
  assert.deepEqual(runs, ['newrun']);
});
