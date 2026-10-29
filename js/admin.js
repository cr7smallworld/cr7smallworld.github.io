const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'submissions';

const KIND_NAMES = { upload: '上传', supplement: '补充', correction: '纠错', person: '新人物' };
const SECTION_NAMES = { fun: '有趣事件', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创' };
const STATUS_NAMES = { pending: '待审核', approved: '已通过', rejected: '未通过' };

const $ = (id) => document.getElementById(id);
const state = { all: [], targets: {}, status: 'pending', kind: '' };

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const imgUrl = (p) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
const fmt = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '');

function msg(id, text, type = '') {
  $(id).textContent = text;
  $(id).className = 'admin-msg' + (type ? ' ' + type : '');
}

// ---------- 登录 ----------
async function start() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await enter();
  else $('loginForm').hidden = false;
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginBtn').disabled = true;
  msg('loginMsg', '登录中…');
  const { error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value,
  });
  $('loginBtn').disabled = false;
  if (error) return msg('loginMsg', '登录失败：邮箱或密码不对', 'error');
  $('password').value = '';
  await enter();
});

async function enter() {
  const { data: ok, error } = await supabase.rpc('is_admin');
  if (error || !ok) {
    await supabase.auth.signOut();
    $('panel').hidden = true;
    $('loginForm').hidden = false;
    return msg('loginMsg', '这个账号不在站长名单里', 'error');
  }
  $('loginForm').hidden = true;
  $('panel').hidden = false;
  load();
  loadFb();
}

$('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

// ---------- 读取 ----------
async function load() {
  msg('panelMsg', '加载中…');
  const { data, error } = await supabase
    .from('submissions')
    .select('id, created_at, kind, section, summary, event_date, detail, source, tags, uploader, image_paths, video_url, target_id, person_id, person_role, person_alias, fanwork_type, fanwork_platform, fanwork_author, status, review_note, reviewed_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return msg('panelMsg', '加载失败：' + error.message, 'error');
  state.all = data || [];

  // 补充/纠错指向的那一条，查出标题
  const ids = [...new Set(state.all.flatMap((x) => [x.target_id, x.person_id]).filter(Boolean))];
  state.targets = {};
  state.all.forEach((x) => (state.targets[x.id] = x));
  const missing = ids.filter((id) => !state.targets[id]);
  if (missing.length) {
    const { data: t } = await supabase.from('submissions').select('id, kind, summary, section, status').in('id', missing);
    (t || []).forEach((x) => (state.targets[x.id] = x));
  }
  msg('panelMsg', '');
  render();
}

// ---------- 筛选 ----------
document.querySelectorAll('#statusTabs button').forEach((b) =>
  b.addEventListener('click', () => {
    state.status = b.dataset.status;
    document.querySelectorAll('#statusTabs button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }));
$('kindFilter').addEventListener('change', (e) => { state.kind = e.target.value; render(); });
$('refreshBtn').addEventListener('click', load);

function render() {
  const byKind = state.all.filter((x) => !state.kind || x.kind === state.kind);
  $('cPending').textContent = byKind.filter((x) => x.status === 'pending').length;
  $('cApproved').textContent = byKind.filter((x) => x.status === 'approved').length;
  $('cRejected').textContent = byKind.filter((x) => x.status === 'rejected').length;
  $('cAll').textContent = byKind.length;

  const list = byKind.filter((x) => state.status === 'all' || x.status === state.status);
  const box = $('list');
  box.innerHTML = '';
  if (!list.length) {
    box.append(el('p', 'admin-empty', state.status === 'pending' ? '没有待审核的投稿' : '这里还是空的'));
    return;
  }
  list.forEach((it) => box.append(card(it)));
}

// ---------- 单条 ----------
function card(it) {
  const c = el('article', 'a-card');

  const head = el('div', 'a-head');
  head.append(
    el('span', 'badge ' + it.status, STATUS_NAMES[it.status]),
    el('span', 'kind ' + it.kind, KIND_NAMES[it.kind]),
    el('span', 'a-sec', SECTION_NAMES[it.section] || it.section),
    el('span', 'a-time', fmt(it.created_at)),
  );
  c.append(head);

  if (it.target_id) {
    const t = state.targets[it.target_id];
    c.append(el('p', 'a-target', `针对：${t ? t.summary : '（原条目已删除）'}`));
  }

  if (it.person_id) {
    const t = state.targets[it.person_id];
    const tip = !t ? '（这个人物已删除）' : (t.status === 'approved' ? '' : `（这个人物还${t.status === 'pending' ? '没审核' : '被驳回了'}，要先通过人物，这条才会显示）`);
    c.append(el('p', 'a-target', `人物：${t ? t.summary : ''}${tip}`));
  }

  c.append(el('h3', 'a-title', it.kind === 'person' ? `添加人物：${it.summary}` : it.summary));

  if (it.image_paths && it.image_paths.length) {
    const g = el('div', 'a-gallery');
    it.image_paths.forEach((p) => {
      const a = el('a');
      a.href = imgUrl(p);
      a.target = '_blank';
      a.rel = 'noopener';
      const img = el('img');
      img.loading = 'lazy';
      img.src = imgUrl(p);
      img.alt = '';
      a.append(img);
      g.append(a);
    });
    c.append(g);
  }

  const dl = el('dl', 'a-meta');
  const row = (k, v) => { if (v) dl.append(el('dt', null, k), el('dd', null, v)); };
  row('作品分类', it.fanwork_type);
  row('来源平台', it.fanwork_platform);
  row('原作者', it.fanwork_author);
  row('一句话身份', it.person_role);
  row('花名/CP名', it.person_alias);
  row(it.kind === 'person' ? '时期' : '事件时间', it.kind === 'person' ? (it.tags || []).join('、') || '其他' : it.event_date);
  row('出处', it.source);
  row('上传人', it.uploader || '匿名');
  if (it.kind !== 'person') row('标签', (it.tags || []).map((t) => '#' + t).join(' '));
  const v = safeUrl(it.video_url);
  if (v) {
    dl.append(el('dt', null, '视频'));
    const dd = el('dd');
    const a = el('a', null, v);
    a.href = v;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    dd.append(a);
    dl.append(dd);
  }
  c.append(dl);

  if (it.detail) c.append(el('p', 'a-detail', it.detail));

  if (it.reviewed_at) {
    c.append(el('p', 'a-reviewed', `${fmt(it.reviewed_at)} 审核为「${STATUS_NAMES[it.status]}」${it.review_note ? '：' + it.review_note : ''}`));
  }

  // 操作
  const act = el('div', 'a-actions');
  const note = el('textarea');
  note.rows = 2;
  note.maxLength = 500;
  note.placeholder = '审核意见（选填，投稿人能看到）比如：图片太糊了 / 已经有人投过了 / 已修改，谢谢你';
  note.value = it.review_note || '';
  const btns = el('div', 'a-btns');
  const ok = el('button', 'a-ok', it.status === 'approved' ? '✓ 已通过' : '✓ 通过');
  const no = el('button', 'a-no', it.status === 'rejected' ? '✕ 已驳回' : '✕ 驳回');
  const del = el('button', 'a-del', '删除');
  [ok, no, del].forEach((b) => (b.type = 'button'));
  ok.addEventListener('click', () => review(it, 'approved', note.value, [ok, no, del]));
  no.addEventListener('click', () => review(it, 'rejected', note.value, [ok, no, del]));
  del.addEventListener('click', () => remove(it, [ok, no, del]));
  btns.append(ok, no, del);
  if (it.status === 'approved' && wantsCover(it)) {
    const cv = el('button', 'a-no', '重新拿封面');
    cv.type = 'button';
    cv.addEventListener('click', async () => {
      cv.disabled = true;
      msg('panelMsg', '正在拿视频封面…');
      const r = await fetchCover(it);
      cv.disabled = false;
      msg('panelMsg', r.ok ? '封面拿到了' : r.fail, r.ok ? 'ok' : 'error');
      if (r.ok) render();
    });
    btns.append(cv);
  }
  act.append(note, btns);
  c.append(act);

  return c;
}

// 没传图、只贴了YouTube链接：通过的时候自动去拿封面
// （B站会拦海外机房的服务器，2026.10.30决定不拿B站封面）
const COVER_RE = /(^|\.)(youtube\.com|youtu\.be)(\/|$)/i;
function wantsCover(it) {
  if (it.kind !== 'upload' || (it.image_paths && it.image_paths.length) || !it.video_url) return false;
  try { return COVER_RE.test(new URL(it.video_url).hostname + '/'); } catch (_) { return false; }
}

async function fetchCover(it) {
  const { data, error } = await supabase.functions.invoke('fetch-cover', { body: { id: it.id } });
  if (error) {
    // 把函数返回的具体原因读出来，方便查是哪一步出的错
    let why = error.message || '';
    try {
      const res = error.context;
      if (res && typeof res.text === 'function') {
        const t = await res.text();
        try { const j = JSON.parse(t); why = j.error || j.message || j.msg || t; } catch (_) { why = t || why; }
        if (res.status) why = `${res.status} ${why}`;
      }
    } catch (_) {}
    return { fail: `拿封面出错了（${String(why).slice(0, 120)}），可以等会儿点"重新拿封面"再试` };
  }
  if (data && data.path) { it.image_paths = [data.path]; return { ok: true }; }
  return { fail: (data && data.skipped) || '没拿到封面' };
}

async function review(it, status, note, buttons) {
  buttons.forEach((b) => (b.disabled = true));
  const patch = { status, review_note: note.trim() || null, reviewed_at: new Date().toISOString() };
  const { error } = await supabase.from('submissions').update(patch).eq('id', it.id);
  buttons.forEach((b) => (b.disabled = false));
  if (error) return msg('panelMsg', '操作失败：' + error.message, 'error');
  Object.assign(it, patch);
  const name = `「${it.summary.slice(0, 20)}」已${status === 'approved' ? '通过' : '驳回'}`;
  if (status === 'approved' && wantsCover(it)) {
    msg('panelMsg', name + '，正在拿视频封面…');
    const r = await fetchCover(it);
    msg('panelMsg', r.ok ? name + '，视频封面也拿到了' : `${name}，不过${r.fail}`, r.ok ? 'ok' : 'error');
  } else {
    msg('panelMsg', name, 'ok');
  }
  render();
}

async function remove(it, buttons) {
  let children = [];
  if (it.kind === 'person') {
    const { data } = await supabase.from('submissions').select('id, image_paths').eq('person_id', it.id);
    children = data || [];
  }
  const extra = children.length ? `\n挂在这个人物下面的 ${children.length} 条糖点也会一起删掉。` : '';
  if (!confirm(`确定删除「${it.summary.slice(0, 30)}」吗？图片也会一起删掉，删了就找不回来了${extra}`)) return;
  buttons.forEach((b) => (b.disabled = true));
  const paths = [...(it.image_paths || []), ...children.flatMap((x) => x.image_paths || [])];
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('submissions').delete().eq('id', it.id);
  buttons.forEach((b) => (b.disabled = false));
  if (error) return msg('panelMsg', '删除失败：' + error.message, 'error');
  const gone = new Set([it.id, ...children.map((x) => x.id)]);
  state.all = state.all.filter((x) => !gone.has(x.id));
  msg('panelMsg', '已删除', 'ok');
  render();
}

// ================= 留言 =================
const FB_CATS = { suggestion: '建议', problem: '发现问题', other: '其他' };
const fb = { all: [], tab: 'unread' };

document.querySelectorAll('#viewTabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('#viewTabs button').forEach((x) => x.classList.toggle('active', x === b));
  $('subView').hidden = b.dataset.view !== 'sub';
  $('fbView').hidden = b.dataset.view !== 'fb';
}));
document.querySelectorAll('#fbTabs button').forEach((b) => b.addEventListener('click', () => {
  fb.tab = b.dataset.fb;
  document.querySelectorAll('#fbTabs button').forEach((x) => x.classList.toggle('active', x === b));
  renderFb();
}));
$('fbRefresh').addEventListener('click', loadFb);

async function loadFb() {
  msg('fbPanelMsg', '加载中…');
  const { data, error } = await supabase
    .from('feedback')
    .select('id, created_at, category, message, nickname, status, reply, replied_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return msg('fbPanelMsg', '加载失败：' + error.message, 'error');
  fb.all = data || [];
  msg('fbPanelMsg', '');
  renderFb();
}

function renderFb() {
  const unread = fb.all.filter((x) => x.status === 'unread').length;
  $('cFbUnread').textContent = unread;
  $('cFbUnread').hidden = unread === 0;
  $('cFbU').textContent = unread;
  $('cFbR').textContent = fb.all.length - unread;
  $('cFbA').textContent = fb.all.length;
  const list = fb.all.filter((x) => fb.tab === 'all' || x.status === fb.tab);
  const box = $('fbList');
  box.innerHTML = '';
  if (!list.length) { box.append(el('p', 'admin-empty', fb.tab === 'unread' ? '没有未读留言' : '这里还是空的')); return; }
  list.forEach((it) => box.append(fbCard(it)));
}

function fbCard(it) {
  const c = el('article', 'a-card');
  const head = el('div', 'a-head');
  head.append(
    el('span', 'badge ' + (it.status === 'unread' ? 'pending' : 'approved'), it.status === 'unread' ? '未读' : '已读'),
    el('span', 'kind', FB_CATS[it.category] || '其他'),
    el('span', 'a-sec', it.nickname || '匿名'),
    el('span', 'a-time', fmt(it.created_at)),
  );
  c.append(head);
  c.append(el('p', 'a-detail fb-msg', it.message));
  if (it.replied_at) c.append(el('p', 'a-reviewed', `${fmt(it.replied_at)} 回复过`));

  const act = el('div', 'a-actions');
  const note = el('textarea');
  note.rows = 2;
  note.maxLength = 1000;
  note.placeholder = '回复（选填，留言的人在"我的投稿"里能看到）';
  note.value = it.reply || '';
  const btns = el('div', 'a-btns');
  const send = el('button', 'a-ok', it.reply ? '更新回复' : '回复');
  const read = el('button', 'a-no', it.status === 'unread' ? '标为已读' : '标为未读');
  const del = el('button', 'a-del', '删除');
  [send, read, del].forEach((b) => (b.type = 'button'));
  const all = [send, read, del];
  send.addEventListener('click', () => {
    const text = note.value.trim();
    fbUpdate(it, { reply: text || null, replied_at: text ? new Date().toISOString() : null, status: 'read' }, all, text ? '已回复' : '已清空回复');
  });
  read.addEventListener('click', () => fbUpdate(it, { status: it.status === 'unread' ? 'read' : 'unread' }, all, '已更新'));
  del.addEventListener('click', async () => {
    if (!confirm('确定删除这条留言吗？删了就找不回来了')) return;
    all.forEach((b) => (b.disabled = true));
    const { error } = await supabase.from('feedback').delete().eq('id', it.id);
    all.forEach((b) => (b.disabled = false));
    if (error) return msg('fbPanelMsg', '删除失败：' + error.message, 'error');
    fb.all = fb.all.filter((x) => x.id !== it.id);
    msg('fbPanelMsg', '已删除', 'ok');
    renderFb();
  });
  btns.append(send, read, del);
  act.append(note, btns);
  c.append(act);
  return c;
}

async function fbUpdate(it, patch, buttons, done) {
  buttons.forEach((b) => (b.disabled = true));
  const { error } = await supabase.from('feedback').update(patch).eq('id', it.id);
  buttons.forEach((b) => (b.disabled = false));
  if (error) return msg('fbPanelMsg', '操作失败：' + error.message, 'error');
  Object.assign(it, patch);
  msg('fbPanelMsg', done, 'ok');
  renderFb();
}

start();
