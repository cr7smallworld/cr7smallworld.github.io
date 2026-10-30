// 每条内容底下的评论区：直接显示，站长后台可删；回复只挂一层；能点赞
// 网友不用登录：发评论时生成一个口令存在浏览器里，凭它删自己的评论

const LS_TOKENS = 'cr7_comment_tokens';
const LS_LIKED = 'cr7_comment_liked';
const LS_LIKER = 'cr7_liker';
const LS_NICK = 'cr7_comment_nick';

const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (_) { return {}; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
function liker() {
  let id = localStorage.getItem(LS_LIKER);
  if (!id) { id = uuid(); try { localStorage.setItem(LS_LIKER, id); } catch (_) {} }
  return id;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function ago(iso) {
  const t = new Date(iso);
  const s = (Date.now() - t.getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return Math.floor(s / 60) + '分钟前';
  if (s < 86400) return Math.floor(s / 3600) + '小时前';
  if (s < 86400 * 7) return Math.floor(s / 86400) + '天前';
  const y = t.getFullYear() === new Date().getFullYear() ? '' : t.getFullYear() + '-';
  return `${y}${t.getMonth() + 1}-${t.getDate()}`;
}

function niceError(err) {
  const m = (err && err.message) || '';
  if (/failed to fetch|networkerror|load failed|timeout/i.test(m)) return '网络好像断了一下，换个网络再试试';
  // 数据库里写的中文提示直接给网友看
  if (/[\u4e00-\u9fa5]/.test(m)) return m;
  return '没发出去，稍后再试一次';
}

// 一次查好多条内容各有几条评论（糖点列表用）
export async function countComments(supabase, ids) {
  const out = {};
  if (!ids.length) return out;
  const { data } = await supabase.from('comments').select('target_id').in('target_id', ids).limit(5000);
  (data || []).forEach((r) => { out[r.target_id] = (out[r.target_id] || 0) + 1; });
  return out;
}

// container：放评论区的盒子；collapsed：先只显示一个"评论 (n)"按钮，点开才加载
export function mountComments(container, supabase, targetId, { collapsed = false, count = null } = {}) {
  const root = el('section', 'cmt' + (collapsed ? ' cmt-mini' : ''));
  container.append(root);
  const state = { list: [], loaded: false, replyBox: null };

  const head = el(collapsed ? 'button' : 'h3', 'cmt-head');
  const body = el('div', 'cmt-body');
  if (collapsed) {
    head.type = 'button';
    body.hidden = true;
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      root.classList.toggle('open', !body.hidden);
      if (!body.hidden && !state.loaded) load();
    });
  }
  root.append(head, body);
  const setHead = (n) => { head.textContent = n ? `评论 ${n}` : (collapsed ? '评论' : '评论区'); };
  setHead(count);

  const form = composer(null);
  const msg = el('p', 'cmt-msg');
  const listBox = el('div', 'cmt-list');
  body.append(form, msg, listBox);

  if (!collapsed) load();

  async function load() {
    state.loaded = true;
    listBox.replaceChildren(el('p', 'cmt-empty', '加载中…'));
    const { data, error } = await supabase
      .from('comments')
      .select('id, created_at, parent_id, reply_to, nickname, content, like_count')
      .eq('target_id', targetId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) { listBox.replaceChildren(el('p', 'cmt-empty', '评论加载失败了，刷新一下试试')); return; }
    state.list = data || [];
    render();
  }

  function render() {
    setHead(state.list.length);
    listBox.replaceChildren();
    const tops = state.list.filter((c) => !c.parent_id).reverse();
    if (!tops.length) { listBox.append(el('p', 'cmt-empty', '还没有人说话，来抢沙发')); return; }
    tops.forEach((c) => {
      const box = el('div', 'cmt-thread');
      box.append(item(c));
      const replies = state.list.filter((r) => r.parent_id === c.id);
      if (replies.length) {
        const rb = el('div', 'cmt-replies');
        replies.forEach((r) => rb.append(item(r, c)));
        box.append(rb);
      }
      listBox.append(box);
    });
  }

  function item(c, top) {
    const mine = readJson(LS_TOKENS)[c.id];
    const liked = !!readJson(LS_LIKED)[c.id];
    const n = el('div', 'cmt-item');
    const meta = el('p', 'cmt-meta');
    meta.append(el('b', null, c.nickname || '匿名罗蜜'), el('span', null, ago(c.created_at)));
    n.append(meta);
    const p = el('p', 'cmt-text');
    if (c.reply_to) p.append(el('span', 'cmt-to', `回复 @${c.reply_to}：`));
    p.append(document.createTextNode(c.content));
    n.append(p);

    const act = el('div', 'cmt-act');
    const like = el('button', 'cmt-like' + (liked ? ' on' : ''), `${liked ? '♥' : '♡'} ${c.like_count || ''}`.trim());
    like.type = 'button';
    like.addEventListener('click', async () => {
      like.disabled = true;
      const { data, error } = await supabase.rpc('like_comment', { p_id: c.id, p_liker: liker() });
      like.disabled = false;
      if (error) { msg.textContent = niceError(error); return; }
      const m = readJson(LS_LIKED);
      if (m[c.id]) delete m[c.id]; else m[c.id] = 1;
      writeJson(LS_LIKED, m);
      c.like_count = data;
      const on = !!m[c.id];
      like.classList.toggle('on', on);
      like.textContent = `${on ? '♥' : '♡'} ${data || ''}`.trim();
    });
    const rep = el('button', 'cmt-rep', '回复');
    rep.type = 'button';
    rep.addEventListener('click', () => openReply(n, c));
    act.append(like, rep);
    if (mine) {
      const del = el('button', 'cmt-del', '删除');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('删掉这条评论？' + (top ? '' : '下面的回复也会一起删掉'))) return;
        const { data, error } = await supabase.rpc('delete_my_comment', { p_id: c.id, p_token: mine });
        if (error || !data) { msg.textContent = error ? niceError(error) : '删不掉，可能已经被删了'; return; }
        state.list = state.list.filter((x) => x.id !== c.id && x.parent_id !== c.id);
        render();
      });
      act.append(del);
    }
    n.append(act);
    return n;
  }

  function openReply(anchor, c) {
    if (state.replyBox) state.replyBox.remove();
    const f = composer(c);
    anchor.after(f);
    state.replyBox = f;
    f.querySelector('textarea').focus();
  }

  function composer(replyTo) {
    const f = el('form', 'cmt-form' + (replyTo ? ' cmt-form-reply' : ''));
    const ta = el('textarea');
    ta.maxLength = 500;
    ta.rows = replyTo ? 2 : 3;
    ta.placeholder = replyTo ? `回复 @${replyTo.nickname}` : '说点什么吧（最多500字）';
    const row = el('div', 'cmt-form-row');
    const nick = el('input');
    nick.type = 'text';
    nick.maxLength = 20;
    nick.placeholder = '昵称（不填就是匿名罗蜜）';
    nick.value = localStorage.getItem(LS_NICK) || '';
    const send = el('button', 'cmt-send', replyTo ? '回复' : '发送');
    send.type = 'submit';
    row.append(nick, send);
    if (replyTo) {
      const cancel = el('button', 'cmt-cancel', '取消');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { f.remove(); state.replyBox = null; });
      row.append(cancel);
    }
    f.append(ta, row);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = ta.value.trim();
      if (!content) { msg.textContent = '先写点内容再发呀'; return; }
      send.disabled = true;
      msg.textContent = '';
      const token = uuid();
      const nickname = nick.value.trim();
      try { localStorage.setItem(LS_NICK, nickname); } catch (_) {}
      const { data: id, error } = await supabase.rpc('add_comment', {
        p_target: targetId,
        p_parent: replyTo ? replyTo.id : null,
        p_nickname: nickname,
        p_content: content,
        p_token: token,
      });
      send.disabled = false;
      if (error) { msg.textContent = niceError(error); return; }
      const t = readJson(LS_TOKENS);
      t[id] = token;
      writeJson(LS_TOKENS, t);
      ta.value = '';
      if (replyTo) { f.remove(); state.replyBox = null; }
      await load();
    });
    return f;
  }
}
