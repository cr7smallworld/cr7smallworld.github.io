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
    .select('id, created_at, kind, section, summary, event_date, detail, source, tags, uploader, image_paths, video_url, target_id, person_id, person_role, person_alias, status, review_note, reviewed_at')
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
  act.append(note, btns);
  c.append(act);

  return c;
}

async function review(it, status, note, buttons) {
  buttons.forEach((b) => (b.disabled = true));
  const patch = { status, review_note: note.trim() || null, reviewed_at: new Date().toISOString() };
  const { error } = await supabase.from('submissions').update(patch).eq('id', it.id);
  buttons.forEach((b) => (b.disabled = false));
  if (error) return msg('panelMsg', '操作失败：' + error.message, 'error');
  Object.assign(it, patch);
  msg('panelMsg', `「${it.summary.slice(0, 20)}」已${status === 'approved' ? '通过' : '驳回'}`, 'ok');
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

start();
