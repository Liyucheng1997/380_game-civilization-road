// 寻路：考虑移动力、多回合行进、登船、堆叠与边界
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;

  function expand(u, opts, onState) {
    const G = C.G;
    const s = G.state();
    const start = G.uidx(u);
    const landMax = G.landMoves(u);
    const fullAt = (i) => (G.isWater(i) ? 3 : landMax);
    const best = new Map();
    const prev = new Map();
    const closed = new Set();
    const heap = new C.Heap();
    best.set(start, { turn: 0, mp: u.mp });
    heap.push(start, 0);
    const target = opts.target;
    const limit = opts.maxNodes || 5000;
    let n = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (cur === target) break;
      if (++n > limit) break;
      const cs = best.get(cur);
      if (onState) onState(cur, cs);
      const curPass = cur !== start && G.occupancy(u, cur) === 'pass';
      for (const nb of Hex.neighbors(cur)) {
        if (closed.has(nb)) continue;
        const isFinal = nb === target;
        const occ = G.occupancy(u, nb);
        if (occ === 'block') continue;
        if (occ === 'final' && !isFinal) continue;
        if (occ === 'pass' && isFinal) continue;
        let c;
        if (occ === 'final') c = 1;
        else {
          c = G.stepCost(u, cur, nb);
          if (c === Infinity) continue;
        }
        let turn = cs.turn, mp = cs.mp;
        const full = fullAt(cur);
        if (c === -1) {
          if (mp <= 0) {
            turn++;
            mp = full;
          }
          mp = 0;
        } else {
          if (mp < c && mp < full) {
            turn++;
            mp = full;
          }
          mp = Math.max(0, mp - c);
        }
        if (curPass && turn > cs.turn) continue; // 不能在有己方同类单位的格子过夜
        if (opts.thisTurn && turn > 0) continue;
        if (opts.maxTurns != null && turn > opts.maxTurns) continue;
        if (occ === 'pass' && mp === 0) continue;
        const old = best.get(nb);
        if (old && (old.turn < turn || (old.turn === turn && old.mp >= mp))) continue;
        best.set(nb, { turn, mp });
        prev.set(nb, cur);
        const g = turn * landMax + (landMax - mp);
        heap.push(nb, g + (target != null ? Hex.distI(nb, target) : 0));
      }
    }
    return { best, prev, start };
  }

  C.Path = {
    // 返回 {path: [格子...不含起点], turns}；不可达返回 null
    find(u, target, opts) {
      opts = Object.assign({}, opts || {}, { target });
      if (C.G.uidx(u) === target) return { path: [], turns: 0 };
      const r = expand(u, opts);
      if (!r.best.has(target)) return null;
      const path = [];
      let c = target;
      while (c !== r.start) {
        path.push(c);
        c = r.prev.get(c);
        if (c == null) return null;
      }
      path.reverse();
      return { path, turns: r.best.get(target).turn, states: path.map((i) => r.best.get(i)) };
    },
    // 本回合可到达的格子：Map(格子 -> 剩余移动力)
    reachable(u) {
      const out = new Map();
      if (u.mp <= 0) return out;
      const r = expand(u, { thisTurn: true, maxNodes: 600 });
      for (const [i, st] of r.best) {
        if (i === r.start) continue;
        if (C.G.occupancy(u, i) === 'ok') out.set(i, st.mp);
      }
      return out;
    },
  };
})();
