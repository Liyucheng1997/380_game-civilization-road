// 无界面对局模拟（平衡性 / 稳定性测试）：所有文明都由电脑控制
// 用法：node tools/simulate.js [种子] [small|standard|large] [easy|normal|hard] [回合数] [quick|standard]
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
for (const f of ['data.js', 'util.js', 'mapgen.js', 'game.js', 'path.js', 'ai.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, 'js', f), 'utf8'), { filename: f });
}
const C = globalThis.Civ;
const G = C.G;
const [seed = '12345', size = 'standard', difficulty = 'normal', turnsArg, speed = 'standard'] = process.argv.slice(2);
const turns = Number(turnsArg || C.SPEEDS[speed].turns);

const war = { combat: 0, captured: 0, wars: 0 };
G.on((type, d) => {
  if (type === 'combat') war.combat++;
  if (type === 'cityCaptured') war.captured++;
  if (type === 'war') war.wars++;
  if (type === 'gameOver') console.log(`游戏结束：${d.civ ? d.civ.name : '无'} ${d.type}，第 ${G.state().turn} 回合`);
});

G.newGame({ civ: 'china', size, difficulty, seed: Number(seed), speed, maxTurns: turns });
console.log('地图', G.state().layout, '文明', G.state().civs.map((c) => c.name).join('、'));
const t0 = Date.now();
let slowest = 0;
for (let t = 1; t <= turns && G.state().winner == null; t++) {
  const a = Date.now();
  const h = G.human();
  if (h.alive) C.AI.takeTurn(h);
  G.endTurn();
  slowest = Math.max(slowest, Date.now() - a);
  if (t % 25 === 0) {
    const s = G.state();
    console.log(`-- 第 ${s.turn} 回合（${G.year()}）`);
    for (const c of G.majors()) {
      const y = G.civYields(c);
      console.log(`   ${c.name}${c.alive ? '' : '（亡）'} 城${G.citiesOf(c.id).length} 科技${Object.keys(c.techs).length} 市政${Object.keys(c.civics).length} 科+${y.sci} 文+${y.cul} 奇观${G.wondersOf(c).length} 分${G.score(c)}`);
    }
  }
}
console.log(`用时 ${Date.now() - t0}ms，最慢一回合 ${slowest}ms，战斗 ${war.combat} 次，宣战 ${war.wars} 次，攻占城市 ${war.captured} 座`);
const str = G.serialize();
G.load(str);
console.log(`存档 ${(str.length / 1024).toFixed(1)}KB，读档正常（第 ${G.state().turn} 回合）`);
