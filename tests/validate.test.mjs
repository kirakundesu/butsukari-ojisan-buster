import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { LIMITS, checkScore, clampLimit, cleanName, clientKey, isBlockedName, nameKey, networkKey, usableName, validRunId, validToken } from '../worker/validate.mjs';

const require = createRequire(import.meta.url);
const Rules = require('../public/js/rules.js');

const MINUTE = 60000;
const score = (over = {}) => ({ distance: 12000, flown: 40, level: 4, maxCombo: 30, ...over });

test('名前は表記をそろえ、長すぎるものや空のものは断る', () => {
  assert.equal(cleanName('  ﾊﾞｽﾀｰ  '), 'バスター');
  assert.equal(cleanName('a\u0000b​c'), 'abc');
  assert.equal(cleanName('a   b'), 'a b');
  assert.equal(cleanName('あ'.repeat(LIMITS.nameMax)), 'あ'.repeat(LIMITS.nameMax));
  assert.equal(cleanName('あ'.repeat(LIMITS.nameMax + 1)), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(''), null);
  assert.equal(cleanName(123), null);
  assert.equal(cleanName(null), null);
});

test('見えない名前や画面を崩す名前は断る', () => {
  const bad = [
    'ㅤ'.repeat(6), // ハングルの空白文字
    '⠀⠀⠀', // 点字の空白
    'ᅟᅠ',
    '️️',
    'a' + '́'.repeat(11), // 文字を重ねて上下にはみ出させる
    '‮abc', // 向きを逆にしたうえで HTML 風の文字も含む場合
    '!!!',
    '---',
  ];
  for (const name of bad) {
    const cleaned = cleanName(name);
    assert.ok(cleaned === null || cleaned === 'abc', JSON.stringify(name));
  }
  assert.equal(cleanName('‮abc'), 'abc', '向きを変える文字は取り除く');
});

test('URL や HTML に使う記号は断る', () => {
  for (const name of ['bit.ly/abc12', 'ｅｖｉｌ．ｃｏｍ', 'a@b', '<b>x</b>', '<img src=x>', 'javascript:', '#tag', 'a&b']) {
    assert.equal(cleanName(name), null, name);
  }
});

test('ふつうの名前は通る', () => {
  for (const name of ['バスター', 'ぶつかり太郎', 'Taro_99', '肩幅☆最強', 'ほげ-ふが', '田中 太郎', 'お疲れ様!', '定時退社♪']) {
    assert.equal(usableName(name), name, name);
  }
});

test('禁止語は、表記を変えても断る', () => {
  for (const name of ['死ね', 'シネ', 'しね', 'ＦＵＣＫ', 'f u c k', 'fuck you', 'ちんこ', 'チンコ', '公式運営', '運営です', 'ADMIN', 'こ ろ す']) {
    assert.equal(usableName(name), null, name);
  }
});

test('読みや数字に置き換えた禁止語も断る', () => {
  for (const name of ['ウンエイ', 'コウシキ', 'カンリニン', '運營', 'adm1n', '0fficial', '氏ね', 'タヒね', 'しねカス', 'ころすぞ', 'チソコ', 'fvck', 'sh1t', 'n1gger', 'shit']) {
    assert.equal(usableName(name), null, name);
  }
});

test('英字によく似た別の文字の名前は断る', () => {
  for (const name of ['аdmin', 'admın', 'ᴀᴅᴍɪɴ', 'fυck', 'hıtler', 'evilꓸcom', 'ꓸꓸꓸ', 'ˑˑˑ', 'Tаro']) {
    assert.equal(usableName(name), null, name);
  }
});

test('カタカナに見える漢字でのなりすましは同じ名前として扱う', () => {
  assert.equal(nameKey('力タカナ'), nameKey('カタカナ'));
  assert.equal(nameKey('夕ロウ'), nameKey('タロウ'));
  assert.equal(nameKey('バスタ一'), nameKey('バスター'));
  assert.equal(nameKey('工リカ'), nameKey('エリカ'));
});

test('禁止語に似ているだけの名字やネットの言葉は止めない', () => {
  for (const name of ['Yamashita', 'Kinoshita', 'Matsushita', 'Morishita', 'Takeshita', 'Miyashita', '草www', '김철수', '佐々木', '山口 二郎']) {
    assert.equal(usableName(name), name, name);
  }
});

test('禁止語が名前の一部に偶然入っていても、短い語なら止めない', () => {
  for (const name of ['よしね', 'ばかうけ', 'あほうどり', 'くずもち', 'ごみ箱係', 'かすてら']) {
    assert.equal(isBlockedName(name), false, name);
  }
});

test('同じ読みの名前は同じものとして扱う', () => {
  assert.equal(nameKey('バスター'), nameKey('ばすた'));
  assert.equal(nameKey('ＴＡＲＯ'), nameKey('taro'));
  assert.equal(nameKey('た ろ う'), nameKey('たろう'));
  assert.equal(nameKey('ﾀﾛｳ'), nameKey('タロウ'));
  assert.notEqual(nameKey('たろう'), nameKey('じろう'));
});

test('識別子の形を確かめる', () => {
  assert.equal(validToken('a'.repeat(32)), true);
  assert.equal(validToken('a'.repeat(31)), false);
  assert.equal(validToken('a'.repeat(129)), false);
  assert.equal(validToken("a'; DROP TABLE scores;--aaaaaaaaaaaaa"), false);
  assert.equal(validToken(undefined), false);
  assert.equal(validRunId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(validRunId('x'), false);
});

test('ふつうの記録は受け取る', () => {
  const r = checkScore(score(), 2 * MINUTE);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { distance: 12000, flown: 40, level: 4, maxCombo: 30 });
});

test('ありえない記録は断る', () => {
  const cases = [
    [score({ distance: 0 }), MINUTE, 'bad_distance'],
    [score({ distance: -5 }), MINUTE, 'bad_distance'],
    [score({ distance: 1.5 }), MINUTE, 'bad_distance'],
    [score({ distance: '100' }), MINUTE, 'bad_distance'],
    [score({ distance: 1e12 }), MINUTE, 'bad_distance'],
    [score({ distance: 999999 }), MINUTE, 'too_far'],
    [score({ distance: 100, flown: 5000 }), MINUTE, 'too_many'],
    [score({ level: 50 }), MINUTE, 'bad_level'],
    [score({ flown: -1 }), MINUTE, 'bad_count'],
    [score({ maxCombo: 'x' }), MINUTE, 'bad_count'],
    [score(), 100, 'bad_time'],
    [score(), NaN, 'bad_time'],
    // 人数と距離やレベルが合わない記録
    [{ distance: 90000, flown: 0, level: 0, maxCombo: 5 }, MINUTE, 'too_far'],
    [{ distance: 50000, flown: 20, level: 2, maxCombo: 5 }, MINUTE, 'too_far'],
    [{ distance: 1000, flown: 60, level: 0, maxCombo: 5 }, MINUTE, 'bad_level'],
    [{ distance: 1000, flown: 5, level: 3, maxCombo: 5 }, MINUTE, 'bad_level'],
    [{ distance: 1000, flown: 2, level: 0, maxCombo: 999 }, MINUTE, 'bad_count'],
  ];
  for (const [body, elapsed, error] of cases) {
    assert.deepEqual(checkScore(body, elapsed), { ok: false, error }, JSON.stringify(body));
  }
});

test('長く放っておいた遊びの記録も受け取るが、距離の上限は広げない', () => {
  assert.equal(checkScore(score(), LIMITS.maxRunMs + 1).ok, true);
  const seconds = LIMITS.maxRunMs / 1000;
  const tooFar = Math.ceil(seconds * LIMITS.metersPerSecond + LIMITS.grace) + 1;
  const flown = Math.ceil(tooFar / LIMITS.metersPerFlown);
  const level = Math.floor(flown / LIMITS.perLevel);
  const body = { distance: tooFar, flown, level, maxCombo: 1 };
  assert.deepEqual(checkScore(body, LIMITS.maxRunMs * 10), { ok: false, error: 'too_far' });
});

test('本物のプレイの記録は、どの時点で終えても断らない', () => {
  const STEP = 1 / 60;
  for (const seed of [1, 2, 3, 4]) {
    for (const [up, touch] of [[{}, false], [{ kata: 5, hansha: 5, ashi: 5 }, false], [{}, true], [{ kata: 5, hansha: 5, ashi: 5 }, true]]) {
      const run = new Rules.Run(seed, { bounds: { x0: 0, x1: 960, d: 560 }, endless: true, upgrades: up, touch });
      run.beginEndless();
      let t = 0;
      let next = 3;
      while (!run.over && t < 1200) {
        t += STEP;
        for (const ev of run.update(STEP)) void ev;
        if (run.bestGap() <= run.zone.just * 0.8) {
          for (const ev of run.press()) {
            // 飛んだ人が近くのおじさんを巻き込む動きもまねる
            if (ev.kind === 'parry' && ev.final) {
              let chain = 1;
              for (const o of run.ojisan.slice()) {
                if (Rules.TYPES[o.type].boss || o.state === 'leave') continue;
                run.chainHit(o, ev.grade, chain, 1, 0);
                chain++;
              }
            }
          }
        }
        if (t >= next && run.distance > 0) {
          next += 7;
          const res = checkScore({ distance: run.distance, flown: run.stats.flown, level: run.level, maxCombo: run.maxCombo }, t * 1000);
          assert.equal(res.ok, true, `seed ${seed} ${t.toFixed(0)}秒 ${JSON.stringify({ d: run.distance, f: run.stats.flown, l: run.level, c: run.maxCombo, e: res.error })}`);
        }
      }
    }
  }
});

test('取得件数は上限の中に収める', () => {
  assert.equal(clampLimit('10'), 10);
  assert.equal(clampLimit('99999'), LIMITS.listMax);
  assert.equal(clampLimit('abc'), LIMITS.listDefault);
  assert.equal(clampLimit('-1'), LIMITS.listDefault);
  assert.equal(clampLimit(null), LIMITS.listDefault);
});

test('回数制限の単位: IPv6 は /64 でまとめる', () => {
  assert.equal(clientKey('203.0.113.9'), '203.0.113.9');
  assert.equal(clientKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), clientKey('2001:db8:1:2:1111:2222:3333:4444'));
  assert.notEqual(clientKey('2001:db8:1:2::1'), clientKey('2001:db8:1:3::1'));
  assert.equal(clientKey('2001:DB8:1:2::1'), clientKey('2001:db8:1:2::2'));
  assert.equal(clientKey(null), 'unknown');
});

test('ゆるい枠の単位: IPv6 は /48 でまとめ、IPv4 は接続元のまま', () => {
  assert.equal(networkKey('203.0.113.9'), '203.0.113.9');
  assert.equal(networkKey('2001:db8:1:2::1'), networkKey('2001:db8:1:ffff::1'));
  assert.notEqual(networkKey('2001:db8:1::1'), networkKey('2001:db8:2::1'));
  assert.equal(networkKey(null), 'unknown');
});
