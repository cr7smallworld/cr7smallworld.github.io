// 人物关系：按时期分组的人物名单，点开一个人看介绍和糖点经历
// 人物 = submissions 里 kind='person' 的行；糖点 = kind='upload' 且 person_id 指向这个人

const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'submissions';

// 标签值 → 分组标题
const GROUPS = [
  ['里斯本竞技', '里斯本竞技', '2002 – 2003'],
  ['抬一', '曼联 · 抬一', '2003 – 2009'],
  ['皇马', '皇家马德里', '2009 – 2018'],
  ['尤文', '尤文图斯', '2018 – 2021'],
  ['抬二', '曼联 · 抬二', '2021 – 2022'],
  ['沙特', '利雅得胜利', '2023 – 至今'],
  ['葡萄牙', '葡萄牙国家队', '2003 – 至今'],
  ['其他', '其他', '家人、对手和更多的人'],
];
const GROUP_KEYS = GROUPS.map((g) => g[0]);

const $ = (id) => document.getElementById(id);
const state = { people: [], moments: {}, q: '', club: '', open: null };
const INITIAL_QUERY = location.search;  // render() 会改写网址，先记下进来时的参数

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const imgUrl = (p) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const yearOf = (s) => { const m = (s || '').match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
const aliases = (p) => (p.person_alias || '').split(/[,，、/／\s]+/).map((x) => x.trim()).filter(Boolean);
const clubsOf = (p) => {
  const c = (p.tags || []).filter((t) => GROUP_KEYS.includes(t));
  return c.length ? c : ['其他'];
};

// ---------- 读取 ----------
async function load() {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, created_at, kind, summary, event_date, detail, source, tags, uploader, image_paths, video_url, person_role, person_alias, person_id')
    .eq('section', 'relations')
    .eq('status', 'approved')
    .in('kind', ['person', 'upload'])
    .order('created_at', { ascending: true })
    .limit(2000);

  $('loading').hidden = true;
  if (error) { $('loadError').hidden = false; return; }

  const rows = data || [];
  state.people = rows.filter((r) => r.kind === 'person');
  state.moments = {};
  rows.filter((r) => r.kind === 'upload' && r.person_id).forEach((m) => {
    (state.moments[m.person_id] = state.moments[m.person_id] || []).push(m);
  });
  Object.values(state.moments).forEach((list) => list.sort((a, b) => {
    const ya = yearOf(a.event_date); const yb = yearOf(b.event_date);
    if (ya == null && yb == null) return 0;
    if (ya == null) return 1;
    if (yb == null) return -1;
    return ya - yb;
  }));

  readQuery();
  buildClubRow();
  render();
  openFromQuery();
}

// ---------- 时期切换 ----------
function buildClubRow() {
  const row = $('clubRow');
  row.innerHTML = '';
  const used = new Set(state.people.flatMap(clubsOf));
  const mk = (key, label) => {
    const b = el('button', 'club-chip' + (state.club === key ? ' active' : ''), label);
    b.type = 'button';
    b.dataset.club = key;
    b.addEventListener('click', () => {
      state.club = state.club === key ? '' : key;
      row.querySelectorAll('.club-chip').forEach((x) => x.classList.toggle('active', x.dataset.club === state.club));
      render();
    });
    return b;
  };
  row.append(mk('', '全部'));
  GROUPS.forEach(([key, title]) => { if (used.has(key)) row.append(mk(key, title)); });
  row.hidden = state.people.length === 0;
}

function matches(p) {
  if (!state.q) return true;
  const ms = state.moments[p.id] || [];
  const hay = [p.summary, p.person_role, p.person_alias, p.detail,
    ...ms.flatMap((m) => [m.summary, m.detail, m.event_date])].join(' ').toLowerCase();
  return state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

// ---------- 渲染 ----------
function render() {
  writeQuery();
  const box = $('groups');
  box.innerHTML = '';
  $('empty').hidden = state.people.length > 0;
  $('peopleAdd').hidden = state.people.length === 0;
  if (!state.people.length) { $('noMatch').hidden = true; return; }

  let shown = 0;
  GROUPS.forEach(([key, title, years]) => {
    if (state.club && state.club !== key) return;
    const list = state.people
      .filter((p) => clubsOf(p).includes(key) && matches(p))
      .sort((a, b) => (state.moments[b.id] || []).length - (state.moments[a.id] || []).length);
    if (!list.length) return;
    shown += list.length;

    const sec = el('section', 'people-group');
    const head = el('header', 'pg-head');
    head.append(el('h2', null, title), el('span', 'pg-years', years), el('span', 'pg-count', `${list.length}人`));
    sec.append(head);
    const ul = el('div', 'pg-list');
    list.forEach((p) => ul.append(row(p, key)));
    sec.append(ul);
    box.append(sec);
  });
  $('noMatch').hidden = shown > 0;
}

function avatar(p, cls) {
  const a = el('span', cls);
  if (p.image_paths && p.image_paths.length) {
    const img = el('img');
    img.loading = 'lazy';
    img.alt = p.summary;
    img.src = imgUrl(p.image_paths[0]);
    a.append(img);
  } else {
    a.classList.add('empty');
    a.textContent = (p.summary || '?').trim().charAt(0);
  }
  return a;
}

function row(p, groupKey) {
  const item = el('article', 'person');
  item.dataset.id = p.id;
  item.dataset.group = groupKey;

  const btn = el('button', 'person-head');
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.append(avatar(p, 'p-avatar'));

  const txt = el('span', 'p-text');
  const line1 = el('span', 'p-line1');
  line1.append(el('span', 'p-name', p.summary));
  aliases(p).slice(0, 3).forEach((a) => line1.append(el('span', 'p-alias', a)));
  txt.append(line1);
  if (p.person_role) txt.append(el('span', 'p-role', p.person_role));
  btn.append(txt);

  const n = (state.moments[p.id] || []).length;
  const side = el('span', 'p-side');
  if (n) side.append(el('span', 'p-count', `${n}条经历`));
  side.append(el('span', 'p-arrow', ''));
  btn.append(side);

  const panel = el('div', 'person-panel');
  panel.hidden = true;

  btn.addEventListener('click', () => toggle(item, btn, panel, p));
  item.append(btn, panel);
  return item;
}

function toggle(item, btn, panel, p, force) {
  const willOpen = force != null ? force : panel.hidden;
  // 同一时间只展开一个人
  document.querySelectorAll('.person.open').forEach((o) => {
    if (o === item) return;
    o.classList.remove('open');
    o.querySelector('.person-head').setAttribute('aria-expanded', 'false');
    o.querySelector('.person-panel').hidden = true;
  });
  if (willOpen && !panel.dataset.built) { fillPanel(panel, p); panel.dataset.built = '1'; }
  panel.hidden = !willOpen;
  item.classList.toggle('open', willOpen);
  btn.setAttribute('aria-expanded', String(willOpen));
  state.open = willOpen ? p.id : null;
  writeQuery();
}

function fillPanel(panel, p) {
  const top = el('div', 'pp-top');
  if (p.image_paths && p.image_paths.length) {
    const a = el('a', 'pp-photo');
    a.href = imgUrl(p.image_paths[0]);
    a.target = '_blank';
    a.rel = 'noopener';
    const img = el('img');
    img.src = imgUrl(p.image_paths[0]);
    img.alt = p.summary;
    a.append(img);
    top.append(a);
  }
  const info = el('div', 'pp-info');
  if (p.person_role) info.append(el('p', 'pp-role', p.person_role));
  const al = aliases(p);
  if (al.length) {
    const r = el('p', 'pp-alias');
    r.append(el('b', null, '花名'));
    al.forEach((a) => r.append(el('span', null, a)));
    info.append(r);
  }
  const clubs = clubsOf(p).filter((c) => c !== '其他');
  if (clubs.length) {
    const r = el('p', 'pp-clubs');
    r.append(el('b', null, '交集'));
    clubs.forEach((c) => r.append(el('span', null, GROUPS.find((g) => g[0] === c)[1])));
    info.append(r);
  }
  if (p.detail) info.append(el('p', 'pp-intro', p.detail));
  top.append(info);
  panel.append(top);

  const ms = state.moments[p.id] || [];
  const tl = el('div', 'pp-moments');
  tl.append(el('h3', 'pp-h', ms.length ? '糖点 & 经历' : '还没有人投稿他们之间的经历'));
  if (ms.length) {
    const ol = el('ol', 'mm-list');
    ms.forEach((m) => ol.append(moment(m)));
    tl.append(ol);
  }
  panel.append(tl);

  const act = el('div', 'pp-actions');
  const add = el('a', 'pp-btn main', '＋ 投稿他们的糖点');
  add.href = `submit.html?kind=upload&section=relations&rel=moment&person=${p.id}`;
  const fix = el('a', 'pp-btn', '人物介绍有错？去纠错');
  fix.href = `submit.html?kind=correction&section=relations&target=${p.id}`;
  const share = el('button', 'pp-btn', '复制链接');
  share.type = 'button';
  share.addEventListener('click', () => copyLink(share, `?p=${p.id}`, `【CR7的小世界】他和${p.summary}`));
  act.append(add, fix, share);
  panel.append(act);
}

function moment(m) {
  const li = el('li', 'mm');
  li.id = 'm-' + m.id;
  li.append(el('p', 'mm-date', m.event_date || '时间未知'));
  li.append(el('h4', 'mm-title', m.summary));
  if (m.detail) li.append(el('p', 'mm-detail', m.detail));

  if (m.image_paths && m.image_paths.length) {
    const g = el('div', 'mm-gallery');
    m.image_paths.forEach((path) => {
      const a = el('a');
      a.href = imgUrl(path);
      a.target = '_blank';
      a.rel = 'noopener';
      const img = el('img');
      img.loading = 'lazy';
      img.src = imgUrl(path);
      img.alt = m.summary;
      a.append(img);
      g.append(a);
    });
    li.append(g);
  }

  const foot = el('div', 'mm-foot');
  const v = safeUrl(m.video_url);
  if (v) {
    const a = el('a', 'mm-video', '▶ 看视频');
    a.href = v;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    foot.append(a);
  }
  foot.append(el('span', null, '出处：' + (m.source || '未知')));
  foot.append(el('span', null, '投稿：' + (m.uploader || '匿名')));
  const fix = el('a', 'mm-fix', '纠错');
  fix.href = `submit.html?kind=correction&section=relations&target=${m.id}`;
  foot.append(fix);
  li.append(foot);
  return li;
}

async function copyLink(btn, query, text) {
  const link = `${location.origin}${location.pathname}${query}`;
  try { await navigator.clipboard.writeText(`${text} ${link}`); btn.textContent = '已复制 ✓'; }
  catch (_) { prompt('长按复制下面的链接', `${text} ${link}`); }
}

// ---------- 网址 ----------
// ?p=人物id 打开这个人；?id=糖点id（首页、我的投稿跳过来）打开他所属的人并定位到那条
function readQuery() {
  const q = new URLSearchParams(location.search);
  state.q = q.get('q') || '';
  state.club = GROUP_KEYS.includes(q.get('club')) ? q.get('club') : '';
  $('fSearch').value = state.q;
}

function openFromQuery() {
  const q = new URLSearchParams(INITIAL_QUERY);
  let pid = q.get('p');
  let mid = null;
  const id = q.get('id');
  if (!pid && id) {
    if (state.people.some((p) => p.id === id)) pid = id;
    else {
      for (const [k, list] of Object.entries(state.moments)) {
        if (list.some((m) => m.id === id)) { pid = k; mid = id; break; }
      }
    }
  }
  if (!pid) return;
  const item = document.querySelector(`.person[data-id="${pid}"]`);
  if (!item) return;
  const p = state.people.find((x) => x.id === pid);
  toggle(item, item.querySelector('.person-head'), item.querySelector('.person-panel'), p, true);
  const goal = (mid && document.getElementById('m-' + mid)) || item;
  setTimeout(() => {
    goal.scrollIntoView({ behavior: 'smooth', block: mid ? 'center' : 'start' });
    if (mid) goal.classList.add('flash');
  }, 120);
}

function writeQuery() {
  const q = new URLSearchParams();
  if (state.q) q.set('q', state.q);
  if (state.club) q.set('club', state.club);
  if (state.open) q.set('p', state.open);
  const s = q.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

let timer;
$('fSearch').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); state.open = null; render(); }, 200);
});

load();
