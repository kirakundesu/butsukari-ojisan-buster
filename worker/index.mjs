// ランキング API。/api/* だけここで処理し、それ以外は public/ の静的ファイルを返す。
import { LIMITS, checkScore, clampLimit, clientKey, dayNumber, nameKey, networkKey, usableName, validRunId, validToken } from './validate.mjs';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

const fail = (error, status = 400) => json({ error }, status);

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const hashToken = (token) => sha256(token);

// 上限を超えた本文は最後まで読まずに断る（Content-Length が無い送り方でも同じ）
async function readBody(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > LIMITS.bodyMax || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > LIMITS.bodyMax) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(merged));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// 別のサイトのページから送らせないようにする
function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function overLimit(binding, key) {
  if (!binding) return false;
  const { success } = await binding.limit({ key });
  return !success;
}

function rowToEntry(row, rank, isMe) {
  return { rank, name: row.name, distance: row.distance, flown: row.flown, level: row.level, maxCombo: row.max_combo, isMe };
}

const higherFirst = (a, b) => b.distance - a.distance || a.updated_at - b.updated_at;

async function rankOf(db, row) {
  const above = await db
    .prepare('SELECT COUNT(*) AS n FROM scores WHERE distance > ?1 OR (distance = ?1 AND updated_at < ?2)')
    .bind(row.distance, row.updated_at)
    .first();
  return above.n + 1;
}

// アクセスが増えても D1 を読みすぎないよう、結果を少しの間だけ覚えておく
async function remember(url, env, name, seconds, load) {
  const ttl = Number(env.CACHE_SECONDS ?? seconds);
  if (ttl <= 0) return load();
  const key = new Request(`${url.origin}/api/__cache/${name}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json();
  const data = await load();
  await caches.default.put(key, new Response(JSON.stringify(data), { headers: { 'Cache-Control': `public, max-age=${ttl}` } }));
  return data;
}

// 一覧はいつも同じ件数で取って切り出す。limit を変えてキャッシュを避けられないように。
async function topList(url, env) {
  const rows = await remember(url, env, 'top', 30, async () => {
    const { results } = await env.DB.prepare('SELECT * FROM scores ORDER BY distance DESC, updated_at ASC LIMIT ?').bind(LIMITS.listMax).all();
    return results;
  });
  // 全員が一覧に収まっていれば数えなくてよい。総数は全行を読むので、長めに覚えておく。
  if (rows.length < LIMITS.listMax) return { rows, total: rows.length };
  const total = await remember(url, env, 'total', 300, async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM scores').first()).n);
  return { rows, total };
}

async function getRanking(request, url, env) {
  const limit = clampLimit(url.searchParams.get('limit'));
  const top = await topList(url, env);
  const token = request.headers.get('x-player-token');
  const myHash = validToken(token) ? await hashToken(token) : null;
  // 自分の行だけは常に最新にする。登録した直後に古い一覧が見えないように。
  const mine = myHash ? await env.DB.prepare('SELECT * FROM scores WHERE player_hash = ?').bind(myHash).first() : null;
  let rows = top.rows;
  if (mine) rows = [...rows.filter((r) => r.player_hash !== myHash), mine].sort(higherFirst);
  rows = rows.slice(0, limit);
  const entries = rows.map((row, i) => rowToEntry(row, i + 1, row.player_hash === myHash));
  let me = entries.find((e) => e.isMe) || null;
  // 順位の計算は多くの行を読むので、同じ記録なら少しの間は計算し直さない
  if (mine && !me) {
    const rank = await remember(url, env, `rank-${mine.distance}-${mine.updated_at}`, 30, () => rankOf(env.DB, mine));
    me = rowToEntry(mine, rank, true);
  }
  return json({ entries, total: Math.max(top.total, entries.length), me });
}

async function isBanned(db, hash) {
  return !!(await db.prepare('SELECT 1 FROM bans WHERE player_hash = ?').bind(hash).first());
}

async function nameTaken(db, key, hash) {
  const owner = await db.prepare('SELECT player_hash FROM scores WHERE name_key = ?').bind(key).first();
  return !!owner && owner.player_hash !== hash;
}

async function startRun(body, env) {
  if (!validToken(body.token)) return fail('bad_token');
  const hash = await hashToken(body.token);
  const runId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO runs (player_hash, id, started_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(player_hash) DO UPDATE SET id = excluded.id, started_at = excluded.started_at`,
  )
    .bind(hash, runId, Date.now())
    .run();
  return json({ runId });
}

// 新しいプレイヤーを増やせる数を抑える。接続元ごと、IPv6 の /48 ごと、サイト全体の 3 段階。
// 枠が残っていれば、数を増やす文を返す。残っていなければ null。
async function newPlayerQuota(env, who, now) {
  const day = dayNumber(now);
  const salt = env.IP_SALT || 'butsukari-ojisan-buster';
  // IPv4 は接続元と /48 の単位が同じなので、小さい方の枠が残るよう接続元をあとに置く
  const quotas = new Map([
    ['all', LIMITS.newPlayersPerDayAll],
    [who.network, LIMITS.newPlayersPerNetwork],
    [who.ip, LIMITS.newPlayersPerDay],
  ]);
  const statements = [];
  for (const [key, max] of quotas) {
    const ipHash = await sha256(`${day}:${salt}:${key}`);
    const used = await env.DB.prepare('SELECT n FROM ip_daily WHERE ip_hash = ? AND day = ?').bind(ipHash, day).first();
    if (used && used.n >= max) return null;
    statements.push(
      env.DB.prepare(
        `INSERT INTO ip_daily (ip_hash, day, n) VALUES (?1, ?2, 1)
         ON CONFLICT(ip_hash, day) DO UPDATE SET n = n + 1`,
      ).bind(ipHash, day),
    );
  }
  return statements;
}

async function submitScore(body, env, who) {
  if (!validToken(body.token)) return fail('bad_token');
  if (!validRunId(body.runId)) return fail('bad_run');
  // 名前の間違いでは遊びの記録を失わないよう、遊びを消す前に確かめる
  const name = usableName(body.name);
  if (!name) return fail('bad_name');
  const key = nameKey(name);
  const hash = await hashToken(body.token);
  if (await isBanned(env.DB, hash)) return fail('banned', 403);
  const run = await env.DB.prepare('SELECT started_at FROM runs WHERE player_hash = ? AND id = ?').bind(hash, body.runId).first();
  if (!run) return fail('unknown_run', 409);
  if (await nameTaken(env.DB, key, hash)) return fail('name_taken', 409);
  const now = Date.now();
  const checked = checkScore(body, now - run.started_at);
  const dropRun = env.DB.prepare('DELETE FROM runs WHERE player_hash = ? AND id = ?').bind(hash, body.runId);
  if (!checked.ok) {
    await dropRun.run();
    return fail(checked.error, 422);
  }
  const v = checked.value;
  const before = await env.DB.prepare('SELECT distance FROM scores WHERE player_hash = ?').bind(hash).first();
  const statements = [
    dropRun,
    env.DB.prepare(
      `INSERT INTO scores (player_hash, name, name_key, distance, flown, level, max_combo, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(player_hash) DO UPDATE SET
         distance = excluded.distance, flown = excluded.flown, level = excluded.level,
         max_combo = excluded.max_combo, updated_at = excluded.updated_at
       WHERE excluded.distance > scores.distance`,
    ).bind(hash, name, key, v.distance, v.flown, v.level, v.maxCombo, now),
    env.DB.prepare('UPDATE scores SET name = ?, name_key = ? WHERE player_hash = ?').bind(name, key, hash),
  ];
  if (!before) {
    const quota = await newPlayerQuota(env, who, now);
    if (!quota) return fail('too_many_players', 429);
    statements.push(...quota);
  }
  try {
    // まとめて 1 回で実行する。失敗したときは遊びが残るので、送り直せる。
    await env.DB.batch(statements);
  } catch (err) {
    if (String(err).includes('UNIQUE')) return fail('name_taken', 409);
    throw err;
  }
  const row = await env.DB.prepare('SELECT * FROM scores WHERE player_hash = ?').bind(hash).first();
  return json({
    improved: !before || v.distance > before.distance,
    me: rowToEntry(row, await rankOf(env.DB, row), true),
  });
}

async function rename(body, env) {
  if (!validToken(body.token)) return fail('bad_token');
  const name = usableName(body.name);
  if (!name) return fail('bad_name');
  const key = nameKey(name);
  const hash = await hashToken(body.token);
  if (await isBanned(env.DB, hash)) return fail('banned', 403);
  if (await nameTaken(env.DB, key, hash)) return fail('name_taken', 409);
  try {
    const result = await env.DB.prepare('UPDATE scores SET name = ?, name_key = ? WHERE player_hash = ?').bind(name, key, hash).run();
    return json({ name, updated: result.meta.changes > 0 });
  } catch (err) {
    if (String(err).includes('UNIQUE')) return fail('name_taken', 409);
    throw err;
  }
}

async function handleApi(request, url, env) {
  // 識別子を暗号化なしで流さない
  if (url.protocol === 'http:' && !LOCAL_HOST.test(url.hostname)) return fail('https_required', 403);
  const address = request.headers.get('cf-connecting-ip');
  const who = { ip: clientKey(address), network: networkKey(address) };
  if (await overLimit(env.API_LIMIT, who.ip)) return fail('too_many_requests', 429);
  if (await overLimit(env.NET_LIMIT, who.network)) return fail('too_many_requests', 429);
  if (`${request.method} ${url.pathname}` === 'GET /api/ranking') return getRanking(request, url, env);
  const posts = { '/api/runs': startRun, '/api/scores': submitScore, '/api/name': rename };
  const handler = posts[url.pathname];
  if (!handler) return fail('not_found', 404);
  if (request.method !== 'POST') return fail('method_not_allowed', 405);
  if (!sameOrigin(request, url)) return fail('forbidden', 403);
  // D1 へ書き込む操作には、全体の枠より低い枠を設ける
  const writeLimit = url.pathname === '/api/runs' ? env.RUN_LIMIT : env.SCORE_LIMIT;
  if (await overLimit(writeLimit, who.ip)) return fail('too_many_requests', 429);
  const body = await readBody(request);
  if (!body) return fail('bad_body');
  return handler(body, env, who);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, url, env);
    } catch (err) {
      console.error(err);
      return fail('server_error', 500);
    }
  },

  // 毎日の掃除。放っておくと増え続ける行を消す。
  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM runs WHERE started_at < ?').bind(now - LIMITS.keepRunsMs),
      env.DB.prepare('DELETE FROM ip_daily WHERE day < ?').bind(dayNumber(now) - 1),
      // 偽の記録に押し出されても正しい記録がすぐ消えないよう、しばらく更新のない行だけを消す
      env.DB.prepare(
        'DELETE FROM scores WHERE updated_at < ?1 AND player_hash NOT IN (SELECT player_hash FROM scores ORDER BY distance DESC, updated_at ASC LIMIT ?2)',
      ).bind(now - LIMITS.keepStaleMs, LIMITS.keepScores),
    ]);
  },
};
