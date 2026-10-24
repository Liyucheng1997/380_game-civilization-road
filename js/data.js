// 游戏数据：地形、资源、单位、建筑、奇观、科技、市政、文明
(function () {
  const C = (globalThis.Civ = globalThis.Civ || {});

  C.ERAS = ['远古', '古典', '中世纪', '文艺复兴', '工业', '现代', '信息'];

  C.YIELD_ICON = { food: '🌾', prod: '⚒️', gold: '🪙', sci: '🔬', cul: '🎭' };
  C.YIELD_NAME = { food: '食物', prod: '生产力', gold: '金币', sci: '科技', cul: '文化' };

  // ---------- 地形 ----------
  C.TERRAIN = {
    grass: { name: '草原', food: 2, prod: 0, gold: 0, color: '#86b04a' },
    plains: { name: '平原', food: 1, prod: 1, gold: 0, color: '#c3b45a' },
    desert: { name: '沙漠', food: 0, prod: 0, gold: 0, color: '#e3cf98' },
    tundra: { name: '冻土', food: 1, prod: 0, gold: 0, color: '#98a08c' },
    snow: { name: '雪地', food: 0, prod: 0, gold: 0, color: '#e8eef2' },
    coast: { name: '海岸', food: 1, prod: 0, gold: 1, water: true, color: '#5ba7d1' },
    ocean: { name: '海洋', food: 1, prod: 0, gold: 0, water: true, deep: true, color: '#2f6ea6' },
    mountain: { name: '山脉', food: 0, prod: 0, gold: 0, impassable: true, color: '#8e8c88' },
  };

  C.FEATURES = {
    forest: { name: '森林', food: 0, prod: 1, gold: 0, move: 1, def: 3 },
    jungle: { name: '雨林', food: 1, prod: 0, gold: 0, move: 1, def: 3 },
    oasis: { name: '绿洲', food: 3, prod: 0, gold: 1, move: 0, def: 0 },
  };
  C.HILLS = { name: '丘陵', prod: 1, move: 1, def: 3 };

  // ---------- 资源 ----------
  // on: 可出现的地形；hills: 需要/允许丘陵；feat: 需要的地貌
  C.RESOURCES = {
    wheat: { name: '小麦', icon: '🌽', yields: { food: 1 }, on: ['grass', 'plains'], flat: true, imp: 'farm' },
    rice: { name: '稻米', icon: '🍚', yields: { food: 1 }, on: ['grass'], flat: true, imp: 'farm' },
    cattle: { name: '牛', icon: '🐄', yields: { food: 1 }, on: ['grass'], flat: true, imp: 'pasture' },
    sheep: { name: '羊', icon: '🐑', yields: { food: 1 }, on: ['grass', 'plains', 'tundra', 'desert'], hills: true, imp: 'pasture' },
    deer: { name: '鹿', icon: '🦌', yields: { prod: 1 }, on: ['tundra', 'grass', 'plains'], feat: 'forest', imp: 'hunt' },
    stone: { name: '石料', icon: '🪨', yields: { prod: 1 }, on: ['grass', 'plains', 'desert'], imp: 'quarry' },
    fish: { name: '鱼', icon: '🐟', yields: { food: 1 }, on: ['coast'], imp: 'fishing' },
    horses: { name: '马', icon: '🐎', yields: { food: 1, prod: 1 }, on: ['grass', 'plains'], flat: true, imp: 'pasture', tech: 'animal' },
    iron: { name: '铁', icon: '⛓️', yields: { prod: 1, sci: 1 }, on: ['grass', 'plains', 'desert', 'tundra'], hills: true, imp: 'mine', tech: 'bronze' },
    wine: { name: '葡萄', icon: '🍇', yields: { food: 1, gold: 1 }, on: ['plains', 'grass'], flat: true, imp: 'plantation' },
    spices: { name: '香料', icon: '🌶️', yields: { food: 1, gold: 1 }, on: ['grass', 'plains'], feat: 'jungle', imp: 'plantation' },
    silk: { name: '丝绸', icon: '🧵', yields: { cul: 1, gold: 1 }, on: ['grass', 'plains'], feat: 'forest', imp: 'plantation' },
    gems: { name: '宝石', icon: '💎', yields: { gold: 3 }, on: ['grass', 'plains', 'desert', 'tundra'], hills: true, imp: 'mine' },
    pearls: { name: '珍珠', icon: '🦪', yields: { gold: 1, sci: 1 }, on: ['coast'], imp: 'fishing' },
  };

  // ---------- 地块改良 ----------
  C.IMPROVEMENTS = {
    farm: { name: '农场', yields: { food: 1 }, tech: null },
    mine: { name: '矿山', yields: { prod: 1 }, tech: 'mining' },
    lumber: { name: '伐木场', yields: { prod: 1 }, tech: 'machinery' },
    pasture: { name: '牧场', yields: { prod: 1 }, tech: 'animal' },
    hunt: { name: '营地', yields: { gold: 1 }, tech: 'animal' },
    quarry: { name: '采石场', yields: { prod: 1 }, tech: 'mining' },
    plantation: { name: '种植园', yields: { gold: 1 }, tech: 'pottery' },
    fishing: { name: '渔船', yields: { food: 1 }, tech: 'sailing' },
  };

  // ---------- 单位 ----------
  // cls: civilian / recon / melee / anticav / ranged / siege / cavalry
  C.UNITS = {
    settler: { name: '开拓者', ch: '拓', cost: 70, move: 2, cls: 'civilian', desc: '可以建立新城市。生产时城市人口 -1。' },
    builder: { name: '建造者', ch: '工', cost: 45, move: 2, cls: 'civilian', desc: '在己方领土上建造农场、矿山等改良设施。' },
    scout: { name: '侦察兵', ch: '侦', cost: 30, move: 3, str: 10, cls: 'recon', sight: 3, desc: '移动快、视野广，适合探索地图。' },
    warrior: { name: '勇士', ch: '勇', cost: 40, move: 2, str: 20, cls: 'melee', upgrade: 'swordsman' },
    slinger: { name: '投石兵', ch: '石', cost: 35, move: 2, str: 5, rng: 15, range: 1, cls: 'ranged', upgrade: 'archer' },
    archer: { name: '弓箭手', ch: '弓', cost: 60, move: 2, str: 15, rng: 25, range: 2, cls: 'ranged', tech: 'archery', upgrade: 'crossbow' },
    spearman: { name: '枪兵', ch: '枪', cost: 65, move: 2, str: 25, cls: 'anticav', tech: 'bronze', upgrade: 'musketman', desc: '对骑兵 +10 战斗力。' },
    horseman: { name: '骑手', ch: '马', cost: 80, move: 4, str: 36, cls: 'cavalry', tech: 'horseback', upgrade: 'knight' },
    swordsman: { name: '剑士', ch: '剑', cost: 90, move: 2, str: 35, cls: 'melee', tech: 'iron', upgrade: 'musketman' },
    catapult: { name: '投石机', ch: '投', cost: 120, move: 2, str: 23, rng: 35, range: 2, cls: 'siege', tech: 'math', upgrade: 'bombard', desc: '攻城单位：攻击城市时伤害更高。' },
    crossbow: { name: '弩手', ch: '弩', cost: 170, move: 2, str: 30, rng: 40, range: 2, cls: 'ranged', tech: 'machinery', upgrade: 'field_cannon' },
    knight: { name: '骑士', ch: '甲', cost: 180, move: 4, str: 48, cls: 'cavalry', tech: 'stirrups', upgrade: 'cavalry' },
    musketman: { name: '火枪手', ch: '铳', cost: 240, move: 2, str: 55, cls: 'melee', tech: 'gunpowder', upgrade: 'infantry' },
    bombard: { name: '射石炮', ch: '炮', cost: 280, move: 2, str: 43, rng: 55, range: 2, cls: 'siege', tech: 'metallurgy', upgrade: 'artillery', desc: '攻城单位：攻击城市时伤害更高。' },
    cavalry: { name: '骑兵', ch: '骑', cost: 330, move: 5, str: 62, cls: 'cavalry', tech: 'military_science', upgrade: 'tank' },
    field_cannon: { name: '野战炮', ch: '野', cost: 330, move: 2, str: 50, rng: 60, range: 2, cls: 'ranged', tech: 'military_science' },
    infantry: { name: '步兵', ch: '步', cost: 430, move: 2, str: 70, cls: 'melee', tech: 'rifling' },
    artillery: { name: '火炮', ch: '榴', cost: 450, move: 2, str: 60, rng: 75, range: 3, cls: 'siege', tech: 'rifling', desc: '攻城单位：攻击城市时伤害更高。' },
    tank: { name: '坦克', ch: '坦', cost: 480, move: 4, str: 80, cls: 'cavalry', tech: 'combustion' },
  };
  C.CLS_NAME = { civilian: '平民', recon: '侦察', melee: '近战', anticav: '反骑兵', ranged: '远程', siege: '攻城', cavalry: '骑兵' };

  // ---------- 建筑 ----------
  C.BUILDINGS = {
    monument: { name: '纪念碑', icon: '🗿', cost: 55, yields: { cul: 2 } },
    granary: { name: '粮仓', icon: '🏺', cost: 65, yields: { food: 2 }, tech: 'pottery' },
    walls: { name: '城墙', icon: '🧱', cost: 80, tech: 'masonry', desc: '城市生命值 +100，城防 +8。' },
    barracks: { name: '兵营', icon: '⛺', cost: 90, tech: 'bronze', desc: '此城训练的军事单位获得 1 级晋升。' },
    library: { name: '图书馆', icon: '📚', cost: 90, yields: { sci: 2 }, tech: 'writing' },
    market: { name: '市场', icon: '🏪', cost: 100, yields: { gold: 3 }, tech: 'currency' },
    amphitheater: { name: '剧院', icon: '🎪', cost: 140, yields: { cul: 3 }, civic: 'drama' },
    workshop: { name: '工坊', icon: '🔨', cost: 160, yields: { prod: 3 }, tech: 'apprenticeship' },
    university: { name: '大学', icon: '🎓', cost: 220, yields: { sci: 4 }, tech: 'education', req: 'library' },
    bank: { name: '银行', icon: '🏦', cost: 260, yields: { gold: 5 }, tech: 'banking', req: 'market' },
    museum: { name: '博物馆', icon: '🖼️', cost: 280, yields: { cul: 4 }, civic: 'humanism', req: 'amphitheater' },
    factory: { name: '工厂', icon: '🏭', cost: 380, yields: { prod: 5 }, tech: 'industrialization', req: 'workshop' },
    lab: { name: '研究实验室', icon: '🧪', cost: 480, yields: { sci: 6 }, tech: 'scientific_theory', req: 'university' },
    power_plant: { name: '发电厂', icon: '⚡', cost: 500, yields: { prod: 6 }, tech: 'electricity', req: 'factory' },
    broadcast: { name: '广播中心', icon: '📻', cost: 520, yields: { cul: 6 }, civic: 'mass_media', req: 'museum' },
    spaceport: { name: '航天中心', icon: '🚀', cost: 450, tech: 'rocketry', desc: '可在此城市进行太空计划项目（需研究「卫星」）。' },
  };
  C.PALACE = { food: 0, prod: 2, gold: 3, sci: 3, cul: 2 };

  // ---------- 奇观 ----------
  C.WONDERS = {
    pyramids: { name: '金字塔', icon: '🔺', cost: 220, tech: 'masonry', yields: { prod: 2 }, mods: { builderCharges: 1 }, desc: '建造者 +1 使用次数；本城 +2 生产力。' },
    hanging_gardens: { name: '空中花园', icon: '🌿', cost: 220, tech: 'pottery', mods: { foodPerCity: 1 }, desc: '所有城市 +1 食物。' },
    stonehenge: { name: '巨石阵', icon: '🪨', cost: 200, civic: 'mysticism', yields: { cul: 4 }, desc: '本城 +4 文化。' },
    great_library: { name: '大图书馆', icon: '📜', cost: 300, tech: 'writing', yields: { sci: 4, cul: 2 }, desc: '本城 +4 科技、+2 文化。' },
    great_wall: { name: '长城', icon: '🏯', cost: 380, tech: 'construction', mods: { cityStr: 6 }, yields: { gold: 2, cul: 1 }, desc: '所有城市城防 +6。' },
    terracotta: { name: '兵马俑', icon: '🗿', cost: 400, civic: 'military_training', yields: { cul: 2 }, desc: '建成时所有陆军单位晋升 1 级；本城 +2 文化。' },
    forbidden_city: { name: '紫禁城', icon: '🏮', cost: 500, civic: 'feudalism', mods: { culturePerCity: 1 }, yields: { cul: 3 }, desc: '所有城市 +1 文化；本城 +3 文化。' },
    oxford: { name: '牛津大学', icon: '🏛️', cost: 620, tech: 'education', yields: { sci: 8 }, desc: '本城 +8 科技。' },
    big_ben: { name: '大本钟', icon: '🕰️', cost: 700, tech: 'banking', yields: { gold: 6 }, mods: { goldPct: 0.1 }, desc: '金币 +10%；本城 +6 金币。' },
    eiffel: { name: '埃菲尔铁塔', icon: '🗼', cost: 1000, tech: 'industrialization', mods: { culturePerCity: 2 }, desc: '所有城市 +2 文化。' },
    sydney_opera: { name: '悉尼歌剧院', icon: '🎼', cost: 1200, civic: 'mass_media', yields: { cul: 10 }, desc: '本城 +10 文化。' },
  };

  // ---------- 项目（太空竞赛） ----------
  C.PROJECTS = {
    satellite: { name: '发射地球卫星', icon: '🛰️', cost: 500, tech: 'satellites', reqBuilding: 'spaceport', desc: '太空计划之一。三项全部完成即获得科技胜利。' },
    moon: { name: '登月计划', icon: '🌙', cost: 600, tech: 'satellites', reqBuilding: 'spaceport', desc: '太空计划之一。三项全部完成即获得科技胜利。' },
    mars: { name: '火星殖民', icon: '🪐', cost: 700, tech: 'satellites', reqBuilding: 'spaceport', desc: '太空计划之一。三项全部完成即获得科技胜利。' },
  };

  // ---------- 科技树 ----------
  // boost: 尤里卡（完成条件后研究进度 +50%）
  C.TECHS = [
    { id: 'pottery', name: '制陶术', era: 0, cost: 25, req: [] },
    { id: 'animal', name: '畜牧业', era: 0, cost: 25, req: [] },
    { id: 'mining', name: '采矿', era: 0, cost: 25, req: [] },
    { id: 'sailing', name: '航海术', era: 0, cost: 45, req: ['pottery'], note: '陆地单位可登船进入海岸', boost: { stat: 'coastalCities', n: 1, text: '在海边建立一座城市' } },
    { id: 'writing', name: '书写', era: 0, cost: 45, req: ['pottery'], boost: { stat: 'metCivs', n: 1, text: '遇见另一个文明' } },
    { id: 'archery', name: '射箭', era: 0, cost: 40, req: ['animal'], boost: { stat: 'kills', n: 1, text: '消灭一个敌方单位' } },
    { id: 'masonry', name: '石工', era: 0, cost: 40, req: ['mining'], boost: { stat: 'quarries', n: 1, text: '建造一座采石场' } },
    { id: 'bronze', name: '青铜器', era: 0, cost: 45, req: ['mining'], note: '显示铁资源', boost: { stat: 'mines', n: 1, text: '建造一座矿山' } },
    { id: 'horseback', name: '骑马', era: 1, cost: 90, req: ['archery'], boost: { stat: 'pastures', n: 1, text: '建造一座牧场' } },
    { id: 'currency', name: '货币', era: 1, cost: 95, req: ['writing'], boost: { stat: 'cities', n: 3, text: '拥有 3 座城市' } },
    { id: 'iron', name: '铁器', era: 1, cost: 105, req: ['bronze'], boost: { stat: 'barracks', n: 1, text: '建造一座兵营' } },
    { id: 'math', name: '数学', era: 1, cost: 115, req: ['currency'], boost: { stat: 'wonders', n: 1, text: '建成一座奇观' } },
    { id: 'construction', name: '建造', era: 1, cost: 120, req: ['masonry', 'horseback'], boost: { stat: 'walls', n: 1, text: '建造一座城墙' } },
    { id: 'apprenticeship', name: '学徒制', era: 2, cost: 210, req: ['iron', 'currency'], boost: { stat: 'mines', n: 3, text: '建造 3 座矿山' } },
    { id: 'machinery', name: '机械', era: 2, cost: 230, req: ['iron', 'math'], note: '解锁伐木场', boost: { stat: 'kills', n: 4, text: '累计消灭 4 个敌方单位' } },
    { id: 'education', name: '教育', era: 2, cost: 240, req: ['math'], boost: { stat: 'libraries', n: 2, text: '建造 2 座图书馆' } },
    { id: 'stirrups', name: '马镫', era: 2, cost: 230, req: ['horseback', 'iron'], boost: { stat: 'campsCleared', n: 1, text: '清除一个蛮族营地' } },
    { id: 'cartography', name: '制图学', era: 2, cost: 200, req: ['sailing', 'math'], note: '陆地单位可登船进入海洋', boost: { stat: 'coastalCities', n: 2, text: '拥有 2 座海边城市' } },
    { id: 'gunpowder', name: '火药', era: 3, cost: 380, req: ['machinery', 'apprenticeship'] },
    { id: 'banking', name: '银行业', era: 3, cost: 390, req: ['education', 'apprenticeship'], boost: { stat: 'markets', n: 2, text: '建造 2 座市场' } },
    { id: 'metallurgy', name: '冶金', era: 3, cost: 430, req: ['gunpowder'] },
    { id: 'industrialization', name: '工业化', era: 4, cost: 620, req: ['banking'], mods: { mineProd: 1 }, note: '矿山、伐木场 +1 生产力', boost: { stat: 'workshops', n: 2, text: '建造 2 座工坊' } },
    { id: 'scientific_theory', name: '科学理论', era: 4, cost: 640, req: ['banking', 'education'], boost: { stat: 'universities', n: 2, text: '建造 2 座大学' } },
    { id: 'military_science', name: '军事科学', era: 4, cost: 660, req: ['metallurgy', 'stirrups'], boost: { stat: 'kills', n: 10, text: '累计消灭 10 个敌方单位' } },
    { id: 'electricity', name: '电力', era: 5, cost: 850, req: ['industrialization', 'scientific_theory'] },
    { id: 'rifling', name: '膛线', era: 5, cost: 850, req: ['military_science', 'industrialization'] },
    { id: 'combustion', name: '内燃机', era: 5, cost: 950, req: ['electricity', 'rifling'] },
    { id: 'computers', name: '计算机', era: 6, cost: 1150, req: ['electricity'], mods: { sciPct: 0.1 }, note: '科技 +10%' },
    { id: 'rocketry', name: '火箭学', era: 6, cost: 1250, req: ['combustion', 'computers'] },
    { id: 'satellites', name: '卫星', era: 6, cost: 1400, req: ['rocketry'], note: '揭示整张地图；解锁太空计划' },
  ];

  // ---------- 市政树（每项市政直接提供永久加成） ----------
  C.CIVICS = [
    { id: 'code_of_laws', name: '法典', era: 0, cost: 20, req: [], mods: { capitalGold: 2, capitalProd: 1 }, effect: '首都 +2 金币、+1 生产力' },
    { id: 'craftsmanship', name: '技艺', era: 0, cost: 40, req: ['code_of_laws'], mods: { builderCost: -0.3 }, effect: '建造者生产成本 -30%', boost: { stat: 'improvements', n: 3, text: '建造 3 个地块改良' } },
    { id: 'foreign_trade', name: '对外贸易', era: 0, cost: 40, req: ['code_of_laws'], mods: { goldPerCity: 1 }, effect: '每座城市 +1 金币', boost: { stat: 'metCivs', n: 1, text: '遇见另一个文明' } },
    { id: 'early_empire', name: '早期帝国', era: 0, cost: 65, req: ['foreign_trade'], mods: { settlerCost: -0.25, borderGrowth: 0.3 }, effect: '开拓者成本 -25%；边界扩张加快 30%', boost: { stat: 'cities', n: 3, text: '拥有 3 座城市' } },
    { id: 'mysticism', name: '神秘主义', era: 0, cost: 60, req: ['craftsmanship'], mods: { culturePerCity: 1 }, effect: '每座城市 +1 文化' },
    { id: 'military_tradition', name: '军事传统', era: 0, cost: 60, req: ['craftsmanship'], mods: { heal: 10 }, effect: '单位每回合额外恢复 10 生命值', boost: { stat: 'campsCleared', n: 1, text: '清除一个蛮族营地' } },
    { id: 'political_philosophy', name: '政治哲学', era: 1, cost: 110, req: ['early_empire', 'mysticism'], mods: { sciPerCity: 1, culturePerCity: 1 }, effect: '每座城市 +1 科技、+1 文化' },
    { id: 'drama', name: '戏剧与诗歌', era: 1, cost: 110, req: ['mysticism'], effect: '解锁剧院', boost: { stat: 'wonders', n: 1, text: '建成一座奇观' } },
    { id: 'military_training', name: '军事训练', era: 1, cost: 120, req: ['military_tradition'], mods: { unitStr: 2 }, effect: '所有军事单位 +2 战斗力', boost: { stat: 'kills', n: 3, text: '累计消灭 3 个敌方单位' } },
    { id: 'feudalism', name: '封建主义', era: 2, cost: 330, req: ['political_philosophy', 'military_training'], mods: { builderCharges: 1, farmFood: 1 }, effect: '建造者 +1 使用次数；农场 +1 食物', boost: { stat: 'farms', n: 6, text: '建造 6 座农场' } },
    { id: 'guilds', name: '行会', era: 2, cost: 360, req: ['political_philosophy', 'drama'], mods: { prodPct: 0.1 }, effect: '生产力 +10%' },
    { id: 'humanism', name: '人文主义', era: 3, cost: 650, req: ['guilds'], effect: '解锁博物馆', boost: { stat: 'amphitheaters', n: 2, text: '建造 2 座剧院' } },
    { id: 'mercantilism', name: '重商主义', era: 3, cost: 650, req: ['guilds'], mods: { goldPct: 0.2 }, effect: '金币 +20%' },
    { id: 'enlightenment', name: '启蒙运动', era: 3, cost: 720, req: ['humanism'], mods: { sciPct: 0.1 }, effect: '科技 +10%' },
    { id: 'nationalism', name: '民族主义', era: 4, cost: 1050, req: ['mercantilism', 'feudalism'], mods: { unitStr: 3 }, effect: '所有军事单位 +3 战斗力' },
    { id: 'opera', name: '歌剧与芭蕾', era: 4, cost: 1050, req: ['enlightenment'], mods: { culturePct: 0.15 }, effect: '文化 +15%', boost: { stat: 'museums', n: 1, text: '建造一座博物馆' } },
    { id: 'ideology', name: '意识形态', era: 5, cost: 1800, req: ['nationalism', 'opera'], mods: { prodPct: 0.1, sciPct: 0.1 }, effect: '生产力 +10%、科技 +10%' },
    { id: 'mass_media', name: '大众传媒', era: 5, cost: 1850, req: ['opera'], effect: '解锁广播中心' },
    { id: 'globalization', name: '全球化', era: 6, cost: 3000, req: ['ideology', 'mass_media'], mods: { culturePct: 0.1 }, effect: '文化 +10%；文化胜利的必要条件' },
  ];

  C.TECH = {};
  C.TECHS.forEach((t) => (C.TECH[t.id] = t));
  C.CIVIC = {};
  C.CIVICS.forEach((t) => (C.CIVIC[t.id] = t));

  // ---------- 文明 ----------
  C.CIVS = [
    {
      id: 'china', name: '中国', leader: '秦始皇', color: '#d32f2f', text: '#ffffff', ability: '天命',
      desc: '建造者 +1 使用次数；奇观生产力 +15%', mods: { builderCharges: 1, wonderPct: 0.15 },
      cities: ['西安', '北京', '洛阳', '南京', '杭州', '开封', '成都', '广州', '长沙', '武汉', '苏州', '扬州', '大同', '泉州', '昆明', '济南'],
    },
    {
      id: 'rome', name: '罗马', leader: '图拉真', color: '#7b1fa2', text: '#ffffff', ability: '条条大路通罗马',
      desc: '每座城市 +1 生产力、+1 金币', mods: { prodPerCity: 1, goldPerCity: 1 },
      cities: ['罗马', '安提乌姆', '库迈', '那不勒斯', '拉文纳', '阿雷佐', '米兰', '维罗纳', '热那亚', '比萨', '佛罗伦萨', '帕多瓦', '都灵', '卡普阿'],
    },
    {
      id: 'greece', name: '希腊', leader: '伯里克利', color: '#1e88e5', text: '#ffffff', ability: '柏拉图的理想国',
      desc: '文化 +20%', mods: { culturePct: 0.2 },
      cities: ['雅典', '斯巴达', '科林斯', '阿尔戈斯', '底比斯', '德尔斐', '奥林匹亚', '马拉松', '迈锡尼', '罗德岛', '帕加马', '伊利昂'],
    },
    {
      id: 'egypt', name: '埃及', leader: '克利奥帕特拉', color: '#f9a825', text: '#3e2723', ability: '尼罗河的馈赠',
      desc: '奇观生产力 +25%；每座城市 +1 食物', mods: { wonderPct: 0.25, foodPerCity: 1 },
      cities: ['孟菲斯', '底比斯', '亚历山大', '赫利奥波利斯', '阿斯旺', '吉萨', '阿拜多斯', '卡纳克', '塞易斯', '阿玛尔纳', '布巴斯提斯', '塔尼斯'],
    },
    {
      id: 'mongolia', name: '蒙古', leader: '成吉思汗', color: '#00897b', text: '#ffffff', ability: '草原铁骑',
      desc: '骑兵单位 +1 移动力、+4 战斗力', mods: { cavMove: 1, cavStr: 4 },
      cities: ['哈拉和林', '上都', '撒马尔罕', '布哈拉', '讹答剌', '别失八里', '阿力麻里', '和宁', '应昌', '克鲁伦', '科布多', '乌里雅苏台'],
    },
    {
      id: 'japan', name: '日本', leader: '北条时宗', color: '#ec407a', text: '#ffffff', ability: '武士道',
      desc: '近战单位 +4 战斗力；生产力 +5%', mods: { meleeStr: 4, prodPct: 0.05 },
      cities: ['京都', '大阪', '奈良', '镰仓', '江户', '名古屋', '广岛', '仙台', '福冈', '神户', '长崎', '札幌'],
    },
    {
      id: 'korea', name: '韩国', leader: '善德女王', color: '#6d4c41', text: '#ffffff', ability: '三国鼎立',
      desc: '科技 +15%', mods: { sciPct: 0.15 },
      cities: ['汉城', '庆州', '平壤', '开城', '釜山', '光州', '大邱', '全州', '公州', '扶余', '仁川', '江陵'],
    },
    {
      id: 'america', name: '美国', leader: '罗斯福', color: '#fb8c00', text: '#ffffff', ability: '开国元勋',
      desc: '金币 +20%；城市城防 +4', mods: { goldPct: 0.2, cityStr: 4 },
      cities: ['华盛顿', '纽约', '波士顿', '费城', '芝加哥', '亚特兰大', '旧金山', '洛杉矶', '西雅图', '休斯顿', '底特律', '丹佛'],
    },
  ];
  C.CIV = {};
  C.CIVS.forEach((c) => (C.CIV[c.id] = c));
  C.BARB = { id: 'barbarian', name: '蛮族', leader: '蛮族首领', color: '#3a3a3a', text: '#ff6b5e', mods: {}, cities: [] };

  C.DIFFICULTY = {
    easy: { name: '简单', aiMult: 0.8, barbFreq: 15, aggro: 0.5, warTurn: 70, warRatio: 2.0 },
    normal: { name: '普通', aiMult: 1.0, barbFreq: 11, aggro: 1.0, warTurn: 45, warRatio: 1.5 },
    hard: { name: '困难', aiMult: 1.25, barbFreq: 8, aggro: 1.6, warTurn: 25, warRatio: 1.25 },
  };

  C.SPEEDS = {
    quick: { name: '快速', mult: 0.6, turns: 160 },
    standard: { name: '标准', mult: 1, turns: 250 },
  };

  C.MAP_SIZES = {
    small: { name: '小', w: 36, h: 24, ai: 2, maxAi: 3 },
    standard: { name: '标准', w: 46, h: 30, ai: 3, maxAi: 5 },
    large: { name: '大', w: 58, h: 36, ai: 5, maxAi: 7 },
  };
})();
