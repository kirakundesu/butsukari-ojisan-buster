'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Rules = require('../public/js/rules.js');

const BOUNDS = { x0: 0, x1: 960, d: 560 };
const STEP = 1 / 60;

// 全ステージを bot で流す。decide は押すかどうかを返す関数。
function simulate(decide, { seed = 7, upgrades, limit = 900 } = {}) {
  const run = new Rules.Run(seed, { upgrades, bounds: BOUNDS });
  let cleared = true;
  for (let i = 0; i < Rules.STAGES.length && !run.over; i++) {
    run.beginStage(i);
    let t = 0;
    while (run.phase !== 'done' && !run.over && t < limit) {
      t += STEP;
      run.update(STEP);
      if (decide(run, t)) run.press();
    }
    if (run.over || t >= limit) cleared = false;
  }
  return { run, cleared };
}

// おじさんを 1 人だけ置いて、ダッシュの直前まで進める
function setupDash(type = 'normal', stage = 0, upgrades) {
  const run = new Rules.Run(1, { bounds: BOUNDS, upgrades });
  run.beginStage(stage);
  run.phase = 'boss'; // 自動で増えないようにする
  const o = run.addOjisan(type, run.avatar.x + Rules.TYPES[type].trigger - 1, run.avatar.z);
  run.update(STEP);
  assert.equal(o.state, 'tell');
  while (o.state === 'tell') run.update(STEP);
  assert.equal(o.state, 'dash');
  return { run, o };
}

function advanceUntil(run, cond, max = 600) {
  for (let i = 0; i < max && !cond(); i++) run.update(STEP);
  assert.ok(cond(), '条件に届かなかった');
}

test('ステージが進むほど判定の範囲が狭くなる', () => {
  for (let i = 1; i < Rules.STAGES.length; i++) {
    const a = Rules.zonesFor(i - 1);
    const b = Rules.zonesFor(i);
    assert.ok(b.parry < a.parry, `parry ${i}`);
    assert.ok(b.just < a.just, `just ${i}`);
  }
});

test('強化すると判定の範囲が広がる', () => {
  const last = Rules.STAGES.length - 1;
  const base = Rules.zonesFor(last);
  const kata = Rules.zonesFor(last, { kata: 5, hansha: 0 });
  const hansha = Rules.zonesFor(last, { kata: 0, hansha: 5 });
  assert.equal(kata.parry, base.parry + 70);
  assert.equal(hansha.just, base.just + 30, '終盤でも反射神経の強化が最後まで効く');
  assert.ok(hansha.parry >= hansha.just);
  assert.ok(kata.parry >= Rules.zonesFor(0).parry, '最大まで鍛えると最終駅でも最初の駅の広さに届く');
});

test('ジャストの範囲はパリィの範囲を超えない', () => {
  const z = Rules.zonesFor(3, { kata: 0, hansha: 5 });
  assert.ok(z.just <= z.parry);
});

test('強化の値段は上がっていき、最大で買えなくなる', () => {
  for (const u of Rules.UPGRADES) {
    assert.equal(u.costs.length, u.max);
    for (let i = 1; i < u.max; i++) assert.ok(u.costs[i] > u.costs[i - 1]);
    assert.equal(Rules.upgradeCost(u.id, u.max), null);
  }
});

test('おじさんはゆっくり近づき、範囲に入ると溜めてからダッシュする', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.phase = 'boss';
  const T = Rules.TYPES.normal;
  const o = run.addOjisan('normal', run.avatar.x + 400, run.avatar.z);
  const x0 = o.x;
  run.update(1);
  assert.equal(o.state, 'stalk');
  assert.ok(Math.abs(x0 - o.x - T.walk) < 2, '歩く速さで近づく');
  advanceUntil(run, () => o.state === 'tell');
  assert.ok(run.gapOf(o) + Rules.contactOf(o) <= T.trigger + 2);
  advanceUntil(run, () => o.state === 'dash');
  assert.equal(o.speed, T.dash);
});

test('輪の内側で押すとパリィ、さらに内側ならジャスト', () => {
  const near = setupDash();
  advanceUntil(near.run, () => near.run.gapOf(near.o) <= near.run.zone.just);
  const justEv = near.run.press();
  assert.equal(justEv[0].kind, 'parry');
  assert.equal(justEv[0].grade, 'just');
  assert.equal(justEv[0].final, true);

  const far = setupDash();
  advanceUntil(far.run, () => far.run.gapOf(far.o) <= far.run.zone.parry);
  assert.ok(far.run.gapOf(far.o) > far.run.zone.just);
  assert.equal(far.run.press()[0].grade, 'parry');
});

test('輪に入る前に押すと空振りで、硬直中に当たる', () => {
  const { run, o } = setupDash();
  run.combo = 5;
  assert.ok(run.gapOf(o) > run.zone.parry);
  const ev = run.press();
  assert.equal(ev[0].kind, 'whiff');
  assert.equal(run.combo, 0);
  assert.equal(run.press()[0].kind, 'locked');
  const all = [];
  for (let i = 0; i < 40; i++) all.push(...run.update(STEP));
  assert.ok(all.some((e) => e.kind === 'hurt'));
  assert.equal(run.hp, Rules.BASE_HP - 1);
});

test('触れてから少しの間はパリィが間に合い、過ぎると当たる', () => {
  const ok = setupDash();
  advanceUntil(ok.run, () => ok.o.state === 'contact');
  ok.run.update(Rules.JUST_LATE + 0.01);
  assert.equal(ok.run.press()[0].grade, 'parry');

  const late = setupDash();
  advanceUntil(late.run, () => late.o.state === 'contact');
  const ev = late.run.update(Rules.LATE_GRACE + 0.01);
  assert.ok(ev.some((e) => e.kind === 'hurt'));
});

test('ダッシュの線上からよければ当たらず、おじさんはよろける', () => {
  const { run, o } = setupDash();
  run.setTarget(run.avatar.x, run.avatar.z + 300);
  const all = [];
  for (let i = 0; i < 60; i++) all.push(...run.update(STEP));
  assert.ok(all.some((e) => e.kind === 'dodged'));
  assert.ok(!all.some((e) => e.kind === 'hurt'));
  assert.equal(run.hp, Rules.BASE_HP);
  assert.ok(o.state === 'stumble' || o.state === 'stalk');
});

test('寸止めおじさんが止まっているときに押すと空振り', () => {
  const { run, o } = setupDash('feint', 2);
  advanceUntil(run, () => o.state === 'feintStop');
  assert.ok(run.gapOf(o) > run.zone.parry);
  assert.equal(run.press()[0].kind, 'whiff');
});

test('大荷物おじさんは 2 回はじかないと飛ばない', () => {
  const { run, o } = setupDash('heavy', 2);
  advanceUntil(run, () => run.gapOf(o) <= run.zone.parry);
  const first = run.press();
  assert.equal(first[0].final, false);
  assert.equal(o.state, 'recoil');
  advanceUntil(run, () => o.state === 'dash' && run.gapOf(o) <= run.zone.parry);
  const second = run.press();
  assert.equal(second[0].final, true);
  assert.equal(o.state, 'flying');
});

test('同時に輪に入った 2 人は 1 回でまとめて飛ばせて、距離が増える', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.phase = 'boss';
  const a = run.addOjisan('normal', run.avatar.x + 200, run.avatar.z);
  const b = run.addOjisan('normal', run.avatar.x - 200, run.avatar.z);
  advanceUntil(run, () => a.state === 'dash' && b.state === 'dash' && run.gapOf(a) <= run.zone.parry);
  const ev = run.press();
  assert.equal(ev.filter((e) => e.kind === 'parry').length, 2);
  assert.equal(ev[0].multi, 2);
  assert.ok(ev[0].dist > Rules.launchDistance(ev[0].grade, ev[0].combo, 1, true, 1));
});

test('突っ込んでくる相手がいないときの素振りには罰がない', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.combo = 3;
  assert.equal(run.press()[0].kind, 'swing');
  assert.equal(run.combo, 3);
  assert.equal(run.lockUntil, -Infinity);
});

test('アバターは目標へ追従し、床の外へは出ない', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.setTarget(5000, -5000);
  for (let i = 0; i < 300; i++) run.update(STEP);
  assert.ok(run.avatar.x <= BOUNDS.x1);
  assert.ok(run.avatar.z >= 0);
  assert.ok(Math.abs(run.avatar.x - run.avatar.tx) < 1);
});

test('カーソルがふつうの速さで動く間、アバターは遅れない', () => {
  // 画面を 1 秒で横切るくらいの動きを、斜めの動きも含めて試す
  for (const [vx, vz] of [[400, 0], [1500, 0], [1200, 900], [0, 1500]]) {
    const run = new Rules.Run(1, { bounds: { x0: 0, x1: 9000, d: 9000 } });
    run.beginStage(0);
    run.phase = 'boss';
    const a = run.avatar;
    run.setTarget(a.x, a.z);
    run.update(STEP);
    let worst = 0;
    for (let i = 0; i < 60; i++) {
      run.setTarget(a.tx + vx * STEP, a.tz + vz * STEP);
      run.update(STEP);
      worst = Math.max(worst, Math.hypot(a.tx - a.x, a.tz - a.z));
    }
    assert.ok(worst < 1, `速さ ${vx},${vz} で ${worst.toFixed(1)} 遅れた`);
  }
});

test('アバターは画面の端まで一瞬では移動できない（指の置き直しで瞬間移動しない）', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  const a = run.avatar;
  const x0 = a.x;
  run.setTarget(BOUNDS.x1, a.z);
  run.update(STEP);
  assert.ok(a.x - x0 <= Rules.moveSpeed() * STEP + 0.01);
});

test('当たった直後はよろけて、少しの間ゆっくりしか動けない', () => {
  const { run, o } = setupDash();
  advanceUntil(run, () => o.state === 'contact');
  run.update(Rules.LATE_GRACE + 0.01);
  assert.ok(run.avatar.stagger > 0);
  const x0 = run.avatar.x;
  run.setTarget(x0 + 300, run.avatar.z);
  run.update(STEP);
  assert.ok(run.avatar.x - x0 <= Rules.moveSpeed() * 0.2 * STEP + 0.01);
});

test('飛んでいくおじさんに巻き込まれると、押さなくても飛んで人数に入る', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.phase = 'field';
  run.spawnTimer = 999;
  const o = run.addOjisan('normal', 100, 100);
  const combo = run.combo;
  const before = run.distance;
  const ev = run.chainHit(o, 'just', 1, 1, 0);
  assert.equal(ev[0].final, true);
  assert.equal(ev[0].chain, 1);
  assert.equal(o.state, 'flying');
  assert.equal(run.ojisan.length, 0);
  assert.equal(run.flownThisStage, 1);
  assert.equal(run.stats.chain, 1);
  assert.equal(run.combo, combo + 1);
  assert.ok(run.distance > before);
  assert.ok(ev[0].dist > Rules.launchDistance('just', ev[0].combo, 1, true, 1), '巻き込みは距離が増える');
});

test('巻き込みでもボスは飛ばず、大荷物おじさんは 1 回ぶんだけ減る', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.phase = 'boss';
  const boss = run.addOjisan('kakaricho', 100, 100);
  assert.deepEqual(run.chainHit(boss, 'just', 1, 1, 0), []);
  assert.equal(boss.hitsLeft, boss.hits);
  const heavy = run.addOjisan('heavy', 300, 100);
  const ev = run.chainHit(heavy, 'just', 1, 1, 0);
  assert.equal(ev[0].final, false);
  assert.equal(heavy.state, 'recoil');
  assert.equal(heavy.hitsLeft, 1);
});

test('ジャストの衝撃で近くを歩くおじさんが下がる（パリィでは下がらない）', () => {
  const setup = () => {
    const { run, o } = setupDash();
    const near = run.addOjisan('normal', run.avatar.x - Rules.SHOCK_RADIUS + 40, run.avatar.z + 20);
    near.cool = 99; // 溜めに入らないようにする
    return { run, o, near };
  };
  const a = setup();
  advanceUntil(a.run, () => a.run.gapOf(a.o) <= a.run.zone.just);
  assert.equal(a.run.press()[0].grade, 'just');
  assert.equal(a.near.state, 'recoil');
  const b = setup();
  advanceUntil(b.run, () => b.run.gapOf(b.o) <= b.run.zone.parry);
  assert.equal(b.run.press()[0].grade, 'parry');
  assert.equal(b.near.state, 'stalk');
});

test('コンボが増えると段位と距離の倍率が上がる', () => {
  assert.equal(Rules.COMBO_RANKS[Rules.comboRankIndex(0)].name, '普通');
  assert.equal(Rules.COMBO_RANKS[Rules.comboRankIndex(5)].name, '快速');
  assert.equal(Rules.COMBO_RANKS[Rules.comboRankIndex(29)].name, '特急');
  assert.equal(Rules.COMBO_RANKS[Rules.comboRankIndex(99)].name, '新幹線');
  assert.ok(Rules.comboMult(20) > Rules.comboMult(0));
  assert.equal(Rules.comboMult(50), Rules.comboMult(500));
});

test('脚力を鍛えると追従が速くなり、硬直が短くなる', () => {
  assert.ok(Rules.moveSpeed({ ashi: 5 }) > Rules.moveSpeed());
  assert.ok(Rules.whiffLock(1, { ashi: 5 }) < Rules.whiffLock(1));
});

test('体幹を鍛えると体力の上限が増える', () => {
  const run = new Rules.Run(1, { upgrades: { taikan: 2 }, bounds: BOUNDS });
  assert.equal(run.hp, Rules.BASE_HP + 2);
});

test('動かず輪の内側で押し続ければ最後までクリアでき、ボスも飛ぶ', () => {
  const { run, cleared } = simulate((r) => r.bestGap() <= r.zone.just * 0.8);
  assert.equal(cleared, true);
  assert.equal(run.stats.hurt, 0);
  assert.equal(run.stats.whiff, 0);
  for (const type of ['kakaricho', 'kacho', 'bucho', 'kaicho', 'daio']) assert.equal(run.flownByType[type], 1, type);
  assert.equal(run.flownByType.tencho, 2);
  assert.equal(run.flownByType.shacho, 2);
  assert.ok(run.distance / 1000 >= 84, `距離 ${run.distance}`);
  assert.equal(Rules.rankFor(run.distance / 1000).title, 'おじさんの天敵');
});

test('何も押さないと最初のステージで体幹が尽きる', () => {
  const { run, cleared } = simulate(() => false);
  assert.equal(cleared, false);
  assert.equal(run.over, true);
  assert.equal(run.stageIndex, 0);
  assert.equal(run.stats.hurt, Rules.BASE_HP);
});

test('連打ではクリアできない', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    let last = -1;
    const { cleared, run } = simulate((r, t) => {
      if (t - last < 0.05) return false;
      last = t;
      return true;
    }, { seed });
    assert.equal(cleared, false, `seed ${seed} 距離 ${run.distance}`);
  }
});

test('図鑑はすべてのおじさんを載せ、ステージの出現種は図鑑にある', () => {
  const dex = new Set(Rules.DEX.map((e) => e.type));
  const listed = Object.keys(Rules.TYPES).filter((type) => !Rules.TYPES[type].projectile);
  assert.equal(dex.size, listed.length);
  for (const type of listed) assert.ok(dex.has(type), type);
  for (const st of Rules.STAGES) {
    assert.ok(Rules.TYPES[st.boss].boss);
    for (const type of Object.keys(st.mix)) assert.ok(Rules.TYPES[type], type);
  }
});

test('出会ったおじさんと飛ばした数を記録する', () => {
  const { run } = simulate((r) => r.bestGap() <= r.zone.just * 0.8);
  assert.ok(run.seenTypes.has('normal'));
  assert.ok(run.seenTypes.has('kaicho'));
  assert.ok(run.flownByType.normal > 0);
  assert.ok(run.bestByType.kaicho > run.bestByType.normal);
});

// エンドレスを bot で流す。seconds だけ進めるか、力尽きたら止まる。
function simulateEndless(decide, { seed = 7, upgrades, seconds = 900 } = {}) {
  const run = new Rules.Run(seed, { upgrades, bounds: BOUNDS, endless: true });
  run.beginEndless();
  const events = [];
  let t = 0;
  while (!run.over && t < seconds) {
    t += STEP;
    events.push(...run.update(STEP));
    if (decide(run, t)) events.push(...run.press());
  }
  return { run, events, t };
}

const justBot = (r) => r.bestGap() <= r.zone.just * 0.8;

test('エンドレス: 体幹は鍛えても 3 のまま、ほかの強化は効く', () => {
  const up = { kata: 5, hansha: 5, taikan: 3, ashi: 5 };
  const run = new Rules.Run(1, { upgrades: up, bounds: BOUNDS, endless: true });
  run.beginEndless();
  assert.equal(run.hpMax, 3);
  assert.equal(run.hp, 3);
  assert.equal(run.zone.parry, Rules.endlessSpec(0).parry + 70);
  assert.equal(run.zone.just, Rules.endlessSpec(0).just + 30);
  const normal = new Rules.Run(1, { upgrades: up, bounds: BOUNDS });
  assert.equal(normal.hpMax, 6, '通常モードでは体幹の強化が効く');
});

test('エンドレス: レベルが上がるほど厳しくなり、下限で止まる', () => {
  for (let lv = 1; lv < 40; lv++) {
    const a = Rules.endlessSpec(lv - 1);
    const b = Rules.endlessSpec(lv);
    assert.ok(b.parry <= a.parry);
    assert.ok(b.just <= a.just);
    assert.ok(b.speed >= a.speed);
    assert.ok(b.maxAlive >= a.maxAlive);
    assert.ok(b.spawnEvery <= a.spawnEvery);
    assert.ok(Object.keys(b.mix).length >= Object.keys(a.mix).length);
    assert.ok(b.just <= b.parry);
    assert.ok(Rules.TYPES[b.boss].boss);
    for (const type of Object.keys(b.mix)) assert.ok(Rules.TYPES[type], type);
  }
  assert.equal(Rules.endlessSpec(99).parry, 30);
  assert.equal(Rules.endlessSpec(99).just, 12);
});

test('エンドレス: 上手な bot は 10 人ごとにレベルが上がり、5 レベルごとにボスを倒して次の時間帯へ進む', () => {
  const { run, events } = simulateEndless(justBot, { seconds: 400 });
  assert.equal(run.over, false);
  assert.equal(run.stats.hurt, 0);
  assert.ok(run.level >= 10, `レベル ${run.level}`);
  const levels = events.filter((e) => e.kind === 'levelUp').map((e) => e.level);
  assert.deepEqual(levels, levels.map((_, i) => i + 1), 'レベルは 1 ずつ上がる');
  const bosses = events.filter((e) => e.kind === 'bossCall').map((e) => e.type);
  assert.deepEqual(bosses.slice(0, 2), ['kakaricho', 'tencho']);
  const areas = events.filter((e) => e.kind === 'nextArea');
  assert.equal(areas[0].look, 1);
  assert.equal(areas[0].level, 5);
  assert.ok(!events.some((e) => e.kind === 'stageEnd'), 'ステージの終わりは来ない');
});

test('エンドレス: 何も押さないと 3 回当たって終わり、距離は 0 のまま', () => {
  const { run, events } = simulateEndless(() => false);
  assert.equal(run.over, true);
  assert.equal(run.stats.hurt, 3);
  assert.equal(run.distance, 0);
  assert.equal(events.filter((e) => e.kind === 'gameOver').length, 1);
});

test('エンドレス: 連打では伸びない', () => {
  // 連打は数回しか当たらないので 1 回ごとの差はぶれる。すぐ力尽きることと、複数回の合計で確かめる。
  let mashTotal = 0;
  let goodTotal = 0;
  for (let seed = 1; seed <= 12; seed++) {
    let last = -1;
    const mash = simulateEndless((r, t) => {
      if (t - last < 0.05) return false;
      last = t;
      return true;
    }, { seed });
    assert.equal(mash.run.over, true, `seed ${seed}`);
    assert.ok(mash.t < 60, `seed ${seed}: ${mash.t} 秒もった`);
    const good = simulateEndless(justBot, { seed, seconds: mash.t });
    assert.equal(good.run.over, false, `seed ${seed}`);
    mashTotal += mash.run.distance;
    goodTotal += good.run.distance;
  }
  assert.ok(goodTotal > mashTotal * 2, `${mashTotal} と ${goodTotal}`);
});

test('駅の間で鍛えた分は、次の駅から効く', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.applyUpgrades({ kata: 2, hansha: 1, taikan: 1, ashi: 1 });
  run.beginStage(1);
  assert.equal(run.zone.parry, Rules.zonesFor(1).parry + 28);
  assert.equal(run.zone.just, Rules.zonesFor(1).just + 6);
  assert.equal(run.hpMax, Rules.BASE_HP + 1);
  assert.equal(run.hp, Rules.BASE_HP + 1);
  assert.equal(run.moveCap, Rules.moveSpeed({ ashi: 1 }));
});

test('エンドレスでは鍛えても体幹は増えず、見本の移動速度も変わらない', () => {
  const endless = new Rules.Run(1, { bounds: BOUNDS, endless: true });
  endless.applyUpgrades({ taikan: 3 });
  assert.equal(endless.hpMax, 3);
  const demo = new Rules.Run(1, { bounds: BOUNDS, moveCap: 320 });
  demo.applyUpgrades({ ashi: 5 });
  assert.equal(demo.moveCap, 320);
});

test('2 人がほぼ同時に当たっても、体幹は 1 つしか減らない', () => {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(0);
  run.phase = 'boss';
  const a = run.addOjisan('normal', run.avatar.x + 200, run.avatar.z);
  const b = run.addOjisan('normal', run.avatar.x - 200, run.avatar.z);
  let hurts = 0;
  for (let i = 0; i < 90; i++) hurts += run.update(STEP).filter((e) => e.kind === 'hurt').length;
  assert.equal(hurts, 1);
  assert.equal(run.hp, Rules.BASE_HP - 1);
  assert.ok(a.state !== 'contact' && b.state !== 'contact');
});

test('距離で称号が決まり、身近なものでたとえる', () => {
  assert.equal(Rules.rankFor(0).title, '見習いバスター');
  assert.equal(Rules.rankFor(7).title, '一人前バスター');
  assert.equal(Rules.rankFor(100).title, 'おじさんの天敵');
  assert.match(Rules.compareDistance(0.1), /スカイツリーの高さ/);
  assert.equal(Rules.compareDistance(1.3), 'スカイツリー 2本分の距離です');
  assert.equal(Rules.compareDistance(8), '富士山 2個分の距離です');
  assert.equal(Rules.compareDistance(100), 'フルマラソン 2回分の距離です');
});

test('全 5 ステージで、1 ステージは 3〜5 エリアでできている', () => {
  assert.equal(Rules.LINES.length, 5);
  for (const line of Rules.LINES) {
    assert.ok(line.stations.length >= 3 && line.stations.length <= 5, line.name);
  }
  assert.equal(new Set(Rules.LINES.map((l) => l.theme)).size, 5, 'ステージごとに背景が違う');
  assert.equal(Rules.STAGES.length, Rules.LINES.reduce((n, l) => n + l.stations.length, 0));
  Rules.STAGES.forEach((st, i) => {
    assert.ok(st.goal > 0, st.name);
    assert.ok(Rules.TYPES[st.boss].boss, st.name);
    assert.ok(i === 0 || st.speed > Rules.STAGES[i - 1].speed);
    assert.ok(st.parry >= 30 && st.just >= 14 && st.just <= st.parry);
  });
});

test('図鑑にはおじさんがすべて載り、飛び道具は載らない', () => {
  const names = new Set(Rules.DEX.map((e) => e.type));
  for (const [type, T] of Object.entries(Rules.TYPES)) {
    assert.equal(names.has(type), !T.projectile, type);
  }
  assert.ok(Rules.DEX.length >= 30);
  for (const e of Rules.DEX) assert.ok(e.phrase && e.note && e.habitat, e.type);
});

test('どのおじさんも、どこかのエリアかエンドレスで出てくる', () => {
  const appears = new Set();
  for (const st of Rules.STAGES) {
    appears.add(st.boss);
    for (const type of Object.keys(st.mix)) {
      assert.ok(Rules.TYPES[type] && !Rules.TYPES[type].boss, `${st.name} ${type}`);
      appears.add(type);
    }
  }
  for (const [type, T] of Object.entries(Rules.TYPES)) {
    if (!T.projectile) assert.ok(appears.has(type), type);
  }
});

// ---- 仕掛けのあるおじさん ----
function single(type, stage = 5) {
  const run = new Rules.Run(1, { bounds: { x0: 0, x1: 2000, d: 2000 } });
  run.beginStage(stage);
  run.phase = 'boss';
  run.setTarget(1000, 1000);
  run.avatar.x = 1000;
  run.avatar.z = 1000;
  const T = Rules.TYPES[type];
  const o = run.addOjisan(type, 1000 + T.trigger - 2, 1000);
  return { run, o, T };
}

function stepUntil(run, cond, max = 1200) {
  const events = [];
  for (let i = 0; i < max && !cond(); i++) events.push(...run.update(STEP));
  assert.ok(cond(), '条件に届かなかった');
  return events;
}

test('じらしおじさんは輪の手前で 2 回止まってから突っ込む', () => {
  const { run, o } = single('regent');
  const a = stepUntil(run, () => o.state === 'feintStop');
  assert.ok(a.some((e) => e.kind === 'feint'));
  assert.ok(run.gapOf(o) > run.zone.parry + 36, '1 回目は遠めで止まる');
  stepUntil(run, () => o.state === 'dash');
  stepUntil(run, () => o.state === 'feintStop');
  assert.ok(run.gapOf(o) > run.zone.parry, '2 回目も輪の外で止まる');
  assert.equal(o.feintCount, 2);
  stepUntil(run, () => o.state === 'dash');
  stepUntil(run, () => o.state === 'contact');
});

test('現場おじさんはジャストでしか飛ばない', () => {
  const near = single('hardhat');
  stepUntil(near.run, () => near.o.state === 'dash' && near.run.gapOf(near.o) <= near.run.zone.parry && near.run.gapOf(near.o) > near.run.zone.just);
  const before = near.run.combo;
  const ev = near.run.press();
  assert.equal(ev[0].kind, 'guarded');
  assert.equal(near.o.state, 'recoil');
  assert.equal(near.o.hitsLeft, 1);
  assert.equal(near.run.combo, before);
  assert.equal(near.run.hp, near.run.hpMax);
  const hit = single('hardhat');
  stepUntil(hit.run, () => hit.o.state === 'dash' && hit.run.gapOf(hit.o) <= hit.run.zone.just);
  const flown = hit.run.press();
  assert.equal(flown[0].kind, 'parry');
  assert.equal(flown[0].final, true);
});

test('いつの間にかおじさんは消えて反対側から来る', () => {
  const { run, o } = single('warp');
  const startSide = Math.sign(o.x - run.avatar.x);
  const ev = stepUntil(run, () => o.state === 'vanish');
  assert.ok(ev.some((e) => e.kind === 'warp'));
  assert.equal(Math.sign(o.x - run.avatar.x), -startSide);
  assert.equal(run.bestGap(), Infinity, '消えている間は押せない');
  assert.equal(run.press()[0].kind, 'swing', '消えている間に押しても空振りにならない');
  stepUntil(run, () => o.state === 'tell');
  stepUntil(run, () => o.state === 'dash');
  stepUntil(run, () => o.state === 'contact');
});

test('二度見おじさんは 1 回目は通り過ぎ、戻って当たりに来る', () => {
  const { run, o } = single('nidomi');
  const ev = stepUntil(run, () => o.passStage === 2);
  assert.ok(!ev.some((e) => e.kind === 'hurt'), '1 回目は当たらない');
  assert.ok(ev.some((e) => e.kind === 'turn'));
  const more = stepUntil(run, () => run.stats.hurt > 0);
  assert.ok(more.some((e) => e.kind === 'hurt'), '2 回目は当たる');
});

test('二度見おじさんは通り過ぎるときにも叩ける', () => {
  const { run, o } = single('nidomi');
  stepUntil(run, () => o.state === 'dash' && run.gapOf(o) <= run.zone.parry);
  assert.equal(run.press()[0].kind, 'parry');
});

test('オタクくんは横によけても曲がって追ってくる', () => {
  const dodge = (type) => {
    const { run, o } = single(type);
    stepUntil(run, () => o.state === 'dash');
    run.setTarget(1000, 1000 + 170);
    const ev = [];
    for (let i = 0; i < 90; i++) ev.push(...run.update(STEP));
    return ev;
  };
  assert.ok(dodge('normal').every((e) => e.kind !== 'hurt'), '普通のおじさんはよけられる');
  assert.ok(dodge('otaku').some((e) => e.kind === 'hurt'), 'オタクくんは追いついて当たる');
});

test('ふとっちょおじさんはよけても跳ね返る', () => {
  const { run, o } = single('futo');
  stepUntil(run, () => o.state === 'dash');
  run.setTarget(1000, 1000 + 400);
  const ev = stepUntil(run, () => o.bounced === 1);
  assert.ok(ev.some((e) => e.kind === 'bounce'));
  assert.equal(o.state, 'tell');
  stepUntil(run, () => o.state === 'stumble');
  assert.equal(o.bounced, 1, '跳ね返るのは 1 回だけ');
});

test('自転車おじさんはだんだん加速する', () => {
  const { run, o } = single('bike');
  stepUntil(run, () => o.state === 'dash');
  const x0 = o.x;
  run.update(STEP);
  const first = Math.abs(o.x - x0);
  for (let i = 0; i < 12; i++) run.update(STEP);
  const x1 = o.x;
  run.update(STEP);
  assert.ok(Math.abs(o.x - x1) > first * 1.5);
});

test('説教おじさんの小言をはじくと本人に返って飛ぶ', () => {
  const { run, o } = single('sekkyo');
  const ev = stepUntil(run, () => o.state === 'reload');
  const shoot = ev.find((e) => e.kind === 'shoot');
  assert.ok(shoot);
  assert.equal(shoot.shot.type, 'kogoto');
  stepUntil(run, () => run.gapOf(shoot.shot) <= run.zone.just);
  const flownBefore = run.flownThisStage;
  const res = run.press();
  assert.equal(res[0].projectile, true);
  const back = res.find((e) => e.kind === 'reflect');
  assert.ok(back, '本人に返る');
  assert.equal(back.o, o);
  assert.equal(back.final, true);
  assert.equal(o.state, 'flying');
  assert.equal(run.flownThisStage, flownBefore + 1, '飛び道具は人数に数えず、本人だけ数える');
  assert.equal(run.ojisan.length, 0);
});

test('飛び道具に当たると体幹が減り、飛び道具は消える', () => {
  const { run, o } = single('golfer');
  const ev = stepUntil(run, () => o.state === 'reload');
  const shot = ev.find((e) => e.kind === 'shoot').shot;
  assert.equal(shot.type, 'ball');
  stepUntil(run, () => run.stats.hurt > 0);
  assert.equal(run.hp, run.hpMax - 1);
  run.update(STEP);
  assert.ok(!run.ojisan.includes(shot));
  assert.ok(run.ojisan.includes(o), '本人は残る');
});

test('飛び道具は巻き込みでは飛ばない', () => {
  const { run, o } = single('sekkyo');
  const ev = stepUntil(run, () => o.state === 'reload');
  const shot = ev.find((e) => e.kind === 'shoot').shot;
  assert.deepEqual(run.chainHit(shot, 'just', 1, 1, 0), []);
});

test('同僚コンビは 2 人、行列おじさんは 3 人で順番に来る', () => {
  const run = new Rules.Run(3, { bounds: BOUNDS, mix: { duo: 1 } });
  run.beginStage(0);
  run.phase = 'field';
  run.spawnTimer = 0;
  const ev = run.update(STEP);
  assert.equal(ev.filter((e) => e.kind === 'spawn').length, 2);
  const queue = new Rules.Run(3, { bounds: BOUNDS, mix: { line: 1 } });
  queue.beginStage(0);
  queue.phase = 'field';
  queue.spawnTimer = 0;
  const spawned = queue.update(STEP).filter((e) => e.kind === 'spawn').map((e) => e.o.cool);
  assert.ok(spawned[0] <= 0 && spawned[1] > 0.3 && spawned[2] > spawned[1] + 0.3, String(spawned));
});

test('全エリアとも、上手な bot はボスまで倒して進める', () => {
  for (const seed of [11, 12, 13]) {
    const { run, cleared } = simulate(justBot, { seed });
    assert.equal(cleared, true, `seed ${seed} ${run.stage.name}`);
    assert.equal(run.hp, run.hpMax);
    assert.equal(run.stats.hurt, 0, `seed ${seed}`);
  }
});

function onFloor(type, x, z, stage = 8) {
  const run = new Rules.Run(1, { bounds: BOUNDS });
  run.beginStage(stage);
  run.phase = 'boss';
  run.avatar.x = x;
  run.avatar.z = z;
  run.setTarget(x, z);
  const o = run.addOjisan(type, x + (x < BOUNDS.x1 / 2 ? 150 : -150), z);
  return { run, o };
}

test('壁際でもワープしたおじさんはアバターに重なって現れない', () => {
  for (const [x, z] of [[30, 280], [BOUNDS.x1 - 30, 280], [30, 10], [BOUNDS.x1 - 30, BOUNDS.d - 10], [BOUNDS.x1 / 2, 280]]) {
    const { run, o } = onFloor('warp', x, z);
    advanceUntil(run, () => o.state === 'vanish');
    assert.ok(run.gapOf(o) > 100, `(${x}, ${z}) 隙間 ${run.gapOf(o)}`);
    assert.equal(o.x, run.clampX(o.x));
    assert.equal(o.z, run.clampZ(o.z));
  }
});

test('当たったあと動かなくても、重なった位置からダッシュされない', () => {
  for (const type of ['normal', 'fast', 'futo', 'umbrella', 'kakaricho']) {
    for (const x of [BOUNDS.x1 / 2, 40]) {
      const { run, o } = onFloor(type, x, 280, 3);
      run.immortal = true;
      advanceUntil(run, () => run.stats.hurt >= 1);
      advanceUntil(run, () => o.state === 'stumble');
      advanceUntil(run, () => o.state === 'dash', 900);
      assert.ok(run.gapOf(o) > 60, `${type} x=${x} 隙間 ${run.gapOf(o)}`);
    }
  }
});

test('壁際でも二度見おじさんの 2 回目の溜めは画面の中で始まる', () => {
  for (const x of [40, BOUNDS.x1 - 40]) {
    for (const roll of [0.1, 0.9]) {
      const { run, o } = onFloor('nidomi', x, 280, 6);
      o.roll = roll;
      advanceUntil(run, () => o.passStage === 2);
      assert.ok(run.inside(o), `x=${x} roll=${roll} おじさん x=${o.x}`);
    }
  }
});

test('弾かれた相手は「まとめて」に数えない', () => {
  const measure = (withHardhat) => {
    const { run } = onFloor('normal', BOUNDS.x1 / 2, 280, 5);
    const a = run.avatar;
    run.ojisan = [];
    const n = run.addOjisan('normal', a.x + 50, a.z);
    Object.assign(n, { state: 'dash', dx: -1, dz: 0, speed: 1 });
    if (withHardhat) {
      const h = run.addOjisan('hardhat', a.x - 90, a.z);
      Object.assign(h, { state: 'dash', dx: 1, dz: 0, speed: 1 });
    }
    const before = run.distance;
    run.press();
    return run.distance - before;
  };
  assert.equal(measure(true), measure(false));
});

test('ジャストとパリィの回数は、押して当てた回数だけを数える', () => {
  const { run } = onFloor('normal', BOUNDS.x1 / 2, 280, 5);
  const a = run.avatar;
  run.ojisan = [];
  const n = run.addOjisan('normal', a.x + 50, a.z);
  Object.assign(n, { state: 'dash', dx: -1, dz: 0, speed: 1 });
  const other = run.addOjisan('normal', a.x + 300, a.z);
  run.press();
  assert.equal(run.stats.parry + run.stats.just, 1);
  run.chainHit(other, 'just', 1, 1, 0);
  assert.equal(run.stats.parry + run.stats.just, 1, '巻き込みは足さない');
  assert.equal(run.stats.chain, 1);
});

test('スマホおじさんは輪の外で溜めに入る', () => {
  for (let i = 0; i < Rules.STAGES.length; i++) {
    assert.ok(Rules.TYPES.phone.trigger - Rules.CONTACT > Rules.zonesFor(i).parry, `エリア${i}`);
  }
});
