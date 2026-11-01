'use strict';
// 絵はすべて Canvas の図形で描く。色は時間帯ごとのパレットから取り、紙とインクの 2 色刷りに見せる。
// 点字ブロックの黄色（spot）だけは全ステージで同じ。
const Art = (() => {
  const TAU = Math.PI * 2;
  const JP = '"Yu Gothic UI","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  const FONT = {
    display: `"Dela Gothic One",${JP}`,
    manga: `"Reggae One",${JP}`,
    ui: `"Zen Kaku Gothic New",${JP}`,
  };

  function rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    const A = rgb(a);
    const B = rgb(b);
    return `#${A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
  }

  function palette(paper, ink, tone, o = {}) {
    return {
      paper, ink, tone,
      spot: '#FFD200',
      ink2: mix(ink, paper, 0.28),
      line: mix(paper, ink, 0.3),
      deep: mix(tone, ink, 0.24),
      floor: o.floor || mix(paper, '#ffffff', 0.45),
      skin: o.skin || mix(paper, '#ffffff', 0.5),
      feat: o.feat || ink, // 顔の線。夜は肌が明るいので暗くする
      sign: o.sign || mix(paper, '#ffffff', 0.7),
      signInk: o.signInk || ink,
      band: o.band || ink, // 帯とメインボタンの地。夜でも暗いままにして黄色を読めるようにする
      bandText: o.bandText || paper,
    };
  }

  function nightPalette(paper, ink, tone) {
    return {
      ...palette(paper, ink, tone, {
        floor: mix(paper, ink, 0.07),
        skin: mix(ink, tone, 0.14),
        feat: paper,
        sign: ink,
        signInk: paper,
        band: mix(paper, '#000000', 0.55),
        bandText: ink,
      }),
      night: true,
    };
  }

  // Rules.STAGES と同じ並び。ステージの中で時間帯が進むように色を変える。
  const PALETTES = [
    // 駅のホーム
    palette('#E4EFF3', '#10184A', '#B4CEDB'),
    palette('#DCF1DA', '#0F3A30', '#A8D6AE'),
    palette('#FFCBA6', '#3A0F2B', '#F4A374'),
    nightPalette('#14163C', '#EDF2FF', '#2B2F6B'),
    // 商店街
    palette('#FBE6D8', '#4A1530', '#F2B8A0'),
    palette('#FFF0C2', '#5A2A00', '#F5C97A'),
    palette('#FFD9E2', '#5C0F3A', '#F5A3BC'),
    palette('#D8C7F0', '#2B1454', '#B39ADF'),
    // 電気街
    palette('#E6E3FF', '#1E1466', '#BDB6F5'),
    palette('#DFF7FF', '#063A5C', '#A5E3F5'),
    palette('#FFE3F6', '#560A52', '#F7AEE3'),
    nightPalette('#170F3D', '#F5EEFF', '#3A2A85'),
    nightPalette('#0D2233', '#E6FBFF', '#1C4A63'),
    // オフィス街
    palette('#E9ECEF', '#20262E', '#C3CAD2'),
    palette('#DDEAF5', '#12304D', '#A9C6DE'),
    nightPalette('#101B2B', '#E8F0FA', '#27405F'),
    // 飲み屋横丁
    palette('#FFD7B5', '#4A1A05', '#F5A76C'),
    nightPalette('#2A0E12', '#FFEBD6', '#5C2228'),
    nightPalette('#1E0A1F', '#FDE8F0', '#4A1E4C'),
    nightPalette('#101028', '#EEF0FF', '#2B2B60'),
    palette('#FFE3C9', '#3D2340', '#F7BFA6'),
  ];

  function negative(P) {
    return {
      ...P,
      paper: P.ink, ink: P.paper, tone: P.ink, ink2: P.paper, line: P.paper, deep: P.ink,
      floor: P.ink, skin: P.ink, feat: P.paper, sign: P.ink, signInk: P.paper,
    };
  }

  function silhouette(P) {
    const k = P.ink;
    return { ...P, paper: k, tone: k, spot: k, ink2: k, line: k, deep: k, skin: k, feat: k, sign: k };
  }

  function stroke2(c, x0, y0, x1, y1, x2, y2, w, col) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  function circle(c, x, y, r, fill, stroke, lw) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = lw || 2;
      c.stroke();
    }
  }

  function line(c, x0, y0, x1, y1, w, col) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }

  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // 太もも th、ひざの曲げ bend。0 が真下で、プラスが前。
  function drawLeg(c, col, hx, hy, th, bend, width = 17) {
    const kx = hx + 38 * Math.sin(th);
    const ky = hy + 38 * Math.cos(th);
    const a = th - bend;
    const fx = kx + 38 * Math.sin(a);
    const fy = ky + 38 * Math.cos(a);
    stroke2(c, hx, hy, kx, ky, fx, fy, width, col);
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(fx + 9, fy + 2, 17, 8, 0, 0, TAU);
    c.fill();
  }

  function armPts(sx, sy, phi, bend, len = 26) {
    const ex = sx + len * Math.sin(phi);
    const ey = sy + len * Math.cos(phi);
    const a = phi + bend;
    return { sx, sy, ex, ey, hx: ex + len * Math.sin(a), hy: ey + len * Math.cos(a) };
  }

  function gaitBend(ph, a) {
    return a * (0.2 + 1.2 * Math.max(0, Math.cos(ph)));
  }

  // ---- おじさん ----
  // outfit は服、hair は髪や帽子、acc は持ち物。指定がなければスーツ姿になる。
  const BODY = {
    normal: { belly: 0.75, hair: 'barcode', glasses: true, stache: true, acc: 'case' },
    fast: { belly: 0.1, hair: 'side', glasses: true, acc: 'none', sweat: true },
    phone: { belly: 0.5, hair: 'bald', stache: true, acc: 'phone' },
    umbrella: { belly: 0.45, hair: 'side', stache: true, acc: 'umbrella' },
    feint: { belly: 0.3, hair: 'slick', shades: true, acc: 'none' },
    heavy: { belly: 1.25, hair: 'barcode', glasses: true, stache: true, acc: 'pack' },
    weave: { belly: 0.85, hair: 'bald', acc: 'box', headTie: true, flush: true },
    futo: { belly: 2.1, hair: 'side', stache: true, acc: 'none', sweat: true, flush: true, outfit: 'polo' },
    duo: { belly: 0.4, hair: 'side', glasses: true, acc: 'lanyard' },
    nidomi: { belly: 0.5, hair: 'barcode', stache: true, acc: 'case', bigEyes: true, outfit: 'polo' },
    line: { belly: 0.35, hair: 'bald', glasses: true, acc: 'lanyard', outfit: 'gray' },
    bike: { belly: 0.6, hair: 'cap', glasses: true, acc: 'bike', outfit: 'polo' },
    otaku: { belly: 0.8, hair: 'bandana', glasses: true, acc: 'pack', bag: true, outfit: 'check' },
    stealth: { belly: 0.1, hair: 'side', acc: 'none', outfit: 'gray' },
    warp: { belly: 0.35, hair: 'slick', stache: true, acc: 'none', hat: true },
    regent: { belly: 0.3, hair: 'regent', shades: true, acc: 'none', outfit: 'gray' },
    sekkyo: { belly: 0.85, hair: 'barcode', glasses: true, stache: true, acc: 'point' },
    golfer: { belly: 0.8, hair: 'cap', acc: 'golf', outfit: 'polo' },
    hardhat: { belly: 0.5, hair: 'helmet', stache: true, acc: 'none', outfit: 'work' },
    muscle: { belly: 0, hair: 'bald', stache: true, acc: 'none', outfit: 'tank', thick: true },
    kakaricho: { belly: 0.9, hair: 'barcode', glasses: true, stache: true, acc: 'case', brows: 1.2 },
    kacho: { belly: 1.1, hair: 'slick', glasses: true, acc: 'case', brows: 1.4, badge: true },
    bucho: { belly: 1.4, hair: 'slick', glasses: true, stache: true, acc: 'golf', brows: 1.6, badge: true },
    kaicho: { belly: 1.6, hair: 'bald', stache: true, acc: 'cane', brows: 2, badge: true, sash: true, beard: true },
    tencho: { belly: 1.3, hair: 'barcode', stache: true, acc: 'none', outfit: 'apron', brows: 1.4 },
    kumiai: { belly: 1.4, hair: 'slick', glasses: true, acc: 'none', outfit: 'happi', brows: 1.5 },
    kosan: { belly: 1.2, hair: 'bandana', glasses: true, acc: 'pack', bag: true, outfit: 'check', brows: 1.4, beard: true },
    tetsuya: { belly: 0.4, hair: 'messy', glasses: true, acc: 'none', outfit: 'check', tired: true },
    senmu: { belly: 1.2, hair: 'slick', glasses: true, stache: true, acc: 'case', brows: 1.7, badge: true },
    shacho: { belly: 1.5, hair: 'bald', shades: true, stache: true, acc: 'none', brows: 1.8, badge: true, sash: true },
    taisho: { belly: 1.6, hair: 'bald', acc: 'none', outfit: 'happi', headTie: true, flush: true, brows: 1.6 },
    daio: { belly: 2, hair: 'regent', shades: true, stache: true, beard: true, acc: 'none', outfit: 'happi', badge: true, sash: true, brows: 2, crown: true },
  };

  const POSE = {
    walk(ph) {
      const a = 0.5;
      return {
        lean: 0.07, bob: Math.abs(Math.sin(ph)) * 4, head: 0,
        nTh: a * Math.sin(ph), nB: gaitBend(ph, a),
        fTh: a * Math.sin(ph + Math.PI), fB: gaitBend(ph + Math.PI, a),
        near: [-0.45 * Math.sin(ph) + 0.1, 0.5], far: [0.45 * Math.sin(ph) + 0.05, 0.45],
        face: 'angry',
      };
    },
    phone(ph) {
      const a = 0.36;
      return {
        lean: 0.1, bob: Math.abs(Math.sin(ph)) * 3, head: 0.24,
        nTh: a * Math.sin(ph), nB: gaitBend(ph, a),
        fTh: a * Math.sin(ph + Math.PI), fB: gaitBend(ph + Math.PI, a),
        near: [0.75, 1.35], far: [0.3 * Math.sin(ph), 0.4],
        face: 'down',
      };
    },
    charge(ph) {
      const a = 0.95;
      return {
        lean: 0.5, bob: Math.abs(Math.sin(ph)) * 7, head: 0,
        nTh: a * Math.sin(ph), nB: gaitBend(ph, a),
        fTh: a * Math.sin(ph + Math.PI), fB: gaitBend(ph + Math.PI, a),
        near: [1.25, 2.25], far: [-1.2, 0.35],
        face: 'rage', shoulder: true,
      };
    },
    taunt() {
      return {
        lean: -0.1, bob: 0, head: -0.08,
        nTh: 0.25, nB: 0.1, fTh: -0.22, fB: 0.08,
        near: [-0.7, 1.7], far: [0.5, 2.5],
        face: 'smug',
      };
    },
    windup() {
      return {
        lean: -0.3, bob: -6, head: 0.1,
        nTh: 0.42, nB: 0.7, fTh: -0.3, fB: 0.45,
        near: [-0.9, 0.7], far: [-1.25, 0.4],
        face: 'rage',
      };
    },
    recoil() {
      return {
        lean: -0.42, bob: 0, head: 0,
        nTh: 0.55, nB: 0.2, fTh: 0.1, fB: 0.5,
        near: [1.7, 0.1], far: [1.2, 0.3],
        face: 'shock',
      };
    },
    fly(ph) {
      return {
        lean: 0, bob: 0, head: 0,
        nTh: 0.95 + 0.2 * Math.sin(ph * 3), nB: 0.7, fTh: -0.85, fB: 0.9,
        near: [2.5, 0.2], far: [-2.3, -0.2],
        face: 'ko',
      };
    },
  };

  function ojisanHair(c, P, b) {
    const ink = P.ink;
    const feat = P.feat;
    switch (b.hair) {
      case 'barcode':
        c.strokeStyle = feat;
        c.lineWidth = 2.2;
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.moveTo(-19, -8 - i * 3.5);
          c.quadraticCurveTo(-2, -29 - i * 1.5, 17, -17 - i * 1.2);
          c.stroke();
        }
        break;
      case 'slick':
        c.fillStyle = ink === feat ? ink : feat;
        c.beginPath();
        c.moveTo(-21, -2);
        c.bezierCurveTo(-25, -38, 24, -40, 25, -12);
        c.quadraticCurveTo(8, -21, -8, -14);
        c.closePath();
        c.fill();
        break;
      case 'side':
        c.fillStyle = feat;
        c.beginPath();
        c.moveTo(-21, 0);
        c.bezierCurveTo(-24, -26, -6, -32, 4, -27);
        c.quadraticCurveTo(-8, -20, -12, -4);
        c.closePath();
        c.fill();
        break;
      case 'messy':
        c.fillStyle = feat;
        c.beginPath();
        c.moveTo(-22, 2);
        c.lineTo(-27, -14);
        c.lineTo(-17, -16);
        c.lineTo(-20, -30);
        c.lineTo(-7, -24);
        c.lineTo(-3, -36);
        c.lineTo(7, -25);
        c.lineTo(17, -32);
        c.lineTo(17, -19);
        c.lineTo(27, -18);
        c.lineTo(20, -8);
        c.quadraticCurveTo(4, -18, -10, -10);
        c.closePath();
        c.fill();
        break;
      case 'regent':
        // 前に突き出した大きなリーゼント
        c.fillStyle = feat;
        c.beginPath();
        c.moveTo(-21, 0);
        c.bezierCurveTo(-26, -30, -4, -36, 12, -36);
        c.bezierCurveTo(30, -38, 46, -30, 44, -20);
        c.bezierCurveTo(42, -12, 26, -14, 20, -13);
        c.quadraticCurveTo(4, -18, -9, -10);
        c.closePath();
        c.fill();
        c.strokeStyle = P.skin;
        c.lineWidth = 1.8;
        c.beginPath();
        c.moveTo(-6, -28);
        c.quadraticCurveTo(16, -34, 38, -24);
        c.stroke();
        break;
      case 'bandana':
        c.fillStyle = feat;
        c.beginPath();
        c.moveTo(-21, 0);
        c.bezierCurveTo(-24, -20, -10, -30, 6, -28);
        c.lineTo(-10, -6);
        c.closePath();
        c.fill();
        c.fillStyle = P.spot;
        c.strokeStyle = feat;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-21, -13);
        c.quadraticCurveTo(0, -24, 22, -15);
        c.lineTo(22, -7);
        c.quadraticCurveTo(0, -15, -21, -5);
        c.closePath();
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(-20, -9);
        c.lineTo(-34, -13);
        c.lineTo(-30, -2);
        c.closePath();
        c.fill();
        c.stroke();
        break;
      case 'helmet':
        c.fillStyle = P.spot;
        c.strokeStyle = feat;
        c.lineWidth = 2.6;
        c.beginPath();
        c.moveTo(-25, -9);
        c.bezierCurveTo(-25, -38, 24, -38, 25, -10);
        c.closePath();
        c.fill();
        c.stroke();
        rrect(c, -29, -12, 62, 7, 3);
        c.fill();
        c.stroke();
        line(c, 0, -32, 0, -13, 5, feat);
        break;
      case 'cap':
        c.fillStyle = P.tone;
        c.strokeStyle = feat;
        c.lineWidth = 2.6;
        c.beginPath();
        c.moveTo(-22, -10);
        c.bezierCurveTo(-22, -34, 20, -34, 22, -12);
        c.closePath();
        c.fill();
        c.stroke();
        rrect(c, 12, -15, 26, 6, 3);
        c.fillStyle = feat;
        c.fill();
        break;
      default:
        c.strokeStyle = feat;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(2, -8, 14, -2.3, -1.3);
        c.stroke();
    }
    if (b.hat) {
      c.fillStyle = feat;
      rrect(c, -30, -22, 62, 6, 3);
      c.fill();
      rrect(c, -18, -44, 38, 24, 5);
      c.fill();
      c.fillStyle = P.spot;
      c.fillRect(-18, -28, 38, 6);
    }
    if (b.crown) {
      c.fillStyle = P.spot;
      c.strokeStyle = feat;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(-18, -32);
      c.lineTo(-22, -54);
      c.lineTo(-8, -42);
      c.lineTo(1, -58);
      c.lineTo(10, -42);
      c.lineTo(24, -54);
      c.lineTo(20, -32);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  function ojisanHead(c, P, b, rawFace) {
    const ink = P.ink;
    const feat = P.feat;
    const face = b.bigEyes && (rawFace === 'angry' || rawFace === 'rage') ? 'shock' : rawFace;
    if (b.hair !== 'bald' && b.hair !== 'helmet') {
      c.fillStyle = ink;
      c.beginPath();
      c.ellipse(-17, 3, 8, 13, 0.25, 0, TAU);
      c.fill();
    }
    // あごの張った顔
    c.beginPath();
    c.moveTo(-20, -6);
    c.bezierCurveTo(-22, -32, 20, -34, 22, -8);
    c.lineTo(23, 10);
    c.bezierCurveTo(22, 26, -8, 29, -14, 18);
    c.bezierCurveTo(-19, 12, -20, 4, -20, -6);
    c.closePath();
    c.fillStyle = P.skin;
    c.fill();
    c.strokeStyle = feat;
    c.lineWidth = 3;
    c.stroke();

    c.beginPath();
    c.ellipse(-8, 3, 5, 7, 0, 0, TAU);
    c.fillStyle = P.skin;
    c.fill();
    c.strokeStyle = feat;
    c.lineWidth = 2.2;
    c.stroke();

    const browW = 4.5 * (b.brows || 1);
    if (face === 'shock') {
      circle(c, 13, -4, 7, P.skin, feat, 2.4);
      circle(c, 15, -4, 1.8, feat);
    } else if (face === 'ko') {
      line(c, 8, -9, 18, 1, 3, feat);
      line(c, 18, -9, 8, 1, 3, feat);
    } else if (face === 'down') {
      c.strokeStyle = feat;
      c.lineWidth = 2.6;
      c.beginPath();
      c.arc(14, -3, 5, 0.3, Math.PI - 0.3);
      c.stroke();
      line(c, 7, -9, 19, -7, browW * 0.7, feat);
    } else if (face === 'smug') {
      line(c, 6, -7, 20, -7, 3, feat);
      circle(c, 14, -3.5, 2.4, feat);
      line(c, 5, -14, 19, -13, browW * 0.8, feat);
    } else {
      const steep = face === 'rage' ? 8 : 5;
      line(c, 5, -13, 20, -13 + steep, browW, feat);
      circle(c, 14, -2, 2.8, feat);
    }
    if (b.tired) {
      c.strokeStyle = feat;
      c.lineWidth = 1.8;
      c.beginPath();
      c.arc(14, 2, 6, 0.4, Math.PI - 0.4);
      c.stroke();
    }
    if (face === 'rage') {
      // 怒りじるし
      c.strokeStyle = feat;
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(-4, -20);
      c.lineTo(0, -16);
      c.lineTo(-5, -14);
      c.moveTo(3, -22);
      c.lineTo(2, -17);
      c.lineTo(7, -18);
      c.stroke();
    }

    if (b.shades && face !== 'ko' && face !== 'shock') {
      c.fillStyle = feat;
      rrect(c, 4, -10, 20, 12, 4);
      c.fill();
      line(c, 4, -6, -7, -2, 2.2, feat);
    } else if (b.glasses) {
      c.strokeStyle = feat;
      c.lineWidth = 2.2;
      rrect(c, 5, -11, 18, 14, 4);
      c.stroke();
      line(c, 5, -6, -7, -2, 2.2, feat);
    }

    if (b.flush) {
      c.strokeStyle = feat;
      c.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) line(c, 2 + i * 4, 8, 0 + i * 4, 12, 1.6, feat);
    }

    // 大きな鼻
    c.beginPath();
    c.ellipse(24, 4, 8, 7, 0, 0, TAU);
    c.fillStyle = P.skin;
    c.fill();
    c.strokeStyle = feat;
    c.lineWidth = 2.6;
    c.stroke();

    if (b.stache) {
      c.strokeStyle = feat;
      c.lineWidth = b.beard ? 7 : 5;
      c.beginPath();
      c.moveTo(8, 12);
      c.quadraticCurveTo(18, 8, 27, 12);
      c.stroke();
    }
    if (b.beard) {
      c.fillStyle = feat;
      c.beginPath();
      c.moveTo(-6, 16);
      c.quadraticCurveTo(8, 42, 24, 16);
      c.closePath();
      c.fill();
    }
    if (face === 'shock' || face === 'ko') {
      c.beginPath();
      c.ellipse(13, 19, 7, 6, 0, 0, TAU);
      c.fillStyle = feat;
      c.fill();
    } else if (face === 'smug') {
      c.strokeStyle = feat;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(8, 18);
      c.quadraticCurveTo(16, 20, 22, 14);
      c.stroke();
    } else if (!b.beard) {
      line(c, 8, 19, 20, 17, 2.6, feat);
    }

    ojisanHair(c, P, b);

    if (b.headTie) {
      c.fillStyle = P.spot;
      c.strokeStyle = feat;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-20, -15);
      c.lineTo(20, -22);
      c.lineTo(21, -15);
      c.lineTo(-20, -8);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(-19, -12);
      c.lineTo(-36, -4);
      c.lineTo(-30, 8);
      c.lineTo(-17, -6);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  // 袖の色が服によって変わる腕
  function drawArm(c, P, arm, width, fill) {
    if (fill === P.ink || fill === P.ink2) {
      stroke2(c, arm.sx, arm.sy, arm.ex, arm.ey, arm.hx, arm.hy, width, fill);
    } else {
      stroke2(c, arm.sx, arm.sy, arm.ex, arm.ey, arm.hx, arm.hy, width + 4, P.feat === P.ink ? P.ink : P.paper);
      stroke2(c, arm.sx, arm.sy, arm.ex, arm.ey, arm.hx, arm.hy, width, fill);
    }
  }

  // 服の色。夜の配色では tone や deep が床に溶けるので、明るい色に替える
  function outfitFill(P, outfit) {
    const soft = P.night ? P.ink2 : P.tone;
    return { suit: P.ink, gray: P.ink2, check: soft, polo: P.sign, work: soft, tank: P.skin, apron: P.sign, happi: P.night ? P.ink2 : P.deep }[outfit];
  }

  function drawOutfit(c, P, b, torso) {
    const belly = b.belly;
    const outline = P.feat === P.ink ? P.ink : P.paper;
    const outfit = b.outfit || 'suit';
    c.fillStyle = outfitFill(P, outfit);
    c.fill(torso);
    if (outfit === 'suit' || outfit === 'gray') {
      // シャツとネクタイ
      c.fillStyle = P.skin;
      c.beginPath();
      c.moveTo(4, -63);
      c.lineTo(16, -60);
      c.lineTo(15 + 9 * belly, -28);
      c.closePath();
      c.fill();
      c.fillStyle = b.sash || b.badge ? P.spot : P.feat;
      c.beginPath();
      c.moveTo(11, -60);
      c.lineTo(15, -60);
      c.lineTo(17 + 9 * belly, -32);
      c.lineTo(13 + 8 * belly, -30);
      c.closePath();
      c.fill();
      line(c, -18, 5, 16 + 6 * belly, 5, 2, P.paper);
      return;
    }
    c.save();
    c.clip(torso);
    if (outfit === 'check') {
      c.strokeStyle = outline;
      c.lineWidth = 1.8;
      c.beginPath();
      for (let x = -40; x < 70; x += 11) {
        c.moveTo(x, -70);
        c.lineTo(x, 12);
      }
      for (let y = -66; y < 12; y += 11) {
        c.moveTo(-40, y);
        c.lineTo(70, y);
      }
      c.stroke();
    } else if (outfit === 'work') {
      c.fillStyle = P.spot;
      c.fillRect(-40, -44, 110, 8);
      c.fillRect(-40, -20, 110, 8);
    } else if (outfit === 'apron') {
      c.fillStyle = P.spot;
      c.fillRect(2, -46, 60, 60);
      line(c, 6, -46, 12, -68, 3, outline);
    } else if (outfit === 'happi') {
      c.fillStyle = P.sign;
      c.beginPath();
      c.moveTo(2, -66);
      c.lineTo(14, -66);
      c.lineTo(28 + 10 * belly, 12);
      c.lineTo(14 + 8 * belly, 12);
      c.closePath();
      c.fill();
    } else if (outfit === 'polo') {
      c.fillStyle = P.tone;
      c.fillRect(-40, -66, 110, 8);
    } else if (outfit === 'tank') {
      c.fillStyle = P.spot;
      c.fillRect(-40, -44, 110, 60);
      line(c, 8, -44, 9, -24, 2, outline);
    }
    c.restore();
    c.strokeStyle = outline;
    c.lineWidth = 3;
    c.stroke(torso);
    if (b.badge) circle(c, -1, -44, 3.6, P.spot, P.paper, 1.4);
  }

  function drawBicycle(c, P, phase) {
    // 車輪は床の上に描くので、夜の配色でも見える色にする
    const outline = P.ink;
    for (const x of [-42, 44]) {
      circle(c, x, -24, 23, null, outline, 4);
      circle(c, x, -24, 3, outline);
      const a = phase * TAU * 2;
      line(c, x + Math.cos(a) * 20, -24 + Math.sin(a) * 20, x - Math.cos(a) * 20, -24 - Math.sin(a) * 20, 1.6, outline);
    }
    c.strokeStyle = P.spot;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(-42, -24);
    c.lineTo(-8, -66);
    c.lineTo(32, -66);
    c.lineTo(44, -24);
    c.moveTo(-8, -66);
    c.lineTo(2, -24);
    c.lineTo(-42, -24);
    c.moveTo(2, -24);
    c.lineTo(32, -66);
    c.stroke();
    line(c, 32, -66, 28, -82, 4.6, outline);
    line(c, 20, -84, 38, -82, 5, outline);
    line(c, -16, -72, 2, -72, 6, outline);
  }

  function drawOjisan(c, P, a) {
    const b = BODY[a.type] || BODY.normal;
    const pose = a.pose === 'walk' && a.type === 'phone' ? POSE.phone : POSE[a.pose] || POSE.walk;
    const ph = (a.phase || 0) * TAU;
    const g = pose(ph);
    const face = a.face || g.face;
    const belly = b.belly;
    const riding = b.acc === 'bike' && a.pose !== 'fly';
    c.save();
    c.translate(a.x, a.y);
    c.scale((a.dir || 1) * a.s, a.s);
    if (a.rot) {
      c.translate(0, -85);
      c.rotate(a.rot);
      c.translate(0, 85);
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (riding) {
      drawBicycle(c, P, a.phase || 0);
      // 自転車に乗っている間は、ペダルをこぐ足にする
      g.bob = 28;
      g.lean = Math.max(g.lean, 0.3);
      g.nTh = 0.75 + 0.35 * Math.sin(ph);
      g.nB = 1.25;
      g.fTh = 0.75 - 0.35 * Math.sin(ph);
      g.fB = 1.25;
      g.near = [1.05, 0.3];
      g.far = [1.1, 0.3];
    }
    const hipY = -76 - g.bob;
    const outline = P.feat === P.ink ? P.ink : P.paper;
    drawLeg(c, P.ink2, -3, hipY, g.fTh, g.fB);
    drawLeg(c, P.ink, 3, hipY, g.nTh, g.nB);

    c.save();
    c.translate(0, hipY);
    c.rotate(g.lean);

    const outfit = b.outfit || 'suit';
    const sleeve = outfitFill(P, outfit);
    const armW = b.thick ? 19 : 13;

    // 奥の腕と、奥の手に持つもの
    const far = armPts(-2, -54, g.far[0], g.far[1]);
    if (b.acc === 'pack') {
      c.fillStyle = P.night ? P.ink2 : P.tone;
      c.strokeStyle = outline;
      c.lineWidth = 3;
      rrect(c, -50, -66, 34, 62, 12);
      c.fill();
      c.stroke();
      line(c, -44, -44, -22, -44, 2.4, outline);
    }
    drawArm(c, P, far, armW, sleeve === P.ink ? P.ink2 : sleeve);
    if (b.acc === 'case' && a.pose !== 'fly') {
      c.fillStyle = P.ink2;
      rrect(c, far.hx - 17, far.hy + 3, 34, 24, 3);
      c.fill();
      line(c, far.hx - 6, far.hy + 3, far.hx + 6, far.hy + 3, 3, P.ink2);
    } else if (b.acc === 'box' && a.pose !== 'fly') {
      c.fillStyle = P.skin;
      c.strokeStyle = P.feat;
      c.lineWidth = 2.4;
      c.fillRect(far.hx - 13, far.hy + 5, 26, 15);
      c.strokeRect(far.hx - 13, far.hy + 5, 26, 15);
      line(c, far.hx, far.hy, far.hx, far.hy + 5, 2, P.ink2);
      line(c, far.hx - 13, far.hy + 12, far.hx + 13, far.hy + 12, 1.6, P.feat);
    } else if (b.acc === 'golf') {
      line(c, far.hx, far.hy, far.hx - 34, far.hy + 46, 3.2, P.ink2);
      c.fillStyle = P.ink2;
      c.fillRect(far.hx - 44, far.hy + 42, 14, 8);
    }
    if (b.bag && a.pose !== 'fly') {
      // 紙袋
      c.fillStyle = P.sign;
      c.strokeStyle = outline;
      c.lineWidth = 2.4;
      c.fillRect(far.hx - 14, far.hy + 9, 28, 30);
      c.strokeRect(far.hx - 14, far.hy + 9, 28, 30);
      line(c, far.hx - 6, far.hy + 9, far.hx, far.hy, 2, outline);
      line(c, far.hx + 6, far.hy + 9, far.hx, far.hy, 2, outline);
      circle(c, far.hx, far.hy + 24, 6, P.spot, outline, 1.6);
    }
    circle(c, far.hx, far.hy, 6.5, P.skin, P.feat, 2.2);

    // 胴体
    const torso = new Path2D();
    const wide = b.thick ? 7 : 0;
    torso.moveTo(-19, 8);
    torso.bezierCurveTo(-25, -18, -23 - wide, -46, -15 - wide, -62);
    torso.quadraticCurveTo(0, -68, 15 + wide, -61);
    torso.bezierCurveTo(20 + 10 * belly + wide, -48, 26 + 16 * belly, -20, 18 + 6 * belly, 8);
    torso.closePath();
    drawOutfit(c, P, b, torso);
    if ((b.outfit || 'suit') === 'suit' && b.badge) circle(c, -1, -44, 3.6, P.spot, P.paper, 1.4);
    if (b.sash) {
      c.strokeStyle = P.spot;
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(-14, -56);
      c.lineTo(20 + 10 * belly, -14);
      c.stroke();
    }
    if (b.acc === 'lanyard') {
      c.strokeStyle = P.spot;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(0, -62);
      c.lineTo(9 + 6 * belly, -34);
      c.lineTo(15, -60);
      c.stroke();
      c.fillStyle = P.sign;
      c.fillRect(4 + 6 * belly, -34, 11, 14);
    }

    // 頭
    c.save();
    c.translate(8, -84);
    c.rotate(-g.lean * 0.75 + g.head);
    ojisanHead(c, P, b, face);
    c.restore();

    if (g.shoulder) circle(c, 17, -56, 15, outfit === 'suit' ? P.ink : sleeve, outfit === 'suit' ? null : outline, 3);

    // 手前の腕と、手前の手に持つもの
    let armCfg = g.near;
    if (b.acc === 'umbrella') armCfg = [1.15, 0.3];
    if (b.acc === 'point' && a.pose !== 'fly') armCfg = [1.45, 0.05];
    const near = armPts(2, -54, armCfg[0], armCfg[1]);
    drawArm(c, P, near, armW + 1, sleeve);
    if (b.acc === 'umbrella' && a.pose !== 'fly') {
      c.save();
      c.translate(near.hx, near.hy);
      c.rotate(-g.lean);
      c.fillStyle = P.tone;
      c.strokeStyle = P.feat;
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(-26, 0);
      c.lineTo(-4, -6);
      c.lineTo(50, -1);
      c.lineTo(50, 1);
      c.lineTo(-4, 6);
      c.closePath();
      c.fill();
      c.stroke();
      line(c, 50, 0, 66, 0, 3, P.feat);
      c.restore();
    } else if (b.acc === 'phone' && a.pose !== 'fly') {
      c.save();
      c.translate(near.hx, near.hy);
      c.rotate(-0.4);
      c.fillStyle = P.feat;
      rrect(c, 0, -16, 10, 20, 2);
      c.fill();
      c.fillStyle = P.spot;
      c.fillRect(2, -14, 6, 14);
      c.restore();
    } else if (b.acc === 'cane' && a.pose !== 'fly') {
      line(c, near.hx, near.hy, near.hx + 14, near.hy + 52, 3.4, P.ink);
    } else if (b.acc === 'point' && a.pose !== 'fly') {
      // 人さし指で指す
      line(c, near.hx, near.hy, near.hx + 18, near.hy - 3, 5, P.feat);
      line(c, near.hx, near.hy, near.hx + 18, near.hy - 3, 2.6, P.skin);
    }
    circle(c, near.hx, near.hy, 7, P.skin, P.feat, 2.2);

    if (b.sweat && g.shoulder) {
      c.fillStyle = P.tone;
      c.strokeStyle = P.feat;
      c.lineWidth = 1.4;
      for (const [sx, sy] of [[-30, -92], [-40, -78], [-34, -110]]) {
        c.beginPath();
        c.ellipse(sx, sy, 3, 5, -0.5, 0, TAU);
        c.fill();
        c.stroke();
      }
    }
    c.restore();
    c.restore();
  }

  // 飛び道具。小言のふきだしとゴルフボール。
  const KOGOTO = ['そもそも', '普通はね', '常識でしょ', '俺の頃は', '報連相！', '前から言うけど'];

  function drawShot(c, P, a) {
    if (a.kind === 'ball') {
      circle(c, a.x, a.y, 9, P.sign, P.signInk === P.ink ? P.ink : P.paper, 2.6);
      circle(c, a.x - 2, a.y - 2, 1.4, P.line);
      circle(c, a.x + 3, a.y + 1, 1.4, P.line);
      return;
    }
    const txt = KOGOTO[Math.floor(a.roll * KOGOTO.length)];
    c.save();
    c.font = `17px ${FONT.display}`;
    const w = c.measureText(txt).width + 22;
    const h = 34;
    const x = a.x - w / 2;
    const y = a.y - h / 2;
    const ink = P.signInk === P.ink ? P.ink : P.paper;
    c.fillStyle = P.spot;
    c.strokeStyle = ink;
    c.lineWidth = 3;
    rrect(c, x, y, w, h, 10);
    c.fill();
    c.stroke();
    c.fillStyle = '#10184A';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(txt, a.x, a.y + 1);
    c.restore();
  }

  // ---- 自分 ----
  // 通勤中の大人の女性。ポニーテールとパンツスーツで、黄色いマフラーが目印。
  const PLAYER_POSE = {
    idle(ph) {
      return {
        lean: 0.03, bob: Math.sin(ph) * 1.5 + 1.5,
        nTh: 0.18, nB: 0.12, fTh: -0.18, fB: 0.1,
        near: [0.12, 0.4], far: [-0.1, 0.4], face: 'set',
      };
    },
    run(ph) {
      const a = 0.8;
      return {
        lean: 0.22, bob: Math.abs(Math.sin(ph)) * 5,
        nTh: a * Math.sin(ph), nB: gaitBend(ph, a),
        fTh: a * Math.sin(ph + Math.PI), fB: gaitBend(ph + Math.PI, a),
        near: [-0.7 * Math.sin(ph), 1.1], far: [0.7 * Math.sin(ph), 1.1], face: 'set',
      };
    },
    tackle() {
      return {
        lean: 0.62, bob: -2,
        nTh: 0.85, nB: 1.05, fTh: -0.95, fB: 0.12,
        near: [1.25, 2.2], far: [-1.25, 0.3], face: 'shout', stretch: 1,
      };
    },
    whiff() {
      return {
        lean: 0.85, bob: 0,
        nTh: 1, nB: 0.8, fTh: -1.05, fB: 0.2,
        near: [1.9, 0.25], far: [-1.5, 0.3], face: 'shock', stretch: 0.6,
      };
    },
    hurt() {
      return {
        lean: -0.5, bob: 0,
        nTh: 0.6, nB: 0.3, fTh: 0.15, fB: 0.5,
        near: [1.5, 0.2], far: [1.1, 0.4], face: 'pain',
      };
    },
    down() {
      return {
        lean: 0, bob: 0,
        nTh: 0.2, nB: 0.1, fTh: -0.1, fB: 0.1,
        near: [0.5, 0.2], far: [-0.4, 0.2], face: 'ko',
      };
    },
    win() {
      return {
        lean: -0.06, bob: 0,
        nTh: 0.2, nB: 0.12, fTh: -0.2, fB: 0.1,
        near: [2.1, 0.3], far: [-0.25, 0.4], face: 'smile',
      };
    },
  };

  function playerHead(c, P, face, time, stretch) {
    const feat = P.feat;
    // 夜の配色では髪が背景に溶けるので、明るい線で囲む
    const outline = P.ink;
    // ポニーテール。走ると後ろへなびく。
    const sway = Math.sin(time * 7) * 3;
    const back = stretch * 10;
    c.beginPath();
    c.moveTo(-13, -13);
    c.bezierCurveTo(-34 - back, -18 + sway * 0.4, -44 - back, 2 + sway, -36 - back, 26 + sway);
    c.bezierCurveTo(-30 - back * 0.6, 12 + sway * 0.6, -24, 4, -12, 0);
    c.closePath();
    c.fillStyle = feat;
    c.fill();
    c.strokeStyle = outline;
    c.lineWidth = 1.6;
    c.stroke();
    // 顔
    c.beginPath();
    c.ellipse(2, 2, 16.5, 19, 0, 0, TAU);
    c.fillStyle = P.skin;
    c.fill();
    c.strokeStyle = feat;
    c.lineWidth = 2.4;
    c.stroke();
    // 前髪と耳まわり
    c.fillStyle = feat;
    c.beginPath();
    c.moveTo(-15, 8);
    c.bezierCurveTo(-21, -24, 8, -28, 19, -9);
    c.quadraticCurveTo(10, -13, 3, -9);
    c.quadraticCurveTo(-5, -5, -8, 8);
    c.closePath();
    c.fill();
    // 髪ゴムとピアス
    circle(c, -14, -10, 3.4, P.spot, outline, 1.4);
    circle(c, -6, 13, 2, P.spot);

    if (face === 'shock') {
      circle(c, 11, 1, 5, P.skin, feat, 2);
      circle(c, 12, 1, 1.6, feat);
      c.beginPath();
      c.ellipse(10, 13, 3.5, 3.5, 0, 0, TAU);
      c.fillStyle = feat;
      c.fill();
    } else if (face === 'pain') {
      line(c, 7, -2, 14, 2, 2.4, feat);
      line(c, 7, 6, 14, 2, 2.4, feat);
      c.beginPath();
      c.ellipse(10, 13, 4, 3, 0, 0, TAU);
      c.fillStyle = feat;
      c.fill();
    } else if (face === 'ko') {
      line(c, 7, -2, 14, 5, 2.4, feat);
      line(c, 14, -2, 7, 5, 2.4, feat);
      line(c, 6, 14, 13, 14, 2, feat);
    } else if (face === 'smile') {
      c.strokeStyle = feat;
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(11, 2, 3.6, Math.PI + 0.3, -0.3);
      c.stroke();
      c.beginPath();
      c.arc(9, 9, 5, 0.3, Math.PI - 0.5);
      c.stroke();
    } else {
      // 目はたて長に、まつげを足す
      c.beginPath();
      c.ellipse(11, 1, 2.4, 3.4, 0, 0, TAU);
      c.fillStyle = feat;
      c.fill();
      c.strokeStyle = feat;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(6, -3);
      c.quadraticCurveTo(11, -6, 15, -3);
      c.lineTo(17, -5);
      c.stroke();
      line(c, 7, -9, 15, -8, 1.6, feat);
      if (face === 'shout') {
        c.beginPath();
        c.moveTo(4, 9);
        c.lineTo(14, 8);
        c.lineTo(10, 15);
        c.closePath();
        c.fillStyle = feat;
        c.fill();
      } else {
        line(c, 7, 12, 12, 11.5, 2, feat);
      }
    }
  }

  function drawPlayer(c, P, a) {
    const pose = PLAYER_POSE[a.pose] || PLAYER_POSE.idle;
    const g = pose((a.phase || 0) * TAU);
    const mass = a.mass || 0;
    c.save();
    c.translate(a.x, a.y);
    c.scale((a.dir || 1) * a.s, a.s);
    if (a.pose === 'down') {
      // 寝かせた体の真ん中が、立っていた位置に来るようにする
      c.translate(72, -14);
      c.rotate(-Math.PI / 2 + 0.1);
    }
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const hipY = -72 - g.bob;
    drawLeg(c, P.ink2, -3, hipY, g.fTh, g.fB, 13);
    drawLeg(c, P.ink, 3, hipY, g.nTh, g.nB, 13);

    c.save();
    c.translate(0, hipY);
    c.rotate(g.lean);
    const w = 1 + mass * 0.09;

    // マフラーの尾
    const stretch = g.stretch || 0;
    const t = a.time || 0;
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      pts.push([-4 - i * (11 + stretch * 7), -56 + i * (1.5 - stretch) + Math.sin(t * 9 - i * 0.8) * i * 1.6]);
    }
    for (const [col, lw] of [[P.feat === P.ink ? P.ink : P.paper, 11], [P.spot, 7]]) {
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    }

    // 肩から下げたバッグ
    c.fillStyle = P.tone;
    c.strokeStyle = P.ink;
    c.lineWidth = 2.4;
    rrect(c, -29, -24, 22, 22, 4);
    c.fill();
    c.stroke();
    line(c, -20, -24, -8, -50, 2.2, P.ink);

    const armW = 11 + mass * 0.9;
    const far = armPts(-2, -44, g.far[0], g.far[1], 23);
    stroke2(c, far.sx, far.sy, far.ex, far.ey, far.hx, far.hy, armW + 3, P.ink);
    stroke2(c, far.sx, far.sy, far.ex, far.ey, far.hx, far.hy, armW - 2, P.paper);
    circle(c, far.hx, far.hy, 5.4, P.skin, P.feat, 2);

    // 上着。腰を少し絞る。
    c.beginPath();
    c.moveTo(-14, 7);
    c.bezierCurveTo(-13, -6, -10 * w, -20, -13 * w, -36);
    c.quadraticCurveTo(-14 * w, -48, -12 * w, -52);
    c.quadraticCurveTo(0, -57, 12 * w, -51);
    c.quadraticCurveTo(15 * w, -44, 12 * w, -34);
    c.bezierCurveTo(9 * w, -20, 13, -6, 14, 7);
    c.closePath();
    c.fillStyle = P.paper;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 2.8;
    c.stroke();
    // 上着のえり
    line(c, 3, -50, 10, -24, 2, P.ink);

    // 頭
    c.save();
    c.translate(5, -72);
    c.rotate(-g.lean * 0.7);
    playerHead(c, P, g.face, t, stretch);
    c.restore();

    // 首のマフラー
    c.fillStyle = P.spot;
    c.strokeStyle = P.ink;
    c.lineWidth = 2.4;
    rrect(c, -12, -60, 25, 11, 5);
    c.fill();
    c.stroke();

    const near = armPts(4, -44, g.near[0], g.near[1], 23);
    stroke2(c, near.sx, near.sy, near.ex, near.ey, near.hx, near.hy, armW + 4, P.ink);
    stroke2(c, near.sx, near.sy, near.ex, near.ey, near.hx, near.hy, armW - 1, P.paper);
    circle(c, near.hx, near.hy, 5.8, P.skin, P.feat, 2);
    // 鍛えるほど肩が張り出す
    if (mass > 0) circle(c, 6, -46, 8 + mass * 1.6, P.spot, P.ink, 3);
    c.restore();
    c.restore();
  }

  // ---- 背景 ----
  // 背景は 3 枚に分けて描く。back（空や遠景）、front（建物と床）、sign（揺らす案内板）。
  // ステージごとの描き方は THEMES に登録する。駅のホーム以外は scenes.js にある。
  const THEMES = {};

  function makeLayer(view, pxScale) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(view.W * pxScale));
    cv.height = Math.max(1, Math.ceil(view.H * pxScale));
    const x = cv.getContext('2d');
    x.scale(pxScale, pxScale);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    return [cv, x];
  }

  // 網点の空（上ほど濃い）
  function halftoneSky(b, P, W, ft) {
    b.fillStyle = P.paper;
    b.fillRect(0, 0, W, ft + 40);
    const horizon = ft - 16;
    b.fillStyle = P.tone;
    b.beginPath();
    let row = 0;
    for (let y = 0; y < horizon; y += 11, row++) {
      const r = 4 * Math.pow(1 - y / horizon, 1.2);
      if (r < 0.35) continue;
      for (let x = row % 2 ? 5.5 : 0; x < W + 11; x += 11) {
        b.moveTo(x + r, y);
        b.arc(x, y, r, 0, TAU);
      }
    }
    b.fill();
  }

  function stars(s) {
    const { b, P, info, rnd, W, ft } = s;
    if (info.sky !== 'night') return;
    for (let i = 0; i < 26; i++) {
      b.fillStyle = P.ink;
      b.fillRect(rnd() * W, rnd() * (ft - 60), 2, 2);
    }
  }

  // 太陽と月。finale のボスはここまで飛んでいくので、建物に隠れないよう建物のあとに描く。
  function skyBody(s, layer = s.b) {
    const { P, info, view, W, ft } = s;
    if (info.sky === 'day') return null;
    const pos = view.portrait
      ? { x: W * 0.5, y: Math.max(30, ft - 222), r: 24 }
      : { x: W * 0.76, y: s.bodyY ?? Math.max(36, ft - 92), r: 26 };
    if (info.sky === 'night') {
      circle(layer, pos.x, pos.y, pos.r, P.spot, P.ink, 3);
      circle(layer, pos.x + pos.r * 0.32, pos.y - pos.r * 0.15, pos.r * 0.82, P.paper);
      return { ...pos, label: '月までキラーン' };
    }
    circle(layer, pos.x, pos.y, pos.r + 8, P.spot, P.ink, 3);
    return { ...pos, r: pos.r + 8, label: '太陽までキラーン' };
  }

  function clouds(b, P, W, ft, rnd, n = 4) {
    b.strokeStyle = P.line;
    b.lineWidth = 2.4;
    for (let i = 0; i < n; i++) {
      const cx = rnd() * W;
      const cy = 16 + rnd() * Math.max(ft - 120, 30);
      b.fillStyle = P.paper;
      b.beginPath();
      b.arc(cx - 30, cy, 15, Math.PI * 0.6, Math.PI * 1.9);
      b.arc(cx, cy - 8, 21, Math.PI * 1.1, Math.PI * 1.95);
      b.arc(cx + 32, cy, 15, Math.PI * 1.2, Math.PI * 0.4);
      b.closePath();
      b.fill();
      b.stroke();
    }
  }

  // 黄色い線（点字ブロック）。y から下へ h の幅で引く。
  function tactile(f, P, W, y, h) {
    f.fillStyle = P.spot;
    f.fillRect(0, y, W, h);
    line(f, 0, y, W, y, 2, P.ink);
    line(f, 0, y + h, W, y + h, 2, P.ink);
    f.fillStyle = 'rgba(16,24,74,0.28)';
    f.beginPath();
    for (let x = 4; x < W; x += 9) {
      for (let k = 0; k < Math.floor(h / 8); k++) {
        const by = y + 6 + k * 8;
        const ox = k % 2 ? 4.5 : 0;
        f.moveTo(x + ox + 1.8, by);
        f.arc(x + ox, by, 1.8, 0, TAU);
      }
    }
    f.fill();
  }

  // 奥へ向かう線と横線で床の目地を描く
  function perspectiveFloor(f, P, W, H, ft, top = 26) {
    f.fillStyle = P.floor;
    f.fillRect(0, ft, W, H - ft);
    f.strokeStyle = P.tone;
    f.lineWidth = 1.6;
    const vpY = ft - 300;
    f.beginPath();
    for (let xb = -W * 1.5; xb < W * 2.5; xb += 130) {
      const t = (ft - vpY) / (H - vpY);
      f.moveTo(W / 2 + (xb - W / 2) * t, ft);
      f.lineTo(xb, H);
    }
    for (let i = 1; ft + top + i * i * 6 < H; i++) {
      const y = ft + top + i * i * 6;
      f.moveTo(0, y);
      f.lineTo(W, y);
    }
    f.stroke();
  }

  // 駅のホーム
  THEMES.platform = (s) => {
    const { b, f, P, W, H, ft, rnd, roofY } = s;
    halftoneSky(b, P, W, ft);
    stars(s);
    clouds(b, P, W, ft, rnd);
    // 町並み
    let cx = -10;
    while (cx < W) {
      const bw = 34 + rnd() * 60;
      const bh = 26 + rnd() * 74;
      b.fillStyle = P.tone;
      b.fillRect(cx, ft - 26 - bh, bw, bh);
      b.fillStyle = P.night ? P.spot : P.paper;
      for (let wy = ft - 26 - bh + 8; wy < ft - 34; wy += 13) {
        for (let wx = cx + 6; wx < cx + bw - 8; wx += 12) {
          if (rnd() < (P.night ? 0.3 : 0.55)) b.fillRect(wx, wy, 5, 6);
        }
      }
      cx += bw + 3;
    }
    s.body = skyBody(s);
    // 線路
    b.fillStyle = P.deep;
    b.fillRect(0, ft - 26, W, 26);
    line(b, 0, ft - 16, W, ft - 16, 2.4, P.ink2);
    line(b, 0, ft - 7, W, ft - 7, 2.4, P.ink2);

    // 柱
    const span = 300;
    for (let x = W / 2 - span * 2 - 150; x < W + span; x += span) {
      f.fillStyle = P.deep;
      f.fillRect(x - 8, roofY + 18, 16, ft - roofY - 18);
      f.fillStyle = P.tone;
      f.fillRect(x - 8, roofY + 18, 5, ft - roofY - 18);
    }
    // 屋根
    f.fillStyle = P.deep;
    f.fillRect(0, roofY + 6, W, 18);
    line(f, 0, roofY + 6, W, roofY + 6, 3, P.ink);
    line(f, 0, roofY + 24, W, roofY + 24, 2, P.ink);

    perspectiveFloor(f, P, W, H, ft);
    tactile(f, P, W, ft + 6, 20);
    line(f, 0, ft, W, ft, 3.5, P.ink);
    // 乗車位置の床サイン
    f.fillStyle = P.line;
    f.textAlign = 'center';
    f.textBaseline = 'middle';
    f.font = `700 14px ${FONT.ui}`;
    for (const k of [0.2, 0.8]) f.fillText('乗車位置', W * k, ft + 40);
  };

  function drawSign(s) {
    const { g, P, info, W, roofY } = s;
    const signW = Math.max(170, Math.min(300, W - 340));
    const signH = 94;
    const signX = W / 2 - signW / 2;
    const signY = roofY + 40;
    line(g, signX + 26, roofY + 24, signX + 26, signY, 3, P.ink);
    line(g, signX + signW - 26, roofY + 24, signX + signW - 26, signY, 3, P.ink);
    g.fillStyle = P.sign;
    g.fillRect(signX, signY, signW, signH);
    g.fillStyle = P.spot;
    g.fillRect(signX, signY + signH - 26, signW, 26);
    g.strokeStyle = P.ink;
    g.lineWidth = 3;
    g.strokeRect(signX, signY, signW, signH);
    g.fillStyle = P.signInk;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 13px ${FONT.ui}`;
    g.fillText(info.kana, W / 2, signY + 13);
    fitFont(g, info.name, FONT.display, 32, signW - 20);
    g.fillText(info.name, W / 2, signY + 40);
    // 黄色の帯の上は、どの配色でも読める紺色にする
    g.fillStyle = '#10184A';
    g.font = `700 13px ${FONT.ui}`;
    const first = info.theme === 'platform' ? '始発' : '入口';
    const last = info.theme === 'platform' ? '終点' : '出口';
    // 幅が狭いときは次の行き先だけを出す
    if (signW >= 230) {
      g.textAlign = 'left';
      g.fillText(info.prev ? `◀ ${info.prev}` : first, signX + 10, signY + signH - 12);
    }
    g.textAlign = 'right';
    g.fillText(info.next ? `${info.next} ▶` : last, signX + signW - 10, signY + signH - 12);
  }

  function buildBackground(P, info, view, pxScale) {
    const { W, H, ft } = view;
    const [back, b] = makeLayer(view, pxScale);
    const [front, f] = makeLayer(view, pxScale);
    const [sign, g] = makeLayer(view, pxScale);
    let seed = 1234 + (info.seed || 0) * 77;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const roofY = Math.max(0, ft - 190);
    const s = { b, f, g, P, info, view, W, H, ft, rnd, roofY, body: null };
    (THEMES[info.theme] || THEMES.platform)(s);
    drawSign(s);
    return { back, front, sign, pivot: { x: W / 2, y: roofY + 24 }, skyBody: s.body };
  }

  function drawTrain(c, P, x, ft, len) {
    const top = ft - 148;
    const bot = ft - 18;
    const carW = 372;
    for (let cx = x; cx < x + len; cx += carW) {
      c.fillStyle = P.tone;
      c.fillRect(cx, top, carW - 8, bot - top - 12);
      c.strokeStyle = P.ink;
      c.lineWidth = 3;
      c.strokeRect(cx, top, carW - 8, bot - top - 12);
      c.fillStyle = P.spot;
      c.fillRect(cx, bot - 46, carW - 8, 10);
      c.fillStyle = P.deep;
      c.fillRect(cx + 8, bot - 12, carW - 24, 12);
      for (let w = 0; w < 4; w++) {
        const wx = cx + 18 + w * 88;
        c.fillStyle = P.paper;
        c.fillRect(wx, top + 18, 58, 44);
        c.strokeStyle = P.ink;
        c.lineWidth = 2;
        c.strokeRect(wx, top + 18, 58, 44);
        c.fillStyle = P.ink2;
        for (let p = 0; p < 2; p++) {
          const px = wx + 14 + p * 28;
          circle(c, px, top + 46, 8, P.ink2);
          c.fillRect(px - 9, top + 53, 18, 9);
        }
      }
    }
  }

  // ---- 足元の輪 ----
  function zoneRing(c, P, x, y, rOuter, rInner, squash, o = {}) {
    const lockK = o.lockK || 0;
    c.save();
    c.lineCap = 'round';
    const ell = (r) => {
      c.beginPath();
      c.ellipse(x, y, r, r * squash, 0, 0, TAU);
    };
    if (lockK > 0) {
      c.globalAlpha = 0.5;
      ell(rOuter);
      c.fillStyle = P.tone;
      c.fill();
      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(x, y);
      c.ellipse(x, y, rOuter, rOuter * squash, 0, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - lockK));
      c.closePath();
      c.fillStyle = P.deep;
      c.fill();
      ell(rOuter);
      c.strokeStyle = P.ink2;
      c.lineWidth = 2.5;
      c.stroke();
      c.restore();
      return;
    }
    c.globalAlpha = o.hot ? 0.62 : 0.24;
    ell(rOuter);
    c.fillStyle = P.spot;
    c.fill();
    c.globalAlpha = o.hot ? 0.95 : 0.5;
    ell(rInner);
    c.fill();
    c.globalAlpha = 1;
    ell(rOuter);
    c.strokeStyle = P.ink;
    c.lineWidth = o.hot ? 4 : 2.6;
    c.stroke();
    ell(rInner);
    c.lineWidth = 1.8;
    c.setLineDash([5, 6]);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  // ---- 効果 ----
  function speedLines(c, col, cx, cy, W, H, n, inner, seed) {
    let s = (seed | 0) + 7;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const far = Math.hypot(W, H);
    c.fillStyle = col;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.07;
      const w = 0.006 + rnd() * 0.02;
      const r0 = inner * (1 + rnd() * 0.9);
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a - w) * far, cy + Math.sin(a - w) * far);
      c.lineTo(cx + Math.cos(a + w) * far, cy + Math.sin(a + w) * far);
      c.closePath();
    }
    c.fill();
  }

  // ひび割れ。床には squash でつぶして、画面のガラスにはそのまま使う。
  function crack(c, col, x, y, r, seed, squash = 1, width = 2.4) {
    let s = (seed | 0) + 11;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    c.save();
    c.translate(x, y);
    c.scale(1, squash);
    c.strokeStyle = col;
    c.lineCap = 'round';
    c.lineJoin = 'miter';
    const n = 7 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd() * 0.4;
      const len = r * (0.5 + rnd() * 0.6);
      c.lineWidth = width * (0.7 + rnd() * 0.6);
      c.beginPath();
      c.moveTo(0, 0);
      let px = 0;
      let py = 0;
      for (let j = 1; j <= 4; j++) {
        const d = (len * j) / 4;
        const ang = a + (rnd() - 0.5) * 0.5;
        px = Math.cos(ang) * d;
        py = Math.sin(ang) * d;
        c.lineTo(px, py);
      }
      c.stroke();
      // 途中から枝分かれさせる
      if (rnd() < 0.6) {
        const b = a + (rnd() < 0.5 ? 0.5 : -0.5);
        c.beginPath();
        c.moveTo(px * 0.6, py * 0.6);
        c.lineTo(px * 0.6 + Math.cos(b) * len * 0.35, py * 0.6 + Math.sin(b) * len * 0.35);
        c.stroke();
      }
    }
    c.restore();
  }

  function burst(c, P, x, y, r, spikes, rot) {
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = rot + (i / (spikes * 2)) * TAU;
      const R = i % 2 ? r * 0.58 : r * (i % 4 ? 0.92 : 1);
      const px = x + Math.cos(a) * R;
      const py = y + Math.sin(a) * R;
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = P.spot;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 4;
    c.lineJoin = 'miter';
    c.stroke();
    c.lineJoin = 'round';
  }

  function star(c, P, x, y, r, rot = 0) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const R = i % 2 ? r * 0.16 : r;
      const a = (i / 8) * TAU;
      if (i) c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      else c.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    }
    c.closePath();
    c.fillStyle = P.spot;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  function popText(c, txt, x, y, size, o = {}) {
    c.save();
    c.translate(x, y);
    if (o.rot) c.rotate(o.rot);
    if (o.scale && o.scale !== 1) c.scale(o.scale, o.scale);
    if (o.alpha !== undefined) c.globalAlpha = o.alpha;
    c.font = `${size}px ${o.font || FONT.manga}`;
    c.textAlign = o.align || 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.miterLimit = 2;
    c.lineWidth = o.lw !== undefined ? o.lw : size * 0.24;
    c.strokeStyle = o.stroke;
    c.strokeText(txt, 0, 0);
    // 黄色の縁に明るい文字は読めないので、夜の配色でも紺色にする
    c.fillStyle = o.stroke === '#FFD200' && isLight(o.fill) ? '#10184A' : o.fill;
    c.fillText(txt, 0, 0);
    c.restore();
  }

  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255) > 140;
  }

  function bubble(c, P, x, y, txt, flip, W = Infinity) {
    c.save();
    c.font = `700 15px ${FONT.ui}`;
    const w = c.measureText(txt).width + 18;
    const h = 28;
    // 画面の端でも切れないように、ふきだしだけ内側へ寄せる
    const bx = Math.min(Math.max(x - w / 2, 4), W - w - 4);
    const by = y - h;
    c.fillStyle = P.sign;
    c.strokeStyle = P.signInk === P.ink ? P.ink : P.paper;
    c.lineWidth = 2.4;
    rrect(c, bx, by, w, h, 8);
    c.fill();
    c.stroke();
    c.beginPath();
    const tx = Math.min(Math.max(x + (flip ? 10 : -10), bx + 12), bx + w - 12);
    c.moveTo(tx - 6, by + h - 1);
    c.lineTo(tx, by + h + 9);
    c.lineTo(tx + 6, by + h - 1);
    c.fill();
    c.stroke();
    c.fillStyle = P.sign;
    c.fillRect(tx - 5, by + h - 3, 10, 3);
    c.fillStyle = P.signInk;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(txt, bx + w / 2, by + h / 2 + 1);
    c.restore();
  }

  function particle(c, P, p) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    const s = p.size;
    switch (p.kind) {
      case 'paper':
        c.fillStyle = P.sign;
        c.strokeStyle = P.signInk === P.ink ? P.ink : P.paper;
        c.lineWidth = 1.6;
        c.fillRect(-s, -s * 1.3, s * 2, s * 2.6);
        c.strokeRect(-s, -s * 1.3, s * 2, s * 2.6);
        line(c, -s * 0.6, -s * 0.5, s * 0.6, -s * 0.5, 1, P.line);
        line(c, -s * 0.6, s * 0.2, s * 0.6, s * 0.2, 1, P.line);
        break;
      case 'wig':
        c.fillStyle = P.ink;
        c.beginPath();
        c.ellipse(0, 0, s * 2, s, 0, Math.PI, 0);
        c.closePath();
        c.fill();
        break;
      case 'glasses':
        c.strokeStyle = P.ink;
        c.lineWidth = 2;
        c.strokeRect(-s * 1.5, -s * 0.6, s * 1.3, s * 1.2);
        c.strokeRect(s * 0.2, -s * 0.6, s * 1.3, s * 1.2);
        break;
      case 'star':
        star(c, P, 0, 0, s * 1.6);
        break;
      case 'puff':
        circle(c, 0, 0, s * (1 + (p.age || 0) * 3), P.floor, P.ink, 2);
        break;
      default:
        circle(c, 0, 0, s, P.ink);
    }
    c.restore();
  }

  function fitFont(c, text, font, size, maxW) {
    c.font = `${size}px ${font}`;
    const w = c.measureText(text).width;
    if (w > maxW) {
      size = Math.floor((size * maxW) / w);
      c.font = `${size}px ${font}`;
    }
    return size;
  }

  // 画面を横切る帯。k は 0→1 で出て、1→2 で抜ける。
  function banner(c, P, W, y, main, sub, k) {
    const h = sub ? 96 : 68;
    const inK = Math.min(k, 1);
    const outK = Math.max(k - 1, 0);
    const ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
    const x0 = -W * 0.2 + (W * 1.4 + 0) * (outK > 0 ? ease(outK) : 0);
    const x1 = -W * 0.2 + W * 1.4 * ease(inK);
    if (x1 <= x0) return;
    const sl = 22;
    c.save();
    c.beginPath();
    c.moveTo(x0 + sl, y);
    c.lineTo(x1 + sl, y);
    c.lineTo(x1 - sl, y + h);
    c.lineTo(x0 - sl, y + h);
    c.closePath();
    c.fillStyle = P.band;
    c.fill();
    c.strokeStyle = P.ink;
    c.lineWidth = 3;
    c.stroke();
    c.clip();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = P.bandText;
    fitFont(c, main, FONT.display, 34, W - 56);
    c.fillText(main, W / 2, y + (sub ? 36 : h / 2));
    if (sub) {
      c.fillStyle = P.spot;
      fitFont(c, sub, `${FONT.ui}`, 18, W - 56);
      c.font = `700 ${Math.min(18, parseInt(c.font, 10))}px ${FONT.ui}`;
      c.fillText(sub, W / 2, y + 72);
    }
    c.restore();
  }

  return {
    TAU, FONT, PALETTES, BODY,
    mix, negative, silhouette, circle, line, rrect,
    THEMES, KOGOTO, drawOjisan, drawShot, drawPlayer, makeLayer, buildBackground, drawTrain, zoneRing,
    halftoneSky, stars, skyBody, clouds, tactile, perspectiveFloor,
    speedLines, crack, burst, star, popText, bubble, particle, fitFont, banner,
  };
})();
