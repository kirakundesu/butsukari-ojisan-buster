'use strict';
// 画面・入力・演出をつなぐ。ゲームの判定は Rules 側にある。
(() => {
  const $ = (id) => document.getElementById(id);
  const stageEl = $('stage');
  const canvas = $('game');
  const c = canvas.getContext('2d', { alpha: false });

  // 動作確認用の機能は手元でだけ使えるようにする。本番で使えると自動プレイの記録を送れてしまう。
  const DEV = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (location.protocol === 'http:' && !DEV) {
    location.replace(`https://${location.host}${location.pathname}${location.search}`);
    return;
  }
  const params = new URLSearchParams(DEV ? location.search : '');
  const BOT = params.get('bot'); // 動作確認用: just / parry / mash / idle
  let timeScale = Number(params.get('slow')) || 1; // 動作確認用: 演出をゆっくり見る
  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { SQUASH, TYPES, LINES, STAGES, UPGRADES, DEX } = Rules;
  const FONT = Art.FONT;
  const TOUCH_GAIN = 1.5; // なぞった距離の何倍動くか。小さな動きで画面の端まで届くように
  const TOUCH_SLIDE = 10; // 指がこれより動いたら、タップではなくなぞる操作とみなす（CSS px）
  const THUMB_PAD = 0.2; // 縦画面の下のこの割合は、親指を置く帯にする

  // ---- セーブ ----
  const SAVE_KEY = 'butsukari-buster-save-v1';
  function defaultSave() {
    return {
      yen: 0, up: Rules.emptyUpgrades(), reached: 0, dex: {}, best: 0, sound: true, fx: !reduced,
      endlessBest: 0, endlessLocal: [], nickname: '', token: '',
    };
  }
  // 壊れたデータや古い形式のデータでも遊べるよう、1 項目ずつ確かめて読み込む
  function loadSave() {
    const base = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return base;
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return base;
      const count = (v, max = Number.MAX_SAFE_INTEGER) => (Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 0), max) : 0);
      const up = {};
      for (const u of UPGRADES) up[u.id] = count(d.up && d.up[u.id], u.max);
      const dex = {};
      if (d.dex && typeof d.dex === 'object') {
        for (const type of Object.keys(TYPES)) {
          const e = d.dex[type];
          if (e && typeof e === 'object') dex[type] = { seen: count(e.seen), flown: count(e.flown), best: count(e.best) };
        }
      }
      const local = Array.isArray(d.endlessLocal) ? d.endlessLocal : [];
      return {
        ...base,
        yen: count(d.yen),
        up,
        reached: count(d.reached, STAGES.length - 1),
        dex,
        best: count(d.best),
        sound: typeof d.sound === 'boolean' ? d.sound : base.sound,
        fx: typeof d.fx === 'boolean' ? d.fx : base.fx,
        endlessBest: count(d.endlessBest),
        endlessLocal: local
          .filter((e) => e && typeof e === 'object')
          .slice(0, 10)
          .map((e) => ({ distance: count(e.distance), flown: count(e.flown), level: count(e.level), maxCombo: count(e.maxCombo), at: count(e.at) })),
        nickname: typeof d.nickname === 'string' ? d.nickname.slice(0, 12) : '',
        token: typeof d.token === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(d.token) ? d.token : '',
      };
    } catch {
      return base;
    }
  }
  const save = loadSave();
  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // 保存できない環境でも遊べるようにする
    }
  }

  // ---- 状態 ----
  const view = { W: 960, H: 540, ft: 195, depth: 500, scale: 1, dpr: 1, portrait: false };
  let mode = 'demo'; // demo / play / clear / ending / over / idle
  let gameMode = 'normal'; // normal / endless
  let run = null;
  let runPromise = null; // エンドレスの開始をサーバーへ伝えた結果
  let pendingScore = null; // まだランキングへ送れていない記録
  let bestPopped = false;
  let guideDevice = coarse ? 'sp' : 'pc';
  let guideBack = null;
  let rankingBack = null;
  let rankingTab = 'online';
  let rankingSeq = 0;
  let palette = Art.PALETTES[0];
  let bg = null;
  let bgStage = 0;
  let selectedStage = Math.min(save.reached, STAGES.length - 1);
  let rt = 0;
  let last = 0;
  let paused = false;
  let resumeLeft = 0; // 再開までのカウントダウン（秒）。0 なら止まったまま
  let lastBuyAt = 0;
  let renderResultRows = null; // リザルトの表を今の値で描き直す
  let resultLook = 0; // リザルトの裏に出すエリア
  let shake = 0;
  let zoom = 1;
  let zoomX = 0;
  let zoomY = 0;
  let impact = null;
  let lastNeg = -10;
  let lastSpeedLines = -10;
  let flyers = [];
  let particles = [];
  let pops = [];
  let bursts = [];
  let twinkles = [];
  let banners = [];
  let toasts = [];
  let train = null;
  let wipe = null;
  let act = null; // アバターの動作 { type, t, dir, dur }
  let restPose = null; // 遊びが終わったあとも主人公がとり続ける姿（down / win）
  let comboPop = -10;
  let hpPop = -10;
  let moving = 0;
  let moveHold = 0;
  let rings = [];
  let cracks = [];
  let decal = null;
  let decalCount = 0;
  let ghostP = null;
  let kickX = 0;
  let kickY = 0;
  let signAngle = 0;
  let signVel = 0;
  let warpFrom = 0;
  let warpUntil = 0;
  let warpScale = 1;
  let shownDist = 0;
  let distPop = -10;
  let lastRank = 0;
  let demoNext = 0;
  let pointer = null;
  let touchMode = coarse; // 指で遊んでいるか。途中で指を使ったら切り替える
  const touches = new Map(); // 触れている指ごとの状態
  let slideId = null; // 主人公を動かしている指
  let bankedDistance = 0;
  let sceneTimer = null;
  let lastMash = 0;
  let shopAfter = null;
  let zukanBack = null;
  const keys = new Set();

  const CRIES = ['腰がーっ', '定時ーっ', 'ローンがーっ', '有給ーっ', 'ボーナスーっ', '会議がーっ', '二次会ーっ', '痛風ーっ', '人事にーっ', '昭和ーっ', 'ゴルフがーっ', '推しがーっ', '特売ーっ'];
  const FINALE_CRIES = { kaicho: '定時ーっ', kumiai: '組合がーっ', tetsuya: '新刊がーっ', shacho: '株価がーっ', daio: '朝までーっ' };
  // ボスが来る前のお知らせ。ステージの場所ごとに変える。
  const BOSS_CALLS = {
    platform: (n) => [`まもなく 1番線に ${n}がまいります`, '黄色い線の内側で お待ちください'],
    arcade: (n) => [`商店街のみなさま ${n}のお通りです`, '道の端に お寄りください'],
    electric: (n) => [`ただいま ${n}が 列に割り込みました`, '押さないで お並びください'],
    office: (n) => [`${n}が 現場を見に来られます`, '姿勢を正して お待ちください'],
    yokocho: (n) => [`${n}、ご案内でーす`, '飲みすぎに ご注意ください'],
  };
  const HIT_JUST = ['ドゴォッ!!', 'ズドン!!', 'バキィッ!!'];
  const HIT_PARRY = ['ガッ!', 'ドカッ!', 'ゴッ!'];
  const NAME_RULE = 'この名前は使えません。文字と数字で12文字までにしてください。使えない言葉や記号が入っている場合もあります。';

  const play = (name, ...args) => {
    // タイトルの見本は音を出さない
    if (mode !== 'demo') Sound.sfx[name](...args);
  };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  // 幅 half * 2 のものが画面の端で切れないように内側へ寄せる
  const keepInside = (x, half) => Math.min(Math.max(x, half), view.W - half);
  const screenY = (z) => view.ft + z * SQUASH;
  const panOf = (x) => ((x / view.W) * 2 - 1) * 0.7;
  const depthScale = (z) => 0.9 + 0.22 * clamp01(z / view.depth);
  const BASE_S = 0.72;
  const yen = (n) => `¥${Math.floor(n).toLocaleString('ja-JP')}`;

  function fmtDist(m) {
    return m < 1000 ? `${m.toLocaleString('ja-JP')} m` : `${(m / 1000).toFixed(2)} km`;
  }

  // ---- レイアウト ----
  function layout() {
    const cssW = stageEl.clientWidth || innerWidth;
    const cssH = stageEl.clientHeight || innerHeight;
    // 非表示のタブなどで大きさが 0 のときは、見えるようになるまで待つ
    if (!cssW || !cssH) return;
    view.dpr = Math.min(devicePixelRatio || 1, 2);
    view.scale = Math.min(cssW / 480, cssH / 540);
    view.W = cssW / view.scale;
    view.H = cssH / view.scale;
    view.portrait = cssH >= cssW;
    // 縦画面は距離や体幹の表示の下に案内板が来るよう、床の開始位置を下げる
    view.ft = Math.round(view.portrait ? Math.max(view.H * 0.24, 250) : Math.max(view.H * 0.36, 190));
    view.depth = (view.H - view.ft - 8) / SQUASH;
    canvas.width = Math.max(1, Math.round(cssW * view.dpr));
    canvas.height = Math.max(1, Math.round(cssH * view.dpr));
    applyBounds();
    rebuildBg();
    // canvas の大きさを変えると中身が消えるので、次のコマを待たずに描き直す
    if (run) render();
  }

  function applyBounds() {
    if (!run) return;
    if (mode === 'demo') {
      if (view.portrait) {
        // 縦画面の見本は、タイトルの紙面とボタンの間に見える床だけを使う
        const r = stageEl.getBoundingClientRect();
        const panel = document.querySelector('.title-panel').getBoundingClientRect();
        const actions = document.querySelector('.title-actions').getBoundingClientRect();
        if (panel.height > 0) {
          const botPx = (actions.top - r.top) / view.scale - 6;
          const topPx = Math.min((panel.bottom - r.top) / view.scale + 96, botPx);
          run.setBounds({ x0: 0, x1: view.W, z0: (topPx - view.ft) / SQUASH, d: (botPx - view.ft) / SQUASH });
        }
        run.spawnSides = ['left', 'right'];
      } else {
        run.setBounds({ x0: view.W * 0.56, x1: view.W, z0: 0, d: view.depth });
        run.spawnSides = ['right', 'bottom'];
      }
    } else {
      // 縦画面の指の操作では、親指で敵が隠れないよう、おじさんと主人公は下の帯より上で動く
      const pad = usesThumbPad();
      run.setBounds({ x0: 0, x1: view.W, z0: 0, d: pad ? (padTop() - view.ft) / SQUASH : view.depth });
      run.spawnSides = pad ? ['left', 'right'] : ['left', 'right', 'bottom'];
    }
  }

  function usesThumbPad() {
    return touchMode && view.portrait;
  }

  function padTop() {
    return view.H * (1 - THUMB_PAD);
  }

  function rebuildBg() {
    const st = STAGES[bgStage];
    // 案内板には同じステージの中の行き先だけを出す
    const sameLine = (j) => (STAGES[j] && STAGES[j].line === st.line ? STAGES[j].name : null);
    bg = Art.buildBackground(palette, {
      seed: bgStage, theme: st.theme, sky: st.sky, name: st.name, kana: st.kana,
      prev: sameLine(bgStage - 1), next: sameLine(bgStage + 1),
    }, view, view.scale * view.dpr);
    // 床のひびや落とし物をためていく層。大きさかエリアが変わると白紙に戻る。
    decal = Art.makeLayer(view, view.scale * view.dpr);
    decalCount = 0;
    ghostP = Art.silhouette({ ...palette, ink: palette.line });
  }

  function setStageLook(i) {
    bgStage = i;
    palette = Art.PALETTES[i];
    const root = document.documentElement.style;
    root.setProperty('--paper', palette.paper);
    root.setProperty('--ink', palette.ink);
    root.setProperty('--tone', palette.tone);
    root.setProperty('--sign', palette.sign);
    root.setProperty('--sign-ink', palette.signInk);
    root.setProperty('--band', palette.band);
    root.setProperty('--shadow', palette.night ? palette.tone : palette.ink);
    rebuildBg();
  }

  // ---- 画面の切り替え ----
  const OVERLAYS = ['title', 'pause', 'shop', 'zukan', 'result', 'guide', 'ranking'];
  const SHEETS = ['shop', 'zukan', 'guide', 'ranking'];
  let sheetOpener = null;
  function showOverlay(id) {
    const focused = document.activeElement;
    for (const key of OVERLAYS) $(key).hidden = key !== id;
    $('pauseBtn').hidden = !(id === null && mode === 'play');
    stageEl.classList.toggle('playing', id === null && mode === 'play');
    if (SHEETS.includes(id)) {
      sheetOpener = focused;
    } else {
      // シートを閉じたら、開いたボタンへフォーカスを戻す
      if (id && sheetOpener && !coarse) sheetOpener.focus({ preventScroll: true });
      sheetOpener = null;
    }
    if (id === 'result') {
      // 出た直後は押せないようにする。やめるボタンの二度押しで次の遊びを始めてしまわないように。
      $('result').classList.add('settling');
      setTimeout(() => $('result').classList.remove('settling'), 350);
    }
    // シートを開いたまま画面を回したときも、見本の動ける範囲を今の大きさに合わせる
    if (id === 'title') applyBounds();
  }

  function clearFx() {
    flyers = [];
    particles = [];
    pops = [];
    bursts = [];
    twinkles = [];
    banners = [];
    toasts = [];
    impact = null;
    train = null;
    act = null;
    restPose = null;
    shake = 0;
    zoom = 1;
    rings = [];
    cracks = [];
    kickX = 0;
    kickY = 0;
    signAngle = 0;
    signVel = 0;
    warpUntil = 0;
    lastRank = 0;
    clearTimeout(sceneTimer);
  }

  function enterDemo() {
    mode = 'demo';
    paused = false;
    clearFx();
    setStageLook(0);
    Sound.stopBgm();
    run = new Rules.Run(Math.floor(Math.random() * 1e6), {
      demo: true,
      upgrades: { kata: 1, hansha: 1 },
      mix: { normal: 3, fast: 2, phone: 1, umbrella: 1, feint: 1, futo: 2, otaku: 2, bike: 1, hardhat: 1, muscle: 1 },
      moveCap: 320, // 見本はカーソルがないので歩かせる
    });
    applyBounds();
    run.beginStage(0);
    demoNext = 0;
    renderTitle();
    showOverlay('title');
    applyBounds();
    if (!coarse) $('startBtn').focus({ preventScroll: true });
  }

  function playerToken() {
    if (!save.token) {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      save.token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      writeSave();
    }
    return save.token;
  }

  function startEndless() {
    Sound.unlock();
    startWipe(() => {
      gameMode = 'endless';
      mode = 'play';
      paused = false;
      clearFx();
      run = new Rules.Run(Math.floor(Math.random() * 1e6), { upgrades: save.up, endless: true, touch: touchMode });
      bankedDistance = 0;
      shownDist = 0;
      bestPopped = false;
      setStageLook(0);
      applyBounds();
      run.beginEndless();
      if (pointer && !touchMode) run.setTarget(pointer.x, pointer.z);
      const best = save.endlessBest > 0 ? ` ／ 自己ベスト ${fmtDist(save.endlessBest)}` : '';
      addBanner('エンドレスモード', `体幹は3で固定${best}`, 2.3);
      Sound.startBgm(run.stage.bpm, run.stage.root);
      showOverlay(null);
      // 遊び始めの時刻をサーバーに覚えてもらう。通信できなくても遊べる。
      runPromise = Ranking.startRun(playerToken());
    });
  }

  function startGame(stageIndex) {
    Sound.unlock();
    startWipe(() => {
      gameMode = 'normal';
      mode = 'play';
      paused = false;
      clearFx();
      run = new Rules.Run(Math.floor(Math.random() * 1e6), { upgrades: save.up, touch: touchMode });
      bankedDistance = 0;
      shownDist = 0;
      beginStage(stageIndex);
      showOverlay(null);
    });
  }

  function beginStage(i, advanced = false) {
    clearFx();
    mode = 'play';
    setStageLook(i);
    applyBounds();
    // エリアの間で鍛えた分をここで反映する
    run.applyUpgrades(save.up);
    run.beginStage(i);
    // コンボはエリアをまたいで続くので、すでに届いている段位で「昇格」と出さない
    lastRank = Rules.comboRankIndex(run.combo);
    bankedDistance = run.distance;
    if (pointer && !touchMode) run.setTarget(pointer.x, pointer.z);
    const st = STAGES[i];
    const z = run.zone;
    const place = `${st.name}（${st.label}）`;
    const prev = advanced ? Rules.zonesFor(i - 1, save.up, touchMode) : null;
    const sub = prev
      ? `${place} ／ 輪がせまくなった ${prev.parry} → ${z.parry}`
      : `${place} ／ ${st.goal}人ぶっとばすとボスが来ます`;
    addBanner(`ステージ${st.line + 1} ${LINES[st.line].name}${st.area ? ` エリア${st.area + 1}` : ''}`, sub, 2.3);
    Sound.startBgm(st.bpm, st.root);
    showOverlay(null);
  }

  function addBanner(main, sub, dur) {
    banners.push({ main, sub, t0: rt, dur });
  }

  function startWipe(onMid) {
    wipe = { t0: rt, dur: 0.72, onMid, fired: false };
  }

  // ---- 入力 ----
  // マウスはカーソルの位置へ動き、クリックで体当たりする。
  // 指も同じ感覚で遊べるよう、なぞった分だけ動き、タップはその場で体当たりする。どこに指を置いても同じに動く。
  function pointerToFloor(e) {
    const r = stageEl.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, z: ((e.clientY - r.top) / view.scale - view.ft) / SQUASH };
  }

  function follow(e) {
    pointer = pointerToFloor(e);
    if (mode === 'play' && !paused) run.setTarget(pointer.x, pointer.z);
  }

  function touchDown(e) {
    if (!touchMode) {
      touchMode = true;
      run.setTouch(true);
      applyBounds();
    }
    // 触れた瞬間に輪の中の相手がいれば、すぐはじく。いなければ、タップかなぞる操作かが分かるまで待つ。
    const hit = run.time >= run.lockUntil && run.bestGap() <= run.zone.parry;
    if (hit) press();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, slid: false, hit });
  }

  function touchMove(e) {
    const t = touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (Math.hypot(e.clientX - t.startX, e.clientY - t.startY) >= TOUCH_SLIDE) t.slid = true;
    if (!t.slid || mode !== 'play' || paused) return;
    // 2 本の指で同時になぞったら、先の指だけで動かす
    if (slideId === null) slideId = e.pointerId;
    if (slideId !== e.pointerId) return;
    const k = TOUCH_GAIN / view.scale;
    run.setTarget(run.avatar.tx + dx * k, run.avatar.tz + (dy * k) / SQUASH);
  }

  function touchUp(e) {
    const t = touches.get(e.pointerId);
    touches.delete(e.pointerId);
    if (e.pointerId === slideId) slideId = null;
    // なぞっただけなら空振りにしない。触れたときに相手がいなかったタップは、ここで体当たりする。
    if (t && !t.slid && !t.hit && e.type === 'pointerup' && mode === 'play' && !paused) press();
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') follow(e);
    else touchMove(e);
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (mode !== 'play' || paused) return;
    e.preventDefault();
    if (e.pointerType === 'mouse') {
      follow(e);
      press();
    } else {
      touchDown(e);
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerup', touchUp);
  canvas.addEventListener('pointercancel', touchUp);

  const MOVE_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (mode === 'play' && !e.repeat) {
        if (paused && !resumeLeft) requestResume();
        else pauseGame();
      }
      return;
    }
    if (mode !== 'play' || paused) return;
    if (MOVE_KEYS[e.code]) {
      keys.add(e.code);
      e.preventDefault();
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && e.target !== $('pauseBtn')) {
      e.preventDefault();
      if (!e.repeat) press();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));

  function press() {
    if (mode !== 'play' && mode !== 'demo') return;
    // ヒットストップ中の押し直しは受け付けない。ダブルクリックで空振りにならないように。
    if (impact && !impact.mini) return;
    const evs = run.press();
    // 同時にはじいたときは、文字と衝撃を 1 回ぶんにまとめる
    const parries = evs.filter((e) => e.kind === 'parry' && !e.projectile);
    parries.forEach((e, i) => {
      e.lead = i === 0;
      e.batch = parries;
    });
    for (const ev of evs) handle(ev);
  }

  function pauseGame() {
    // カウントダウンの途中なら止め直す
    if (mode !== 'play' || (paused && !resumeLeft)) return;
    paused = true;
    resumeLeft = 0;
    keys.clear();
    Sound.suspend();
    syncToggles();
    $('quitBtn').textContent = gameMode === 'endless' ? 'ここで終えて記録する' : 'やめてタイトルへ';
    showOverlay('pause');
    $('pauseBtn').hidden = true;
    stageEl.classList.remove('playing');
    if (!coarse) $('resumeBtn').focus({ preventScroll: true });
  }

  function requestResume() {
    showOverlay(null);
    resumeLeft = 1.2;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !BOT) pauseGame();
  });
  window.addEventListener('blur', () => {
    keys.clear(); // 別の画面でキーを離すと keyup が届かない
    if (!BOT) pauseGame();
  });

  // ---- 演出 ----
  function addPop(txt, x, y, size, o = {}) {
    // 画面の幅に収まる大きさにして、端で文字が切れないように内側へ寄せる
    size = Art.fitFont(c, txt, o.font || FONT.manga, size, view.W - 24);
    x = keepInside(x, c.measureText(txt).width / 2 + 10);
    y = Math.max(y, size / 2 + 8);
    pops.push({ txt, x, y, size, t0: rt, dur: o.dur || 0.6, rot: o.rot || 0, font: o.font, vy: o.vy ?? -26, fill: o.fill, stroke: o.stroke, from: o.from || 1.5 });
  }

  // floorY を渡すと、紙や落とし物はそこへ落ちて床に残る
  function spawnParticles(x, y, kinds, n, spread = 1, floorY = null) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const sp = (200 + Math.random() * 420) * spread;
      const kind = pick(kinds);
      const lands = floorY !== null && (kind === 'paper' || kind === 'wig' || kind === 'glasses');
      particles.push({
        kind,
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 16,
        size: 3 + Math.random() * 4,
        age: 0,
        life: lands ? 3 : kind === 'puff' ? 0.3 : 0.55 + Math.random() * 0.55,
        landY: lands ? floorY - 20 + Math.random() * 60 : null,
      });
    }
  }

  function stampCrack(x, y, r) {
    if (!decal) return;
    Art.crack(decal[1], palette.line, x, y, r, Math.floor(Math.random() * 1e6), SQUASH);
    noteDecal();
  }

  function noteDecal() {
    decalCount++;
    // タイトルの見本は延々と続くので、ときどき掃除する
    if (mode === 'demo' && decalCount > 40) rebuildBg();
  }

  function pushCamera(dx, dz, amount) {
    if (!save.fx || mode === 'demo') return;
    kickX = dx * amount;
    kickY = dz * SQUASH * amount;
  }

  function checkRank() {
    const r = Rules.comboRankIndex(run.combo);
    if (r > lastRank && mode === 'play') {
      // 判定の文字と重ならないよう、段位の表示のすぐ下に出す
      addPop(`${Rules.COMBO_RANKS[r].name}に昇格!`, view.W, 180, 26, { font: FONT.display, dur: 1.3, vy: -6, stroke: palette.spot, from: 2 });
      play('rank');
    }
    lastRank = r;
    Sound.setBgm({ level: Math.min(r, 2) });
    // エンドレスで自己ベストを超えた瞬間を知らせる
    if (gameMode === 'endless' && mode === 'play' && !bestPopped && save.endlessBest > 0 && run.distance > save.endlessBest) {
      bestPopped = true;
      addPop('自己ベスト更新!', view.W / 2, view.ft + 100, 34, { font: FONT.display, dur: 1.4, vy: -14, stroke: palette.spot, from: 2.2 });
      play('rank');
    }
  }

  function drawScaleOf(o) {
    return BASE_S * depthScale(o.z) * TYPES[o.type].scale;
  }

  function avatarPos() {
    return { x: run.avatar.x, y: screenY(run.avatar.z) };
  }

  // 飛び道具をはじいた。距離は少しだけで、画面は止めない。
  function onDeflect(ev) {
    const o = ev.o;
    const a = avatarPos();
    const oy = screenY(o.z) - 60;
    const sx = Math.sign(o.dx) || 1;
    act = { type: 'tackle', t: rt, dir: sx, dur: 0.22, reach: 30 };
    bursts.push({ x: o.x, y: oy, t0: rt, dur: 0.2, r: 56, rot: Math.random() * 6 });
    spawnParticles(o.x, oy, ['dot', 'star'], 5, 0.8);
    if (save.fx && mode !== 'demo') shake = Math.max(shake, 7);
    addPop('カキン!', o.x, oy - 30, 34, { dur: 0.5, vy: -18, from: 1.6 });
    addPop(`+${ev.dist.toLocaleString('ja-JP')} m`, a.x, a.y - 130, 19, { font: FONT.display, dur: 0.7, vy: -22 });
    play('clang', panOf(o.x));
    comboPop = rt;
    distPop = rt;
    checkRank();
  }

  // はじいた飛び道具が、撃った本人に当たった
  function onReflect(ev) {
    const o = ev.o;
    const oy = screenY(o.z);
    rings.push({ x: o.x, y: oy, t0: rt, dur: 0.3, r: 150 });
    bursts.push({ x: o.x, y: oy - 60, t0: rt, dur: 0.24, r: 84, rot: Math.random() * 6 });
    if (save.fx && mode !== 'demo') shake = Math.max(shake, 12);
    addPop('返した!', o.x, oy - 138, 34, { font: FONT.display, dur: 0.9, vy: -30, stroke: palette.spot, from: 2 });
    addPop(`+${ev.dist.toLocaleString('ja-JP')} m`, o.x, oy - 104, 21, { font: FONT.display, dur: 0.85, vy: -38 });
    play('chain', panOf(o.x), 1);
    comboPop = rt;
    distPop = rt;
    checkRank();
    if (ev.final) {
      launch(o, ev, oy);
      spawnParticles(o.x, oy - 60, ['paper', 'dot', 'star'], 8, 1.1, oy);
      stampCrack(o.x, oy, 34);
      noteFlown(o.type, ev.dist);
    }
  }

  // 現場おじさんのヘルメット。パリィでは弾かれるだけ。
  function onGuarded(ev) {
    const o = ev.o;
    const a = avatarPos();
    const oy = screenY(o.z);
    act = { type: 'tackle', t: rt, dir: Math.sign(o.dx) || 1, dur: 0.24, reach: 30 };
    bursts.push({ x: (a.x + o.x) / 2, y: (a.y + oy) / 2 - 60, t0: rt, dur: 0.2, r: 60, rot: Math.random() * 6 });
    if (save.fx && mode !== 'demo') shake = Math.max(shake, 8);
    addPop('ガキン!', o.x, oy - 130, 34, { dur: 0.5, vy: -14, from: 1.6 });
    addPop('ジャストでないと飛ばない', o.x, oy - 96, 16, { font: FONT.ui, dur: 1, vy: -10 });
    play('clang', panOf(o.x));
  }

  function onParry(ev) {
    const o = ev.o;
    const T = TYPES[o.type];
    const just = ev.batch.some((e) => e.grade === 'just');
    const a = avatarPos();
    const oy = screenY(o.z);
    const sx = Math.sign(o.dx) || 1;
    const cx = (a.x + o.x) / 2;
    const cy = (a.y + oy) / 2 - 56;
    if (!ev.lead) {
      if (ev.final) {
        launch(o, ev, oy);
        spawnParticles(cx, cy, ['paper', 'dot'], 4, 1, oy);
        noteFlown(o.type, ev.dist);
      }
      bursts.push({ x: cx, y: cy, t0: rt, dur: 0.24, r: 80, rot: Math.random() * 6 });
      return;
    }
    // コンボが伸びるほど少しずつ派手にする（0〜1）
    const power = clamp01(run.combo / 20);
    act = { type: 'tackle', t: rt, dir: sx, dur: just ? 0.36 : 0.28, reach: just ? 64 : 42 };

    const bigFinal = ev.final && T.boss;
    // ヒットストップ。この間はおじさんもアバターも止まる。
    const stop = bigFinal ? 0.32 : just ? 0.11 + power * 0.04 : 0.065;
    // タイトルの見本は眺めるだけの画面なので、点滅や揺れは出さない
    const loud = save.fx && mode !== 'demo';
    const neg = just && loud && rt - lastNeg > 0.35;
    if (neg) lastNeg = rt;
    impact = { t0: rt, until: rt + stop, neg, x: cx, y: cy, o: { ...o, drawY: oy }, dirX: sx };
    if (loud) {
      shake = Math.max(shake, bigFinal ? 26 : just ? 15 + power * 7 : 8);
      if (just) {
        zoom = bigFinal ? 1.12 : 1.06 + power * 0.02;
        zoomX = cx;
        zoomY = cy;
        lastSpeedLines = rt + stop;
      }
    }
    pushCamera(o.dx, o.dz, just ? 26 : 12);
    signVel += sx * (bigFinal ? 2.6 : just ? 1.1 + power * 0.8 : 0.4);
    rings.push({ x: a.x, y: a.y, t0: rt + stop, dur: just ? 0.42 : 0.26, r: just ? 240 + power * 120 : 130 });
    bursts.push({ x: cx, y: cy, t0: rt, dur: stop + (just ? 0.2 : 0.14), r: just ? 118 + power * 40 : 70, rot: Math.random() * 6 });
    if (ev.final || just) stampCrack(o.x, oy, just ? 48 + power * 30 : 26);

    const pan = panOf(cx);
    if (!ev.final) play('clang', pan);
    else if (just) play('just', pan, run.combo);
    else play('parry', pan, run.combo);

    const tilt = (Math.random() - 0.5) * 0.3;
    addPop(pick(ev.final ? (just ? HIT_JUST : HIT_PARRY) : ['ガキン!']), cx, cy - 8, just ? 68 + power * 18 : 40, { rot: tilt, dur: 0.6, vy: -18, from: just ? 2.2 : 1.6 });
    addPop(just ? 'ジャストパリィ!!' : 'パリィ!', a.x, a.y - 168, just ? 32 : 24, { font: FONT.display, dur: 0.8, vy: -28, fill: palette.ink, stroke: palette.spot, from: just ? 2 : 1.5 });
    const total = ev.batch.reduce((sum, e) => sum + e.dist, 0);
    const multi = ev.batch.length > 1 ? ` ${ev.batch.length}人まとめて` : '';
    addPop(`+${total.toLocaleString('ja-JP')} m${multi}`, a.x, a.y - 130, just ? 26 : 21, { font: FONT.display, dur: 0.95, vy: -22 });
    comboPop = rt;
    distPop = rt;
    checkRank();

    if (ev.final) {
      launch(o, ev, oy);
      spawnParticles(cx, cy, ['paper', 'paper', 'dot', 'star'], just ? 14 + Math.round(power * 10) : 6, just ? 1.3 : 1, oy);
      if (just) spawnParticles(cx, cy - 30, ['wig', 'glasses'], 2, 1.1, oy);
      spawnParticles(a.x - sx * 20, a.y - 2, ['puff'], just ? 4 : 2, 0.2);
      noteFlown(o.type, ev.dist);
    } else {
      spawnParticles(cx, cy, ['dot', 'star'], 6, 0.9);
    }
    if (bigFinal) {
      addPop(`${T.name} ぶっとばし!!`, view.W / 2, view.ft + 92, 44, { font: FONT.display, dur: 1.5, vy: -14, stroke: palette.spot, from: 2.4 });
      warpFrom = rt + stop;
      warpUntil = warpFrom + 0.45;
      warpScale = 0.35;
    }
  }

  // 飛んでいくおじさんに巻き込まれた人
  function onChain(ev, f) {
    const o = ev.o;
    const oy = screenY(o.z);
    const root = f.root;
    root.n++;
    const sx = Math.sign(o.dx) || 1;
    impact = { t0: rt, until: rt + 0.05, neg: false, mini: true };
    if (save.fx && mode !== 'demo') shake = Math.max(shake, 10 + root.n * 2);
    signVel += sx * 0.5;
    rings.push({ x: o.x, y: oy, t0: rt, dur: 0.3, r: 150 });
    bursts.push({ x: o.x, y: oy - 60, t0: rt, dur: 0.24, r: 84, rot: Math.random() * 6 });
    stampCrack(o.x, oy, 34);
    const size = 28 + Math.min(root.n, 6) * 5;
    addPop(`${root.n}人抜き!`, o.x, oy - 138, size, { font: FONT.display, dur: 0.9, vy: -30, stroke: palette.spot, from: 2 });
    addPop(`+${ev.dist.toLocaleString('ja-JP')} m`, o.x, oy - 104, 21, { font: FONT.display, dur: 0.85, vy: -38 });
    play('chain', panOf(o.x), root.n);
    comboPop = rt;
    distPop = rt;
    checkRank();
    if (ev.final) {
      launch(o, ev, oy, root);
      spawnParticles(o.x, oy - 60, ['paper', 'dot', 'star'], 8, 1.1, oy);
      noteFlown(o.type, ev.dist);
    }
    if (root.n >= 3) {
      warpFrom = rt;
      warpUntil = rt + 0.14;
      warpScale = 0.45;
    }
  }

  // 飛び方は 4 種類。ジャストは空へ飛んでキラーン、手前へ飛ぶと画面にぶつかる。
  // パリィは床すれすれで画面の端まで飛ぶ。各ステージの最後のボスは、月や太陽まで飛ぶ。
  function launch(o, ev, oy, root) {
    const T = TYPES[o.type];
    const just = ev.grade === 'just';
    const s = drawScaleOf(o);
    const { W, H, ft } = view;
    const f = {
      type: o.type, x0: o.x, z0: o.z, y0: oy, dx: o.dx, dz: o.dz,
      x: o.x, y: oy, fx: o.x, fz: o.z, s, scale: s, age: 0, rot: 0, stretch: 0.7,
      vx: 0, vy: 0, ghosts: [], hit: new Set([o.id]), spin: (Math.sign(o.dx) || 1) * (just ? 16 : 20),
      cry: pick(CRIES), just, boss: !!T.boss, grade: ev.grade, phase: Math.random(), root: root || { n: 1 }, dist: ev.dist,
    };
    const threat = run.ojisan.some((q) => q.state === 'tell' || q.state === 'dash' || q.state === 'contact' || q.state === 'feintStop');
    if (T.finale) {
      f.style = 'finale';
      f.life = 2.3;
      // 屋根の下など月や太陽が見えない場所では、画面の上へ飛び去る
      f.target = bg.skyBody || { x: W / 2, y: 46, label: '空のかなたへキラーン' };
      f.cry = FINALE_CRIES[o.type];
    } else if (!just) {
      // 真上や真下に飛ぶと端へ届かないので、横向きに寄せる
      const ax = (Math.sign(o.dx) || 1) * Math.max(Math.abs(o.dx), 0.75);
      const len = Math.hypot(ax, o.dz);
      f.style = 'edge';
      f.life = 2;
      f.dx = ax / len;
      f.dz = o.dz / len;
    } else if (!T.boss && !ev.chain && !threat && o.dz > 0.5) {
      // 手前へ飛んだら画面にぶつかる。ほかのおじさんが突っ込んでいるときは視界をふさがない。
      f.style = 'screen';
      f.life = 1.05;
      f.tx = Math.min(Math.max(o.x, 120), W - 120);
      f.spin = 0;
      f.rot = -0.25 * (Math.sign(o.dx) || 1);
    } else {
      f.style = 'star';
      f.life = T.boss ? 1.25 : 0.9;
      // キラーンの星と文字が、距離の表示や画面の端にかからない所で光るようにする
      f.skyY = 84 + Math.random() * Math.max(ft - 170, 24);
      const room = o.dx > 0 ? W - 130 - o.x : o.x - 130;
      f.reach = Math.min(680, Math.max(room, 0) / Math.max(Math.abs(o.dx), 0.01));
      play('whistle', panOf(o.x), f.life);
    }
    void H;
    flyers.push(f);
  }

  function stepFlyer(f, dt) {
    const px = f.x;
    const py = f.y;
    const { H, W } = view;
    f.age += dt;
    const t = f.age;
    f.rot += f.spin * dt;
    f.stretch = Math.max(f.stretch - dt * 2.6, 0);
    switch (f.style) {
      case 'star': {
        const k = 1 - Math.exp(-6 * t);
        f.fx = f.x0 + f.dx * f.reach * k;
        f.fz = f.z0 + f.dz * f.reach * 0.55 * k;
        const q = clamp01(t / f.life);
        const ground = screenY(f.fz);
        f.x = f.fx;
        f.y = ground - (ground - f.skyY) * Math.pow(q, 1.6);
        f.scale = f.s * (1 - 0.88 * Math.pow(q, 1.4));
        if (t >= f.life) {
          f.done = true;
          twinkles.push({ x: f.x, y: f.y, t0: rt, dur: 0.75, r: f.boss ? 58 : 38, label: `キラーン ${f.dist.toLocaleString('ja-JP')} m` });
          play('twinkle', panOf(f.x));
        }
        break;
      }
      case 'edge': {
        const sp = 1750;
        f.fx += f.dx * sp * dt;
        f.fz += f.dz * sp * dt;
        f.x = f.fx;
        f.y = screenY(f.fz) - 34 - Math.sin(Math.min(t * 7, Math.PI)) * 46;
        if (f.x < -90 || f.x > W + 90) {
          f.done = true;
          const edge = f.x < 0 ? 0 : W;
          const y = Math.max(f.y - 60, 70);
          cracks.push({ x: edge, y, r: 150, t0: rt, dur: 0.9, seed: Math.floor(Math.random() * 1e6) });
          spawnParticles(edge, y, ['dot', 'star', 'paper'], 8, 0.8);
          addPop('ガシャーン', f.x < 0 ? 96 : W - 96, y, 34, { dur: 0.7, rot: f.x < 0 ? -0.12 : 0.12, from: 1.8 });
          if (save.fx && mode !== 'demo') shake = Math.max(shake, 11);
          pushCamera(f.dx, 0, 14);
          play('crash', f.x < 0 ? -0.9 : 0.9);
        }
        break;
      }
      case 'screen': {
        const grow = 0.26;
        if (t < grow) {
          const q = t / grow;
          f.x = f.x0 + (f.tx - f.x0) * q;
          f.y = f.y0 + (H * 1.04 - f.y0) * q * q;
          f.scale = f.s * (1 + 1.2 * q * q);
        } else if (!f.slammed) {
          f.slammed = true;
          f.x = f.tx;
          f.y = H * 1.04;
          f.scale = f.s * 2.2;
          // ひびは顔のあたりから広がる
          const faceY = f.y - 165 * f.scale;
          cracks.push({ x: f.tx, y: faceY, r: Math.min(W, H) * 0.46, t0: rt, dur: 1.25, seed: Math.floor(Math.random() * 1e6), glass: true });
          addPop('ビタン!!', f.tx, faceY - 96, 66, { dur: 0.8, vy: -10, rot: -0.08, from: 2.2 });
          if (save.fx && mode !== 'demo') shake = Math.max(shake, 20);
          signVel += 1;
          play('slam');
        } else if (t > 0.62) {
          f.y = H * 1.04 + Math.pow(t - 0.62, 2) * 2800;
        }
        if (t >= f.life) f.done = true;
        break;
      }
      default: {
        // 月や太陽まで
        const q = clamp01(t / f.life);
        const k = 1 - Math.pow(1 - q, 2.4);
        f.x = f.x0 + (f.target.x - f.x0) * k;
        f.y = f.y0 + (f.target.y - f.y0) * k - Math.sin(q * Math.PI) * 40;
        f.scale = f.s * (1 - 0.95 * Math.pow(q, 0.8));
        if (t >= f.life) {
          f.done = true;
          twinkles.push({ x: f.x, y: f.y, t0: rt, dur: 1.1, r: 62, label: f.target.label });
          if (save.fx) shake = Math.max(shake, 12);
          play('twinkle', panOf(f.x));
        }
      }
    }
    if (dt > 0) {
      f.vx = (f.x - px) / dt;
      f.vy = (f.y - py) / dt;
    }
    f.ghosts.push({ x: px, y: py, scale: f.scale, rot: f.rot });
    if (f.ghosts.length > 5) f.ghosts.shift();
  }

  // 飛んでいる途中でほかのおじさんに当たると、巻き込んで一緒に飛ばす
  function bowl(f) {
    const low = f.style === 'edge' || (f.style === 'star' && f.age < 0.26);
    if (!low || f.done) return;
    for (const o of run.ojisan.slice()) {
      if (f.hit.has(o.id) || TYPES[o.type].boss || o.state === 'leave') continue;
      const d = Math.hypot(o.x - f.fx, o.z - f.fz);
      if (d > 76 * TYPES[o.type].scale) continue;
      f.hit.add(o.id);
      // 当たった向きを少し混ぜて、まっすぐ揃わないようにする
      const mx = f.dx * 0.75 + ((o.x - f.fx) / (d || 1)) * 0.25;
      const mz = f.dz * 0.75 + ((o.z - f.fz) / (d || 1)) * 0.25;
      const len = Math.hypot(mx, mz) || 1;
      for (const ev of run.chainHit(o, f.grade, f.root.n, mx / len, mz / len)) onChain(ev, f);
    }
  }

  function onHurt(ev) {
    const o = ev.o;
    const a = avatarPos();
    act = { type: 'hurt', t: rt, dir: -Math.sign(o.dx) || 1, dur: 0.5 };
    if (save.fx) shake = Math.max(shake, 18);
    addPop('ドンッ', a.x, a.y - 80, 44, { rot: -0.14, dur: 0.45 });
    addPop('体幹 -1', a.x, a.y - 150, 21, { font: FONT.display, dur: 0.8, vy: -30 });
    play('hurt', panOf(a.x));
    Sound.setBgm({ level: 0 });
    lastRank = 0;
    hpPop = rt;
    spawnParticles(a.x, a.y - 60, ['dot'], 6, 0.7);
    if (Math.random() < 0.7) addPop(pick(['チッ', 'どこ見てんだ', '気をつけろ', 'ふん']), o.x, screenY(o.z) - 130, 17, { font: FONT.ui, dur: 1, vy: -14 });
  }

  function onWhiff(ev) {
    const a = avatarPos();
    const dir = Math.sign(ev.o.x - a.x) || 1;
    act = { type: 'whiff', t: rt, dir, dur: ev.lock };
    addPop('スカッ', a.x + dir * 34, a.y - 96, 28, { rot: dir * 0.1, dur: 0.45 });
    play('whiff');
    Sound.setBgm({ level: 0 });
    lastRank = 0;
  }

  function onSwing() {
    if (act && rt - act.t < act.dur) return;
    act = { type: 'tackle', t: rt, dir: run.avatar.dirX, dur: 0.22 };
    play('swing');
  }

  function noteSeen(type) {
    const d = save.dex[type] || (save.dex[type] = { seen: 0, flown: 0, best: 0 });
    const first = d.seen === 0;
    d.seen++;
    if (first && mode === 'play') {
      // 初めて見る仕掛けは、どう動くかも知らせる
      const hint = DEX.find((e) => e.type === type).hint;
      toasts.push({ txt: `図鑑に登録：${TYPES[type].name}${hint ? ` ／ ${hint}` : ''}`, t0: rt, dur: hint ? 4 : 2.6 });
      Sound.sfx.coin();
      writeSave();
    }
  }

  function noteFlown(type, dist) {
    if (mode !== 'play') return;
    const d = save.dex[type] || (save.dex[type] = { seen: 1, flown: 0, best: 0 });
    d.flown++;
    d.best = Math.max(d.best, dist);
  }

  // 距離をバスター手当にする（1 m = 1 円）
  function bank() {
    save.yen += run.distance - bankedDistance;
    bankedDistance = run.distance;
    if (gameMode === 'endless') save.endlessBest = Math.max(save.endlessBest, run.distance);
    else save.best = Math.max(save.best, run.distance);
    writeSave();
  }

  function handle(ev) {
    switch (ev.kind) {
      case 'spawn':
        if (mode === 'play') noteSeen(ev.o.type);
        ev.o.say = Math.random() < 0.34;
        if (TYPES[ev.o.type].boss && mode === 'play') Sound.setBgm({ calm: false, boss: true });
        break;
      case 'tell':
        play('tell', panOf(ev.o.x), TYPES[ev.o.type].tell);
        break;
      case 'dash':
        play('dash', panOf(ev.o.x));
        break;
      case 'feint':
        addPop('ピタッ', ev.o.x, screenY(ev.o.z) - 130, 26, { dur: 0.5, vy: -10 });
        play('feint', panOf(ev.o.x));
        break;
      case 'turn':
        addPop('ん?', ev.o.x, screenY(ev.o.z) - 130, 30, { dur: 0.5, vy: -10 });
        play('feint', panOf(ev.o.x));
        break;
      case 'bounce':
        addPop('ボヨン', ev.o.x, screenY(ev.o.z) - 130, 28, { dur: 0.5, vy: -10 });
        play('feint', panOf(ev.o.x));
        break;
      case 'warp':
        spawnParticles(ev.fromX, screenY(ev.fromZ) - 60, ['puff'], 6, 0.3);
        addPop('スッ…', ev.fromX, screenY(ev.fromZ) - 110, 26, { dur: 0.6, vy: -16 });
        play('feint', panOf(ev.fromX));
        break;
      case 'shoot':
        addPop(ev.shot.type === 'ball' ? 'ナイスショット!' : 'クドクド', ev.o.x, screenY(ev.o.z) - 130, 22, { dur: 0.6, vy: -14 });
        play('dash', panOf(ev.o.x));
        break;
      case 'parry':
        if (ev.projectile) onDeflect(ev);
        else onParry(ev);
        break;
      case 'reflect':
        onReflect(ev);
        break;
      case 'guarded':
        onGuarded(ev);
        break;
      case 'hurt':
        onHurt(ev);
        break;
      case 'whiff':
        onWhiff(ev);
        break;
      case 'swing':
        onSwing();
        break;
      case 'bossCall':
        {
          const [main, sub] = BOSS_CALLS[STAGES[bgStage].theme](TYPES[ev.type].name);
          addBanner(main, sub, 3);
        }
        Sound.sfx.bossCall();
        Sound.setBgm({ calm: true });
        break;
      case 'levelUp':
        {
          // 判定の文字と重ならないよう、画面の左側に出す
          const y = view.portrait ? view.ft + 46 : 112;
          addPop(`レベル ${ev.level}`, 0, y, 34, { font: FONT.display, dur: 1.6, vy: -6, stroke: palette.spot, from: 2 });
          addPop(`範囲 ${ev.zone.parry} ／ ジャスト ${ev.zone.just}`, 0, y + 34, 15, { font: FONT.ui, dur: 1.6, vy: -6 });
          play('rank');
        }
        break;
      case 'nextArea':
        startWipe(() => {
          setStageLook(ev.look);
          const st = run.stage;
          addBanner(st.name, `${LINES[st.line].name} ／ レベル ${ev.level}`, 2);
          Sound.startBgm(st.bpm, st.root);
          Sound.setBgm({ level: Math.min(Rules.comboRankIndex(run.combo), 2) });
        });
        break;
      case 'stageEnd':
        onStageEnd(ev.index);
        break;
      case 'gameOver':
        onGameOver();
        break;
      default:
        break;
    }
  }

  // ゲームが終わった場面では、一時停止ボタンを消してカーソルを戻す
  function leavePlayUi() {
    $('pauseBtn').hidden = true;
    stageEl.classList.remove('playing');
  }

  function onStageEnd(index) {
    if (mode === 'demo') return;
    leavePlayUi();
    const earned = run.distance - run.stageStartDistance;
    bank();
    save.reached = Math.max(save.reached, Math.min(index + 1, STAGES.length - 1));
    selectedStage = save.reached;
    writeSave();
    Sound.stopBgm();
    Sound.sfx.clear();
    const st = STAGES[index];
    const nextSt = STAGES[index + 1];
    if (!nextSt) {
      mode = 'ending';
      restPose = 'win';
      addBanner('全ステージクリア!', `+${fmtDist(earned)} ／ バスター手当 +${yen(earned)}`, 3.4);
      Sound.sfx.chime();
      sceneTimer = setTimeout(() => showResult(true), 3600);
      return;
    }
    const stageCleared = nextSt.line !== st.line;
    mode = 'clear';
    // 電車が来るのは駅のホームだけ
    if (st.theme === 'platform') {
      train = { t0: rt, dur: 1.9 };
      Sound.sfx.train();
    }
    setTimeout(() => Sound.sfx.chime(), 900);
    addBanner(stageCleared ? `ステージ${st.line + 1} クリア!` : `${st.name} クリア!`, `+${fmtDist(earned)} ／ バスター手当 +${yen(earned)}`, 3.1);
    const nextLabel = stageCleared ? `ステージ${nextSt.line + 1}へ（${LINES[nextSt.line].name}）` : `次のエリアへ（${nextSt.name}）`;
    sceneTimer = setTimeout(() => {
      startWipe(() => {
        mode = 'idle';
        clearFx();
        openShop(() => startWipe(() => beginStage(index + 1, true)), nextLabel, index + 1);
      });
    }, 3300);
  }

  function onGameOver() {
    mode = 'over';
    restPose = 'down';
    leavePlayUi();
    bank();
    Sound.stopBgm();
    Sound.sfx.over();
    act = null;
    addBanner('体幹が尽きました', gameMode === 'endless' ? `ぶっとばし距離 ${fmtDist(run.distance)}` : `${run.stage.name}で力尽きました`, 1.8);
    sceneTimer = setTimeout(() => showResult(false), 2000);
  }

  // ---- 1 コマの更新 ----
  function step(dt) {
    // 止めている間はゲーム内の時計を進めない。飛んでいるおじさんも文字も、そのまま待たせる。
    if (paused) {
      if (resumeLeft > 0) {
        resumeLeft -= dt;
        if (resumeLeft <= 0) {
          resumeLeft = 0;
          paused = false;
          Sound.resume();
          stageEl.classList.add('playing');
          $('pauseBtn').hidden = false;
        }
      }
      return;
    }
    rt += dt;
    if (impact && rt >= impact.until) impact = null;
    // ヒットストップの間は動きを止める（音楽だけは続ける）
    if (!impact) {
      if (mode === 'play') {
        moveByKeys(dt);
        botTick();
      } else if (mode === 'demo') {
        demoTick();
      }
      if (mode === 'play' || mode === 'demo' || mode === 'clear' || mode === 'ending') {
        for (const ev of run.update(dt)) handle(ev);
      }
    }
    Sound.tickBgm();
    updateFx(impact ? 0 : dt);
    if (wipe && !wipe.fired && rt - wipe.t0 >= wipe.dur / 2) {
      wipe.fired = true;
      wipe.onMid();
    }
    if (wipe && rt - wipe.t0 >= wipe.dur) wipe = null;
  }

  function moveByKeys(dt) {
    if (!keys.size) return;
    let dx = 0;
    let dz = 0;
    for (const k of keys) {
      dx += MOVE_KEYS[k][0];
      dz += MOVE_KEYS[k][1];
    }
    if (!dx && !dz) return;
    const a = run.avatar;
    const len = Math.hypot(dx, dz);
    // キーボードはマウスほど速く動かせないと操作しにくいので、移動の上限の 2 割弱で動かす
    const sp = run.moveCap * 0.17 * dt;
    run.setTarget(a.x + (dx / len) * sp, a.z + ((dz / len) * sp) / SQUASH);
  }

  function botTick() {
    if (!BOT) return;
    const gap = run.bestGap();
    if (BOT === 'just' && gap <= run.zone.just * 0.7) press();
    else if (BOT === 'parry' && gap <= run.zone.parry * 0.95 && gap > run.zone.just) press();
    else if (BOT === 'mash' && rt - lastMash > 0.06) {
      lastMash = rt;
      press();
    }
  }

  function demoTick() {
    if (rt >= demoNext) {
      const b = run.bounds;
      const z0 = b.z0 || 0;
      run.setTarget(b.x0 + 60 + Math.random() * Math.max(b.x1 - b.x0 - 120, 1), z0 + 30 + Math.random() * Math.max(b.d - z0 - 60, 1));
      demoNext = rt + 1.6 + Math.random() * 1.6;
    }
    if (run.bestGap() <= run.zone.just * 0.7) press();
  }

  function updateFx(dt) {
    // dt が 0 のときはヒットストップ中。揺れは止めず、動くものだけ止める。
    const fxDt = dt || 1 / 60;
    shake *= Math.pow(0.0009, fxDt);
    if (shake < 0.2) shake = 0;
    if (dt > 0) {
      zoom = 1 + (zoom - 1) * Math.pow(0.0004, dt);
      const kick = Math.pow(0.00002, dt);
      kickX *= kick;
      kickY *= kick;
      // 案内板はばねのように揺れて戻る
      signVel += (-signAngle * 70 - signVel * 3.2) * dt;
      signAngle = Math.max(Math.min(signAngle + signVel * dt * 0.16, 0.14), -0.14);

      for (const f of flyers.slice()) {
        stepFlyer(f, dt);
        if (run) bowl(f);
      }
      flyers = flyers.filter((f) => !f.done);

      for (const p of particles) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.kind === 'puff' ? -60 : 900) * dt;
        p.vx *= Math.pow(0.2, dt);
        p.rot += p.vr * dt;
        // 床に落ちた紙や落とし物は、そのまま残す
        if (p.landY !== null && p.vy > 0 && p.y >= p.landY) {
          if (decal) Art.particle(decal[1], palette, { ...p, y: p.landY });
          noteDecal();
          p.age = p.life;
        }
      }
      particles = particles.filter((p) => p.age < p.life);
    }
    pops = pops.filter((p) => rt - p.t0 < p.dur);
    bursts = bursts.filter((b) => rt - b.t0 < b.dur);
    rings = rings.filter((r) => rt - r.t0 < r.dur);
    cracks = cracks.filter((k) => rt - k.t0 < k.dur);
    twinkles = twinkles.filter((t) => rt - t.t0 < t.dur);
    banners = banners.filter((b) => rt - b.t0 < b.dur);
    toasts = toasts.filter((t) => rt - t.t0 < t.dur);
    if (run) {
      // 目標との距離ではなく、実際に動いたかどうかで走る姿にする
      if ((run.avatar.moved || 0) > 1.2) moveHold = rt + 0.09;
      moving = rt < moveHold ? 1 : 0;
      shownDist += (run.distance - shownDist) * Math.min(fxDt * 12, 1);
      if (run.distance - shownDist < 0.5) shownDist = run.distance;
    }
  }

  // ---- 描画 ----
  function render() {
    const { scale, dpr } = view;
    c.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const P = palette;
    const neg = impact && impact.neg && !paused;

    c.save();
    c.translate(kickX, kickY);
    if (shake > 0 && !paused) c.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    if (zoom > 1.001) {
      c.translate(zoomX, zoomY);
      c.scale(zoom, zoom);
      c.translate(-zoomX, -zoomY);
    }
    if (neg) drawImpactFrame();
    else drawWorld(P);
    c.restore();

    drawPops(neg ? Art.negative(P) : P);
    if (mode === 'play' || mode === 'clear' || mode === 'over' || mode === 'ending') drawHud(P);
    drawBanners(P);
    drawCountdown(P);
    if (wipe) drawWipe(P);
  }

  function drawWorld(P) {
    const { W, H, ft } = view;
    c.drawImage(bg.back, 0, 0, W, H);
    if (train) {
      const k = clamp01((rt - train.t0) / train.dur);
      const ease = 1 - (1 - k) * (1 - k) * (1 - k);
      Art.drawTrain(c, P, W + 40 - (W + 80) * ease, ft, W + 500);
    }
    c.drawImage(bg.front, 0, 0, W, H);
    c.save();
    c.translate(bg.pivot.x, bg.pivot.y);
    c.rotate(signAngle);
    c.translate(-bg.pivot.x, -bg.pivot.y);
    c.drawImage(bg.sign, 0, 0, W, H);
    c.restore();
    c.drawImage(decal[0], 0, 0, W, H);
    if (!run) return;

    drawFloorMarks(P);
    for (const r of rings) {
      const k = (rt - r.t0) / r.dur;
      if (k < 0) continue;
      const rad = r.r * (1 - (1 - k) * (1 - k));
      const w = (1 - k) * 12;
      c.beginPath();
      c.ellipse(r.x, r.y, rad, rad * SQUASH, 0, 0, Art.TAU);
      c.strokeStyle = P.ink;
      c.lineWidth = w + 3;
      c.stroke();
      c.strokeStyle = P.spot;
      c.lineWidth = w;
      c.stroke();
    }
    drawActors(P);
    for (const p of particles) Art.particle(c, P, p);
    for (const b of bursts) {
      const k = (rt - b.t0) / b.dur;
      c.globalAlpha = 1 - k * 0.5;
      Art.burst(c, P, b.x, b.y, b.r * (0.7 + k * 0.5), 11, b.rot);
      c.globalAlpha = 1;
    }
    drawFlyers(P);
    for (const k of cracks) {
      const e = (rt - k.t0) / k.dur;
      c.globalAlpha = e > 0.7 ? (1 - e) / 0.3 : 1;
      // ガラスのひびは、明るい線の上に暗い線を重ねて見やすくする
      Art.crack(c, P.paper, k.x, k.y, k.r, k.seed, 1, k.glass ? 7 : 5);
      Art.crack(c, P.ink, k.x, k.y, k.r, k.seed, 1, k.glass ? 3 : 2.4);
      c.globalAlpha = 1;
    }
    if (save.fx && rt >= lastSpeedLines && rt - lastSpeedLines < 0.2) {
      c.globalAlpha = 0.85 * (1 - (rt - lastSpeedLines) / 0.2);
      Art.speedLines(c, P.ink, zoomX, zoomY, W, H, 60, 170, Math.floor(rt * 40));
      c.globalAlpha = 1;
    }
    for (const t of twinkles) {
      const k = (rt - t.t0) / t.dur;
      const r = t.r * Math.sin(Math.min(k * 1.2, 1) * Math.PI);
      Art.star(c, P, t.x, t.y, Math.max(r, 0.1), k * 1.2);
      Art.star(c, P, t.x - t.r * 0.8, t.y + t.r * 0.5, Math.max(r * 0.4, 0.1), -k);
      Art.star(c, P, t.x + t.r * 0.9, t.y - t.r * 0.3, Math.max(r * 0.3, 0.1), k);
      if (k > 0.1) {
        c.font = `18px ${FONT.manga}`;
        const labelX = keepInside(t.x, c.measureText(t.label).width / 2 + 6);
        Art.popText(c, t.label, labelX, t.y + t.r + 14, 18, { font: FONT.manga, fill: P.ink, stroke: P.paper, alpha: 1 - k * 0.6 });
      }
    }
    if (mode === 'play' && !paused && pointer && !touchMode) drawCursor(P);
  }

  function drawFloorMarks(P) {
    if (mode === 'clear' || mode === 'ending' || mode === 'over' || mode === 'idle') return;
    const a = run.avatar;
    const ay = screenY(a.z);
    // ダッシュを始める距離の目安
    if (mode === 'play') {
      c.save();
      c.strokeStyle = P.line;
      c.lineWidth = 1.6;
      c.setLineDash([3, 10]);
      c.beginPath();
      c.ellipse(a.x, ay, TYPES.normal.trigger, TYPES.normal.trigger * SQUASH, 0, 0, Art.TAU);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
    const gap = run.bestGap();
    const locked = run.time < run.lockUntil;
    Art.zoneRing(c, P, a.x, ay, Rules.CONTACT + run.zone.parry, Rules.CONTACT + run.zone.just, SQUASH, {
      hot: gap <= run.zone.parry,
      lockK: locked ? (run.lockUntil - run.time) / run.lockLength : 0,
    });
    // 溜めているおじさんから、狙っている先への線
    for (const o of run.ojisan) {
      if (o.state !== 'tell' && o.state !== 'feintStop') continue;
      c.save();
      c.strokeStyle = P.ink;
      c.lineWidth = 2.4;
      c.setLineDash([9, 8]);
      c.lineDashOffset = -rt * 90;
      c.beginPath();
      c.moveTo(o.x, screenY(o.z));
      c.lineTo(a.x, ay);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }
  }

  function poseOf(o) {
    switch (o.state) {
      case 'tell':
        return 'windup';
      case 'reload':
        return 'taunt';
      case 'dash':
      case 'contact':
        return 'charge';
      case 'feintStop':
        return 'taunt';
      case 'stumble':
      case 'recoil':
        return 'recoil';
      default:
        return 'walk';
    }
  }

  function dirOf(o) {
    const a = run.avatar;
    if (o.state === 'dash' || o.state === 'contact' || o.state === 'stumble') return Math.sign(o.dx) || 1;
    if (o.state === 'recoil') return -Math.sign(o.dx) || 1;
    if (o.state === 'leave') return o.x < (run.bounds.x0 + run.bounds.x1) / 2 ? -1 : 1;
    return Math.sign(a.x - o.x) || 1;
  }

  function shadow(P, x, y, r) {
    c.fillStyle = P.tone;
    c.beginPath();
    c.ellipse(x, y + 2, r, r * 0.3, 0, 0, Art.TAU);
    c.fill();
  }

  function drawOjisanActor(P, o) {
    const T = TYPES[o.type];
    // 消えている間は描かない。飛び道具はおじさんの絵を使わない。
    if (o.state === 'vanish') return;
    const y = screenY(o.z);
    if (T.projectile) {
      shadow(P, o.x, y, 14);
      Art.drawShot(c, P, { kind: o.type, x: o.x, y: y - 58, roll: o.roll });
      return;
    }
    const pose = poseOf(o);
    const s = drawScaleOf(o);
    const rate = pose === 'charge' ? 3.4 : 1.5;
    const phase = Math.floor((o.age * rate + o.roll) * 8) / 8;
    const rot = T.weave ? Math.sin(o.age * 7) * 0.13 : 0;
    // 影うすおじさんは溜めに入るまでほとんど見えない
    const faint = T.stealth && o.state === 'stalk';
    if (faint) c.globalAlpha = 0.16;
    shadow(P, o.x, y, 34 * s);
    if (pose === 'charge') {
      // 走りの線
      const dir = Math.sign(o.dx) || 1;
      c.strokeStyle = P.ink;
      c.lineWidth = 2.4;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const ly = y - (24 + i * 28) * s;
        const lx = o.x - dir * (46 + (i % 2) * 18) * s;
        c.moveTo(lx, ly);
        c.lineTo(lx - dir * (30 + (i % 3) * 16), ly);
      }
      c.stroke();
    }
    Art.drawOjisan(c, P, { x: o.x, y, dir: dirOf(o), s, type: o.type, pose, phase, rot });
    c.globalAlpha = 1;
    const headY = y - 200 * s;
    // 大きなボスが床の奥にいても、溜めの合図と残りの回数が画面の外へ出ないようにする
    const markY = Math.max(headY, 58);
    if (o.state === 'tell') {
      const k = clamp01((T.tell - o.left) / 0.12);
      Art.popText(c, '!', o.x, markY, 40, { font: FONT.display, fill: P.ink, stroke: P.spot, scale: 0.5 + 0.6 * k });
    }
    if (o.say && !faint && o.state === 'stalk' && o.age > 0.7 && o.age < 2.6 && run.inside(o)) {
      const entry = DEX.find((e) => e.type === o.type);
      Art.bubble(c, P, o.x, headY + 8, entry.phrase, dirOf(o) < 0, view.W);
    }
    if (o.hits > 1) {
      const n = o.hits;
      const w = Math.min(10, 110 / n);
      const barW = n * (w + 2);
      const x0 = keepInside(o.x, barW / 2 + 4) - barW / 2;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i < o.hitsLeft ? P.spot : P.deep;
        c.strokeStyle = P.ink;
        c.lineWidth = 2;
        c.fillRect(x0 + i * (w + 2), markY - 16, w, 9);
        c.strokeRect(x0 + i * (w + 2), markY - 16, w, 9);
      }
      if (T.boss) {
        c.font = `21px ${FONT.display}`;
        const nameX = keepInside(o.x, c.measureText(T.name).width / 2 + 8);
        Art.popText(c, T.name, nameX, markY - 32, 21, { font: FONT.display, fill: P.ink, stroke: P.paper });
      }
    }
  }

  function playerState() {
    const a = run.avatar;
    let pose = moving ? 'run' : 'idle';
    let ox = 0;
    let dir = a.dirX;
    const nearest = run.ojisan.find((o) => o.state === 'dash' || o.state === 'tell');
    if (nearest && !moving) dir = Math.sign(nearest.x - a.x) || dir;
    if (restPose === 'down') return { pose: 'down', ox: 0, dir };
    if (mode === 'clear' || restPose === 'win') pose = 'win';
    if (act) {
      const e = rt - act.t;
      if (e < act.dur) {
        dir = act.dir;
        if (act.type === 'tackle') {
          pose = 'tackle';
          ox = act.dir * (act.reach || 34) * (e < 0.05 ? e / 0.05 : 1 - (e - 0.05) / (act.dur - 0.05));
        } else if (act.type === 'whiff') {
          pose = 'whiff';
          ox = act.dir * 20;
        } else if (act.type === 'hurt') {
          pose = 'hurt';
          ox = -act.dir * 18 * (1 - e / act.dur);
        }
      }
    }
    return { pose, ox, dir };
  }

  function drawPlayerActor(P) {
    const a = run.avatar;
    const st = playerState();
    const y = screenY(a.z);
    const s = BASE_S * depthScale(a.z);
    shadow(P, a.x, y, 28 * s);
    if (a.invuln > 0 && mode === 'play' && Math.floor(rt * 14) % 2 === 0) return;
    if (st.pose === 'tackle') {
      c.strokeStyle = P.ink;
      c.lineWidth = 2.4;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const ly = y - (28 + i * 26) * s;
        const lx = a.x + st.ox - st.dir * 44 * s;
        c.moveTo(lx, ly);
        c.lineTo(lx - st.dir * 34, ly);
      }
      c.stroke();
      // 踏み込みの残像
      for (const [t, alpha] of [[0.35, 0.25], [0.65, 0.4]]) {
        c.globalAlpha = alpha;
        Art.drawPlayer(c, ghostP, { x: a.x + st.ox * t, y, dir: st.dir, s, pose: 'tackle', time: rt, mass: run.up.kata });
      }
      c.globalAlpha = 1;
    }
    Art.drawPlayer(c, P, {
      x: a.x + st.ox, y, dir: st.dir, s, pose: st.pose,
      phase: Math.floor(rt * (st.pose === 'run' ? 3.2 : 0.8) * 8) / 8,
      time: rt, mass: run.up.kata,
    });
  }

  function drawActors(P) {
    const list = run.ojisan.map((o) => ({ y: o.z, o }));
    list.push({ y: run.avatar.z, player: true });
    list.sort((p, q) => p.y - q.y);
    for (const it of list) {
      if (it.player) drawPlayerActor(P);
      else drawOjisanActor(P, it.o);
    }
  }

  function drawFlyers(P) {
    for (const f of flyers) {
      const k = clamp01(f.age / f.life);
      const s = f.scale;
      const dir = -(Math.sign(f.dx) || 1);
      const my = f.y - 70 * s;
      const speed = Math.hypot(f.vx, f.vy);
      if (f.age > 0 && speed > 80) {
        // 飛んだ跡の線。速いほど長い。
        const len = Math.min(speed * 0.07, 260);
        const ux = f.vx / speed;
        const uy = f.vy / speed;
        c.strokeStyle = P.ink;
        c.lineWidth = 2 + 3 * (1 - k);
        c.beginPath();
        for (let i = -2; i <= 2; i++) {
          const ox = -uy * i * 22 * s;
          const oy = ux * i * 22 * s;
          const l = len * (1 - Math.abs(i) * 0.18);
          c.moveTo(f.x + ox, my + oy);
          c.lineTo(f.x + ox - ux * l, my + oy - uy * l);
        }
        c.stroke();
      }
      f.ghosts.forEach((g, i) => {
        if (i % 2 || f.age > 0.3) return;
        c.globalAlpha = 0.14 + i * 0.05;
        Art.drawOjisan(c, ghostP, { x: g.x, y: g.y, dir, s: g.scale, type: f.type, pose: 'fly', phase: f.phase, rot: g.rot, face: 'ko' });
      });
      c.globalAlpha = 1;
      c.save();
      // 飛び出した瞬間だけ、進む向きに引き伸ばす
      if (f.stretch > 0.02 && speed > 1) {
        const ang = Math.atan2(f.vy, f.vx);
        c.translate(f.x, my);
        c.rotate(ang);
        c.scale(1 + f.stretch, 1 - f.stretch * 0.45);
        c.rotate(-ang);
        c.translate(-f.x, -my);
      }
      Art.drawOjisan(c, P, { x: f.x, y: f.y, dir, s, type: f.type, pose: 'fly', phase: f.phase + f.age * 3, rot: f.rot, face: 'ko' });
      c.restore();
      if (f.age > 0.03 && k < 0.8 && f.style !== 'screen') {
        Art.popText(c, f.cry, f.x, f.y - 124 * s - 12, Math.max(15, 26 * (1 - k * 0.5)), { font: FONT.manga, fill: P.ink, stroke: P.paper });
      }
    }
  }

  function drawImpactFrame() {
    const { W, H } = view;
    // 前半は白黒反転、後半は点字ブロックの黄色一色にして、解放の瞬間へつなぐ
    const k = (rt - impact.t0) / (impact.until - impact.t0);
    const first = k < 0.55;
    const P = first ? Art.negative(palette) : Art.PALETTES[0];
    c.fillStyle = first ? P.paper : P.spot;
    c.fillRect(-60, -60, W + 120, H + 120);
    Art.speedLines(c, P.ink, impact.x, impact.y, W, H, 72, 110, Math.floor(rt * 60));
    Art.burst(c, first ? P : { ...P, spot: '#ffffff' }, impact.x, impact.y, 130, 12, rt * 3);
    const o = impact.o;
    const a = run.avatar;
    const y = screenY(a.z);
    // おじさんは当たった向きにつぶれる
    c.save();
    c.translate(o.x, o.drawY);
    c.scale(0.76, 1.14);
    c.translate(-o.x, -o.drawY);
    Art.drawOjisan(c, P, { x: o.x, y: o.drawY, dir: -Math.sign(o.dx) || 1, s: drawScaleOf(o), type: o.type, pose: 'recoil', phase: 0, face: 'shock' });
    c.restore();
    Art.drawPlayer(c, P, { x: a.x + impact.dirX * 50, y, dir: impact.dirX, s: BASE_S * depthScale(a.z), pose: 'tackle', time: rt, mass: run.up.kata });
  }

  function drawCursor(P) {
    const a = run.avatar;
    const x = a.tx;
    const y = screenY(a.tz);
    if (Math.hypot(a.tx - a.x, a.tz - a.z) < 18) return;
    c.strokeStyle = P.ink;
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(x - 9, y);
    c.lineTo(x + 9, y);
    c.moveTo(x, y - 7);
    c.lineTo(x, y + 7);
    c.stroke();
  }

  function drawPops(P) {
    for (const p of pops) {
      const k = (rt - p.t0) / p.dur;
      const inK = clamp01(k / 0.12);
      const scale = p.from - (p.from - 1) * (1 - (1 - inK) * (1 - inK));
      Art.popText(c, p.txt, p.x, p.y + p.vy * k, p.size, {
        font: p.font || FONT.manga,
        rot: p.rot, scale,
        alpha: k > 0.7 ? (1 - k) / 0.3 : 1,
        fill: p.fill || P.ink,
        stroke: p.stroke || P.paper,
      });
    }
  }

  function drawHud(P) {
    const { W, ft } = view;
    const safeR = 62 / view.scale; // 一時停止ボタン（CSS px で固定）の幅を空ける
    if (usesThumbPad()) {
      const y = padTop();
      c.save();
      c.globalAlpha = 0.9;
      c.fillStyle = P.paper;
      c.fillRect(0, y, W, view.H - y);
      c.restore();
      Art.line(c, 0, y, W, y, 3, P.ink);
      Art.popText(c, 'なぞって動く ／ タップで体当たり', W / 2, y + (view.H - y) * 0.42, 18, { font: FONT.ui, fill: P.ink, stroke: P.paper, lw: 4 });
    }
    // 背景がにぎやかな場所でも読めるよう、距離と体幹の下に紙を敷く
    const showBest = gameMode === 'endless' && save.endlessBest > 0;
    c.save();
    c.font = `30px ${FONT.display}`;
    let plateW = c.measureText(fmtDist(Math.round(shownDist))).width;
    if (showBest) {
      c.font = `700 14px ${FONT.ui}`;
      plateW = Math.max(plateW, c.measureText(`自己ベスト ${fmtDist(save.endlessBest)}`).width);
    }
    c.globalAlpha = 0.86;
    c.fillStyle = P.paper;
    Art.rrect(c, 4, 4, Math.max(plateW, 118) + 24, showBest ? 86 : 66, 8);
    c.fill();
    Art.rrect(c, W - safeR - run.hpMax * 26 - 8, 6, run.hpMax * 26 + 12, 54, 8);
    c.fill();
    c.restore();
    Art.popText(c, 'ぶっとばし距離', 14, 22, 15, { font: FONT.ui, fill: P.ink, stroke: P.paper, align: 'left', lw: 4 });
    const distK = clamp01((rt - distPop) / 0.22);
    Art.popText(c, fmtDist(Math.round(shownDist)), 14, 50, 30, { font: FONT.display, fill: P.ink, stroke: distK < 1 ? P.spot : P.paper, align: 'left', lw: 6, scale: 1.28 - 0.28 * distK });
    if (showBest) {
      Art.popText(c, `自己ベスト ${fmtDist(save.endlessBest)}`, 14, 78, 14, { font: FONT.ui, fill: P.ink, stroke: P.paper, align: 'left', lw: 4 });
    }

    // 体幹
    const pipW = 22;
    const pipGap = 4;
    const n = run.hpMax;
    const hpShake = rt - hpPop < 0.35 ? Math.sin(rt * 60) * 3 : 0;
    const x0 = W - safeR - n * (pipW + pipGap) + hpShake;
    Art.popText(c, '体幹', W - safeR - 2, 22, 15, { font: FONT.ui, fill: P.ink, stroke: P.paper, align: 'right', lw: 4 });
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (pipW + pipGap);
      c.fillStyle = i < run.hp ? P.spot : P.deep;
      c.strokeStyle = P.ink;
      c.lineWidth = 3;
      Art.rrect(c, x, 36, pipW, 18, 5);
      c.fill();
      c.stroke();
    }

    // 残りの人数
    const signBottom = Math.max(0, ft - 190) + 134 + 8;
    const inField = run.phase === 'field' || run.phase === 'intro';
    const bossTime = run.phase === 'bossCall' || run.phase === 'boss';
    let label = '';
    if (gameMode === 'endless') label = bossTime ? `レベル ${run.level} ボス` : `レベル ${run.level}  次まで ${run.toNextLevel}人`;
    else if (inField) label = `あと ${run.remaining}人`;
    else if (bossTime) label = 'ボス';
    if (label && mode === 'play') {
      Art.popText(c, label, W / 2, signBottom + 12, 22, { font: FONT.display, fill: P.ink, stroke: P.paper, lw: 6 });
    }

    // コンボ
    if (run.combo >= 2) {
      const k = clamp01((rt - comboPop) / 0.14);
      const sc = 1.35 - 0.35 * k;
      Art.popText(c, `${run.combo}`, W - 18, 92, 42, { font: FONT.display, fill: P.ink, stroke: P.spot, align: 'right', scale: sc, lw: 8 });
      Art.popText(c, `コンボ 距離×${Rules.comboMult(run.combo).toFixed(1)}`, W - 18, 124, 15, { font: FONT.ui, fill: P.ink, stroke: P.paper, align: 'right', lw: 4 });
      const rank = Rules.comboRankIndex(run.combo);
      if (rank > 0) Art.popText(c, Rules.COMBO_RANKS[rank].name, W - 18, 148, 21, { font: FONT.display, fill: P.ink, stroke: P.spot, align: 'right', lw: 6 });
    }

    // 最初のエリアだけの操作説明
    if (mode === 'play' && run.stageIndex === 0 && run.stats.flown < 3) {
      const hint = touchMode ? 'おじさんが輪に入った瞬間にタップ' : 'マウスで動く ／ おじさんが輪に入った瞬間にクリック';
      const size = Art.fitFont(c, hint, FONT.ui, 19, W - 30);
      Art.popText(c, hint, W / 2, view.H - 30, size, { font: FONT.ui, fill: P.ink, stroke: P.floor, lw: 5 });
    }

    // 一度に何種類も出たときは、新しい 2 つだけ見せて画面をふさがない
    toasts.slice(-2).forEach((t, i) => {
      const k = (rt - t.t0) / t.dur;
      const y = signBottom + 44 + i * 28;
      const size = Art.fitFont(c, t.txt, FONT.ui, 17, W - 30);
      Art.popText(c, t.txt, W / 2, y, size, { font: FONT.ui, fill: P.ink, stroke: P.spot, lw: 6, alpha: k > 0.8 ? (1 - k) / 0.2 : 1 });
    });
  }

  function drawBanners(P) {
    for (const b of banners) {
      const e = rt - b.t0;
      const io = 0.28;
      let k;
      if (e < io) k = e / io;
      else if (e > b.dur - io) k = 1 + (e - (b.dur - io)) / io;
      else k = 1;
      // アバターの開始位置にかからないよう、画面の下に出す
      const y = Math.round(view.H - (b.sub ? 96 : 68) - 18);
      Art.banner(c, P, view.W, y, b.main, b.sub, Math.min(k, 1.999));
    }
  }

  function drawCountdown(P) {
    if (!(paused && resumeLeft > 0)) return;
    const n = Math.ceil(resumeLeft / 0.4);
    Art.popText(c, `${Math.max(n, 1)}`, view.W / 2, view.H / 2, 90, { font: FONT.display, fill: P.ink, stroke: P.spot, lw: 14 });
  }

  function drawWipe(P) {
    const { W, H } = view;
    const k = clamp01((rt - wipe.t0) / wipe.dur);
    const a = Math.min(k * 2, 1);
    const b = Math.max(k * 2 - 1, 0);
    const ease = (t) => t * t * (3 - 2 * t);
    const sl = H * 0.35;
    const x1 = -sl + (W + sl * 2) * ease(a);
    const x0 = -sl + (W + sl * 2) * ease(b);
    c.fillStyle = P.ink;
    c.beginPath();
    c.moveTo(x0 + sl, 0);
    c.lineTo(x1 + sl, 0);
    c.lineTo(x1 - sl, H);
    c.lineTo(x0 - sl, H);
    c.closePath();
    c.fill();
  }

  // ---- タイトル ----
  function syncToggles() {
    for (const id of ['soundBtn', 'soundBtn2']) {
      $(id).textContent = `音 ${save.sound ? 'ON' : 'OFF'}`;
      $(id).setAttribute('aria-pressed', String(save.sound));
    }
    for (const id of ['fxBtn', 'fxBtn2']) {
      $(id).textContent = `激しい演出 ${save.fx ? 'ON' : 'OFF'}`;
      $(id).setAttribute('aria-pressed', String(save.fx));
    }
    Sound.setMuted(!save.sound);
  }

  function stationButton(text, locked, selected, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'station';
    b.textContent = locked ? '？？' : text;
    b.disabled = locked;
    b.setAttribute('aria-pressed', String(selected));
    b.addEventListener('click', onClick);
    return b;
  }

  function renderTitle() {
    const box = $('stations');
    box.textContent = '';
    const line = STAGES[selectedStage].line;
    // 選び直すとボタンが作り直されるので、選んだボタンへフォーカスを戻す
    const choose = (i, row) => () => {
      selectedStage = i;
      renderTitle();
      applyBounds();
      if (!coarse) box.querySelector(`.${row} [aria-pressed="true"]`).focus({ preventScroll: true });
    };
    const stageRow = document.createElement('div');
    stageRow.className = 'station-row stages';
    LINES.forEach((l, li) => {
      const first = STAGES.findIndex((st) => st.line === li);
      stageRow.appendChild(stationButton(`${li + 1} ${l.short}`, first > save.reached, li === line, choose(first, 'stages')));
    });
    const areaRow = document.createElement('div');
    areaRow.className = 'station-row areas';
    STAGES.forEach((st, i) => {
      if (st.line !== line) return;
      areaRow.appendChild(stationButton(st.name, i > save.reached, i === selectedStage, choose(i, 'areas')));
    });
    box.append(stageRow, areaRow);
    const bests = [];
    if (save.best > 0) bests.push(`通常 ${fmtDist(save.best)}`);
    if (save.endlessBest > 0) bests.push(`エンドレス ${fmtDist(save.endlessBest)}`);
    $('bestLabel').textContent = bests.length ? `自己ベスト ${bests.join(' ／ ')}` : '';
    syncToggles();
  }

  // ---- 強化 ----
  function openShop(after, doneLabel, nextStage) {
    shopAfter = { after, doneLabel, nextStage };
    setStageLook(Math.min(nextStage, STAGES.length - 1));
    renderShop();
    showOverlay('shop');
    if (!coarse) $('shopDone').focus({ preventScroll: true });
  }

  function renderShop() {
    const next = shopAfter.nextStage;
    const st = STAGES[next];
    const base = Rules.zonesFor(next, Rules.emptyUpgrades(), touchMode);
    const z = Rules.zonesFor(next, save.up, touchMode);
    $('wallet').textContent = yen(save.yen);
    $('shopDone').textContent = shopAfter.doneLabel;
    const caption = $('shopNext');
    caption.textContent = '';
    const lines = [
      [`${st.name}のぶっとばし範囲 `, z.parry, `（基準 ${base.parry}）`],
      ['ジャストの範囲 ', z.just, `（基準 ${base.just}）`],
      ['受けられる回数 ', Rules.maxHp(save.up), ' 回（エンドレスは3回で固定）'],
    ];
    for (const [before, value, after] of lines) {
      const row = document.createElement('div');
      const strong = document.createElement('b');
      strong.textContent = value;
      row.append(before, strong, after);
      caption.appendChild(row);
    }
    const list = $('shopList');
    list.textContent = '';
    for (const u of UPGRADES) {
      const lv = save.up[u.id] || 0;
      const cost = Rules.upgradeCost(u.id, lv);
      const li = document.createElement('li');
      li.className = 'shop-item';
      const name = document.createElement('p');
      name.className = 'shop-name';
      name.textContent = u.name;
      const pips = document.createElement('span');
      pips.className = 'lv';
      pips.setAttribute('role', 'img');
      pips.setAttribute('aria-label', `レベル ${lv} / ${u.max}`);
      for (let i = 0; i < u.max; i++) {
        const dot = document.createElement('i');
        if (i < lv) dot.className = 'on';
        pips.appendChild(dot);
      }
      name.appendChild(pips);
      const desc = document.createElement('p');
      desc.className = 'shop-desc';
      desc.textContent = u.desc;
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'shop-buy';
      buy.id = `buy-${u.id}`;
      if (cost === null) {
        buy.textContent = '最大';
        buy.disabled = true;
      } else {
        buy.textContent = yen(cost);
        buy.disabled = save.yen < cost;
        buy.setAttribute('aria-label', `${u.name}を${yen(cost)}で鍛える`);
        buy.addEventListener('click', () => {
          Sound.unlock();
          // 買った直後は同じ場所に次のボタンが出るので、ダブルクリックで二度買わないようにする
          const now = performance.now();
          if (save.yen < cost || now - lastBuyAt < 350) return;
          lastBuyAt = now;
          save.yen -= cost;
          save.up[u.id] = lv + 1;
          writeSave();
          Sound.sfx.coin();
          renderShop();
          const again = $(`buy-${u.id}`);
          if (again && !again.disabled) again.focus({ preventScroll: true });
          else $('shopDone').focus({ preventScroll: true });
        });
      }
      li.append(name, desc, buy);
      list.appendChild(li);
    }
    drawShopPreview(next);
  }

  function drawShopPreview(stageIndex) {
    const cv = $('shopPreview');
    const x = cv.getContext('2d');
    const P = palette;
    const W = cv.width;
    const H = cv.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = P.floor;
    x.fillRect(0, 0, W, H);
    x.strokeStyle = P.tone;
    x.lineWidth = 2;
    x.beginPath();
    for (let i = 0; i < 9; i++) {
      x.moveTo(i * 80, 0);
      x.lineTo(i * 80 - 60 + (i - 4) * 18, H);
    }
    for (let i = 1; i < 6; i++) {
      x.moveTo(0, i * i * 16);
      x.lineTo(W, i * i * 16);
    }
    x.stroke();
    const cx = W / 2;
    const cy = H * 0.72;
    const base = Rules.zonesFor(stageIndex, Rules.emptyUpgrades(), touchMode);
    const z = Rules.zonesFor(stageIndex, save.up, touchMode);
    // 輪が枠からはみ出さない大きさにする
    const R = Rules.CONTACT + z.parry;
    const k = Math.min(1.55, (H - cy - 8) / (R * SQUASH), (W / 2 - 8) / R);
    Art.zoneRing(x, P, cx, cy, (Rules.CONTACT + z.parry) * k, (Rules.CONTACT + z.just) * k, SQUASH, {});
    // 基準の広さを点線で重ねる
    x.save();
    x.strokeStyle = P.ink;
    x.lineWidth = 2;
    x.setLineDash([6, 8]);
    x.beginPath();
    x.ellipse(cx, cy, (Rules.CONTACT + base.parry) * k, (Rules.CONTACT + base.parry) * k * SQUASH, 0, 0, Art.TAU);
    x.stroke();
    x.setLineDash([]);
    x.restore();
    Art.drawPlayer(x, P, { x: cx, y: cy, dir: 1, s: 1.5, pose: 'idle', phase: 0.1, time: 0.4, mass: save.up.kata });
  }

  // ---- 図鑑 ----
  const ZUKAN_SCALE = { umbrella: 0.8, bike: 0.9 };

  function openZukan(back) {
    zukanBack = back;
    const grid = $('zukanGrid');
    grid.textContent = '';
    let seenCount = 0;
    DEX.forEach((e, i) => {
      const d = save.dex[e.type];
      const seen = d && d.seen > 0;
      if (seen) seenCount++;
      const card = document.createElement('article');
      card.className = `card${seen ? '' : ' locked'}`;
      const cv = document.createElement('canvas');
      cv.width = 184;
      cv.height = 220;
      cv.setAttribute('aria-hidden', 'true');
      const no = document.createElement('p');
      no.className = 'card-no';
      no.textContent = `No.${String(i + 1).padStart(2, '0')} ／ ${seen ? e.habitat : '？？？'}`;
      const name = document.createElement('h3');
      name.textContent = seen ? TYPES[e.type].name : '？？？';
      const phrase = document.createElement('p');
      phrase.className = 'card-phrase';
      phrase.textContent = seen ? `「${e.phrase}」` : '「……」';
      const note = document.createElement('p');
      note.className = 'card-note';
      note.textContent = seen ? e.note : 'まだ出会っていない。どこかのステージにいる。';
      const stats = document.createElement('p');
      stats.className = 'card-stats';
      stats.textContent = seen ? `遭遇 ${d.seen}回 ／ ぶっとばし ${d.flown}回 ／ 最長 ${fmtDist(d.best)}` : '遭遇 0回';
      card.append(cv, no, name, phrase, note, stats);
      grid.appendChild(card);
      const x = cv.getContext('2d');
      x.fillStyle = '#dfe6ea';
      x.fillRect(0, 0, cv.width, cv.height);
      const base = Art.PALETTES[0];
      const P = seen ? base : Art.silhouette({ ...base, ink: '#59627e' });
      // 大きいものはカードに収まるよう少し小さく描く
      const s = ZUKAN_SCALE[e.type] || (TYPES[e.type].boss ? 0.84 : 0.98);
      Art.drawOjisan(x, P, { x: 84, y: 208, dir: 1, s, type: e.type, pose: 'walk', phase: 0.1, face: 'angry' });
    });
    $('zukanCount').textContent = `${seenCount} / ${DEX.length} 種`;
    showOverlay('zukan');
    $('zukan').scrollTop = 0;
    if (!coarse) $('zukanClose').focus({ preventScroll: true });
  }

  // ---- 遊び方 ----
  function renderGuide() {
    for (const [id, device] of [['guideTabPc', 'pc'], ['guideTabSp', 'sp']]) {
      $(id).setAttribute('aria-selected', String(guideDevice === device));
    }
    Guide.render($('guideBody'), guideDevice);
  }

  let guideFontsReady = false;

  function openGuide(back) {
    guideBack = back;
    renderGuide();
    showOverlay('guide');
    $('guide').scrollTop = 0;
    if (!coarse) $('guideClose').focus({ preventScroll: true });
    if (guideFontsReady) return;
    // 初めて開いたときは、書体を読み込んでから描き直す
    Guide.preload().then(() => {
      guideFontsReady = true;
      if (!$('guide').hidden) renderGuide();
    });
  }

  // ---- ランキング ----
  function rankRow({ no, name, distance, meta, me }) {
    const li = document.createElement('li');
    li.className = `rank-row${me ? ' me' : ''}`;
    if (me) li.setAttribute('aria-current', 'true');
    for (const [cls, txt] of [['rank-no', `${no}位`], ['rank-name', name], ['rank-dist', fmtDist(distance)], ['rank-meta', meta]]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = txt; // 名前は他の人の入力なので、必ず文字として入れる
      li.appendChild(span);
    }
    return li;
  }

  const entryMeta = (e) => `レベル ${e.level} ／ ${e.flown}人 ／ 最大 ${e.maxCombo}コンボ`;

  async function renderRanking() {
    const seq = ++rankingSeq;
    const list = $('rankingList');
    const status = $('rankingStatus');
    $('rankTabOnline').setAttribute('aria-selected', String(rankingTab === 'online'));
    $('rankTabLocal').setAttribute('aria-selected', String(rankingTab === 'local'));
    list.textContent = '';
    $('nameForm').hidden = true;
    if (rankingTab === 'local') {
      save.endlessLocal.forEach((e, i) => {
        const date = new Date(e.at).toLocaleDateString('ja-JP');
        list.appendChild(rankRow({ no: i + 1, name: date, distance: e.distance, meta: entryMeta(e), me: false }));
      });
      status.textContent = save.endlessLocal.length
        ? 'この端末で出した記録の上位10件です。'
        : 'まだ記録がありません。エンドレスモードで遊ぶとここに残ります。';
      return;
    }
    status.textContent = '読み込んでいます…';
    const data = await Ranking.top(playerToken());
    if (seq !== rankingSeq) return;
    if (!data) {
      status.textContent = 'オンラインのランキングに接続できません。「この端末」タブで自分の記録を見られます。';
      return;
    }
    const row = (e) => rankRow({ no: e.rank, name: e.name, distance: e.distance, meta: entryMeta(e), me: e.isMe });
    data.entries.forEach((e) => list.appendChild(row(e)));
    if (data.me && !data.entries.some((e) => e.isMe)) {
      const gap = document.createElement('li');
      gap.className = 'rank-gap';
      gap.setAttribute('aria-hidden', 'true');
      gap.textContent = '︙';
      list.append(gap, row(data.me));
    }
    status.textContent = data.total ? `${data.total}人が参加しています。上位${data.entries.length}人を表示しています。` : 'まだ誰も記録していません。最初の記録を作りましょう。';
    if (data.me) {
      $('nameForm').hidden = false;
      $('nameInput').value = data.me.name;
    }
  }

  function openRanking(back) {
    rankingBack = back;
    rankingTab = 'online';
    showOverlay('ranking');
    $('ranking').scrollTop = 0;
    if (!coarse) $('rankingClose').focus({ preventScroll: true });
    renderRanking();
  }

  function setResultStatus(text) {
    $('resultStatus').hidden = !text;
    $('resultStatus').textContent = text;
  }

  // 記録をランキングへ送る。名前がまだなら入力してもらう。
  async function submitEndless() {
    const score = pendingScore;
    if (!score) return;
    const form = $('resultForm');
    const runId = await score.runPromise;
    if (score !== pendingScore) return;
    if (!runId) {
      setResultStatus('オンラインのランキングに接続できないため、この端末にだけ記録しました。');
      form.hidden = true;
      return;
    }
    const askName = (message) => {
      setResultStatus(message);
      $('resultName').value = save.nickname;
      form.hidden = false;
      if (!coarse) $('resultName').focus({ preventScroll: true });
    };
    if (!save.nickname) {
      askName('名前を入れると、ランキングに載ります。');
      return;
    }
    form.hidden = true;
    setResultStatus('ランキングに送っています…');
    const res = await Ranking.submit({
      token: playerToken(), runId, name: save.nickname,
      distance: score.distance, flown: score.flown, level: score.level, maxCombo: score.maxCombo,
    });
    if (score !== pendingScore) return;
    // 名前の問題や混み合いでは記録を失わない。入れ直して送り直せる。
    if (res.error === 'bad_name' || res.error === 'name_taken') {
      const message = res.error === 'name_taken' ? 'この名前は別の人が使っています。' : NAME_RULE;
      save.nickname = '';
      askName(message);
      return;
    }
    if (res.retryable) {
      askName(res.offline
        ? '送信できませんでした。通信状態を確かめて、もう一度「登録する」を押してください。'
        : '混み合っています。少し待ってから、もう一度「登録する」を押してください。');
      return;
    }
    if (res.error === 'unknown_run') {
      // 前の送信がサーバーに届いていて、返事だけ受け取れなかった場合はここに来る
      const latest = await Ranking.top(playerToken(), 1);
      if (score !== pendingScore) return;
      pendingScore = null;
      setResultStatus(latest && latest.me && latest.me.distance >= score.distance
        ? `ランキング ${latest.me.rank}位 に登録しました。`
        : 'この記録はランキングに登録できませんでした。この端末の記録には残っています。');
      return;
    }
    pendingScore = null;
    if (res.error) {
      setResultStatus(res.error === 'too_many_players'
        ? '今日は新しく登録できる人数の上限に達しました。この端末の記録には残っています。'
        : 'この記録はランキングに登録できませんでした。この端末の記録には残っています。');
      return;
    }
    setResultStatus(res.improved
      ? `ランキング ${res.me.rank}位 に登録しました。`
      : `自己ベストは更新していません。ランキングは ${res.me.rank}位 のままです。`);
  }

  // リザルトから別の画面へ行って戻ったとき、残高などを今の値に直す
  function backToResult() {
    if (renderResultRows) renderResultRows();
    if (bgStage !== resultLook) setStageLook(resultLook);
    showOverlay('result');
  }

  function fillRows(rows) {
    const dl = $('resultRows');
    dl.textContent = '';
    for (const [k, v] of rows) {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      wrap.append(dt, dd);
      dl.appendChild(wrap);
    }
  }

  // リザルトの見出しと、結果に合わせた主人公の絵
  function fillResultHead(kind, head, body, distance, brag) {
    resultLook = bgStage;
    $('result').dataset.kind = kind;
    $('resultHead').textContent = head;
    $('resultBody').textContent = body;
    $('resultDist').textContent = fmtDist(distance);
    $('resultCompare').textContent = Rules.compareDistance(distance / 1000);
    // 結果を X に投稿するボタン。文面は投稿する前に本人が直せる。距離が 0 なら出さない。
    // 広告ブロッカーは共有ボタンらしい名前と X の投稿 URL へのリンクを隠すので、名前を変え、押すまで URL を持たせない。
    const title = Rules.rankFor(distance / 1000).title;
    const text = `${brag}おじさんを ${fmtDist(distance)} ぶっとばした！（称号：${title}）\n#ぶつかりおじさんバスター`;
    const url = document.querySelector('link[rel="canonical"]').href;
    $('bragBtn').hidden = distance <= 0;
    $('bragBtn').onclick = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    const cv = $('resultArt');
    const x = cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, cv.width, cv.height);
    const down = kind === 'over';
    // ゲームオーバーの見出しは暗いので、明るい線で描く夜の配色にする
    Art.drawPlayer(x, Art.PALETTES[down ? 3 : 0], {
      x: down ? 75 : 78, y: down ? 105 : 150, dir: 1, s: down ? 0.72 : 0.8,
      pose: down ? 'down' : 'win', phase: 0.1, time: 0.4, mass: save.up.kata,
    });
  }

  function showEndlessResult() {
    mode = 'idle';
    wipe = null;
    paused = false;
    resumeLeft = 0;
    Sound.resume();
    Sound.stopBgm();
    bank();
    const rank = Rules.rankFor(run.distance / 1000);
    if (run.distance > 0) {
      save.endlessLocal.push({ distance: run.distance, flown: run.stats.flown, level: run.level, maxCombo: run.maxCombo, at: Date.now() });
      save.endlessLocal.sort((a, b) => b.distance - a.distance);
      save.endlessLocal = save.endlessLocal.slice(0, 10);
      writeSave();
    }
    fillResultHead('endless', 'リザルト', `エンドレス ／ ${run.stats.flown}人ぶっとばしました`, run.distance, 'エンドレスモードで、');
    renderResultRows = () => fillRows([
      ['称号', rank.title],
      ['レベル', `${run.level}`],
      ['ジャスト', `${run.stats.just}回`],
      ['パリィ', `${run.stats.parry}回`],
      ['巻き込み', `${run.stats.chain}回`],
      ['最大コンボ', `${run.maxCombo}`],
      ['自己ベスト', fmtDist(save.endlessBest)],
      ['バスター手当の残高', yen(save.yen)],
    ]);
    renderResultRows();
    $('retryBtn').textContent = 'もう一度エンドレスで遊ぶ';
    $('retryBtn').onclick = () => startEndless();
    $('resultRanking').hidden = false;
    $('resultRanking').onclick = () => openRanking(backToResult);
    $('resultShop').onclick = () => openShop(backToResult, 'リザルトに戻る', 0);
    $('resultZukan').onclick = () => openZukan(backToResult);
    $('resultTitle').onclick = () => startWipe(enterDemo);
    $('resultForm').hidden = true;
    $('resultName').value = save.nickname;
    setResultStatus(run.distance > 0 ? '' : '距離が0mなので、ランキングには登録しません。');
    pendingScore = run.distance > 0 ? {
      runPromise, distance: run.distance, flown: run.stats.flown, level: run.level, maxCombo: run.maxCombo,
    } : null;
    showOverlay('result');
    submitEndless();
    setTimeout(() => {
      if (!$('result').hidden && !coarse && $('resultForm').hidden) $('retryBtn').focus({ preventScroll: true });
    }, 900);
  }

  // ---- 結果 ----
  function showResult(cleared) {
    if (gameMode === 'endless') {
      showEndlessResult();
      return;
    }
    mode = 'idle';
    Sound.stopBgm();
    pendingScore = null;
    setResultStatus('');
    $('resultForm').hidden = true;
    $('resultRanking').hidden = true;
    const rank = Rules.rankFor(run.distance / 1000);
    const st = run.stage;
    fillResultHead(
      cleared ? 'clear' : 'over',
      cleared ? 'クリア!' : 'ゲームオーバー',
      cleared ? 'すべてのステージのおじさんをぶっとばしました' : `ステージ${st.line + 1} ${LINES[st.line].name} ／ ${st.name}で力尽きました`,
      run.distance,
      cleared ? '全ステージクリア！' : `${st.name}まで進んで、`,
    );
    renderResultRows = () => fillRows([
      ['称号', rank.title],
      ['バスター手当の残高', yen(save.yen)],
      ['ジャスト', `${run.stats.just}回`],
      ['パリィ', `${run.stats.parry}回`],
      ['被弾', `${run.stats.hurt}回`],
      ['空振り', `${run.stats.whiff}回`],
      ['最大コンボ', `${run.maxCombo}`],
      ['自己ベスト', fmtDist(save.best)],
    ]);
    renderResultRows();
    const retryStage = cleared ? 0 : run.stageIndex;
    $('retryBtn').textContent = cleared ? 'もう一度、最初から遊ぶ' : `${STAGES[retryStage].name}からやり直す`;
    $('retryBtn').onclick = () => startGame(retryStage);
    $('resultShop').onclick = () => openShop(backToResult, 'リザルトに戻る', retryStage);
    $('resultZukan').onclick = () => openZukan(backToResult);
    $('resultTitle').onclick = () => startWipe(enterDemo);
    showOverlay('result');
    setTimeout(() => {
      if (!$('result').hidden && !coarse) $('retryBtn').focus({ preventScroll: true });
    }, 900);
  }

  // ---- ボタン ----
  $('startBtn').addEventListener('click', () => startGame(selectedStage));
  $('endlessBtn').addEventListener('click', () => startEndless());
  $('guideBtn').addEventListener('click', () => {
    Sound.unlock();
    openGuide(() => showOverlay('title'));
  });
  $('guideClose').addEventListener('click', () => {
    if (guideBack) guideBack();
    // 絵の分のメモリが大きいので、閉じたら手放す。次に開くときに描き直す。
    $('guideBody').textContent = '';
  });
  for (const [id, device] of [['guideTabPc', 'pc'], ['guideTabSp', 'sp']]) {
    $(id).addEventListener('click', () => {
      guideDevice = device;
      renderGuide();
    });
  }
  $('rankingBtn').addEventListener('click', () => {
    Sound.unlock();
    openRanking(() => showOverlay('title'));
  });
  $('rankingClose').addEventListener('click', () => {
    if (rankingBack) rankingBack();
  });
  for (const [id, tab] of [['rankTabOnline', 'online'], ['rankTabLocal', 'local']]) {
    $(id).addEventListener('click', () => {
      rankingTab = tab;
      renderRanking();
    });
  }
  $('resultForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('resultName').value.trim();
    if (!name) {
      setResultStatus('名前を入れてください。');
      return;
    }
    save.nickname = name;
    writeSave();
    submitEndless();
  });
  $('nameForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('nameInput').value.trim();
    if (!name) return;
    const res = await Ranking.rename(playerToken(), name);
    if (res.offline || res.error) {
      const messages = { bad_name: NAME_RULE, name_taken: 'この名前は別の人が使っています。' };
      $('rankingStatus').textContent = messages[res.error] || '名前を変更できませんでした。もう一度お試しください。';
      return;
    }
    save.nickname = res.name;
    writeSave();
    renderRanking();
  });
  $('shopBtn').addEventListener('click', () => {
    Sound.unlock();
    openShop(() => {
      setStageLook(0);
      showOverlay('title');
    }, 'タイトルへ戻る', selectedStage);
  });
  $('zukanBtn').addEventListener('click', () => {
    Sound.unlock();
    openZukan(() => showOverlay('title'));
  });
  $('shopDone').addEventListener('click', () => {
    Sound.unlock();
    if (shopAfter) shopAfter.after();
  });
  $('zukanClose').addEventListener('click', () => {
    if (zukanBack) zukanBack();
  });
  $('pauseBtn').addEventListener('click', pauseGame);
  $('resumeBtn').addEventListener('click', () => {
    Sound.unlock();
    requestResume();
  });
  $('quitBtn').addEventListener('click', () => {
    // エンドレスは途中でやめてもその距離を記録する
    if (gameMode === 'endless') {
      run.over = true;
      showResult(false);
      return;
    }
    bank();
    mode = 'idle'; // 画面が切り替わるまでの間に、裏で試合が進まないようにする
    paused = false;
    resumeLeft = 0;
    Sound.resume();
    Sound.stopBgm();
    startWipe(enterDemo);
  });
  for (const id of ['soundBtn', 'soundBtn2']) {
    $(id).addEventListener('click', () => {
      save.sound = !save.sound;
      writeSave();
      Sound.unlock();
      syncToggles();
    });
  }
  for (const id of ['fxBtn', 'fxBtn2']) {
    $(id).addEventListener('click', () => {
      save.fx = !save.fx;
      writeSave();
      syncToggles();
    });
  }

  // ---- 起動 ----
  document.documentElement.lang = 'ja';

  function frame(now) {
    // 先に次のコマを予約する。途中でエラーが起きても画面が止まったままにならない。
    requestAnimationFrame(frame);
    const warp = !paused && rt >= warpFrom && rt < warpUntil ? warpScale : 1;
    const dt = Math.min((now - last) / 1000, 0.05) * timeScale * warp;
    last = now;
    step(dt);
    render();
  }

  new ResizeObserver(layout).observe(stageEl);
  layout();
  enterDemo();
  layout();

  if (document.fonts && document.fonts.load) {
    // キャンバスの文字は読み込み前だと別の書体で出るので、使う文字を先に読み込む
    const names = STAGES.map((s) => s.name + s.kana + s.label).join('') + LINES.map((l) => l.name + l.short).join('') + Object.values(TYPES).map((t) => t.name).join('');
    const ranks = Rules.COMBO_RANKS.map((r) => r.name).join('');
    const calls = Object.values(BOSS_CALLS).map((call) => call('').join('')).join('');
    const display = `${names}${ranks}${calls}${Art.sceneText}に昇格ステージエリアクリア全!体幹が尽きました0123456789kmあと人ボスジャストパリィ+まとめて抜きぶっとばしレベル次まで自己ベスト更新エンドレスモード返した`;
    const manga = `${Object.values(FINALE_CRIES).join('')}${CRIES.join('')}${HIT_JUST.join('')}${HIT_PARRY.join('')}ガキン!カキンドンッスカッピタッん?ボヨンスッ…クドクドナイスショットガシャーンキラーン月太陽空のかなたへまでビタン0123456789m `;
    const ui = `${names}${calls}${Art.sceneText}${DEX.map((e) => e.phrase + (e.hint || '')).join('')}ぶっとばし距離体幹コンボ図鑑に登録なぞって動く／タップで体当たりマウスでおじさんが輪に入った瞬間にクリック輪がせまくなった力尽きましたバスター手当人ぶっとばすとボスが来ますチッどこ見てんだ気をつけろふん固定自己ベストジャストでないと飛ばない`;
    Promise.all([
      document.fonts.load('20px "Dela Gothic One"', display),
      document.fonts.load('20px "Reggae One"', manga),
      document.fonts.load('700 16px "Zen Kaku Gothic New"', ui),
    ]).then(rebuildBg).catch(() => {});
  }

  // 動作確認用。手元でだけ使える。
  if (DEV) {
    window.__buster = {
      get mode() { return mode; },
      get run() { return run; },
      get save() { return save; },
      get paused() { return paused; },
      start: startGame,
      startEndless,
      get gameMode() { return gameMode; },
      setYen(v) { save.yen = v; },
      setSlow(v) { timeScale = v; },
      // 画面が隠れていて描画が止まっていても、決まった時間だけ進めて確かめられるようにする
      advance(seconds, until) {
        for (let i = 0; i < seconds * 60; i++) {
          step(1 / 60);
          if (until && until()) break;
        }
        render();
      },
      press,
      setTarget(x, z) { run.setTarget(x, z); },
    };
  }
  if (BOT && params.get('mode') === 'endless') startEndless();
  else if (BOT) startGame(Math.min(Number(params.get('stage')) || 0, STAGES.length - 1));

  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
})();
