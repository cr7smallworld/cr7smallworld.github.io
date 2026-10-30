// 给站长留言：网友只能交，看不到别人的；凭查询码在"我的投稿"里看回复
const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const STORE = 'cr7_my_feedback';
const $ = (id) => document.getElementById(id);

function showMsg(text, type = '') {
  $('fbMsg').textContent = text;
  $('fbMsg').className = 'form-msg' + (type ? ' ' + type : '');
}

function newToken() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function remember(token, message) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(STORE)) || []; } catch (_) {}
  list.unshift({ token, summary: message.slice(0, 60), at: new Date().toISOString() });
  try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 50))); } catch (_) {}
}

$('fbMessage').addEventListener('input', (e) => { $('fbCount').textContent = e.target.value.length; });

$('fbForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = $('fbMessage').value.trim();
  if (!message) return showMsg('请写一下留言内容', 'error');
  const category = (document.querySelector('input[name="fbCat"]:checked') || {}).value || 'other';
  const nickname = $('fbNickname').value.trim() || null;

  $('fbBtn').disabled = true;
  showMsg('正在发送…');
  const token = newToken();
  const { error } = await supabase.from('feedback').insert({ token, category, message, nickname });
  $('fbBtn').disabled = false;
  if (error) {
    const net = /failed to fetch|networkerror|load failed|timeout/i.test(error.message || '');
    return showMsg(net ? '网络好像断了一下，换个网络或者换个浏览器再点一次发送试试，写的内容都还在' : '发送失败了：' + error.message + '。可以稍后再试一次', 'error');
  }

  remember(token, message);
  showMsg('');
  $('fbCode').textContent = token;
  $('fbForm').hidden = true;
  $('fbDone').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('fbAgain').addEventListener('click', () => {
  $('fbForm').reset();
  $('fbCount').textContent = '0';
  $('fbDone').hidden = true;
  $('fbForm').hidden = false;
});

$('fbCopy').addEventListener('click', async () => {
  const code = $('fbCode').textContent;
  try { await navigator.clipboard.writeText(code); $('fbCopy').textContent = '已复制 ✓'; }
  catch (_) { prompt('长按复制查询码', code); }
});
