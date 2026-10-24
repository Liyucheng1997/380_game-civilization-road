// Canvas 地图渲染：地形、迷雾、边界、城市、单位、特效、小地图
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;
  const G = C.G;
  const R = (C.R = {});
  const BASE = 34;
  const SQ3 = Math.sqrt(3);
  const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
  const EMOJI = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  const IMP_CH = { mine: '矿', lumber: '林', pasture: '牧', hunt: '猎', quarry: '石', plantation: '园', fishing: '渔' };
  const YCOL = { food: '#8bc34a', prod: '#d08a4a', gold: '#f2c94c', sci: '#64b5f6', cul: '#ce93d8' };

  let cv, ctx, mini, mctx, dpr = 1, W = 0, H = 0;
  R.cam = { x: 0, y: 0, z: 1 };
  R.camTo = null;
  R.dirty = true;
  R.anims = new Map();
  R.fx = [];
  R.hover = -1;
  R.ov = { reach: null, attack: null, path: null, cityTiles: null, worked: null, sites: null, yields: false, rangeTiles: null };
  R.banners = [];
  R.showGrid = true;
  R.showYields = false;
  R.selUnit = null;
  R.selCity = null;
  let colorCache = [];
  let miniDirty = true;
  let miniBase = null;

  const hash = (i, k) => {
    let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k || 1, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  R.rgba = rgba;

  R.init = function (canvas, minimap) {
    cv = canvas;
    ctx = cv.getContext('2d');
    mini = minimap;
    mctx = mini.getContext('2d');
    window.addEventListener('resize', R.resize);
    R.resize();
    requestAnimationFrame(loop);
  };
  R.resize = function () {
    dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    R.dirty = true;
    miniDirty = true;
  };
  R.reset = function () {
    colorCache = [];
    R.anims.clear();
    R.fx = [];
    miniDirty = true;
    R.dirty = true;
  };
  R.markMini = () => {
    miniDirty = true;
    R.dirty = true;
  };

  function loop() {
    if (R.camTo) {
      R.cam.x += (R.camTo.x - R.cam.x) * 0.22;
      R.cam.y += (R.camTo.y - R.cam.y) * 0.22;
      if (Math.abs(R.camTo.x - R.cam.x) < 0.5 && Math.abs(R.camTo.y - R.cam.y) < 0.5) {
        R.cam.x = R.camTo.x;
        R.cam.y = R.camTo.y;
        R.camTo = null;
      }
      R.dirty = true;
    }
    if (R.dirty || R.anims.size || R.fx.length) {
      try {
        R.draw();
      } catch (e) {
        console.error(e);
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- 坐标 ----------
  R.world = (i) => {
    const s = G.state();
    const x = i % s.W, y = Math.floor(i / s.W);
    return [SQ3 * BASE * (x + 0.5 * (y & 1)), 1.5 * BASE * y];
  };
  R.screen = (i) => {
    const [wx, wy] = R.world(i);
    return [(wx - R.cam.x) * R.cam.z + W / 2, (wy - R.cam.y) * R.cam.z + H / 2];
  };
  R.screenToTile = function (px, py) {
    const s = G.state();
    if (!s) return -1;
    const wx = (px - W / 2) / R.cam.z + R.cam.x;
    const wy = (py - H / 2) / R.cam.z + R.cam.y;
    const [x, y] = Hex.fromPixel(wx, wy, BASE);
    return Hex.inMap(x, y) ? y * s.W + x : -1;
  };
  R.clampCam = function () {
    const s = G.state();
    if (!s) return;
    const maxX = SQ3 * BASE * (s.W + 0.5), maxY = 1.5 * BASE * s.H;
    R.cam.x = Math.max(0, Math.min(maxX, R.cam.x));
    R.cam.y = Math.max(0, Math.min(maxY, R.cam.y));
  };
  R.centerOn = function (i, instant) {
    const [wx, wy] = R.world(i);
    if (instant) {
      R.cam.x = wx;
      R.cam.y = wy;
      R.camTo = null;
    } else R.camTo = { x: wx, y: wy };
    R.dirty = true;
  };
  R.pan = function (dx, dy) {
    R.camTo = null;
    R.cam.x -= dx / R.cam.z;
    R.cam.y -= dy / R.cam.z;
    R.clampCam();
    R.dirty = true;
  };
  R.zoomAt = function (px, py, f) {
    const z0 = R.cam.z;
    const z1 = Math.max(0.4, Math.min(1.9, z0 * f));
    const wx = (px - W / 2) / z0 + R.cam.x, wy = (py - H / 2) / z0 + R.cam.y;
    R.cam.z = z1;
    R.cam.x = wx - (px - W / 2) / z1;
    R.cam.y = wy - (py - H / 2) / z1;
    R.camTo = null;
    R.clampCam();
    R.dirty = true;
  };
  R.isOnScreen = function (i) {
    const [x, y] = R.screen(i);
    return x > 40 && y > 80 && x < W - 40 && y < H - 120;
  };

  // ---------- 动画与特效 ----------
  R.animateMove = function (u, path, fast) {
    const s = G.state();
    const h = G.human();
    const vis = G.vis(h);
    if (u.owner !== h.id && !path.some((i) => vis[i])) return;
    const pts = path.map((i) => R.world(i));
    const per = fast ? 70 : 110;
    R.anims.set(u.id, { pts, t0: performance.now(), dur: Math.max(1, pts.length - 1) * per });
    R.dirty = true;
  };
  R.addFx = function (i, text, color, delay) {
    R.fx.push({ i, text, color: color || '#ffffff', t0: performance.now() + (delay || 0), dur: 1300 });
    R.dirty = true;
  };
  R.flash = function (from, to) {
    R.fx.push({ line: [from, to], t0: performance.now(), dur: 380 });
    R.dirty = true;
  };

  function unitPos(u, now) {
    const a = R.anims.get(u.id);
    const s = G.state();
    if (a) {
      const t = (now - a.t0) / a.dur;
      if (t >= 1) R.anims.delete(u.id);
      else {
        const seg = t * (a.pts.length - 1);
        const k = Math.floor(seg), f = seg - k;
        const p = a.pts[k], q = a.pts[Math.min(k + 1, a.pts.length - 1)];
        return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, true];
      }
    }
    return [...R.world(u.y * s.W + u.x), false];
  }

  // ---------- 绘制 ----------
  function hexPath(cx, cy, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 30);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function tileColor(i, t) {
    const key = t.t;
    const c = colorCache[i];
    if (c && c.k === key) return c.v;
    const v = shade(C.TERRAIN[t.t].color, (hash(i, 3) - 0.5) * 0.09);
    colorCache[i] = { k: key, v };
    return v;
  }

  function drawTree(x, y, r, col, trunk) {
    ctx.fillStyle = trunk;
    ctx.fillRect(x - r * 0.12, y + r * 0.35, r * 0.24, r * 0.45);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y + r * 0.5);
    ctx.lineTo(x - r * 0.7, y + r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  function drawPalm(x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + r * 0.45, y + r * 0.2, r * 0.42, 0, Math.PI * 2);
    ctx.arc(x - r * 0.45, y + r * 0.22, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain(i, t, x, y, sz) {
    const T = C.TERRAIN[t.t];
    hexPath(x, y, sz + 0.6);
    ctx.fillStyle = tileColor(i, t);
    ctx.fill();
    const detail = sz > 14;
    if (T.water) {
      if (detail) {
        ctx.strokeStyle = T.deep ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.22)';
        ctx.lineWidth = Math.max(1, sz * 0.04);
        for (let k = 0; k < 2; k++) {
          const ox = (hash(i, 10 + k) - 0.5) * sz * 0.9, oy = (hash(i, 20 + k) - 0.5) * sz * 0.9;
          ctx.beginPath();
          ctx.arc(x + ox, y + oy, sz * 0.14, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
      }
      return;
    }
    if (t.t === 'mountain') {
      const r = sz;
      ctx.fillStyle = '#6d6a66';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.72, y + r * 0.45);
      ctx.lineTo(x - r * 0.2, y - r * 0.55);
      ctx.lineTo(x + r * 0.08, y - r * 0.1);
      ctx.lineTo(x + r * 0.32, y - r * 0.35);
      ctx.lineTo(x + r * 0.75, y + r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#85827d';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.2, y - r * 0.55);
      ctx.lineTo(x + r * 0.08, y - r * 0.1);
      ctx.lineTo(x - r * 0.02, y + r * 0.45);
      ctx.lineTo(x - r * 0.72, y + r * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f4f6f8';
      ctx.beginPath();
      ctx.moveTo(x - r * 0.2, y - r * 0.55);
      ctx.lineTo(x - r * 0.05, y - r * 0.27);
      ctx.lineTo(x - r * 0.2, y - r * 0.3);
      ctx.lineTo(x - r * 0.36, y - r * 0.22);
      ctx.closePath();
      ctx.fill();
      return;
    }
    if (t.h && detail) {
      ctx.fillStyle = 'rgba(60,40,10,0.16)';
      ctx.beginPath();
      ctx.ellipse(x - sz * 0.28, y + sz * 0.22, sz * 0.36, sz * 0.24, 0, Math.PI, 0);
      ctx.ellipse(x + sz * 0.3, y + sz * 0.3, sz * 0.3, sz * 0.2, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,40,10,0.22)';
      ctx.lineWidth = Math.max(1, sz * 0.035);
      ctx.beginPath();
      ctx.ellipse(x - sz * 0.28, y + sz * 0.22, sz * 0.36, sz * 0.24, 0, Math.PI, 0);
      ctx.stroke();
    }
    if (!detail) return;
    if (t.f === 'forest') {
      const col = t.t === 'tundra' ? '#3f6650' : '#3b7a34';
      const col2 = t.t === 'tundra' ? '#4f7a60' : '#4b8f3f';
      drawTree(x - sz * 0.32, y - sz * 0.02, sz * 0.27, col, '#6b4a2b');
      drawTree(x + sz * 0.3, y - sz * 0.12, sz * 0.3, col2, '#6b4a2b');
      drawTree(x + sz * 0.02, y + sz * 0.3, sz * 0.26, col, '#6b4a2b');
    } else if (t.f === 'jungle') {
      drawPalm(x - sz * 0.3, y - sz * 0.05, sz * 0.26, '#2f7a3d');
      drawPalm(x + sz * 0.28, y - sz * 0.12, sz * 0.28, '#3a8c45');
      drawPalm(x, y + sz * 0.3, sz * 0.24, '#2a6e37');
    } else if (t.f === 'oasis') {
      ctx.fillStyle = '#4ea7d8';
      ctx.beginPath();
      ctx.ellipse(x, y + sz * 0.12, sz * 0.36, sz * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      drawPalm(x + sz * 0.3, y - sz * 0.2, sz * 0.2, '#3d8b40');
    } else if (t.t === 'desert') {
      ctx.strokeStyle = 'rgba(150,110,40,0.22)';
      ctx.lineWidth = Math.max(1, sz * 0.04);
      ctx.beginPath();
      ctx.arc(x - sz * 0.1, y + sz * 0.5, sz * 0.5, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    } else if (t.t === 'grass' || t.t === 'plains') {
      ctx.fillStyle = 'rgba(40,70,10,0.14)';
      for (let k = 0; k < 3; k++) {
        const ox = (hash(i, 30 + k) - 0.5) * sz * 1.1, oy = (hash(i, 40 + k) - 0.5) * sz * 1.0;
        ctx.fillRect(x + ox, y + oy, Math.max(1, sz * 0.05), sz * 0.12);
      }
    }
  }

  function drawImprovement(t, x, y, sz) {
    if (!t.imp) return;
    if (t.imp === 'farm') {
      ctx.save();
      hexPath(x, y, sz * 0.92);
      ctx.clip();
      ctx.strokeStyle = 'rgba(214,186,90,0.75)';
      ctx.lineWidth = Math.max(1, sz * 0.07);
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.moveTo(x - sz, y + sz * 0.38 + k * sz * 0.16);
        ctx.lineTo(x + sz, y + sz * 0.12 + k * sz * 0.16);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    const r = sz * 0.2;
    const bx = x - sz * 0.42, by = y + sz * 0.38;
    ctx.fillStyle = 'rgba(40,35,30,0.78)';
    ctx.beginPath();
    ctx.roundRect(bx - r, by - r, r * 2, r * 2, r * 0.4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.round(r * 1.25)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(IMP_CH[t.imp] || '?', bx, by + r * 0.05);
  }

  function drawYields(i, x, y, sz, civ) {
    const yv = G.tileYield(i, civ);
    const keys = ['food', 'prod', 'gold', 'sci', 'cul'].filter((k) => yv[k] > 0);
    if (!keys.length) return;
    const r = Math.max(2, sz * 0.085);
    let total = 0;
    for (const k of keys) total += Math.min(4, yv[k]);
    let px = x - ((total - 1) * r * 2.3) / 2;
    const py = y - sz * 0.58;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.roundRect(px - r * 1.6, py - r * 1.6, (total - 1) * r * 2.3 + r * 3.2, r * 3.2, r * 1.6);
    ctx.fill();
    for (const k of keys) {
      for (let n = 0; n < Math.min(4, yv[k]); n++) {
        ctx.fillStyle = YCOL[k];
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        px += r * 2.3;
      }
    }
  }

  function drawCity(city, x, y, sz) {
    const civ = G.state().civs[city.owner];
    const r = sz;
    if (city.buildings.walls) {
      ctx.strokeStyle = '#8d8478';
      ctx.lineWidth = Math.max(2, sz * 0.09);
      hexPath(x, y, sz * 0.8);
      ctx.stroke();
    }
    const houses = [[-0.32, 0.12, 0.3], [0.25, 0.18, 0.28], [-0.02, -0.18, 0.34], [0.36, -0.2, 0.22], [-0.38, -0.25, 0.2]];
    const n = Math.min(houses.length, 2 + Math.floor(city.pop / 3));
    const roof = shade(civ.color, -0.25);
    for (let k = 0; k < n; k++) {
      const [hx, hy, hs] = houses[k];
      const cx = x + hx * r, cy = y + hy * r, w = hs * r;
      ctx.fillStyle = '#efe7d8';
      ctx.fillRect(cx - w * 0.5, cy - w * 0.2, w, w * 0.7);
      ctx.fillStyle = roof;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.62, cy - w * 0.18);
      ctx.lineTo(cx, cy - w * 0.72);
      ctx.lineTo(cx + w * 0.62, cy - w * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(60,40,20,0.55)';
      ctx.fillRect(cx - w * 0.1, cy + w * 0.15, w * 0.2, w * 0.35);
    }
  }

  function drawBanner(city, x, y, sz) {
    const s = G.state();
    const civ = s.civs[city.owner];
    const human = civ.isHuman;
    const fs = Math.max(10, Math.round(sz * 0.36));
    ctx.font = `600 ${fs}px ${FONT}`;
    const name = (city.capital ? '★ ' : '') + city.name;
    const tw = ctx.measureText(name).width;
    const pr = fs * 0.78;
    let extra = 0;
    let prodTxt = '';
    if (human) {
      const t = G.buildTurns(city);
      prodTxt = city.build ? `${t ?? '-'}` : '!';
      extra = fs * 1.7;
    }
    const bw = tw + pr * 2 + fs * 1.0 + extra;
    const bh = fs * 1.7;
    const bx = x - bw / 2, by = y - sz * 1.02 - bh / 2;
    ctx.fillStyle = civ.color;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
    // 人口圆
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx + bh / 2, by + bh / 2, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d1d1f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(fs * 0.95)}px ${FONT}`;
    ctx.fillText(String(city.pop), bx + bh / 2, by + bh / 2 + 1);
    ctx.font = `600 ${fs}px ${FONT}`;
    ctx.fillStyle = civ.text;
    ctx.textAlign = 'left';
    ctx.fillText(name, bx + bh / 2 + pr + fs * 0.35, by + bh / 2 + 1);
    if (human) {
      const px = bx + bw - bh / 2 - 2;
      ctx.fillStyle = city.build ? 'rgba(255,255,255,0.92)' : '#ff9f0a';
      ctx.beginPath();
      ctx.arc(px, by + bh / 2, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = city.build ? '#1d1d1f' : '#fff';
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(fs * 0.8)}px ${FONT}`;
      ctx.fillText(prodTxt, px, by + bh / 2 + 1);
    }
    // 生命值
    const maxHp = G.cityMaxHp(city);
    if (city.hp < maxHp) {
      const hw = Math.min(bw, sz * 1.4);
      const hx = x - hw / 2, hy = by + bh + 3;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(hx, hy, hw, 5);
      const f = Math.max(0, city.hp / maxHp);
      ctx.fillStyle = f > 0.6 ? '#30d158' : f > 0.3 ? '#ff9f0a' : '#ff453a';
      ctx.fillRect(hx + 1, hy + 1, (hw - 2) * f, 3);
    }
    R.banners.push({ city: city.id, x: bx, y: by, w: bw, h: bh });
  }

  function drawUnit(u, x, y, sz, opts) {
    const s = G.state();
    const civ = s.civs[u.owner];
    const def = C.UNITS[u.type];
    const civil = def.cls === 'civilian';
    const r = sz * (civil ? 0.32 : 0.38);
    ctx.globalAlpha = opts.dim ? 0.72 : 1;
    if (opts.water) {
      ctx.fillStyle = '#7a5532';
      ctx.beginPath();
      ctx.moveTo(x - r * 1.25, y + r * 0.45);
      ctx.lineTo(x + r * 1.25, y + r * 0.45);
      ctx.lineTo(x + r * 0.8, y + r * 1.05);
      ctx.lineTo(x - r * 0.8, y + r * 1.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.95, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = civ.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = civil ? 'rgba(255,255,255,0.75)' : '#ffffff';
    ctx.stroke();
    if (!civil) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = civ.text;
    ctx.font = `700 ${Math.round(r * 1.05)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.ch, x, y + r * 0.05);
    ctx.globalAlpha = 1;
    if (opts.sel) {
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = Math.max(2, sz * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r + sz * 0.1, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (u.hp < 100) {
      const hw = r * 1.7, hx = x - hw / 2, hy = y + r + 2;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(hx, hy, hw, 4);
      const f = u.hp / 100;
      ctx.fillStyle = f > 0.6 ? '#30d158' : f > 0.3 ? '#ff9f0a' : '#ff453a';
      ctx.fillRect(hx + 0.5, hy + 0.5, (hw - 1) * f, 3);
    }
    const rk = G.rank(u);
    if (rk && sz > 14) {
      ctx.fillStyle = '#ffd60a';
      ctx.font = `700 ${Math.round(r * 0.55)}px ${FONT}`;
      ctx.fillText('★'.repeat(rk), x, y - r - r * 0.3);
    }
    if ((u.fort || u.sleep) && sz > 14) {
      ctx.fillStyle = 'rgba(29,29,31,0.85)';
      ctx.beginPath();
      ctx.arc(x + r * 0.8, y + r * 0.7, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r * 0.45)}px ${FONT}`;
      ctx.fillText(u.fort ? '守' : 'z', x + r * 0.8, y + r * 0.72);
    }
    if (opts.ready && sz > 14) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - r * 0.8, y - r * 0.7, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  R.draw = function () {
    R.dirty = false;
    const s = G.state();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(0, 0, W, H);
    if (!s) return;
    const now = performance.now();
    const z = R.cam.z, sz = BASE * z;
    const human = G.human();
    const exp = human.explored;
    const vis = G.vis(human);
    const reveal = s.winner != null && !human.alive;
    const wl = R.cam.x - W / 2 / z - BASE * 2, wr = R.cam.x + W / 2 / z + BASE * 2;
    const wt = R.cam.y - H / 2 / z - BASE * 2, wb = R.cam.y + H / 2 / z + BASE * 2;
    const y0 = Math.max(0, Math.floor(wt / (1.5 * BASE))), y1 = Math.min(s.H - 1, Math.ceil(wb / (1.5 * BASE)));
    const x0 = Math.max(0, Math.floor(wl / (SQ3 * BASE)) - 1), x1 = Math.min(s.W - 1, Math.ceil(wr / (SQ3 * BASE)));
    const list = [];
    const pos = new Map();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * s.W + x;
        if (!exp[i] && !reveal) continue;
        list.push(i);
        pos.set(i, [(SQ3 * BASE * (x + 0.5 * (y & 1)) - R.cam.x) * z + W / 2, (1.5 * BASE * y - R.cam.y) * z + H / 2]);
      }
    }
    // 未探索区域的淡网格
    if (sz > 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * s.W + x;
          if (exp[i] || reveal) continue;
          hexPath((SQ3 * BASE * (x + 0.5 * (y & 1)) - R.cam.x) * z + W / 2, (1.5 * BASE * y - R.cam.y) * z + H / 2, sz);
          ctx.stroke();
        }
      }
    }
    // 1 地形
    for (const i of list) {
      const [x, y] = pos.get(i);
      drawTerrain(i, s.tiles[i], x, y, sz);
    }
    // 2 改良、资源、村庄、营地
    for (const i of list) {
      const t = s.tiles[i];
      const [x, y] = pos.get(i);
      drawImprovement(t, x, y, sz);
      if (sz < 13) continue;
      if (t.r && G.resourceVisible(t, human)) {
        const rx = x + sz * 0.42, ry = y + sz * 0.36, rr = sz * 0.22;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.beginPath();
        ctx.arc(rx, ry, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `${Math.round(rr * 1.25)}px ${EMOJI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(C.RESOURCES[t.r].icon, rx, ry + rr * 0.08);
      }
      if (t.hut || t.camp) {
        ctx.font = `${Math.round(sz * 0.55)}px ${EMOJI}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.hut ? '🛖' : '⛺', x, y - sz * 0.05);
        if (t.camp) {
          ctx.fillStyle = '#d70015';
          ctx.fillRect(x + sz * 0.15, y - sz * 0.55, sz * 0.03 + 1, sz * 0.32);
          ctx.beginPath();
          ctx.moveTo(x + sz * 0.18, y - sz * 0.55);
          ctx.lineTo(x + sz * 0.42, y - sz * 0.47);
          ctx.lineTo(x + sz * 0.18, y - sz * 0.39);
          ctx.fill();
        }
      }
    }
    // 3 领土填色与边界
    for (const i of list) {
      const t = s.tiles[i];
      if (t.o < 0) continue;
      const [x, y] = pos.get(i);
      hexPath(x, y, sz);
      ctx.fillStyle = rgba(s.civs[t.o].color, 0.13);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    for (const i of list) {
      const t = s.tiles[i];
      if (t.o < 0) continue;
      const [x, y] = pos.get(i);
      const tx = i % s.W, ty = Math.floor(i / s.W);
      ctx.strokeStyle = s.civs[t.o].color;
      ctx.lineWidth = Math.max(2, sz * 0.1);
      const ir = sz * 0.9;
      ctx.beginPath();
      for (let d = 0; d < 6; d++) {
        const j = Hex.neighborDir(tx, ty, d);
        if (j >= 0 && s.tiles[j].o === t.o) continue;
        const a1 = (Math.PI / 180) * (60 * d - 30), a2 = (Math.PI / 180) * (60 * (d + 1) - 30);
        ctx.moveTo(x + ir * Math.cos(a1), y + ir * Math.sin(a1));
        ctx.lineTo(x + ir * Math.cos(a2), y + ir * Math.sin(a2));
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // 4 网格
    if (R.showGrid && sz > 12) {
      ctx.strokeStyle = 'rgba(0,0,0,0.13)';
      ctx.lineWidth = 1;
      for (const i of list) {
        const [x, y] = pos.get(i);
        hexPath(x, y, sz);
        ctx.stroke();
      }
    }
    // 5 产出 / 城址提示
    const showY = R.showYields || R.ov.yields;
    if (showY && sz > 15) {
      for (const i of list) {
        if (!vis[i] && !reveal) continue;
        const [x, y] = pos.get(i);
        drawYields(i, x, y, sz, human);
      }
    }
    if (R.ov.sites) {
      for (const i of list) {
        const [x, y] = pos.get(i);
        if (!R.ov.sites.valid.has(i) && !C.TERRAIN[s.tiles[i].t].water) {
          hexPath(x, y, sz);
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fill();
        }
      }
      for (const i of R.ov.sites.best) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        ctx.fillStyle = 'rgba(10,132,255,0.9)';
        ctx.beginPath();
        ctx.arc(x, y + sz * 0.05, sz * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(sz * 0.3)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x, y + sz * 0.07);
      }
    }
    // 6 迷雾
    if (!reveal) {
      for (const i of list) {
        if (vis[i]) continue;
        const [x, y] = pos.get(i);
        hexPath(x, y, sz + 0.6);
        ctx.fillStyle = 'rgba(22,26,36,0.5)';
        ctx.fill();
      }
    }
    // 7 选中单位的覆盖层
    if (R.ov.cityTiles) {
      for (const i of R.ov.cityTiles) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        hexPath(x, y, sz * 0.94);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      for (const i of R.ov.worked || []) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y + sz * 0.62, sz * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0a84ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    if (R.ov.rangeTiles) {
      for (const i of R.ov.rangeTiles) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        hexPath(x, y, sz);
        ctx.fillStyle = 'rgba(255,69,58,0.10)';
        ctx.fill();
      }
    }
    if (R.ov.reach) {
      for (const i of R.ov.reach.keys()) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        hexPath(x, y, sz * 0.94);
        ctx.fillStyle = 'rgba(10,132,255,0.32)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    if (R.ov.attack) {
      for (const i of R.ov.attack) {
        if (!pos.has(i)) continue;
        const [x, y] = pos.get(i);
        hexPath(x, y, sz * 0.9);
        ctx.strokeStyle = '#ff453a';
        ctx.lineWidth = Math.max(2, sz * 0.09);
        ctx.stroke();
      }
    }
    if (R.hover >= 0 && pos.has(R.hover)) {
      const [x, y] = pos.get(R.hover);
      hexPath(x, y, sz * 0.97);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // 8 城市
    for (const c of Object.values(s.cities)) {
      const i = c.y0 * s.W + c.x;
      if (!pos.has(i)) continue;
      const [x, y] = pos.get(i);
      drawCity(c, x, y, sz);
    }
    // 9 单位
    const sel = R.selUnit;
    const units = Object.values(s.units).sort((a, b) => (G.isCivilian(a) ? 0 : 1) - (G.isCivilian(b) ? 0 : 1));
    for (const u of units) {
      const ui = u.y * s.W + u.x;
      if (!vis[ui] && !reveal && u.owner !== human.id) continue;
      let [wx, wy, moving] = unitPos(u, now);
      let sx = (wx - R.cam.x) * z + W / 2, sy = (wy - R.cam.y) * z + H / 2;
      if (sx < -sz * 2 || sy < -sz * 2 || sx > W + sz * 2 || sy > H + sz * 2) continue;
      if (!moving) {
        const both = G.unitsAt(ui).length > 1;
        if (both) {
          if (G.isCivilian(u)) {
            sx -= sz * 0.34;
            sy += sz * 0.3;
          } else {
            sx += sz * 0.14;
            sy -= sz * 0.1;
          }
        } else if (s.tiles[ui].c >= 0) sy += sz * 0.12;
      }
      drawUnit(u, sx, sy, sz, {
        sel: sel && sel.id === u.id,
        dim: u.owner === human.id && u.mp <= 0,
        water: G.isWater(ui) && !moving,
        ready: u.owner === human.id && G.needsOrders(u),
      });
    }
    // 10 路径预览
    if (R.ov.path && R.ov.path.length) {
      const pts = R.ov.path.map((p) => R.screen(p.i));
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(2, sz * 0.07);
      ctx.setLineDash([sz * 0.18, sz * 0.14]);
      ctx.beginPath();
      if (sel) {
        const [sx, sy] = R.screen(sel.y * s.W + sel.x);
        ctx.moveTo(sx, sy);
      }
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      R.ov.path.forEach((p, k) => {
        if (!p.endTurn && k !== R.ov.path.length - 1) return;
        const [x, y] = pts[k];
        ctx.fillStyle = p.attack ? '#ff453a' : '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, sz * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p.attack ? '#fff' : '#1d1d1f';
        ctx.font = `700 ${Math.round(sz * 0.24)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.attack ? '⚔' : String(p.turn), x, y + 1);
      });
    }
    // 11 城市名牌
    R.banners = [];
    for (const c of Object.values(s.cities)) {
      const i = c.y0 * s.W + c.x;
      if (!pos.has(i)) continue;
      const [x, y] = pos.get(i);
      drawBanner(c, x, y, sz);
    }
    // 12 特效
    R.fx = R.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of R.fx) {
      const t = (now - f.t0) / f.dur;
      if (t < 0) continue;
      if (f.line) {
        const [ax, ay] = R.screen(f.line[0]);
        const [bx, by] = R.screen(f.line[1]);
        ctx.strokeStyle = `rgba(255,214,10,${1 - t})`;
        ctx.lineWidth = Math.max(2, sz * 0.1);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (bx - ax) * Math.min(1, t * 2.5), ay + (by - ay) * Math.min(1, t * 2.5));
        ctx.stroke();
        continue;
      }
      const [x, y] = R.screen(f.i);
      ctx.globalAlpha = t < 0.75 ? 1 : (1 - t) / 0.25;
      ctx.font = `700 ${Math.round(Math.max(13, sz * 0.42))}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      const yy = y - sz * 0.6 - t * sz * 0.9;
      ctx.strokeText(f.text, x, yy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, yy);
      ctx.globalAlpha = 1;
    }
    drawMini(s, human, reveal);
  };

  // ---------- 小地图 ----------
  function drawMini(s, human, reveal) {
    if (!mini || !mini.clientWidth) return;
    const mw = mini.clientWidth, mh = mini.clientHeight;
    if (mini.width !== Math.round(mw * dpr)) {
      mini.width = Math.round(mw * dpr);
      mini.height = Math.round(mh * dpr);
      miniDirty = true;
    }
    const fw = SQ3 * BASE * (s.W + 0.5), fh = 1.5 * BASE * (s.H + 0.4);
    const k = Math.min(mw / fw, mh / fh);
    const ox = (mw - fw * k) / 2, oy = (mh - fh * k) / 2;
    R.miniMap = { k, ox, oy };
    if (miniDirty || !miniBase) {
      miniDirty = false;
      miniBase = miniBase || document.createElement('canvas');
      miniBase.width = mini.width;
      miniBase.height = mini.height;
      const b = miniBase.getContext('2d');
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = '#1c2230';
      b.fillRect(0, 0, mw, mh);
      const cw = SQ3 * BASE * k + 0.8, ch = 1.5 * BASE * k + 0.8;
      for (let i = 0; i < s.tiles.length; i++) {
        if (!human.explored[i] && !reveal) continue;
        const t = s.tiles[i];
        const x = i % s.W, y = Math.floor(i / s.W);
        const px = ox + SQ3 * BASE * (x + 0.5 * (y & 1)) * k, py = oy + 1.5 * BASE * y * k;
        b.fillStyle = t.o >= 0 ? s.civs[t.o].color : C.TERRAIN[t.t].color;
        b.fillRect(px - cw / 2, py - ch / 2, cw, ch);
      }
      for (const c of Object.values(s.cities)) {
        const i = c.y0 * s.W + c.x;
        if (!human.explored[i] && !reveal) continue;
        const px = ox + SQ3 * BASE * (c.x + 0.5 * (c.y0 & 1)) * k, py = oy + 1.5 * BASE * c.y0 * k;
        b.fillStyle = '#ffffff';
        b.fillRect(px - 2, py - 2, 4, 4);
      }
    }
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.drawImage(miniBase, 0, 0);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const z = R.cam.z;
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth = 1.5;
    mctx.strokeRect(ox + (R.cam.x - W / 2 / z) * k, oy + (R.cam.y - H / 2 / z) * k, (W / z) * k, (H / z) * k);
  }
  R.miniToWorld = function (px, py) {
    const m = R.miniMap;
    if (!m) return null;
    return { x: (px - m.ox) / m.k, y: (py - m.oy) / m.k };
  };
})();
