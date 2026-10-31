// 手机端导航切换
const toggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');

if (toggle && navLinks) {
  toggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
    });
  });
}

// 导航栏滚动时加阴影
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      nav.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
    } else {
      nav.style.boxShadow = 'none';
    }
  });
}
// 导航里标出当前所在的页面
const here = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a').forEach((a) => {
  if (a.getAttribute('href') === here) a.classList.add('active');
});

// 手机菜单按钮：展开时变成 ×
if (toggle && navLinks) {
  const sync = () => toggle.classList.toggle('open', navLinks.classList.contains('active'));
  toggle.addEventListener('click', sync);
  navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', sync));
}

// 滚动到才出现的淡入效果
(() => {
  const targets = document.querySelectorAll('.section-inner, .honor-block, .big-stat, .info-block, .community-btn');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((t) => { t.classList.add('reveal'); io.observe(t); });
})();

// 回到顶部
(() => {
  const btn = document.createElement('button');
  btn.className = 'to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', '回到顶部');
  btn.textContent = '↑';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.append(btn);
  const onScroll = () => btn.classList.toggle('show', window.scrollY > 600);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// ---------- 网友账号（用户名+密码）：全站共用 ----------
// 登录口令存在浏览器里，下次打开自动登录；导航最右边显示"登录"或用户名
window.cr7Account = (() => {
  const API = 'https://ldxcrwilgvmswmbplcap.supabase.co/rest/v1/rpc/';
  const KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
  const LS_TOKEN = 'cr7_member_token';
  const LS_NAME = 'cr7_member_name';
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} };

  async function rpc(fn, body) {
    let res;
    try {
      res = await fetch(API + fn, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (_) {
      throw new Error('网络好像断了一下，换个网络再试试');
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) {}
    if (!res.ok) {
      const m = (data && data.message) || '';
      throw new Error(/[\u4e00-\u9fa5]/.test(m) ? m : '出了点问题，稍后再试一次');
    }
    return data;
  }

  function save(r) {
    if (!r || r.error) throw new Error((r && r.error) || '出了点问题，稍后再试一次');
    set(LS_TOKEN, r.token);
    set(LS_NAME, r.username);
    refreshNav();
    return r;
  }

  const register = async (username, password) => save(await rpc('member_register', { p_username: username, p_password: password }));
  const login = async (username, password) => save(await rpc('member_login', { p_username: username, p_password: password }));

  async function me() {
    const token = get(LS_TOKEN);
    if (!token) return null;
    const r = await rpc('member_me', { p_token: token });
    if (!r) { set(LS_TOKEN, null); set(LS_NAME, null); refreshNav(); return null; }
    if (r.username !== get(LS_NAME)) { set(LS_NAME, r.username); refreshNav(); }
    return r;
  }

  async function logout() {
    const token = get(LS_TOKEN);
    set(LS_TOKEN, null);
    set(LS_NAME, null);
    refreshNav();
    if (token) { try { await rpc('member_logout', { p_token: token }); } catch (_) {} }
  }

  // 读公开数据（只能读到审核通过的）
  async function rest(path) {
    let res;
    try { res = await fetch(API.replace('/rpc/', '/') + path, { headers: { apikey: KEY } }); }
    catch (_) { throw new Error('网络好像断了一下，换个网络再试试'); }
    if (!res.ok) throw new Error('出了点问题，稍后再试一次');
    return res.json();
  }

  // ---------- 消息小红点 ----------
  const LS_DOT = 'cr7_member_dot';
  async function notifCount() {
    const token = get(LS_TOKEN);
    if (!token) return 0;
    const n = (await rpc('member_notif_count', { p_token: token })) || 0;
    set(LS_DOT, String(n));
    refreshNav();
    return n;
  }
  function clearDot() { set(LS_DOT, '0'); refreshNav(); }

  // ---------- 收藏 ----------
  let favCache = null;
  function favs() {
    const token = get(LS_TOKEN);
    if (!token) return Promise.resolve(new Set());
    if (!favCache) {
      favCache = rpc('member_favs', { p_token: token })
        .then((r) => new Set((r || []).map((x) => x.target_id)))
        .catch(() => { favCache = null; return new Set(); });
    }
    return favCache;
  }
  async function toggleFav(id) {
    const token = get(LS_TOKEN);
    if (!token) {
      location.href = 'login.html?back=' + encodeURIComponent((location.pathname.split('/').pop() || 'index.html') + location.search);
      return null;
    }
    const on = await rpc('member_fav_toggle', { p_token: token, p_target: id });
    const s = await favs();
    if (on) s.add(id); else s.delete(id);
    return on;
  }
  // 收藏按钮：传一个 button 进来，自动显示状态、点了切换
  function favButton(btn, id) {
    const paint = (on) => { btn.textContent = on ? '★ 已收藏' : '☆ 收藏'; btn.classList.toggle('on', on); };
    paint(false);
    favs().then((s) => paint(s.has(id)));
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      try { const on = await toggleFav(id); if (on != null) paint(on); }
      catch (err) { alert(err.message); }
      finally { btn.disabled = false; }
    });
    return btn;
  }

  function refreshNav() {
    const name = get(LS_NAME);
    const dot = name && Number(get(LS_DOT) || 0) > 0;
    document.querySelectorAll('.nav-account').forEach((a) => {
      a.textContent = name ? '👤 ' + name : '登录';
      a.title = name ? '我的主页' : '登录 / 注册';
      a.href = name ? 'user.html?u=' + encodeURIComponent(name) : 'login.html';
      if (dot) {
        const d = document.createElement('span');
        d.className = 'nav-dot';
        d.setAttribute('aria-label', '有新消息');
        a.append(d);
      }
    });
    const t = document.querySelector('.nav-toggle');
    if (t) t.classList.toggle('has-dot', !!dot);
  }

  // 导航里没有账号入口的页面自动补一个
  document.querySelectorAll('.nav-links').forEach((ul) => {
    if (ul.querySelector('.nav-account')) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = 'login.html';
    a.className = 'nav-account';
    if (here === 'login.html') a.classList.add('active');
    li.append(a);
    ul.append(li);
  });
  refreshNav();
  // 后台悄悄核对一下口令还有没有效，顺便看看有没有新消息
  if (get(LS_TOKEN)) me().then((m) => { if (m) notifCount().catch(() => {}); }).catch(() => {});

  return {
    register, login, logout, me, refreshNav, rpc, rest, notifCount, clearDot, favs, toggleFav, favButton,
    token: () => get(LS_TOKEN), username: () => get(LS_NAME),
  };
})();

// 导航里加"搜索"入口（放在登录前面）
document.querySelectorAll('.nav-links').forEach((ul) => {
  if (ul.querySelector('.nav-search')) return;
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = 'search.html';
  a.className = 'nav-search';
  a.textContent = '搜索';
  if (here === 'search.html') a.classList.add('active');
  li.append(a);
  const acc = ul.querySelector('.nav-account');
  ul.insertBefore(li, acc ? acc.closest('li') : null);
});

// 投稿人的名字：登录投稿的能点进个人主页
window.cr7Who = (name, fallback) => {
  if (!name) return document.createTextNode(fallback || '匿名');
  const a = document.createElement('a');
  a.className = 'who-link';
  a.href = 'user.html?u=' + encodeURIComponent(name);
  a.textContent = name;
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
};

// ===== 全站公告🔔 =====
(function initAnnBell() {
  var navInner = document.querySelector('.nav-inner');
  if (!navInner) return;
  var LS_ANN = 'cr7_announcements';
  var LS_DISMISSED = 'cr7_ann_dismissed2';
  function getDismissed() { try { return JSON.parse(localStorage.getItem(LS_DISMISSED) || '[]'); } catch (_) { return []; } }
  function getAnns() { try { return JSON.parse(localStorage.getItem(LS_ANN) || '[]'); } catch (_) { return []; } }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtDate(t) { var d = new Date(t); return d.getFullYear() + '.' + pad(d.getMonth()+1) + '.' + pad(d.getDate()); }

  // 🔔按钮
  var bell = document.createElement('button');
  bell.className = 'ann-bell'; bell.innerHTML = '🔔'; bell.title = '公告';
  bell.setAttribute('aria-label', '公告');
  var dot = document.createElement('span'); dot.className = 'ann-bell-dot'; dot.hidden = true;
  bell.append(dot);
  // 🔔插在三横杠左边，导航栏位置不变
  var toggle = navInner.querySelector('.nav-toggle');
  if (toggle) toggle.parentNode.insertBefore(bell, toggle);
  else navInner.append(bell);

  // 面板
  var panel = document.createElement('div'); panel.className = 'ann-panel'; panel.hidden = true;
  panel.innerHTML = '<div class="ann-panel-header"><span>\ud83d\udce2 \u7ad9\u957f\u516c\u544a</span><button class="ann-panel-close" aria-label="\u5173\u95ed">&times;</button></div><div class="ann-panel-body"></div>';
  document.body.append(panel);
  var overlay = document.createElement('div'); overlay.className = 'ann-overlay'; overlay.hidden = true;
  document.body.append(overlay);

  function updateDot() {
    var dismissed = getDismissed(), anns = getAnns();
    dot.hidden = anns.filter(function(a) { return dismissed.indexOf(a.id) === -1; }).length === 0;
  }
  function renderPanel() {
    var body = panel.querySelector('.ann-panel-body'), anns = getAnns();
    body.innerHTML = '';
    if (!anns.length) { body.innerHTML = '<p class="ann-panel-empty">\u6682\u65f6\u6ca1\u6709\u516c\u544a</p>'; return; }
    anns.forEach(function(a) {
      var item = document.createElement('div'); item.className = 'ann-panel-item';
      item.innerHTML = '<div class="ann-panel-date">' + fmtDate(a.created_at) + '</div><div class="ann-panel-text">' + esc(a.content) + '</div>';
      body.append(item);
    });
  }
  function openPanel() {
    renderPanel(); panel.hidden = false; overlay.hidden = false;
    var anns = getAnns(), dismissed = getDismissed();
    anns.forEach(function(a) { if (dismissed.indexOf(a.id) === -1) dismissed.push(a.id); });
    try { localStorage.setItem(LS_DISMISSED, JSON.stringify(dismissed)); } catch (_) {}
    dot.hidden = true;
  }
  function closePanel() { panel.hidden = true; overlay.hidden = true; }
  bell.addEventListener('click', function(e) { e.stopPropagation(); panel.hidden ? openPanel() : closePanel(); });
  panel.querySelector('.ann-panel-close').addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);

  // 首页弹窗
  function showPopup(items, dismissed) {
    var pop = document.createElement('div'); pop.className = 'ann-popup-overlay';
    var box = document.createElement('div'); box.className = 'ann-popup';
    box.innerHTML = '<div class="ann-popup-header"><span>\ud83d\udce2 \u7ad9\u957f\u516c\u544a</span><button class="ann-popup-close" aria-label="\u5173\u95ed">&times;</button></div><div class="ann-popup-body"></div>';
    var bd = box.querySelector('.ann-popup-body');
    items.forEach(function(a) {
      var row = document.createElement('div'); row.className = 'ann-popup-item';
      row.innerHTML = '<span class="ann-popup-date">' + pad(new Date(a.created_at).getMonth()+1) + '.' + pad(new Date(a.created_at).getDate()) + '</span><span>' + esc(a.content) + '</span>';
      bd.append(row);
    });
    pop.append(box); document.body.append(pop);
    function close() {
      items.forEach(function(a) { if (dismissed.indexOf(a.id) === -1) dismissed.push(a.id); });
      try { localStorage.setItem(LS_DISMISSED, JSON.stringify(dismissed)); } catch (_) {}
      pop.remove(); dot.hidden = true;
    }
    box.querySelector('.ann-popup-close').addEventListener('click', close);
    pop.addEventListener('click', function(e) { if (e.target === pop) close(); });
  }

  // 如果有supabase，拉公告更新缓存
  function fetchAnns() {
    if (!window.supabase || !window.cr7Account) return Promise.resolve();
    return window.cr7Account.rest('announcements?is_active=eq.true&order=sort_order.desc,created_at.desc&limit=50').then(function(data) {
      if (!data) return;
      var list = data.map(function(a) { return { id: a.id, content: a.content, created_at: a.created_at }; });
      try { localStorage.setItem(LS_ANN, JSON.stringify(list)); } catch (_) {}
      updateDot();
      // 首页弹窗
      var isHome = location.pathname === '/' || location.pathname.endsWith('/index.html') || location.pathname.endsWith('index.html') || location.pathname.split('/').pop() === '' || location.pathname.split('/').pop() === 'index.html';
      if (isHome) {
        var dismissed = getDismissed();
        var unseen = list.filter(function(a) { return dismissed.indexOf(a.id) === -1; });
        if (unseen.length) showPopup(unseen, dismissed);
      }
    }).catch(function() {});
  }

  updateDot();
  // 延迟一下等cr7Account初始化完
  setTimeout(fetchAnns, 800);
})();
