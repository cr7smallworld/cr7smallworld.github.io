// Supabase 库放在 js/vendor/supabase.js 里，由页面先加载，不依赖外部CDN
import { mountComments } from './comments.js?v=20261030h';

// 公开钥匙：只能读"审核通过"的投稿
const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'submissions';

const CLUBS = ['里斯本竞技', '抬一', '皇马', '尤文', '抬二', '沙特', '葡萄牙'];

const SECTION = document.body.dataset.section;
// 精彩二创：没有事件时间，年份筛选换成按作品分类筛选
const FW = SECTION === 'fanworks';
const FW_TYPES = ['混剪', '同人文', '同人图', '修图', '其它'];
const $ = (id) => document.getElementById(id);

const state = { all: [], q: '', club: '', year: '', tag: '', sort: 'desc' };

// ---------- 小工具 ----------
const imgUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
const yearOf = (item) => {
  const m = (item.event_date || '').match(/(19|20)\d{2}/);
  return m ? m[0] : '';
};
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

// 二创卡片顶上那一行：分类小牌子
function fwLine(it) {
  const p = el('p', 'card-date fw-type');
  p.textContent = it.fanwork_type || '二创';
  return p;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// ---------- 读取 ----------
async function load() {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, created_at, section, summary, event_date, detail, source, tags, uploader, image_paths, video_url'
      + (FW ? ', fanwork_type, fanwork_platform, fanwork_author' : ''))
    .eq('section', SECTION)
    .eq('kind', 'upload')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(500);

  $('loading').hidden = true;
  if (error) {
    $('loadError').hidden = false;
    return;
  }
  state.all = data || [];
  readQuery();
  buildFilters();
  render();
}

// ---------- 筛选项 ----------
function buildFilters() {
  const yearSel = $('fYear');
  if (FW) {
    yearSel.setAttribute('aria-label', '按作品分类筛选');
    yearSel.options[0].textContent = '全部分类';
    FW_TYPES.forEach((t) => yearSel.append(new Option(t, t)));
  } else {
    const years = [...new Set(state.all.map(yearOf).filter(Boolean))].sort((a, b) => b - a);
    years.forEach((y) => yearSel.append(new Option(y + '年', y)));
  }
  if (state.year) yearSel.value = state.year;

  const counts = {};
  state.all.forEach((it) => (it.tags || []).forEach((t) => {
    if (!CLUBS.includes(t)) counts[t] = (counts[t] || 0) + 1;
  }));
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 24);
  const box = $('tagRow');
  box.innerHTML = '';
  tags.forEach((t) => {
    const b = el('button', 'tag-filter' + (state.tag === t ? ' active' : ''), '#' + t);
    b.type = 'button';
    b.addEventListener('click', () => { state.tag = state.tag === t ? '' : t; syncTagButtons(); render(); });
    b.dataset.tag = t;
    box.append(b);
  });
  box.hidden = tags.length === 0;
}

function syncTagButtons() {
  document.querySelectorAll('.tag-filter').forEach((b) => b.classList.toggle('active', b.dataset.tag === state.tag));
}

function matches(it) {
  if (state.club && !(it.tags || []).includes(state.club)) return false;
  if (state.year && (FW ? it.fanwork_type !== state.year : yearOf(it) !== state.year)) return false;
  if (state.tag && !(it.tags || []).includes(state.tag)) return false;
  if (state.q) {
    const hay = [it.summary, it.detail, it.source, it.event_date, it.uploader, it.fanwork_type, it.fanwork_platform, it.fanwork_author, ...(it.tags || [])].join(' ').toLowerCase();
    if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function sortKey(it) {
  // 有事件年份的按年份排，没有的按投稿时间
  if (FW) return new Date(it.created_at).getTime();
  return yearOf(it) ? Number(yearOf(it)) * 1e13 : new Date(it.created_at).getTime() / 1000;
}

// ---------- 渲染 ----------
function render() {
  writeQuery();
  const list = state.all.filter(matches).sort((a, b) =>
    state.sort === 'desc' ? sortKey(b) - sortKey(a) : sortKey(a) - sortKey(b));

  const grid = $('grid');
  grid.innerHTML = '';
  const filtering = state.q || state.club || state.year || state.tag;
  $('resultCount').textContent = filtering ? `找到 ${list.length} 条` : `共 ${state.all.length} 条`;
  $('clearBtn').hidden = !filtering;

  if (state.all.length === 0) { $('empty').hidden = false; $('noMatch').hidden = true; return; }
  $('empty').hidden = true;
  $('noMatch').hidden = list.length > 0;

  list.forEach((it) => grid.append(card(it)));
}

function card(it) {
  const c = el('article', 'card');
  c.tabIndex = 0;
  if (it.image_paths && it.image_paths.length) {
    const wrap = el('div', 'card-img');
    const img = el('img');
    img.loading = 'lazy';
    img.alt = it.summary;
    img.src = imgUrl(it.image_paths[0]);
    wrap.append(img);
    if (it.image_paths.length > 1) wrap.append(el('span', 'img-count', `${it.image_paths.length}张`));
    c.append(wrap);
  } else if (safeUrl(it.video_url)) {
    c.append(el('div', 'card-video', FW ? '▶ 看原作' : '▶ 视频'));
  }
  const body = el('div', 'card-body');
  body.append(FW ? fwLine(it) : el('p', 'card-date', it.event_date || '时间未知'));
  body.append(el('h3', 'card-title', it.summary));
  if (it.detail) body.append(el('p', 'card-excerpt', it.detail));
  const tags = el('div', 'card-tags');
  (it.tags || []).slice(0, 4).forEach((t) => tags.append(el('span', 'card-tag' + (CLUBS.includes(t) ? ' club' : ''), '#' + t)));
  body.append(tags);
  body.append(el('p', 'card-by', FW
    ? `原作者：${it.fanwork_author || '未知'}${it.fanwork_platform ? ' · ' + it.fanwork_platform : ''}`
    : '投稿：' + (it.uploader || '匿名')));
  c.append(body);
  const open = () => openDetail(it);
  c.addEventListener('click', open);
  c.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return c;
}

// ---------- 详情弹窗 ----------
function openDetail(it) {
  const box = $('modalBody');
  box.innerHTML = '';
  box.append(FW ? fwLine(it) : el('p', 'm-date', it.event_date || '时间未知'));
  box.append(el('h2', 'm-title', it.summary));

  if (it.image_paths && it.image_paths.length) {
    const gal = el('div', 'm-gallery' + (it.image_paths.length === 1 ? ' single' : ''));
    it.image_paths.forEach((p) => {
      const a = el('a');
      a.href = imgUrl(p);
      a.target = '_blank';
      a.rel = 'noopener';
      const img = el('img');
      img.loading = 'lazy';
      img.src = imgUrl(p);
      img.alt = it.summary;
      a.append(img);
      gal.append(a);
    });
    box.append(gal);
  }

  const v = safeUrl(it.video_url);
  if (v) {
    const a = el('a', 'm-video', FW ? '▶ 去看原作' : '▶ 去看视频');
    a.href = v;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    box.append(a);
  }

  if (it.detail) box.append(el('p', 'm-detail', it.detail));

  const meta = el('dl', 'm-meta');
  const rows = FW
    ? [['原作者', it.fanwork_author || '未知'], ['来源平台', it.fanwork_platform || '未知'], ['投稿', it.uploader || '匿名']]
    : [['出处', it.source || '未知'], ['投稿', it.uploader || '匿名']];
  rows.forEach(([k, val]) => {
    meta.append(el('dt', null, k), el('dd', null, val));
  });
  box.append(meta);

  const tags = el('div', 'card-tags');
  (it.tags || []).forEach((t) => tags.append(el('span', 'card-tag' + (CLUBS.includes(t) ? ' club' : ''), '#' + t)));
  box.append(tags);

  // 分享
  const share = el('div', 'm-share');
  const link = `${location.origin}${location.pathname}?id=${it.id}`;
  const text = `【CR7的小世界】${it.summary}`;
  const wb = el('a', 'share-btn', '分享到微博');
  wb.href = `https://service.weibo.com/share/share.php?url=${encodeURIComponent(link)}&title=${encodeURIComponent(text)}`;
  wb.target = '_blank';
  wb.rel = 'noopener';
  const cp = el('button', 'share-btn', '复制链接（发小红书用）');
  cp.type = 'button';
  cp.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${text} ${link}`); cp.textContent = '已复制 ✓'; }
    catch (_) { prompt('长按复制下面的链接', `${text} ${link}`); }
  });
  share.append(wb, cp);
  box.append(share);

  const links = el('p', 'm-links');
  const sup = el('a', 'm-fix', '还知道更多？去补充');
  sup.href = `submit.html?kind=supplement&section=${SECTION}&target=${it.id}`;
  const fix = el('a', 'm-fix', '这条有错？去纠错');
  fix.href = `submit.html?kind=correction&section=${SECTION}&target=${it.id}`;
  links.append(sup, fix);
  box.append(links);

  mountComments(box, supabase, it.id);

  $('modal').hidden = false;
  document.body.classList.add('no-scroll');
  history.replaceState(null, '', `?id=${it.id}`);
}

function closeDetail() {
  $('modal').hidden = true;
  document.body.classList.remove('no-scroll');
  writeQuery();
}
$('modalClose').addEventListener('click', closeDetail);
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeDetail(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeDetail(); });

// ---------- 网址里记住筛选条件 ----------
function readQuery() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.club = CLUBS.includes(p.get('club')) ? p.get('club') : '';
  state.year = p.get('year') || '';
  state.tag = p.get('tag') || '';
  state.sort = p.get('sort') === 'asc' ? 'asc' : 'desc';
  $('fSearch').value = state.q;
  $('fClub').value = state.club;
  updateSortBtn();
  const id = p.get('id');
  if (id) {
    const it = state.all.find((x) => x.id === id);
    if (it) openDetail(it);
  }
}

function writeQuery() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.club) p.set('club', state.club);
  if (state.year) p.set('year', state.year);
  if (state.tag) p.set('tag', state.tag);
  if (state.sort === 'asc') p.set('sort', 'asc');
  const s = p.toString();
  history.replaceState(null, '', s ? `?${s}` : location.pathname);
}

function updateSortBtn() {
  $('fSort').textContent = state.sort === 'desc' ? '最新在前 ↓' : '最早在前 ↑';
}

// ---------- 绑定 ----------
CLUBS.forEach((c) => $('fClub').append(new Option(c, c)));

let timer;
$('fSearch').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 200);
});
$('fClub').addEventListener('change', (e) => { state.club = e.target.value; render(); });
$('fYear').addEventListener('change', (e) => { state.year = e.target.value; render(); });
$('fSort').addEventListener('click', () => { state.sort = state.sort === 'desc' ? 'asc' : 'desc'; updateSortBtn(); render(); });
$('clearBtn').addEventListener('click', () => {
  Object.assign(state, { q: '', club: '', year: '', tag: '' });
  $('fSearch').value = '';
  $('fClub').value = '';
  $('fYear').value = '';
  syncTagButtons();
  render();
});

document.querySelectorAll('[data-submit-link]').forEach((a) => { a.href = `submit.html?kind=upload&section=${SECTION}`; });

load();
