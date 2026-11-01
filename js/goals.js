// 进球档案：读 data/goals-data.js 里的逐球记录，筛选、搜索、分页显示
(function () {
  const G = window.CR7_GOALS || [];
  const ZH = window.CR7_ZH || { team: {}, comp: {}, round: {}, person: {} };
  const $ = (id) => document.getElementById(id);
  // 行：[球号, 日期, 所属球队, 对手, 本方比分, 对方比分, 比赛, 轮次, 主客, 分钟, 部位, 方式, 助攻, 视频, 制胜球]
  const goals = G.map((r) => ({
    n: r[0], date: r[1], team: r[2], opp: r[3], gf: r[4], ga: r[5], comp: r[6], round: r[7],
    ha: r[8], min: r[9], type: r[10], where: r[11], assist: r[12], video: r[13], gwg: r[14] === 1,
  }));

  const TYPE = { right: '右脚', left: '左脚', head: '头球', other: '其他部位' };
  const WHERE = { 'inside-open-play': '禁区内', 'outside-open-play': '禁区外远射', penalty: '点球', 'free-kick': '任意球' };
  const HA = { H: '主场', A: '客场', N: '中立场' };
  const SHORT = { 'Real Madrid': '皇马', Portugal: '葡萄牙', 'Manchester United': '曼联', 'Al Nassr': '利雅得胜利', Juventus: '尤文', 'Sporting CP': '葡萄牙体育' };
  const TEAM_ORDER = ['Sporting CP', 'Manchester United', 'Real Madrid', 'Juventus', 'Al Nassr', 'Portugal'];
  const PAGE = 50;

  const both = (map, en) => (en && map[en] ? `${map[en]} (${en})` : en || '');
  const zhOnly = (map, en) => (en && map[en]) || en || '';
  const safeVideo = (u) => (/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(u || '') ? u : '');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  const state = { q: '', team: '', comp: '', year: '', type: '', desc: true, shown: PAGE };

  // ---------- 顶上的统计 ----------
  function summary() {
    const box = $('gSummary');
    const cnt = (f) => goals.filter(f).length;
    const cells = [
      ['总进球', goals.length],
      ['右脚', cnt((g) => g.type === 'right')],
      ['左脚', cnt((g) => g.type === 'left')],
      ['头球', cnt((g) => g.type === 'head')],
      ['点球', cnt((g) => g.where === 'penalty')],
      ['任意球', cnt((g) => g.where === 'free-kick')],
    ];
    const grid = el('div', 'g-stats');
    cells.forEach(([k, v]) => { const c = el('div', 'g-stat'); c.append(el('b', null, String(v)), el('span', null, k)); grid.append(c); });
    box.append(grid);
    const teams = el('div', 'g-teams');
    TEAM_ORDER.forEach((t) => {
      const b = el('button', 'g-team-chip', `${SHORT[t]} ${cnt((g) => g.team === t)}`);
      b.type = 'button';
      b.dataset.team = t;
      b.addEventListener('click', () => { state.team = state.team === t ? '' : t; $('gTeam').value = state.team; reset(); });
      teams.append(b);
    });
    box.append(teams);
    const left = 1000 - goals.length;
    if (left > 0) box.append(el('p', 'g-left', `距离一千球还差 ${left} 个`));
  }

  // ---------- 下拉框 ----------
  function fillSelects() {
    TEAM_ORDER.forEach((t) => $('gTeam').append(new Option(zhOnly(ZH.team, t), t)));
    const comps = {};
    goals.forEach((g) => { comps[g.comp] = (comps[g.comp] || 0) + 1; });
    Object.keys(comps).sort((a, b) => comps[b] - comps[a]).forEach((c) => $('gComp').append(new Option(`${zhOnly(ZH.comp, c)}（${comps[c]}）`, c)));
    [...new Set(goals.map((g) => g.date.slice(0, 4)))].sort((a, b) => b - a).forEach((y) => $('gYear').append(new Option(y + '年', y)));
  }

  function matches(g) {
    if (state.team && g.team !== state.team) return false;
    if (state.comp && g.comp !== state.comp) return false;
    if (state.year && g.date.slice(0, 4) !== state.year) return false;
    if (state.type) {
      if (TYPE[state.type] && g.type !== state.type) return false;
      if (WHERE[state.type] && g.where !== state.type) return false;
      if (state.type === 'gwg' && !g.gwg) return false;
      if (state.type === 'video' && !safeVideo(g.video)) return false;
    }
    if (state.q) {
      const q = state.q.toLowerCase();
      if (/^\d+$/.test(q)) return String(g.n) === q || g.date.startsWith(q);
      const hay = [g.opp, ZH.team[g.opp], g.team, ZH.team[g.team], g.comp, ZH.comp[g.comp], g.assist, ZH.person[g.assist], g.date].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ---------- 每个球一张卡 ----------
  function card(g) {
    const li = el('li', 'g-card');
    li.id = 'g' + g.n;
    const num = el('div', 'g-num');
    num.append(el('b', null, String(g.n)), el('span', null, g.date.replace(/-/g, '.')));
    li.append(num);

    const body = el('div', 'g-body');
    const top = el('p', 'g-match');
    top.append(el('span', 'g-club', SHORT[g.team] || g.team), ` 对阵 `, el('b', null, both(ZH.team, g.opp)));
    body.append(top);

    const res = g.gf > g.ga ? '胜' : g.gf < g.ga ? '负' : '平';
    const meta = el('p', 'g-meta');
    meta.append(el('span', 'g-score g-' + res, `${g.gf}-${g.ga} ${res}`));
    const comp = zhOnly(ZH.comp, g.comp) + (g.round ? ' · ' + zhOnly(ZH.round, g.round) : '');
    meta.append(` ${comp} · ${HA[g.ha] || ''}`);
    body.append(meta);

    const how = [g.min ? `第${g.min}分钟` : '', TYPE[g.type] || '', WHERE[g.where] || ''].filter(Boolean).join(' · ');
    body.append(el('p', 'g-how', how));
    const ast = el('p', 'g-assist');
    ast.append(el('em', null, '助攻'), g.assist ? both(ZH.person, g.assist) : (g.where === 'penalty' || g.where === 'free-kick' ? '无（定位球）' : '无'));
    body.append(ast);

    const tags = el('div', 'g-tags');
    if (g.gwg) tags.append(el('span', 'g-tag gold', '制胜球'));
    if (g.n % 100 === 0 || g.n === 1) tags.append(el('span', 'g-tag gold', g.n === 1 ? '生涯第一球' : `第${g.n}球里程碑`));
    const v = safeVideo(g.video);
    if (v) {
      const a = el('a', 'g-tag video', '▶ 看视频');
      a.href = v; a.target = '_blank'; a.rel = 'noopener noreferrer';
      tags.append(a);
    }
    if (tags.childNodes.length) body.append(tags);
    li.append(body);
    return li;
  }

  function render() {
    const list = goals.filter(matches).sort((a, b) => (state.desc ? b.n - a.n : a.n - b.n));
    const filtering = state.q || state.team || state.comp || state.year || state.type;
    $('gCount').textContent = filtering ? `找到 ${list.length} 个进球` : `共 ${list.length} 个进球`;
    $('gClear').hidden = !filtering;
    $('gSort').textContent = state.desc ? '最新在前 ↓' : '最早在前 ↑';
    document.querySelectorAll('.g-team-chip').forEach((b) => b.classList.toggle('active', b.dataset.team === state.team));
    const box = $('gList');
    box.replaceChildren(...list.slice(0, state.shown).map(card));
    if (!list.length) box.append(el('li', 'g-empty', '没有找到符合条件的进球，换个条件试试'));
    $('gMore').hidden = list.length <= state.shown;
    $('gMore').textContent = `再看 ${Math.min(PAGE, list.length - state.shown)} 个（还剩 ${list.length - state.shown} 个）`;
  }
  function reset() { state.shown = PAGE; render(); }

  // ---------- 事件 ----------
  let timer;
  $('gSearch').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); reset(); }, 200); });
  ['gTeam', 'gComp', 'gYear', 'gType'].forEach((id) => $(id).addEventListener('change', (e) => {
    state[{ gTeam: 'team', gComp: 'comp', gYear: 'year', gType: 'type' }[id]] = e.target.value; reset();
  }));
  $('gSort').addEventListener('click', () => { state.desc = !state.desc; reset(); });
  $('gMore').addEventListener('click', () => { state.shown += PAGE; render(); });
  $('gClear').addEventListener('click', () => {
    Object.assign(state, { q: '', team: '', comp: '', year: '', type: '' });
    ['gSearch', 'gTeam', 'gComp', 'gYear', 'gType'].forEach((id) => { $(id).value = ''; });
    reset();
  });

  $('gUpdated').textContent = (window.CR7_GOALS_UPDATED || '').replace(/-/g, '.');
  summary();
  fillSelects();
  // goals.html?n=985 直接定位到这个球
  const want = Number(new URLSearchParams(location.search).get('n'));
  if (want) { state.q = String(want); $('gSearch').value = String(want); }
  render();
  if (want && document.getElementById('g' + want)) document.getElementById('g' + want).classList.add('flash');
})();
