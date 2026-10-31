// 个人中心：谁都能看公开投稿；本人还能管自己的投稿、看通知/消息/收藏
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
      case 'like': return `${n.who || '有人'} 给你在${t}下面的评论点了赞`;
      default: return t;
    }
  }
  const NOTICE_TYPES = ['review', 'edit_rejected'];
  const MSG_TYPES = ['comment', 'reply', 'like'];
  const LS_NOTICE = 'cr7_notice_seen';
  const LS_MSG = 'cr7_msg_seen';
  const lsGet = (k) => { try { return Number(localStorage.getItem(k)) || 0; } catch (_) { return 0; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch (_) {} };
  let allNotif = null;

  async function fetchNotif() {
    if (allNotif) return allNotif;
    const r = await A.rpc('member_notifications', { p_token: A.token() });
    if (!r) throw new Error('登录过期了，重新登录一下');
    allNotif = r;
    return r;
  }

  function notifCard(n, isNew) {
    const a = el('a', 'u-notif' + (isNew ? ' new' : ''));
    a.href = n.type === 'review' || n.type === 'edit_rejected'
      ? (n.status === 'approved' ? linkOf({ id: n.sid, section: n.section, kind: n.kind }) : 'user.html?tab=mine')
      : linkOf({ id: n.sid, section: n.section, kind: n.kind });
    const label = n.type === 'review' ? (n.status === 'approved' ? '已通过' : '未通过')
      : n.type === 'edit_rejected' ? '修改未通过'
      : n.type === 'comment' ? '评论'
      : n.type === 'like' ? '点赞' : '回复';
    const top = el('span', 'u-notif-top');
    top.append(el('span', 'u-notif-type ' + (n.type === 'review' ? n.status : n.type), label));
    top.append(el('span', 'u-notif-time', ago(n.at)));
    a.append(top, el('span', 'u-notif-text', notifText(n)));
    if (n.content) a.append(el('span', 'u-notif-quote', n.content));
    if (n.note) a.append(el('span', 'u-notif-quote', '站长说：' + n.note));
    return a;
  }

  // 两个标签各自算自己的小红点
  function freshCount(items, types, lsKey) {
    const seen = lsGet(lsKey);
    return items.filter((n) => types.includes(n.type) && new Date(n.at).getTime() > seen).length;
  }
  async function refreshDots() {
    try {
      const r = await fetchNotif();
      const items = r.items || [];
      // 第一次用的人没有本地记录，就拿服务端的已读时间打底
      const base = new Date(r.seen_at).getTime();
      if (!lsGet(LS_NOTICE)) lsSet(LS_NOTICE, base);
      if (!lsGet(LS_MSG)) lsSet(LS_MSG, base);
      $('noticeDot').hidden = freshCount(items, NOTICE_TYPES, LS_NOTICE) === 0;
      $('notifDot').hidden = freshCount(items, MSG_TYPES, LS_MSG) === 0;
      if ($('noticeDot').hidden && $('notifDot').hidden) {
        A.rpc('member_notif_seen', { p_token: A.token() }).catch(() => {});
        A.clearDot();
      }
    } catch (_) {}
  }

  async function loadPane(kind) {
    const isNotice = kind === 'notice';
    const box = $('pane-' + (isNotice ? 'notice' : 'notif'));
    const types = isNotice ? NOTICE_TYPES : MSG_TYPES;
    const lsKey = isNotice ? LS_NOTICE : LS_MSG;
    box.replaceChildren(el('p', 'u-empty', '正在加载…'));
    try {
      const r = await fetchNotif();
      const seen = lsGet(lsKey);
      const items = (r.items || []).filter((n) => types.includes(n.type));
      if (!items.length) {
        empty(box, isNotice
          ? '还没有通知。投稿审核过了、站长给你写了意见，都会出现在这里'
          : '还没有消息。别人评论你的投稿、回复你的评论、给你的评论点赞，都会出现在这里');
      } else {
        box.replaceChildren(...items.map((n) => notifCard(n, new Date(n.at).getTime() > seen)));
      }
      lsSet(lsKey, Date.now());
      $(isNotice ? 'noticeDot' : 'notifDot').hidden = true;
      if ($('noticeDot').hidden && $('notifDot').hidden) {
        await A.rpc('member_notif_seen', { p_token: A.token() }).catch(() => {});
        A.clearDot();
      }
    } catch (err) { empty(box, err.message); }
  }

  // ---------- 我的投稿（自己管理：含匿名、含待审、能改） ----------
  const ST = { pending: '审核中', approved: '已通过', rejected: '未通过' };
  function mineCard(it) {
    const c = el('article', 'u-sub');
    const head = el('div', 'u-sub-head');
    head.append(el('span', 'u-sub-badge ' + it.status, ST[it.status] || it.status));
    head.append(el('span', 'u-sub-kind', KIND[it.kind] || '投稿'));
    head.append(el('span', 'u-sub-sec', SEC[it.section] || ''));
    if (it.is_anon) head.append(el('span', 'u-sub-anon', '匿名'));
    head.append(el('span', 'u-sub-time', day(it.created_at)));
    c.append(head);
    c.append(el('h3', 'u-sub-title', title(it)));
    if (it.status === 'pending') c.append(el('p', 'u-sub-note', '站长还没审到这条，等一等'));
    else {
      const note = el('p', 'u-sub-note ' + it.status);
      note.append(el('b', null, it.status === 'approved' ? '站长说：' : '没通过的原因：'));
      note.append(document.createTextNode(it.review_note || (it.status === 'approved' ? '已收录，谢谢你！' : '站长没有写原因')));
      c.append(note);
    }
    const ed = it.last_edit;
    if (ed && it.status === 'approved') {
      const n = el('p', 'u-sub-note edit ' + ed.status);
      if (ed.status === 'pending') n.textContent = '你交的修改还在等站长审核，网站上暂时显示的是旧版';
      else if (ed.status === 'approved') n.textContent = '你交的修改已经通过，网站上是新版了';
      else { n.append(el('b', null, '修改没通过：')); n.append(document.createTextNode(ed.review_note || '站长没有写原因')); }
      c.append(n);
    }
    const links = el('div', 'u-sub-links');
    if (it.status === 'approved' && (it.kind === 'upload' || it.kind === 'person')) {
      const a = el('a', 'u-sub-link', '去网站上看看 →');
      a.href = linkOf(it);
      links.append(a);
    }
    if (it.kind === 'upload' || it.kind === 'person') {
      const e2 = el('a', 'u-sub-link edit', '✎ 修改');
      e2.href = `submit.html?edit=${it.id}`;
      e2.addEventListener('click', () => { try { sessionStorage.setItem('cr7_edit_token_' + it.id, it.token); } catch (_) {} });
      links.append(e2);
    }
    if (links.children.length) c.append(links);
    return c;
  }
  async function loadMine() {
    const box = $('pane-mine');
    box.replaceChildren(el('p', 'u-empty', '正在加载…'));
    try {
      const list = await A.rpc('member_my_all', { p_token: A.token() });
      if (!list || !list.length) {
        empty(box, '你还没有用这个账号投过稿。登录以后投的稿会全部记在这里，换手机也找得回来');
        return;
      }
      const named = list.filter((x) => !x.is_anon);
      const anon = list.filter((x) => x.is_anon);
      box.replaceChildren();
      const group = (t, arr, tip) => {
        if (!arr.length) return;
        box.append(el('h3', 'u-group', `${t}（${arr.length}）`));
        if (tip) box.append(el('p', 'u-group-tip', tip));
        arr.forEach((it) => box.append(mineCard(it)));
      };
      group('署名投稿', named, '这些会显示你的用户名，也会出现在上面的「投稿」里和贡献榜上');
      group('匿名投稿', anon, '这些在网站上显示「匿名罗蜜」，不进你的公开主页也不上贡献榜，但抽卡机会照样算');
      const tail = el('p', 'u-group-tip', '想改哪条点「✎ 修改」，改完要站长再审一遍，审过之前网站上还是旧版');
      box.append(tail);
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
    ['items', 'mine', 'notice', 'notif', 'favs'].forEach((k) => { $('pane-' + k).hidden = k !== name; });
    if (name === 'mine') loadMine();
    if (name === 'notice') loadPane('notice');
    if (name === 'notif') loadPane('notif');
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
      ['mine', 'notice', 'notif', 'favs'].forEach((k) => { document.querySelector(`[data-tab="${k}"]`).hidden = false; });
      refreshDots();
    }
    document.querySelectorAll('.u-tab').forEach((b) => b.addEventListener('click', () => tab(b.dataset.tab)));
    const want = new URLSearchParams(location.search).get('tab');
    if (mine && ['mine', 'notice', 'notif', 'favs'].includes(want)) tab(want);
  }
  start();
})();
