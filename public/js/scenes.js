'use strict';
// ステージごとの背景。駅のホームは art.js にある。
// どれも back（空や遠景）と front（建物と床）に描き、案内板は art.js が上に重ねる。
(() => {
  const { THEMES, FONT, TAU, mix, circle, line, halftoneSky, stars, skyBody, clouds, tactile, perspectiveFloor } = Art;

  function textAt(c, txt, x, y, font, col) {
    c.fillStyle = col;
    c.font = font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(txt, x, y);
  }

  // 縦書きの看板
  function verticalSign(c, P, x, y, w, chars, fill, ink) {
    const h = chars.length * (w - 4) + 10;
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
    c.strokeStyle = P.ink;
    c.lineWidth = 2.4;
    c.strokeRect(x, y, w, h);
    [...chars].forEach((ch, i) => {
      textAt(c, ch, x + w / 2, y + 5 + (w - 4) * (i + 0.5), `${w - 8}px ${FONT.display}`, ink);
    });
    return h;
  }

  // 案内板をつるす横棒
  function beam(f, P, W, roofY, h = 18) {
    f.fillStyle = P.deep;
    f.fillRect(0, roofY + 6, W, h);
    line(f, 0, roofY + 6, W, roofY + 6, 3, P.ink);
    line(f, 0, roofY + 6 + h, W, roofY + 6 + h, 2, P.ink);
  }

  // ---- 商店街 ----
  const FLAGS = ['大売出し', '毎日特価', '福引', '夕市'];
  const SHOPS = ['八百屋', '鮮魚', '精肉', '薬局', '書店', '靴', 'お茶', '花屋', '果物', '文具', '時計', '洋品', 'パン', '豆腐'];

  function shopRow(s, top) {
    const { f, P, W, ft, rnd } = s;
    let x = -16;
    let i = Math.floor(rnd() * SHOPS.length);
    const boards = [P.sign, P.spot, P.tone, P.sign];
    while (x < W) {
      const w = 120 + rnd() * 70;
      // 壁と窓
      f.fillStyle = mix(P.paper, P.tone, 0.45);
      f.fillRect(x, top, w, ft - top);
      f.fillStyle = P.deep;
      f.fillRect(x + 8, top + 50, w - 16, ft - top - 50);
      // 並んだ商品
      for (let k = 0; k < 3; k++) {
        const ry = top + 62 + k * 20;
        if (ry > ft - 8) break;
        line(f, x + 8, ry + 10, x + w - 8, ry + 10, 2, P.ink2);
        for (let gx = x + 16; gx < x + w - 14; gx += 16) {
          const col = rnd() < 0.3 ? P.spot : P.tone;
          circle(f, gx, ry + 3, 5, col);
        }
      }
      // 日よけ
      const n = Math.max(4, Math.floor(w / 24));
      for (let k = 0; k < n; k++) {
        f.fillStyle = k % 2 ? P.sign : P.tone;
        f.beginPath();
        const ax = x + (k / n) * w;
        const bx = x + ((k + 1) / n) * w;
        f.moveTo(ax, top + 32);
        f.lineTo(bx, top + 32);
        f.lineTo(bx, top + 52);
        f.lineTo(ax, top + 52);
        f.closePath();
        f.fill();
      }
      line(f, x, top + 52, x + w, top + 52, 2.4, P.ink);
      // 看板
      const col = boards[i % boards.length];
      f.fillStyle = col;
      f.fillRect(x, top, w, 32);
      f.strokeStyle = P.ink;
      f.lineWidth = 2.4;
      f.strokeRect(x, top, w, 32);
      const ink = col === P.spot ? '#10184A' : P.signInk;
      textAt(f, SHOPS[i % SHOPS.length], x + w / 2, top + 17, `20px ${FONT.display}`, col === P.tone ? P.ink : ink);
      f.strokeRect(x, top, w, ft - top);
      x += w;
      i++;
    }
  }

  THEMES.arcade = (s) => {
    const { b, f, P, W, H, ft, rnd, roofY } = s;
    // ガラスのアーケード屋根
    b.fillStyle = mix(P.paper, P.tone, 0.3);
    b.fillRect(0, 0, W, ft + 40);
    b.strokeStyle = P.tone;
    b.lineWidth = 3;
    b.beginPath();
    for (let x = -40; x < W + 40; x += 46) {
      b.moveTo(x, 0);
      b.lineTo(x + 60, roofY + 60);
    }
    for (let y = 8; y < roofY + 60; y += 20) {
      b.moveTo(0, y);
      b.lineTo(W, y);
    }
    b.stroke();

    shopRow(s, roofY + 34);
    beam(f, P, W, roofY);

    // つり下げた旗。案内板には重ねない。
    const signHalf = Math.max(170, Math.min(300, W - 340)) / 2 + 20;
    for (let i = 0, x = 40; x < W; x += 150, i++) {
      if (Math.abs(x + 12 - W / 2) < signHalf || x < 160 || x > W - 200) continue;
      verticalSign(f, P, x, roofY + 24, 22, FLAGS[i % FLAGS.length], P.spot, '#10184A');
    }

    // レンガの床
    f.fillStyle = P.floor;
    f.fillRect(0, ft, W, H - ft);
    f.strokeStyle = P.tone;
    f.lineWidth = 1.6;
    f.beginPath();
    let rowN = 0;
    for (let y = ft + 26; y < H; rowN++) {
      const rowH = 12 + rowN * 3;
      f.moveTo(0, y);
      f.lineTo(W, y);
      const brick = 44 + rowN * 12;
      for (let x = (rowN % 2 ? brick / 2 : 0); x < W; x += brick) {
        f.moveTo(x, y);
        f.lineTo(x, y + rowH);
      }
      y += rowH;
    }
    f.stroke();
    // 真ん中の模様
    f.fillStyle = P.tone;
    for (let i = 0; i < 12; i++) {
      const rx = rnd() * W;
      const ry = ft + 40 + rnd() * (H - ft - 50);
      f.globalAlpha = 0.35;
      f.fillRect(rx, ry, 30 + rnd() * 30, 8);
      f.globalAlpha = 1;
    }
    tactile(f, P, W, ft + 8, 16);
    line(f, 0, ft, W, ft, 3.5, P.ink);
  };

  // ---- 電気街 ----
  const NEON = ['電気', '部品', '中古', '買取', '同人', 'ゲーム', 'カード', '模型', 'パソコン', '無線', '基板', '特価'];

  // 何のキャラクターでもない看板の絵（星の目と大きな笑顔）
  function billboard(c, P, x, y, w, h, rnd) {
    c.fillStyle = rnd() < 0.5 ? P.spot : P.sign;
    c.fillRect(x, y, w, h);
    c.strokeStyle = P.ink;
    c.lineWidth = 3;
    c.strokeRect(x, y, w, h);
    const fx = x + w / 2;
    const fy = y + h / 2;
    const r = Math.min(w, h) * 0.36;
    circle(c, fx, fy, r, mix(P.paper, '#ffffff', 0.5), '#10184A', 2.4);
    for (const dx of [-0.4, 0.4]) {
      c.fillStyle = '#10184A';
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const R = i % 2 ? r * 0.1 : r * 0.24;
        const a = (i / 10) * TAU - Math.PI / 2;
        const px = fx + dx * r + Math.cos(a) * R;
        const py = fy - r * 0.15 + Math.sin(a) * R;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.closePath();
      c.fill();
    }
    c.strokeStyle = '#10184A';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(fx, fy + r * 0.15, r * 0.42, 0.2, Math.PI - 0.2);
    c.stroke();
  }

  THEMES.electric = (s) => {
    const { b, f, P, W, H, ft, rnd, roofY, view } = s;
    halftoneSky(b, P, W, ft);
    stars(s);
    // 遠くのビル
    let x = -10;
    while (x < W) {
      const w = 60 + rnd() * 60;
      const h = 90 + rnd() * (ft - 80);
      b.fillStyle = P.tone;
      b.fillRect(x, ft - h, w, h);
      x += w + 2;
    }
    // 手前のビルと看板
    x = -8;
    let i = Math.floor(rnd() * NEON.length);
    while (x < W) {
      const w = 96 + rnd() * 56;
      const h = Math.min(ft - 6, 140 + rnd() * 90);
      const top = ft - h;
      f.fillStyle = P.deep;
      f.fillRect(x, top, w, h);
      f.strokeStyle = P.ink;
      f.lineWidth = 2.4;
      f.strokeRect(x, top, w, h);
      // 窓
      f.fillStyle = P.night ? P.spot : P.paper;
      for (let wy = top + 12; wy < ft - 18; wy += 18) {
        for (let wx = x + 42; wx < x + w - 12; wx += 16) {
          if (rnd() < 0.5) f.fillRect(wx, wy, 9, 9);
        }
      }
      // 縦の看板
      const word = NEON[i % NEON.length];
      const room = ft - top - 16;
      const cw = Math.min(30, Math.floor(room / word.length));
      const fill = i % 3 === 0 ? P.spot : i % 3 === 1 ? P.sign : P.tone;
      verticalSign(f, P, x + 6, top + 6, cw, word, fill, fill === P.spot ? '#10184A' : fill === P.sign ? P.signInk : P.ink);
      // 大きな看板
      if (rnd() < 0.5 && h > 150 && w > 110) billboard(f, P, x + 42, top + 10, w - 52, Math.min(70, h * 0.32), rnd);
      x += w;
      i++;
    }
    s.bodyY = Math.max(30, ft - 165);
    s.body = skyBody(s, f);
    beam(f, P, W, roofY, 10);
    // 道路
    f.fillStyle = mix(P.floor, P.tone, 0.4);
    f.fillRect(0, ft, W, H - ft);
    // 横断歩道
    const cross = Math.min(H - ft - 40, view.portrait ? 300 : 170);
    f.fillStyle = P.floor;
    for (let k = 0, cx = -40; cx < W + 40; cx += 62, k++) {
      const t0 = 0.72;
      const mid = W / 2;
      const x0 = mid + (cx - mid) * t0;
      const x1 = mid + (cx + 32 - mid) * t0;
      f.beginPath();
      f.moveTo(x0, ft + 34);
      f.lineTo(x1, ft + 34);
      f.lineTo(cx + 32, ft + 34 + cross);
      f.lineTo(cx, ft + 34 + cross);
      f.closePath();
      f.fill();
    }
    line(f, 0, ft + 34 + cross + 18, W, ft + 34 + cross + 18, 5, P.floor);
    tactile(f, P, W, ft + 6, 16);
    line(f, 0, ft, W, ft, 3.5, P.ink);
  };

  // ---- オフィス街 ----
  THEMES.office = (s) => {
    const { b, f, P, W, H, ft, rnd, roofY } = s;
    halftoneSky(b, P, W, ft);
    stars(s);
    clouds(b, P, W, ft, rnd, 3);
    // ガラス張りの高層ビル
    let x = -14;
    while (x < W) {
      const w = 70 + rnd() * 70;
      const h = 110 + rnd() * Math.max(ft - 60, 60);
      const top = ft - 24 - h;
      b.fillStyle = rnd() < 0.5 ? P.tone : P.deep;
      b.fillRect(x, top, w, h + 24);
      b.strokeStyle = P.ink2;
      b.lineWidth = 1.2;
      b.beginPath();
      for (let gy = top + 8; gy < ft - 20; gy += 12) {
        b.moveTo(x, gy);
        b.lineTo(x + w, gy);
      }
      for (let gx = x + 12; gx < x + w; gx += 14) {
        b.moveTo(gx, top);
        b.lineTo(gx, ft);
      }
      b.stroke();
      if (P.night) {
        b.fillStyle = P.spot;
        for (let k = 0; k < 14; k++) {
          b.fillRect(x + 12 + Math.floor(rnd() * (w / 14)) * 14, top + 8 + Math.floor(rnd() * (h / 12)) * 12, 12, 10);
        }
      }
      x += w + 8;
    }
    s.bodyY = Math.max(30, ft - 165);
    s.body = skyBody(s);
    // 歩道の植え込みと街路樹
    f.fillStyle = P.deep;
    f.fillRect(0, ft - 22, W, 22);
    for (let tx = 30; tx < W; tx += 210) {
      f.fillStyle = P.ink2;
      f.fillRect(tx - 4, ft - 70, 8, 50);
      circle(f, tx, ft - 88, 30, P.tone, P.ink, 2.6);
      circle(f, tx - 20, ft - 74, 18, P.tone, P.ink, 2.6);
      circle(f, tx + 20, ft - 74, 18, P.tone, P.ink, 2.6);
    }
    for (let hx = 0; hx < W; hx += 34) circle(f, hx, ft - 24, 20, P.tone, P.ink, 2);
    f.fillStyle = P.deep;
    f.fillRect(0, ft - 16, W, 16);
    line(f, 0, ft - 16, W, ft - 16, 2.4, P.ink);
    // 信号の腕。案内板をつるす。
    f.fillStyle = P.ink2;
    f.fillRect(10, roofY + 10, 10, ft - roofY - 10);
    f.fillRect(W - 20, roofY + 10, 10, ft - roofY - 10);
    beam(f, P, W, roofY, 10);
    // 敷石と、スクランブル交差点の線
    perspectiveFloor(f, P, W, H, ft, 30);
    f.save();
    f.beginPath();
    f.rect(0, ft + 30, W, H - ft - 30);
    f.clip();
    f.strokeStyle = P.tone;
    f.lineWidth = 16;
    f.setLineDash([26, 22]);
    f.beginPath();
    f.moveTo(-20, ft + 30);
    f.lineTo(W + 20, H);
    f.moveTo(W + 20, ft + 30);
    f.lineTo(-20, H);
    f.stroke();
    f.setLineDash([]);
    f.restore();
    tactile(f, P, W, ft + 6, 16);
    line(f, 0, ft, W, ft, 3.5, P.ink);
  };

  // ---- 飲み屋横丁 ----
  const YATAI = ['焼鳥', 'おでん', '串', '酒', 'もつ', '餃子', 'ラーメン', '居酒屋', 'スナック', '立呑'];
  const LANTERN = '#E8432F';

  function lantern(c, P, x, y, r, txt) {
    line(c, x, y - r * 1.5, x, y - r, 2, P.ink);
    c.beginPath();
    c.ellipse(x, y, r * 0.86, r, 0, 0, TAU);
    c.fillStyle = LANTERN;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 2.4;
    c.stroke();
    c.fillStyle = '#10184A';
    c.fillRect(x - r * 0.6, y - r - 2, r * 1.2, 5);
    c.fillRect(x - r * 0.6, y + r - 3, r * 1.2, 5);
    if (txt) textAt(c, txt, x, y + 1, `${Math.round(r * 0.9)}px ${FONT.display}`, '#FFFFFF');
  }

  THEMES.yokocho = (s) => {
    const { b, f, P, W, H, ft, rnd, roofY } = s;
    halftoneSky(b, P, W, ft);
    stars(s);
    s.bodyY = Math.max(30, ft - 165);
    s.body = skyBody(s);
    // 遠くの屋根
    b.fillStyle = P.tone;
    for (let x = -30; x < W; x += 110) {
      b.beginPath();
      b.moveTo(x, ft - 70);
      b.lineTo(x + 55, ft - 118 - rnd() * 18);
      b.lineTo(x + 110, ft - 70);
      b.closePath();
      b.fill();
    }
    b.fillRect(0, ft - 72, W, 72);
    // 木造の店が並ぶ
    const top = Math.max(roofY + 52, ft - 124);
    let x = -14;
    let i = Math.floor(rnd() * YATAI.length);
    while (x < W) {
      const w = 110 + rnd() * 70;
      f.fillStyle = P.deep;
      f.fillRect(x, top, w, ft - top);
      // 板壁
      f.strokeStyle = P.ink2;
      f.lineWidth = 1.2;
      f.beginPath();
      for (let px = x + 10; px < x + w; px += 12) {
        f.moveTo(px, top);
        f.lineTo(px, ft);
      }
      f.stroke();
      // 屋根
      f.fillStyle = P.tone;
      f.beginPath();
      f.moveTo(x - 8, top + 10);
      f.lineTo(x + 8, top - 12);
      f.lineTo(x + w - 8, top - 12);
      f.lineTo(x + w + 8, top + 10);
      f.closePath();
      f.fill();
      f.strokeStyle = P.ink;
      f.lineWidth = 2.4;
      f.stroke();
      // 明かりのついた入口
      f.fillStyle = P.night ? P.spot : P.sign;
      f.fillRect(x + 12, top + 34, w - 24, ft - top - 34);
      // のれん
      const n = 4;
      const word = YATAI[i % YATAI.length];
      for (let k = 0; k < n; k++) {
        f.fillStyle = P.ink;
        const nx = x + 12 + ((w - 24) / n) * k;
        f.fillRect(nx + 1, top + 18, (w - 24) / n - 2, 36);
      }
      textAt(f, word, x + w / 2, top + 36, `${Math.min(22, Math.floor((w - 36) / word.length))}px ${FONT.display}`, P.paper);
      f.strokeStyle = P.ink;
      f.lineWidth = 2.4;
      f.strokeRect(x, top, w, ft - top);
      lantern(f, P, x + w - 14, top + 26, 14, '酒');
      x += w;
      i++;
    }
    // 提灯を下げた電線。案内板もここからつるす。
    line(f, 0, roofY + 22, W, roofY + 22, 3, P.ink);
    const signHalf = Math.max(170, Math.min(300, W - 340)) / 2 + 16;
    for (let lx = 24; lx < W; lx += 54) {
      if (Math.abs(lx - W / 2) < signHalf) continue;
      lantern(f, P, lx, roofY + 42, 10, null);
    }
    // 石畳
    f.fillStyle = P.floor;
    f.fillRect(0, ft, W, H - ft);
    f.fillStyle = P.tone;
    f.strokeStyle = P.tone;
    f.lineWidth = 1.2;
    for (let y = ft + 14, row = 0; y < H + 20; row++) {
      const sh = 10 + row * 2.4;
      const sw = 26 + row * 7;
      for (let sx = -sw + (row % 2 ? sw / 2 : 0); sx < W + sw; sx += sw + 6) {
        f.beginPath();
        f.ellipse(sx, y, sw / 2, sh / 2, 0, 0, TAU);
        f.globalAlpha = 0.3;
        f.fill();
        f.globalAlpha = 1;
        f.stroke();
      }
      y += sh + 5;
    }
    line(f, 0, ft, W, ft, 3.5, P.ink);
  };

  // 背景の文字。読み込み前に描くと別の書体になるので、game.js が先に読み込む。
  Art.sceneText = [...SHOPS, ...FLAGS, ...NEON, ...YATAI, ...Art.KOGOTO, '入口出口始発終点乗車位置酒'].join('');
})();
