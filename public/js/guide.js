'use strict';
// 遊び方の画面。イラストはゲームと同じ部品で Canvas に描く。
const Guide = (() => {
  const W = 640;
  const H = 340;
  const RATIO = 2;
  const FONT = Art.FONT;
  const TAU = Art.TAU;
  const P = Art.PALETTES[0];
  const ghost = Art.silhouette({ ...P, ink: P.line });
  const SQ = Rules.SQUASH;
  const SKIN = '#F6DCC6';

  function floor(c, strip = false) {
    c.fillStyle = P.floor;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = P.tone;
    c.lineWidth = 1.6;
    c.beginPath();
    for (let x = -300; x < W + 300; x += 110) {
      c.moveTo(W / 2 + (x - W / 2) * 0.55, 0);
      c.lineTo(x, H);
    }
    for (let i = 1; i < 8; i++) {
      c.moveTo(0, i * i * 6.5);
      c.lineTo(W, i * i * 6.5);
    }
    c.stroke();
    if (strip) {
      c.fillStyle = P.spot;
      c.fillRect(0, 0, W, 16);
      Art.line(c, 0, 16, W, 16, 2, P.ink);
    }
  }

  function label(c, txt, x, y, size = 25, o = {}) {
    Art.popText(c, txt, x, y, size, { font: FONT.display, fill: P.ink, stroke: P.floor, lw: size * 0.32, ...o });
  }

  function dashed(c, x0, y0, x1, y1, w = 3) {
    c.save();
    c.strokeStyle = P.ink;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.setLineDash([9, 10]);
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.restore();
  }

  function arrowHead(c, x, y, ang, s = 16) {
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.fillStyle = P.ink;
    c.beginPath();
    c.moveTo(s, 0);
    c.lineTo(-s * 0.7, -s * 0.7);
    c.lineTo(-s * 0.7, s * 0.7);
    c.closePath();
    c.fill();
    c.restore();
  }

  function speedLines(c, x, y, dir, n = 4, len = 46) {
    c.strokeStyle = P.ink;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const ly = y - i * 34;
      const lx = x - dir * (i % 2) * 20;
      c.moveTo(lx, ly);
      c.lineTo(lx - dir * len, ly);
    }
    c.stroke();
  }

  function cursorArrow(c, x, y, s = 1) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, 44);
    c.lineTo(11, 33);
    c.lineTo(20, 52);
    c.lineTo(29, 48);
    c.lineTo(20, 30);
    c.lineTo(35, 29);
    c.closePath();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 3.4;
    c.lineJoin = 'round';
    c.stroke();
    c.restore();
  }

  function mouse(c, x, y, s = 1, hotLeft = false) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.lineJoin = 'round';
    Art.rrect(c, -34, -50, 68, 100, 32);
    c.fillStyle = '#FFFFFF';
    c.fill();
    if (hotLeft) {
      c.save();
      Art.rrect(c, -34, -50, 68, 100, 32);
      c.clip();
      c.fillStyle = P.spot;
      c.fillRect(-34, -50, 34, 44);
      c.restore();
    }
    Art.rrect(c, -34, -50, 68, 100, 32);
    c.strokeStyle = P.ink;
    c.lineWidth = 4;
    c.stroke();
    Art.line(c, -34, -6, 34, -6, 3, P.ink);
    Art.line(c, 0, -50, 0, -6, 3, P.ink);
    c.restore();
    if (hotLeft) {
      c.strokeStyle = P.ink;
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      for (const a of [-2.7, -2.2, -1.7]) {
        const r0 = 66 * s;
        const r1 = 88 * s;
        const ox = x - 16 * s;
        const oy = y - 34 * s;
        c.moveTo(ox + Math.cos(a) * r0 * 0.7, oy + Math.sin(a) * r0 * 0.7);
        c.lineTo(ox + Math.cos(a) * r1 * 0.7, oy + Math.sin(a) * r1 * 0.7);
      }
      c.stroke();
    }
  }

  function keycap(c, x, y, w, h, txt) {
    c.fillStyle = P.tone;
    Art.rrect(c, x - w / 2, y - h / 2 + 6, w, h, 10);
    c.fill();
    Art.rrect(c, x - w / 2, y - h / 2, w, h, 10);
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 3.4;
    c.stroke();
    c.fillStyle = P.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `22px ${FONT.display}`;
    c.fillText(txt, x, y);
  }

  // 指先が (x, y) に来て、下へ伸びる指
  function finger(c, x, y, s = 1, rot = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    Art.rrect(c, -22, 0, 44, 210, 22);
    c.fillStyle = SKIN;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 3.6;
    c.stroke();
    // 爪
    Art.rrect(c, -13, 6, 26, 28, 11);
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.lineWidth = 2.4;
    c.stroke();
    Art.line(c, -12, 70, 12, 70, 2.4, P.ink);
    Art.line(c, -10, 78, 10, 78, 2.4, P.ink);
    c.restore();
  }

  function ripple(c, x, y, r = 30) {
    c.strokeStyle = P.ink;
    c.lineWidth = 3;
    for (const k of [0.55, 1]) {
      c.beginPath();
      c.ellipse(x, y, r * k, r * k * 0.7, 0, 0, TAU);
      c.stroke();
    }
    c.fillStyle = P.spot;
    c.beginPath();
    c.ellipse(x, y, r * 0.42, r * 0.3, 0, 0, TAU);
    c.fill();
    c.stroke();
  }

  // スマホの枠。中身は draw で描き、画面の外へははみ出さない。
  function phone(c, x, y, w, h, draw) {
    c.save();
    Art.rrect(c, x, y, w, h, 24);
    c.fillStyle = P.ink;
    c.fill();
    Art.rrect(c, x + 9, y + 9, w - 18, h - 18, 16);
    c.clip();
    c.fillStyle = P.floor;
    c.fillRect(x, y, w, h);
    c.strokeStyle = P.tone;
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 1; i < 6; i++) {
      c.moveTo(x, y + i * i * 9);
      c.lineTo(x + w, y + i * i * 9);
    }
    c.stroke();
    draw();
    c.restore();
  }

  const player = (c, x, y, o = {}) => Art.drawPlayer(c, P, { x, y, dir: 1, s: 1, pose: 'idle', phase: 0.1, time: 0.5, ...o });
  const ojisan = (c, x, y, o = {}) => Art.drawOjisan(c, o.palette || P, { x, y, dir: -1, s: 1, type: 'normal', pose: 'walk', phase: 0.12, ...o });

  // ---- イラスト ----
  const ART = {
    movePc(c) {
      floor(c);
      Art.drawPlayer(c, ghost, { x: 90, y: 300, dir: 1, s: 0.92, pose: 'run', phase: 0.3, time: 0.5 });
      player(c, 220, 300, { pose: 'run', phase: 0.15, s: 0.92 });
      dashed(c, 275, 200, 412, 142);
      arrowHead(c, 424, 137, -0.4);
      cursorArrow(c, 440, 112, 1.25);
      mouse(c, 560, 250, 0.95);
      arrowHead(c, 494, 250, Math.PI, 13);
      arrowHead(c, 626, 250, 0, 13);
      label(c, 'ついてくる', 300, 60, 30);
    },
    parryPc(c) {
      floor(c);
      mouse(c, 104, 118, 1.15, true);
      label(c, 'クリック', 104, 208, 25);
      label(c, 'または', 104, 244, 18);
      keycap(c, 104, 290, 170, 50, 'スペース');
      player(c, 330, 318, { pose: 'tackle', s: 0.98 });
      Art.burst(c, P, 412, 196, 62, 11, 0.3);
      ojisan(c, 500, 318, { pose: 'recoil', face: 'shock', s: 0.98 });
      label(c, '体当たり!', 410, 44, 34, { stroke: P.spot });
    },
    moveSp(c) {
      floor(c);
      phone(c, 196, 6, 220, 328, () => {
        Art.zoneRing(c, P, 306, 214, 74, 40, SQ, {});
        player(c, 306, 214, { s: 0.72 });
        finger(c, 306, 262, 0.82);
      });
      arrowHead(c, 240, 296, Math.PI, 13);
      arrowHead(c, 372, 296, 0, 13);
      label(c, '指に', 104, 110, 30);
      label(c, 'ついてくる', 104, 150, 30);
      label(c, '指の少し上', 530, 170, 26);
      label(c, 'に立つ', 530, 206, 26);
      dashed(c, 372, 236, 456, 190);
    },
    parrySp(c) {
      floor(c);
      const scene = (px) => {
        Art.zoneRing(c, P, px, 186, 58, 30, SQ, {});
        player(c, px - 8, 186, { pose: 'tackle', s: 0.62 });
        Art.burst(c, P, px + 42, 124, 30, 9, 0.2);
      };
      phone(c, 30, 4, 262, 274, () => {
        scene(130);
        finger(c, 104, 216, 0.72, -0.24);
        ripple(c, 234, 62, 28);
        finger(c, 234, 62, 0.72, 0.5);
      });
      phone(c, 348, 4, 262, 274, () => {
        scene(450);
        ripple(c, 480, 222, 28);
        finger(c, 480, 222, 0.72, 0.1);
      });
      arrowHead(c, 588, 210, Math.PI / 2, 13);
      arrowHead(c, 588, 172, -Math.PI / 2, 13);
      label(c, 'もう一方の指でタップ', 161, 310, 22);
      label(c, '離して触り直す', 479, 310, 22);
    },
    dash(c) {
      floor(c);
      const ax = 548;
      const ay = 296;
      c.save();
      c.strokeStyle = P.ink;
      c.lineWidth = 2.4;
      c.setLineDash([4, 10]);
      c.beginPath();
      c.ellipse(ax, ay, 262, 262 * SQ, 0, 0, TAU);
      c.stroke();
      c.restore();
      Art.zoneRing(c, P, ax, ay, 104, 62, SQ, {});
      player(c, ax, ay, { dir: -1, s: 0.86 });
      ojisan(c, 84, ay, { dir: 1, s: 0.86 });
      ojisan(c, 262, ay, { dir: 1, s: 0.86, pose: 'windup' });
      label(c, '!', 276, 96, 54, { stroke: P.spot });
      speedLines(c, 372, ay - 30, 1, 4, 44);
      ojisan(c, 422, ay, { dir: 1, s: 0.86, pose: 'charge', phase: 0.3 });
      label(c, 'ゆっくり', 92, 62, 26);
      label(c, '溜める', 250, 40, 26);
      label(c, 'ダッシュ!', 424, 62, 28);
    },
    ring(c, device) {
      floor(c);
      const cx = 280;
      const cy = 232;
      const outer = 176;
      const inner = 92;
      Art.zoneRing(c, P, cx, cy, outer, inner, SQ, { hot: true });
      player(c, cx, cy + 6, { s: 0.8, pose: 'idle' });
      speedLines(c, 486, cy - 10, -1, 3, 34);
      ojisan(c, 402, cy + 16, { pose: 'charge', phase: 0.3, s: 0.8 });
      Art.drawOjisan(c, ghost, { x: 576, y: cy + 16, dir: -1, s: 0.8, type: 'normal', pose: 'charge', phase: 0.2 });
      label(c, device === 'pc' ? 'ここでクリック' : 'ここでタッチ', 402, 40, 28, { stroke: P.spot });
      label(c, '外の輪 パリィ', 98, 62, 24);
      dashed(c, 98, 80, 138, 170, 2.6);
      label(c, '内の輪 ジャスト', 110, 308, 24);
      dashed(c, 150, 290, 214, 260, 2.6);
      label(c, '早いと空振り', 556, 102, 22);
    },
    hp(c) {
      floor(c);
      player(c, 240, 316, { pose: 'hurt' });
      Art.burst(c, P, 306, 192, 52, 10, 0.5);
      ojisan(c, 392, 316, { pose: 'charge', phase: 0.3 });
      label(c, 'ドンッ', 304, 192, 34, { font: FONT.manga, stroke: P.spot });
      label(c, '体幹', 548, 66, 26);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = i < 2 ? P.spot : '#FFFFFF';
        c.strokeStyle = P.ink;
        c.lineWidth = 3.4;
        Art.rrect(c, 482 + i * 46, 94, 38, 26, 7);
        c.fill();
        c.stroke();
      }
      label(c, 'ゼロで終わり', 546, 158, 22);
    },
    fly(c) {
      floor(c, false);
      // 左: ジャスト
      c.save();
      c.setLineDash([9, 10]);
      c.strokeStyle = P.ink;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(44, 300);
      c.quadraticCurveTo(70, 150, 214, 66);
      c.stroke();
      c.restore();
      Art.drawOjisan(c, P, { x: 112, y: 258, dir: -1, s: 0.54, type: 'normal', pose: 'fly', phase: 0.3, rot: 0.9, face: 'ko' });
      Art.star(c, P, 240, 62, 44, 0.3);
      Art.star(c, P, 190, 110, 16, 0);
      label(c, 'キラーン', 174, 164, 24, { font: FONT.manga });
      label(c, 'ジャスト', 160, 308, 28, { stroke: P.spot });
      Art.line(c, 320, 0, 320, H, 3, P.ink);
      // 右: パリィ
      speedLines(c, 420, 190, 1, 4, 62);
      Art.drawOjisan(c, P, { x: 486, y: 216, dir: -1, s: 0.72, type: 'normal', pose: 'fly', phase: 0.2, rot: 1.45, face: 'ko' });
      Art.crack(c, P.ink, W, 150, 110, 77, 1, 3);
      label(c, 'ガシャーン', 500, 62, 26, { font: FONT.manga });
      label(c, 'パリィ', 480, 308, 28, { stroke: P.spot });
    },
    chain(c) {
      floor(c);
      player(c, 86, 316, { pose: 'tackle', s: 0.84 });
      speedLines(c, 208, 214, 1, 3, 44);
      Art.drawOjisan(c, P, { x: 266, y: 258, dir: -1, s: 0.72, type: 'normal', pose: 'fly', phase: 0.2, rot: 1.35, face: 'ko' });
      Art.burst(c, P, 384, 194, 58, 11, 0.2);
      ojisan(c, 442, 316, { pose: 'recoil', face: 'shock', s: 0.84 });
      Art.drawOjisan(c, ghost, { x: 582, y: 316, dir: -1, s: 0.84, type: 'fast', pose: 'walk', phase: 0.1 });
      label(c, '2人抜き!', 420, 46, 40, { stroke: P.spot });
    },
    score(c) {
      floor(c);
      const ranks = Rules.COMBO_RANKS;
      const base = 300;
      const bw = 96;
      const gap = 16;
      const x0 = (W - ranks.length * bw - (ranks.length - 1) * gap) / 2;
      ranks.forEach((r, i) => {
        const mult = Rules.comboMult(r.at);
        const h = (mult - 0.4) * 96;
        const x = x0 + i * (bw + gap);
        c.fillStyle = i === ranks.length - 1 ? P.spot : P.tone;
        c.strokeStyle = P.ink;
        c.lineWidth = 3.4;
        c.fillRect(x, base - h, bw, h);
        c.strokeRect(x, base - h, bw, h);
        label(c, `×${mult.toFixed(1)}`, x + bw / 2, base - h / 2, 21, { stroke: i === ranks.length - 1 ? P.spot : P.tone, lw: 3 });
        label(c, r.name, x + bw / 2, base - h - 24, 21);
        label(c, `${r.at}`, x + bw / 2, base + 22, 20, { lw: 4 });
      });
      label(c, 'コンボ数と距離の倍率', 170, 40, 25);
    },
    upgrade(c) {
      floor(c);
      const last = Rules.STAGES.length - 1;
      const a = Rules.zonesFor(last);
      const b = Rules.zonesFor(last, { kata: 5 });
      const k = 0.85;
      Art.zoneRing(c, P, 150, 256, (Rules.CONTACT + a.parry) * k, (Rules.CONTACT + a.just) * k, SQ, {});
      player(c, 150, 256, { s: 0.78 });
      Art.zoneRing(c, P, 464, 256, (Rules.CONTACT + b.parry) * k, (Rules.CONTACT + b.just) * k, SQ, {});
      player(c, 464, 256, { s: 0.78, mass: 5 });
      arrowHead(c, 300, 182, 0, 22);
      Art.line(c, 256, 182, 290, 182, 8, P.ink);
      label(c, '¥', 272, 138, 36, { stroke: P.spot });
      label(c, '鍛える前', 150, 40, 25);
      label(c, '肩幅 最大', 464, 40, 25);
    },
    normal(c) {
      floor(c);
      const y = 96;
      const lines = Rules.LINES;
      const xs = lines.map((_, i) => 72 + i * ((W - 144) / (lines.length - 1)));
      Art.line(c, xs[0], y, xs[xs.length - 1], y, 7, P.ink);
      lines.forEach((l, i) => {
        const x = xs[i];
        const first = Rules.STAGES.findIndex((st) => st.line === i);
        Art.circle(c, x, y, 13, P.spot, P.ink, 4);
        label(c, l.short, x, y - 42, 22);
        const z = Rules.zonesFor(first);
        const k = 0.5;
        Art.zoneRing(c, P, x, 244, (Rules.CONTACT + z.parry) * k, (Rules.CONTACT + z.just) * k, SQ, {});
        Art.drawPlayer(c, P, { x, y: 256, dir: 1, s: 0.56, pose: 'idle', phase: 0.1, time: 0.5 });
      });
    },
    gimmick(c) {
      floor(c);
      const cast = [
        ['futo', 'よけても', '跳ね返る'],
        ['otaku', 'よけても', '曲がる'],
        ['hardhat', 'ジャスト', 'でないと×'],
        ['muscle', '溜めが長い', 'とても速い'],
      ];
      cast.forEach(([type, a, b], i) => {
        const x = 84 + i * 157;
        ojisan(c, x, 262, { type, dir: 1, s: 0.76 });
        label(c, Rules.TYPES[type].name.replace('おじさん', ''), x, 292, 20);
        label(c, a, x, 34, 18, { stroke: P.spot });
        label(c, b, x, 60, 18, { stroke: P.spot });
      });
    },
    shot(c) {
      floor(c);
      player(c, 96, 316, { pose: 'tackle', s: 0.84 });
      Art.burst(c, P, 196, 214, 40, 10, 0.3);
      Art.drawShot(c, P, { kind: 'kogoto', x: 300, y: 214, roll: 0 });
      Art.drawShot(c, P, { kind: 'ball', x: 300, y: 262, roll: 0 });
      dashed(c, 366, 226, 448, 226);
      arrowHead(c, 460, 226, 0, 14);
      ojisan(c, 546, 316, { type: 'sekkyo', pose: 'recoil', face: 'shock', s: 0.84 });
      label(c, '撃った本人に返る', 320, 44, 28, { stroke: P.spot });
    },
    endless(c) {
      floor(c);
      c.fillStyle = P.sign;
      c.strokeStyle = P.ink;
      c.lineWidth = 3.4;
      c.fillRect(26, 74, 310, 240);
      c.strokeRect(26, 74, 310, 240);
      label(c, 'ランキングの表示例', 181, 44, 21);
      const rows = [['1位', '35.20 km'], ['2位', '28.74 km'], ['3位', '19.05 km'], ['12位', '6.82 km']];
      rows.forEach(([rank, dist], i) => {
        const ry = 110 + i * 56;
        const me = i === 3;
        if (me) {
          c.fillStyle = P.spot;
          c.fillRect(30, ry - 26, 302, 52);
        }
        c.fillStyle = P.ink;
        c.textBaseline = 'middle';
        c.font = `25px ${FONT.display}`;
        c.textAlign = 'left';
        c.fillText(rank, 44, ry);
        c.textAlign = 'right';
        c.fillText(dist, 320, ry);
        if (me) {
          c.textAlign = 'left';
          c.font = `19px ${FONT.display}`;
          c.fillText('あなた', 118, ry);
        }
      });
      label(c, '体幹', 490, 48, 25);
      for (let i = 0; i < 3; i++) {
        c.fillStyle = P.spot;
        c.strokeStyle = P.ink;
        c.lineWidth = 3.4;
        Art.rrect(c, 424 + i * 46, 74, 38, 26, 7);
        c.fill();
        c.stroke();
      }
      ojisan(c, 412, 322, { dir: 1, s: 0.62, pose: 'charge', phase: 0.2 });
      ojisan(c, 490, 322, { dir: 1, s: 0.62 });
      ojisan(c, 568, 322, { dir: -1, s: 0.62, pose: 'charge', phase: 0.3, type: 'fast' });
      label(c, '力尽きるまで', 490, 138, 24, { stroke: P.spot });
    },
  };

  const SECTIONS = [
    {
      title: '操作',
      cards: [
        {
          art: { pc: 'movePc', sp: 'moveSp' },
          title: '動く',
          text: {
            pc: 'カーソルを動かすと、自分がすぐについてきます。矢印キーやWASDキーでも動けます。EscキーかPキーで一時停止します。',
            sp: '画面に指を置いて動かすと、自分がついてきます。指で隠れないよう、自分は指の少し上に立ちます。',
          },
        },
        {
          art: { pc: 'parryPc', sp: 'parrySp' },
          title: '体当たりする',
          text: {
            pc: 'クリックかスペースキーで体当たりします。押した瞬間に判定します。',
            sp: '画面に触れた瞬間が体当たりです。もう一方の指でタップするか、指を離して触り直します。',
          },
        },
      ],
    },
    {
      title: 'ルール',
      cards: [
        {
          art: 'dash',
          title: 'おじさんの動き',
          text: 'ゆっくり近づいてきて、点線の範囲に入ると「!」で溜めたあと、まっすぐダッシュしてきます。線上からよければ当たりません。',
        },
        {
          art: 'ring',
          title: '輪に入った瞬間にはじく',
          text: {
            pc: '突っ込んでくるおじさんが外の輪に入っていれば「パリィ」、内の輪なら「ジャスト」です。輪に入る前にクリックすると空振りで、少しの間は体当たりできません。',
            sp: '突っ込んでくるおじさんが外の輪に入っていれば「パリィ」、内の輪なら「ジャスト」です。輪に入る前にタッチすると空振りで、少しの間は体当たりできません。',
          },
        },
        {
          art: 'hp',
          title: '体幹',
          text: 'おじさんに当たると体幹が1つ減ります。なくなると終わりです。当たるか空振りするとコンボも切れます。',
        },
        {
          art: 'fly',
          title: '飛び方',
          text: 'ジャストは空へ飛んで「キラーン」、手前に飛ぶと画面にぶつかります。パリィは床すれすれに画面の端まで飛びます。',
        },
        {
          art: 'chain',
          title: '巻き込み',
          text: '飛んでいくおじさんに当たったおじさんも、一緒に飛びます。同時に輪に入った相手は、1回でまとめてはじけます。',
        },
        {
          art: 'score',
          title: '距離とコンボ',
          text: 'ぶっとばした距離がスコアです。続けて成功するとコンボが増え、段位が上がり、距離の倍率も上がります。',
        },
        {
          art: 'upgrade',
          title: '鍛える',
          text: '距離1mにつき1円のバスター手当が貯まります。肩幅で外の輪、反射神経で内の輪が広がります。体幹は受けられる回数、脚力は空振りの硬直に効きます。',
        },
      ],
    },
    {
      title: '仕掛けのあるおじさん',
      cards: [
        {
          art: 'gimmick',
          title: 'いろいろな動き',
          text: '止まる、消える、通り過ぎて戻る、集団で来るなど、おじさんごとに動きが違います。初めて出会ったときに画面でヒントが出ます。図鑑でも読み返せます。',
        },
        {
          art: 'shot',
          title: '飛び道具をはじく',
          text: '小言やゴルフボールを飛ばしてくるおじさんがいます。おじさんと同じように輪の中ではじくと本人に返り、離れた場所からぶっとばせます。',
        },
      ],
    },
    {
      title: 'モード',
      cards: [
        {
          art: 'normal',
          title: '通常モード',
          text: '全5ステージで、ステージごとに場所が変わります。1ステージは3〜5のエリアでできていて、進むほど輪が小さくなります。決まった人数をぶっとばすとボスが来て、ボスを飛ばすと次のエリアへ進みます。',
        },
        {
          art: 'endless',
          title: 'エンドレスモード',
          text: '体幹は鍛えていても3で固定です。10人ごとにレベルが上がって輪が小さくなり、5レベルごとにボスが来ます。力尽きるまでの距離でランキングを競います。',
        },
      ],
    },
  ];

  const pick = (v, device) => (typeof v === 'string' ? v : v[device]);

  function render(grid, device) {
    grid.textContent = '';
    let no = 0;
    for (const section of SECTIONS) {
      const head = document.createElement('h3');
      head.className = 'guide-section';
      head.textContent = section.title;
      grid.appendChild(head);
      const list = document.createElement('div');
      list.className = 'guide-grid';
      for (const card of section.cards) {
        no++;
        const el = document.createElement('article');
        el.className = 'guide-card';
        const cv = document.createElement('canvas');
        cv.width = W * RATIO;
        cv.height = H * RATIO;
        cv.setAttribute('aria-hidden', 'true');
        const title = document.createElement('h4');
        title.textContent = `${no}. ${card.title}`;
        const text = document.createElement('p');
        text.textContent = pick(card.text, device);
        el.append(cv, title, text);
        list.appendChild(el);
        const c = cv.getContext('2d');
        c.scale(RATIO, RATIO);
        c.lineCap = 'round';
        c.lineJoin = 'round';
        ART[pick(card.art, device)](c, device);
      }
      grid.appendChild(list);
    }
    const note = document.createElement('p');
    note.className = 'guide-note';
    note.textContent = 'このゲームはフィクションで、実在の人物や団体とは関係ありません。現実では体当たりせず、困ったときは駅員や警察に相談してください。';
    grid.appendChild(note);
  }

  // イラストの文字。読み込み前に描くと別の書体になるので、先に読み込む。
  const GLYPHS = 'ついてくるクリックまたはスペース体当たり!指に少し上立つもう一方でタップ離して触り直すゆっくり溜めるダッシュここタッチ外の輪パリィ内ジャスト早いと空振りドンッ幹ゼロ終わりキラーンガシャーン2人抜きコンボ数距離倍率普通快速急行特急新幹線鍛え前肩幅最大ランキング表示例位あなた力尽きるまでよけても跳ね返曲がでないと×溜めが長いとても速撃った本人に返ふとっちょオタクくん現場筋トレホーム商店街電気オフィス横丁0123456789.×¥km';

  function preload() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      document.fonts.load(`20px "Dela Gothic One"`, GLYPHS),
      document.fonts.load(`20px "Reggae One"`, GLYPHS),
    ]).catch(() => {});
  }

  return { render, preload };
})();
