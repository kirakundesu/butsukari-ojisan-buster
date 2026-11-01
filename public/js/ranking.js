'use strict';
// エンドレスモードのランキング。Cloudflare Worker の /api と話す。
// API が無い環境（開発用の静的サーバー、ファイル直開き、Claude の公開ページ）では null や offline を返す。
// 呼び出し側はその場合、この端末の記録だけを見せる。
const Ranking = (() => {
  const TIMEOUT_MS = 8000;

  async function call(path, opts = {}) {
    if (location.protocol === 'file:') return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(path, { ...opts, signal: ctrl.signal });
      // 静的サーバーの 404 ページなどは「API が無い」として扱う
      if (!(res.headers.get('content-type') || '').includes('application/json')) return null;
      return { ok: res.ok, status: res.status, data: await res.json() };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const post = (path, body) =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async top(token, limit = 50) {
      const r = await call(`/api/ranking?limit=${limit}`, token ? { headers: { 'X-Player-Token': token } } : {});
      return r && r.ok ? r.data : null;
    },
    async startRun(token) {
      const r = await post('/api/runs', { token });
      return r && r.ok ? r.data.runId : null;
    },
    // 混み合っているときやサーバーの不調（429、5xx）は retryable で知らせる。記録は送り直せる。
    // 新しいプレイヤーの上限は翌日まで変わらないので、送り直しても無駄になる。
    async submit(payload) {
      const r = await post('/api/scores', payload);
      if (!r) return { offline: true, retryable: true };
      if (r.ok) return r.data;
      return { error: r.data.error, retryable: r.data.error !== 'too_many_players' && (r.status === 429 || r.status >= 500) };
    },
    async rename(token, name) {
      const r = await post('/api/name', { token, name });
      if (!r) return { offline: true };
      return r.ok ? r.data : { error: r.data.error };
    },
  };
})();
