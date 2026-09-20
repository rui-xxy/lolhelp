import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { openBrowser } from './match-ui-browser.cjs';

const output = path.resolve('.ui-review/timeline');
await fs.mkdir(output, { recursive: true });
const fixture = path.resolve('scripts/fixtures/timeline.fixture.tsx').replaceAll('\\', '/');
const failures = [];
const cache = new Map();
const server = await createServer({
  configFile: path.resolve('vite.renderer.config.mts'), cacheDir: path.resolve('.ui-review/node_modules/.vite-timeline'),
  optimizeDeps: { entries: [fixture] }, server: { host: '127.0.0.1', port: 0, strictPort: false },
  plugins: [{ name: 'timeline-regression-page', configureServer(vite) {
    vite.middlewares.use('/__timeline-art__', async (request, response) => {
      const file = (request.url || '').split('?')[0].replace(/^\//, '');
      if (!/^champion\/[A-Za-z]+\.png$/.test(file)) { response.statusCode = 404; response.end(); return; }
      try {
        if (!cache.has(file)) cache.set(file, (async () => {
          const local = path.join(output, 'art', file);
          try { return await fs.readFile(local); } catch {}
          const remote = await fetch(`https://ddragon.leagueoflegends.com/cdn/16.17.1/img/${file}`, { signal: AbortSignal.timeout(9000) });
          if (!remote.ok) throw new Error(`${file}: HTTP ${remote.status}`);
          const data = Buffer.from(await remote.arrayBuffer()); await fs.mkdir(path.dirname(local), { recursive: true }); await fs.writeFile(local, data); return data;
        })());
        response.setHeader('Content-Type', 'image/png'); response.end(await cache.get(file));
      } catch (error) { failures.push(String(error)); response.statusCode = 502; response.end(); }
    });
    vite.middlewares.use('/__timeline-ui__', async (_request, response) => {
      const html = await vite.transformIndexHtml('/__timeline-ui__', `<html lang="zh-CN"><head><meta charset="UTF-8"><title>Timeline regression fixture</title></head><body><div id="root"></div><script type="module" src="/@fs/${fixture}"></script></body></html>`);
      response.setHeader('Content-Type', 'text/html'); response.end(html);
    });
  } }],
});
let browser;
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const evaluate = fn => browser.webContents.executeJavaScript(`(${fn.toString()})()`);
async function check(label, fn) { const value = await evaluate(fn); results.push({ label, passed: Boolean(value), value }); if (!value) throw new Error(label); }
async function ready(empty = false) {
  for (let i = 0; i < 100; i++) { if (await evaluate(() => Boolean(document.querySelector('.lol-postgame-tab')))) break; await pause(100); }
  await evaluate(() => [...document.querySelectorAll('.lol-postgame-tab')].find(node => node.textContent === '时间线').click());
  for (let i = 0; i < 80; i++) { if (await browser.webContents.executeJavaScript(`Boolean(document.querySelector('${empty ? '.tl-empty' : '.tl-plot'}'))`)) break; await pause(100); }
  await pause(200);
}
async function screenshot(name) {
  const shot = await browser.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
  await fs.writeFile(path.join(output, name + '.jpg'), Buffer.from(shot.data, 'base64'));
}
async function move(fraction, type = 'mouseMoved') {
  const position = await browser.webContents.executeJavaScript(`(() => { const r = document.querySelector('.tl-plot').getBoundingClientRect(); return { x: r.left + r.width * ${fraction}, y: r.top + r.height * .6 }; })()`);
  await browser.send('Input.dispatchMouseEvent', { type, ...position, ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }) }); await pause(80);
}
async function key(keyName) { await browser.webContents.executeJavaScript(`document.querySelector('.tl-plot').dispatchEvent(new KeyboardEvent('keydown', {key:${JSON.stringify(keyName)},bubbles:true}))`); await pause(60); }
try {
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__timeline-ui__`;
  browser = await openBrowser(url, output); await ready();
  await browser.setContentSize(1033, 720); await pause(200);
  await evaluate(() => Promise.race([Promise.all([...document.images].map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 9000))]));
  await check('new toolbar, ten portraits, no old radio/checkbox rail', () => document.querySelectorAll('.tl-metrics > button').length === 5 && document.querySelectorAll('.tl-player').length === 10 && document.querySelectorAll('.tl-workbench input').length === 0 && !document.querySelector('.lol-timeline'));
  await check('default team averages, five metric comparison and ten player snapshots', () => document.querySelectorAll('.tl-line').length === 2 && document.querySelectorAll('.tl-compare-table tbody tr').length === 5 && document.querySelectorAll('.tl-snapshot tbody tr').length === 10);
  await check('game artwork is loaded and readable', () => [...document.querySelectorAll('.tl-player img, .tl-event-mark img')].every(img => img.complete && img.naturalWidth > 0) && document.querySelector('.tl-player img').getBoundingClientRect().width >= 34);
  await check('scale fits the actual range without a half-empty chart', () => document.querySelector('.tl-y-axis span').textContent === '12,000');
  await evaluate(() => [...document.querySelectorAll('.tl-baseline-control button')].find(node => node.textContent.includes('设为基准')).click());
  await check('end-frame baseline stays inside the chart', () => { const p = document.querySelector('.tl-plot'), r = p.getBoundingClientRect(), l = document.querySelector('.tl-baseline > span').getBoundingClientRect(); return p.scrollWidth <= p.clientWidth + 1 && l.right <= r.right + 1; });
  await evaluate(() => document.querySelector('[aria-label="重置时间游标"]').click());
  await screenshot('timeline-1033');
  await move(.5);
  await check('hover reports the actual nearest sampled time and refreshes snapshot', () => document.querySelector('.tl-chart-tooltip time').textContent === '12:00' && document.querySelector('.tl-snapshot .tl-section-head time').textContent === '12:00');
  await check('raw cumulative champion damage is preserved at the hovered sample', () => document.querySelectorAll('.tl-compare-table tbody tr')[3].querySelectorAll('td')[0].textContent === '9,696');
  await check('pointer can move smoothly within one frame without data interpolation', async () => {
    const plot = document.querySelector('.tl-plot'), rect = plot.getBoundingClientRect();
    const x = rect.width * .506;
    for (let i = 0; i < 20; i++) plot.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + x, clientY: rect.top + 20, bubbles: true }));
    await new Promise(requestAnimationFrame);
    return Math.abs(plot.querySelector('.tl-crosshair').getBoundingClientRect().left - rect.left - x) < 1 && document.querySelector('.tl-inspector__head time').textContent === '12:00';
  });
  await screenshot('timeline-hover-1033');
  await move(.4, 'mousePressed'); await move(.4, 'mouseReleased');
  const lockedTime = await evaluate(() => document.querySelector('.tl-inspector__head time').textContent);
  await move(.75);
  if (await evaluate(() => document.querySelector('.tl-inspector__head time').textContent) !== lockedTime) throw new Error('Click lock did not hold the sample');
  results.push({ label: 'click pins the sample while pointer moves', passed: true });
  await evaluate(() => [...document.querySelectorAll('.tl-baseline-control button')].find(node => node.textContent.includes('设为基准')).click());
  await check('pinning a locked sample frees the cursor for interval comparison', () => !document.querySelector('.tl-plot').classList.contains('is-locked') && Boolean(document.querySelector('.tl-baseline-tag')));
  await evaluate(() => document.querySelector('[aria-label="重置时间游标"]').click());
  await key('Escape'); await key('Home');
  for (let i = 0; i < 5; i++) await key('ArrowRight');
  await evaluate(() => [...document.querySelectorAll('.tl-baseline-control button')].find(node => node.textContent.includes('设为基准')).click());
  for (let i = 0; i < 5; i++) await key('ArrowRight');
  await check('reference pin shades interval and calculates actual growth', () => document.querySelector('.tl-baseline-tag').textContent.includes('05:00') && document.querySelector('.tl-inspector__head time').textContent === '10:00' && document.querySelectorAll('.tl-probe-row > small').length === 2 && Number(document.querySelector('.tl-probe-row > small').textContent.replaceAll(',', '')) > 0 && Number(document.querySelector('.tl-interval').getAttribute('width')) > 0);
  await evaluate(() => [...document.querySelectorAll('.tl-chart-controls .tl-segment button')].find(node => node.textContent.includes('差值')).click());
  await check('difference chart uses a zero line and positive/negative areas', () => document.querySelector('.tl-chart').dataset.difference === 'true' && document.querySelectorAll('.tl-area').length === 2 && Boolean(document.querySelector('.tl-grid.is-zero')));
  const before = await evaluate(() => document.querySelector('.tl-compare-table tbody tr.is-active td:last-child').textContent);
  await evaluate(() => document.querySelector('[aria-label="交换 A / B"]').click()); await pause(70);
  const after = await evaluate(() => document.querySelector('.tl-compare-table tbody tr.is-active td:last-child').textContent);
  if (Number(before.replaceAll(',', '')) !== -Number(after.replaceAll(',', ''))) throw new Error('Swap did not reverse the actual signed difference');
  results.push({ label: 'swapping A/B reverses the signed comparison', passed: true });
  await check('signed table colors follow A/B after swap', () => { const cell = document.querySelector('.tl-compare-table tbody tr.is-active td:last-child'); const key = document.querySelectorAll('.tl-legend .tl-series-key')[cell.classList.contains('is-positive') ? 0 : 1]; return getComputedStyle(cell).color === getComputedStyle(key).color; });
  await screenshot('timeline-difference-1033');
  await evaluate(() => document.querySelector('[aria-label="重置时间游标"]').click());
  await evaluate(() => document.querySelector('[data-player-id="1"]').click());
  await check('single player automatically disables incompatible difference mode', () => document.querySelectorAll('.tl-legend > div').length === 1 && document.querySelectorAll('.tl-chart-controls .tl-segment button')[1].disabled && document.querySelector('.tl-chart').dataset.difference === 'false');
  await evaluate(() => document.querySelector('[data-player-id="6"]').click()); await pause(80);
  await check('two portraits create a named A/B comparison', () => document.querySelectorAll('.tl-player.is-active').length === 2 && document.querySelector('.tl-legend').textContent.includes('星河入梦') && document.querySelector('.tl-legend').textContent.includes('皮城第七码头'));
  await screenshot('timeline-players-1033');
  await evaluate(() => document.querySelector('.tl-event-mark').focus()); await pause(80);
  await check('event focus reveals real time, artwork and actors', () => document.querySelector('.tl-near-events header').textContent.includes('事件 ·') && document.querySelectorAll('.tl-near-event img').length > 0 && document.querySelector('.tl-near-event').title.length > 0);
  await evaluate(() => document.querySelector('.tl-event-mark').click());
  await check('event click locates and locks a real sample', () => document.querySelector('.tl-plot').classList.contains('is-locked'));
  await evaluate(() => document.querySelector('[aria-label="重置时间游标"]').click());
  await evaluate(() => document.querySelectorAll('.tl-toolbar .tl-segment button')[1].click()); await pause(80);
  await check('attribute history keeps all samples and all original attribute columns', () => document.querySelectorAll('.tl-history-table tbody tr').length === 25 && document.querySelectorAll('.tl-history-table thead th').length === 8);
  await evaluate(() => document.querySelector('[data-player-id="3"]').click());
  await check('attribute history player selection updates identity', () => document.querySelector('.tl-history .tl-section-head').textContent.includes('长夜与微光'));
  await screenshot('timeline-history-1033');
  await evaluate(() => document.querySelectorAll('.tl-history-table tbody th button')[5].click()); await pause(80);
  await check('clicking a history time returns to its player curve at that sample', () => document.querySelector('.tl-inspector__head time').textContent === '05:00' && document.querySelector('.tl-plot').classList.contains('is-locked') && document.querySelectorAll('.tl-legend > div').length === 1);
  await evaluate(() => document.querySelector('.tl-rosterbar > .tl-text-button').click());
  await check('all ten selected players remain available, without hidden records', () => document.querySelectorAll('.tl-legend > div').length === 10 && document.querySelectorAll('.tl-line').length === 10 && document.querySelectorAll('.tl-probe-row').length === 10);
  await evaluate(() => document.querySelector('.tl-rosterbar > .tl-text-button').click());
  await check('deselecting all presents an explicit empty chart', () => document.querySelector('.tl-chart__empty').textContent.includes('选择玩家') && document.querySelectorAll('.tl-line').length === 0);
  await evaluate(() => document.querySelector('.tl-scope button').click());
  await evaluate(() => document.querySelector('[aria-label="重置时间游标"]').click());
  for (const width of [1180, 1033, 920, 860, 800, 760, 650, 500, 440, 360]) {
    await browser.setContentSize(width, 720); await pause(130);
    await evaluate(() => { document.querySelector('.tl-body').scrollTop = 0; });
    await move(.98);
    await check(`layout has no horizontal scrolling at ${width}px`, () => [...document.querySelectorAll('.tl-workbench,.tl-toolbar,.tl-rosterbar,.tl-body,.tl-analysis,.tl-plot,.tl-inspector,.tl-snapshot')].every(node => node.scrollWidth <= node.clientWidth + 1));
    await check(`hover tooltip stays within plot and viewport at ${width}px`, () => { const t = document.querySelector('.tl-chart-tooltip').getBoundingClientRect(), p = document.querySelector('.tl-plot').getBoundingClientRect(); return t.left >= p.left - 1 && t.right <= p.right + 1 && t.right <= innerWidth; });
    await check(`type and portrait sizes are not shrunk at ${width}px`, () => parseFloat(getComputedStyle(document.querySelector('.tl-y-axis span')).fontSize) >= 12 && document.querySelector('.tl-player img').getBoundingClientRect().width >= 34);
    if ([920, 650, 360].includes(width)) await screenshot(`timeline-${width}`);
  }
  await browser.setContentSize(1033, 720);
  await browser.send('Page.navigate', { url: url + '?noDamage&noStats&partial&long' }); await ready();
  await evaluate(() => document.querySelector('[data-metric="damageDealt"]').click());
  await check('missing champion-damage is not misrepresented by all-target damage or zero', () => document.querySelector('.tl-chart__empty').textContent.includes('暂无采样') && [...document.querySelectorAll('.tl-probe-row > strong')].every(node => node.textContent === '—'));
  await evaluate(() => document.querySelector('[data-metric="gold"]').click());
  await key('Home'); for (let i = 0; i < 8; i++) await key('ArrowRight');
  await check('partial team frame does not fabricate a depressed average', () => document.querySelector('.tl-probe-row > strong').textContent === '—');
  await evaluate(() => document.querySelectorAll('.tl-toolbar .tl-segment button')[1].click());
  await check('unavailable AD and defenses remain unavailable in history', () => [...document.querySelectorAll('.tl-history-table tbody tr:first-child td')].slice(-3).every(node => node.textContent === '—'));
  await browser.send('Page.navigate', { url: url + '?single' }); await ready();
  await move(.5);
  await check('one frame is safe and chart paths contain no NaN/Infinity', () => [...document.querySelectorAll('.tl-plot path')].every(node => !/NaN|Infinity/.test(node.getAttribute('d'))) && document.querySelector('.tl-inspector__head time').textContent === '00:00');
  await browser.send('Page.navigate', { url: url + '?missing' }); await ready(true);
  await check('missing timeline has a useful empty state', () => document.querySelector('.tl-empty').textContent.includes('暂无时间线') && !document.querySelector('.tl-plot'));
  const fatal = browser.consoleErrors.filter(message => /Uncaught|ReferenceError|TypeError|Each child/.test(message));
  if (fatal.length) throw new Error(fatal.join('\n'));
  const report = { passed: true, fixture: 'synthetic timeline, real MatchDetail renderer', checks: results.length, results, assetFailures: [...new Set(failures)] };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  if (browser) await screenshot('failure').catch(() => {});
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: false, results, error: String(error), consoleErrors: browser?.consoleErrors, assetFailures: [...new Set(failures)] }, null, 2));
  console.error(error); console.error(JSON.stringify(browser?.consoleErrors || [])); process.exitCode = 1;
} finally { if (browser) await browser.close(); await server.close(); }
