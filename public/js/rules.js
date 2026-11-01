'use strict';
// 判定・おじさんの動き・距離の計算だけを持つ。画面にも音にも触らないので node --test でそのまま試せる。
// 座標は床の上の平面（x, z）。画面に描くときだけ z を SQUASH 倍してつぶす。
const Rules = (() => {
  const SQUASH = 0.62;
  const CONTACT = 44; // 肩が触れる距離
  const LATE_GRACE = 0.06; // 触れてからパリィが間に合う時間（秒）
  const JUST_LATE = 0.025; // そのうちジャスト扱いになる時間（秒）
  const BASE_HP = 3;
  const SHOCK_RADIUS = 200; // ジャストの衝撃が届く距離
  const PASSBY_OFFSET = 78; // 二度見おじさんが横を通り過ぎるときの間隔
  const RETREAT_GAP = 120; // よろけたあとに取り直す間合い
  const RETREAT_SPEED = 420;
  // 空振りの硬直。連打が得にならないよう、続けて空振りするほど長くなる。
  const WHIFF = { lock: 0.3, step: 0.2, maxStreak: 3 };

  // walk/dash は 1 秒あたりの距離、trigger はダッシュを始める距離、tell は溜めの秒数
  // 仕掛けの指定:
  //   reach     体より先の部分が当たる距離   feint/feints  輪の手前で止まる（回数）
  //   weave     ふらつく                     homing   ダッシュ中に相手へ曲がる
  //   bounce    よけられても跳ね返る         justOnly ジャストでないと弾かれる
  //   stealth   溜めるまで見えにくい         warp     消えて反対側から来る
  //   accel     だんだん加速する             passby   1 回目は横を通り過ぎて戻る
  //   group     複数人で来る（stagger は順番の間隔）
  //   shot      飛び道具を撃つ。はじくと本人に返る（reload は次を撃つまでの秒数）
  const TYPES = {
    normal: { name: '肩入れおじさん', walk: 52, dash: 640, trigger: 230, tell: 0.42, hits: 1, value: 1, scale: 1 },
    fast: { name: '早足おじさん', walk: 96, dash: 820, trigger: 270, tell: 0.3, hits: 1, value: 1.1, scale: 0.96 },
    phone: { name: 'スマホおじさん', walk: 34, dash: 720, trigger: 150, tell: 0.22, hits: 1, value: 1.2, scale: 1 },
    umbrella: { name: '傘おじさん', walk: 55, dash: 680, trigger: 250, tell: 0.4, hits: 1, value: 1.3, scale: 1, reach: 38 },
    feint: { name: '寸止めおじさん', walk: 60, dash: 700, trigger: 240, tell: 0.36, hits: 1, value: 1.3, scale: 1, feint: true },
    heavy: { name: '大荷物おじさん', walk: 38, dash: 540, trigger: 210, tell: 0.55, hits: 2, value: 1.6, scale: 1.18 },
    weave: { name: '千鳥足おじさん', walk: 60, dash: 620, trigger: 240, tell: 0.42, hits: 1, value: 1.4, scale: 1, weave: true },
    futo: { name: 'ふとっちょおじさん', walk: 36, dash: 500, trigger: 220, tell: 0.5, hits: 2, value: 1.6, scale: 1.28, reach: 14, bounce: 1 },
    duo: { name: '同僚コンビ', walk: 58, dash: 640, trigger: 230, tell: 0.42, hits: 1, value: 1.1, scale: 1, group: 2 },
    nidomi: { name: '二度見おじさん', walk: 60, dash: 720, trigger: 240, tell: 0.34, hits: 1, value: 1.4, scale: 1, passby: true },
    line: { name: '行列おじさん', walk: 60, dash: 650, trigger: 240, tell: 0.4, hits: 1, value: 1.1, scale: 0.96, group: 3, stagger: 0.38 },
    bike: { name: '自転車おじさん', walk: 110, dash: 980, trigger: 300, tell: 0.3, hits: 1, value: 1.4, scale: 1.04, accel: true, reach: 10 },
    otaku: { name: 'オタクくん', walk: 64, dash: 600, trigger: 250, tell: 0.4, hits: 1, value: 1.3, scale: 1, homing: 6 },
    stealth: { name: '影うすおじさん', walk: 62, dash: 660, trigger: 220, tell: 0.36, hits: 1, value: 1.4, scale: 0.96, stealth: true },
    warp: { name: 'いつの間にかおじさん', walk: 48, dash: 680, trigger: 240, tell: 0.3, hits: 1, value: 1.5, scale: 1, warp: true },
    regent: { name: 'じらしおじさん', walk: 60, dash: 720, trigger: 280, tell: 0.32, hits: 1, value: 1.6, scale: 1, feint: true, feints: 2 },
    sekkyo: { name: '説教おじさん', walk: 40, dash: 600, trigger: 300, tell: 0.5, hits: 1, value: 1.5, scale: 1.02, shot: 'kogoto', reload: 1.3 },
    golfer: { name: 'ゴルフおじさん', walk: 44, dash: 600, trigger: 320, tell: 0.6, hits: 1, value: 1.5, scale: 1, shot: 'ball', reload: 1.6 },
    hardhat: { name: '現場おじさん', walk: 54, dash: 620, trigger: 230, tell: 0.42, hits: 1, value: 1.6, scale: 1.02, justOnly: true },
    muscle: { name: '筋トレおじさん', walk: 46, dash: 1120, trigger: 280, tell: 0.95, hits: 1, value: 1.6, scale: 1.1 },
    // ボス
    kakaricho: { name: '係長', boss: true, walk: 70, dash: 700, trigger: 290, tell: 0.46, hits: 3, value: 5, scale: 1.3 },
    kacho: { name: '課長', boss: true, walk: 78, dash: 760, trigger: 300, tell: 0.38, hits: 5, value: 6, scale: 1.4 },
    bucho: { name: '部長', boss: true, walk: 84, dash: 820, trigger: 310, tell: 0.32, hits: 7, value: 7, scale: 1.5, feintEvery: 3 },
    kaicho: { name: '会長', boss: true, walk: 90, dash: 900, trigger: 320, tell: 0.26, hits: 7, value: 8, scale: 1.65, feintEvery: 2, finale: true },
    tencho: { name: '店長', boss: true, walk: 74, dash: 760, trigger: 300, tell: 0.38, hits: 4, value: 5, scale: 1.35, bounce: 1 },
    kumiai: { name: '組合長', boss: true, walk: 78, dash: 800, trigger: 300, tell: 0.36, hits: 6, value: 6, scale: 1.45, feintEvery: 3, finale: true },
    kosan: { name: '古参オタク', boss: true, walk: 80, dash: 780, trigger: 310, tell: 0.34, hits: 5, value: 6, scale: 1.4, homing: 4 },
    tetsuya: { name: '徹夜王', boss: true, walk: 84, dash: 840, trigger: 320, tell: 0.3, hits: 7, value: 7, scale: 1.45, warp: true, finale: true },
    senmu: { name: '専務', boss: true, walk: 84, dash: 860, trigger: 310, tell: 0.3, hits: 7, value: 7, scale: 1.5, feintEvery: 2 },
    shacho: { name: '社長', boss: true, walk: 90, dash: 940, trigger: 330, tell: 0.42, hits: 9, value: 8, scale: 1.6, finale: true },
    taisho: { name: '横丁の大将', boss: true, walk: 88, dash: 820, trigger: 310, tell: 0.3, hits: 7, value: 7, scale: 1.5, weave: true },
    daio: { name: 'ぶつかり大王', boss: true, walk: 96, dash: 980, trigger: 340, tell: 0.26, hits: 12, value: 8, scale: 1.75, feintEvery: 3, homing: 3.5, warp: true, finale: true },
    // 飛び道具（図鑑には載せない）
    kogoto: { name: '小言', projectile: true, walk: 0, dash: 600, trigger: 0, tell: 0, hits: 1, value: 0.2, scale: 0.8 },
    ball: { name: 'ゴルフボール', projectile: true, walk: 0, dash: 1000, trigger: 0, tell: 0, hits: 1, value: 0.2, scale: 0.7 },
  };

  // 全 5 ステージ。1 ステージは 3〜5 のエリアでできている。
  // エリアは通し番号（STAGES の並び）で扱い、進むほど輪が狭くなり、おじさんが速く多くなる。
  const LINES = [
    {
      name: '駅のホーム', short: 'ホーム', theme: 'platform',
      stations: [
        { name: '肩当', kana: 'かたあて', label: '朝ラッシュ', sky: 'day', goal: 10, boss: 'kakaricho', bossHits: 3, mix: { normal: 6, fast: 1 } },
        { name: '押合', kana: 'おしあい', label: '昼休み', sky: 'day', goal: 12, boss: 'kacho', bossHits: 4, mix: { normal: 4, fast: 3, phone: 3, umbrella: 2 } },
        { name: '体幹', kana: 'たいかん', label: '帰宅ラッシュ', sky: 'sunset', goal: 14, boss: 'bucho', bossHits: 5, mix: { normal: 3, fast: 2, phone: 2, umbrella: 3, feint: 3, heavy: 1 } },
        { name: '定時', kana: 'ていじ', label: '終電', sky: 'night', goal: 16, boss: 'kaicho', bossHits: 7, mix: { normal: 2, fast: 3, phone: 2, umbrella: 2, feint: 3, heavy: 2 } },
      ],
    },
    {
      name: '商店街', short: '商店街', theme: 'arcade',
      stations: [
        { name: '呼込通り', kana: 'よびこみどおり', label: '朝市', sky: 'day', goal: 12, boss: 'tencho', bossHits: 4, mix: { normal: 3, futo: 3, duo: 2 } },
        { name: '値切り横丁', kana: 'ねぎりよこちょう', label: 'お昼どき', sky: 'day', goal: 12, boss: 'tencho', bossHits: 5, mix: { fast: 2, futo: 2, duo: 3, nidomi: 3 } },
        { name: '特売広場', kana: 'とくばいひろば', label: 'タイムセール', sky: 'day', goal: 14, boss: 'kumiai', bossHits: 5, mix: { normal: 2, line: 3, futo: 2, nidomi: 2, umbrella: 2 } },
        { name: '閉店通り', kana: 'へいてんどおり', label: '夕暮れ', sky: 'sunset', goal: 16, boss: 'kumiai', bossHits: 7, mix: { feint: 2, line: 2, futo: 2, nidomi: 2, bike: 3 } },
      ],
    },
    {
      name: '電気街', short: '電気街', theme: 'electric',
      stations: [
        { name: '部品通り', kana: 'ぶひんどおり', label: '開店前', sky: 'day', goal: 12, boss: 'kosan', bossHits: 5, mix: { normal: 2, otaku: 5, phone: 2 } },
        { name: '同人ビル前', kana: 'どうじんびるまえ', label: '新刊の日', sky: 'day', goal: 14, boss: 'kosan', bossHits: 5, mix: { otaku: 4, stealth: 3, fast: 2 } },
        { name: '推し活広場', kana: 'おしかつひろば', label: '発売日', sky: 'sunset', goal: 14, boss: 'kosan', bossHits: 6, mix: { otaku: 3, stealth: 3, line: 3, duo: 2 } },
        { name: '徹夜列', kana: 'てつやれつ', label: '深夜', sky: 'night', goal: 16, boss: 'tetsuya', bossHits: 6, mix: { stealth: 2, otaku: 3, warp: 3, feint: 2 } },
        { name: '聖地', kana: 'せいち', label: '夜明け前', sky: 'night', goal: 16, boss: 'tetsuya', bossHits: 8, mix: { otaku: 3, warp: 3, regent: 3, stealth: 2, line: 2 } },
      ],
    },
    {
      name: 'オフィス街', short: 'オフィス', theme: 'office',
      stations: [
        { name: '名刺通り', kana: 'めいしどおり', label: '始業前', sky: 'day', goal: 14, boss: 'senmu', bossHits: 6, mix: { normal: 3, sekkyo: 4, phone: 2 } },
        { name: '会議ビル前', kana: 'かいぎびるまえ', label: '会議の合間', sky: 'day', goal: 16, boss: 'senmu', bossHits: 7, mix: { sekkyo: 3, regent: 3, golfer: 3 } },
        { name: '残業タワー', kana: 'ざんぎょうたわー', label: '残業', sky: 'night', goal: 18, boss: 'shacho', bossHits: 7, mix: { golfer: 2, sekkyo: 2, muscle: 3, hardhat: 3, warp: 2 } },
      ],
    },
    {
      name: '飲み屋横丁', short: '横丁', theme: 'yokocho',
      stations: [
        { name: '赤提灯', kana: 'あかちょうちん', label: '乾杯', sky: 'sunset', goal: 14, boss: 'taisho', bossHits: 6, mix: { weave: 5, normal: 2, muscle: 2 } },
        { name: '二次会通り', kana: 'にじかいどおり', label: 'もう一軒', sky: 'night', goal: 16, boss: 'taisho', bossHits: 7, mix: { weave: 4, futo: 3, hardhat: 2, golfer: 2 } },
        { name: 'カラオケ前', kana: 'からおけまえ', label: '十八番', sky: 'night', goal: 16, boss: 'taisho', bossHits: 7, mix: { weave: 3, sekkyo: 2, warp: 3, duo: 3, regent: 2 } },
        { name: '終電ダッシュ', kana: 'しゅうでんだっしゅ', label: '最後の一本', sky: 'night', goal: 18, boss: 'shacho', bossHits: 8, mix: { bike: 3, muscle: 3, hardhat: 3, otaku: 2, regent: 3, line: 2, nidomi: 2 } },
        { name: '朝帰り', kana: 'あさがえり', label: '夜明け', sky: 'dawn', goal: 20, boss: 'daio', bossHits: 12, mix: { weave: 3, futo: 2, bike: 2, otaku: 2, stealth: 2, warp: 3, regent: 3, sekkyo: 2, golfer: 2, hardhat: 3, muscle: 2 } },
      ],
    },
  ];

  const STAGES = [];
  LINES.forEach((line, lineIndex) => {
    line.stations.forEach((st, areaIndex) => {
      STAGES.push({ ...st, line: lineIndex, area: areaIndex, theme: line.theme });
    });
  });
  STAGES.forEach((st, i) => {
    const t = i / (STAGES.length - 1);
    st.parry = Math.round(96 - 66 * t);
    st.just = Math.round(40 - 26 * t);
    st.speed = 1 + 0.6 * t;
    st.maxAlive = Math.min(7, 2 + Math.floor(t * 6));
    st.spawnEvery = 2.4 - 1.4 * t;
    st.bpm = 112 + Math.round(48 * t);
    st.root = 45 + (i % 8);
  });

  // エンドレスモード。10 人ごとにレベルが上がり、5 レベルごとにボスが来る。体幹は鍛えても 3 のまま。
  const ENDLESS = { perLevel: 10, bossEvery: 5, hp: BASE_HP };
  // [種類, 出始めるレベル, 出やすさ]
  const ENDLESS_UNLOCK = [
    ['normal', 0, 5], ['fast', 1, 3], ['phone', 2, 2], ['umbrella', 3, 2], ['futo', 4, 2], ['feint', 5, 3], ['heavy', 6, 1],
    ['duo', 7, 2], ['otaku', 8, 3], ['nidomi', 9, 2], ['stealth', 10, 2], ['line', 11, 2], ['weave', 12, 3], ['bike', 13, 2],
    ['sekkyo', 14, 2], ['regent', 15, 2], ['hardhat', 16, 2], ['warp', 17, 2], ['golfer', 18, 2], ['muscle', 19, 2],
  ];
  const ENDLESS_BOSSES = ['kakaricho', 'tencho', 'kosan', 'kacho', 'senmu', 'bucho', 'kumiai', 'taisho', 'tetsuya', 'shacho', 'kaicho', 'daio'];

  const UPGRADES = [
    { id: 'kata', name: '肩幅', desc: 'ぶっとばせる範囲が広がる', max: 5, costs: [500, 1200, 2500, 4500, 8000] },
    { id: 'hansha', name: '反射神経', desc: 'ジャストの範囲が広がる', max: 5, costs: [400, 1000, 2000, 3800, 7000] },
    { id: 'taikan', name: '体幹', desc: '受けられる回数が増える（通常モードのみ）', max: 3, costs: [800, 2500, 6000] },
    { id: 'ashi', name: '脚力', desc: '空振りの硬直が短くなり、移動も速くなる', max: 5, costs: [300, 800, 1800, 3200, 6000] },
  ];

  // コンボの段位。列車の種別で上がっていく。
  const COMBO_RANKS = [
    { at: 0, name: '普通' },
    { at: 5, name: '快速' },
    { at: 10, name: '急行' },
    { at: 20, name: '特急' },
    { at: 30, name: '新幹線' },
  ];

  // 図鑑の並びと説明。hint は初めて出会ったときに画面に出す仕掛けの説明。
  const DEX = [
    { type: 'normal', habitat: '駅のホーム', phrase: 'どこ見てんだ', note: 'ゆっくり寄ってきて、間合いに入ると肩から突っ込む。いちばん数が多い。' },
    { type: 'fast', habitat: '駅のホーム', phrase: '急いでるんだよ', note: '遠くからでも気づいて速く突っ込む。輪の中にいる時間が短い。' },
    { type: 'phone', habitat: '駅のホーム', phrase: '……（画面を見ている）', note: '歩くのは遅いが、すぐ近くまで来てから急に突っ込む。溜めが短い。', hint: '近くまで来てから急に突っ込む' },
    { type: 'umbrella', habitat: '駅のホーム', phrase: '雨？ 知らん', note: '傘を横に持っている。体より先に、傘の先が輪に入った瞬間から押せる。', hint: '傘の先が輪に入ったら押せる' },
    { type: 'feint', habitat: '駅のホーム', phrase: 'ビビったか？', note: '輪の手前でいったん止まる。止まったときに押すと空振りになる。', hint: '止まったときに押すと空振り' },
    { type: 'heavy', habitat: '駅のホーム', phrase: 'リュックだから', note: '2 回はじかないと飛ばない。突っ込みは遅い。', hint: '2回はじくと飛ぶ' },
    { type: 'futo', habitat: '商店街', phrase: 'ふぅ、ふぅ', note: '体が大きく、2 回はじかないと飛ばない。よけても跳ね返ってもう一度突っ込んでくる。', hint: 'よけても跳ね返ってくる' },
    { type: 'duo', habitat: '商店街', phrase: 'だよなー', note: '2 人で同時に来る。うまく引きつければ 1 回でまとめて飛ばせる。', hint: '2人同時。まとめて飛ばせる' },
    { type: 'nidomi', habitat: '商店街', phrase: 'ん？', note: '1 回目は横を通り過ぎ、振り返って本気で突っ込む。通り過ぎるときに叩いてもいい。', hint: '通り過ぎて戻ってくる' },
    { type: 'line', habitat: '商店街', phrase: '並んでるんですけど', note: '3 人が順番に突っ込んでくる。続けて押す必要がある。', hint: '3人が順番に来る' },
    { type: 'bike', habitat: '商店街', phrase: 'チリンチリン！', note: '自転車で歩道を走ってくる。最初はゆっくりで、だんだん加速する。', hint: 'だんだん加速する' },
    { type: 'otaku', habitat: '電気街', phrase: 'ちなみにそれ、違うんですよ', note: '推しの新刊を追って、ダッシュの途中で曲がってくる。横によけても追ってくる。', hint: 'よけても曲がって追ってくる' },
    { type: 'stealth', habitat: '電気街', phrase: '……いましたけど', note: '影が薄く、溜めに入るまでほとんど見えない。「!」が出たら注意。', hint: '溜めるまで見えにくい' },
    { type: 'warp', habitat: '電気街', phrase: 'さっきからいましたよ', note: '溜めたあと一度消えて、反対側から現れて突っ込む。', hint: '消えて反対側から来る' },
    { type: 'regent', habitat: '電気街', phrase: 'まだまだ', note: '輪の手前で 2 回も止まる。焦って押すと空振りになる。', hint: '2回止まる。焦らないこと' },
    { type: 'sekkyo', habitat: 'オフィス街', phrase: 'そもそもね', note: '離れた場所から小言を飛ばしてくる。小言をはじくと本人に返って飛んでいく。', hint: '小言をはじくと本人に返る' },
    { type: 'golfer', habitat: 'オフィス街', phrase: 'ナイスショット！', note: 'ゴルフクラブの素振りをして、速いボールを打ってくる。はじくと本人に返る。', hint: 'ボールをはじくと本人に返る' },
    { type: 'hardhat', habitat: 'オフィス街', phrase: '安全第一！', note: 'ヘルメットが固く、パリィでは弾かれるだけ。内の輪で押すジャストか、飛んでくる仲間をぶつけると飛ぶ。', hint: 'ジャストでしか飛ばない' },
    { type: 'muscle', habitat: 'オフィス街', phrase: '見てくれよこの筋肉', note: '溜めがとても長いが、そのあとのダッシュは誰よりも速い。', hint: '溜めが長く、とても速い' },
    { type: 'weave', habitat: '飲み屋横丁', phrase: 'もう一軒！', note: 'ふらつきながら突っ込む。ネクタイを頭に巻いている。', hint: 'ふらつきながら来る' },
    { type: 'kakaricho', habitat: '駅のホーム', phrase: '最近の若いのは', note: '最初のボス。何度かはじくと飛ぶ。' },
    { type: 'kacho', habitat: '駅のホーム', phrase: '数字は？', note: '昼休みでも休まず突っ込む。' },
    { type: 'bucho', habitat: '駅のホーム', phrase: '俺の若い頃はな', note: 'ときどき輪の手前で止まる。ゴルフクラブを手放さない。' },
    { type: 'kaicho', habitat: '駅のホーム', phrase: '道を開けろ', note: '何度も輪の手前で止まる。ホームの主。' },
    { type: 'tencho', habitat: '商店街', phrase: '今だけお得！', note: 'よけても跳ね返ってくる。エプロン姿の商店街のボス。' },
    { type: 'kumiai', habitat: '商店街', phrase: '組合で決まったから', note: 'ときどき輪の手前で止まる。商店街を仕切っている。' },
    { type: 'kosan', habitat: '電気街', phrase: '昔はもっと良かった', note: 'ダッシュの途中で曲がって追ってくる。電気街の古株。' },
    { type: 'tetsuya', habitat: '電気街', phrase: '三日寝てないんで', note: '消えて反対側から現れる。徹夜列の先頭にいる。' },
    { type: 'senmu', habitat: 'オフィス街', phrase: '聞いてないな', note: '何度も輪の手前で止まる。話が長い。' },
    { type: 'shacho', habitat: 'オフィス街', phrase: '私を誰だと思っている', note: '溜めは長いが、ダッシュがとても速い。' },
    { type: 'taisho', habitat: '飲み屋横丁', phrase: 'へい、お待ち！', note: 'ふらつきながら突っ込む。横丁で一番声が大きい。' },
    { type: 'daio', habitat: '飲み屋横丁', phrase: '朝まで付き合え', note: '止まる、消える、曲がる。すべてのおじさんの頂点。' },
  ];

  // 称号はぶっとばした距離で決まる
  const RANKS = [
    { km: 84, title: 'おじさんの天敵' },
    { km: 42.195, title: '伝説のバスター' },
    { km: 20, title: '凄腕バスター' },
    { km: 7, title: '一人前バスター' },
    { km: 1.5, title: 'かけだしバスター' },
    { km: 0, title: '見習いバスター' },
  ];

  // 距離がどのくらいかを、誰でも知っているものでたとえる
  // スカイツリー 634 m、富士山 3,776 m、フルマラソン 42.195 km
  function compareDistance(km) {
    if (km < 0.634) return 'スカイツリーの高さにはまだ届きません';
    if (km < 3.776) return `スカイツリー ${Math.floor(km / 0.634)}本分の距離です`;
    if (km < 42.195) return `富士山 ${Math.floor(km / 3.776)}個分の距離です`;
    return `フルマラソン ${Math.floor(km / 42.195)}回分の距離です`;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function emptyUpgrades() {
    return { kata: 0, hansha: 0, taikan: 0, ashi: 0 };
  }

  function zonesFromBase(base, up = emptyUpgrades()) {
    const parry = base.parry + (up.kata || 0) * 14;
    const just = base.just + (up.hansha || 0) * 6;
    // 内の輪が外の輪に届いたら外の輪も広げる。終盤でも反射神経の強化が無駄にならないように。
    return { parry: Math.max(parry, just), just };
  }

  function zonesFor(stageIndex, up = emptyUpgrades()) {
    return zonesFromBase(STAGES[stageIndex], up);
  }

  // エンドレスの難しさ。レベルが上がるほど輪が狭く、おじさんが速く多くなる。
  function endlessSpec(level) {
    const round = Math.floor(level / ENDLESS.bossEvery);
    const lookIndex = round % STAGES.length;
    const mix = {};
    for (const [type, from, weight] of ENDLESS_UNLOCK) {
      if (level >= from) mix[type] = weight;
    }
    return {
      ...STAGES[lookIndex],
      lookIndex,
      parry: Math.max(30, 96 - 5 * level),
      just: Math.max(12, 40 - 2 * level),
      speed: Math.min(1.8, 1 + 0.05 * level),
      goal: Infinity,
      maxAlive: Math.min(8, 2 + Math.floor(level / 2)),
      spawnEvery: Math.max(0.55, 2.2 - 0.13 * level),
      mix,
      boss: ENDLESS_BOSSES[Math.max(round - 1, 0) % ENDLESS_BOSSES.length],
      bossHits: Math.min(3 + round, 12),
      bpm: Math.min(170, 112 + 3 * level),
    };
  }

  function maxHp(up = emptyUpgrades()) {
    return BASE_HP + (up.taikan || 0);
  }

  // 画面上の 1 秒あたりの距離。ふつうのマウス操作では遅れを感じない速さにしてある。
  function moveSpeed(up = emptyUpgrades()) {
    return 3000 + (up.ashi || 0) * 300;
  }

  function whiffLock(streak, up = emptyUpgrades()) {
    return (WHIFF.lock + WHIFF.step * (streak - 1)) * (1 - (up.ashi || 0) * 0.08);
  }

  function upgradeCost(id, level) {
    const u = UPGRADES.find((x) => x.id === id);
    return u && level < u.max ? u.costs[level] : null;
  }

  function comboMult(combo) {
    return 1 + Math.min(combo, 50) * 0.03;
  }

  function comboRankIndex(combo) {
    let index = 0;
    COMBO_RANKS.forEach((r, i) => {
      if (combo >= r.at) index = i;
    });
    return index;
  }

  function launchDistance(grade, combo, value, final, multi = 1) {
    const mult = comboMult(combo) * (1 + 0.5 * (multi - 1));
    if (!final) return Math.round((grade === 'just' ? 40 : 15) * mult);
    return Math.round((grade === 'just' ? 160 : 60) * value * mult);
  }

  function rankFor(km) {
    return RANKS.find((r) => km >= r.km) || RANKS[RANKS.length - 1];
  }

  function contactOf(o) {
    const T = TYPES[o.type];
    return CONTACT + (T.reach || 0) + (T.scale - 1) * 26;
  }

  class Run {
    constructor(seed = 1, opts = {}) {
      this.rng = mulberry32(seed);
      this.up = { ...emptyUpgrades(), ...(opts.upgrades || {}) };
      this.demo = !!opts.demo;
      this.immortal = !!opts.immortal || this.demo;
      this.bounds = opts.bounds || { x0: 0, x1: 960, d: 560 };
      this.spawnSides = opts.spawnSides || ['left', 'right', 'bottom'];
      this.mix = opts.mix || null;
      this.fixedMoveCap = opts.moveCap || null;
      this.moveCap = this.fixedMoveCap || moveSpeed(this.up);
      this.endless = !!opts.endless;
      this.level = 0;
      this.spec = null;
      this.hpMax = this.endless ? ENDLESS.hp : maxHp(this.up);
      this.hp = this.hpMax;
      this.distance = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.stats = { just: 0, parry: 0, hurt: 0, whiff: 0, flown: 0, chain: 0 };
      this.flownByType = {};
      this.bestByType = {};
      this.seenTypes = new Set();
      this.stageIndex = 0;
      this.over = false;
      this.time = 0;
      this.avatar = { x: 0, z: 0, tx: 0, tz: 0, invuln: 0, dirX: 1 };
      this.ojisan = [];
      this.nextId = 0;
      this.phase = 'done';
      this.lockUntil = -Infinity;
      this.lockLength = 0;
      this.whiffStreak = 0;
      this.zone = zonesFor(0, this.up);
    }

    get stage() {
      return this.spec || STAGES[this.stageIndex];
    }

    // エリアの間で鍛えた分を反映する。次の beginStage から効く。
    applyUpgrades(up) {
      this.up = { ...emptyUpgrades(), ...up };
      if (!this.endless) this.hpMax = maxHp(this.up);
      if (!this.fixedMoveCap) this.moveCap = moveSpeed(this.up);
    }

    // 残りの人数（ボスは含まない）
    get remaining() {
      return Math.max(this.stage.goal - this.flownThisStage, 0);
    }

    // エンドレスで、次のレベルまでの人数
    get toNextLevel() {
      return ENDLESS.perLevel - (this.flownThisStage % ENDLESS.perLevel);
    }

    setBounds(bounds) {
      this.bounds = bounds;
      const a = this.avatar;
      a.x = this.clampX(a.x);
      a.z = this.clampZ(a.z);
      this.setTarget(a.tx, a.tz);
    }

    clampX(x) {
      return Math.min(Math.max(x, this.bounds.x0 + 30), this.bounds.x1 - 30);
    }

    clampZ(z) {
      return Math.min(Math.max(z, (this.bounds.z0 || 0) + 10), this.bounds.d - 10);
    }

    setTarget(x, z) {
      this.avatar.tx = this.clampX(x);
      this.avatar.tz = this.clampZ(z);
    }

    beginStage(index) {
      this.stageIndex = index;
      this.zone = zonesFor(index, this.up);
      this.hp = this.hpMax;
      this.ojisan = [];
      this.time = 0;
      this.phase = 'intro';
      this.phaseLeft = this.demo ? 0.3 : 2.2;
      this.spawnTimer = 0.2;
      this.flownThisStage = 0;
      this.lockUntil = -Infinity;
      this.whiffStreak = 0;
      this.stageStartDistance = this.distance;
      const a = this.avatar;
      a.x = (this.bounds.x0 + this.bounds.x1) / 2;
      a.z = ((this.bounds.z0 || 0) + this.bounds.d) * 0.55;
      a.tx = a.x;
      a.tz = a.z;
      a.invuln = 0;
    }

    beginEndless() {
      this.level = 0;
      this.spec = endlessSpec(0);
      this.beginStage(0);
      this.zone = zonesFromBase(this.spec, this.up);
    }

    callBoss(out) {
      this.phase = 'bossCall';
      this.phaseLeft = 3.4;
      for (const o of this.ojisan) o.state = TYPES[o.type].projectile ? 'gone' : 'leave';
      out.push({ kind: 'bossCall', type: this.stage.boss });
    }

    pickType() {
      const entries = Object.entries(this.mix || this.stage.mix);
      let roll = this.rng() * entries.reduce((sum, [, w]) => sum + w, 0);
      for (const [type, w] of entries) {
        roll -= w;
        if (roll <= 0) return type;
      }
      return entries[0][0];
    }

    spawnPoint() {
      const { x0, x1, d, z0 = 0 } = this.bounds;
      const a = this.avatar;
      let best = null;
      let bestDist = -1;
      for (let i = 0; i < 6; i++) {
        const side = this.spawnSides[Math.floor(this.rng() * this.spawnSides.length)];
        const p =
          side === 'left' ? { x: x0 - 70, z: z0 + this.rng() * (d - z0) }
          : side === 'right' ? { x: x1 + 70, z: z0 + this.rng() * (d - z0) }
          : { x: x0 + this.rng() * (x1 - x0), z: d + 130 };
        const dist = Math.hypot(p.x - a.x, p.z - a.z);
        if (dist > bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      return best;
    }

    addOjisan(type, x, z, opts = {}) {
      const T = TYPES[type];
      const hits = opts.hits || T.hits;
      const o = {
        id: this.nextId++,
        type, x, z,
        state: 'stalk',
        hits,
        hitsLeft: hits,
        age: 0,
        cool: 0,
        left: 0,
        dx: 1,
        dz: 0,
        speed: 0,
        traveled: 0,
        maxDash: 0,
        feintCount: 0,
        warped: false,
        bounced: 0,
        passStage: 0,
        graceUsed: 0,
        roll: this.rng(),
      };
      this.ojisan.push(o);
      if (!T.projectile) this.seenTypes.add(type);
      return o;
    }

    inside(o) {
      const { x0, x1, d, z0 = 0 } = this.bounds;
      return o.x > x0 + 8 && o.x < x1 - 8 && o.z > z0 && o.z < d;
    }

    gapOf(o) {
      return Math.hypot(this.avatar.x - o.x, this.avatar.z - o.z) - contactOf(o);
    }

    // いま押せる相手のうち、いちばん近い隙間。bot と輪の点灯が使う。
    bestGap() {
      let best = Infinity;
      for (const o of this.ojisan) {
        if (o.state === 'contact') best = Math.min(best, 0);
        else if (o.state === 'dash') best = Math.min(best, this.gapOf(o));
      }
      return best;
    }

    update(dt) {
      const out = [];
      if (this.over) return out;
      this.time += dt;
      this.moveAvatar(dt);
      this.stepPhase(dt, out);
      for (const o of this.ojisan) {
        this.stepOjisan(o, dt, out);
        if (this.over) return out;
      }
      this.ojisan = this.ojisan.filter((o) => o.state !== 'gone');
      return out;
    }

    moveAvatar(dt) {
      const a = this.avatar;
      a.invuln = Math.max(a.invuln - dt, 0);
      a.stagger = Math.max((a.stagger || 0) - dt, 0);
      a.moved = 0;
      const dx = a.tx - a.x;
      const dz = a.tz - a.z;
      // z は画面でつぶれて見えるので、画面上の距離で測ると縦横の速さがそろう
      const dist = Math.hypot(dx, dz * SQUASH);
      if (dist < 0.01) return;
      // なだらかに追いつかせず、上限の速さまではその場で目標に重ねる
      const cap = this.moveCap * (a.stagger > 0 ? 0.2 : 1) * dt;
      const k = Math.min(cap / dist, 1);
      a.x += dx * k;
      a.z += dz * k;
      a.moved = dist * k;
      if (Math.abs(dx) > 0.8) a.dirX = Math.sign(dx);
    }

    stepPhase(dt, out) {
      const st = this.stage;
      switch (this.phase) {
        case 'intro':
          this.phaseLeft -= dt;
          if (this.phaseLeft <= 0) this.phase = 'field';
          break;
        case 'field': {
          if (this.endless) {
            const level = Math.floor(this.flownThisStage / ENDLESS.perLevel);
            if (level > this.level) {
              this.level = level;
              this.spec = endlessSpec(level);
              this.zone = zonesFromBase(this.spec, this.up);
              out.push({ kind: 'levelUp', level, zone: this.zone });
              if (level % ENDLESS.bossEvery === 0) {
                this.callBoss(out);
                break;
              }
            }
          } else if (!this.demo && this.flownThisStage >= st.goal) {
            this.callBoss(out);
            break;
          }
          const cur = this.stage;
          this.spawnTimer -= dt;
          const alive = this.ojisan.filter((o) => o.state !== 'leave' && !TYPES[o.type].projectile).length;
          const canAdd = this.demo || this.flownThisStage + alive < cur.goal;
          if (this.spawnTimer <= 0 && alive < cur.maxAlive && canAdd) {
            const p = this.spawnPoint();
            const type = this.pickType();
            const T = TYPES[type];
            const count = T.group || 1;
            for (let i = 0; i < count; i++) {
              // 複数人で来るおじさんは少し離して並べ、順番に来るものは溜めに入る時間をずらす
              const o = this.addOjisan(type, p.x, p.z + (i - (count - 1) / 2) * 84);
              o.cool = (T.stagger || 0) * i;
              out.push({ kind: 'spawn', o });
            }
            this.spawnTimer = cur.spawnEvery * (0.8 + this.rng() * 0.4);
          }
          break;
        }
        case 'bossCall':
          this.phaseLeft -= dt;
          if (this.phaseLeft <= 0) {
            const p = this.spawnPoint();
            const o = this.addOjisan(st.boss, p.x, p.z, { hits: st.bossHits });
            out.push({ kind: 'spawn', o });
            this.phase = 'boss';
          }
          break;
        // エンドレスでボスを飛ばしたあと、次の時間帯へ移るまでの間
        case 'intermission':
          this.phaseLeft -= dt;
          if (this.phaseLeft <= 0) {
            this.phase = 'reopen';
            this.phaseLeft = 0.8;
            out.push({ kind: 'nextArea', look: this.spec.lookIndex, level: this.level });
          }
          break;
        case 'reopen':
          this.phaseLeft -= dt;
          if (this.phaseLeft <= 0) {
            this.phase = 'field';
            this.spawnTimer = 0.2;
          }
          break;
        case 'finish':
          this.phaseLeft -= dt;
          if (this.phaseLeft <= 0) {
            this.phase = 'done';
            out.push({ kind: 'stageEnd', index: this.stageIndex });
          }
          break;
        default:
          break;
      }
    }

    startDash(o) {
      const a = this.avatar;
      const T = TYPES[o.type];
      let tx = a.x;
      let tz = a.z;
      // 二度見おじさんの 1 回目は、わざと横を通り過ぎる
      if (T.passby && o.passStage === 0) {
        const px = a.x - o.x;
        const pz = a.z - o.z;
        const l = Math.hypot(px, pz) || 1;
        const side = o.roll < 0.5 ? 1 : -1;
        tx += (-pz / l) * side * PASSBY_OFFSET;
        tz += (px / l) * side * PASSBY_OFFSET;
        o.passStage = 1;
      }
      const dx = tx - o.x;
      const dz = tz - o.z;
      const len = Math.hypot(dx, dz) || 1;
      o.dx = dx / len;
      o.dz = dz / len;
      o.state = 'dash';
      o.traveled = 0;
      o.maxDash = len + (T.homing || T.accel ? 320 : 160);
      o.speed = T.dash * this.stage.speed;
    }

    // 溜め終わったときの動き。おじさんの種類で変わる。
    afterTell(o, out) {
      const T = TYPES[o.type];
      if (T.shot) {
        const shot = this.addOjisan(T.shot, o.x, o.z);
        shot.ownerId = o.id;
        this.startDash(shot);
        o.state = 'reload';
        o.left = T.reload;
        out.push({ kind: 'shoot', o, shot });
      } else if (T.warp && !o.warped) {
        // 相手をはさんだ反対側へ移る
        const a = this.avatar;
        out.push({ kind: 'warp', o, fromX: o.x, fromZ: o.z });
        o.warped = true;
        Object.assign(o, this.pointAround(Math.atan2(a.z - o.z, a.x - o.x), Math.min(T.trigger * 0.8, 200)));
        o.state = 'vanish';
        o.left = 0.28;
      } else {
        this.startDash(o);
        out.push({ kind: 'dash', o });
      }
    }

    // 相手から r 離れた床の上の点。angle の向きを優先し、壁で切られるときは近い向きを探す。
    pointAround(angle, r) {
      const a = this.avatar;
      for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2, 2.5, -2.5, Math.PI]) {
        const x = a.x + Math.cos(angle + turn) * r;
        const z = a.z + Math.sin(angle + turn) * r;
        if (x === this.clampX(x) && z === this.clampZ(z)) return { x, z };
      }
      return { x: this.clampX(a.x + Math.cos(angle) * r), z: this.clampZ(a.z + Math.sin(angle) * r) };
    }

    // よろけたり弾かれたりしたあと、仕掛けをまた使えるようにする
    rearm(o) {
      o.feintCount = 0;
      o.warped = false;
      o.bounced = 0;
      o.passStage = 0;
    }

    stepOjisan(o, dt, out) {
      const a = this.avatar;
      const T = TYPES[o.type];
      o.age += dt;
      const dx = a.x - o.x;
      const dz = a.z - o.z;
      const d = Math.hypot(dx, dz) || 1;
      switch (o.state) {
        case 'stalk': {
          if (o.retreat) {
            const rx = o.retreat.x - o.x;
            const rz = o.retreat.z - o.z;
            const left = Math.hypot(rx, rz);
            const move = RETREAT_SPEED * dt;
            if (left <= move) {
              o.x = o.retreat.x;
              o.z = o.retreat.z;
              o.retreat = null;
            } else {
              o.x += (rx / left) * move;
              o.z += (rz / left) * move;
            }
          } else {
            // 画面の外にいる間は待たせないよう、早足で入ってくる
            const v = T.walk * this.stage.speed * (this.inside(o) ? 1 : 3.5);
            o.x += (dx / d) * v * dt;
            o.z += (dz / d) * v * dt;
            this.separate(o, dt);
          }
          if (o.cool > 0) o.cool -= dt;
          else if (!o.retreat && this.inside(o) && d <= T.trigger) {
            o.state = 'tell';
            o.left = T.tell;
            out.push({ kind: 'tell', o });
          }
          break;
        }
        case 'tell':
          o.left -= dt;
          if (o.left <= 0) this.afterTell(o, out);
          break;
        case 'vanish':
          o.left -= dt;
          if (o.left <= 0) {
            o.state = 'tell';
            o.left = 0.32;
            out.push({ kind: 'tell', o });
          }
          break;
        case 'reload':
          o.left -= dt;
          if (o.left <= 0) {
            if (d <= T.trigger) {
              o.state = 'tell';
              o.left = T.tell;
              out.push({ kind: 'tell', o });
            } else {
              o.state = 'stalk';
            }
          }
          break;
        case 'dash': {
          // 自転車はだんだん加速する
          const v = T.accel ? o.speed * (0.45 + Math.min(o.traveled / T.trigger, 1)) : o.speed;
          if (T.weave || T.homing) {
            // 千鳥足とオタクくんは、少しずつ相手へ向きを変える
            const k = Math.min(dt * (T.homing || 3), 1);
            o.dx += (dx / d - o.dx) * k;
            o.dz += (dz / d - o.dz) * k;
            const l = Math.hypot(o.dx, o.dz) || 1;
            o.dx /= l;
            o.dz /= l;
          }
          if (T.weave) {
            const wob = Math.cos(o.traveled / 38) * 0.7;
            o.x += (o.dx - o.dz * wob) * v * dt;
            o.z += (o.dz + o.dx * wob) * v * dt;
          } else {
            o.x += o.dx * v * dt;
            o.z += o.dz * v * dt;
          }
          o.traveled += v * dt;
          const gap = this.gapOf(o);
          const hitsDone = o.hits - o.hitsLeft;
          const every = T.feintEvery && hitsDone % T.feintEvery === T.feintEvery - 1;
          const fakes = T.feints || (T.feint || every ? 1 : 0);
          // 2 回止まるおじさんは、1 回目を遠めで止まる
          const margin = fakes === 2 && o.feintCount === 0 ? 100 : 36;
          if (o.feintCount < fakes && gap <= this.zone.parry + margin) {
            o.feintCount++;
            o.state = 'feintStop';
            o.left = fakes === 2 ? 0.38 : 0.5;
            out.push({ kind: 'feint', o });
          } else if (gap <= 0 && a.invuln <= 0) {
            o.state = 'contact';
            o.graceUsed = 0;
          } else if (o.traveled >= o.maxDash || (o.passStage === 1 && (o.x !== this.clampX(o.x) || o.z !== this.clampZ(o.z)))) {
            // 通り過ぎる途中で床の端に着いたら、画面の外へ出ずに振り返る
            this.endDash(o, T, out);
          }
          break;
        }
        case 'feintStop':
          o.left -= dt;
          if (o.left <= 0) {
            this.startDash(o);
            out.push({ kind: 'dash', o });
          }
          break;
        case 'contact':
          // 2 人がほぼ同時に来ても、続けて体幹が減らないようにする
          if (a.invuln > 0) {
            o.state = T.projectile ? 'gone' : 'stumble';
            o.left = 0.7;
            break;
          }
          o.graceUsed += dt;
          if (o.graceUsed > LATE_GRACE) this.hurt(o, out);
          break;
        case 'stumble':
          o.x += o.dx * o.speed * 0.35 * Math.max(o.left, 0) * dt;
          o.z += o.dz * o.speed * 0.35 * Math.max(o.left, 0) * dt;
          o.left -= dt;
          if (o.left <= 0) {
            o.state = 'stalk';
            o.cool = T.boss ? 0.2 : 0.6;
            this.rearm(o);
            // 重なったまま次のダッシュを始めると、よけることもはじくこともできない
            if (this.gapOf(o) < RETREAT_GAP) {
              o.retreat = this.pointAround(Math.atan2(o.z - a.z, o.x - a.x), contactOf(o) + RETREAT_GAP);
            }
          }
          break;
        case 'recoil': {
          const k = Math.max(o.left / 0.38, 0);
          o.x += o.dx * 620 * k * dt;
          o.z += o.dz * 620 * k * dt;
          o.left -= dt;
          if (o.left <= 0) {
            o.state = 'stalk';
            o.cool = T.boss ? 0.15 : 0.3;
            this.rearm(o);
          }
          break;
        }
        case 'leave': {
          const toLeft = o.x < (this.bounds.x0 + this.bounds.x1) / 2;
          o.x += (toLeft ? -1 : 1) * 260 * dt;
          if (o.x < this.bounds.x0 - 120 || o.x > this.bounds.x1 + 120) o.state = 'gone';
          break;
        }
        default:
          break;
      }
    }

    // 当たらずにダッシュが終わったとき
    endDash(o, T, out) {
      if (T.projectile) {
        o.state = 'gone';
      } else if (o.passStage === 1) {
        o.passStage = 2;
        o.state = 'tell';
        o.left = 0.24;
        out.push({ kind: 'turn', o });
      } else if (T.bounce && o.bounced < T.bounce) {
        o.bounced++;
        o.state = 'tell';
        o.left = 0.25;
        out.push({ kind: 'bounce', o });
      } else {
        o.state = 'stumble';
        o.left = 0.7;
        out.push({ kind: 'dodged', o });
      }
    }

    // 歩いているおじさん同士が完全に重ならないように少し離す
    separate(o, dt) {
      for (const other of this.ojisan) {
        if (other === o || other.state !== 'stalk') continue;
        const dx = o.x - other.x;
        const dz = o.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d > 0 && d < 80) {
          o.x += (dx / d) * 50 * dt;
          o.z += (dz / d) * 50 * dt;
        }
      }
    }

    hurt(o, out) {
      const a = this.avatar;
      this.combo = 0;
      this.stats.hurt++;
      if (!this.immortal) this.hp = Math.max(this.hp - 1, 0);
      a.invuln = 0.9;
      a.stagger = 0.22;
      a.x = this.clampX(a.x + o.dx * 36);
      a.z = this.clampZ(a.z + o.dz * 36);
      o.state = TYPES[o.type].projectile ? 'gone' : 'stumble';
      o.left = 0.8;
      out.push({ kind: 'hurt', o, hp: this.hp });
      if (this.hp <= 0) {
        this.over = true;
        out.push({ kind: 'gameOver' });
      }
    }

    press() {
      const out = [];
      if (this.over || this.phase === 'done') return out;
      if (this.time < this.lockUntil) {
        out.push({ kind: 'locked' });
        return out;
      }
      const targets = [];
      for (const o of this.ojisan) {
        if (o.state === 'contact') {
          // ジャストでしか飛ばない相手は、触れてからの猶予を少し長くする
          const late = TYPES[o.type].justOnly ? JUST_LATE * 2 : JUST_LATE;
          targets.push({ o, grade: o.graceUsed <= late ? 'just' : 'parry' });
        } else if (o.state === 'dash') {
          const gap = this.gapOf(o);
          if (gap <= this.zone.parry) targets.push({ o, grade: gap <= this.zone.just ? 'just' : 'parry' });
        }
      }
      if (targets.length) {
        this.whiffStreak = 0;
        // 固いおじさんはジャストでないと弾かれるだけ
        const blocked = (t) => TYPES[t.o.type].justOnly && t.grade !== 'just';
        // 距離の「まとめて」に数えるのは、実際にはじいた人だけ
        const multi = targets.filter((t) => !blocked(t) && !TYPES[t.o.type].projectile).length || 1;
        for (const t of targets) {
          if (blocked(t)) this.guarded(t.o, out);
          else this.parry(t.o, t.grade, multi, out);
        }
        this.ojisan = this.ojisan.filter((o) => o.state !== 'flying');
        if (targets.some((t) => t.grade === 'just')) this.shockwave();
        return out;
      }
      const threat = this.ojisan.find((o) => o.state === 'tell' || o.state === 'dash' || o.state === 'feintStop');
      // 突っ込んでくる相手がいないときは素振りとして許す
      if (!threat) {
        out.push({ kind: 'swing' });
        return out;
      }
      this.whiffStreak = Math.min(this.whiffStreak + 1, WHIFF.maxStreak);
      const lock = whiffLock(this.whiffStreak, this.up);
      this.lockUntil = this.time + lock;
      this.lockLength = lock;
      this.combo = 0;
      this.stats.whiff++;
      out.push({ kind: 'whiff', o: threat, lock });
      return out;
    }

    guarded(o, out) {
      const a = this.avatar;
      const dx = o.x - a.x;
      const dz = o.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      o.dx = dx / len;
      o.dz = dz / len;
      o.state = 'recoil';
      o.left = 0.38;
      out.push({ kind: 'guarded', o });
    }

    parry(o, grade, multi, out) {
      const a = this.avatar;
      const dx = o.x - a.x;
      const dz = o.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      this.applyHit(o, grade, multi, dx / len, dz / len, 0, out);
    }

    // 飛んでいくおじさんに巻き込まれたとき。chain は何人目の巻き込みか。ボスは耐える。
    chainHit(o, grade, chain, dirX, dirZ) {
      const out = [];
      const T = TYPES[o.type];
      if (this.over || T.boss || T.projectile || o.state === 'leave' || o.state === 'vanish' || !this.ojisan.includes(o)) return out;
      this.stats.chain++;
      this.applyHit(o, grade, 1, dirX, dirZ, chain, out);
      this.ojisan = this.ojisan.filter((x) => x.state !== 'flying');
      return out;
    }

    // ジャストの衝撃で、歩いているおじさんが少し下がる
    shockwave() {
      const a = this.avatar;
      for (const o of this.ojisan) {
        if (o.state !== 'stalk' || TYPES[o.type].boss) continue;
        const dx = o.x - a.x;
        const dz = o.z - a.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d > SHOCK_RADIUS) continue;
        o.dx = dx / d;
        o.dz = dz / d;
        o.state = 'recoil';
        o.left = 0.3;
      }
    }

    // 飛び道具をはじくと、撃った本人に返る
    reflect(shot, grade, out) {
      const owner = this.ojisan.find((x) => x.id === shot.ownerId && x.state !== 'leave' && x.state !== 'flying');
      if (!owner) return;
      const a = this.avatar;
      const dx = owner.x - a.x;
      const dz = owner.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const hit = [];
      this.applyHit(owner, grade, 1, dx / len, dz / len, 1, hit);
      for (const ev of hit) out.push({ ...ev, kind: 'reflect' });
    }

    applyHit(o, grade, multi, dirX, dirZ, chain, out) {
      const T = TYPES[o.type];
      if (T.projectile) {
        o.state = 'flying';
        o.dx = dirX;
        o.dz = dirZ;
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.stats[grade]++;
        const small = launchDistance(grade, this.combo, T.value, true, 1);
        this.distance += small;
        out.push({ kind: 'parry', o, grade, final: true, dist: small, combo: this.combo, multi, chain, projectile: true });
        this.reflect(o, grade, out);
        return;
      }
      o.hitsLeft--;
      const final = o.hitsLeft <= 0;
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      // 巻き込みや返した弾は別に数えるので、押して当てた回数だけを足す
      if (!chain) this.stats[grade]++;
      const dist = launchDistance(grade, this.combo, T.value, final, multi + chain);
      this.distance += dist;
      o.dx = dirX;
      o.dz = dirZ;
      if (final) {
        o.state = 'flying';
        this.stats.flown++;
        this.flownByType[o.type] = (this.flownByType[o.type] || 0) + 1;
        this.bestByType[o.type] = Math.max(this.bestByType[o.type] || 0, dist);
        if (T.boss) {
          this.phase = this.endless ? 'intermission' : 'finish';
          this.phaseLeft = this.endless ? 1.2 : 1.5;
        } else {
          this.flownThisStage++;
        }
      } else {
        o.state = 'recoil';
        o.left = 0.38;
      }
      out.push({ kind: 'parry', o, grade, final, dist, combo: this.combo, multi, chain });
    }
  }

  return {
    SQUASH, CONTACT, LATE_GRACE, JUST_LATE, BASE_HP, SHOCK_RADIUS, WHIFF, TYPES, LINES, STAGES, UPGRADES, COMBO_RANKS, DEX, RANKS, ENDLESS,
    compareDistance, emptyUpgrades, zonesFor, zonesFromBase, endlessSpec, maxHp, moveSpeed, whiffLock, upgradeCost, comboMult, comboRankIndex, launchDistance, rankFor, contactOf, Run,
  };
})();

if (typeof module !== 'undefined') module.exports = Rules;
