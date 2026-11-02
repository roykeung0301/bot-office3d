import assert from 'node:assert/strict';
import { shortName, createBotLabelSelection } from '../bot-label.mjs';

const results = [];
const ok = (n, c, info = '') => { results.push([n, !!c, info]); if (!c) console.error('FAIL', n, info); };

ok('shortName short unchanged', shortName('Lily') === 'Lily');
ok('shortName truncates CJK', shortName('Visual 程式員', 6) === 'Visual…' || shortName('Visual 程式員', 6).endsWith('…'));
ok('shortName max 6', [...shortName('Coding 主管', 6)].length <= 6);
ok('shortName empty', shortName('') === '' && shortName(null) === '');

const bots = [
  { name: 'A', _selected: false },
  { name: 'B', _selected: false },
  { name: 'C', _selected: false },
];
const changes = [];
const sel = createBotLabelSelection({
  bots: () => bots,
  findBot: n => bots.find(b => b.name === n) || null,
  onChange: (n, p) => changes.push([(n && n.name) || null, (p && p.name) || null]),
});

ok('start null', sel.getSelected() === null && sel.selectedName === null);

sel.selectBot('A');
ok('select by name', sel.getSelected() === bots[0] && bots[0]._selected === true && bots[1]._selected === false);
ok('selectedName', sel.getSelectedName() === 'A' && sel.selectedName === 'A');
ok('onChange fired', changes.length === 1 && changes[0][0] === 'A' && changes[0][1] === null);

sel.selectBot(bots[1]);
ok('switch to B', sel.getSelected() === bots[1] && bots[0]._selected === false && bots[1]._selected === true);
ok('only one selected', bots.filter(b => b._selected).length === 1);
ok('onChange switch', changes.at(-1)[0] === 'B' && changes.at(-1)[1] === 'A');

const before = changes.length;
sel.selectBot(bots[1]);
ok('re-select same is no-op emit', changes.length === before && sel.getSelected() === bots[1]);

sel.selectBot(null);
ok('clear with null', sel.getSelected() === null && bots.every(b => !b._selected));
ok('onChange clear', changes.at(-1)[0] === null && changes.at(-1)[1] === 'B');

sel.selectBot('A');
sel.selectBot(false);
ok('clear with falsey', sel.getSelected() === null);

sel.selectBot('nope');
ok('unknown name → null', sel.getSelected() === null);

const unsub = sel.onSelection(() => {});
ok('onSelection returns unsub', typeof unsub === 'function');
unsub();

let fail = 0;
for (const [n, pass, info] of results) {
  console.log((pass ? 'PASS ' : 'FAIL ') + n + (pass && !info ? '' : '  ' + info));
  if (!pass) fail++;
}
console.log(`${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
