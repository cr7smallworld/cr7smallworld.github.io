const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STORE = 'cr7_my_submissions';
const FB_STORE = 'cr7_my_feedback';
const FB_CATS = { suggestion: '建议', problem: '发现问题', other: '其他' };
const KIND_NAMES = { upload: '上传', supplement: '补充', correction: '纠错', person: '添加人物' };
const SECTION_NAMES = { fun: '有趣事件', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创' };
const STATUS_NAMES = { pending: '审核中', approved: '已通过 ✓', rejected: '未通过' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
const fmt = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '');

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch (_) { return []; }
}
function writeStore(list) {
  localStorage.setItem(STORE, JSON.stringify(list.slice(0, 50)));
}
function readFb() {
  try { return JSON.parse(localStorage.getItem(FB_STORE)) || []; } catch (_) { return []; }
}
function writeFb(list) {
  localStorage.setItem(FB_STORE, JSON.stringify(list.slice(0, 50)));
}

// ---------- 给站长的留言 ----------
async function loadFeedback() {
  const saved = readFb();
  const box = $('fbList');
  box.innerHTML = '';
  $('fbSection').hidden = saved.length === 0;
  if (!saved.length) return;
  const { data, error } = await supabase.rpc('check_feedback', { p_tokens: saved.map((x) => x.token) });
  if (error) { box.append(el('p', 'mine-error', '留言查询失败了，刷新一下试试')); return; }
  const byToken = Object.fromEntries((data || []).map((x) => [x.token, x]));
  saved.forEach((s) => {
    const it = byToken[s.token];
    const c = el('article', 'mine-card');
    if (!it) {
      c.append(el('p', 'mine-head', fmt(s.at)));
      c.append(el('h3', 'mine-title', s.summary || '（未知）'));
      c.append(el('p', 'mine-note gone', '这条留言已经被站长删除了'));
      box.append(c);
      return;
    }
    const head = el('div', 'mine-head');
    const st = it.reply ? ['approved', '站长回复了'] : (it.status === 'read' ? ['pending', '站长已读'] : ['pending', '还没看到']);
    head.append(
      el('span', 'badge ' + st[0], st[1]),
      el('span', 'kind', FB_CATS[it.category] || '留言'),
      el('span', 'when', '留言于 ' + fmt(it.created_at)),
    );
    c.append(head);
    c.append(el('p', 'mine-title fb-text', it.message));
    if (it.reply) {
      const note = el('p', 'mine-note approved');
      note.append(el('b', null, '站长回复：'), document.createTextNode(it.reply));
      c.append(note);
      if (it.replied_at) c.append(el('p', 'mine-when', '回复于 ' + fmt(it.replied_at)));
    }
    c.append(el('p', 'mine-code', '查询码：' + s.token));
    box.append(c);
  });
}

// 登录了：换手机也能看到这个账号投过的稿（查询码合并到这台设备）
async function syncMember() {
  const acct = window.cr7Account;
  const tk = acct && acct.token();
  if (!tk) return;
  const { data } = await supabase.rpc('member_my_submissions', { p_token: tk });
  if (!data || !data.length) return;
  const list = readStore();
  const have = new Set(list.map((x) => x.token));
  data.forEach((d) => { if (!have.has(d.token)) list.push({ token: d.token, summary: d.summary, at: d.created_at }); });
  list.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  writeStore(list);
}

async function load() {
  try { await syncMember(); } catch (_) {}
  const saved = readStore();
  const box = $('list');
  box.innerHTML = '';
  loadFeedback();
  $('empty').hidden = saved.length > 0 || readFb().length > 0;
  $('subTitle').hidden = saved.length === 0;
  if (!saved.length) return;

  $('loading').hidden = false;
  const tokens = saved.map((x) => x.token);
  const [{ data, error }, { data: edits }] = await Promise.all([
    supabase.rpc('check_submissions', { p_tokens: tokens }),
    supabase.rpc('check_edits', { p_tokens: tokens }),
  ]);
  $('loading').hidden = true;
  const editBy = Object.fromEntries((edits || []).map((x) => [x.submission_id, x]));
  if (error) {
    box.append(el('p', 'mine-error', '查询失败了，刷新一下试试'));
    return;
  }
  const byToken = Object.fromEntries((data || []).map((x) => [x.token, x]));

  saved.forEach((s) => {
    const it = byToken[s.token];
    const c = el('article', 'mine-card');
    if (!it) {
      c.append(el('p', 'mine-head', `${fmt(s.at)}`));
      c.append(el('h3', 'mine-title', s.summary || '（未知）'));
      c.append(el('p', 'mine-note gone', '这条已经被站长删除了'));
      box.append(c);
      return;
    }
    const head = el('div', 'mine-head');
    head.append(
      el('span', 'badge ' + it.status, STATUS_NAMES[it.status]),
      el('span', 'kind', KIND_NAMES[it.kind]),
      el('span', 'sec', SECTION_NAMES[it.section] || ''),
      el('span', 'when', '投稿于 ' + fmt(it.created_at)),
    );
    c.append(head);
    c.append(el('h3', 'mine-title', it.summary));
    if (it.status === 'pending') {
      c.append(el('p', 'mine-note', '站长还没审到这条，耐心等一等'));
    } else {
      const note = el('p', 'mine-note ' + it.status);
      note.append(el('b', null, it.status === 'approved' ? '站长说：' : '没通过的原因：'));
      note.append(document.createTextNode(it.review_note || (it.status === 'approved' ? '已收录，谢谢你！' : '站长没有写原因')));
      c.append(note);
      c.append(el('p', 'mine-when', '审核于 ' + fmt(it.reviewed_at)));
    }
    // 最近一次修改的审核结果
    const ed = editBy[it.id];
    if (ed && it.status === 'approved') {
      const n = el('p', 'mine-note edit ' + ed.status);
      if (ed.status === 'pending') n.textContent = '你交的修改还在等站长审核，网站上暂时显示的是旧版';
      else if (ed.status === 'approved') n.textContent = '你交的修改已通过，网站上已经换成新版了';
      else {
        n.append(el('b', null, '修改没通过：'));
        n.append(document.createTextNode(ed.review_note || '站长没有写原因'));
      }
      c.append(n);
    }
    const links = el('div', 'mine-links');
    if (it.status === 'approved' && (it.kind === 'upload' || it.kind === 'person')) {
      const a = el('a', 'mine-link', '去网站上看看 →');
      a.href = it.section === 'relations' ? `relations.html?${it.kind === 'person' ? 'p' : 'id'}=${it.id}` : `${it.section}.html?id=${it.id}`;
      links.append(a);
    }
    if (it.kind === 'upload' || it.kind === 'person') {
      const ed2 = el('a', 'mine-link mine-edit', '编辑');
      ed2.href = `submit.html?edit=${it.id}`;
      ed2.addEventListener('click', () => { try { sessionStorage.setItem('cr7_edit_token_' + it.id, s.token); } catch (_) {} });
      links.append(ed2);
    }
    if (links.children.length) c.append(links);
    const code = el('p', 'mine-code', '查询码：' + s.token);
    c.append(code);
    box.append(c);
  });
}

// 换了浏览器/手机：粘贴查询码找回
$('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = $('codeInput').value.trim();
  if (!UUID_RE.test(token)) {
    $('addMsg').textContent = '查询码格式不对，要完整复制那一长串';
    return;
  }
  $('addMsg').textContent = '正在找…';
  const [{ data: sub }, { data: fb }] = await Promise.all([
    supabase.rpc('check_submissions', { p_tokens: [token] }),
    supabase.rpc('check_feedback', { p_tokens: [token] }),
  ]);
  if (fb && fb.length) {
    const list = readFb();
    if (!list.some((x) => x.token === token)) { list.unshift({ token, summary: '', at: new Date().toISOString() }); writeFb(list); }
  } else if (sub && sub.length) {
    const list = readStore();
    if (!list.some((x) => x.token === token)) { list.unshift({ token, summary: '', at: new Date().toISOString() }); writeStore(list); }
  } else {
    $('addMsg').textContent = '没找到这个查询码，检查一下有没有复制完整';
    return;
  }
  $('codeInput').value = '';
  $('addMsg').textContent = '';
  load();
});

load();
