// 界面：输入、面板、科技树、外交、弹窗、开始界面、存档
(function () {
  const C = globalThis.Civ;
  const Hex = C.Hex;
  const G = C.G;
  const R = C.R;
  const AI = C.AI;
  const UI = (C.UI = {});
  const $ = (q) => document.querySelector(q);
  const S = () => G.state();
  const YI = C.YIELD_ICON;
  const KEY_AUTO = 'civlite.autosave', KEY_SAVE = 'civlite.save1', KEY_OPTS = 'civlite.opts', KEY_THEME = 'civlite.theme', KEY_TUTOR = 'civlite.tutor';

  const ICON = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.7"/><path d="M12 17h.01"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><path d="M12 3 19 7v8l-7 4-7-4V7z"/><path d="M12 11v8M5 7l7 4 7-4"/></svg>',
    yields: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="7" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="17" cy="12" r="2.2"/></svg>',
  };

  let sel = { unit: null, city: null };
  let mode = null; // null | 'move' | 'cityFire'
  let busy = false;
  let modalStack = [];
  let modalQueue = [];
  let tipTimer = null;
  let lastHover = -1;
  let gameOverShown = false;
  UI.sel = sel;

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n) => (Math.round(n * 10) / 10).toString();
  const ytxt = (y) =>
    Object.keys(y)
      .filter((k) => y[k])
      .map((k) => `+${y[k]}${YI[k]}`)
      .join(' ');
  const civMark = (civ, big) => `<span class="civ-mark" style="background:${civ.color};color:${civ.text}">${esc(civ.name[0])}</span>`;
  const ring = (f) =>
    `<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="none" stroke="var(--fill)" stroke-width="4"/><circle cx="18" cy="18" r="14" fill="none" stroke="var(--primary)" stroke-width="4" stroke-linecap="round" stroke-dasharray="${Math.max(0.01, f * 88)} 88" transform="rotate(-90 18 18)"/></svg>`;
  const hpCls = (f) => (f > 0.6 ? '' : f > 0.3 ? 'warn' : 'bad');

  // ---------- 提示 ----------
  UI.toast = function (text, kind) {
    const host = $('#toast-host');
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.textContent = text;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2600);
  };
  UI.addNote = function (n) {
    const box = $('#notes');
    const el = document.createElement('div');
    el.className = 'note ' + n.kind;
    el.textContent = n.text;
    el.onclick = () => {
      if (n.at >= 0) R.centerOn(n.at);
      el.remove();
    };
    box.prepend(el);
    while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    }, 9000);
  };

  // ---------- 弹窗 ----------
  UI.modal = function (o) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `<div class="modal ${o.cls || 'modal-sm'}"><div class="modal-header"><span>${o.title || ''}</span>${o.noClose ? '' : `<button class="modal-x" data-x>${ICON.x}</button>`}</div><div class="modal-body">${o.body || ''}</div>${o.buttons && o.buttons.length ? '<div class="modal-footer"></div>' : ''}</div>`;
    const m = { el: ov, body: ov.querySelector('.modal-body') };
    let closed = false;
    m.close = () => {
      if (closed) return;
      closed = true;
      ov.remove();
      modalStack = modalStack.filter((x) => x !== m);
      if (o.onClose) o.onClose();
      if (!modalStack.length) setTimeout(showQueued, 60);
    };
    m.dismiss = o.noClose ? null : m.close;
    const x = ov.querySelector('[data-x]');
    if (x) x.onclick = m.close;
    if (!o.noClose) ov.addEventListener('mousedown', (e) => e.target === ov && m.close());
    const foot = ov.querySelector('.modal-footer');
    for (const b of o.buttons || []) {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.primary ? 'btn-primary' : b.danger ? 'btn-danger' : '');
      el.textContent = b.text;
      el.onclick = () => {
        if (!b.onClick || b.onClick() !== false) m.close();
      };
      foot.appendChild(el);
    }
    $('#modal-root').appendChild(ov);
    modalStack.push(m);
    return m;
  };
  UI.queueModal = function (fn) {
    modalQueue.push(fn);
    if (!modalStack.length && !busy) showQueued();
  };
  function showQueued() {
    if (modalStack.length || busy || !modalQueue.length) return;
    const fn = modalQueue.shift();
    fn();
  }
  UI.confirm = function (title, text, okText, danger, onOk) {
    UI.modal({
      title,
      body: `<div class="modal-icon ${danger ? 'bad' : ''}">${danger ? '!' : '?'}</div><p>${text}</p>`,
      buttons: [{ text: '取消' }, { text: okText || '确定', primary: !danger, danger, onClick: onOk }],
    });
  };

  // ---------- 初始化 ----------
  UI.init = function () {
    try {
      const th = localStorage.getItem(KEY_THEME);
      if (th) document.documentElement.dataset.theme = th;
    } catch (e) {}
    R.init($('#map'), $('#minimap'));
    $('#btn-menu').innerHTML = ICON.menu;
    $('#btn-help').innerHTML = ICON.help;
    $('#btn-diplo').innerHTML = ICON.globe;
    $('#tool-yields').innerHTML = ICON.yields;
    $('#tool-grid').innerHTML = ICON.grid;
    $('#tool-home').innerHTML = ICON.home;
    $('#btn-menu').onclick = () => UI.openMenu();
    $('#btn-help').onclick = () => UI.openHelp();
    $('#btn-diplo').onclick = () => UI.openDiplomacy();
    $('#tb-tech').onclick = () => UI.openTree('tech');
    $('#tb-civic').onclick = () => UI.openTree('civic');
    $('#end-turn').onclick = () => UI.onEndTurn();
    $('#tool-yields').onclick = () => {
      R.showYields = !R.showYields;
      R.dirty = true;
      refreshTools();
    };
    $('#tool-grid').onclick = () => {
      R.showGrid = !R.showGrid;
      R.dirty = true;
      refreshTools();
    };
    $('#tool-home').onclick = () => UI.centerCapital();
    bindMap();
    bindMinimap();
    bindKeys();
    G.on(onGameEvent);
    UI.showStart();
  };

  function refreshTools() {
    $('#tool-yields').classList.toggle('on', R.showYields);
    $('#tool-grid').classList.toggle('on', R.showGrid);
  }

  // ---------- 游戏事件 ----------
  function onGameEvent(type, d) {
    const s = S();
    if (!s) return;
    const h = G.human();
    const vis = G.vis(h);
    if (type === 'move') {
      R.animateMove(d.unit, d.path, busy);
      if (d.unit.owner === h.id) R.markMini();
    } else if (type === 'combat') {
      if (!vis[d.at] && !vis[d.from]) return;
      R.flash(d.from, d.at);
      if (d.dmgDef) R.addFx(d.at, `-${d.dmgDef}`, '#ff6b5e');
      if (d.dmgAtt) R.addFx(d.from, `-${d.dmgAtt}`, '#ffb340', 150);
      if (d.killed) R.addFx(d.at, '击败', '#ffd60a', 300);
      if (d.died) R.addFx(d.from, '阵亡', '#ff6b5e', 300);
    } else if (type === 'fx') {
      if (vis[d.at]) R.addFx(d.at, d.text, '#ffffff');
    } else if (type === 'notify') {
      UI.addNote(d);
    } else if (type === 'unitRemoved') {
      if (sel.unit && sel.unit.id === d.id) {
        sel.unit = null;
        R.selUnit = null;
      }
    } else if (type === 'cityFounded' || type === 'cityCaptured' || type === 'eliminated' || type === 'techDone') {
      R.markMini();
      if (type === 'techDone' && d.civ.isHuman) UI.toast(`研究完成：${C.TECH[d.id].name}`, 'success');
      if (type === 'cityCaptured' && d.from === h.id && sel.city && sel.city.id === d.city.id) UI.deselect();
    } else if (type === 'civicDone') {
      if (d.civ.isHuman) UI.toast(`市政完成：${C.CIVIC[d.id].name}`, 'success');
    } else if (type === 'met') {
      UI.queueModal(() => showMeet(d));
    } else if (type === 'war') {
      if (d.b === h.id) UI.queueModal(() => showWarOn(s.civs[d.a]));
    } else if (type === 'wonder') {
      if (d.civ.isHuman) UI.queueModal(() => showWonder(d.id, d.city));
    } else if (type === 'gameOver') {
      if (!gameOverShown) {
        gameOverShown = true;
        UI.queueModal(showGameOver);
      }
    }
  }

  // ---------- 选择 ----------
  UI.selectUnit = function (u, center) {
    sel.unit = u;
    sel.city = null;
    mode = null;
    R.selUnit = u;
    $('#app').classList.remove('city-open');
    $('#city-panel').classList.add('hidden');
    if (center && !R.isOnScreen(G.uidx(u))) R.centerOn(G.uidx(u));
    UI.refresh();
  };
  UI.selectCity = function (c, center) {
    sel.unit = null;
    sel.city = c;
    mode = null;
    R.selUnit = null;
    if (center) R.centerOn(c.y0 * S().W + c.x);
    UI.refresh();
  };
  UI.deselect = function () {
    sel.unit = null;
    sel.city = null;
    mode = null;
    R.selUnit = null;
    UI.refresh();
  };
  UI.nextUnit = function () {
    const s = S();
    const h = G.human();
    const list = G.unitsOf(h.id).filter(G.needsOrders);
    if (!list.length) {
      UI.deselect();
      return false;
    }
    let cur = sel.unit ? G.uidx(sel.unit) : null;
    let pick = list[0];
    if (cur != null) {
      const others = list.filter((u) => u !== sel.unit);
      if (!others.length) pick = list[0];
      else pick = others.sort((a, b) => Hex.distI(G.uidx(a), cur) - Hex.distI(G.uidx(b), cur))[0];
    }
    UI.selectUnit(pick, true);
    return true;
  };
  UI.centerCapital = function () {
    const h = G.human();
    const cap = G.citiesOf(h.id).find((c) => c.capital) || G.citiesOf(h.id)[0];
    if (cap) R.centerOn(cap.y0 * S().W + cap.x);
    else {
      const u = G.unitsOf(h.id)[0];
      if (u) R.centerOn(G.uidx(u));
    }
  };

  function afterAction(autoNext) {
    const s = S();
    if (sel.unit && !s.units[sel.unit.id]) {
      sel.unit = null;
      R.selUnit = null;
    }
    G.updateVis(G.human());
    R.markMini();
    UI.refresh();
    if (autoNext && (!sel.unit || !G.needsOrders(sel.unit))) setTimeout(() => !busy && !modalStack.length && UI.nextUnit(), 280);
  }

  // ---------- 覆盖层 ----------
  function updateOverlays() {
    const s = S();
    R.ov.reach = null;
    R.ov.attack = null;
    R.ov.sites = null;
    R.ov.yields = false;
    R.ov.cityTiles = null;
    R.ov.worked = null;
    R.ov.rangeTiles = null;
    if (!s) return;
    const h = G.human();
    const u = sel.unit;
    if (u && s.units[u.id] && u.owner === h.id) {
      R.ov.reach = C.Path.reachable(u);
      const def = C.UNITS[u.type];
      const att = new Set();
      if (G.isMilitary(u) && !u.attacked && u.mp > 0) {
        for (const j of Hex.rangeI(G.uidx(u), def.rng ? def.range : 1)) if (G.canAttackTile(u, j)) att.add(j);
      }
      R.ov.attack = att;
      if (u.type === 'settler') {
        R.ov.yields = true;
        const valid = new Set();
        const cands = [];
        for (const j of Hex.rangeI(G.uidx(u), 8)) {
          if (!h.explored[j] || !G.canFoundAt(h.id, j)) continue;
          valid.add(j);
          cands.push([AI.siteScore(h, j) - Hex.distI(G.uidx(u), j) * 0.8, j]);
        }
        cands.sort((a, b) => b[0] - a[0]);
        const best = [];
        for (const [, j] of cands) {
          if (best.every((b) => Hex.distI(b, j) >= 3)) best.push(j);
          if (best.length >= 3) break;
        }
        R.ov.sites = { valid, best };
      }
      if (u.type === 'builder') R.ov.yields = true;
    }
    const c = sel.city;
    if (c && s.cities[c.id]) {
      const ci = c.y0 * s.W + c.x;
      R.ov.cityTiles = Hex.rangeI(ci, 3).filter((j) => s.tiles[j].oc === c.id);
      R.ov.worked = c.worked || [];
      R.ov.yields = c.owner === h.id;
      if (mode === 'cityFire') {
        R.ov.rangeTiles = Hex.rangeI(ci, 2);
        R.ov.attack = new Set(G.cityTargets(c));
      }
    }
    R.dirty = true;
  }

  // ---------- 刷新 ----------
  UI.refresh = function () {
    if (!S()) return;
    refreshTop();
    renderUnitPanel();
    renderCityPanel();
    refreshEndTurn();
    updateOverlays();
  };

  function refreshTop() {
    const s = S();
    const h = G.human();
    const y = G.civYields(h);
    $('#tb-mark').innerHTML = civMark(h);
    $('#tb-name').textContent = `${h.name} · ${h.leader}`;
    $('#tb-sub').textContent = `${C.ERAS[G.era(h)]}时代 · 分数 ${G.score(h)}`;
    $('#st-sci').innerHTML = `${YI.sci} <span>+${fmt(y.sci)}</span>`;
    $('#st-cul').innerHTML = `${YI.cul} <span>+${fmt(y.cul)}</span>`;
    $('#st-gold').innerHTML = `${YI.gold} <span>${Math.floor(h.gold)}</span><small>+${fmt(y.gold)}</small>`;
    const t = h.curTech;
    $('#tb-tech').innerHTML = t
      ? `${ring((h.techProg[t] || 0) / G.techCost(t))}<div><div class="pl">科技 · ${G.techTurns(h, t)} 回合</div><div class="pn">${C.TECH[t].name}</div></div>`
      : `${ring(0)}<div><div class="pl">科技</div><div class="pn">${C.TECHS.some((x) => G.techAvailable(h, x.id)) ? '选择研究' : '已全部完成'}</div></div>`;
    $('#tb-tech').classList.toggle('need', !t && C.TECHS.some((x) => G.techAvailable(h, x.id)));
    const cv = h.curCivic;
    $('#tb-civic').innerHTML = cv
      ? `${ring((h.civicProg[cv] || 0) / G.civicCost(cv))}<div><div class="pl">市政 · ${G.techTurns(h, cv, true)} 回合</div><div class="pn">${C.CIVIC[cv].name}</div></div>`
      : `${ring(0)}<div><div class="pl">市政</div><div class="pn">${C.CIVICS.some((x) => G.civicAvailable(h, x.id)) ? '选择市政' : '已全部完成'}</div></div>`;
    $('#tb-civic').classList.toggle('need', !cv && C.CIVICS.some((x) => G.civicAvailable(h, x.id)));
    $('#tb-turn').innerHTML = `<b>回合 ${s.turn} / ${s.maxTurns}</b><small>${G.year()}</small>`;
  }

  function refreshEndTurn() {
    const s = S();
    const btn = $('#end-turn');
    const p = G.pending();
    const h = G.human();
    if (s.winner != null && !s.continued) {
      btn.innerHTML = '<span>游戏结束</span><span class="et-sub">查看结果</span>';
      btn.classList.add('pending');
      return;
    }
    if (p) {
      const label = p.kind === 'tech' ? '选择科技研究' : p.kind === 'civic' ? '选择市政' : `选择生产 · ${p.city.name}`;
      btn.innerHTML = `<span>${esc(label)}</span><span class="et-sub">点击前往</span>`;
      btn.classList.add('pending');
    } else {
      const idle = G.unitsOf(h.id).filter(G.needsOrders).length;
      btn.innerHTML = `<span>下一回合</span><span class="et-sub">${idle ? `${idle} 个单位待命 · Tab 切换` : 'Enter 结束回合'}</span>`;
      btn.classList.remove('pending');
    }
  }

  // ---------- 单位面板 ----------
  function renderUnitPanel() {
    const el = $('#unit-panel');
    const s = S();
    const u = sel.unit;
    if (!u || !s.units[u.id]) {
      el.classList.add('hidden');
      $('#app').classList.remove('unit-open');
      return;
    }
    el.classList.remove('hidden');
    $('#app').classList.add('unit-open');
    const civ = s.civs[u.owner];
    const def = C.UNITS[u.type];
    const own = u.owner === s.humanId;
    const i = G.uidx(u);
    const stats = [];
    if (def.str) stats.push(['战斗力', G.baseStr(u, false)]);
    if (def.rng) stats.push([`远程 · ${def.range}格`, G.baseStr(u, true)]);
    if (u.type === 'builder') stats.push(['剩余次数', u.charges]);
    stats.push(['移动力', `${u.mp}/${G.maxMoves(u)}`]);
    if (G.isMilitary(u)) stats.push(['等级', G.rank(u) ? '★'.repeat(G.rank(u)) : '新兵']);
    stats.push(['生命', u.hp]);
    const acts = [];
    let hint = '';
    if (own) {
      if (u.type === 'settler') {
        const ok = G.canFoundAt(u.owner, i);
        acts.push({ t: '建立城市', k: 'B', p: true, d: !ok, fn: actFound });
        hint = ok ? '这里可以建城。蓝色 ★ 是推荐城址，地块上的彩色圆点代表产出。' : '这里不能建城（离其他城市太近或在他国领土）。移动到 ★ 推荐位置再建城。';
      }
      if (u.type === 'builder') {
        const imp = G.canImprove(u);
        acts.push({ t: imp ? `建造${C.IMPROVEMENTS[imp].name}` : '建造改良', k: 'I', p: !!imp, d: !imp, fn: actImprove });
        acts.push({ t: '自动工作', fn: actAutoWork });
        hint = imp ? `将在此建造${C.IMPROVEMENTS[imp].name}：${ytxt(C.IMPROVEMENTS[imp].yields)}` : '移动到己方领土中未改良的地块（农田、丘陵、资源）来建造改良。';
      }
      if (G.isMilitary(u)) {
        if (u.fort) acts.push({ t: '取消驻扎', k: 'F', fn: actWake });
        else acts.push({ t: '驻扎', k: 'F', fn: actFortify });
        if (def.rng) hint = '红框标出的是射程内可攻击的目标。远程攻击不会受到反击。';
        else hint = '右键（或左键点击蓝色/远处地块）移动；移动到红框敌人上发动攻击。';
      } else if (u.sleep) acts.push({ t: '唤醒', k: 'F', fn: actWake });
      else acts.push({ t: '睡眠', k: 'F', fn: actFortify });
      if (def.cls === 'recon' || (G.isMilitary(u) && s.turn < 40)) acts.push({ t: u.auto === 'explore' ? '停止探索' : '自动探索', k: 'E', fn: actExplore });
      const up = G.upgradeInfo(u);
      if (up) acts.push({ t: `升级为${C.UNITS[up.to].name} ${up.cost}${YI.gold}`, k: 'U', d: !G.canUpgrade(u), fn: actUpgrade, title: s.tiles[i].o !== u.owner ? '需要在己方领土内升级' : '' });
      if (u.goal != null) acts.push({ t: '取消移动', fn: actCancelMove });
      acts.push({ t: '移动', k: 'M', fn: actMoveMode, ghost: true });
      acts.push({ t: '跳过', k: '空格', fn: actSkip, ghost: true });
      acts.push({ t: '解散', k: 'Del', fn: actDisband, danger: true });
      if (u.mp <= 0) hint = '本回合已无移动力。';
      if (mode === 'move') hint = '点击目标地块进行移动（Esc 取消）。';
    }
    const hpF = u.hp / 100;
    el.innerHTML = `
      <div class="up-head">
        <div class="up-disc" style="background:${civ.color};color:${civ.text}">${def.ch}</div>
        <div><div class="up-title">${def.name}</div><div class="up-sub">${own ? '' : esc(civ.name) + ' · '}${C.CLS_NAME[def.cls]}单位${def.desc ? ' · ' + def.desc : ''}</div></div>
        <button class="icon-btn up-close" id="up-close" title="取消选择 (Esc)">${ICON.x}</button>
      </div>
      <div class="up-stats" style="grid-template-columns:repeat(${Math.min(4, stats.length)},1fr)">${stats.slice(0, 4).map(([l, v]) => `<div class="us"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="hpbar" title="生命值 ${u.hp}/100"><i class="${hpCls(hpF)}" style="width:${u.hp}%"></i></div>
      ${acts.length ? `<div class="up-actions">${acts.map((a, k) => `<button class="btn btn-sm ${a.p ? 'btn-primary' : a.danger ? 'btn-danger' : a.ghost ? 'btn-ghost' : ''}" data-a="${k}" ${a.d ? 'disabled' : ''} title="${esc(a.title || '')}">${a.t}${a.k ? ` <kbd>${a.k}</kbd>` : ''}</button>`).join('')}</div>` : ''}
      ${hint ? `<div class="up-hint">${hint}</div>` : ''}`;
    $('#up-close').onclick = () => UI.deselect();
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => acts[+b.dataset.a].fn(u)));
    UI._acts = acts;
  }

  function actFound(u) {
    const c = G.foundCity(u);
    if (!c) return UI.toast('这里不能建立城市', 'error');
    R.markMini();
    UI.selectCity(c);
    if (G.citiesOf(c.owner).length === 1) UI.toast('首都建立！在右侧面板选择要生产的项目');
  }
  function actImprove(u) {
    if (G.improve(u)) afterAction(true);
  }
  function actAutoWork(u) {
    u.auto = 'work';
    u.goal = null;
    AI.builder(u);
    afterAction(true);
  }
  function actFortify(u) {
    if (G.isMilitary(u)) u.fort = 1;
    else u.sleep = true;
    u.goal = null;
    u.auto = null;
    afterAction(true);
  }
  function actWake(u) {
    u.fort = 0;
    u.sleep = false;
    UI.refresh();
  }
  function actExplore(u) {
    if (u.auto === 'explore') {
      u.auto = null;
      UI.refresh();
      return;
    }
    u.auto = 'explore';
    u.goal = null;
    u.fort = 0;
    AI.autoExplore(u);
    afterAction(true);
  }
  function actUpgrade(u) {
    if (G.upgradeUnit(u)) {
      UI.toast('单位已升级', 'success');
      afterAction(false);
    }
  }
  function actCancelMove(u) {
    u.goal = null;
    UI.refresh();
  }
  function actMoveMode() {
    mode = mode === 'move' ? null : 'move';
    UI.refresh();
  }
  function actSkip(u) {
    u.skip = true;
    afterAction(true);
  }
  function actDisband(u) {
    UI.confirm('解散单位', `确定要解散这个${C.UNITS[u.type].name}吗？`, '解散', true, () => {
      G.removeUnit(u);
      afterAction(true);
    });
  }

  // ---------- 城市面板 ----------
  function prodIcon(o) {
    const s = S();
    if (o.kind === 'unit') {
      const civ = s.civs[sel.city.owner];
      return `<span class="mini-disc" style="background:${civ.color};color:${civ.text}">${C.UNITS[o.id].ch}</span>`;
    }
    return G.buildDef(o.kind, o.id).icon || '🏗️';
  }
  function prodDesc(kind, id) {
    const d = G.buildDef(kind, id);
    if (kind === 'unit') {
      const parts = [];
      if (d.str) parts.push(`战斗力 ${d.str}`);
      if (d.rng) parts.push(`远程 ${d.rng}（${d.range}格）`);
      parts.push(`移动 ${d.move}`);
      return parts.join(' · ') + (d.desc ? ' · ' + d.desc : '');
    }
    const y = d.yields ? ytxt(d.yields) : '';
    return [y, d.desc].filter(Boolean).join(' · ');
  }
  function renderCityPanel() {
    const el = $('#city-panel');
    const s = S();
    const c = sel.city;
    if (!c || !s.cities[c.id]) {
      el.classList.add('hidden');
      $('#app').classList.remove('city-open');
      return;
    }
    el.classList.remove('hidden');
    $('#app').classList.add('city-open');
    const civ = s.civs[c.owner];
    const own = c.owner === s.humanId;
    const y = c.yields || G.refreshCity(c);
    const head = `
      <div class="cp-head">
        <div class="cp-title"><span class="pop" style="background:${civ.color};color:${civ.text}">${c.pop}</span><span class="nm">${c.capital ? '★ ' : ''}${esc(c.name)}</span><button class="icon-btn" id="cp-close" title="关闭 (Esc)">${ICON.x}</button></div>
        <div class="cp-sub">${own ? '' : esc(civ.name) + ' · '}城防 ${G.cityStr(c)} · 生命 ${c.hp}/${G.cityMaxHp(c)}${c.origCapital && c.origOwner !== c.owner ? ` · ${esc(s.civs[c.origOwner].name)}的原首都` : ''}</div>
      </div>`;
    if (!own) {
      el.innerHTML = `${head}<div class="cp-body"><div class="sec-title">建筑</div><div class="chips">${Object.keys(c.buildings).map((b) => `<span class="chip-s">${C.BUILDINGS[b].icon} ${C.BUILDINGS[b].name}</span>`).join('') || '<span class="muted">暂无</span>'}</div>
        <div class="sec-title">奇观</div><div class="chips">${Object.keys(s.wonders).filter((w) => s.wonders[w].city === c.id).map((w) => `<span class="chip-s">${C.WONDERS[w].icon} ${C.WONDERS[w].name}</span>`).join('') || '<span class="muted">暂无</span>'}</div></div>`;
      $('#cp-close').onclick = () => UI.deselect();
      return;
    }
    const need = G.growthNeed(c.pop);
    const growTxt = y.surplus > 0 ? `${Math.max(1, Math.ceil((need - c.food) / y.surplus))} 回合后人口增长` : y.surplus < 0 ? '食物短缺，人口将减少' : '人口停滞';
    const bNeed = G.borderNeed(c);
    const cul = y.cul * (1 + (G.mods(civ).borderGrowth || 0));
    const borderTxt = cul > 0 ? `${Math.max(1, Math.ceil((bNeed - c.culture) / cul))} 回合` : '—';
    const opts = G.buildOptions(c);
    const rec = AI.chooseBuild(c, true);
    let cur = '';
    if (c.build) {
      const d = G.buildDef(c.build.kind, c.build.id);
      const cost = G.buildCost(civ, c.build.kind, c.build.id);
      const t = G.buildTurns(c);
      cur = `<div class="cur-build"><div class="row1"><span>${prodIcon(c.build)}</span><span>${d.name}</span><span class="t">${t != null ? t + ' 回合' : '等待中'}</span></div><div class="pbar"><i style="width:${Math.min(100, ((G.buildProgress(c, c.build.kind, c.build.id) + c.prodStock) / cost) * 100)}%"></i></div></div>`;
    } else cur = `<div class="cur-build none">尚未选择生产项目——从下面的列表中选择一项${c.prodStock > 0 ? `（已储存 ${fmt(c.prodStock)} 生产力）` : ''}</div>`;
    const groups = [['unit', '单位'], ['building', '建筑'], ['wonder', '奇观'], ['project', '太空计划']];
    let list = '';
    for (const [kind, label] of groups) {
      const items = opts.filter((o) => o.kind === kind);
      if (!items.length) continue;
      list += `<div class="sec-title">${label}</div>`;
      for (const o of items) {
        const d = G.buildDef(kind, o.id);
        const active = c.build && c.build.kind === kind && c.build.id === o.id;
        const isRec = rec && rec.kind === kind && rec.id === o.id;
        const canBuy = o.gold != null && civ.gold >= o.gold && !(kind === 'unit' && G.findSpawn(civ.id, c.y0 * s.W + c.x, C.UNITS[o.id].cls === 'civilian') < 0);
        list += `<div class="prow ${active ? 'active' : ''}" data-k="${kind}" data-id="${o.id}" title="${esc(prodDesc(kind, o.id))}">
          <span class="pi">${prodIcon(o)}</span>
          <span><div class="pn">${d.name}${isRec ? '<span class="rec">推荐</span>' : ''}</div><div class="pd">${esc(prodDesc(kind, o.id))}</div></span>
          <span class="pt">${o.turns} 回合</span>
          ${o.gold != null ? `<button class="buy" data-buy="${kind}:${o.id}" ${canBuy ? '' : 'disabled'} title="用金币立即购买">${o.gold}${YI.gold}</button>` : '<span></span>'}
        </div>`;
      }
    }
    const blds = Object.keys(c.buildings).map((b) => `<span class="chip-s">${C.BUILDINGS[b].icon} ${C.BUILDINGS[b].name}</span>`);
    const wds = Object.keys(s.wonders).filter((w) => s.wonders[w].city === c.id).map((w) => `<span class="chip-s">${C.WONDERS[w].icon} ${C.WONDERS[w].name}</span>`);
    const targets = G.cityTargets(c);
    el.innerHTML = `${head}
      <div class="cp-body">
        <div class="yields">${['food', 'prod', 'gold', 'sci', 'cul'].map((k) => `<div class="yv"><div class="i">${YI[k]}</div><div class="v">${k === 'food' ? (y.surplus >= 0 ? '+' : '') + fmt(y.surplus) : fmt(y[k])}</div><div class="k">${C.YIELD_NAME[k]}</div></div>`).join('')}</div>
        <div class="cp-line"><span>${YI.food} 食物 ${fmt(c.food)}/${need}</span><b>${growTxt}</b></div>
        <div class="cp-line"><span>${YI.cul} 下次边界扩张</span><b>${borderTxt}</b></div>
        ${cur}
        <div class="cp-actions">
          <label class="form-check" title="由电脑自动为这座城市选择生产"><input type="checkbox" id="cp-auto" ${c.auto ? 'checked' : ''}> 自动生产</label>
          ${targets.length || mode === 'cityFire' ? `<button class="btn btn-sm ${mode === 'cityFire' ? 'btn-primary' : ''}" id="cp-fire">${mode === 'cityFire' ? '选择目标…' : `城市远程攻击（${targets.length}）`}</button>` : ''}
        </div>
        ${list}
        <div class="sec-title">已建成</div>
        <div class="chips">${[...wds, ...blds].join('') || '<span class="muted">暂无建筑</span>'}</div>
      </div>`;
    $('#cp-close').onclick = () => UI.deselect();
    $('#cp-auto').onchange = (e) => {
      c.auto = e.target.checked;
      if (c.auto && !c.build) c.build = AI.chooseBuild(c);
      UI.refresh();
    };
    const fire = $('#cp-fire');
    if (fire) fire.onclick = () => {
      mode = mode === 'cityFire' ? null : 'cityFire';
      UI.refresh();
    };
    el.querySelectorAll('.prow').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('.buy')) return;
        G.setBuild(c, row.dataset.k, row.dataset.id);
        UI.refresh();
      };
    });
    el.querySelectorAll('[data-buy]').forEach((b) => {
      b.onclick = () => {
        const [k, id] = b.dataset.buy.split(':');
        if (G.purchase(c, k, id)) {
          UI.toast(`已购买：${G.buildDef(k, id).name}`, 'success');
          R.markMini();
          UI.refresh();
        } else UI.toast('无法购买（金币不足或城市周围没有空位）', 'error');
      };
    });
  }

  // ---------- 地图输入 ----------
  function bindMap() {
    const cv = $('#map');
    const pointers = new Map();
    let down = null;
    let pinch = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      hideTip();
      if (pointers.size === 1) down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, btn: e.button, moved: false };
      else {
        down = null;
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        R.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
        pinch = d;
        return;
      }
      if (down) {
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
        if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        if (down.moved) {
          R.pan(dx, dy);
          down.lx = e.clientX;
          down.ly = e.clientY;
          return;
        }
      }
      onHover(e);
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (down && !down.moved && e.type === 'pointerup') onClick(e, down.btn);
      down = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => {
      hideTip();
      R.hover = -1;
      R.ov.path = null;
      R.dirty = true;
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        hideTip();
        R.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false }
    );
  }
  function bindMinimap() {
    const m = $('#minimap');
    let dragging = false;
    const go = (e) => {
      const r = m.getBoundingClientRect();
      const w = R.miniToWorld(e.clientX - r.left, e.clientY - r.top);
      if (!w) return;
      R.camTo = null;
      R.cam.x = w.x;
      R.cam.y = w.y;
      R.clampCam();
      R.dirty = true;
    };
    m.addEventListener('pointerdown', (e) => {
      dragging = true;
      m.setPointerCapture(e.pointerId);
      go(e);
    });
    m.addEventListener('pointermove', (e) => dragging && go(e));
    m.addEventListener('pointerup', () => (dragging = false));
  }

  function tileAtEvent(e) {
    const r = $('#map').getBoundingClientRect();
    return R.screenToTile(e.clientX - r.left, e.clientY - r.top);
  }
  function bannerAt(e) {
    const r = $('#map').getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    for (let k = R.banners.length - 1; k >= 0; k--) {
      const b = R.banners[k];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return S().cities[b.city];
    }
    return null;
  }

  function onClick(e, btn) {
    const s = S();
    if (!s || busy || modalStack.length) return;
    const h = G.human();
    const i = tileAtEvent(e);
    const banner = btn === 0 ? bannerAt(e) : null;
    if (mode === 'cityFire') {
      if (sel.city && G.cityTargets(sel.city).includes(i)) {
        G.cityFire(sel.city, i);
        mode = null;
        afterAction(false);
      } else {
        mode = null;
        UI.refresh();
      }
      return;
    }
    if (banner && !(sel.unit && R.ov.attack && R.ov.attack.has(i))) {
      if (banner.owner === h.id || h.explored[banner.y0 * s.W + banner.x]) UI.selectCity(banner);
      return;
    }
    if (i < 0) return;
    const u = sel.unit;
    const ownSel = u && s.units[u.id] && u.owner === h.id;
    if (ownSel && btn === 2) return orderMove(u, i);
    if (ownSel && btn === 0 && i !== G.uidx(u)) {
      const ownHere = G.unitsAt(i).some((x) => x.owner === h.id);
      const city = G.cityAtI(i);
      const ownCity = city && city.owner === h.id;
      if (mode === 'move' || (R.ov.attack && R.ov.attack.has(i)) || (R.ov.reach && R.ov.reach.has(i)) || (!ownHere && !ownCity && h.explored[i])) return orderMove(u, i);
    }
    // 选择地块上的内容
    const mine = G.unitsAt(i).filter((x) => x.owner === h.id);
    const city = G.cityAtI(i);
    if (mine.length) {
      let pick;
      if (sel.unit && mine.includes(sel.unit)) {
        const k = mine.indexOf(sel.unit);
        if (k + 1 < mine.length) pick = mine[k + 1];
        else if (city && city.owner === h.id) return UI.selectCity(city);
        else pick = mine[0];
      } else pick = mine.find((x) => G.isMilitary(x) && x.mp > 0) || mine.find((x) => x.mp > 0) || mine[0];
      if (pick === sel.unit) return UI.deselect();
      return UI.selectUnit(pick);
    }
    if (city && (city.owner === h.id || h.explored[i])) return UI.selectCity(city);
    const vis = G.vis(h);
    const other = vis[i] ? G.unitsAt(i)[0] : null;
    if (other) return UI.selectUnit(other);
    UI.deselect();
  }

  function orderMove(u, i) {
    const s = S();
    const h = G.human();
    mode = null;
    // 和平状态下试图攻击
    const city = G.cityAtI(i);
    const foe = (city && city.owner !== h.id && city.owner) || (G.unitsAt(i).find((x) => x.owner !== h.id) || {}).owner;
    if (foe != null && foe !== h.id && !G.atWar(h.id, foe) && !s.civs[foe].isBarb && Hex.distI(G.uidx(u), i) <= (C.UNITS[u.type].range || 1) && G.isMilitary(u)) {
      const o = s.civs[foe];
      if (G.canDeclareWar(h.id, foe)) {
        UI.confirm('宣战', `你与${o.name}处于和平状态。要向${o.name}宣战并发动攻击吗？`, '宣战', true, () => {
          G.declareWar(h.id, foe);
          G.orderMove(u, i);
          afterAction(true);
        });
      } else UI.toast(`与${o.name}处于和平状态，暂时不能宣战`, 'error');
      return;
    }
    const r = G.orderMove(u, i);
    if (!r) {
      const t = s.tiles[i];
      if (C.TERRAIN[t.t].impassable) UI.toast('山脉无法通行', 'error');
      else if (C.TERRAIN[t.t].water && !h.techs.sailing) UI.toast('需要研究「航海术」才能登船出海', 'error');
      else if (C.TERRAIN[t.t].deep && !h.techs.cartography) UI.toast('需要研究「制图学」才能进入深海', 'error');
      else if (t.o >= 0 && t.o !== h.id && !G.atWar(h.id, t.o)) UI.toast(`和平时期不能进入${s.civs[t.o].name}的领土`, 'error');
      else UI.toast('无法到达该地块', 'error');
      return;
    }
    R.ov.path = null;
    afterAction(true);
  }

  // ---------- 悬停 ----------
  function onHover(e) {
    const s = S();
    if (!s || busy) return;
    const i = tileAtEvent(e);
    const cv = $('#map');
    if (i !== lastHover) {
      lastHover = i;
      R.hover = i;
      R.dirty = true;
      updatePath(i);
      hideTip();
      clearTimeout(tipTimer);
      if (i >= 0) {
        const quick = (sel.unit && R.ov.attack && R.ov.attack.has(i)) || mode === 'cityFire';
        tipTimer = setTimeout(() => showTip(i, e.clientX, e.clientY), quick ? 60 : 420);
      }
    } else if ($('#tooltip').classList.contains('hidden') === false) placeTip(e.clientX, e.clientY);
    const att = (sel.unit && R.ov.attack && R.ov.attack.has(i)) || (mode === 'cityFire' && R.ov.attack && R.ov.attack.has(i));
    cv.classList.toggle('cur-attack', !!att);
    cv.classList.toggle('cur-move', !att && mode === 'move');
  }
  function updatePath(i) {
    R.ov.path = null;
    const s = S();
    const u = sel.unit;
    if (!u || !s.units[u.id] || u.owner !== s.humanId || i < 0 || i === G.uidx(u)) return;
    if (!G.human().explored[i]) return;
    if (R.ov.attack && R.ov.attack.has(i)) {
      if (!C.UNITS[u.type].rng) R.ov.path = [{ i, turn: 1, endTurn: true, attack: true }];
      return;
    }
    const p = C.Path.find(u, i, { maxNodes: 4000 });
    if (!p || !p.path.length) return;
    const final = G.occupancy(u, i) === 'final';
    R.ov.path = p.path.map((j, k) => ({
      i: j,
      turn: p.states[k].turn + 1,
      endTurn: k === p.path.length - 1 || p.states[k + 1].turn > p.states[k].turn,
      attack: final && k === p.path.length - 1,
    }));
  }
  function hideTip() {
    $('#tooltip').classList.add('hidden');
  }
  function placeTip(x, y) {
    const t = $('#tooltip');
    const w = t.offsetWidth, hh = t.offsetHeight;
    let px = x + 18, py = y + 18;
    if (px + w > window.innerWidth - 8) px = x - w - 14;
    if (py + hh > window.innerHeight - 8) py = y - hh - 14;
    t.style.left = Math.max(8, px) + 'px';
    t.style.top = Math.max(8, py) + 'px';
  }
  function showTip(i, x, y) {
    const html = tileInfo(i);
    if (!html) return;
    const t = $('#tooltip');
    t.innerHTML = html;
    t.classList.remove('hidden');
    placeTip(x, y);
  }
  function tileInfo(i) {
    const s = S();
    const h = G.human();
    if (!h.explored[i]) return '<div class="tt-title">未探索</div><div class="tt-sub">派出侦察单位揭开迷雾</div>';
    const t = s.tiles[i];
    const T = C.TERRAIN[t.t];
    const names = [T.name];
    if (t.h) names.push('丘陵');
    if (t.f) names.push(C.FEATURES[t.f].name);
    const y = G.tileYield(i, h);
    let out = `<div class="tt-title">${names.join(' · ')}</div>`;
    const yy = ['food', 'prod', 'gold', 'sci', 'cul'].filter((k) => y[k]).map((k) => `${YI[k]}${y[k]}`).join('  ');
    out += `<div class="tt-y">${yy || '无产出'}</div>`;
    const extra = [];
    if (t.r && G.resourceVisible(t, h)) extra.push(`资源：${C.RESOURCES[t.r].icon} ${C.RESOURCES[t.r].name}`);
    if (t.imp) extra.push(`改良：${C.IMPROVEMENTS[t.imp].name}`);
    if (t.hut) extra.push('🛖 部落村庄：派单位进入可获得奖励');
    if (t.camp) extra.push('⛺ 蛮族营地：用军事单位占领可获得 50 金币');
    if (!T.water && !T.impassable) {
      let mv = 1 + (t.h ? 1 : 0) + (t.f && C.FEATURES[t.f].move ? 1 : 0);
      const def = (t.h ? 3 : 0) + (t.f ? C.FEATURES[t.f].def : 0);
      extra.push(`移动消耗 ${mv}${def ? ` · 防御 +${def}` : ''}`);
    }
    if (T.impassable) extra.push('无法通行');
    if (t.o >= 0) {
      const oc = s.cities[t.oc];
      extra.push(`领土：${s.civs[t.o].name}${oc ? ' · ' + oc.name : ''}`);
    }
    if (extra.length) out += `<div class="tt-sub">${extra.join('<br>')}</div>`;
    const vis = G.vis(h);
    const city = G.cityAtI(i);
    if (city) out += `<div class="tt-sec"><b>${city.capital ? '★ ' : ''}${esc(city.name)}</b>（${s.civs[city.owner].name}） 人口 ${city.pop} · 城防 ${G.cityStr(city)} · 生命 ${city.hp}</div>`;
    if (vis[i]) {
      for (const u of G.unitsAt(i)) {
        const civ = s.civs[u.owner];
        out += `<div class="tt-sec">${u.owner === h.id ? '' : civ.name + ' '}${C.UNITS[u.type].name}${G.rank(u) ? ' ' + '★'.repeat(G.rank(u)) : ''} · 生命 ${u.hp}${C.UNITS[u.type].str ? ` · 战斗力 ${G.baseStr(u, false)}` : ''}${u.owner !== h.id && !civ.isBarb ? (G.atWar(h.id, u.owner) ? ' · <span class="tt-bad">战争中</span>' : ' · 和平') : ''}</div>`;
      }
    }
    // 战斗预测
    if (mode === 'cityFire' && sel.city) {
      const p = G.predictCityFire(sel.city, i);
      if (p && G.cityTargets(sel.city).includes(i)) out += `<div class="tt-sec"><b>🏹 城市远程攻击</b><br>城防 ${p.A} 对 ${p.D}<br>预计造成 <span class="tt-bad">${p.dmgDef}</span> 伤害（剩余 ${Math.max(0, p.defHp - p.dmgDef)}）</div>`;
    } else if (sel.unit && sel.unit.owner === h.id) {
      const p = G.predict(sel.unit, i);
      if (p) {
        if (p.mode === 'capture') out += `<div class="tt-sec"><b>俘获平民单位</b></div>`;
        else if (p.capture) out += `<div class="tt-sec"><b>⚔ 攻占城市！</b>城市已无防御力</div>`;
        else {
          const kill = p.dmgDef >= p.defHp;
          out += `<div class="tt-sec"><b>${p.mode === 'ranged' ? '🏹 远程攻击' : '⚔ 近战攻击'}</b>　${p.A} 对 ${p.D}<br>
            预计造成 <span class="tt-bad">${p.dmgDef}</span> 伤害${kill ? '（<b>可消灭</b>）' : `（剩余 ${Math.max(0, p.defHp - p.dmgDef)}）`}<br>
            ${p.mode === 'melee' ? `预计受到 <span class="${p.dmgAtt >= sel.unit.hp ? 'tt-bad' : ''}">${p.dmgAtt}</span> 伤害（剩余 ${Math.max(0, sel.unit.hp - p.dmgAtt)}）` : '<span class="tt-ok">不会受到反击</span>'}</div>`;
        }
      }
    }
    return out;
  }

  // ---------- 键盘 ----------
  function bindKeys() {
    const held = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (!S() || !$('#start-screen').classList.contains('hidden')) return;
      if (modalStack.length) {
        if (e.key === 'Escape' && modalStack[modalStack.length - 1].dismiss) modalStack[modalStack.length - 1].dismiss();
        return;
      }
      if (busy) return;
      const k = e.key;
      const u = sel.unit && S().units[sel.unit.id] && sel.unit.owner === S().humanId ? sel.unit : null;
      const lower = k.length === 1 ? k.toLowerCase() : k;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(lower)) {
        held.add(lower);
        startPanLoop(held);
        e.preventDefault();
        return;
      }
      if (k === 'Enter') return UI.onEndTurn();
      if (k === 'Escape') {
        if (mode) {
          mode = null;
          return UI.refresh();
        }
        return UI.deselect();
      }
      if (k === 'Tab') {
        e.preventDefault();
        return UI.nextUnit();
      }
      if (lower === 't') return UI.openTree('tech');
      if (lower === 'c') return UI.openTree('civic');
      if (lower === 'y') {
        R.showYields = !R.showYields;
        R.dirty = true;
        return refreshTools();
      }
      if (lower === 'g') {
        R.showGrid = !R.showGrid;
        R.dirty = true;
        return refreshTools();
      }
      if (lower === 'h') return UI.centerCapital();
      if (k === '+' || k === '=') return R.zoomAt(innerWidth / 2, innerHeight / 2, 1.15);
      if (k === '-') return R.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.15);
      if (!u) return;
      const map = { b: actFound, i: actImprove, f: u.fort || u.sleep ? actWake : actFortify, e: actExplore, u: actUpgrade, m: actMoveMode, ' ': actSkip, Delete: actDisband };
      if (lower === ' ') e.preventDefault();
      if (lower === 'b' && u.type !== 'settler') return;
      if (lower === 'i' && u.type !== 'builder') return;
      if (lower === 'u' && !G.canUpgrade(u)) return;
      if (lower === 'e' && !(C.UNITS[u.type].cls === 'recon' || G.isMilitary(u))) return;
      if (map[lower]) map[lower](u);
    });
    window.addEventListener('keyup', (e) => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => held.clear());
  }
  let panning = false;
  function startPanLoop(held) {
    if (panning) return;
    panning = true;
    const step = () => {
      if (!held.size) {
        panning = false;
        return;
      }
      let dx = 0, dy = 0;
      const v = 14;
      if (held.has('ArrowLeft') || held.has('a')) dx += v;
      if (held.has('ArrowRight') || held.has('d')) dx -= v;
      if (held.has('ArrowUp') || held.has('w')) dy += v;
      if (held.has('ArrowDown') || held.has('s')) dy -= v;
      R.pan(dx, dy);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- 回合 ----------
  UI.onEndTurn = function () {
    const s = S();
    if (!s || busy || modalStack.length) return;
    if (s.winner != null && !s.continued) return showGameOver();
    const p = G.pending();
    if (p) {
      if (p.kind === 'tech') return UI.openTree('tech');
      if (p.kind === 'civic') return UI.openTree('civic');
      return UI.selectCity(p.city, true);
    }
    busy = true;
    hideTip();
    mode = null;
    R.ov.path = null;
    $('#busy').classList.remove('hidden');
    setTimeout(() => {
      try {
        G.endTurn();
      } catch (err) {
        console.error(err);
        UI.toast('回合处理出错：' + err.message, 'error');
      }
      busy = false;
      $('#busy').classList.add('hidden');
      R.markMini();
      UI.autosave();
      if (sel.city && !S().cities[sel.city.id]) sel.city = null;
      if (sel.unit && !S().units[sel.unit.id]) sel.unit = null;
      UI.refresh();
      showOffers();
      showQueued();
      if (!modalStack.length) {
        if (!UI.nextUnit()) {
          const pp = G.pending();
          if (pp && pp.kind === 'city') UI.selectCity(pp.city, true);
        }
      }
    }, 40);
  };
  function showOffers() {
    const s = S();
    const offers = s.offers.splice(0);
    for (const o of offers) {
      const civ = s.civs[o.from];
      if (!civ.alive || !G.atWar(o.from, s.humanId)) continue;
      UI.queueModal(() =>
        UI.modal({
          title: '和平提议',
          body: `<div class="leader">${civMark(civ)}<div><div class="ln">${civ.leader}</div><div class="ls">${civ.name}</div></div></div><div class="quote">「这场战争已让双方的人民付出了太多代价。我们愿意放下武器，签订和平条约。」</div>`,
          buttons: [{ text: '拒绝' }, { text: '接受和平', primary: true, onClick: () => { G.makePeace(o.from, s.humanId); UI.refresh(); } }],
        })
      );
    }
  }

  // ---------- 科技 / 市政树 ----------
  function unlocksOf(kind, id) {
    const out = [];
    const key = kind === 'tech' ? 'tech' : 'civic';
    for (const d of Object.values(C.UNITS)) if (d[key] === id) out.push(d.name);
    for (const d of Object.values(C.BUILDINGS)) if (d[key] === id) out.push(d.icon + d.name);
    for (const d of Object.values(C.WONDERS)) if (d[key] === id) out.push(d.icon + d.name);
    for (const d of Object.values(C.IMPROVEMENTS)) if (kind === 'tech' && d.tech === id) out.push(d.name);
    if (kind === 'tech' && id === 'satellites') out.push('🚀太空计划');
    return out;
  }
  UI.openTree = function (kind) {
    const s = S();
    if (!s) return;
    const h = G.human();
    const isT = kind === 'tech';
    const list = isT ? C.TECHS : C.CIVICS;
    const table = isT ? C.TECH : C.CIVIC;
    const depth = {};
    const dOf = (id) => (depth[id] != null ? depth[id] : (depth[id] = table[id].req.length ? 1 + Math.max(...table[id].req.map(dOf)) : 0));
    list.forEach((t) => dOf(t.id));
    const cols = {};
    for (const t of list) (cols[depth[t.id]] = cols[depth[t.id]] || []).push(t);
    const NW = 184, NH = 88, GX = 52, GY = 18, TOP = 26;
    const pos = {};
    let maxRows = 0;
    for (const d in cols) {
      cols[d].forEach((t, k) => (pos[t.id] = { x: d * (NW + GX), y: TOP + k * (NH + GY) }));
      maxRows = Math.max(maxRows, cols[d].length);
    }
    const width = Object.keys(cols).length * (NW + GX);
    const height = TOP + maxRows * (NH + GY);
    const draw = () => {
      const done = isT ? h.techs : h.civics;
      const prog = isT ? h.techProg : h.civicProg;
      const cur = isT ? h.curTech : h.curCivic;
      const queue = isT ? h.techQueue : h.civicQueue;
      const avail = (id) => (isT ? G.techAvailable(h, id) : G.civicAvailable(h, id));
      const rec = isT ? AI.bestTech(h, true) : AI.bestCivic(h, true);
      let lines = '';
      for (const t of list) {
        for (const r of t.req) {
          const a = pos[r], b = pos[t.id];
          const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2;
          const on = done[r];
          lines += `<path d="M${x1} ${y1} C${x1 + GX / 2} ${y1}, ${x2 - GX / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="${on ? 'var(--primary)' : 'var(--line-strong)'}" stroke-opacity="${on ? 0.55 : 1}" stroke-width="2"/>`;
        }
      }
      const eraHead = {};
      for (const d in cols) {
        const e = cols[d][0].era;
        if (!Object.values(eraHead).includes(e)) eraHead[d] = e;
      }
      let nodes = '';
      for (const t of list) {
        const p = pos[t.id];
        const isDone = !!done[t.id];
        const st = isDone ? 'done' : cur === t.id ? 'cur' : avail(t.id) ? 'avail' : 'locked';
        const qi = queue.indexOf(t.id);
        const cost = isT ? G.techCost(t.id) : G.civicCost(t.id);
        const pr = isDone ? 1 : (prog[t.id] || 0) / cost;
        const turns = isDone ? '已完成' : `${G.techTurns(h, t.id, !isT)} 回合`;
        const unl = isT ? unlocksOf('tech', t.id).concat(t.note ? [t.note] : []) : [t.effect].concat(unlocksOf('civic', t.id).filter((x) => !t.effect.includes(x.replace(/^\W+/, ''))));
        const bkey = (isT ? 't:' : 'c:') + t.id;
        const boost = t.boost ? `<div class="tn-boost ${h.boosted[bkey] ? 'ok' : ''}">${isT ? '尤里卡' : '鼓舞'}${h.boosted[bkey] ? ' ✓' : ''}：${t.boost.text}</div>` : '<div class="tn-boost"></div>';
        nodes += `<button class="tnode ${st} ${qi >= 0 ? 'queued' : ''}" data-id="${t.id}" style="left:${p.x}px;top:${p.y}px" title="${esc(unl.join('、'))}${t.boost ? '\n' + (isT ? '尤里卡' : '鼓舞') + '：' + esc(t.boost.text) + '（进度 +50%）' : ''}">
          ${qi >= 0 ? `<span class="q">${qi + 2}</span>` : ''}
          <div class="tn-top"><span class="tn-name">${t.name}</span>${rec === t.id && !cur ? '<span class="rec">推荐</span>' : ''}<span class="tn-t">${turns}</span></div>
          <div class="tn-unl">${esc(unl.join(' · ') || '—')}</div>${boost}
          <div class="tn-bar"><i style="width:${Math.round(pr * 100)}%"></i></div>
        </button>`;
      }
      let heads = '';
      for (const d in eraHead) heads += `<div class="era-head" style="left:${d * (NW + GX)}px">${C.ERAS[eraHead[d]]}时代</div>`;
      const y = G.civYields(h);
      m.body.innerHTML = `<div class="tree-top">${isT ? `${YI.sci} 每回合 +${fmt(y.sci)} 科技` : `${YI.cul} 每回合 +${fmt(y.cul)} 文化`} · 点击可用项目开始${isT ? '研究' : '推行'}；点击更远的项目会自动排队前置项目</div>
        <div class="tree-wrap"><div class="tree" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${lines}</svg>${heads}${nodes}</div></div>`;
      m.body.querySelectorAll('.tnode').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.id;
          if (done[id]) return;
          if (isT) G.setResearch(h, id);
          else G.setCivic(h, id);
          const wrap = m.body.querySelector('.tree-wrap');
          const sl = wrap.scrollLeft, stp = wrap.scrollTop;
          draw();
          const w2 = m.body.querySelector('.tree-wrap');
          w2.scrollLeft = sl;
          w2.scrollTop = stp;
          UI.refresh();
        };
      });
    };
    const m = UI.modal({ title: isT ? '科技树' : '市政树', cls: 'tree-modal', body: '' });
    m.body.style.display = 'flex';
    m.body.style.flexDirection = 'column';
    m.body.style.padding = '0';
    m.body.style.flex = '1';
    m.body.style.minHeight = '0';
    draw();
    // 滚动到当前进度附近
    const done = isT ? h.techs : h.civics;
    const firstOpen = list.find((t) => !done[t.id]);
    if (firstOpen) m.body.querySelector('.tree-wrap').scrollLeft = Math.max(0, pos[firstOpen.id].x - 80);
  };

  // ---------- 外交 ----------
  UI.openDiplomacy = function () {
    const s = S();
    if (!s) return;
    const h = G.human();
    const m = UI.modal({ title: '外交', cls: 'modal-md', body: '' });
    const draw = () => {
      const myPow = G.militaryPower(h);
      let html = '<p>与已相遇的文明宣战或求和。和平时期双方单位不能进入对方领土。</p>';
      for (const c of G.majors()) {
        if (c.isHuman) continue;
        if (!h.met[c.id]) {
          html += `<div class="drow"><span class="civ-mark" style="background:var(--fill);color:var(--text-3)">?</span><div><div class="dn">未相遇的文明</div><div class="ds">继续探索世界来与他们相遇</div></div><div></div></div>`;
          continue;
        }
        const war = G.atWar(h.id, c.id);
        const pow = G.militaryPower(c);
        const rel = !c.alive ? '<span class="dot mute"></span>已灭亡' : war ? '<span class="dot bad"></span>战争中' : '<span class="dot ok"></span>和平';
        const cmp = pow > myPow * 1.3 ? '军力强于你' : pow < myPow * 0.77 ? '军力弱于你' : '军力与你相当';
        const cities = G.citiesOf(c.id).length;
        html += `<div class="drow">${civMark(c)}<div><div class="dn">${c.name} · ${c.leader}</div><div class="ds">${rel} · ${cmp} · ${cities} 座城市 · 分数 ${G.score(c)}<br>${C.CIV[c.def].ability}：${C.CIV[c.def].desc}</div></div>
          <div class="da">${c.alive ? (war ? `<button class="btn btn-sm btn-primary" data-peace="${c.id}">求和</button>` : `<button class="btn btn-sm btn-danger" data-war="${c.id}" ${G.canDeclareWar(h.id, c.id) ? '' : 'disabled title="刚签订和平条约，需等待 10 回合"'}>宣战</button>`) : ''}</div></div>`;
      }
      m.body.innerHTML = html;
      m.body.querySelectorAll('[data-war]').forEach((b) => {
        b.onclick = () => {
          const id = +b.dataset.war;
          UI.confirm('宣战', `确定要向${s.civs[id].name}宣战吗？对方会立即成为你的敌人。`, '宣战', true, () => {
            G.declareWar(h.id, id);
            draw();
            UI.refresh();
          });
        };
      });
      m.body.querySelectorAll('[data-peace]').forEach((b) => {
        b.onclick = () => {
          const id = +b.dataset.peace;
          const r = G.proposePeace(h.id, id);
          if (r === 'yes') UI.toast(`${s.civs[id].name}接受了和平提议`, 'success');
          else if (r === 'asked') UI.toast('本回合已经提议过了', 'error');
          else UI.toast(`${s.civs[id].name}拒绝了和平提议——也许过几回合再试`, 'error');
          draw();
          UI.refresh();
        };
      });
    };
    draw();
  };

  // ---------- 各类事件弹窗 ----------
  const GREET = ['欢迎，远方的朋友。愿我们的人民和睦相处。', '又一个文明出现在这片土地上……我们会密切关注你们。', '世界很大，足够容纳我们所有人——至少现在是这样。', '我们早就听说过你们的故事。很高兴终于见面了。'];
  function showMeet(civ) {
    const d = C.CIV[civ.def];
    UI.modal({
      title: '初次相遇',
      body: `<div class="leader">${civMark(civ)}<div><div class="ln">${civ.leader}</div><div class="ls">${civ.name} · ${d.ability}</div></div></div><div class="quote">「${GREET[civ.id % GREET.length]}」</div><p style="margin-top:12px">${d.ability}：${d.desc}</p>`,
      buttons: [{ text: '你好', primary: true }],
    });
  }
  function showWarOn(civ) {
    UI.modal({
      title: '宣战！',
      body: `<div class="leader">${civMark(civ)}<div><div class="ln">${civ.leader}</div><div class="ls">${civ.name}</div></div></div><div class="quote">「你们的软弱已经暴露无遗。准备迎接我们的军队吧！」</div><p style="margin-top:12px">加强城市防御：建造城墙、训练远程单位，城市本身也能进行远程攻击。</p>`,
      buttons: [{ text: '迎战', primary: true }],
    });
  }
  function showWonder(id, city) {
    const w = C.WONDERS[id];
    UI.modal({
      title: '奇观建成',
      body: `<div class="modal-icon ok" style="font-size:26px">${w.icon}</div><p><b>${w.name}</b> 在 ${esc(city.name)} 落成！</p><p>${w.desc}</p>`,
      buttons: [{ text: '太棒了', primary: true }],
    });
  }
  const VT = { science: '科技胜利', culture: '文化胜利', domination: '征服胜利', score: '分数胜利', defeat: '文明灭亡' };
  function showGameOver() {
    const s = S();
    const h = G.human();
    const win = s.winner === h.id;
    const w = s.civs[s.winner];
    const rows = G.majors()
      .slice()
      .sort((a, b) => G.score(b) - G.score(a))
      .map((c) => `<tr><td>${civMark(c)} ${c.isHuman || h.met[c.id] ? c.name : '未知文明'}${c.alive ? '' : '（已灭亡）'}</td><td>${G.citiesOf(c.id).length}</td><td>${Object.keys(c.techs).length}</td><td>${Object.keys(c.civics).length}</td><td>${G.wondersOf(c).length}</td><td><b>${G.score(c)}</b></td></tr>`)
      .join('');
    const why = {
      science: '完成了全部太空计划，人类迈向星辰大海。',
      culture: '完成「全球化」并拥有至少 3 座奇观，文化影响力遍及世界。',
      domination: '占领了所有对手的原首都。',
      score: `到达回合上限（${s.maxTurns}），分数最高。`,
      defeat: '你失去了所有城市。',
    }[s.victoryType];
    UI.modal({
      title: win ? '🎉 胜利！' : '游戏结束',
      cls: 'modal-md',
      body: `<div class="modal-icon ${win ? 'ok' : 'bad'}">${win ? '🏆' : '⚑'}</div>
        <p><b>${w ? (w.isHuman ? '你' : w.name) : '无人'}</b> 获得了 <b>${VT[s.victoryType] === '文明灭亡' ? '最后的胜利' : VT[s.victoryType]}</b>。${why || ''}</p>
        <table class="score-table"><tr><th>文明</th><th>城市</th><th>科技</th><th>市政</th><th>奇观</th><th>分数</th></tr>${rows}</table>`,
      buttons: [
        { text: '返回主菜单', onClick: () => UI.showStart() },
        ...(h.alive ? [{ text: '继续游玩', primary: true, onClick: () => { s.continued = true; UI.refresh(); } }] : []),
      ],
    });
  }

  // ---------- 菜单 / 帮助 ----------
  UI.openMenu = function () {
    const dark = document.documentElement.dataset.theme === 'dark';
    const m = UI.modal({
      title: '菜单',
      body: `<div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn" data-m="save">保存游戏</button>
        <button class="btn" data-m="load" ${hasSave(KEY_SAVE) ? '' : 'disabled'}>读取存档</button>
        <button class="btn" data-m="auto" ${hasSave(KEY_AUTO) ? '' : 'disabled'}>读取自动存档（每回合）</button>
        <button class="btn" data-m="theme">${dark ? '切换到浅色界面' : '切换到深色界面'}</button>
        <button class="btn" data-m="help">游戏说明</button>
        <button class="btn btn-danger" data-m="menu">返回主菜单</button></div>`,
    });
    m.body.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.m;
        m.close();
        if (k === 'save') {
          if (UI.save(KEY_SAVE)) UI.toast('游戏已保存', 'success');
        } else if (k === 'load') UI.loadFrom(KEY_SAVE);
        else if (k === 'auto') UI.loadFrom(KEY_AUTO);
        else if (k === 'theme') {
          const nd = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
          document.documentElement.dataset.theme = nd;
          try {
            localStorage.setItem(KEY_THEME, nd);
          } catch (e) {}
        } else if (k === 'help') UI.openHelp();
        else if (k === 'menu') UI.confirm('返回主菜单', '当前进度已自动保存在“自动存档”中。确定返回主菜单吗？', '返回', false, () => { UI.autosave(); UI.showStart(); });
      };
    });
  };
  UI.openHelp = function () {
    UI.modal({
      title: '游戏说明',
      cls: 'modal-md',
      body: `<p>《文明之路》借鉴《文明6》的核心玩法，并做了简化：没有区域、宗教、宜居度和住房，城市自动安排市民工作，每项市政直接给出永久加成。</p>
      <h3>怎样获胜</h3>
      <ul><li><b>科技胜利</b>：研究「卫星」，建造航天中心，完成 3 项太空计划。</li>
      <li><b>文化胜利</b>：完成市政「全球化」，并拥有至少 3 座奇观。</li>
      <li><b>征服胜利</b>：占领所有对手的原首都。</li>
      <li><b>分数胜利</b>：到达回合上限时分数最高。</li></ul>
      <h3>基本操作</h3>
      <ul><li><b>左键</b>选择单位或城市；选中单位后，左键点击蓝色地块或远处地块即可移动，<b>右键</b>也可以移动/攻击。</li>
      <li>拖动地图平移，滚轮缩放；<kbd>WASD</kbd>/方向键平移，<kbd>H</kbd> 回到首都。</li>
      <li><kbd>Enter</kbd> 结束回合，<kbd>Tab</kbd> 切换到下一个待命单位，<kbd>Esc</kbd> 取消选择。</li>
      <li><kbd>T</kbd> 科技树，<kbd>C</kbd> 市政树，<kbd>Y</kbd> 显示地块产出，<kbd>G</kbd> 网格。</li>
      <li>单位快捷键：<kbd>B</kbd> 建城，<kbd>I</kbd> 建造改良，<kbd>F</kbd> 驻扎/睡眠，<kbd>E</kbd> 自动探索，<kbd>U</kbd> 升级，<kbd>空格</kbd> 跳过。</li></ul>
      <h3>城市</h3>
      <ul><li>每座城市的人口会自动在最好的地块上工作。食物让人口增长，生产力用于建造，金币可以直接购买单位和建筑。</li>
      <li>城市之间至少相隔 3 格。城市的文化会让边界逐渐扩张。</li>
      <li>不知道该造什么？带有<span class="rec">推荐</span>标记的就是电脑建议；也可以勾选「自动生产」。</li></ul>
      <h3>科技与市政</h3>
      <ul><li>科技解锁单位、建筑与奇观；市政提供永久加成。满足「尤里卡 / 鼓舞」条件可以让研究进度 +50%。</li>
      <li>在树中点击较远的项目，会自动排队研究所需的前置项目。</li></ul>
      <h3>战斗</h3>
      <ul><li>把军事单位移动到敌人身上发动近战；远程单位攻击射程内的目标且不受反击。悬停在目标上可以看到伤害预测。</li>
      <li>丘陵、森林提供防御加成；驻扎再 +4。受伤单位不行动时会自动恢复生命。</li>
      <li>城市可以每回合进行一次远程攻击。把城市生命值打到 0 后，用近战单位进入即可占领。</li>
      <li>部落村庄 🛖 有奖励；蛮族营地 ⛺ 会不断派出蛮族，占领它可得 50 金币。</li></ul>`,
      buttons: [{ text: '明白了', primary: true }],
    });
  };
  function showTutorial() {
    let skip = false;
    try {
      skip = localStorage.getItem(KEY_TUTOR) === '1';
    } catch (e) {}
    if (skip) return;
    UI.modal({
      title: '欢迎来到文明之路',
      body: `<div class="modal-icon">🏛️</div><p>你将带领一个文明从石器时代走向太空时代。开局的几步：</p>
        <ul><li>选中<b>开拓者</b>（拓），点击「建立城市」或按 <kbd>B</kbd> 建立首都。</li>
        <li>在右侧城市面板中选择要生产的项目（有<span class="rec">推荐</span>标记可参考）。</li>
        <li>点击顶栏选择<b>科技</b>与<b>市政</b>。</li>
        <li>派出<b>侦察兵</b>（侦）探索世界，寻找部落村庄 🛖。</li>
        <li>按 <kbd>Enter</kbd> 结束回合。</li></ul>
        <label class="form-check" style="margin-top:8px"><input type="checkbox" id="tut-skip"> 以后不再显示</label>`,
      buttons: [{ text: '开始', primary: true, onClick: () => { try { if ($('#tut-skip').checked) localStorage.setItem(KEY_TUTOR, '1'); } catch (e) {} } }],
    });
  }

  // ---------- 存档 ----------
  function hasSave(key) {
    try {
      return !!localStorage.getItem(key);
    } catch (e) {
      return false;
    }
  }
  UI.save = function (key) {
    try {
      localStorage.setItem(key, G.serialize());
      return true;
    } catch (e) {
      UI.toast('保存失败：浏览器存储不可用或已满', 'error');
      return false;
    }
  };
  UI.autosave = function () {
    const s = S();
    if (!s) return;
    try {
      localStorage.setItem(KEY_AUTO, G.serialize());
    } catch (e) {}
  };
  UI.loadFrom = function (key) {
    let str = null;
    try {
      str = localStorage.getItem(key);
    } catch (e) {}
    if (!str) return UI.toast('没有找到存档', 'error');
    try {
      G.load(str);
    } catch (e) {
      console.error(e);
      return UI.toast('存档损坏，无法读取', 'error');
    }
    enterGame();
    UI.toast(`已读取存档：第 ${S().turn} 回合`, 'success');
  };

  function enterGame() {
    $('#start-screen').classList.add('hidden');
    modalStack.slice().forEach((m) => m.close());
    modalQueue = [];
    gameOverShown = S().winner != null;
    sel.unit = null;
    sel.city = null;
    mode = null;
    R.selUnit = null;
    R.reset();
    R.cam.z = 1;
    const h = G.human();
    const cap = G.citiesOf(h.id).find((c) => c.capital);
    const u = G.unitsOf(h.id).find((x) => x.type === 'settler') || G.unitsOf(h.id)[0];
    if (cap) R.centerOn(cap.y0 * S().W + cap.x, true);
    else if (u) R.centerOn(G.uidx(u), true);
    refreshTools();
    UI.refresh();
    if (u && u.type === 'settler' && !cap) UI.selectUnit(u);
  }

  // ---------- 开始界面 ----------
  UI.showStart = function () {
    let opts = { civ: 'china', size: 'standard', opponents: 3, difficulty: 'easy', speed: 'standard' };
    try {
      Object.assign(opts, JSON.parse(localStorage.getItem(KEY_OPTS) || '{}'));
    } catch (e) {}
    modalStack.slice().forEach((m) => m.close());
    modalQueue = [];
    const el = $('#start-screen');
    el.classList.remove('hidden');
    const draw = () => {
      const sz = C.MAP_SIZES[opts.size];
      opts.opponents = Math.max(1, Math.min(sz.maxAi, opts.opponents));
      const seg = (key, items) => `<div class="seg">${items.map(([v, l]) => `<button class="${String(opts[key]) === String(v) ? 'active' : ''}" data-o="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
      const nums = [];
      for (let n = 1; n <= sz.maxAi; n++) nums.push([n, String(n)]);
      el.querySelector('.ss-card').innerHTML = `
        <div class="ss-eyebrow">TURN-BASED STRATEGY</div>
        <div class="ss-title">文明<span>之路</span></div>
        <p class="ss-desc">借鉴《文明6》的回合制策略游戏，规则更轻松：建立城市、研究科技、建造奇观，用科技、文化或征服赢得胜利。</p>
        <div class="ss-label">选择你的文明</div>
        <div class="civ-grid">${C.CIVS.map((c) => `<button class="civ-card ${opts.civ === c.id ? 'active' : ''}" data-civ="${c.id}"><span class="civ-mark" style="background:${c.color};color:${c.text}">${c.name[0]}</span><span><div class="cn">${c.name}</div><div class="cl">${c.leader} · ${c.ability}</div><div class="ca">${c.desc}</div></span></button>`).join('')}</div>
        <div class="ss-opts">
          <div><div class="ss-label">地图大小</div>${seg('size', Object.entries(C.MAP_SIZES).map(([k, v]) => [k, v.name]))}</div>
          <div><div class="ss-label">电脑对手数量</div>${seg('opponents', nums)}</div>
          <div><div class="ss-label">难度</div>${seg('difficulty', Object.entries(C.DIFFICULTY).map(([k, v]) => [k, v.name]))}</div>
          <div><div class="ss-label">游戏速度</div>${seg('speed', Object.entries(C.SPEEDS).map(([k, v]) => [k, `${v.name}（${v.turns} 回合）`]))}</div>
        </div>
        <div class="ss-foot">
          <button class="btn btn-primary" id="ss-start">开始游戏</button>
          ${hasSave(KEY_AUTO) ? '<button class="btn" id="ss-cont">继续上次游戏</button>' : ''}
          ${hasSave(KEY_SAVE) ? '<button class="btn" id="ss-load">读取存档</button>' : ''}
          <span class="spacer"></span>
          <button class="btn btn-ghost" id="ss-help">游戏说明</button>
        </div>`;
      el.querySelectorAll('[data-civ]').forEach((b) => (b.onclick = () => { opts.civ = b.dataset.civ; draw(); }));
      el.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => {
        const k = b.dataset.o;
        opts[k] = k === 'opponents' ? +b.dataset.v : b.dataset.v;
        if (k === 'size') opts.opponents = C.MAP_SIZES[opts.size].ai;
        draw();
      }));
      el.querySelector('#ss-start').onclick = () => {
        try {
          localStorage.setItem(KEY_OPTS, JSON.stringify(opts));
        } catch (e) {}
        G.newGame(opts);
        enterGame();
        UI.autosave();
        showTutorial();
      };
      const cont = el.querySelector('#ss-cont');
      if (cont) cont.onclick = () => UI.loadFrom(KEY_AUTO);
      const ld = el.querySelector('#ss-load');
      if (ld) ld.onclick = () => UI.loadFrom(KEY_SAVE);
      el.querySelector('#ss-help').onclick = () => UI.openHelp();
    };
    if (!el.querySelector('.ss-card')) {
      el.innerHTML = '<canvas id="start-bg"></canvas><div class="ss-inner"><div class="ss-card"></div></div>';
      let t = null;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => !el.classList.contains('hidden') && drawStartBg(), 200);
      });
    }
    draw();
    drawStartBg();
  };
  function drawStartBg() {
    const cv = $('#start-bg');
    if (!cv) return;
    const s = S();
    const w = innerWidth, hgt = innerHeight, dpr = devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = hgt * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const MW = 40, MH = 26;
    const map = C.MapGen.generate(MW, MH, Math.floor(Math.random() * 1e9), 4);
    if (s) Hex.setSize(s.W, s.H);
    const size = Math.max(w / (MW * 1.732), hgt / (MH * 1.5)) * 1.05;
    const dark = document.documentElement.dataset.theme === 'dark';
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const t = map.tiles[y * MW + x];
        const T = C.TERRAIN[t.t];
        const n = parseInt(T.color.slice(1), 16);
        const lum = (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
        let v = T.water ? (dark ? 18 : 236) : Math.round(dark ? 30 + lum * 40 : 205 + lum * 40);
        if (t.f === 'forest' || t.f === 'jungle') v -= dark ? -6 : 14;
        if (t.t === 'mountain') v -= dark ? -14 : 30;
        const cx = size * 1.732 * (x + 0.5 * (y & 1)), cy = size * 1.5 * y;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (60 * k - 30);
          ctx[k ? 'lineTo' : 'moveTo'](cx + size * Math.cos(a), cy + size * Math.sin(a));
        }
        ctx.closePath();
        ctx.fillStyle = `rgb(${v},${v},${v + (T.water ? 3 : 0)})`;
        ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
        ctx.stroke();
      }
    }
  }
})();
