import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent((req.url || '/').split('?')[0]);
  if (u === '/') u = '/index.html';
  const fp = path.join(root, u.replace(/^\//, ''));
  if (!fp.startsWith(root) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': mime[path.extname(fp)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const BASE = `http://127.0.0.1:${PORT}/index.html`;

const results = [];
const ok = (n, c, info = '') => { results.push([n, !!c, info]); };

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`${BASE}?t=day`);
await page.waitForFunction(() => window.__office && window.__office.selectBot);
await page.waitForTimeout(1500);

ok('API present', await page.evaluate(() => !!(window.__office.selectBot && window.__office.getSelected && window.__office.onSelection)));

const compact = await page.evaluate(() => {
  const lbs = [...document.querySelectorAll('.lb')];
  return {
    n: lbs.length,
    allCompact: lbs.every(el => el.classList.contains('lb-compact') && !el.classList.contains('lb-open')),
    hasIc: lbs.some(el => el.querySelector('.ic')),
    hasShort: lbs.some(el => el.querySelector('.nm.short')),
    noneSelected: window.__office.getSelected() === null,
  };
});
ok('default all compact', compact.n > 5 && compact.allCompact && compact.hasIc && compact.hasShort && compact.noneSelected, JSON.stringify(compact));

await page.evaluate(() => {
  const b = window.__office.findBot('程式員');
  window.__office.applyBotState(b, 'working', '寫 bot-label 測試', { anim: false });
  window.__office.selectBot(b);
});
await page.waitForTimeout(400);

const open1 = await page.evaluate(() => {
  const b = window.__office.findBot('程式員');
  const el = b.label;
  return {
    selected: window.__office.getSelected()?.name,
    flag: b._selected === true,
    open: el.classList.contains('lb-open'),
    compact: el.classList.contains('lb-compact'),
    full: !!el.querySelector('.nm.full'),
    stZh: el.querySelector('.st-zh')?.textContent,
    step: el.querySelector('.st')?.textContent,
    onlyOne: window.__office.bots.filter(x => x._selected).length,
  };
});
ok('selectBot opens one', open1.selected === '程式員' && open1.flag && open1.open && !open1.compact && open1.full && open1.onlyOne === 1, JSON.stringify(open1));
ok('open shows status+step', open1.stZh === '執行中' && (open1.step || '').includes('bot-label'), JSON.stringify(open1));

await page.evaluate(() => window.__office.selectBot(window.__office.findBot('Lily')));
await page.waitForTimeout(200);
const sw = await page.evaluate(() => ({
  sel: window.__office.getSelected()?.name,
  prog: window.__office.findBot('程式員')._selected,
  lily: window.__office.findBot('Lily')._selected,
  lilyOpen: window.__office.findBot('Lily').label.classList.contains('lb-open'),
  progCompact: window.__office.findBot('程式員').label.classList.contains('lb-compact'),
}));
ok('switch selection', sw.sel === 'Lily' && sw.lily && !sw.prog && sw.lilyOpen && sw.progCompact, JSON.stringify(sw));

await page.evaluate(() => window.__office.selectBot(null));
await page.waitForTimeout(200);
const cleared = await page.evaluate(() => ({
  sel: window.__office.getSelected(),
  any: window.__office.bots.some(b => b._selected),
  allCompact: [...document.querySelectorAll('.lb')].every(el => el.classList.contains('lb-compact')),
}));
ok('selectBot(null) clears', cleared.sel === null && !cleared.any && cleared.allCompact, JSON.stringify(cleared));

// canvas miss → clear (select someone first, click empty sky)
await page.evaluate(() => window.__office.selectBot('Coding 主管'));
await page.waitForTimeout(200);
await page.mouse.click(20, 80); // top-left of canvas approx
await page.waitForTimeout(300);
const miss = await page.evaluate(() => window.__office.getSelected()?.name || null);
ok('canvas miss clears', miss === null, 'sel=' + miss);

// label click
await page.evaluate(() => {
  const b = window.__office.findBot('UI 設計員');
  b.label.click();
});
await page.waitForTimeout(200);
const viaLabel = await page.evaluate(() => window.__office.getSelected()?.name);
ok('label click selects', viaLabel === 'UI 設計員', viaLabel);

fs.mkdirSync(path.join(root, 'shots/label'), { recursive: true });
await page.evaluate(() => {
  window.__office.applyBotState('程式員', 'working', '實作頭頂標籤 expand', { anim: false });
  window.__office.selectBot('程式員');
});
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(root, 'shots/label/desktop-open.png') });
await page.evaluate(() => window.__office.selectBot(null));
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(root, 'shots/label/desktop-compact.png') });

// portrait
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__office.selectBot('Visual 程式員'));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(root, 'shots/label/portrait-open.png') });

ok('no page errors', errs.length === 0, errs.join('|'));

await browser.close();
srv.close();

let fail = 0;
for (const [n, pass, info] of results) {
  console.log((pass ? 'PASS ' : 'FAIL ') + n + (pass ? '' : '  ' + info));
  if (!pass) fail++;
}
console.log(`${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
