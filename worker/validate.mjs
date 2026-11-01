// 送られてきた値の検査。D1 や Cloudflare の機能に触らないので node --test でそのまま試せる。
export const LIMITS = {
  nameMax: 12,
  bodyMax: 2048,
  listMax: 100,
  listDefault: 50,
  minRunMs: 3000,
  maxRunMs: 2 * 60 * 60 * 1000,
  // 巻き込みまで含めた bot の実測の最大は 1 秒 802 m、1 人 1179 m、1 秒 0.99 人。余裕を持たせてある。
  metersPerSecond: 1500,
  flownPerSecond: 3,
  metersPerFlown: 1600,
  metersPerBoss: 3200,
  grace: 3000,
  perLevel: 10,
  bossEvery: 5,
  newPlayersPerDay: 30, // 同じ接続元から 1 日に増やせるプレイヤーの数
  newPlayersPerNetwork: 300, // IPv6 の /48 全体で 1 日に増やせる数。/64 を変えて増やされないように
  newPlayersPerDayAll: 1000, // サイト全体で 1 日に増やせる数
  keepScores: 3000, // ランキングに残す人数。これより下で、しばらく更新のない行を毎日消す
  keepStaleMs: 30 * 24 * 60 * 60 * 1000,
  keepRunsMs: 24 * 60 * 60 * 1000, // 遊びの開始記録を残す時間。長く放っておいた遊びも送れるように
};

// 明らかに不適切な名前。key はひらがなと小文字にそろえた形で書く（nameKey を参照）。
const NG_CONTAINS = [
  // 性的な言葉
  'ちんこ', 'ちんぽ', 'ちそこ', 'まんこ', 'せっくす', 'おまんこ', 'れいぷ', '強姦', 'fuck', 'fvck', 'porn', 'pussy', 'penis', 'sex',
  // 差別や暴力の言葉
  '死ね', '氏ね', 'たひね', 'しねかす', '殺す', 'ころすぞ', '殺害', 'ころしてやる', 'きちがい', '気違い', '池沼', 'がいじ', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'hitler', 'nazi', 'ひとらー', 'なちす',
  // 運営のなりすましと宣伝
  '運営', '運營', 'うんえい', '公式', 'こうしき', '管理人', 'かんりにん', '管理者', 'かんりしゃ', 'admin', 'official', 'moderator', 'どっとこむ', 'どっとねっと', 'http',
];
// Yamashita や Kinoshita のような名字は止めない
const NG_PATTERNS = [/shit(?!a)/];
// 数字を英字に見立てた書き方（adm1n、sh1t など）も同じ言葉として調べる
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
// カタカナに見える漢字（力タカナ、バスタ一 など）は、そのカタカナと同じ名前として扱う
const LOOKALIKE = { 力: 'か', 夕: 'た', 工: 'え', 口: 'ろ', 八: 'は', 二: 'に', 卜: 'と', 一: '' };
const NG_EXACT = ['しね', 'ちね', 'ころす', 'くず', 'かす', 'ごみ', 'ぶす', 'でぶ', 'ばか', 'あほ', 'うんこ', 'うんち', 'ちんちん', 'おっぱい', 'きもい', 'うざい'];

export function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

export function validRunId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(id);
}

// 表記をそろえ、見えない文字を取り除く。使えない名前は null。
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw
    .normalize('NFKC')
    .replace(/[\p{C}\p{Default_Ignorable_Code_Point}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!name || [...name].length > LIMITS.nameMax) return null;
  // ひらがな、カタカナ、漢字、ハングル、半角英数字と、名前によく使う記号だけを通す。
  // 英字によく似た別の文字（キリル文字の а など）でのなりすまし、URL、画面を崩す文字はここで弾かれる。
  if (!/^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}가-힣A-Za-z0-9 _\-・ー~!?♪☆★]+$/u.test(name)) return null;
  // 記号だけの名前を断る
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  return name;
}

// 同じ名前の判定と、禁止語の判定に使う形。カタカナはひらがな、英字は小文字にそろえ、記号を除く。
export function nameKey(name) {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[力夕工口八二卜一]/g, (ch) => LOOKALIKE[ch])
    .replace(/[^\p{L}\p{N}]|ー/gu, '');
}

export function isBlockedName(name) {
  const key = nameKey(name);
  return [key, key.replace(/[013457]/g, (digit) => LEET[digit])].some(
    (text) => NG_EXACT.includes(text) || NG_CONTAINS.some((word) => text.includes(word)) || NG_PATTERNS.some((re) => re.test(text)),
  );
}

// 使える名前なら、そろえた形を返す。使えなければ null。
export function usableName(raw) {
  const name = cleanName(raw);
  return name && nameKey(name) && !isBlockedName(name) ? name : null;
}

function isCount(value, max) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

// 記録がありえる値かを、サーバーで測った経過時間と、数字どうしの関係で確かめる。
// ブラウザで動くゲームなので不正を完全には防げない。あからさまな改ざんを弾くためのもの。
export function checkScore(body, elapsedMs) {
  if (!(elapsedMs >= LIMITS.minRunMs)) return { ok: false, error: 'bad_time' };
  const { distance, flown, level, maxCombo } = body;
  if (!isCount(distance, 1e9) || distance === 0) return { ok: false, error: 'bad_distance' };
  if (!isCount(flown, 1e6) || !isCount(level, 1e5) || !isCount(maxCombo, 1e6)) return { ok: false, error: 'bad_count' };
  // 一時停止して長く放っておいた遊びも断らない。距離の上限が広がらないよう、経過時間は上限までとして数える
  const seconds = Math.min(elapsedMs, LIMITS.maxRunMs) / 1000;
  if (distance > seconds * LIMITS.metersPerSecond + LIMITS.grace) return { ok: false, error: 'too_far' };
  if (flown > seconds * LIMITS.flownPerSecond + 5) return { ok: false, error: 'too_many' };
  // レベルは飛ばした人数で決まるので、大きくずれていれば改ざん
  const bosses = Math.floor(level / LIMITS.bossEvery);
  if (flown < level * LIMITS.perLevel) return { ok: false, error: 'bad_level' };
  if (flown > (level + 2) * LIMITS.perLevel + bosses + 1) return { ok: false, error: 'bad_level' };
  if (distance > flown * LIMITS.metersPerFlown + (bosses + 1) * LIMITS.metersPerBoss + LIMITS.grace) return { ok: false, error: 'too_far' };
  // コンボは複数回受ける相手や飛び道具でも増えるので、人数の 3 倍とボスの回数まで見込む
  if (maxCombo > flown * 3 + (bosses + 1) * 15) return { ok: false, error: 'bad_count' };
  return { ok: true, value: { distance, flown, level, maxCombo } };
}

export function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return LIMITS.listDefault;
  return Math.min(n, LIMITS.listMax);
}

function ipv6Groups(ip) {
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const h = head.split(':').filter(Boolean);
  const t = tail.split(':').filter(Boolean);
  return [...h, ...Array(Math.max(8 - h.length - t.length, 0)).fill('0'), ...t];
}

// 回数制限の単位。IPv6 は 1 回線に大量の番号が割り当てられるので、/64 でまとめる。
export function clientKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  return `${ipv6Groups(ip).slice(0, 4).join(':')}::/64`;
}

// /64 を変えながら来る相手のための、ゆるい枠の単位。IPv6 は /48、IPv4 は接続元そのまま。
export function networkKey(ip) {
  if (!ip) return 'unknown';
  if (!ip.includes(':')) return ip;
  return `${ipv6Groups(ip).slice(0, 3).join(':')}::/48`;
}

export function dayNumber(ms) {
  return Math.floor(ms / 86400000);
}
