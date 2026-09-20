import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openBrowser } from './match-ui-browser.cjs';

const output = path.resolve('.ui-review/builds');
await fs.mkdir(output, { recursive: true });
const fixture = path.resolve('scripts/fixtures/builds.fixture.tsx').replaceAll('\\', '/');
const failures = [];
const assetCache = new Map();
const server = await createServer({
  configFile: path.resolve('vite.renderer.config.mts'),
  cacheDir: path.resolve('.ui-review/node_modules/.vite-builds'),
  optimizeDeps: { entries: [fixture] },
  server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'build-ui-fixture', configureServer(vite) {
    vite.middlewares.use('/__build-art__', async (request, response) => {
      const file = (request.url || '').split('?')[0].replace(/^\//, '');
      if (!/^(champion|spell|item)\/[A-Za-z0-9_]+\.png$/.test(file)) { response.statusCode = 404; response.end(); return; }
      try {
        if (!assetCache.has(file)) assetCache.set(file, (async () => {
          const remote = await fetch(`https://ddragon.leagueoflegends.com/cdn/16.17.1/img/${file}`, { signal: AbortSignal.timeout(8000) });
          if (!remote.ok) throw new Error(`Artwork ${file}: HTTP ${remote.status}`);
          return Buffer.from(await remote.arrayBuffer());
        })());
        response.setHeader('Content-Type', 'image/png'); response.end(await assetCache.get(file));
      } catch (error) { failures.push(String(error)); response.statusCode = 502; response.end(); }
    });
    vite.middlewares.use('/__build-ui__', async (_request, response) => {
      const html = await vite.transformIndexHtml('/__build-ui__', `<html lang="zh-CN"><head><meta charset="UTF-8"><title>Build UI fixture</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixture}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
let browser;
const results = [];
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const evalPage = fn => browser.webContents.executeJavaScript(`(${fn.toString()})()`);
async function check(label, fn) {
  const value = await evalPage(fn); results.push({ label, passed: Boolean(value), value });
  if (!value) throw new Error(label);
}
async function ready() {
  for (let i = 0; i < 100; i++) { if (await evalPage(() => Boolean(document.querySelector('.lol-postgame-tab')))) break; await pause(100); }
  if (!await evalPage(() => Boolean(document.querySelector('.lol-postgame-tab')))) throw new Error('Fixture did not mount: ' + JSON.stringify(browser.consoleErrors) + ' BODY: ' + await evalPage(() => document.body.innerText.slice(0, 3000)));
  await evalPage(() => [...document.querySelectorAll('.lol-postgame-tab')].find(node => node.textContent === '构建').click());
  for (let i = 0; i < 80; i++) { if (await evalPage(() => Boolean(document.querySelector('.lol-build-matrix')))) break; await pause(100); }
  await pause(200);
}
async function screenshot(name) {
  const image = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  await fs.writeFile(path.join(output, name + '.jpg'), Buffer.from(image.data, 'base64'));
}
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__build-ui__`;
  browser = await openBrowser(url, output);
  await ready();
  await evalPage(() => Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 9000))]));
  await check('hero banner, repeat portrait and oversized KPI block are removed', () => !document.querySelector('.lol-build-profile__hero, .lol-build-profile__splash, .lol-build-profile__summary, .lol-build-context img') && document.querySelectorAll('.lol-build-roster button').length === 10);
  await check('inline player context stays a single compact line on desktop', () => document.querySelector('.lol-build-context').getBoundingClientRect().height <= 42 && getComputedStyle(document.querySelector('.lol-build-context')).backgroundColor === 'rgba(0, 0, 0, 0)' && document.querySelector('.lol-build-context__stats').getBoundingClientRect().left - document.querySelector('.lol-build-context__meta').getBoundingClientRect().right <= 20);
  await check('loadout and skill matrix share one row with aligned headings', () => { const a = document.querySelector('.lol-build-final').getBoundingClientRect(), b = document.querySelector('.lol-build-skills').getBoundingClientRect(); return Math.abs(a.top - b.top) < 1 && a.right < b.left; });
  await check('six item slots form two rows of three with a separate trinket', () => { const slots = [...document.querySelectorAll('.lol-build-final__items > span')].map(node => node.getBoundingClientRect()); return slots.length === 7 && slots[0].top === slots[2].top && slots[3].top === slots[5].top && slots[3].top > slots[0].top && slots[6].left > slots[2].right; });
  await check('each skill has one actual icon and a readable QWER label', () => document.querySelectorAll('.lol-build-matrix__skill img').length === 4 && [...document.querySelectorAll('.lol-build-matrix__skill b')].map(node => node.textContent).join('') === 'QWER' && parseFloat(getComputedStyle(document.querySelector('.lol-build-matrix__skill b')).fontSize) >= 16);
  await check('all actual upgrades and shopping records are retained', () => document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 16 && document.querySelectorAll('.lol-build-matrix__cell.is-pending').length === 8 && document.querySelectorAll('.lol-build-trip').length === 13 && document.querySelectorAll('.lol-build-trip > div > span').length === 21);
  await check('matrix aligns each point to its real skill and shows that skill rank', () => { const cells = [...document.querySelectorAll('.lol-build-matrix__cell.is-active')].sort((a,b) => Number(a.dataset.sequence) - Number(b.dataset.sequence)); return cells.map(node => node.dataset.skill).join('') === 'WQEEE REWEWRWWQQR'.replaceAll(' ', '') && document.querySelector('.lol-build-matrix__cell.is-active[data-sequence="5"]').textContent === '3'; });
  await check('time, sequence and rank labels are at least 12px', () => ['.lol-build-trip time', '.lol-build-matrix__table thead th', '.lol-build-matrix__cell.is-active b'].every(selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize) >= 12));
  await check('redundant headings and counters remain removed', () => !/技能成长|升级路径|当前查询|件记录|次购物|QWER 加点|对局结束时持有/.test(document.querySelector('.lol-builds').textContent));
  for (const width of [1180, 920, 900, 880, 879, 800, 650, 560, 540, 440, 360]) {
    await browser.setContentSize(width, 754); await pause(180);
    await check(`no horizontal scrolling or clipped content at ${width}px`, () => [...document.querySelectorAll('.lol-builds, .lol-build-roster, .lol-build-profile, .lol-build-blueprint, .lol-build-matrix, .lol-build-matrix__table, .lol-build-shopping__track')].every(node => node.scrollWidth <= node.clientWidth + 1));
    await check(`artwork and upgrade nodes keep readable dimensions at ${width}px`, () => [...document.querySelectorAll('.lol-build-matrix__skill img')].every(node => node.getBoundingClientRect().width >= 34) && [...document.querySelectorAll('.lol-build-final__items > span')].every(node => node.getBoundingClientRect().width >= 44) && [...document.querySelectorAll('.lol-build-trip > div > span')].every(node => node.getBoundingClientRect().width >= 40) && [...document.querySelectorAll('.lol-build-matrix__cell.is-active > span')].every(node => node.getBoundingClientRect().width >= 22));
    await check(`all 18 sequence columns and all 16 upgrades survive wrapping at ${width}px`, () => document.querySelectorAll('.lol-build-matrix__table thead th:not(:first-child)').length === 18 && document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 16);
    const geometry = await evalPage(() => ({ matrixTables: document.querySelectorAll('.lol-build-matrix__table').length, finalTop: document.querySelector('.lol-build-final').getBoundingClientRect().top, skillsTop: document.querySelector('.lol-build-skills').getBoundingClientRect().top, contextHeight: document.querySelector('.lol-build-context').getBoundingClientRect().height, purchaseRows: new Set([...document.querySelectorAll('.lol-build-trip')].map(node => Math.round(node.getBoundingClientRect().top))).size, profileHeight: document.querySelector('.lol-build-profile').clientHeight, contentHeight: document.querySelector('.lol-build-profile').scrollHeight }));
    results.push({ label: `layout ${width}px`, passed: true, value: geometry });
    if ([1180, 920, 650, 440].includes(width)) await screenshot(`build-matrix-${width}`);
  }
  await browser.setContentSize(920, 754);
  await evalPage(() => document.querySelectorAll('.lol-build-roster button')[1].click()); await pause(250);
  await check('player switching updates context, points and unoccupied equipment slot', () => document.querySelector('.lol-build-context__name').textContent.includes('九尾') && document.querySelector('.lol-build-matrix__cell.is-active[data-sequence="1"]').dataset.skill === 'Q' && document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 12 && document.querySelectorAll('.lol-build-final__items .is-empty').length === 1);
  await check('active point is keyboard focusable with its real name, rank and time', () => { const point = document.querySelector('.lol-build-matrix__cell.is-active > span'); point.focus(); return document.activeElement === point && point.title.includes('第 1 次加点') && point.title.includes('00:00'); });
  await evalPage(() => document.querySelectorAll('.lol-build-roster button')[2].click()); await pause(100);
  await check('evolution records stay outside the normal point matrix', () => document.querySelectorAll('.lol-build-evolves > span').length === 1 && document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 16);
  await browser.send('Page.navigate', { url: url + '?noart&long&stress&extra&unknown' }); await ready();
  await browser.setContentSize(440, 754); await pause(200);
  await check('long names and 28 purchases in a single visit still fit', () => document.querySelector('.lol-build-profile').scrollWidth <= document.querySelector('.lol-build-profile').clientWidth + 1 && document.querySelectorAll('.lol-build-trip:first-child > div > span').length === 28);
  await check('unknown slots and upgrades beyond 18 remain explicit without invented icons', () => document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 24 && document.querySelector('.lol-build-matrix__cell.is-active[data-sequence="3"]').dataset.skill === '?' && document.querySelector('.lol-build-matrix__cell.is-active[data-sequence="24"]').dataset.skill === 'R' && document.querySelectorAll('.lol-build-matrix__skill img').length === 0);
  await screenshot('build-matrix-stress-440');
  await browser.send('Page.navigate', { url: url + '?missing' }); await ready();
  await check('missing data remains explicit instead of fake points or gear', () => document.querySelectorAll('.lol-build-trip').length === 0 && document.querySelectorAll('.lol-build-matrix__cell.is-active').length === 0 && document.querySelectorAll('.lol-build-empty').length === 3);
  const fatal = browser.consoleErrors.filter(message => /Uncaught|ReferenceError|TypeError|Each child/.test(message));
  if (fatal.length) throw new Error(fatal.join('\n'));
  const report = { passed: true, fixture: 'synthetic match; actual React/CSS and Riot artwork', results, assetFailures: [...new Set(failures)] };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  if (browser) await screenshot('failure').catch(() => {});
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: false, results, error: String(error), assetFailures: [...new Set(failures)] }, null, 2));
  console.error(error); console.error(JSON.stringify(browser?.consoleErrors || [])); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await server.close();
}
