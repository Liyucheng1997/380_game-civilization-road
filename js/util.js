// 工具：随机数、噪声、六边形坐标（尖顶六边形，奇数行右移 odd-r）
(function () {
  const C = (globalThis.Civ = globalThis.Civ || {});

  // ---------- 可存档的随机数（mulberry32） ----------
  C.rngStep = function (state) {
    const a = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return { state: a, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  };
  C.makeRng = function (seed) {
    let s = seed | 0;
    const r = () => {
      const o = C.rngStep(s);
      s = o.state;
      return o.value;
    };
    r.int = (n) => Math.floor(r() * n);
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return r;
  };

  // ---------- 值噪声 + 分形 ----------
  C.makeNoise = function (seed) {
    function hash(ix, iy) {
      let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653)) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function noise(x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    }
    return function fbm(x, y, oct) {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let i = 0; i < (oct || 4); i++) {
        sum += noise(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
      }
      return sum / norm;
    };
  };

  // ---------- 六边形 ----------
  const SQ3 = Math.sqrt(3);
  // 方向顺序：东、东南、西南、西、西北、东北（与六边形第 i 条边对应）
  const DIR_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  const DIR_ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

  const Hex = (C.Hex = {
    W: 0,
    H: 0,
    setSize(w, h) {
      Hex.W = w;
      Hex.H = h;
      Hex._nb = null;
    },
    idx: (x, y) => y * Hex.W + x,
    xy: (i) => [i % Hex.W, Math.floor(i / Hex.W)],
    inMap: (x, y) => x >= 0 && y >= 0 && x < Hex.W && y < Hex.H,
    toCube(x, y) {
      const q = x - (y - (y & 1)) / 2;
      return [q, y, -q - y];
    },
    fromAxial(q, r) {
      return [q + (r - (r & 1)) / 2, r];
    },
    dist(x1, y1, x2, y2) {
      const a = Hex.toCube(x1, y1), b = Hex.toCube(x2, y2);
      return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2;
    },
    distI(i, j) {
      return Hex.dist(i % Hex.W, Math.floor(i / Hex.W), j % Hex.W, Math.floor(j / Hex.W));
    },
    // 邻居（按方向，越界为 -1）
    neighborDir(x, y, d) {
      const off = (y & 1 ? DIR_ODD : DIR_EVEN)[d];
      const nx = x + off[0], ny = y + off[1];
      return Hex.inMap(nx, ny) ? ny * Hex.W + nx : -1;
    },
    neighbors(i) {
      if (!Hex._nb || Hex._nb.length !== Hex.W * Hex.H) Hex._buildNb();
      return Hex._nb[i];
    },
    _buildNb() {
      const n = Hex.W * Hex.H;
      Hex._nb = new Array(n);
      for (let i = 0; i < n; i++) {
        const x = i % Hex.W, y = Math.floor(i / Hex.W);
        const out = [];
        for (let d = 0; d < 6; d++) {
          const j = Hex.neighborDir(x, y, d);
          if (j >= 0) out.push(j);
        }
        Hex._nb[i] = out;
      }
    },
    // 半径 r 内的所有格子
    range(x, y, r) {
      const out = [];
      const [cq, cr] = Hex.toCube(x, y);
      for (let dq = -r; dq <= r; dq++) {
        for (let dr = Math.max(-r, -dq - r); dr <= Math.min(r, -dq + r); dr++) {
          const [ox, oy] = Hex.fromAxial(cq + dq, cr + dr);
          if (Hex.inMap(ox, oy)) out.push(oy * Hex.W + ox);
        }
      }
      return out;
    },
    rangeI(i, r) {
      return Hex.range(i % Hex.W, Math.floor(i / Hex.W), r);
    },
    // 像素（尖顶六边形，size 为外接圆半径）
    toPixel(x, y, size) {
      return [SQ3 * size * (x + 0.5 * (y & 1)), 1.5 * size * y];
    },
    fromPixel(px, py, size) {
      const q = ((SQ3 / 3) * px - py / 3) / size;
      const r = ((2 / 3) * py) / size;
      let cx = q, cz = r, cy = -cx - cz;
      let rx = Math.round(cx), ry = Math.round(cy), rz = Math.round(cz);
      const dx = Math.abs(rx - cx), dy = Math.abs(ry - cy), dz = Math.abs(rz - cz);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy > dz) ry = -rx - rz;
      else rz = -rx - ry;
      return Hex.fromAxial(rx, rz);
    },
    corner(cx, cy, size, i) {
      const a = (Math.PI / 180) * (60 * i - 30);
      return [cx + size * Math.cos(a), cy + size * Math.sin(a)];
    },
  });

  // ---------- 二叉堆（A* 用） ----------
  C.Heap = class {
    constructor() {
      this.a = [];
    }
    get size() {
      return this.a.length;
    }
    push(item, pri) {
      const a = this.a;
      a.push([pri, item]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top[1];
    }
  };

  // 年份显示
  C.yearOf = function (turn) {
    let y;
    if (turn <= 60) y = -4000 + (turn - 1) * 50;
    else if (turn <= 120) y = -1050 + (turn - 60) * 25;
    else if (turn <= 170) y = 450 + (turn - 120) * 20;
    else if (turn <= 220) y = 1450 + (turn - 170) * 8;
    else if (turn <= 270) y = 1850 + (turn - 220) * 3;
    else y = 2000 + (turn - 270);
    return y < 0 ? `公元前 ${-y} 年` : `公元 ${y} 年`;
  };
})();
