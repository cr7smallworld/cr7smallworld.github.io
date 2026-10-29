const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STORE = 'cr7_my_submissions';
const KIND_NAMES = { upload: '上传', supplement: '补充', correction: '纠错' };
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

async function load() {
  const saved = readStore();
  const box = $('list');
  box.innerHTML = '';
  $('empty').hidden = saved.length > 0;
  if (!saved.length) return;

  $('loading').hidden = false;
  const { data, error } = await supabase.rpc('check_submissions', { p_tokens: saved.map((x) => x.token) });
  $('loading').hidden = true;
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
    if (it.status === 'approved' && it.kind === 'upload') {
      const a = el('a', 'mine-link', '去网站上看看 →');
      a.href = `${it.section}.html?id=${it.id}`;
      c.append(a);
    }
    const code = el('p', 'mine-code', '查询码：' + s.token);
    c.append(code);
    box.append(c);
  });
}

// 换了浏览器/手机：粘贴查询码找回
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const token = $('codeInput').value.trim();
  if (!UUID_RE.test(token)) {
    $('addMsg').textContent = '查询码格式不对，要完整复制那一长串';
    return;
  }
  const list = readStore();
  if (!list.some((x) => x.token === token)) {
    list.unshift({ token, summary: '', at: new Date().toISOString() });
    writeStore(list);
  }
  $('codeInput').value = '';
  $('addMsg').textContent = '';
  load();
});

load();
