// 地图生成：大陆 + 气候 + 地貌 + 资源 + 出生点 + 部落村庄 + 蛮族营地
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;

  function resourceFits(res, t) {
    if (!res.on.includes(t.t)) return false;
    if (res.flat && t.h) return false;
    if (res.hills && !t.h) return false;
    if (res.feat) return t.f === res.feat;
    return !t.f;
  }

  const RES_WEIGHTS = { wheat: 3, rice: 2, cattle: 3, sheep: 3, deer: 3, stone: 2, horses: 2.5, iron: 2.5, wine: 1.5, spices: 1.5, silk: 1.5, gems: 1 };

  function tileValue(t) {
    const T = C.TERRAIN[t.t];
    if (T.impassable) return 0;
    let f = T.food, p = T.prod, g = T.gold;
    if (t.h) p += 1;
    if (t.f) {
      const F = C.FEATURES[t.f];
      f += F.food;
      p += F.prod;
      g += F.gold;
    }
    let v = f * 1.5 + p + g * 0.5;
    if (t.r) v += 1.5;
    if (T.deep) v -= 0.8;
    return v;
  }

  C.MapGen = {
    resourceFits,
    tileValue,
    generate(W, H, seed, numCivs) {
      Hex.setSize(W, H);
      const rnd = C.makeRng(seed);
      const nE = C.makeNoise(seed), nE2 = C.makeNoise(seed + 7);
      const nM = C.makeNoise(seed + 101), nT = C.makeNoise(seed + 202);
      const nF = C.makeNoise(seed + 303), nR = C.makeNoise(seed + 404), nH = C.makeNoise(seed + 505);
      const N = W * H;
      const elev = new Float32Array(N);
      const tiles = new Array(N);

      // 两种布局：单块大陆 / 双大陆（中间有海峡，需要航海）
      const layout = rnd() < 0.7 ? 'pangaea' : 'continents';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const px = x + 0.5 * (y & 1), py = y * 0.866;
          const nx = px / W, ny = py / (H * 0.866);
          let e = 0.7 * nE(px / 8, py / 8, 5) + 0.3 * nE2(px / 3, py / 3, 3);
          const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
          const d = Math.sqrt(dx * dx * 0.85 + dy * dy * 1.15);
          e -= d * d * 0.42;
          if (layout === 'continents') e -= Math.max(0, 0.16 - Math.abs(nx - 0.5 + (nE2(py / 5, 3) - 0.5) * 0.15)) * 2.2;
          if (x < 1 || x >= W - 1 || y < 1 || y >= H - 1) e -= 1;
          else if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) e -= 0.15;
          elev[i] = e;
        }
      }
      const sorted = Array.from(elev).sort((a, b) => a - b);
      const seaLevel = sorted[Math.floor(N * 0.56)];

      // 地形
      const ridge = new Float32Array(N);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const px = x + 0.5 * (y & 1), py = y * 0.866;
          const land = elev[i] > seaLevel;
          const t = { t: 'ocean', h: 0, f: null, r: null, imp: null, o: -1, oc: -1, c: -1, hut: 0, camp: 0 };
          tiles[i] = t;
          if (!land) continue;
          const lat = Math.abs(py / (H * 0.866) - 0.5) * 2;
          const temp = 1 - lat * 1.12 + (nT(px / 6, py / 6) - 0.5) * 0.35;
          const moist = nM(px / 7, py / 7, 4);
          if (temp < 0.1) t.t = 'snow';
          else if (temp < 0.27) t.t = 'tundra';
          else if (temp > 0.55 && moist < 0.37) t.t = 'desert';
          else if (moist > 0.5) t.t = 'grass';
          else t.t = 'plains';
          ridge[i] = 1 - Math.abs(nR(px / 5, py / 5, 4) * 2 - 1);
          t._moist = moist;
          t._temp = temp;
          t._hn = nH(px / 3, py / 3, 2);
          t._fn = nF(px / 4, py / 4, 3);
        }
      }
      // 山脉与丘陵按分位数控制比例
      const landIdx = [];
      for (let i = 0; i < N; i++) if (tiles[i].t !== 'ocean') landIdx.push(i);
      const rs = landIdx.map((i) => ridge[i]).sort((a, b) => a - b);
      const mThr = rs[Math.floor(rs.length * 0.93)] || 2;
      const hThr = rs[Math.floor(rs.length * 0.74)] || 2;
      for (const i of landIdx) {
        const t = tiles[i];
        if (ridge[i] >= mThr && t.t !== 'snow') t.t = 'mountain';
        else if (ridge[i] >= hThr || t._hn > 0.66) t.h = 1;
      }
      // 地貌
      for (const i of landIdx) {
        const t = tiles[i];
        if (t.t === 'mountain' || t.t === 'snow') continue;
        if (t.t === 'desert') {
          if (!t.h && rnd() < 0.04) t.f = 'oasis';
          continue;
        }
        if (t._temp > 0.72 && t._moist > 0.56 && t._fn > 0.48 && (t.t === 'grass' || t.t === 'plains')) t.f = 'jungle';
        else if (t._fn > 0.57 && t._moist > 0.36) t.f = 'forest';
      }
      // 海岸
      for (let i = 0; i < N; i++) {
        const t = tiles[i];
        if (t.t !== 'ocean') continue;
        for (const j of Hex.neighbors(i)) {
          if (!C.TERRAIN[tiles[j].t].water) {
            t.t = 'coast';
            break;
          }
        }
      }
      for (const t of tiles) {
        delete t._moist;
        delete t._temp;
        delete t._hn;
        delete t._fn;
      }

      // 资源
      const resIds = Object.keys(C.RESOURCES);
      for (let i = 0; i < N; i++) {
        const t = tiles[i];
        if (t.t === 'coast') {
          const r = rnd();
          if (r < 0.1) t.r = 'fish';
          else if (r < 0.13) t.r = 'pearls';
          continue;
        }
        if (C.TERRAIN[t.t].water || t.t === 'mountain' || t.t === 'snow' || t.f === 'oasis') continue;
        if (rnd() > 0.15) continue;
        const opts = resIds.filter((id) => RES_WEIGHTS[id] && resourceFits(C.RESOURCES[id], t));
        if (!opts.length) continue;
        let sum = 0;
        for (const id of opts) sum += RES_WEIGHTS[id];
        let k = rnd() * sum;
        for (const id of opts) {
          k -= RES_WEIGHTS[id];
          if (k <= 0) {
            t.r = id;
            break;
          }
        }
      }

      // 陆地连通块
      const passable = (i) => !C.TERRAIN[tiles[i].t].water && tiles[i].t !== 'mountain';
      const lm = new Int32Array(N).fill(-1);
      const sizes = [];
      for (let i = 0; i < N; i++) {
        if (lm[i] >= 0 || !passable(i)) continue;
        const id = sizes.length;
        let cnt = 0;
        const stack = [i];
        lm[i] = id;
        while (stack.length) {
          const c = stack.pop();
          cnt++;
          for (const j of Hex.neighbors(c)) {
            if (lm[j] < 0 && passable(j)) {
              lm[j] = id;
              stack.push(j);
            }
          }
        }
        sizes.push(cnt);
      }
      // 可定居的陆块：从大到小
      const order = sizes.map((s, id) => [s, id]).sort((a, b) => b[0] - a[0]);
      const bigLands = new Set(order.filter((o) => o[0] >= Math.max(40, order[0][0] * 0.25)).map((o) => o[1]));

      // 出生点
      const score = (i) => {
        let v = 0;
        for (const j of Hex.rangeI(i, 2)) v += tileValue(tiles[j]) * (j === i ? 0.5 : 1);
        return v;
      };
      const cand = [];
      for (let i = 0; i < N; i++) {
        const t = tiles[i];
        const [x, y] = Hex.xy(i);
        if (!passable(i) || !bigLands.has(lm[i])) continue;
        if (x < 3 || y < 3 || x >= W - 3 || y >= H - 3) continue;
        if (t.t === 'snow' || t.t === 'tundra' || t.t === 'desert') continue;
        cand.push([score(i) + rnd() * 3, i]);
      }
      cand.sort((a, b) => b[0] - a[0]);
      const pool = cand.slice(0, Math.max(numCivs * 4, Math.floor(cand.length * 0.5))).map((c) => c[1]);
      let starts = [];
      let minD = Math.floor(Math.sqrt(landIdx.length / numCivs) * 1.05);
      while (starts.length < numCivs && minD >= 3) {
        starts = [];
        for (const i of pool) {
          if (starts.every((s) => Hex.distI(s, i) >= minD)) starts.push(i);
          if (starts.length >= numCivs) break;
        }
        minD--;
      }
      while (starts.length < numCivs) starts.push(pool[starts.length % pool.length]);
      // 出生点平衡：保证附近有食物资源
      for (const s of starts) {
        const st = tiles[s];
        if (st.f === 'jungle' || st.f === 'forest') st.f = null;
        st.r = st.r && C.RESOURCES[st.r].imp === 'mine' ? null : st.r;
        const near = Hex.rangeI(s, 2).filter((j) => j !== s);
        let food = near.filter((j) => tiles[j].r && C.RESOURCES[tiles[j].r].yields.food).length;
        for (const j of near) {
          if (food >= 2) break;
          const t = tiles[j];
          if (t.r || !passable(j) || t.f) continue;
          if (t.t === 'grass' || t.t === 'plains') {
            t.r = t.h ? 'sheep' : rnd() < 0.5 ? 'wheat' : 'cattle';
            food++;
          }
        }
        // 至少两块草原/平原
        let good = near.filter((j) => tiles[j].t === 'grass' || tiles[j].t === 'plains').length;
        for (const j of near) {
          if (good >= 5) break;
          const t = tiles[j];
          if (t.t === 'desert' || t.t === 'tundra') {
            t.t = 'plains';
            if (t.f === 'oasis') t.f = null;
            if (t.r && !resourceFits(C.RESOURCES[t.r], t)) t.r = null;
            good++;
          }
        }
      }

      // 部落村庄
      const huts = [];
      const nHuts = Math.floor(landIdx.length / 32);
      for (let tries = 0; tries < nHuts * 20 && huts.length < nHuts; tries++) {
        const i = landIdx[rnd.int(landIdx.length)];
        if (!passable(i) || tiles[i].hut) continue;
        if (starts.some((s) => Hex.distI(s, i) < 4)) continue;
        if (huts.some((h) => Hex.distI(h, i) < 4)) continue;
        tiles[i].hut = 1;
        huts.push(i);
      }
      // 蛮族营地
      const camps = [];
      for (let tries = 0; tries < 2000 && camps.length < numCivs; tries++) {
        const i = landIdx[rnd.int(landIdx.length)];
        if (!passable(i) || tiles[i].hut) continue;
        if (starts.some((s) => Hex.distI(s, i) < 8)) continue;
        if (camps.some((h) => Hex.distI(h, i) < 7)) continue;
        tiles[i].camp = 1;
        tiles[i].r = null;
        camps.push(i);
      }
      return { tiles, starts, camps, layout };
    },
  };
})();
