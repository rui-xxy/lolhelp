import io, re

css_path = r"C:\Users\Administrator\Desktop\个人项目\lolhelp\src\renderer\styles\index.css"
out_path = r"C:\Users\Administrator\Desktop\个人项目\lolhelp\.workbuddy-ai\live-preview.html"

css = io.open(css_path, encoding="utf-8").read()

# 1) 取 @theme 变量块，改名为 :root
theme_start = css.index("@theme {")
theme_end = css.index("\n}", theme_start) + 2
theme = css[theme_start:theme_end].replace("@theme {", ":root {", 1)

# 2) 取实时对局样式块
live_start = css.index("  /* ==========================================================================\n     实时对局")
live_end = css.index("\n  .match-result-card {", live_start)
live = css[live_start:live_end]

# 3) 清掉 @theme inline / @layer 等无关内容，只保留变量与实时样式
base = """* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { height: 100%; }
body {
  font-family: var(--font-sans);
  background: var(--color-app-bg);
  color: var(--color-app-body);
  overflow: hidden;
}
button { font: inherit; border: 0; background: none; color: inherit; cursor: pointer; }
"""

html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>实时对局 · Akari 版式预览</title>
<style>
__THEME__

__BASE__

__LIVE__
</style>
</head>
<body>
<div id="app"></div>
<script>
const PARTY_COLORS = ['#4fd1c5', '#d5b469', '#55c58a', '#a892d4', '#d88b66', '#78aef2'];
const RANK_EMBLEM = {
  IRON: 'iron', BRONZE: 'bronze', SILVER: 'silver', GOLD: 'gold', PLATINUM: 'platinum',
  EMERALD: 'emerald', DIAMOND: 'diamond', MASTER: 'master', GRANDMASTER: 'grandmaster',
  CHALLENGER: 'challenger',
};
const TIER_SHORT = {
  IRON: '黑铁', BRONZE: '青铜', SILVER: '白银', GOLD: '黄金', PLATINUM: '铂金',
  EMERALD: '翡翠', DIAMOND: '钻石', MASTER: '大师', GRANDMASTER: '宗师', CHALLENGER: '王者',
};
const CHAMP_ICON = (alias) => 'https://game.gtimg.cn/images/lol/act/img/champion/' + alias + '.png';
const RANK_ICON = (tier) => 'file:///C:/Users/Administrator/Desktop/个人项目/lolhelp/src/renderer/assets/rank-emblems/' + (RANK_EMBLEM[tier] || 'iron') + '.png';

function rankText(r) {
  const tier = TIER_SHORT[r.tier] || r.tier;
  const div = r.division && r.division !== 'NA' ? ' ' + r.division : '';
  const lp = r.lp > 0 ? ' ' + r.lp : '';
  return tier + div + lp;
}

function card(p, index, party) {
  const style = party ? ` style="--live-party-color: ${party.color}"` : '';
  const cls = 'live-card' + (party ? ' live-card--party' : '') + (p.isSelf ? ' live-card--self' : '');
  const winTone = p.matchCount === 0 ? '' : p.winRate >= 53 ? ' live-card-stat--win' : p.winRate <= 47 ? ' live-card-stat--loss' : '';
  const kdaTone = p.matchCount === 0 ? '' : p.kda >= 4 ? ' live-card-stat--win' : p.kda < 2 ? ' live-card-stat--loss' : '';
  const ranks = p.ranks.map((r) => `
      <span class="live-rank-item" title="${r.queue} ${rankText(r)}">
        <img class="live-rank-emblem" src="${RANK_ICON(r.tier)}" alt="${r.tier}">
        <span class="live-rank-text">${rankText(r)}</span>
      </span>`).join('');
  const chips = [
    p.isSelf ? '<span class="live-chip live-chip--self">自己</span>' : '',
    party ? `<span class="live-chip live-chip--party">小队 ${party.label}</span>` : '',
    p.streak ? `<span class="live-chip ${p.streak.win ? 'live-chip--win' : 'live-chip--loss'}">${p.streak.count} ${p.streak.win ? '连胜' : '连败'}</span>` : '',
    p.position ? `<span class="live-chip live-chip--position">${p.position}</span>` : '',
  ].join('');
  const champs = p.champs.map((c) => `
        <span class="live-champ ${c.win ? 'live-champ--win' : 'live-champ--loss'}" title="${c.name} · 近${c.games}场 ${c.wins}胜">
          <img src="${CHAMP_ICON(c.alias)}" alt="${c.name}">
        </span>`).join('');
  const history = p.history.map((h) => `
        <div class="live-match ${h.win ? 'live-match--win' : 'live-match--loss'}">
          <span class="live-match-icon"><img src="${CHAMP_ICON(h.alias)}" alt=""></span>
          <span class="live-match-info">
            <span class="live-match-mode">${h.mode}</span>
            <span class="live-match-meta">
              <span class="live-match-time">${h.time}</span>
              <span class="live-match-result ${h.win ? 'live-match-result--win' : 'live-match-result--loss'}">${h.win ? '胜' : '负'}</span>
            </span>
          </span>
          <span class="live-match-kda">${h.k}</span>
        </div>`).join('');

  return `
  <div class="${cls}"${style}>
    <div class="live-card-inner">
      <div class="live-card-head">
        <div class="live-card-avatar" title="${p.champion} · Lv.${p.level}">
          <img src="${CHAMP_ICON(p.alias)}" alt="${p.champion}">
          <span class="live-card-level">${p.level}</span>
        </div>
        <div class="live-card-identity">
          <div class="live-card-name-row">
            <button type="button" class="live-card-name">${p.name}</button>
            <span class="live-card-tag">#${p.tag}</span>
          </div>
          <button type="button" class="live-card-more" title="查看战绩">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>
      </div>
      <div class="live-card-ranks">${ranks}</div>
      <div class="live-card-stats">
        <span class="live-card-stat${winTone}"><b>${p.matchCount > 0 ? p.winRate + '%' : '— %'}</b>${p.matchCount > 0 ? '<small>(' + p.matchCount + ')</small>' : ''}</span>
        <span class="live-card-stat live-card-stat--kda${kdaTone}"><b>${p.matchCount > 0 ? p.kda.toFixed(2) : '—'}</b></span>
      </div>
      <div class="live-card-tags">${chips}</div>
      <div class="live-card-champs">${champs}</div>
      <div class="live-card-history">${history}</div>
    </div>
  </div>`;
}

function teamBar(teamId, name, summary, isMine) {
  const cls = teamId === 100 ? 'blue' : 'red';
  return `
    <div class="live-team-bar">
      <span class="live-team-dot live-team-dot--${cls}"></span>
      <span class="live-team-name">${name}</span>
      ${isMine ? '<span class="live-team-mine">我方</span>' : ''}
      <span class="live-team-metrics">
        <span class="live-team-metric live-team-metric--win">${summary.winRate}%</span>
        <span class="live-team-sep"></span>
        <span class="live-team-metric">${summary.kda.toFixed(2)}</span>
        ${summary.black > 0 ? '<span class="live-team-sep"></span><span class="live-chip live-chip--party">' + summary.black + ' 黑</span>' : ''}
      </span>
    </div>`;
}

function section(teamId, name, players, summary, isMine, parties) {
  const cards = players.map((p, i) => card(p, i, parties[p.party] || null)).join('');
  return `<section class="live-team">${teamBar(teamId, name, summary, isMine)}<div class="live-team-cards">${cards}</div></section>`;
}

const QN = '海克斯大乱斗';
const MAP = '随机地图';
const MYSIDE = '红队';

const parties = {
  a: { color: PARTY_COLORS[0], label: 'A' },
  b: { color: PARTY_COLORS[1], label: 'B' },
};

function hist(seed, count) {
  const modes = ['海克斯大乱斗', '极地大乱斗', '单双排位'];
  const champs = [['Jinx', '暴走萝莉'], ['Thresh', '魂锁典狱长'], ['Ahri', '九尾妖狐'], ['LeeSin', '盲僧'], ['Garen', '德玛西亚之力']];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const c = champs[(seed + i) % champs.length];
    const win = ((seed * 3 + i * 7) % 10) < 5;
    out.push({
      alias: c[0], name: c[1],
      mode: modes[i % 2],
      time: '09-15 ' + String(1 + (i % 12)).padStart(2, '0') + ':' + String((seed * 13 + i * 7) % 60).padStart(2, '0'),
      k: (2 + ((seed + i * 3) % 13)) + ' / ' + (1 + ((seed * 2 + i) % 9)) + ' / ' + (3 + ((seed * 5 + i * 2) % 19)),
      win,
    });
  }
  return out;
}

const raw = [
  ['Paranoid | 书生', '50721', 817, 'Vayne', '暗夜猎手', 'PLATINUM', 'II', 57, 'DIAMOND', 'II', 65, 49, 49, 3.06, 'a', 'top', null],
  ['Losts4likedream', '70913', 699, 'Yasuo', '疾风剑豪', 'PLATINUM', 'III', 7, null, null, 0, 44, 48, 3.16, null, 'middle', { win: false, count: 4 }],
  ['凤凰King', '77215', 91, 'Anivia', '冰晶凤凰', null, null, 0, null, null, 0, 52, 48, 2.93, 'a', 'middle', null],
  ['水朵蜜蜜', '20196', 164, 'Seraphine', '星籁歌姬', null, null, 0, 'PLATINUM', 'II', 98, 51, 41, 3.23, 'a', 'support', null],
  ['Love', '15372', 1226, 'Kaisa', '虚空之女', 'DIAMOND', 'IV', 15, 'DIAMOND', 'II', 65, 56, 48, 3.99, null, 'bottom', null],
  ['ydrtuesrtuhdrt', '39602', 278, 'Zed', '影流之主', null, null, 0, null, null, 0, 45, 47, 3.15, null, 'jungle', { win: false, count: 4 }],
  ['淡淡粗现在脸上', '34526', 1441, 'Darius', '诺克萨斯之手', 'MASTER', '', 31, null, null, 0, 45, 47, 2.80, null, 'top', { win: false, count: 6 }],
  ['小猫猫拳', '46662', 227, 'Riven', '放逐之刃', 'GOLD', 'I', 62, 'EMERALD', 'III', 60, 41, 49, 3.94, 'b', 'top', null],
  ['黑色红薯', '61319', 163, 'Lulu', '仙灵女巫', null, null, 0, null, null, 0, 46, 48, 4.04, 'b', 'support', null],
  ['月南城、城北后', '22348', 61, 'Gwen', '灵罗娃娃', 'GOLD', 'IV', 36, null, null, 0, 47, 49, 3.20, null, 'middle', { win: true, count: 3 }],
];

const players = raw.map((r) => {
  const [name, tag, level, alias, champion, t1, d1, lp1, t2, d2, lp2, wr, mc, kda, party, position, streak] = r;
  const ranks = [];
  if (t1) ranks.push({ queue: '单双', tier: t1, division: d1, lp: lp1 });
  if (t2) ranks.push({ queue: '灵活', tier: t2, division: d2, lp: lp2 });
  const h = hist(level % 17, 9);
  const champMap = new Map();
  h.forEach((x) => {
    const cur = champMap.get(x.alias) || { alias: x.alias, name: x.name, games: 0, wins: 0 };
    cur.games += 1;
    if (x.win) cur.wins += 1;
    champMap.set(x.alias, cur);
  });
  return {
    name, tag, level, alias, champion, ranks, winRate: wr, matchCount: mc, kda,
    party, position: ({ top: '上单', jungle: '打野', middle: '中路', bottom: '下路', support: '辅助' })[position],
    streak, history: h, champs: Array.from(champMap.values()).slice(0, 5),
    isSelf: name === '小猫猫拳',
  };
});

const blue = players.slice(0, 5);
const red = players.slice(5);
const sum = (list) => ({
  winRate: Math.round(list.reduce((a, p) => a + p.winRate, 0) / list.length),
  kda: list.reduce((a, p) => a + p.kda, 0) / list.length,
  black: list.filter((p) => p.party).length,
});

document.getElementById('app').innerHTML = `
<div class="live-page">
  <div class="live-page-bar">
    <span class="live-page-title">${QN} · ${MAP} · ${MYSIDE}</span>
    <div class="live-page-actions">
      <button type="button" class="live-page-action">测试数据</button>
      <button type="button" class="live-page-icon-action">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>
      </button>
    </div>
  </div>
  <div class="live-page-body">
    <div class="live-board">
      ${section(100, '蓝队', blue, sum(blue), false, parties)}
      ${section(200, '红队', red, sum(red), true, parties)}
    </div>
  </div>
</div>`;
</script>
</body>
</html>
"""

html = html.replace("__THEME__", theme).replace("__BASE__", base).replace("__LIVE__", live)
io.open(out_path, "w", encoding="utf-8", newline="\n").write(html)
print("written", out_path, len(html))
