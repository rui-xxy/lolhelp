const { openBrowser } = require('./match-ui-browser.cjs');
const fs = require('node:fs');
const path = require('node:path');
const url = process.argv[2];
const output = process.argv[3];

const results = [];
let window;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(fn) { return window.webContents.executeJavaScript(`(${fn.toString()})()`); }
async function check(label, fn) {
  const value = await evaluate(fn); results.push({ label, passed: Boolean(value), value });
  if (!value) throw new Error(label);
}
async function tab(label) {
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.lol-postgame-tab')).find(x=>x.textContent === ${JSON.stringify(label)}).click()`);
  await sleep(350);
}
async function screenshot(name) { const image = await window.webContents.capturePage(); fs.writeFileSync(path.join(output, name + '.png'), image.toPNG()); }
(async () => {
  window = await openBrowser(url, output);
  const consoleErrors = window.consoleErrors;
  for (let i = 0; i < 80; i++) { if (await evaluate(() => Boolean(document.querySelector('.lol-postgame-tab')))) break; await sleep(250); }
  await tab('详尽表格');
  await check('stats page and all ten player controls render', () => document.querySelectorAll('.md-stats .match-roster__player').length === 10);
  await check('avatar selection uses full border with no underline', () => { const p = document.querySelector('.match-roster__player.is-selected'); const c = getComputedStyle(p); return c.textDecorationLine === 'none' && c.boxShadow === 'none' && c.borderTopWidth === c.borderBottomWidth && getComputedStyle(p, '::after').content === 'none'; });
  await check('no ranking pills or explanatory slogans reintroduced', () => !/事件轨迹|点击指标展开|相对本局|#\d+\s*\/\s*10/.test(document.querySelector('.md-stats').textContent));
  await evaluate(() => document.querySelector('.md-stat__row').click());
  await check('metric expansion contains ten values without fake KDA bars', () => document.querySelectorAll('.md-stat__player').length === 10 && document.querySelectorAll('.md-stat.is-expanded .md-stat__visual .md-meter').length === 0);
  await evaluate(() => { document.querySelector('.md-stats__toolbar .md-control').click(); }); await sleep(60);
  await evaluate(() => document.querySelectorAll('.md-stats .match-roster__player')[6].click()); await sleep(70);
  await check('comparison selection and value display work', () => Boolean(document.querySelector('.match-roster__player.is-comparing')) && Boolean(document.querySelector('.md-stat__other')));
  await check('both comparison bars share the same track width', () => { const row = [...document.querySelectorAll('.md-stat__row')].find((node) => node.querySelectorAll('.md-meter').length === 2); const bars = row.querySelectorAll('.md-meter'); return Math.abs(bars[0].getBoundingClientRect().width - bars[1].getBoundingClientRect().width) < 1; });
  await check('both named value columns and signed differences are visible without expanding', () => document.querySelectorAll('.md-stat__row .md-stat__number > strong').length >= 10 && document.querySelectorAll('.md-player-heading').length === 2 && document.querySelectorAll('.md-stat__delta').length >= 5);
  await check('labels are upright and numbers use restrained weight', () => getComputedStyle(document.querySelector('.md-stat__label')).fontStyle === 'normal' && Number(getComputedStyle(document.querySelector('.md-stat__number strong')).fontWeight) <= 500);
  await check('stats names use player identities instead of champion aliases', () => !/Jinx|Thresh|Nautilus|Caitlyn/.test(document.querySelector('.md-stats').textContent));
  await evaluate(() => [...document.querySelectorAll('.md-stats__categories > button')].find((node) => node.title === '承受与资源').click());
  for (const width of [1100, 900, 650]) { await window.setContentSize(width, 820); await sleep(250); await check(`comparison preserves both values at ${width}px`, () => [...document.querySelectorAll('.md-stat__number')].every((node) => node.getBoundingClientRect().width > 0) && document.querySelector('.md-stats__content').scrollWidth <= document.querySelector('.md-stats__content').clientWidth + 1); await screenshot(`comparison-${width}`); }
  await window.setContentSize(900, 760); await sleep(120);
  await evaluate(() => { document.querySelector('.md-stats__content').scrollTop = 280; }); await sleep(120);
  await check('comparison avatars and both names stay pinned while values scroll', () => { const content = document.querySelector('.md-stats__content'); const head = document.querySelector('.md-stats__column-head'); return content.scrollTop > 100 && getComputedStyle(head).position === 'sticky' && Math.abs(head.getBoundingClientRect().top - content.getBoundingClientRect().top) <= 2 && [...head.querySelectorAll('img')].every(img => img.getBoundingClientRect().height > 0); });
  await screenshot('comparison-sticky-900');
  await evaluate(() => { document.querySelector('.md-stats__content').scrollTop = 0; });
  await evaluate(() => document.querySelector('[aria-label="退出双人对比"]').click());
  await evaluate(() => document.querySelector('.md-stats__categories > button').click()); await sleep(100);
  const before = await evaluate(() => document.querySelector('.md-stats__header').getBoundingClientRect().height);
  for (const top of [90, 104, 108, 96, 120, 500, 0]) { await window.webContents.executeJavaScript(`document.querySelector('.md-stats__content').scrollTop=${top}`); await sleep(70); }
  const after = await evaluate(() => document.querySelector('.md-stats__header').getBoundingClientRect().height);
  results.push({ label: 'header stays fixed across former collapse threshold', passed: before === after, value: { before, after } });
  if (before !== after) throw new Error('header geometry changed');
  await evaluate(() => document.querySelectorAll('.md-stats__categories > button')[2].click());
  await check('bundled category artwork loads without external requests', () => { const icons = [...document.querySelectorAll('.md-stats__categories img')]; return icons.length >= 8 && icons.every((image) => image.complete && image.naturalWidth > 0 && !image.src.includes('communitydragon')); });
  for (const width of [1180, 900, 650]) {
    window.setContentSize(width, 760); await sleep(220);
    await check(`stats fit ${width}px viewport`, () => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.md-stats__content').scrollWidth <= document.querySelector('.md-stats__content').clientWidth + 1);
    await screenshot(`stats-${width}`);
  }
  window.setContentSize(980, 760); await tab('事件'); await sleep(1200);
  await check('event stream and persistent filters render', () => document.querySelectorAll('.lol-event-control-types button').length === 5 && document.querySelectorAll('.lol-event-analyzer__event').length > 20);
  await check('events and roster show player IDs with no champion alias headings', () => !/Jinx|Thresh|Ahri|LeeSin|Garen|Caitlyn|Nautilus|Viego|Syndra|Nilah/.test(document.querySelector('.lol-event-analyzer').textContent) && [...document.querySelectorAll('.md-event-identity b')].every(node => node.textContent.includes('#')));
  await check('separate special-kill notifications populate multi-kill counts without duplicate kills', () => { const counts = [...document.querySelectorAll('.lol-event-control-types small')].map(node=>Number(node.textContent)); return counts[0] === 48 && counts[1] === 40 && counts[2] === 12; });
  await screenshot('events-980');
  await check('headline counts and confetti chart are replaced by three navigable lanes', () => !document.querySelector('.lol-event-analyzer__overview-copy') && !document.querySelector('.lol-event-density') && document.querySelectorAll('.md-timeline__lane').length === 3 && document.querySelector('.md-timeline__plot').getAttribute('role') === 'slider');
  await check('time axis has intermediate ticks and group headers are distinct', () => document.querySelectorAll('.md-timeline__axis > span').length >= 4 && getComputedStyle(document.querySelector('.lol-fight-window')).borderTopWidth === '1px' && getComputedStyle(document.querySelector('.lol-fight-window__head')).backgroundColor !== getComputedStyle(document.querySelector('.lol-fight-window')).backgroundColor);
  const plot = await evaluate(() => { const r = document.querySelector('.md-timeline__plot').getBoundingClientRect(); return { x: r.x + r.width * .45, y: r.y + 15 }; });
  await window.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...plot }); await sleep(100);
  await check('hover previews a concrete event with portraits instead of a sentence', () => document.querySelectorAll('.md-timeline__preview .md-event-visual img').length >= 3 && document.querySelector('.md-timeline__preview .md-event-visual').getAttribute('aria-label').includes('击杀'));
  await check('cursor follows exact pixels between events and coalesces pointer bursts', async () => {
    const plot = document.querySelector('.md-timeline__plot'); const r = plot.getBoundingClientRect(); const cursor = plot.querySelector('.md-timeline__cursor');
    const xs = [r.width * .452, r.width * .452 + 1, r.width * .452 + 2, r.width * .452 + 6];
    const errors = [];
    for (const x of xs) { for (let n = 0; n < 10; n++) plot.dispatchEvent(new PointerEvent('pointermove', {clientX:r.left+x, clientY:r.top+12, pointerId:1, bubbles:true})); await new Promise(requestAnimationFrame); errors.push(Math.abs(cursor.getBoundingClientRect().left - r.left - x)); }
    return errors.every(error => error < 1) && getComputedStyle(cursor).transitionDuration === '0s';
  });
  await screenshot('timeline-hover-980');
  await window.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...plot });
  await window.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...plot }); await sleep(250);
  await check('clicking the broad chart locates an event and opens it', () => Boolean(document.querySelector('.lol-event-analyzer__event.is-selected')));
  await evaluate(() => document.querySelector('[aria-label="收起事件详情"]').click());
  await evaluate(() => { document.querySelector('.lol-event-analyzer__stream').scrollTop = 0; }); await sleep(250);
  const railBefore = await evaluate(() => document.querySelector('.lol-event-inspector').getBoundingClientRect().x);
  await evaluate(() => document.querySelector('.lol-event-analyzer__event').click()); await sleep(350);
  await check('details open beside event while filters remain visible', () => Boolean(document.querySelector('.md-event-entry .lol-event-inspector__selected')) && document.querySelectorAll('.lol-event-control-types button').length === 5 && document.querySelectorAll('.lol-event-damage-group').length === 2);
  const railAfter = await evaluate(() => document.querySelector('.lol-event-inspector').getBoundingClientRect().x);
  results.push({ label: 'opening details does not move filter rail', passed: railBefore === railAfter });
  if (railBefore !== railAfter) throw new Error('filter rail moved');
  await screenshot('event-detail-980');
  await evaluate(() => document.querySelector('[aria-label="收起事件详情"]').click());
  await check('closing details returns keyboard focus to the event', () => document.activeElement.classList.contains('lol-event-analyzer__event'));
  await evaluate(() => document.querySelector('.lol-event-analyzer__event').click()); await sleep(60);
  await evaluate(() => document.querySelector('.lol-event-analyzer__event').click()); await sleep(60);
  await check('clicking the selected event toggles it closed', () => !document.querySelector('.lol-event-inspector__selected'));
  await evaluate(() => document.querySelectorAll('.lol-event-control-types button')[1].click()); await sleep(80);
  await evaluate(() => document.querySelector('[aria-label="下一个事件"]').click()); await sleep(150);
  await check('timeline navigation preserves event-type filter', () => document.querySelectorAll('.lol-event-control-types button')[1].getAttribute('aria-pressed') === 'true');
  await evaluate(() => document.querySelector('.md-timeline__plot').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  await check('keyboard timeline navigation reaches the last filtered event', () => { const rows = [...document.querySelectorAll('.lol-event-analyzer__event')]; return rows.at(-1).classList.contains('is-selected'); });
  await evaluate(() => document.querySelector('.lol-event-analyzer').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  await check('Escape closes details', () => !document.querySelector('.lol-event-inspector__selected'));
  await evaluate(() => document.querySelector('[aria-label="重置筛选"]').click());
  await evaluate(() => document.querySelectorAll('.lol-event-control-types button')[2].click()); await sleep(100);
  await check('multi-kill filter shows matching awards with victim and damage context', () => document.querySelectorAll('.lol-event-analyzer__event').length === 12 && [...document.querySelectorAll('.lol-event-analyzer__event')].every(node => node.textContent.includes('双杀')));
  await screenshot('multikills-980');
  await evaluate(() => document.querySelector('[aria-label="重置筛选"]').click());
  await evaluate(() => document.querySelectorAll('.lol-event-control-types button')[4].click()); await sleep(100);
  await check('building filter excludes champion kills', () => !document.querySelector('.lol-event-analyzer__kill-flow') && document.querySelectorAll('.lol-event-analyzer__event').length === 4);
  await check('building previews combine actor portrait, target icon and lane text', () => { const v=document.querySelector('.md-timeline__preview .md-event-visual'); return v && v.querySelectorAll('img').length === 3 && v.textContent.includes('中路') && !v.textContent.includes('防御塔'); });
  await screenshot('building-preview-980');
  await evaluate(() => document.querySelector('[aria-label="重置筛选"]').click());
  await evaluate(() => document.querySelectorAll('.lol-event-inspector .match-roster__player')[9].click()); await sleep(100);
  await check('type counts reflect the selected participant scope', () => { const counts = [...document.querySelectorAll('.lol-event-control-types small')].map((node) => Number(node.textContent)); return counts[0] < 48 && counts[0] === counts[1] + counts[3] + counts[4]; });
  await evaluate(() => document.querySelector('[aria-label="重置筛选"]').click());
  await evaluate(() => [...document.querySelectorAll('.lol-event-analyzer__event')].find((node) => node.querySelector('time').textContent === '2:39').click()); await sleep(80);
  await check('missing damage is shown as unavailable, not zero', () => Boolean(document.querySelector('.lol-event-damage-empty')) && !document.querySelector('.lol-event-damage-group'));
  await evaluate(() => document.querySelector('[aria-label="收起事件详情"]').click());
  for (const width of [900, 650]) {
    window.setContentSize(width, 760); await sleep(200);
    await check(`events fit ${width}px viewport`, () => document.documentElement.scrollWidth <= innerWidth && document.querySelector('.lol-event-analyzer__stream').scrollWidth <= document.querySelector('.lol-event-analyzer__stream').clientWidth + 1);
    await screenshot(`events-${width}`);
  }
  const fatal = consoleErrors.filter((message) => /Uncaught|ReferenceError|TypeError|Each child/.test(message));
  if (fatal.length) throw new Error(fatal.join('\n'));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: results.every((item) => item.passed), fixture: 'synthetic match, real renderer components', results, consoleErrors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: results.length, output }));
  await window.close(); process.exit(0);
})().catch(async (error) => {
  console.error(error.stack || String(error));
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, results, error: String(error) }, null, 2));
  if (window) { try { await screenshot('failure'); } catch {} }
  if (window) await window.close();
  process.exit(1);
});
