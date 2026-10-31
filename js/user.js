// 个人主页：谁都能看投稿；本人还能看消息和收藏
(() => {
  const A = window.cr7Account;
  const $ = (id) => document.getElementById(id);
  const IMG = 'https://ldxcrwilgvmswmbplcap.supabase.co/storage/v1/object/public/submissions/';
  const SEC = { fun: '有趣事件', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创', spicy: '🦌管素材' };
  const KIND = { supplement: '补充', correction: '纠错', person: '新人物', upload: '投稿' };
  const u = (new URLSearchParams(location.search).get('u') || '').trim();

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  const day = (t) => new Date(t).toLocaleDateString('zh-CN');
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + '分钟前';
    if (s < 86400) return Math.floor(s / 3600) + '小时前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '天前';
    return day(iso);
  };
  // 称号：按审核通过、没勾匿名的投稿条数
  const badge = (n) => (n >= 10 ? '罗学大师' : n >= 3 ? '业余考古学家' : '路过的球迷');

  function linkOf(it) {
    if (it.kind !== 'upload' && it.kind !== 'person') return 'mine.html';
    if (it.section === 'relations') return it.kind === 'person' ? `relations.html?p=${it.id}` : `relations.html?id=${it.id}`;
    return `${it.section}.html?id=${it.id}`;
  }
  const title = (it) => (it.section === 'spicy' && it.summary === '🦌' ? '🦌管素材' : it.summary);

  function itemCard(it) {
    const a = el('a', 'u-item');
    a.href = linkOf(it);
    const img = (it.image_paths || [])[0];
    if (img) {
      const i = el('img');
      i.loading = 'lazy';
      i.src = IMG + img;
      i.alt = '';
      a.append(i);
    } else a.append(el('span', 'u-noimg', '7'));
    const b = el('span', 'u-item-body');
    b.append(el('span', 'u-item-sec', (SEC[it.section] || '') + (it.kind === 'person' ? ' · 人物' : '') + (it.event_date ? ' · ' + it.event_date : '')));
    b.append(el('span', 'u-item-title', title(it)));
    a.append(b);
    return a;
  }

  function empty(box, text) { box.replaceChildren(el('p', 'u-empty', text)); }

  // ---------- 投稿 ----------
  function showItems(items, mine) {
    const box = $('pane-items');
    if (!items.length) {
      empty(box, mine ? '你还没有公开署名、审核通过的投稿。登录后投稿通过了会出现在这里（勾了匿名的不显示）' : 'TA 还没有公开的投稿');
      return;
    }
    box.replaceChildren(...items.map(itemCard));
  }

  // ---------- 消息 ----------
  function notifText(n) {
    const t = `「${title(n)}」`;
    switch (n.type) {
      case 'review':
        return n.status === 'approved'
          ? `你的${KIND[n.kind] || '投稿'}${t}通过啦`
          : `你的${KIND[n.kind] || '投稿'}${t}没有通过`;
      case 'edit_rejected': return `你对${t}的修改没有通过，网站上还是原来的版本`;
      case 'comment': return `${n.who || '匿名罗蜜'} 评论了你的投稿${t}`;
      case 'reply': return `${n.who || '匿名罗蜜'} 在${t}下面回复了你`;
      default: return t;
    }
  }
  async function loadNotif() {
    const box = $('pane-notif');
    box.replaceChildren(el('p', 'u-empty', '正在加载…'));
    try {
      const r = await A.rpc('member_notifications', { p_token: A.token() });
      if (!r) { empty(box, '登录过期了，重新登录一下'); return; }
      const seen = new Date(r.seen_at).getTime();
      if (!r.items.length) { empty(box, '还没有消息。投稿审核结果、别人评论你的投稿、回复你的评论都会出现在这里'); }
      else {
        box.replaceChildren(...r.items.map((n) => {
          const a = el('a', 'u-notif' + (new Date(n.at).getTime() > seen ? ' new' : ''));
          a.href = n.status === 'approved' ? linkOf({ id: n.sid, section: n.section, kind: n.kind }) : 'mine.html';
          const top = el('span', 'u-notif-top');
          top.append(el('span', 'u-notif-type ' + (n.type === 'review' ? n.status : n.type), n.type === 'review' ? (n.status === 'approved' ? '已通过' : '未通过') : n.type === 'edit_rejected' ? '修改未通过' : n.type === 'comment' ? '评论' : '回复'));
          top.append(el('span', 'u-notif-time', ago(n.at)));
          a.append(top, el('span', 'u-notif-text', notifText(n)));
          if (n.content) a.append(el('span', 'u-notif-quote', n.content));
          if (n.note) a.append(el('span', 'u-notif-quote', '站长说：' + n.note));
          return a;
        }));
      }
      await A.rpc('member_notif_seen', { p_token: A.token() });
      A.clearDot();
      $('notifDot').hidden = true;
    } catch (err) { empty(box, err.message); }
  }

  // ---------- 收藏 ----------
  async function loadFavs() {
    const box = $('pane-favs');
    box.replaceChildren(el('p', 'u-empty', '正在加载…'));
    try {
      const favs = await A.rpc('member_favs', { p_token: A.token() });
      if (!favs || !favs.length) { empty(box, '还没有收藏。看到喜欢的内容点一下"☆ 收藏"就会放进这里'); return; }
      const ids = favs.map((f) => f.target_id);
      const rows = [];
      for (let i = 0; i < ids.length; i += 80) {
        const part = ids.slice(i, i + 80);
        rows.push(...await A.rest(`submissions?select=id,section,kind,summary,event_date,image_paths&id=in.(${part.join(',')})`));
      }
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      const list = ids.map((id) => by[id]).filter(Boolean);
      if (!list.length) { empty(box, '收藏的内容都不在了'); return; }
      box.replaceChildren(...list.map(itemCard));
    } catch (err) { empty(box, err.message); }
  }

  function tab(name) {
    document.querySelectorAll('.u-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    ['items', 'notif', 'favs'].forEach((k) => { $('pane-' + k).hidden = k !== name; });
    if (name === 'notif') loadNotif();
    if (name === 'favs') loadFavs();
    const q = new URLSearchParams(location.search);
    if (name === 'items') q.delete('tab'); else q.set('tab', name);
    history.replaceState(null, '', '?' + q.toString());
  }

  async function start() {
    if (!u) {
      const me = A.username();
      if (me) { location.replace('user.html?u=' + encodeURIComponent(me)); return; }
      location.replace('login.html?back=user.html');
      return;
    }
    let p;
    try { p = await A.rpc('member_profile', { p_username: u }); }
    catch (err) { $('loading').textContent = err.message; return; }
    $('loading').hidden = true;
    if (!p) { $('notFound').hidden = false; return; }

    const mine = !!A.token() && (A.username() || '').toLowerCase() === p.username.toLowerCase();
    document.title = `${p.username} · CR7的小世界`;
    $('pageTitle').textContent = p.username;
    $('pageSub').textContent = mine ? '这是你的主页，别人点你的名字也能看到这里（消息和收藏只有你自己看得到）' : 'TA 在小世界里留下的东西';
    $('uAvatar').textContent = [...p.username][0];
    $('uBadge').textContent = badge(p.approved);
    $('uMeta').textContent = `${day(p.created_at)} 加入 · 通过 ${p.approved} 条投稿`;
    $('profile').hidden = false;
    showItems(p.items || [], mine);

    if (mine) {
      $('uSetting').hidden = false;
      document.querySelector('[data-tab="notif"]').hidden = false;
      document.querySelector('[data-tab="favs"]').hidden = false;
      A.notifCount().then((n) => { $('notifDot').hidden = !n; }).catch(() => {});
    }
    document.querySelectorAll('.u-tab').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    const want = new URLSearchParams(location.search).get('tab');
    if (mine && (want === 'notif' || want === 'favs')) tab(want);
  }
  start();
})();
