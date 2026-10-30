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
  loadEdits();
  loadFb();
  loadCmts();
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
  row(it.kind === 'person' ? '分组' : '事件时间', it.kind === 'person' ? (it.tags || []).join('、') || '其它' : it.event_date);
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
  if ((it.kind === 'correction' || it.kind === 'supplement') && it.target_id && state.targets[it.target_id]) {
    const fx = el('button', 'a-fix', '去改原条目');
    fx.type = 'button';
    fx.addEventListener('click', () => openFix(it, c, note, fx));
    btns.insertBefore(fx, del);
  }
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

// ---------- 纠错/补充：站长对照着直接改原条目 ----------
const FIX_FIELDS = {
  person: [['summary', '名字', 'input'], ['person_role', '一句话身份', 'input'], ['person_alias', '花名/CP名', 'input'],
    ['tags', '分组（逗号隔开：俱乐部/葡萄牙/对手/亲人/其它）', 'tags'], ['detail', '简略介绍', 'textarea']],
  upload: [['summary', '一句话介绍', 'input'], ['event_date', '事件时间', 'input'], ['detail', '详细介绍', 'textarea'],
    ['source', '出处', 'input'], ['video_url', '链接', 'input'], ['tags', '标签（用逗号隔开）', 'tags']],
  fanworks: [['summary', '一句话介绍', 'input'], ['fanwork_type', '作品分类', 'fwtype'], ['fanwork_platform', '来源平台', 'input'],
    ['fanwork_author', '原作者', 'input'], ['detail', '详细介绍', 'textarea'], ['video_url', '视频/帖子链接', 'input'], ['tags', '标签（用逗号隔开）', 'tags']],
};
const LIMITS = { summary: 100, event_date: 50, detail: 3000, source: 300, video_url: 500, person_role: 60, person_alias: 100, fanwork_platform: 30, fanwork_author: 60 };

async function openFix(it, card, note, btn) {
  const old = card.querySelector('.fix-box');
  if (old) { old.remove(); btn.textContent = '去改原条目'; return; }
  btn.disabled = true;
  const { data: t, error } = await supabase.from('submissions')
    .select('id, kind, section, summary, event_date, detail, source, tags, video_url, person_role, person_alias, fanwork_type, fanwork_platform, fanwork_author')
    .eq('id', it.target_id).single();
  btn.disabled = false;
  if (error || !t) return msg('panelMsg', '原条目读不到了，可能已经被删了', 'error');

  const fields = t.kind === 'person' ? FIX_FIELDS.person : (t.section === 'fanworks' ? FIX_FIELDS.fanworks : FIX_FIELDS.upload);
  const box = el('div', 'fix-box');
  const ref = el('div', 'fix-ref');
  ref.append(el('p', 'fix-h', `网友的${KIND_NAMES[it.kind]}`));
  ref.append(el('p', 'fix-said', it.detail || '（没写具体内容）'));
  if (it.source) ref.append(el('p', 'fix-src', '出处：' + it.source));
  const form = el('div', 'fix-form');
  form.append(el('p', 'fix-h', '原条目（改完点保存）'));
  const inputs = {};
  fields.forEach(([k, label, type]) => {
    const lab = el('label', 'fix-field');
    lab.append(el('span', null, label));
    let inp;
    if (type === 'textarea') { inp = el('textarea'); inp.rows = 4; }
    else if (type === 'fwtype') {
      inp = el('select');
      ['混剪', '同人文', '同人图', '修图', '其它'].forEach((o) => inp.append(new Option(o, o)));
    } else { inp = el('input'); inp.type = 'text'; }
    if (LIMITS[k]) inp.maxLength = LIMITS[k];
    inp.value = type === 'tags' ? (t.tags || []).join('，') : (t[k] || '');
    inputs[k] = { inp, type };
    lab.append(inp);
    form.append(lab);
  });
  const row = el('div', 'a-btns');
  const save = el('button', 'a-ok', '保存修改，纠错标为通过');
  const cancel = el('button', 'a-del', '取消');
  [save, cancel].forEach((b) => (b.type = 'button'));
  cancel.addEventListener('click', () => { box.remove(); btn.textContent = '去改原条目'; });
  save.addEventListener('click', async () => {
    const patch = {};
    for (const [k, { inp, type }] of Object.entries(inputs)) {
      const v = inp.value.trim();
      if (type === 'tags') patch[k] = [...new Set(v.split(/[,，、\s]+/).map((x) => x.replace(/^#/, '').trim()).filter(Boolean))];
      else patch[k] = v || null;
    }
    if (!patch.summary) return msg('panelMsg', t.kind === 'person' ? '名字不能空' : '一句话介绍不能空', 'error');
    if (t.section === 'fanworks' && t.kind !== 'person' && (!patch.fanwork_platform || !patch.fanwork_author)) return msg('panelMsg', '二创的来源平台和原作者不能空', 'error');
    if (patch.video_url && !/^https?:\/\//i.test(patch.video_url)) return msg('panelMsg', '链接要以 http:// 或 https:// 开头', 'error');
    save.disabled = cancel.disabled = true;
    const { error: e1 } = await supabase.from('submissions').update(patch).eq('id', t.id);
    if (e1) { save.disabled = cancel.disabled = false; return msg('panelMsg', '原条目没改成：' + e1.message, 'error'); }
    const done = { status: 'approved', review_note: note.value.trim() || '已按你说的改好啦，谢谢你', reviewed_at: new Date().toISOString() };
    const { error: e2 } = await supabase.from('submissions').update(done).eq('id', it.id);
    if (e2) { save.disabled = cancel.disabled = false; return msg('panelMsg', '原条目改好了，但纠错没标成通过：' + e2.message, 'error'); }
    Object.assign(it, done);
    const local = state.all.find((x) => x.id === t.id);
    if (local) Object.assign(local, patch);
    state.targets[t.id] = Object.assign(state.targets[t.id] || {}, patch);
    msg('panelMsg', `原条目「${patch.summary.slice(0, 20)}」改好了，这条${KIND_NAMES[it.kind]}已标为通过`, 'ok');
    render();
  });
  row.append(save, cancel);
  form.append(row);
  box.append(ref, form);
  card.querySelector('.a-actions').after(box);
  btn.textContent = '收起';
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
  $('editView').hidden = b.dataset.view !== 'edit';
  $('fbView').hidden = b.dataset.view !== 'fb';
  $('cmtView').hidden = b.dataset.view !== 'cmt';
  if (b.dataset.view === 'cmt') markCmtSeen();
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

// ================= 网友交的修改 =================
const EDIT_FIELDS = [
  ['summary', '一句话介绍 / 名字'], ['person_role', '一句话身份'], ['person_alias', '花名/CP名'],
  ['fanwork_type', '作品分类'], ['fanwork_platform', '来源平台'], ['fanwork_author', '原作者'],
  ['event_date', '事件时间'], ['detail', '详细介绍'], ['source', '出处'], ['video_url', '视频链接'],
  ['tags', '标签'], ['uploader', '上传人'],
];
const edits = { all: [] };
$('editRefresh').addEventListener('click', loadEdits);

async function loadEdits() {
  msg('editMsg', '加载中…');
  const { data, error } = await supabase
    .from('submission_edits')
    .select('*, submissions!inner(id, kind, section, summary, event_date, detail, source, tags, uploader, image_paths, video_url, person_role, person_alias, fanwork_type, fanwork_platform, fanwork_author)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return msg('editMsg', '加载失败：' + error.message, 'error');
  edits.all = data || [];
  msg('editMsg', '');
  renderEdits();
}

function renderEdits() {
  $('cEdit').textContent = edits.all.length;
  $('cEdit').hidden = edits.all.length === 0;
  const box = $('editList');
  box.innerHTML = '';
  if (!edits.all.length) { box.append(el('p', 'admin-empty', '没有等审核的修改')); return; }
  edits.all.forEach((e) => box.append(editCard(e)));
}

const show = (v) => (Array.isArray(v) ? v.map((t) => '#' + t).join(' ') : (v || ''));

function gallery(paths) {
  const g = el('div', 'a-gallery');
  (paths || []).forEach((p) => {
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
  return g;
}

function editCard(e) {
  const old = e.submissions;
  const c = el('article', 'a-card');
  const head = el('div', 'a-head');
  head.append(
    el('span', 'badge pending', '待审核修改'),
    el('span', 'kind', old.kind === 'person' ? '人物' : '上传'),
    el('span', 'a-sec', SECTION_NAMES[old.section] || old.section),
    el('span', 'a-time', fmt(e.created_at)),
  );
  c.append(head);
  c.append(el('h3', 'a-title', old.summary));

  const diff = el('div', 'e-diff');
  let changed = 0;
  EDIT_FIELDS.forEach(([k, label]) => {
    const a = show(old[k]);
    const b = show(e[k]);
    if (a === b) return;
    changed++;
    const row = el('div', 'e-row');
    row.append(el('p', 'e-label', label));
    row.append(el('p', 'e-old', a || '（空）'));
    row.append(el('p', 'e-new', b || '（空）'));
    diff.append(row);
  });
  const imgA = (old.image_paths || []).join('|');
  const imgB = (e.image_paths || []).join('|');
  if (imgA !== imgB) {
    changed++;
    const row = el('div', 'e-row');
    row.append(el('p', 'e-label', '图片'));
    const o = el('div', 'e-old'); o.append(old.image_paths && old.image_paths.length ? gallery(old.image_paths) : '（没有图）');
    const n = el('div', 'e-new'); n.append(e.image_paths && e.image_paths.length ? gallery(e.image_paths) : '（没有图）');
    row.append(o, n);
    diff.append(row);
  }
  if (!changed) diff.append(el('p', 'admin-empty', '这份修改和原来一模一样'));
  c.append(diff);

  const act = el('div', 'a-actions');
  const note = el('textarea');
  note.rows = 2;
  note.maxLength = 500;
  note.placeholder = '驳回原因（选填，投稿人能看到）';
  const btns = el('div', 'a-btns');
  const ok = el('button', 'a-ok', '✓ 通过，换成新版');
  const no = el('button', 'a-no', '✕ 驳回，保留旧版');
  [ok, no].forEach((b) => (b.type = 'button'));
  const all = [ok, no];
  ok.addEventListener('click', async () => {
    all.forEach((b) => (b.disabled = true));
    const { data: gone, error } = await supabase.rpc('apply_edit', { p_edit: e.id });
    if (error) { all.forEach((b) => (b.disabled = false)); return msg('editMsg', '操作失败：' + error.message, 'error'); }
    if (gone && gone.length) await supabase.storage.from(BUCKET).remove(gone);
    edits.all = edits.all.filter((x) => x.id !== e.id);
    msg('editMsg', `「${old.summary.slice(0, 20)}」已换成新版`, 'ok');
    renderEdits();
    load();
  });
  no.addEventListener('click', async () => {
    all.forEach((b) => (b.disabled = true));
    const { data: gone, error } = await supabase.rpc('reject_edit', { p_edit: e.id, p_note: note.value });
    if (error) { all.forEach((b) => (b.disabled = false)); return msg('editMsg', '操作失败：' + error.message, 'error'); }
    if (gone && gone.length) await supabase.storage.from(BUCKET).remove(gone);
    edits.all = edits.all.filter((x) => x.id !== e.id);
    msg('editMsg', `「${old.summary.slice(0, 20)}」的修改已驳回，旧版不动`, 'ok');
    renderEdits();
  });
  btns.append(ok, no);
  act.append(note, btns);
  c.append(act);
  return c;
}

start();


// ================= 评论 =================
const SECTION_NAME = { fun: '有趣事件', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创' };
const SECTION_PAGE = { fun: 'fun.html', relations: 'relations.html', archive: 'archive.html', fanworks: 'fanworks.html' };
const cmts = { all: [] };
const LS_CMT_SEEN = 'cr7_admin_cmt_seen';
$('cmtRefresh').addEventListener('click', loadCmts);

function markCmtSeen() {
  try { localStorage.setItem(LS_CMT_SEEN, new Date().toISOString()); } catch (_) {}
  $('cCmtNew').hidden = true;
}

async function loadCmts() {
  msg('cmtMsg', '加载中…');
  const { data, error } = await supabase
    .from('comments')
    .select('id, created_at, parent_id, reply_to, nickname, content, like_count, target_id, submissions(summary, section, kind)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) return msg('cmtMsg', '加载失败：' + error.message, 'error');
  cmts.all = data || [];
  msg('cmtMsg', '');
  renderCmts();
}

function renderCmts() {
  const seen = localStorage.getItem(LS_CMT_SEEN) || '';
  const fresh = cmts.all.filter((c) => c.created_at > seen).length;
  const onTab = !$('cmtView').hidden;
  $('cCmtNew').textContent = fresh;
  $('cCmtNew').hidden = fresh === 0 || onTab;
  if (onTab) markCmtSeen();
  const box = $('cmtList');
  box.replaceChildren();
  if (!cmts.all.length) { box.append(el('p', 'admin-empty', '还没有评论')); return; }
  cmts.all.forEach((c) => {
    const card = el('article', 'a-card');
    const s = c.submissions || {};
    const head = el('div', 'a-head');
    if (c.created_at > seen) head.append(el('span', 'badge pending', '新'));
    head.append(
      el('span', 'kind', c.parent_id ? '回复' : '评论'),
      el('span', 'a-sec', c.nickname || '匿名罗蜜'),
      el('span', 'a-time', fmt(c.created_at)),
    );
    card.append(head);
    const where = el('p', 'a-reviewed');
    const page = SECTION_PAGE[s.section];
    const a = el(page ? 'a' : 'span', null, `${SECTION_NAME[s.section] || ''}｜${s.summary || '（内容已删除）'}`);
    if (page) { a.href = `${page}?id=${c.target_id}`; a.target = '_blank'; a.rel = 'noopener'; }
    where.append('评论在：', a);
    card.append(where);
    const text = (c.reply_to ? `回复 @${c.reply_to}：` : '') + c.content + (c.like_count ? `　♥${c.like_count}` : '');
    card.append(el('p', 'a-detail fb-msg', text));
    const act = el('div', 'a-actions');
    const btns = el('div', 'a-btns');
    const del = el('button', 'a-del', '删除');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm('删掉这条评论？' + (c.parent_id ? '' : '它下面的回复也会一起删掉'))) return;
      del.disabled = true;
      const { error } = await supabase.from('comments').delete().eq('id', c.id);
      del.disabled = false;
      if (error) return msg('cmtMsg', '删除失败：' + error.message, 'error');
      cmts.all = cmts.all.filter((x) => x.id !== c.id && x.parent_id !== c.id);
      msg('cmtMsg', '已删除', 'ok');
      renderCmts();
    });
    btns.append(del);
    act.append(btns);
    card.append(act);
    box.append(card);
  });
}
