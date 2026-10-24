// 游戏规则核心：状态、单位、城市、战斗、研究、回合、胜利、存档
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;
  const G = (C.G = {});
  let s = null;
  let uidx = new Map(); // 地块索引 -> 单位 id 数组

  G.state = () => s;
  const listeners = [];
  G.on = (fn) => listeners.push(fn);
  G.emit = (type, data) => {
    for (const f of listeners) f(type, data);
  };

  G.rand = function () {
    const o = C.rngStep(s.rng);
    s.rng = o.state;
    return o.value;
  };
  G.randInt = (n) => Math.floor(G.rand() * n);
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = G.randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- 基础查询 ----------
  G.udef = (u) => C.UNITS[u.type];
  G.isCivilian = (u) => C.UNITS[u.type].cls === 'civilian';
  G.isMilitary = (u) => C.UNITS[u.type].cls !== 'civilian';
  G.uidx = (u) => u.y * s.W + u.x;
  G.human = () => s.civs[s.humanId];
  G.atWar = (a, b) => a !== b && !!s.war[a][b];
  G.isWater = (i) => !!C.TERRAIN[s.tiles[i].t].water;
  G.cityAtI = (i) => (s.tiles[i].c >= 0 ? s.cities[s.tiles[i].c] : null);
  G.citiesOf = (civId) => Object.values(s.cities).filter((c) => c.owner === civId);
  G.unitsOf = (civId) => Object.values(s.units).filter((u) => u.owner === civId);
  G.majors = () => s.civs.filter((c) => !c.isBarb);
  G.wondersOf = (civ) => Object.keys(s.wonders).filter((w) => s.wonders[w].civ === civ.id);
  G.era = (civ) => {
    let e = 0;
    for (const id in civ.techs) e = Math.max(e, C.TECH[id].era);
    return e;
  };

  function idxAdd(u) {
    const i = G.uidx(u);
    let a = uidx.get(i);
    if (!a) uidx.set(i, (a = []));
    a.push(u.id);
  }
  function idxDel(u) {
    const i = G.uidx(u);
    const a = uidx.get(i);
    if (!a) return;
    const k = a.indexOf(u.id);
    if (k >= 0) a.splice(k, 1);
    if (!a.length) uidx.delete(i);
  }
  G.rebuildIndex = function () {
    uidx = new Map();
    for (const u of Object.values(s.units)) idxAdd(u);
  };
  G.unitsAt = (i) => (uidx.get(i) || []).map((id) => s.units[id]);
  G.militaryAt = (i) => G.unitsAt(i).find((u) => G.isMilitary(u));
  G.civilianAt = (i) => G.unitsAt(i).find((u) => G.isCivilian(u));

  // ---------- 新游戏 ----------
  function makeCiv(id, def, isHuman) {
    return {
      id, def: def.id, name: def.name, leader: def.leader, color: def.color, text: def.text,
      isHuman, isBarb: false, alive: true, gold: 10,
      techs: {}, techProg: {}, curTech: null, techQueue: [], sciBank: 0,
      civics: {}, civicProg: {}, curCivic: null, civicQueue: [], culBank: 0,
      boosted: {}, stats: {}, projects: {}, met: {}, explored: new Uint8Array(s.W * s.H),
      settlersBuilt: 0, nameIdx: 0, foundedAny: false, originalCapital: -1,
      warSince: {}, peaceTurn: {}, lastAsk: {}, personality: 0.6 + G.rand() * 0.8,
    };
  }

  G.newGame = function (opts) {
    const size = C.MAP_SIZES[opts.size] || C.MAP_SIZES.standard;
    const seed = opts.seed != null && opts.seed !== '' ? Number(opts.seed) | 0 : Math.floor(Math.random() * 1e9);
    const nAI = Math.max(1, Math.min(size.maxAi, opts.opponents != null ? opts.opponents : size.ai));
    const map = C.MapGen.generate(size.w, size.h, seed, nAI + 1);
    s = {
      version: 1, seed, rng: (seed ^ 0x5bd1e995) | 0, turn: 1, speed: C.SPEEDS[opts.speed] ? opts.speed : 'standard',
      maxTurns: opts.maxTurns || (C.SPEEDS[opts.speed] || C.SPEEDS.standard).turns,
      difficulty: opts.difficulty || 'easy', size: opts.size || 'standard', W: size.w, H: size.h, layout: map.layout,
      tiles: map.tiles, civs: [], units: {}, cities: {}, nextId: 1, wonders: {}, war: [], humanId: 0,
      winner: null, victoryType: null, continued: false, log: [], offers: [], camps: map.camps.slice(),
    };
    Hex.setSize(s.W, s.H);
    uidx = new Map();
    const humanDef = C.CIV[opts.civ] || C.CIVS[0];
    const others = shuffle(C.CIVS.filter((c) => c !== humanDef)).slice(0, nAI);
    [humanDef, ...others].forEach((d, k) => s.civs.push(makeCiv(k, d, k === 0)));
    const barb = makeCiv(s.civs.length, C.BARB, false);
    barb.isBarb = true;
    s.civs.push(barb);
    s.barbId = barb.id;
    const n = s.civs.length;
    s.war = [];
    for (let a = 0; a < n; a++) {
      s.war.push([]);
      for (let b = 0; b < n; b++) s.war[a].push(a !== b && (a === s.barbId || b === s.barbId));
    }
    s.landTiles = s.tiles.filter((t) => !C.TERRAIN[t.t].water && t.t !== 'mountain').length;

    const starts = shuffle(map.starts);
    for (const civ of s.civs) {
      if (civ.isBarb) continue;
      const st = starts[civ.id];
      const [x, y] = Hex.xy(st);
      G.createUnit(civ.id, 'settler', x, y);
      G.createUnit(civ.id, 'warrior', x, y);
      const sp = G.findSpawn(civ.id, st, false, true);
      if (sp >= 0) G.createUnit(civ.id, 'scout', ...Hex.xy(sp));
      if (!civ.isHuman && s.difficulty === 'hard') {
        const sp2 = G.findSpawn(civ.id, st, true, true);
        if (sp2 >= 0) G.createUnit(civ.id, 'settler', ...Hex.xy(sp2));
      }
      if (civ.isHuman && s.difficulty === 'easy') {
        const sp3 = G.findSpawn(civ.id, st, true, true);
        if (sp3 >= 0) G.createUnit(civ.id, 'builder', ...Hex.xy(sp3));
      }
    }
    for (const ci of s.camps) G.createUnit(s.barbId, 'warrior', ...Hex.xy(ci));
    for (const civ of s.civs) if (!civ.isBarb) G.updateVis(civ);
    G.emit('newGame', s);
    return s;
  };

  // ---------- 加成 ----------
  G.mods = function (civ) {
    if (civ._mods) return civ._mods;
    const m = {};
    const add = (src) => {
      if (src) for (const k in src) m[k] = (m[k] || 0) + src[k];
    };
    add((C.CIV[civ.def] || C.BARB).mods);
    for (const id in civ.civics) add(C.CIVIC[id].mods);
    for (const id in civ.techs) add(C.TECH[id].mods);
    for (const w in s.wonders) if (s.wonders[w].civ === civ.id) add(C.WONDERS[w].mods);
    civ._mods = m;
    return m;
  };
  G.invalidateMods = (civ) => {
    if (civ) delete civ._mods;
    else s.civs.forEach((c) => delete c._mods);
  };

  // ---------- 地块产出 ----------
  G.resourceVisible = (t, civ) => !!t.r && (!C.RESOURCES[t.r].tech || !civ || !!civ.techs[C.RESOURCES[t.r].tech]);
  G.tileYield = function (i, civ) {
    const t = s.tiles[i];
    const T = C.TERRAIN[t.t];
    const y = { food: T.food, prod: T.prod, gold: T.gold, sci: 0, cul: 0 };
    if (T.impassable) return y;
    if (t.h) y.prod += 1;
    if (t.f) {
      const F = C.FEATURES[t.f];
      y.food += F.food;
      y.prod += F.prod;
      y.gold += F.gold;
    }
    if (t.r && G.resourceVisible(t, civ)) {
      const R = C.RESOURCES[t.r].yields;
      for (const k in R) y[k] += R[k];
    }
    if (t.imp) {
      const I = C.IMPROVEMENTS[t.imp].yields;
      for (const k in I) y[k] += I[k];
      if (civ) {
        const m = G.mods(civ);
        if (t.imp === 'farm') y.food += m.farmFood || 0;
        if (t.imp === 'mine' || t.imp === 'lumber') y.prod += m.mineProd || 0;
      }
    }
    return y;
  };

  // ---------- 城市 ----------
  G.speedMult = () => (C.SPEEDS[s.speed] || C.SPEEDS.standard).mult;
  G.techCost = (id) => Math.round(C.TECH[id].cost * G.speedMult());
  G.civicCost = (id) => Math.round(C.CIVIC[id].cost * G.speedMult());
  G.year = () => C.yearOf(Math.max(1, Math.round(((s.turn - 1) * 250) / (C.SPEEDS[s.speed] || C.SPEEDS.standard).turns) + 1));
  G.growthNeed = (pop) => Math.floor((15 + 8 * (pop - 1) + Math.pow(pop - 1, 1.5)) * (0.5 + 0.5 * G.speedMult()));
  G.borderNeed = (city) => Math.floor(10 + Math.pow(6 * city.tilesGained, 1.3));
  G.cityMaxHp = (city) => 200 + (city.buildings.walls ? 100 : 0);

  G.refreshCity = function (city) {
    const civ = s.civs[city.owner];
    const m = G.mods(civ);
    const ci = city.y0 * s.W + city.x;
    const cy = G.tileYield(ci, civ);
    const tot = { food: Math.max(2, cy.food), prod: Math.max(2, cy.prod), gold: cy.gold + 1, sci: cy.sci, cul: cy.cul };
    const cands = [];
    for (const j of Hex.rangeI(ci, 3)) {
      if (j === ci || s.tiles[j].oc !== city.id) continue;
      const y = G.tileYield(j, civ);
      if (y.food + y.prod + y.gold + y.sci + y.cul <= 0) continue;
      cands.push({ j, y });
    }
    const worked = [];
    let food = tot.food - 2 * city.pop;
    for (let p = 0; p < city.pop && cands.length; p++) {
      const wf = food < 2 ? 2.2 : food < 4 ? 1.3 : 0.9;
      let best = 0, bv = -1;
      for (let k = 0; k < cands.length; k++) {
        const y = cands[k].y;
        const v = y.food * wf + y.prod * 1.15 + y.gold * 0.6 + y.sci * 0.9 + y.cul * 0.8;
        if (v > bv) {
          bv = v;
          best = k;
        }
      }
      const c = cands.splice(best, 1)[0];
      worked.push(c.j);
      for (const k in c.y) tot[k] += c.y[k];
      food += c.y.food;
    }
    const idle = city.pop - worked.length;
    tot.sci += idle;
    tot.cul += idle;
    for (const b in city.buildings) {
      const B = C.BUILDINGS[b];
      if (B && B.yields) for (const k in B.yields) tot[k] += B.yields[k];
    }
    for (const w in s.wonders) {
      if (s.wonders[w].city !== city.id) continue;
      const W = C.WONDERS[w].yields;
      if (W) for (const k in W) tot[k] += W[k];
    }
    if (city.capital) {
      for (const k in C.PALACE) tot[k] += C.PALACE[k];
      tot.gold += m.capitalGold || 0;
      tot.prod += m.capitalProd || 0;
    }
    tot.food += m.foodPerCity || 0;
    tot.prod += m.prodPerCity || 0;
    tot.gold += m.goldPerCity || 0;
    tot.sci += (m.sciPerCity || 0) + city.pop * 0.5;
    tot.cul += (m.culturePerCity || 0) + city.pop * 0.3;
    const mult = !civ.isHuman && !civ.isBarb ? C.DIFFICULTY[s.difficulty].aiMult : 1;
    tot.prod *= (1 + (m.prodPct || 0)) * mult;
    tot.gold *= (1 + (m.goldPct || 0)) * mult;
    tot.sci *= (1 + (m.sciPct || 0)) * mult;
    tot.cul *= (1 + (m.culturePct || 0)) * mult;
    for (const k in tot) tot[k] = Math.round(tot[k] * 10) / 10;
    tot.surplus = Math.round((tot.food - 2 * city.pop) * 10) / 10;
    city.worked = worked;
    city.yields = tot;
    return tot;
  };
  G.refreshCiv = function (civ) {
    G.invalidateMods(civ);
    for (const c of G.citiesOf(civ.id)) G.refreshCity(c);
  };
  G.civYields = function (civ) {
    const o = { sci: 0, cul: 0, gold: 0, food: 0, prod: 0 };
    for (const c of G.citiesOf(civ.id)) {
      const y = c.yields || G.refreshCity(c);
      for (const k in o) o[k] += y[k];
    }
    for (const k in o) o[k] = Math.round(o[k] * 10) / 10;
    return o;
  };

  G.claimTile = function (j, city) {
    const t = s.tiles[j];
    t.o = city.owner;
    t.oc = city.id;
  };
  G.expandBorder = function (city) {
    const ci = city.y0 * s.W + city.x;
    const civ = s.civs[city.owner];
    let best = -1, bv = -1e9;
    for (const j of Hex.rangeI(ci, 3)) {
      const t = s.tiles[j];
      if (t.o !== -1) continue;
      if (!Hex.neighbors(j).some((n) => s.tiles[n].oc === city.id)) continue;
      const y = G.tileYield(j, civ);
      const v = y.food * 1.3 + y.prod + y.gold * 0.6 + y.sci + y.cul + (t.r ? 2 : 0) - Hex.distI(ci, j) * 0.6 + G.rand() * 0.3;
      if (v > bv) {
        bv = v;
        best = j;
      }
    }
    if (best < 0) return false;
    G.claimTile(best, city);
    city.tilesGained++;
    return true;
  };

  G.canFoundAt = function (civId, i) {
    const t = s.tiles[i];
    const T = C.TERRAIN[t.t];
    if (T.water || T.impassable || t.camp) return false;
    if (t.o >= 0 && t.o !== civId) return false;
    for (const c of Object.values(s.cities)) if (Hex.dist(c.x, c.y0, i % s.W, Math.floor(i / s.W)) < 4) return false;
    return true;
  };
  G.foundCity = function (u) {
    const civ = s.civs[u.owner];
    const i = G.uidx(u);
    if (u.type !== 'settler' || !G.canFoundAt(civ.id, i)) return null;
    const def = C.CIV[civ.def];
    const name = def.cities[civ.nameIdx] || `${civ.name}新城${civ.nameIdx - def.cities.length + 1}`;
    civ.nameIdx++;
    const isCap = G.citiesOf(civ.id).length === 0;
    const city = {
      id: s.nextId++, name, owner: civ.id, origOwner: civ.id, x: u.x, y0: u.y, pop: 1, food: 0, prodStock: 0, prog: {},
      build: null, buildings: {}, hp: 200, culture: 0, tilesGained: 0, worked: [], capital: isCap,
      origCapital: !civ.foundedAny, founded: s.turn, fired: false, lastHit: -10, auto: false, yields: null,
    };
    s.cities[city.id] = city;
    const t = s.tiles[i];
    t.c = city.id;
    t.o = civ.id;
    t.oc = city.id;
    t.imp = null;
    t.hut = 0;
    if (t.f === 'forest' || t.f === 'jungle') t.f = null;
    for (const j of Hex.rangeI(i, 1)) if (s.tiles[j].o === -1) G.claimTile(j, city);
    if (!civ.foundedAny) civ.originalCapital = city.id;
    civ.foundedAny = true;
    G.removeUnit(u);
    G.setStat(civ, 'cities', G.citiesOf(civ.id).length);
    if (Hex.neighbors(i).some((j) => s.tiles[j].t === 'coast')) G.addStat(civ, 'coastalCities');
    G.refreshCity(city);
    G.revealAround(civ, u.x, u.y, 3);
    G.notify(civ.id, `建立了城市「${name}」`, 'city', i);
    G.emit('cityFounded', city);
    return city;
  };

  // ---------- 单位 ----------
  G.landMoves = function (u) {
    const def = C.UNITS[u.type];
    let m = def.move;
    if (def.cls === 'cavalry') m += G.mods(s.civs[u.owner]).cavMove || 0;
    return m;
  };
  G.maxMoves = (u) => (G.isWater(G.uidx(u)) ? 3 : G.landMoves(u));
  G.sight = (u) => (C.UNITS[u.type].sight || 2) + (s.tiles[G.uidx(u)].h ? 1 : 0);
  G.rank = (u) => (u.xp >= 12 ? 3 : u.xp >= 7 ? 2 : u.xp >= 3 ? 1 : 0);
  G.addXp = function (u, n) {
    const before = G.rank(u);
    u.xp += n;
    if (G.rank(u) > before) {
      u.hp = Math.min(100, u.hp + 30);
      G.notify(u.owner, `${C.UNITS[u.type].name} 晋升为 ${G.rank(u)} 星老兵`, 'promo', G.uidx(u));
    }
  };

  G.createUnit = function (owner, type, x, y) {
    const civ = s.civs[owner];
    const u = { id: s.nextId++, type, owner, x, y, hp: 100, mp: 0, xp: 0, fort: 0, sleep: false, goal: null, acted: false, attacked: false, skip: false, auto: null };
    if (type === 'builder') u.charges = 3 + (G.mods(civ).builderCharges || 0);
    s.units[u.id] = u;
    idxAdd(u);
    u.mp = G.maxMoves(u);
    if (!civ.isBarb) G.revealAround(civ, x, y, G.sight(u));
    G.emit('unitCreated', u);
    return u;
  };
  G.removeUnit = function (u) {
    if (!s.units[u.id]) return;
    idxDel(u);
    delete s.units[u.id];
    G.emit('unitRemoved', u);
  };
  G.setPos = function (u, x, y) {
    idxDel(u);
    u.x = x;
    u.y = y;
    idxAdd(u);
  };

  // 出生位置：优先城市本身，其次周围
  G.findSpawn = function (civId, i, civilian, allowForeign) {
    const civ = s.civs[civId];
    const cand = [i, ...Hex.neighbors(i), ...Hex.rangeI(i, 2)];
    for (const j of cand) {
      const t = s.tiles[j];
      const T = C.TERRAIN[t.t];
      if (T.water || T.impassable) continue;
      if (t.c >= 0 && s.cities[t.c].owner !== civId) continue;
      if (!allowForeign && !civ.isBarb && t.o >= 0 && t.o !== civId) continue;
      const us = G.unitsAt(j);
      if (us.some((x) => x.owner !== civId)) continue;
      if (us.some((x) => G.isCivilian(x) === civilian)) continue;
      return j;
    }
    return -1;
  };

  G.canEnter = function (u, i) {
    const t = s.tiles[i];
    const T = C.TERRAIN[t.t];
    const civ = s.civs[u.owner];
    if (T.impassable) return false;
    if (T.water) {
      if (civ.isBarb) return false;
      if (T.deep ? !civ.techs.cartography : !civ.techs.sailing) return false;
    }
    if (t.o >= 0 && t.o !== u.owner && !civ.isBarb && !s.civs[t.o].isBarb && !G.atWar(u.owner, t.o)) return false;
    if (t.c >= 0 && s.cities[t.c].owner !== u.owner) return false;
    return true;
  };
  // 进入地块的移动消耗：数字 / -1 表示登船或上岸（耗尽全部移动力）/ Infinity 不可进入
  G.stepCost = function (u, from, to) {
    if (!G.canEnter(u, to)) return Infinity;
    const wTo = G.isWater(to), wFrom = G.isWater(from);
    if (wTo !== wFrom) return -1;
    if (wTo) return 1;
    const t = s.tiles[to];
    let c = 1;
    if (t.h) c += 1;
    if (t.f && C.FEATURES[t.f].move) c += 1;
    return c;
  };
  // 'ok' 可停留 / 'pass' 可经过不可停留 / 'final' 只能作为攻击/俘获目标 / 'block' 不可进入
  G.occupancy = function (u, i) {
    const civil = G.isCivilian(u);
    const city = G.cityAtI(i);
    if (city && city.owner !== u.owner) return G.atWar(u.owner, city.owner) && !civil ? 'final' : 'block';
    let res = 'ok';
    for (const x of G.unitsAt(i)) {
      if (x.id === u.id) continue;
      if (x.owner === u.owner) {
        if (G.isCivilian(x) === civil) res = 'pass';
        continue;
      }
      if (!G.atWar(u.owner, x.owner) || civil) return 'block';
      return 'final';
    }
    return res;
  };

  G.revealAround = function (civ, x, y, r) {
    if (civ.isBarb) return;
    const v = G.vis(civ);
    for (const j of Hex.range(x, y, r)) {
      v[j] = 1;
      civ.explored[j] = 1;
      const t = s.tiles[j];
      if (t.o >= 0 && t.o !== civ.id) G.meet(civ.id, t.o);
      const a = uidx.get(j);
      if (a) for (const id of a) if (s.units[id].owner !== civ.id) G.meet(civ.id, s.units[id].owner);
    }
  };
  G.vis = (civ) => civ._vis || (civ._vis = new Uint8Array(s.W * s.H));
  G.updateVis = function (civ) {
    if (civ.isBarb) return;
    const v = G.vis(civ);
    v.fill(0);
    for (const u of G.unitsOf(civ.id)) G.revealAround(civ, u.x, u.y, G.sight(u));
    for (const c of G.citiesOf(civ.id)) G.revealAround(civ, c.x, c.y0, 3);
    for (let i = 0; i < s.tiles.length; i++) {
      if (s.tiles[i].o === civ.id) {
        v[i] = 1;
        civ.explored[i] = 1;
      }
    }
  };
  G.meet = function (a, b) {
    if (a === b) return;
    const A = s.civs[a], B = s.civs[b];
    if (A.isBarb || B.isBarb || A.met[b]) return;
    A.met[b] = true;
    B.met[a] = true;
    G.setStat(A, 'metCivs', Object.keys(A.met).length);
    G.setStat(B, 'metCivs', Object.keys(B.met).length);
    if (A.isHuman || B.isHuman) {
      const other = A.isHuman ? B : A;
      G.notify(s.humanId, `你遇见了 ${other.name}（${other.leader}）`, 'met');
      G.emit('met', other);
    }
  };

  // 移动一系列步骤（不处理攻击）
  G.moveAlong = function (u, steps, stopWhen) {
    const moved = [G.uidx(u)];
    for (let k = 0; k < steps.length; k++) {
      const to = steps[k];
      if (u.mp <= 0) break;
      const from = G.uidx(u);
      const occ = G.occupancy(u, to);
      if (occ === 'block' || occ === 'final') break;
      const c = G.stepCost(u, from, to);
      if (c === Infinity) break;
      const full = G.maxMoves(u);
      if (c !== -1 && u.mp < c && u.mp < full) break;
      const after = c === -1 ? 0 : Math.max(0, u.mp - c);
      if (occ === 'pass') {
        // 经过己方单位所在格：必须保证还能继续走下一步
        if (after === 0 || k + 1 >= steps.length) break;
        const nc = G.stepCost(u, to, steps[k + 1]);
        if (nc === Infinity || (nc !== -1 && after < nc)) break;
      }
      G.setPos(u, to % s.W, Math.floor(to / s.W));
      u.mp = after;
      u.acted = true;
      u.fort = 0;
      moved.push(to);
      G.onEnter(u, to);
      if (!s.units[u.id]) break;
      if (stopWhen && stopWhen(u)) break;
    }
    if (moved.length > 1) G.emit('move', { unit: u, path: moved });
    return moved.length - 1;
  };
  G.onEnter = function (u, i) {
    const civ = s.civs[u.owner];
    const t = s.tiles[i];
    G.revealAround(civ, u.x, u.y, G.sight(u));
    if (civ.isBarb) return;
    if (t.hut) G.popHut(u, i);
    if (t.camp && G.isMilitary(u)) {
      t.camp = 0;
      s.camps = s.camps.filter((c) => c !== i);
      civ.gold += 50;
      G.addStat(civ, 'campsCleared');
      G.notify(civ.id, '清除了蛮族营地，获得 50 金币', 'camp', i);
      G.emit('fx', { kind: 'text', at: i, text: '+50 🪙' });
    }
  };
  G.popHut = function (u, i) {
    const civ = s.civs[u.owner];
    s.tiles[i].hut = 0;
    const r = G.rand();
    let msg;
    if (r < 0.3) {
      const g = 30 + G.randInt(6) * 10;
      civ.gold += g;
      msg = `部落村庄赠送了 ${g} 金币`;
    } else if (r < 0.5) {
      const a = Math.round(15 + s.turn * 0.6);
      G.giveScience(civ, a);
      msg = `部落村庄分享了知识：+${a} 科技`;
    } else if (r < 0.65) {
      const a = Math.round(12 + s.turn * 0.5);
      G.giveCulture(civ, a);
      msg = `部落村庄传授了传统：+${a} 文化`;
    } else if (r < 0.82) {
      const type = G.rand() < 0.5 ? 'warrior' : 'scout';
      const sp = G.findSpawn(civ.id, i, false, true);
      if (sp >= 0) {
        G.createUnit(civ.id, type, ...Hex.xy(sp));
        msg = `部落村庄的勇者加入了你：获得一个${C.UNITS[type].name}`;
      } else {
        civ.gold += 40;
        msg = '部落村庄赠送了 40 金币';
      }
    } else {
      const cities = G.citiesOf(civ.id);
      if (cities.length) {
        let best = cities[0];
        for (const c of cities) if (Hex.dist(c.x, c.y0, u.x, u.y) < Hex.dist(best.x, best.y0, u.x, u.y)) best = c;
        best.pop++;
        G.refreshCity(best);
        msg = `部落村庄的居民迁入了 ${best.name}：人口 +1`;
      } else {
        const sp = G.findSpawn(civ.id, i, true, true);
        if (sp >= 0) G.createUnit(civ.id, 'builder', ...Hex.xy(sp));
        msg = '部落村庄送来了一名建造者';
      }
    }
    G.notify(civ.id, msg, 'hut', i);
    G.emit('fx', { kind: 'text', at: i, text: '🎁' });
  };

  // 下达移动命令：可攻击则攻击，否则寻路并记住目标
  G.orderMove = function (u, target) {
    if (G.canAttackTile(u, target)) {
      G.attack(u, target);
      u.goal = null;
      return 'attack';
    }
    const p = C.Path.find(u, target);
    if (!p) return false;
    u.goal = target;
    u.sleep = false;
    u.fort = 0;
    u.auto = null;
    G.continueMove(u);
    return 'move';
  };
  G.continueMove = function (u) {
    const target = u.goal;
    if (target == null || u.mp <= 0) return;
    const p = C.Path.find(u, target);
    if (!p) {
      u.goal = null;
      return;
    }
    const occT = G.occupancy(u, target);
    let steps = p.path;
    const final = occT === 'final';
    if (final) steps = steps.slice(0, -1);
    const def = C.UNITS[u.type];
    const stop = final && def.rng ? (x) => Hex.distI(G.uidx(x), target) <= def.range : null;
    G.moveAlong(u, steps, stop);
    if (!s.units[u.id]) return;
    if (G.uidx(u) === target) u.goal = null;
    else if (final) {
      if (G.canAttackTile(u, target)) G.attack(u, target);
      if (s.units[u.id] && (u.attacked || Hex.distI(G.uidx(u), target) <= (def.range || 1))) u.goal = null;
    }
  };

  // ---------- 建造者 ----------
  G.improvementFor = function (civ, i) {
    const t = s.tiles[i];
    const T = C.TERRAIN[t.t];
    if (T.impassable || t.c >= 0) return null;
    let id = null;
    if (t.r && G.resourceVisible(t, civ) && C.RESOURCES[t.r].imp) id = C.RESOURCES[t.r].imp;
    else if (T.water) return null;
    else if (t.f === 'forest') id = 'lumber';
    else if (t.f) return null;
    else if (t.h) id = 'mine';
    else if (t.t === 'grass' || t.t === 'plains' || t.t === 'tundra') id = 'farm';
    if (!id || t.imp === id) return null;
    const I = C.IMPROVEMENTS[id];
    if (I.tech && !civ.techs[I.tech]) return null;
    return id;
  };
  G.canImprove = function (u) {
    if (u.type !== 'builder' || u.mp <= 0) return null;
    const i = G.uidx(u);
    if (s.tiles[i].o !== u.owner) return null;
    return G.improvementFor(s.civs[u.owner], i);
  };
  const IMP_STAT = { farm: 'farms', mine: 'mines', quarry: 'quarries', pasture: 'pastures' };
  G.improve = function (u) {
    const id = G.canImprove(u);
    if (!id) return false;
    const civ = s.civs[u.owner];
    const i = G.uidx(u);
    const t = s.tiles[i];
    t.imp = id;
    u.charges--;
    u.mp = 0;
    u.acted = true;
    u.target = null;
    G.addStat(civ, 'improvements');
    if (IMP_STAT[id]) G.addStat(civ, IMP_STAT[id]);
    if (t.oc >= 0 && s.cities[t.oc]) G.refreshCity(s.cities[t.oc]);
    G.emit('fx', { kind: 'text', at: i, text: C.IMPROVEMENTS[id].name });
    if (u.charges <= 0) {
      G.removeUnit(u);
      G.notify(civ.id, '建造者用完了所有使用次数', 'unit', i);
    }
    return true;
  };

  // ---------- 升级 ----------
  G.upgradeInfo = function (u) {
    const def = C.UNITS[u.type];
    if (!def.upgrade) return null;
    const civ = s.civs[u.owner];
    const to = C.UNITS[def.upgrade];
    if (to.tech && !civ.techs[to.tech]) return null;
    return { to: def.upgrade, cost: Math.round((to.cost - def.cost) * 1.2 * G.speedMult() + 15) };
  };
  G.canUpgrade = function (u) {
    const info = G.upgradeInfo(u);
    if (!info || u.mp <= 0 || u.attacked) return false;
    if (s.tiles[G.uidx(u)].o !== u.owner) return false;
    return s.civs[u.owner].gold >= info.cost;
  };
  G.upgradeUnit = function (u) {
    if (!G.canUpgrade(u)) return false;
    const info = G.upgradeInfo(u);
    s.civs[u.owner].gold -= info.cost;
    u.type = info.to;
    u.mp = 0;
    u.acted = true;
    G.emit('fx', { kind: 'text', at: G.uidx(u), text: '⬆ 升级' });
    return true;
  };

  // ---------- 战斗 ----------
  G.dmg = (a, d) => 30 * Math.exp((a - d) / 25);
  G.baseStr = function (u, ranged) {
    const def = C.UNITS[u.type];
    if (def.cls === 'civilian') return 0;
    const m = G.mods(s.civs[u.owner]);
    let v = (ranged ? def.rng : def.str) || 0;
    v += G.rank(u) * 3 + (m.unitStr || 0);
    if (def.cls === 'melee' || def.cls === 'anticav') v += m.meleeStr || 0;
    if (def.cls === 'cavalry') v += m.cavStr || 0;
    v -= Math.round((100 - u.hp) / 10);
    return Math.max(1, v);
  };
  G.defStr = function (u, attacker) {
    const i = G.uidx(u);
    const t = s.tiles[i];
    const def = C.UNITS[u.type];
    if (G.isWater(i)) return 10 + G.era(s.civs[u.owner]) * 6;
    let v = G.baseStr(u, false);
    if (t.h) v += C.HILLS.def;
    if (t.f && C.FEATURES[t.f].def) v += C.FEATURES[t.f].def;
    if (u.fort) v += 4;
    if (attacker && def.cls === 'anticav' && C.UNITS[attacker.type].cls === 'cavalry') v += 10;
    return v;
  };
  G.attStr = function (u, tgt, ranged) {
    const def = C.UNITS[u.type];
    let v = G.baseStr(u, ranged);
    if (tgt.kind === 'city') {
      if (def.cls === 'ranged') v -= 8;
      if (def.cls === 'siege') v += 5;
    } else {
      if (def.cls === 'siege') v -= 5;
      if (def.cls === 'anticav' && tgt.unit && C.UNITS[tgt.unit.type].cls === 'cavalry') v += 10;
    }
    return v;
  };
  G.cityStr = function (city) {
    const civ = s.civs[city.owner];
    const m = G.mods(civ);
    let best = 20;
    for (const id in C.UNITS) {
      const d = C.UNITS[id];
      if ((d.cls === 'melee' || d.cls === 'anticav') && (!d.tech || civ.techs[d.tech])) best = Math.max(best, d.str);
    }
    let v = 8 + best * 0.75 + (city.buildings.walls ? 8 : 0) + (city.capital ? 3 : 0) + Math.min(10, Math.floor(city.pop / 2)) + (m.cityStr || 0);
    const g = G.militaryAt(city.y0 * s.W + city.x);
    if (g && g.owner === city.owner) v = Math.max(v, G.baseStr(g, false) + 3);
    return Math.round(v);
  };

  G.targetAt = function (atkOwner, i) {
    const city = G.cityAtI(i);
    if (city && city.owner !== atkOwner && G.atWar(atkOwner, city.owner)) return { kind: 'city', city };
    const mil = G.militaryAt(i);
    if (mil && mil.owner !== atkOwner && G.atWar(atkOwner, mil.owner)) return { kind: 'unit', unit: mil };
    const cv = G.civilianAt(i);
    if (cv && cv.owner !== atkOwner && G.atWar(atkOwner, cv.owner)) return { kind: 'civilian', unit: cv };
    return null;
  };
  G.canAttackTile = function (u, i) {
    if (!s.units[u.id] || !G.isMilitary(u) || u.attacked || u.mp <= 0) return null;
    const tgt = G.targetAt(u.owner, i);
    if (!tgt) return null;
    const here = G.uidx(u);
    if (G.isWater(here)) return null;
    const def = C.UNITS[u.type];
    const d = Hex.distI(here, i);
    if (def.rng) {
      if (tgt.kind === 'civilian' || d < 1 || d > def.range) return null;
      return { mode: 'ranged', tgt };
    }
    if (d !== 1) return null;
    if (tgt.kind === 'civilian') {
      if (G.isWater(i) || C.TERRAIN[s.tiles[i].t].impassable) return null;
      return { mode: 'capture', tgt };
    }
    return { mode: 'melee', tgt };
  };
  G.predict = function (u, i) {
    const a = G.canAttackTile(u, i);
    if (!a) return null;
    if (a.mode === 'capture') return { mode: 'capture', tgt: a.tgt, dmgDef: 0, dmgAtt: 0, A: 0, D: 0, defHp: 0 };
    const tgt = a.tgt;
    const ranged = a.mode === 'ranged';
    const A = G.attStr(u, tgt, ranged);
    const D = tgt.kind === 'city' ? G.cityStr(tgt.city) : G.defStr(tgt.unit, u);
    const p = { mode: a.mode, tgt, A, D, dmgDef: Math.round(G.dmg(A, D)), dmgAtt: ranged ? 0 : Math.round(G.dmg(D, A)), defHp: tgt.kind === 'city' ? tgt.city.hp : tgt.unit.hp };
    if (tgt.kind === 'city' && !ranged && tgt.city.hp <= 0) {
      p.dmgDef = 0;
      p.dmgAtt = 0;
      p.capture = true;
    }
    return p;
  };

  G.captureCivilians = function (u, i) {
    const civ = s.civs[u.owner];
    for (const x of G.unitsAt(i)) {
      if (x.owner === u.owner || !G.isCivilian(x)) continue;
      const loser = x.owner;
      if (civ.isBarb) {
        G.removeUnit(x);
        G.notify(loser, `你的${C.UNITS[x.type].name}被蛮族掳走了`, 'combat', i);
        continue;
      }
      if (x.type === 'settler') {
        G.removeUnit(x);
        G.createUnit(civ.id, 'builder', i % s.W, Math.floor(i / s.W)).mp = 0;
      } else {
        idxDel(x);
        x.owner = civ.id;
        x.mp = 0;
        x.goal = null;
        x.auto = null;
        x.target = null;
        idxAdd(x);
      }
      G.notify(loser, `你的${C.UNITS[x.type].name}被${civ.name}俘获了`, 'combat', i);
      G.notify(civ.id, `俘获了一个${s.civs[loser].name}的平民单位`, 'combat', i);
    }
  };

  G.attack = function (u, i) {
    const p = G.predict(u, i);
    if (!p) return false;
    const atkCiv = s.civs[u.owner];
    const here = G.uidx(u);
    u.attacked = true;
    u.acted = true;
    u.fort = 0;
    u.goal = null;
    u.sleep = false;
    if (p.mode === 'capture') {
      G.captureCivilians(u, i);
      G.setPos(u, i % s.W, Math.floor(i / s.W));
      u.mp = 0;
      G.onEnter(u, i);
      G.emit('move', { unit: u, path: [here, i] });
      return true;
    }
    const dd = Math.round(p.dmgDef * (0.85 + 0.3 * G.rand()));
    let da = p.mode === 'melee' ? Math.round(p.dmgAtt * (0.85 + 0.3 * G.rand())) : 0;
    u.mp = 0;
    const res = { attacker: u, at: i, from: here, mode: p.mode, dmgDef: 0, dmgAtt: 0, killed: false, died: false };
    if (p.tgt.kind === 'city') {
      const city = p.tgt.city;
      const defOwner = city.owner;
      city.lastHit = s.turn;
      if (p.capture) {
        res.captured = true;
      } else {
        city.hp = Math.max(0, city.hp - dd);
        res.dmgDef = dd;
        u.hp -= da;
        res.dmgAtt = da;
        if (u.hp <= 0) {
          res.died = true;
          G.removeUnit(u);
          G.addStat(s.civs[defOwner], 'kills');
        } else G.addXp(u, 1);
      }
      G.emit('combat', res);
      if (!res.died && city.hp <= 0 && p.mode === 'melee') {
        if (atkCiv.isBarb) city.hp = 1;
        else G.captureCity(city, u);
      } else {
        G.notify(defOwner, `${city.name} 遭到${atkCiv.name}${C.UNITS[u.type].name}的攻击（-${dd}）`, 'combat', i);
      }
      return true;
    }
    const d = p.tgt.unit;
    const defCiv = s.civs[d.owner];
    d.hp -= dd;
    u.hp -= da;
    if (d.hp <= 0 && u.hp <= 0) {
      u.hp = 1;
      da = p.dmgAtt;
    }
    res.dmgDef = dd;
    res.dmgAtt = da;
    res.defender = d;
    if (u.hp <= 0) {
      res.died = true;
      G.removeUnit(u);
      G.addStat(defCiv, 'kills');
      G.addXp(d, 2);
    } else G.addXp(u, 1);
    if (d.hp <= 0) {
      res.killed = true;
      G.removeUnit(d);
      G.addStat(atkCiv, 'kills');
      if (!res.died) G.addXp(u, 2);
      G.notify(d.owner, `你的${C.UNITS[d.type].name}被${atkCiv.name}消灭了`, 'combat', i);
    } else if (!res.died) {
      G.addXp(d, 1);
      G.notify(d.owner, `你的${C.UNITS[d.type].name}遭到${atkCiv.name}攻击（-${dd}）`, 'combat', i);
    }
    G.emit('combat', res);
    // 近战击杀后前进占领该格
    if (res.killed && !res.died && p.mode === 'melee' && G.canEnter(u, i) && !G.militaryAt(i)) {
      G.captureCivilians(u, i);
      G.setPos(u, i % s.W, Math.floor(i / s.W));
      G.onEnter(u, i);
      G.emit('move', { unit: u, path: [here, i] });
    }
    return true;
  };

  G.cityTargets = function (city) {
    if (city.fired || city.hp <= 0) return [];
    const out = [];
    for (const j of Hex.range(city.x, city.y0, 2)) {
      const m = G.militaryAt(j) || G.civilianAt(j);
      if (m && G.isMilitary(m) && m.owner !== city.owner && G.atWar(city.owner, m.owner)) out.push(j);
    }
    return out;
  };
  G.predictCityFire = function (city, i) {
    const d = G.militaryAt(i);
    if (!d) return null;
    const A = G.cityStr(city);
    const D = G.defStr(d, null);
    return { A, D, dmgDef: Math.round(G.dmg(A, D)), defHp: d.hp, unit: d };
  };
  G.cityFire = function (city, i) {
    if (!G.cityTargets(city).includes(i)) return false;
    const p = G.predictCityFire(city, i);
    const d = p.unit;
    const dd = Math.round(p.dmgDef * (0.85 + 0.3 * G.rand()));
    city.fired = true;
    d.hp -= dd;
    const res = { cityId: city.id, from: city.y0 * s.W + city.x, at: i, mode: 'ranged', dmgDef: dd, dmgAtt: 0, defender: d, killed: d.hp <= 0 };
    if (d.hp <= 0) {
      G.removeUnit(d);
      G.addStat(s.civs[city.owner], 'kills');
      G.notify(d.owner, `你的${C.UNITS[d.type].name}被${city.name}的城防消灭了`, 'combat', i);
    }
    G.emit('combat', res);
    return true;
  };

  G.captureCity = function (city, u) {
    const oldId = city.owner;
    const old = s.civs[oldId], neu = s.civs[u.owner];
    const ci = city.y0 * s.W + city.x;
    for (const x of G.unitsAt(ci)) {
      if (x.owner === u.owner) continue;
      if (G.isCivilian(x)) G.captureCivilians(u, ci);
      else G.removeUnit(x);
    }
    const wasCap = city.capital;
    city.owner = neu.id;
    city.capital = false;
    city.pop = Math.max(1, city.pop - 1);
    city.build = null;
    city.prodStock = 0;
    city.prog = {};
    city.food = 0;
    city.hp = 60;
    city.auto = false;
    for (const t of s.tiles) if (t.oc === city.id) t.o = neu.id;
    G.setPos(u, city.x, city.y0);
    u.mp = 0;
    G.emit('move', { unit: u, path: [ci, ci] });
    G.invalidateMods(old);
    G.invalidateMods(neu);
    if (wasCap) {
      const rest = G.citiesOf(oldId);
      if (rest.length) {
        rest.sort((a, b) => b.pop - a.pop);
        rest[0].capital = true;
        G.notify(oldId, `首都失守！${rest[0].name} 成为新的首都`, 'city', rest[0].y0 * s.W + rest[0].x);
      }
    }
    G.notify(oldId, `${city.name} 被${neu.name}攻占了！`, 'combat', ci);
    G.notify(neu.id, `攻占了${old.name}的城市「${city.name}」！`, 'city', ci);
    if (!neu.isHuman && !old.isHuman && G.human().met[neu.id]) G.notify(s.humanId, `${neu.name}攻占了${old.name}的城市「${city.name}」`, 'world');
    G.setStat(neu, 'cities', G.citiesOf(neu.id).length);
    G.emit('cityCaptured', { city, from: oldId, to: neu.id });
    if (!G.citiesOf(oldId).length) G.eliminate(old, neu);
    G.refreshCiv(old);
    G.refreshCiv(neu);
    G.updateVis(neu);
  };
  G.eliminate = function (civ, by) {
    civ.alive = false;
    for (const u of G.unitsOf(civ.id)) G.removeUnit(u);
    for (let k = 0; k < s.civs.length; k++) {
      if (s.civs[k].isBarb) continue;
      s.war[civ.id][k] = false;
      s.war[k][civ.id] = false;
    }
    s.offers = s.offers.filter((o) => o.from !== civ.id);
    G.notify(s.humanId, civ.isHuman ? '你的文明已经灭亡……' : `${civ.name}被${by ? by.name : '敌人'}消灭了！`, 'world');
    G.emit('eliminated', civ);
  };

  // ---------- 研究 ----------
  G.techAvailable = (civ, id) => !civ.techs[id] && C.TECH[id].req.every((r) => civ.techs[r]);
  G.civicAvailable = (civ, id) => !civ.civics[id] && C.CIVIC[id].req.every((r) => civ.civics[r]);
  function pathTo(done, table, id) {
    const out = [];
    const seen = {};
    (function visit(k) {
      if (done[k] || seen[k]) return;
      seen[k] = 1;
      for (const r of table[k].req) visit(r);
      out.push(k);
    })(id);
    return out;
  }
  G.setResearch = function (civ, id) {
    if (civ.techs[id]) return;
    const q = pathTo(civ.techs, C.TECH, id);
    civ.curTech = q.shift();
    civ.techQueue = q;
  };
  G.setCivic = function (civ, id) {
    if (civ.civics[id]) return;
    const q = pathTo(civ.civics, C.CIVIC, id);
    civ.curCivic = q.shift();
    civ.civicQueue = q;
  };
  G.giveScience = function (civ, a) {
    if (civ.curTech) civ.techProg[civ.curTech] = (civ.techProg[civ.curTech] || 0) + a;
    else civ.sciBank += a;
  };
  G.giveCulture = function (civ, a) {
    if (civ.curCivic) civ.civicProg[civ.curCivic] = (civ.civicProg[civ.curCivic] || 0) + a;
    else civ.culBank += a;
  };
  function nextQueued(civ, kind) {
    const isT = kind === 'tech';
    const q = isT ? civ.techQueue : civ.civicQueue;
    const done = isT ? civ.techs : civ.civics;
    while (q.length) {
      const n = q.shift();
      if (done[n]) continue;
      if (isT ? G.techAvailable(civ, n) : G.civicAvailable(civ, n)) return n;
    }
    return null;
  }
  G.addScience = function (civ, amt) {
    if (!civ.curTech) civ.curTech = nextQueued(civ, 'tech');
    if (!civ.curTech) {
      civ.sciBank += amt;
      return;
    }
    const id = civ.curTech;
    civ.techProg[id] = (civ.techProg[id] || 0) + amt + civ.sciBank;
    civ.sciBank = 0;
    const cost = G.techCost(id);
    if (civ.techProg[id] >= cost) {
      const over = civ.techProg[id] - cost;
      G.completeTech(civ, id);
      civ.curTech = nextQueued(civ, 'tech');
      if (civ.curTech) civ.techProg[civ.curTech] = (civ.techProg[civ.curTech] || 0) + over;
      else civ.sciBank = over;
    }
  };
  G.addCulture = function (civ, amt) {
    if (!civ.curCivic) civ.curCivic = nextQueued(civ, 'civic');
    if (!civ.curCivic) {
      civ.culBank += amt;
      return;
    }
    const id = civ.curCivic;
    civ.civicProg[id] = (civ.civicProg[id] || 0) + amt + civ.culBank;
    civ.culBank = 0;
    const cost = G.civicCost(id);
    if (civ.civicProg[id] >= cost) {
      const over = civ.civicProg[id] - cost;
      G.completeCivic(civ, id);
      civ.curCivic = nextQueued(civ, 'civic');
      if (civ.curCivic) civ.civicProg[civ.curCivic] = (civ.civicProg[civ.curCivic] || 0) + over;
      else civ.culBank = over;
    }
  };
  G.completeTech = function (civ, id) {
    civ.techs[id] = true;
    delete civ.techProg[id];
    if (civ.curTech === id) civ.curTech = null;
    if (id === 'satellites') civ.explored.fill(1);
    G.refreshCiv(civ);
    G.notify(civ.id, `完成研究：${C.TECH[id].name}`, 'tech');
    G.emit('techDone', { civ, id });
  };
  G.completeCivic = function (civ, id) {
    civ.civics[id] = true;
    delete civ.civicProg[id];
    if (civ.curCivic === id) civ.curCivic = null;
    G.refreshCiv(civ);
    G.notify(civ.id, `完成市政：${C.CIVIC[id].name}`, 'civic');
    G.emit('civicDone', { civ, id });
  };
  G.addStat = function (civ, k, n) {
    civ.stats[k] = (civ.stats[k] || 0) + (n || 1);
    G.checkBoosts(civ, k);
  };
  G.setStat = function (civ, k, v) {
    if ((civ.stats[k] || 0) < v) {
      civ.stats[k] = v;
      G.checkBoosts(civ, k);
    }
  };
  G.checkBoosts = function (civ, k) {
    if (civ.isBarb) return;
    for (const isT of [true, false]) {
      for (const t of isT ? C.TECHS : C.CIVICS) {
        if (!t.boost || t.boost.stat !== k) continue;
        const key = (isT ? 't:' : 'c:') + t.id;
        if (civ.boosted[key] || (isT ? civ.techs[t.id] : civ.civics[t.id])) continue;
        if ((civ.stats[k] || 0) < t.boost.n) continue;
        civ.boosted[key] = true;
        const prog = isT ? civ.techProg : civ.civicProg;
        const full = isT ? G.techCost(t.id) : G.civicCost(t.id);
        prog[t.id] = Math.min(full, (prog[t.id] || 0) + full * 0.5);
        G.notify(civ.id, `${isT ? '尤里卡' : '鼓舞'}！「${t.name}」进度 +50%（${t.boost.text}）`, 'boost');
      }
    }
  };
  G.techTurns = function (civ, id, isCivic) {
    const y = G.civYields(civ);
    const rate = isCivic ? y.cul : y.sci;
    const cost = isCivic ? G.civicCost(id) : G.techCost(id);
    const prog = (isCivic ? civ.civicProg : civ.techProg)[id] || 0;
    if (rate <= 0) return 99;
    return Math.max(1, Math.ceil((cost - prog) / rate));
  };

  // ---------- 生产 ----------
  G.buildDef = (kind, id) => (kind === 'unit' ? C.UNITS : kind === 'building' ? C.BUILDINGS : kind === 'wonder' ? C.WONDERS : C.PROJECTS)[id];
  G.buildCost = function (civ, kind, id) {
    const d = G.buildDef(kind, id);
    let c = d.cost * G.speedMult();
    if (kind === 'unit') {
      const m = G.mods(civ);
      if (id === 'settler') c = (c + 25 * civ.settlersBuilt * G.speedMult()) * (1 + (m.settlerCost || 0));
      if (id === 'builder') c *= 1 + (m.builderCost || 0);
    }
    return Math.round(c);
  };
  G.purchaseCost = function (civ, kind, id) {
    if (kind !== 'unit' && kind !== 'building') return null;
    return Math.round((G.buildCost(civ, kind, id) * 2) / 5) * 5;
  };
  G.canBuild = function (city, kind, id) {
    const civ = s.civs[city.owner];
    const has = (d) => (!d.tech || civ.techs[d.tech]) && (!d.civic || civ.civics[d.civic]);
    const others = G.citiesOf(civ.id).filter((c) => c !== city);
    if (kind === 'unit') {
      const d = C.UNITS[id];
      if (!has(d)) return false;
      if (d.upgrade && has(C.UNITS[d.upgrade])) return false; // 已过时
      if (id === 'settler' && city.pop < 2) return false;
      return true;
    }
    if (kind === 'building') {
      const d = C.BUILDINGS[id];
      return !city.buildings[id] && has(d) && (!d.req || !!city.buildings[d.req]);
    }
    if (kind === 'wonder') {
      const d = C.WONDERS[id];
      return !s.wonders[id] && has(d) && !others.some((c) => c.build && c.build.kind === 'wonder' && c.build.id === id);
    }
    if (kind === 'project') {
      const d = C.PROJECTS[id];
      if (civ.projects[id] || !city.buildings[d.reqBuilding]) return false;
      if (d.tech && !civ.techs[d.tech]) return false;
      if (d.reqProject && !civ.projects[d.reqProject]) return false;
      return !others.some((c) => c.build && c.build.kind === 'project' && c.build.id === id);
    }
    return false;
  };
  G.buildOptions = function (city) {
    const civ = s.civs[city.owner];
    const out = [];
    const prod = (city.yields || G.refreshCity(city)).prod;
    const m = G.mods(civ);
    const push = (kind, id) => {
      if (!G.canBuild(city, kind, id)) return;
      const cost = G.buildCost(civ, kind, id);
      const rate = kind === 'wonder' ? prod * (1 + (m.wonderPct || 0)) : prod;
      const cur = !city.build || (city.build.kind === kind && city.build.id === id);
      const left = Math.max(0, cost - G.buildProgress(city, kind, id) - (cur ? city.prodStock : 0));
      out.push({ kind, id, cost, turns: rate > 0 ? Math.max(1, Math.ceil(left / rate)) : 99, gold: G.purchaseCost(civ, kind, id) });
    };
    for (const id in C.UNITS) push('unit', id);
    for (const id in C.BUILDINGS) push('building', id);
    for (const id in C.WONDERS) push('wonder', id);
    for (const id in C.PROJECTS) push('project', id);
    return out;
  };
  // 每个项目单独记录进度；未分配的生产力（溢出/储存）在选择新项目时并入
  const bkey = (b) => b.kind + ':' + b.id;
  G.buildProgress = (city, kind, id) => (city.prog && city.prog[kind + ':' + id]) || 0;
  function bankInto(city) {
    if (!city.build || !city.prodStock) return;
    city.prog = city.prog || {};
    const k = bkey(city.build);
    city.prog[k] = (city.prog[k] || 0) + city.prodStock;
    city.prodStock = 0;
  }
  function unbank(city, b) {
    const k = bkey(b);
    if (city.prog && city.prog[k]) {
      city.prodStock += city.prog[k];
      delete city.prog[k];
    }
  }
  G.setBuild = function (city, kind, id) {
    if (!G.canBuild(city, kind, id)) return false;
    city.build = { kind, id };
    bankInto(city);
    return true;
  };
  G.buildTurns = function (city) {
    if (!city.build) return null;
    const o = G.buildOptions(city).find((x) => x.kind === city.build.kind && x.id === city.build.id);
    return o ? o.turns : null;
  };
  G.addProduction = function (city, p) {
    const civ = s.civs[city.owner];
    const b = city.build;
    if (!b) {
      city.prodStock = Math.min(city.prodStock + p, 999);
      return;
    }
    if (!G.canBuild(city, b.kind, b.id) && !(b.id === 'settler' && city.pop < 2)) {
      city.build = null;
      city.prodStock += p;
      unbank(city, b);
      G.notify(civ.id, `${city.name} 无法继续建造${G.buildDef(b.kind, b.id).name}，请重新选择`, 'city', city.y0 * s.W + city.x);
      return;
    }
    bankInto(city);
    city.prog = city.prog || {};
    const k = bkey(b);
    city.prog[k] = (city.prog[k] || 0) + (b.kind === 'wonder' ? p * (1 + (G.mods(civ).wonderPct || 0)) : p);
    const cost = G.buildCost(civ, b.kind, b.id);
    if (city.prog[k] >= cost && G.completeBuild(city, b)) {
      city.prodStock = Math.round((city.prog[k] - cost) * 10) / 10;
      delete city.prog[k];
      city.build = null;
    }
  };
  const BLD_STAT = { walls: 'walls', barracks: 'barracks', library: 'libraries', market: 'markets', workshop: 'workshops', university: 'universities', amphitheater: 'amphitheaters', museum: 'museums' };
  G.completeBuild = function (city, b) {
    const civ = s.civs[city.owner];
    const ci = city.y0 * s.W + city.x;
    const d = G.buildDef(b.kind, b.id);
    if (b.kind === 'unit') {
      if (b.id === 'settler' && city.pop < 2) return false;
      const sp = G.findSpawn(civ.id, ci, d.cls === 'civilian');
      if (sp < 0) return false;
      const u = G.createUnit(civ.id, b.id, sp % s.W, Math.floor(sp / s.W));
      if (b.id === 'settler') {
        city.pop--;
        civ.settlersBuilt++;
      }
      if (d.cls !== 'civilian' && city.buildings.barracks) u.xp = Math.max(u.xp, 3);
      G.notify(civ.id, `${city.name} 训练了${d.name}`, 'unit', sp);
    } else if (b.kind === 'building') {
      city.buildings[b.id] = true;
      if (b.id === 'walls') city.hp += 100;
      if (BLD_STAT[b.id]) G.addStat(civ, BLD_STAT[b.id]);
      G.notify(civ.id, `${city.name} 建成了${d.name}`, 'build', ci);
    } else if (b.kind === 'wonder') {
      if (s.wonders[b.id]) return false;
      s.wonders[b.id] = { civ: civ.id, city: city.id, turn: s.turn };
      G.invalidateMods(civ);
      G.addStat(civ, 'wonders');
      if (b.id === 'terracotta') for (const u of G.unitsOf(civ.id)) if (G.isMilitary(u)) u.xp = [3, 7, 12, 12][G.rank(u)];
      if (civ.isHuman) G.notify(civ.id, `${city.name} 建成了奇观「${d.name}」！`, 'wonder', ci);
      else G.notify(s.humanId, `${G.human().met[civ.id] ? civ.name : '一个未知文明'}建成了奇观「${d.name}」`, 'world');
      for (const c of Object.values(s.cities)) {
        if (c === city) continue;
        if (c.build && c.build.kind === 'wonder' && c.build.id === b.id) {
          c.build = null;
          G.notify(c.owner, `奇观「${d.name}」已被他国抢先建成，${c.name} 的生产力已保留`, 'city', c.y0 * s.W + c.x);
        }
        unbank(c, b);
      }
      G.emit('wonder', { civ, id: b.id, city });
    } else if (b.kind === 'project') {
      civ.projects[b.id] = true;
      if (civ.isHuman) G.notify(civ.id, `完成项目「${d.name}」`, 'wonder', ci);
      else G.notify(s.humanId, `${civ.name}完成了太空项目「${d.name}」！`, 'world');
    }
    G.refreshCiv(civ);
    return true;
  };
  G.purchase = function (city, kind, id) {
    const civ = s.civs[city.owner];
    const cost = G.purchaseCost(civ, kind, id);
    if (cost == null || civ.gold < cost || !G.canBuild(city, kind, id)) return false;
    if (!G.completeBuild(city, { kind, id })) return false;
    civ.gold -= cost;
    unbank(city, { kind, id });
    if (city.build && city.build.kind === kind && city.build.id === id) city.build = null;
    return true;
  };

  // ---------- 外交 ----------
  G.militaryPower = function (civ) {
    let p = 0;
    for (const u of G.unitsOf(civ.id)) if (G.isMilitary(u)) p += (C.UNITS[u.type].str + G.rank(u) * 3) * (0.4 + (0.6 * u.hp) / 100);
    return Math.round(p + G.citiesOf(civ.id).length * 8);
  };
  G.canDeclareWar = (a, b) => a !== b && s.civs[a].met[b] && !G.atWar(a, b) && s.civs[b].alive && s.turn - (s.civs[a].peaceTurn[b] ?? -99) >= 10;
  G.declareWar = function (a, b) {
    if (G.atWar(a, b)) return;
    s.war[a][b] = s.war[b][a] = true;
    s.civs[a].warSince[b] = s.turn;
    s.civs[b].warSince[a] = s.turn;
    const A = s.civs[a], B = s.civs[b];
    if (B.isHuman) G.notify(b, `${A.name}的${A.leader}向你宣战了！`, 'war');
    else if (A.isHuman) G.notify(a, `你向${B.name}宣战了`, 'war');
    else if (G.human().met[a] || G.human().met[b]) G.notify(s.humanId, `${A.name}向${B.name}宣战了`, 'world');
    G.emit('war', { a, b });
  };
  G.makePeace = function (a, b) {
    if (!G.atWar(a, b)) return;
    s.war[a][b] = s.war[b][a] = false;
    s.civs[a].peaceTurn[b] = s.turn;
    s.civs[b].peaceTurn[a] = s.turn;
    s.offers = s.offers.filter((o) => !(o.from === a || o.from === b));
    G.expel(a, b);
    G.expel(b, a);
    const A = s.civs[a], B = s.civs[b];
    if (A.isHuman || B.isHuman) G.notify(s.humanId, `与${(A.isHuman ? B : A).name}签订了和平条约`, 'peace');
    else if (G.human().met[a] || G.human().met[b]) G.notify(s.humanId, `${A.name}与${B.name}签订了和平条约`, 'world');
    G.emit('peace', { a, b });
  };
  // 和平后把单位移出对方领土
  G.expel = function (a, b) {
    for (const u of G.unitsOf(a)) {
      if (s.tiles[G.uidx(u)].o !== b) continue;
      const start = G.uidx(u);
      const seen = new Set([start]);
      let q = [start], found = -1;
      for (let depth = 0; depth < 10 && found < 0 && q.length; depth++) {
        const nq = [];
        for (const i of q) {
          for (const j of Hex.neighbors(i)) {
            if (seen.has(j)) continue;
            seen.add(j);
            nq.push(j);
            if (found < 0 && G.canEnter(u, j) && G.occupancy(u, j) === 'ok') found = j;
          }
        }
        q = nq;
      }
      if (found >= 0) G.setPos(u, found % s.W, Math.floor(found / s.W));
      else G.removeUnit(u);
    }
  };
  G.peaceAcceptable = function (ai, other) {
    const wt = s.turn - (ai.warSince[other.id] ?? s.turn);
    if (wt < 6) return false;
    const pa = G.militaryPower(ai), pb = G.militaryPower(other);
    return pa < pb * 1.15 || wt > 25;
  };
  G.proposePeace = function (fromId, toId) {
    const from = s.civs[fromId], to = s.civs[toId];
    if (!G.atWar(fromId, toId)) return 'notwar';
    if (from.lastAsk[toId] === s.turn) return 'asked';
    from.lastAsk[toId] = s.turn;
    if (G.peaceAcceptable(to, from)) {
      G.makePeace(fromId, toId);
      return 'yes';
    }
    return 'no';
  };

  // ---------- 蛮族 ----------
  const BARB_POOL = [['warrior', 'slinger'], ['warrior', 'archer', 'horseman'], ['swordsman', 'archer', 'horseman', 'spearman'], ['swordsman', 'crossbow', 'knight'], ['musketman', 'knight', 'crossbow'], ['musketman', 'cavalry', 'field_cannon'], ['infantry', 'cavalry']];
  G.barbSpawn = function () {
    const d = C.DIFFICULTY[s.difficulty];
    const barb = s.civs[s.barbId];
    if (s.turn < 6) return;
    const era = Math.max(0, Math.max(...G.majors().filter((c) => c.alive).map(G.era)) - (s.difficulty === 'easy' ? 1 : 0));
    const pool = BARB_POOL[Math.min(era, BARB_POOL.length - 1)];
    const barbUnits = G.unitsOf(barb.id);
    s.camps = s.camps.filter((ci) => s.tiles[ci].camp);
    for (const ci of s.camps) {
      if ((s.turn + ci) % Math.max(5, Math.round(d.barbFreq * G.speedMult())) !== 0) continue;
      if (barbUnits.filter((u) => Hex.distI(G.uidx(u), ci) <= 4).length >= 3) continue;
      const sp = G.findSpawn(barb.id, ci, false);
      if (sp >= 0) G.createUnit(barb.id, pool[G.randInt(pool.length)], sp % s.W, Math.floor(sp / s.W));
    }
    if (s.turn % 25 === 0 && s.camps.length < G.majors().length + 1) G.placeCamp();
  };
  G.placeCamp = function () {
    const majors = G.majors().filter((c) => c.alive);
    for (let tries = 0; tries < 300; tries++) {
      const i = G.randInt(s.tiles.length);
      const t = s.tiles[i];
      if (G.isWater(i) || t.t === 'mountain' || t.o >= 0 || t.camp || t.hut || G.unitsAt(i).length) continue;
      if (majors.some((c) => c._vis && c._vis[i])) continue;
      if (Object.values(s.cities).some((c) => Hex.dist(c.x, c.y0, i % s.W, Math.floor(i / s.W)) < 6)) continue;
      if (s.camps.some((c) => Hex.distI(c, i) < 6)) continue;
      t.camp = 1;
      t.r = null;
      s.camps.push(i);
      G.createUnit(s.barbId, 'warrior', i % s.W, Math.floor(i / s.W));
      return true;
    }
    return false;
  };

  // ---------- 回合 ----------
  G.processCiv = function (civ) {
    const m = G.mods(civ);
    for (const u of G.unitsOf(civ.id)) {
      if (u.acted || u.hp >= 100) continue;
      const t = s.tiles[G.uidx(u)];
      let h = 10;
      if (t.c >= 0 && s.cities[t.c].owner === civ.id) h = 20;
      else if (t.o === civ.id) h = 15;
      else if (t.o >= 0 && G.atWar(civ.id, t.o)) h = 5;
      u.hp = Math.min(100, u.hp + h + (m.heal || 0));
    }
    if (civ.isBarb) return;
    let sci = 0, cul = 0, gold = 0;
    for (const city of G.citiesOf(civ.id)) {
      const y = G.refreshCity(city);
      sci += y.sci;
      cul += y.cul;
      gold += y.gold;
      city.food += y.surplus;
      const need = G.growthNeed(city.pop);
      if (city.food >= need) {
        city.pop++;
        city.food = 0;
        if (civ.isHuman && city.pop % 3 === 0) G.notify(civ.id, `${city.name} 人口增长到 ${city.pop}`, 'grow', city.y0 * s.W + city.x);
      } else if (city.food < 0) {
        if (city.pop > 1) {
          city.pop--;
          city.food = Math.floor(G.growthNeed(city.pop) * 0.5);
          G.notify(civ.id, `${city.name} 发生饥荒，人口减少`, 'city', city.y0 * s.W + city.x);
        } else city.food = 0;
      }
      G.addProduction(city, y.prod);
      city.culture += y.cul * (1 + (m.borderGrowth || 0));
      for (let guard = 0; guard < 3; guard++) {
        const need2 = G.borderNeed(city);
        if (city.culture < need2) break;
        if (!G.expandBorder(city)) {
          city.culture = need2;
          break;
        }
        city.culture -= need2;
      }
      if (s.turn - city.lastHit >= 1) city.hp = Math.min(G.cityMaxHp(city), city.hp + 20);
    }
    civ.gold = Math.round((civ.gold + gold) * 10) / 10;
    G.addScience(civ, sci);
    G.addCulture(civ, cul);
    for (const city of G.citiesOf(civ.id)) G.refreshCity(city);
  };

  G.endTurn = function () {
    if (s.winner != null && !s.continued) return;
    for (const civ of s.civs) {
      if (!civ.alive || civ.isHuman) continue;
      try {
        if (civ.isBarb) C.AI.barbTurn(civ);
        else C.AI.takeTurn(civ);
      } catch (e) {
        console.error('AI 出错', civ.name, e);
      }
    }
    for (const civ of s.civs) if (civ.alive) G.processCiv(civ);
    G.barbSpawn();
    s.turn++;
    for (const u of Object.values(s.units)) {
      u.mp = G.maxMoves(u);
      u.attacked = false;
      u.acted = false;
      u.skip = false;
    }
    for (const c of Object.values(s.cities)) c.fired = false;
    for (const civ of s.civs) if (civ.alive && !civ.isBarb) G.updateVis(civ);
    G.checkVictory();
    G.startHumanTurn();
    G.emit('turn', s.turn);
  };
  G.startHumanTurn = function () {
    const h = G.human();
    if (!h.alive) return;
    for (const c of G.citiesOf(h.id)) if (c.auto && !c.build) city_auto(c);
    for (const u of G.unitsOf(h.id)) {
      if (!s.units[u.id]) continue;
      if (u.goal != null) G.continueMove(u);
      else if (u.auto === 'explore') C.AI.autoExplore(u);
      else if (u.auto === 'work') C.AI.builder(u);
    }
    G.updateVis(h);
  };
  function city_auto(c) {
    const b = C.AI.chooseBuild(c);
    if (b) c.build = b;
  }
  G.needsOrders = (u) => u.mp > 0 && !u.sleep && !u.fort && !u.skip && u.goal == null && !u.auto;
  G.pending = function () {
    const h = G.human();
    if (!h.curTech && C.TECHS.some((t) => G.techAvailable(h, t.id))) return { kind: 'tech' };
    if (!h.curCivic && C.CIVICS.some((t) => G.civicAvailable(h, t.id))) return { kind: 'civic' };
    const c = G.citiesOf(h.id).find((x) => !x.build);
    if (c) return { kind: 'city', city: c };
    return null;
  };

  // ---------- 分数与胜利 ----------
  G.score = function (civ) {
    const cities = G.citiesOf(civ.id);
    let pop = 0;
    for (const c of cities) pop += c.pop;
    return cities.length * 5 + pop * 2 + Object.keys(civ.techs).length * 3 + Object.keys(civ.civics).length * 3 + G.wondersOf(civ).length * 15 + Object.keys(civ.projects).length * 25 + Math.floor((civ.stats.kills || 0) / 2);
  };
  G.checkVictory = function () {
    if (s.winner != null) return;
    const majors = G.majors();
    const alive = majors.filter((c) => c.alive);
    const h = G.human();
    if (!h.alive) return G.win(alive.sort((a, b) => G.score(b) - G.score(a))[0] || null, 'defeat');
    for (const c of alive) {
      if (c.projects.satellite && c.projects.moon && c.projects.mars) return G.win(c, 'science');
      if (c.civics.globalization && G.wondersOf(c).length >= 3) return G.win(c, 'culture');
    }
    for (const c of alive) {
      let ok = c.foundedAny;
      for (const o of majors) {
        if (o === c || !o.alive) continue;
        const cap = s.cities[o.originalCapital];
        if (!cap || cap.owner !== c.id) {
          ok = false;
          break;
        }
      }
      if (ok) return G.win(c, 'domination');
    }
    if (s.turn > s.maxTurns) return G.win(alive.sort((a, b) => G.score(b) - G.score(a))[0], 'score');
  };
  G.win = function (civ, type) {
    s.winner = civ ? civ.id : -1;
    s.victoryType = type;
    G.emit('gameOver', { civ, type });
  };

  // ---------- 通知 ----------
  G.notify = function (civId, text, kind, at) {
    if (!s || civId !== s.humanId) return;
    const n = { turn: s.turn, text, kind: kind || 'info', at: at == null ? -1 : at };
    s.log.push(n);
    if (s.log.length > 120) s.log.shift();
    G.emit('notify', n);
  };

  // ---------- 存档 ----------
  function u8ToB64(u8) {
    let str = '';
    for (let i = 0; i < u8.length; i += 4096) str += String.fromCharCode.apply(null, u8.subarray(i, i + 4096));
    return btoa(str);
  }
  function b64ToU8(b) {
    const str = atob(b);
    const u8 = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
    return u8;
  }
  G.serialize = () =>
    JSON.stringify(s, (k, v) => {
      if (k && k[0] === '_') return undefined;
      if (v instanceof Uint8Array) return { __u8: u8ToB64(v) };
      return v;
    });
  G.load = function (str) {
    const o = JSON.parse(str, (k, v) => (v && typeof v === 'object' && v.__u8 ? b64ToU8(v.__u8) : v));
    if (!o || !o.tiles || !o.civs) throw new Error('存档无效');
    s = o;
    Hex.setSize(s.W, s.H);
    G.rebuildIndex();
    G.invalidateMods();
    for (const c of Object.values(s.cities)) G.refreshCity(c);
    for (const civ of s.civs) if (civ.alive && !civ.isBarb) G.updateVis(civ);
    G.emit('loaded', s);
    return s;
  };
})();
