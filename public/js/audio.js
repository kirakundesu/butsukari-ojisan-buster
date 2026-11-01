'use strict';
// 音はすべて WebAudio で合成する。素材ファイルは使わない。
const Sound = (() => {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  const bgm = { on: false, stepDur: 0.125, root: 45, nextStep: 0, nextTime: 0, level: 0, boss: false };

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 5;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    // iOS は電話などのあと interrupted になるので、running 以外ならすべて戻す
    if (ctx.state !== 'running') ctx.resume();
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.8;
  }

  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  function dest(pan) {
    if (!pan || !ctx.createStereoPanner) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  function tone({ t, type = 'sine', f0, f1, dur, gain = 0.3, pan = 0, attack = 0.004 }) {
    const when = t ?? ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, when);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g);
    g.connect(dest(pan));
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  function hiss({ t, dur, gain = 0.2, kind = 'bandpass', f0 = 2000, f1, q = 1, pan = 0 }) {
    const when = t ?? ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = kind;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, when);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest(pan));
    s.start(when, Math.random() * 0.5);
    s.stop(when + dur + 0.02);
  }

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const ready = (fn) => (...args) => {
    if (ctx && ctx.state === 'running') fn(...args);
  };

  const sfx = {
    swing: ready(() => hiss({ dur: 0.12, gain: 0.16, f0: 900, f1: 2600, q: 1.2 })),
    tell: ready((pan, dur) => {
      hiss({ dur: 0.08, gain: 0.16, f0: 1600, q: 2, pan });
      tone({ type: 'triangle', f0: 220, f1: 760, dur: Math.max(dur, 0.12), gain: 0.09, pan, attack: 0.03 });
    }),
    dash: ready((pan) => {
      hiss({ dur: 0.26, gain: 0.26, f0: 500, f1: 3200, q: 0.8, pan });
    }),
    feint: ready((pan) => {
      tone({ type: 'square', f0: 620, f1: 300, dur: 0.1, gain: 0.08, pan });
    }),
    // ジャスト: 低い衝撃に、金属バットのような「カキーン」を重ねる。コンボで音程が上がる。
    just: ready((pan, combo = 0) => {
      const up = Math.pow(2, Math.min(combo, 24) / 24);
      tone({ f0: 180, f1: 28, dur: 0.46, gain: 1, pan });
      tone({ type: 'triangle', f0: 90, f1: 40, dur: 0.3, gain: 0.5, pan });
      hiss({ dur: 0.1, gain: 0.7, kind: 'highpass', f0: 1400, pan });
      for (const [f, g, d] of [[1480, 0.17, 0.38], [2210, 0.14, 0.3], [3340, 0.1, 0.24], [5170, 0.06, 0.16]]) {
        tone({ f0: f * up, dur: d, gain: g, pan, attack: 0.001 });
      }
      hiss({ dur: 0.55, gain: 0.22, f0: 3600, f1: 450, q: 1.6, pan });
    }),
    parry: ready((pan, combo = 0) => {
      const up = Math.pow(2, Math.min(combo, 24) / 24);
      tone({ f0: 200, f1: 52, dur: 0.22, gain: 0.7, pan });
      hiss({ dur: 0.07, gain: 0.42, kind: 'highpass', f0: 2200, pan });
      tone({ f0: 1180 * up, dur: 0.12, gain: 0.1, pan, attack: 0.001 });
    }),
    // 巻き込み: 人数が増えるほど音が上がる
    chain: ready((pan, n = 2) => {
      const up = Math.pow(2, Math.min(n, 8) / 8);
      tone({ f0: 150, f1: 44, dur: 0.2, gain: 0.7, pan });
      hiss({ dur: 0.08, gain: 0.34, kind: 'highpass', f0: 2000, pan });
      tone({ type: 'square', f0: 880 * up, f1: 1320 * up, dur: 0.14, gain: 0.07, pan });
    }),
    whistle: ready((pan, dur = 0.9) => {
      tone({ f0: 2100, f1: 520, dur, gain: 0.045, pan, attack: 0.02 });
    }),
    // 画面にぶつかったとき
    slam: ready(() => {
      tone({ f0: 130, f1: 34, dur: 0.34, gain: 0.95 });
      hiss({ dur: 0.05, gain: 0.5, kind: 'lowpass', f0: 1500 });
      hiss({ dur: 0.4, gain: 0.2, kind: 'highpass', f0: 3800 });
      for (let i = 0; i < 4; i++) tone({ t: ctx.currentTime + 0.02 + i * 0.035, type: 'square', f0: 2600 + i * 700, dur: 0.05, gain: 0.03 });
    }),
    rank: ready(() => {
      [72, 76, 79, 84].forEach((n, i) => {
        tone({ t: ctx.currentTime + i * 0.06, type: 'square', f0: midi(n), dur: 0.16, gain: 0.07 });
      });
    }),
    clang: ready((pan) => {
      tone({ type: 'square', f0: 880, f1: 720, dur: 0.16, gain: 0.12, pan });
      tone({ type: 'square', f0: 1320, f1: 1100, dur: 0.12, gain: 0.08, pan });
      tone({ f0: 130, f1: 60, dur: 0.14, gain: 0.45, pan });
    }),
    whiff: ready(() => {
      hiss({ dur: 0.18, gain: 0.14, f0: 2600, f1: 500, q: 1.4 });
      tone({ type: 'triangle', f0: 300, f1: 160, dur: 0.16, gain: 0.08 });
    }),
    hurt: ready((pan) => {
      tone({ f0: 110, f1: 40, dur: 0.28, gain: 0.7, pan });
      tone({ type: 'sawtooth', f0: 240, f1: 70, dur: 0.3, gain: 0.14, pan });
      hiss({ dur: 0.16, gain: 0.22, kind: 'lowpass', f0: 900, pan });
    }),
    twinkle: ready((pan) => {
      const t = ctx.currentTime;
      tone({ t, f0: 1760, dur: 0.18, gain: 0.12, pan });
      tone({ t: t + 0.09, f0: 2637, dur: 0.3, gain: 0.12, pan });
      tone({ t: t + 0.2, f0: 3520, dur: 0.34, gain: 0.05, pan });
    }),
    crash: ready((pan) => {
      hiss({ dur: 0.3, gain: 0.26, kind: 'highpass', f0: 2800, pan });
      tone({ type: 'square', f0: 420, f1: 180, dur: 0.12, gain: 0.05, pan });
    }),
    coin: ready(() => {
      const t = ctx.currentTime;
      tone({ t, type: 'square', f0: 988, dur: 0.07, gain: 0.08 });
      tone({ t: t + 0.07, type: 'square', f0: 1319, dur: 0.2, gain: 0.08 });
    }),
    // 駅のチャイム風の短いメロディ（このゲームのために作ったもの）
    chime: ready(() => {
      const notes = [76, 79, 84, 83, 79, 81];
      notes.forEach((n, i) => {
        const t = ctx.currentTime + i * 0.19;
        tone({ t, f0: midi(n), dur: 0.7, gain: 0.1 });
        tone({ t, f0: midi(n + 12), dur: 0.35, gain: 0.03 });
      });
    }),
    bossCall: ready(() => {
      const t = ctx.currentTime;
      [0, 0.4].forEach((d) => {
        tone({ t: t + d, type: 'triangle', f0: midi(67), dur: 0.34, gain: 0.14 });
        tone({ t: t + d, type: 'triangle', f0: midi(64), dur: 0.34, gain: 0.14 });
      });
    }),
    train: ready(() => {
      const t = ctx.currentTime;
      hiss({ t, dur: 2.2, gain: 0.16, kind: 'lowpass', f0: 500, f1: 120 });
      for (let i = 0; i < 8; i++) {
        const when = t + i * (0.12 + i * 0.022);
        tone({ t: when, f0: 90, f1: 60, dur: 0.05, gain: 0.2 });
        tone({ t: when + 0.07, f0: 90, f1: 60, dur: 0.05, gain: 0.14 });
      }
      hiss({ t: t + 1.9, dur: 0.6, gain: 0.12, kind: 'highpass', f0: 4000 });
    }),
    clear: ready(() => {
      [67, 72, 76, 79].forEach((n, i) => {
        tone({ t: ctx.currentTime + i * 0.09, type: 'square', f0: midi(n), dur: 0.2, gain: 0.07 });
      });
    }),
    over: ready(() => {
      [64, 60, 57, 52].forEach((n, i) => {
        tone({ t: ctx.currentTime + i * 0.2, type: 'triangle', f0: midi(n), dur: 0.42, gain: 0.16 });
      });
    }),
  };

  // ---- BGM ----
  const BASS = [0, null, 0, null, 12, null, 0, 0, null, 0, null, 12, 7, null, 12, null];
  const CHORDS = [0, -4, -2, 0];
  const LEAD = [
    [12, null, 15, null, 17, null, 15, 12, null, 10, 12, null, null, null, null, null],
    [8, null, 12, null, 15, null, 12, 8, null, 7, 8, null, null, null, null, null],
    [10, null, 14, null, 17, null, 14, 10, null, 12, 14, null, 17, null, 19, null],
    [24, null, 22, null, 19, null, 17, null, 15, null, 12, null, null, null, null, null],
  ];

  function playStep(i, t) {
    const s = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const r = bgm.root + CHORDS[bar];
    const lv = bgm.level;
    if (s % 4 === 0) tone({ t, f0: 130, f1: 42, dur: 0.14, gain: 0.34 });
    if (bgm.calm) return;
    if (s === 4 || s === 12) {
      hiss({ t, dur: 0.1, gain: 0.16, f0: 1900, q: 0.7 });
      tone({ t, type: 'triangle', f0: 190, f1: 120, dur: 0.08, gain: 0.08 });
    }
    if (s % 2 === 1 || bgm.boss) hiss({ t, dur: 0.03, gain: s % 4 === 2 ? 0.06 : 0.04, kind: 'highpass', f0: 7000 });
    const b = BASS[s];
    if (b !== null) tone({ t, type: 'sawtooth', f0: midi(r + b - 12), dur: 0.14, gain: 0.09 });
    if (lv >= 1 && (s === 2 || s === 6 || s === 10 || s === 14)) {
      for (const k of [12, 15, 19]) tone({ t, type: 'square', f0: midi(r + k), dur: 0.07, gain: 0.018 });
    }
    if (lv >= 2 || bgm.boss) {
      const n = LEAD[bar][s];
      if (n !== null) tone({ t, type: 'square', f0: midi(bgm.root + n + 12), dur: 0.14, gain: 0.035 });
    }
  }

  function startBgm(bpm, root) {
    if (!ctx) return;
    bgm.on = true;
    bgm.stepDur = 60 / bpm / 4;
    bgm.root = root;
    bgm.nextStep = 0;
    bgm.nextTime = ctx.currentTime + 0.08;
    bgm.level = 0;
    bgm.boss = false;
    bgm.calm = false;
  }

  function stopBgm() {
    bgm.on = false;
  }

  function setBgm(o) {
    Object.assign(bgm, o);
  }

  function tickBgm() {
    if (!ctx || !bgm.on || ctx.state !== 'running') return;
    // タブが長く止まった後に溜まった分を一気に鳴らさない
    if (bgm.nextTime < ctx.currentTime - 0.2) bgm.nextTime = ctx.currentTime + 0.02;
    while (bgm.nextTime < ctx.currentTime + 0.14) {
      playStep(bgm.nextStep, bgm.nextTime);
      bgm.nextStep++;
      bgm.nextTime += bgm.stepDur;
    }
  }

  return { unlock, setMuted, suspend, resume, sfx, startBgm, stopBgm, setBgm, tickBgm };
})();
