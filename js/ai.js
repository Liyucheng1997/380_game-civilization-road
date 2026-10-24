// 电脑对手：外交、研究、城市生产、单位行动、蛮族
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;
  const G = C.G;
  const AI = (C.AI = {});
  const S = () => G.state();
  const cIdx = (c) => c.y0 * S().W + c.x;

  const TECH_W = {
    pottery: 1.3, mining: 1.3, writing: 1.6, bronze: 1.2, currency: 1.4, education: 1.5, apprenticeship: 1.3,
    banking: 1.3, scientific_theory: 1.5, industrialization: 1.4, electricity: 1.4, computers: 1.5,
    rocketry: 1.7, satellites: 2, sailing: 0.7, cartography: 0.6,
  };
  const CIVIC_W = { code_of_laws: 1.5, early_empire: 1.4, political_philosophy: 1.5, craftsmanship: 1.2, drama: 1.2, guilds: 1.3, globalization: 2 };
  const MIL_TECH = new Set(Object.values(C.UNITS).filter((d) => d.tech && d.str).map((d) => d.tech));

  AI.atWarAny = (civ) => S().civs.some((o) => o.alive && !o.isBarb && G.atWar(civ.id, o.id));

  AI.bestTech = function (civ, noRand) {
    const war = AI.atWarAny(civ);
    let best = null, bv = Infinity;
    for (const t of C.TECHS) {
      if (!G.techAvailable(civ, t.id)) continue;
      let w = TECH_W[t.id] || 1;
      if (war && MIL_TECH.has(t.id)) w *= 1.5;
      const v = ((G.techCost(t.id) - (civ.techProg[t.id] || 0)) / w) * (noRand ? 1 : 0.8 + 0.4 * G.rand());
      if (v < bv) {
        bv = v;
        best = t.id;
      }
    }
    return best;
  };
  AI.bestCivic = function (civ, noRand) {
    let best = null, bv = Infinity;
    for (const t of C.CIVICS) {
      if (!G.civicAvailable(civ, t.id)) continue;
      const w = CIVIC_W[t.id] || 1;
      const v = ((G.civicCost(t.id) - (civ.civicProg[t.id] || 0)) / w) * (noRand ? 1 : 0.8 + 0.4 * G.rand());
      if (v < bv) {
        bv = v;
        best = t.id;
      }
    }
    return best;
  };

  AI.takeTurn = function (civ) {
    const s = S();
    AI.diplomacy(civ);
    if (!civ.curTech) {
      const t = AI.bestTech(civ);
      if (t) G.setResearch(civ, t);
    }
    if (!civ.curCivic) {
      const t = AI.bestCivic(civ);
      if (t) G.setCivic(civ, t);
    }
    civ._threat = AI.threats(civ);
    civ._warTarget = AI.pickWarTarget(civ);
    for (const city of G.citiesOf(civ.id)) if (!city.build) city.build = AI.chooseBuild(city);
    AI.spendGold(civ);
    AI.assignGarrisons(civ);
    const order = { ranged: 0, siege: 1, cavalry: 2, melee: 3, anticav: 3, recon: 4, civilian: 5 };
    const units = G.unitsOf(civ.id).sort((a, b) => order[C.UNITS[a.type].cls] - order[C.UNITS[b.type].cls]);
    for (const u of units) {
      if (!s.units[u.id]) continue;
      AI.act(u);
    }
    for (const city of G.citiesOf(civ.id)) AI.cityFire(city);
    G.updateVis(civ);
  };

  // ---------- 外交 ----------
  AI.civDistance = function (a, b) {
    let d = 99;
    const ca = G.citiesOf(a.id), cb = G.citiesOf(b.id);
    for (const x of ca) for (const y of cb) d = Math.min(d, Hex.dist(x.x, x.y0, y.x, y.y0));
    return d;
  };
  AI.diplomacy = function (civ) {
    const s = S();
    const dif = C.DIFFICULTY[s.difficulty];
    const myPow = G.militaryPower(civ);
    const wars = s.civs.filter((o) => o.alive && !o.isBarb && G.atWar(civ.id, o.id));
    for (const o of s.civs) {
      if (o === civ || !o.alive || o.isBarb || !civ.met[o.id]) continue;
      const theirPow = G.militaryPower(o);
      if (G.atWar(civ.id, o.id)) {
        const wt = s.turn - (civ.warSince[o.id] ?? s.turn);
        if (wt < 8) continue;
        if (myPow < theirPow * 0.9 || wt > 30 || G.rand() < 0.03) {
          if (o.isHuman) {
            if (G.rand() < 0.3 && !s.offers.some((x) => x.from === civ.id)) s.offers.push({ from: civ.id, kind: 'peace', turn: s.turn });
          } else if (G.peaceAcceptable(o, civ)) G.makePeace(civ.id, o.id);
        }
      } else {
        if (wars.length || s.turn < dif.warTurn) continue;
        if (s.turn - (civ.peaceTurn[o.id] ?? -99) < 15) continue;
        if (myPow < theirPow * dif.warRatio || myPow < 60) continue;
        if (AI.civDistance(civ, o) > 14) continue;
        if (G.rand() < 0.04 * dif.aggro * civ.personality) {
          G.declareWar(civ.id, o.id);
          break;
        }
      }
    }
  };
  AI.pickWarTarget = function (civ) {
    let best = null, bd = 99;
    for (const o of S().civs) {
      if (o === civ || !o.alive || o.isBarb || !G.atWar(civ.id, o.id)) continue;
      const d = AI.civDistance(civ, o);
      if (d < bd) {
        bd = d;
        best = o.id;
      }
    }
    return best;
  };
  AI.threats = function (civ) {
    const out = {};
    const enemies = Object.values(S().units).filter((u) => u.owner !== civ.id && G.isMilitary(u) && G.atWar(civ.id, u.owner));
    for (const c of G.citiesOf(civ.id)) {
      out[c.id] = enemies.filter((u) => Hex.dist(u.x, u.y, c.x, c.y0) <= 4).length;
    }
    return out;
  };

  // ---------- 城市 ----------
  AI.targetCities = function (civ) {
    const s = S();
    const per = s.landTiles / G.majors().length;
    let n = Math.round(per / 24);
    if (s.difficulty === 'easy') n -= 1;
    if (s.difficulty === 'hard') n += 1;
    return Math.max(3, Math.min(10, n));
  };
  AI.improvableCount = function (civ) {
    const s = S();
    let n = 0;
    for (let i = 0; i < s.tiles.length; i++) if (s.tiles[i].o === civ.id && G.improvementFor(civ, i)) n++;
    return n;
  };
  // forRec：用于界面“推荐”标记时不使用随机数，避免闪烁
  AI.chooseBuild = function (city, forRec) {
    const s = S();
    const rnd = forRec ? () => 0.5 : G.rand;
    const civ = s.civs[city.owner];
    const opts = G.buildOptions(city);
    if (!opts.length) return null;
    const has = (kind, id) => opts.some((o) => o.kind === kind && o.id === id);
    const pick = (kind, id) => ({ kind, id });
    const cities = G.citiesOf(civ.id);
    const units = G.unitsOf(civ.id);
    const military = units.filter((u) => G.isMilitary(u) && C.UNITS[u.type].cls !== 'recon').length;
    const building = (id) => cities.filter((c) => c !== city && c.build && c.build.id === id).length;
    const settlers = units.filter((u) => u.type === 'settler').length + building('settler');
    const builders = units.filter((u) => u.type === 'builder').length + building('builder');
    const war = AI.atWarAny(civ);
    const threat = (civ._threat && civ._threat[city.id]) || 0;
    const garrison = G.militaryAt(cIdx(city));
    const bestUnit = (classes) => {
      let b = null;
      for (const o of opts) {
        if (o.kind !== 'unit' || !classes.includes(C.UNITS[o.id].cls)) continue;
        if (!b || C.UNITS[o.id].str > C.UNITS[b].str) b = o.id;
      }
      return b;
    };
    if (threat > 0 && (!garrison || threat >= 2)) {
      const u = bestUnit(['ranged']) || bestUnit(['melee', 'anticav']);
      if (u && rnd() < 0.7) return pick('unit', u);
      if (has('building', 'walls')) return pick('building', 'walls');
      if (u) return pick('unit', u);
    }
    if (military < Math.min(cities.length, 2) || (!garrison && military < cities.length)) {
      const u = bestUnit(['melee', 'anticav']) || bestUnit(['ranged']);
      if (u) return pick('unit', u);
    }
    if (s.turn < 25 && !units.some((u) => u.type === 'scout') && cities.length === 1 && has('unit', 'scout') && rnd() < 0.3) return pick('unit', 'scout');
    if (has('unit', 'settler') && cities.length + settlers < AI.targetCities(civ) && settlers < 1 + Math.floor(cities.length / 3) && s.turn < 180 && !threat && AI.hasSite(civ)) {
      return pick('unit', 'settler');
    }
    if (has('unit', 'builder') && builders < Math.ceil(cities.length * 0.8) && AI.improvableCount(civ) > builders * 3) return pick('unit', 'builder');
    for (const p of ['mars', 'moon', 'satellite']) if (has('project', p)) return pick('project', p);
    if (has('building', 'spaceport')) {
      const top = cities.slice().sort((a, b) => (b.yields ? b.yields.prod : 0) - (a.yields ? a.yields.prod : 0)).slice(0, 3);
      const ports = cities.filter((c) => c.buildings.spaceport || (c.build && c.build.id === 'spaceport')).length;
      if (top.includes(city) && ports < 3) return pick('building', 'spaceport');
    }
    const wantMil = Math.ceil(cities.length * (war ? 2.2 : 1.2)) + (war ? 2 : 0) + Math.floor(s.turn / 70);
    if (military < wantMil && military < cities.length * 3 + 2) {
      const r = rnd();
      let u = null;
      if (war && r < 0.25) u = bestUnit(['siege']);
      if (!u && r < 0.55) u = bestUnit(['melee', 'anticav']);
      if (!u && r < 0.8) u = bestUnit(['ranged']);
      if (!u) u = bestUnit(['cavalry']) || bestUnit(['melee', 'anticav']) || bestUnit(['ranged']);
      if (u) return pick('unit', u);
    }
    const prod = city.yields ? city.yields.prod : 2;
    const wonders = opts.filter((o) => o.kind === 'wonder' && o.turns <= 30);
    if (wonders.length && prod >= 7 && rnd() < 0.3) return pick('wonder', wonders[Math.floor(rnd() * wonders.length)].id);
    const PRI = ['monument', 'granary', 'library', 'market', 'walls', 'workshop', 'amphitheater', 'university', 'barracks', 'bank', 'museum', 'factory', 'lab', 'power_plant', 'broadcast'];
    for (const b of PRI) {
      if (!has('building', b)) continue;
      if (b === 'walls' && !war && !city.capital && s.turn < 80) continue;
      if (b === 'barracks' && !war) continue;
      return pick('building', b);
    }
    if (wonders.length) return pick('wonder', wonders[0].id);
    const u = bestUnit(['melee', 'anticav', 'ranged', 'cavalry']);
    if (u && military < cities.length * 3 + 2) return pick('unit', u);
    const anyW = opts.find((o) => o.kind === 'wonder');
    if (anyW) return pick('wonder', anyW.id);
    if (has('unit', 'builder')) return pick('unit', 'builder');
    return pick(opts[0].kind, opts[0].id);
  };
  AI.spendGold = function (civ) {
    const s = S();
    const cities = G.citiesOf(civ.id);
    const reserve = 60 + 20 * cities.length;
    for (const city of cities) {
      if (civ.gold < 80) return;
      const threat = (civ._threat && civ._threat[city.id]) || 0;
      if (threat && !G.militaryAt(cIdx(city))) {
        const opts = G.buildOptions(city).filter((o) => o.kind === 'unit' && ['melee', 'anticav', 'ranged'].includes(C.UNITS[o.id].cls) && o.gold <= civ.gold);
        opts.sort((a, b) => C.UNITS[b.id].str - C.UNITS[a.id].str);
        if (opts.length) G.purchase(city, 'unit', opts[0].id);
      }
    }
    for (const city of cities.slice().sort((a, b) => (a.yields ? a.yields.prod : 0) - (b.yields ? b.yields.prod : 0))) {
      const b = city.build;
      if (!b || (b.kind !== 'building' && b.kind !== 'unit') || b.id === 'settler') continue;
      const cost = G.purchaseCost(civ, b.kind, b.id);
      if (cost == null || civ.gold - cost < reserve) continue;
      if ((G.buildTurns(city) || 0) <= 3) continue;
      G.purchase(city, b.kind, b.id);
    }
    for (const u of G.unitsOf(civ.id)) {
      const info = G.upgradeInfo(u);
      if (info && civ.gold - info.cost >= reserve && G.canUpgrade(u)) G.upgradeUnit(u);
    }
  };
  AI.cityFire = function (city) {
    const ts = G.cityTargets(city);
    let best = null, bv = -1;
    for (const i of ts) {
      const p = G.predictCityFire(city, i);
      if (!p) continue;
      const v = p.dmgDef + (p.dmgDef >= p.defHp ? 100 : 0);
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    if (best != null) G.cityFire(city, best);
  };

  // ---------- 选址 ----------
  AI.siteScore = function (civ, j) {
    const s = S();
    let v = 0;
    for (const k of Hex.rangeI(j, 2)) {
      const t = s.tiles[k];
      if (t.o >= 0 && t.o !== civ.id) continue;
      const y = G.tileYield(k, civ);
      v += y.food * 1.4 + y.prod * 1.1 + y.gold * 0.5 + y.sci + y.cul + (t.r ? 1 : 0);
      if (C.TERRAIN[t.t].deep) v -= 0.7;
    }
    const t = s.tiles[j];
    if (Hex.neighbors(j).some((n) => s.tiles[n].t === 'coast')) v += 2;
    if (t.t === 'desert' || t.t === 'tundra') v -= 4;
    if (t.h) v += 1.5;
    return v;
  };
  AI.findSite = function (civ, u, radius, from) {
    const here = u ? G.uidx(u) : from;
    const own = G.citiesOf(civ.id).map(cIdx);
    const others = G.unitsOf(civ.id).filter((x) => x.type === 'settler' && x !== u && x.target != null).map((x) => x.target);
    const cands = [];
    for (const j of Hex.rangeI(here, radius || 10)) {
      if (!G.canFoundAt(civ.id, j)) continue;
      if (others.some((t) => Hex.distI(t, j) < 4)) continue;
      let sc = AI.siteScore(civ, j) - Hex.distI(here, j) * 1.2;
      if (own.length) {
        const dc = Math.min(...own.map((c) => Hex.distI(c, j)));
        if (dc > 7) sc -= (dc - 7) * 3;
      }
      cands.push([sc, j]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    if (!u) return cands.length ? cands[0][1] : null;
    for (const [, j] of cands.slice(0, 6)) if (C.Path.find(u, j, { maxNodes: 2500 })) return j;
    return null;
  };
  AI.hasSite = function (civ) {
    const s = S();
    if (civ._siteTurn === s.turn) return civ._siteOk;
    civ._siteTurn = s.turn;
    const cities = G.citiesOf(civ.id);
    civ._siteOk = cities.some((c) => AI.findSite(civ, null, 9, cIdx(c)) != null);
    return civ._siteOk;
  };

  // ---------- 单位 ----------
  AI.act = function (u) {
    const cls = C.UNITS[u.type].cls;
    if (u.type === 'settler') return AI.settler(u);
    if (u.type === 'builder') return AI.builder(u);
    if (cls === 'recon') return AI.scout(u);
    return AI.military(u);
  };
  AI.enemyNear = function (civ, i, r) {
    for (const j of Hex.rangeI(i, r)) {
      const m = G.militaryAt(j);
      if (m && m.owner !== civ.id && G.atWar(civ.id, m.owner)) return true;
    }
    return false;
  };
  AI.nearestOwnCity = function (civ, i) {
    let best = null, bd = 999;
    for (const c of G.citiesOf(civ.id)) {
      const d = Hex.distI(cIdx(c), i);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  AI.moveTo = function (u, tgt) {
    if (u.mp <= 0 || tgt == null) return false;
    const p = C.Path.find(u, tgt, { maxNodes: 2500 });
    if (!p) return false;
    let steps = p.path;
    if (G.occupancy(u, tgt) === 'final') steps = steps.slice(0, -1);
    const def = C.UNITS[u.type];
    const stop = def.rng && G.occupancy(u, tgt) === 'final' ? (x) => Hex.distI(G.uidx(x), tgt) <= def.range : null;
    return G.moveAlong(u, steps, stop) > 0;
  };
  AI.retreat = function (u) {
    const civ = S().civs[u.owner];
    const c = AI.nearestOwnCity(civ, G.uidx(u));
    if (!c) return false;
    if (cIdx(c) === G.uidx(u)) return true;
    return AI.moveTo(u, cIdx(c));
  };

  AI.settler = function (u) {
    const s = S();
    const civ = s.civs[u.owner];
    const here = G.uidx(u);
    if (!G.citiesOf(civ.id).length) {
      if (G.canFoundAt(civ.id, here)) return G.foundCity(u);
      const j = AI.findSite(civ, u, 3);
      if (j != null) {
        AI.moveTo(u, j);
        if (s.units[u.id] && G.uidx(u) === j) G.foundCity(u);
      }
      return;
    }
    if (AI.enemyNear(civ, here, 2)) {
      AI.retreat(u);
      return;
    }
    let tgt = u.target;
    if (tgt == null || !G.canFoundAt(civ.id, tgt)) tgt = u.target = AI.findSite(civ, u);
    if (tgt == null) {
      u.idle = (u.idle || 0) + 1;
      if (G.canFoundAt(civ.id, here) && u.idle > 3) G.foundCity(u);
      else if (u.idle > 12) G.removeUnit(u);
      return;
    }
    if (tgt === here) return G.foundCity(u);
    if (!AI.moveTo(u, tgt)) {
      u.target = null;
      return;
    }
    if (s.units[u.id] && G.uidx(u) === tgt && u.mp > 0) G.foundCity(u);
  };

  AI.findWork = function (civ, u) {
    const s = S();
    const here = G.uidx(u);
    const taken = new Set(G.unitsOf(civ.id).filter((x) => x.type === 'builder' && x !== u && x.target != null).map((x) => x.target));
    const worked = new Set();
    for (const c of G.citiesOf(civ.id)) for (const j of c.worked || []) worked.add(j);
    let best = null, bv = -Infinity;
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (t.o !== civ.id || taken.has(i)) continue;
      const imp = G.improvementFor(civ, i);
      if (!imp) continue;
      if (G.unitsAt(i).some((x) => x.owner !== civ.id)) continue;
      const Y = C.IMPROVEMENTS[imp].yields;
      let gain = (Y.food || 0) * 1.3 + (Y.prod || 0) + (Y.gold || 0) * 0.6;
      if (t.imp) {
        const O = C.IMPROVEMENTS[t.imp].yields;
        gain -= (O.food || 0) * 1.3 + (O.prod || 0) + (O.gold || 0) * 0.6;
        if (gain <= 0) continue;
      }
      const v = gain + (worked.has(i) ? 2 : 0) + (t.r ? 1.5 : 0) - Hex.distI(here, i) * 0.35;
      if (v > bv) {
        bv = v;
        best = i;
      }
    }
    return best;
  };
  AI.builder = function (u) {
    const s = S();
    const civ = s.civs[u.owner];
    const here = G.uidx(u);
    if (AI.enemyNear(civ, here, 2)) {
      AI.retreat(u);
      return;
    }
    let tgt = u.target;
    if (tgt == null || s.tiles[tgt].o !== civ.id || !G.improvementFor(civ, tgt)) tgt = u.target = AI.findWork(civ, u);
    if (tgt == null) {
      AI.retreat(u);
      return;
    }
    if (tgt === here) {
      G.improve(u);
      return;
    }
    if (!AI.moveTo(u, tgt)) {
      u.target = null;
      return;
    }
    if (s.units[u.id] && G.uidx(u) === tgt && u.mp > 0) G.improve(u);
  };

  // 探索目标：最近的村庄或迷雾边缘
  AI.exploreTarget = function (u) {
    const s = S();
    const civ = s.civs[u.owner];
    const start = G.uidx(u);
    const seen = new Set([start]);
    let q = [start];
    let frontier = null;
    for (let depth = 0; depth < 25 && q.length; depth++) {
      const nq = [];
      for (const i of q) {
        for (const j of Hex.neighbors(i)) {
          if (seen.has(j)) continue;
          seen.add(j);
          if (!civ.explored[j]) {
            if (frontier == null && i !== start) frontier = i;
            continue;
          }
          if (!G.canEnter(u, j) || G.occupancy(u, j) !== 'ok') continue;
          if (s.tiles[j].hut) return j;
          nq.push(j);
        }
      }
      if (frontier != null && depth >= 3) return frontier;
      q = nq;
    }
    return frontier;
  };
  AI.autoExplore = function (u) {
    const s = S();
    for (let k = 0; k < 3 && s.units[u.id] && u.mp > 0; k++) {
      const t = AI.exploreTarget(u);
      if (t == null) {
        u.auto = null;
        G.notify(u.owner, '侦察单位已无可探索的区域', 'unit', G.uidx(u));
        return;
      }
      if (!AI.moveTo(u, t)) {
        u.auto = null;
        return;
      }
    }
  };
  AI.scout = function (u) {
    const civ = S().civs[u.owner];
    if (u.hp < 40 || AI.enemyNear(civ, G.uidx(u), 1)) {
      AI.retreat(u);
      return;
    }
    const t = AI.exploreTarget(u);
    if (t == null) {
      if (!AI.retreat(u)) u.fort = 1;
      return;
    }
    AI.moveTo(u, t);
    if (S().units[u.id] && u.mp > 0) {
      const t2 = AI.exploreTarget(u);
      if (t2 != null) AI.moveTo(u, t2);
    }
  };

  AI.assignGarrisons = function (civ) {
    civ._garrison = {};
    const free = G.unitsOf(civ.id).filter((u) => G.isMilitary(u) && C.UNITS[u.type].cls !== 'recon');
    const used = new Set();
    for (const c of G.citiesOf(civ.id)) {
      const m = G.militaryAt(cIdx(c));
      if (m && m.owner === civ.id) {
        civ._garrison[m.id] = cIdx(c);
        used.add(m.id);
      }
    }
    for (const c of G.citiesOf(civ.id)) {
      if (G.militaryAt(cIdx(c))) continue;
      let best = null, bd = 12;
      for (const u of free) {
        if (used.has(u.id)) continue;
        const d = Hex.dist(u.x, u.y, c.x, c.y0);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
      if (best) {
        civ._garrison[best.id] = cIdx(c);
        used.add(best.id);
      }
    }
    civ._free = free.filter((u) => !used.has(u.id)).length;
  };

  AI.tryAttack = function (u) {
    const s = S();
    if (!s.units[u.id] || u.attacked || u.mp <= 0) return false;
    const civ = s.civs[u.owner];
    const def = C.UNITS[u.type];
    const here = G.uidx(u);
    const garrison = civ._garrison && civ._garrison[u.id] === here;
    let best = null, bv = -Infinity;
    for (const j of Hex.rangeI(here, def.rng ? def.range : 1)) {
      if (j === here) continue;
      const p = G.predict(u, j);
      if (!p) continue;
      let v;
      if (p.mode === 'capture') v = 40;
      else if (p.tgt.kind === 'city') {
        if (p.mode === 'melee') {
          if (p.capture) v = 1000;
          else if (garrison) continue;
          else if (p.dmgAtt < u.hp - 30 && (p.dmgDef >= p.defHp || civ._warTarget === p.tgt.city.owner)) v = p.dmgDef - p.dmgAtt * 0.7;
          else continue;
        } else v = p.dmgDef + 10;
      } else {
        const kill = p.dmgDef >= p.defHp;
        if (p.mode === 'melee') {
          if (garrison && !kill) continue;
          if (!kill && (p.dmgAtt >= u.hp - 15 || p.dmgAtt > p.dmgDef * 1.3)) continue;
        }
        v = p.dmgDef + (kill ? 60 : 0) - (p.mode === 'melee' ? p.dmgAtt * 0.8 : 0);
      }
      if (v > bv) {
        bv = v;
        best = j;
      }
    }
    if (best == null) return false;
    G.attack(u, best);
    return true;
  };

  AI.nearestEnemyUnit = function (civ, i, r) {
    let best = null, bd = r + 1;
    for (const o of Object.values(S().units)) {
      if (o.owner === civ.id || !G.atWar(civ.id, o.owner)) continue;
      const d = Hex.dist(o.x, o.y, i % S().W, Math.floor(i / S().W));
      if (d < bd) {
        bd = d;
        best = G.uidx(o);
      }
    }
    return best;
  };

  AI.military = function (u) {
    const s = S();
    const civ = s.civs[u.owner];
    const def = C.UNITS[u.type];
    if (AI.tryAttack(u)) return;
    const here = G.uidx(u);
    const gCity = civ._garrison && civ._garrison[u.id];
    if (u.hp < 45 && gCity == null) {
      const c = AI.nearestOwnCity(civ, here);
      if (c && cIdx(c) !== here && AI.moveTo(u, cIdx(c))) return;
      u.fort = 1;
      return;
    }
    if (gCity != null) {
      if (gCity !== here) AI.moveTo(u, gCity);
      if (s.units[u.id] && G.uidx(u) === gCity) u.fort = 1;
      AI.tryAttack(u);
      return;
    }
    // 进攻
    if (civ._warTarget != null && (civ._free || 0) >= 3) {
      let tc = null, bd = 30;
      for (const c of G.citiesOf(civ._warTarget)) {
        const d = Hex.dist(u.x, u.y, c.x, c.y0);
        if (d < bd) {
          bd = d;
          tc = c;
        }
      }
      if (tc) {
        const ti = cIdx(tc);
        if (def.rng && bd <= def.range) {
          u.fort = 1;
          return;
        }
        AI.moveTo(u, ti);
        AI.tryAttack(u);
        return;
      }
    }
    // 清理附近的敌人与蛮族
    const own = AI.nearestOwnCity(civ, here);
    const threat = AI.nearestEnemyUnit(civ, own ? cIdx(own) : here, 7);
    if (threat != null && Hex.distI(here, threat) <= 9) {
      AI.moveTo(u, threat);
      AI.tryAttack(u);
      return;
    }
    if (u.hp > 70 && def.str >= 20) {
      let camp = null, cd = 9;
      for (const ci of s.camps) {
        const d = Hex.distI(here, ci);
        if (d < cd && s.tiles[ci].camp) {
          cd = d;
          camp = ci;
        }
      }
      if (camp != null) {
        const occ = G.occupancy(u, camp);
        if (occ === 'final') {
          AI.moveTo(u, camp);
          AI.tryAttack(u);
        } else AI.moveTo(u, camp);
        return;
      }
    }
    if (s.turn < 30 && !G.unitsOf(civ.id).some((x) => x.type === 'scout')) {
      const t = AI.exploreTarget(u);
      if (t != null && AI.moveTo(u, t)) return;
    }
    // 驻守在防守最薄弱的城市附近
    let best = null, bv = 99;
    for (const c of G.citiesOf(civ.id)) {
      const ci = cIdx(c);
      let n = 0;
      for (const j of Hex.rangeI(ci, 1)) {
        const m = G.militaryAt(j);
        if (m && m.owner === civ.id && m !== u) n++;
      }
      const v = n + Hex.distI(ci, here) * 0.1;
      if (v < bv) {
        bv = v;
        best = c;
      }
    }
    if (best) {
      const ci = cIdx(best);
      if (Hex.distI(ci, here) > 1) {
        const spots = Hex.neighbors(ci).filter((j) => G.canEnter(u, j) && G.occupancy(u, j) === 'ok');
        if (spots.length) AI.moveTo(u, spots[G.randInt(spots.length)]);
      }
    }
    if (s.units[u.id] && u.mp > 0) u.fort = 1;
  };

  // ---------- 蛮族 ----------
  AI.barbTurn = function (barb) {
    const s = S();
    for (const u of G.unitsOf(barb.id)) {
      if (!s.units[u.id]) continue;
      if (AI.tryAttack(u)) continue;
      const here = G.uidx(u);
      let best = null, bd = 7;
      for (const o of Object.values(s.units)) {
        if (o.owner === barb.id) continue;
        const d = Hex.dist(o.x, o.y, u.x, u.y);
        if (d < bd) {
          bd = d;
          best = G.uidx(o);
        }
      }
      if (best == null) {
        for (const c of Object.values(s.cities)) {
          const d = Hex.dist(c.x, c.y0, u.x, u.y);
          if (d < bd) {
            bd = d;
            best = cIdx(c);
          }
        }
      }
      if (best != null) {
        AI.moveTo(u, best);
        AI.tryAttack(u);
        continue;
      }
      const nb = Hex.neighbors(here).filter((j) => G.canEnter(u, j) && G.occupancy(u, j) === 'ok' && s.camps.some((c) => Hex.distI(c, j) <= 3));
      if (nb.length && G.rand() < 0.5) G.moveAlong(u, [nb[G.randInt(nb.length)]]);
    }
  };
})();
