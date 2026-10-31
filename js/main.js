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

  function refreshNav() {
    const name = get(LS_NAME);
    document.querySelectorAll('.nav-account').forEach((a) => {
      a.textContent = name ? '👤 ' + name : '登录';
      a.title = name ? '我的账号' : '登录 / 注册';
    });
  }

  // 导航里没有账号入口的页面自动补一个
  document.querySelectorAll('.nav-links').forEach((ul) => {
    if (ul.querySelector('.nav-account')) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = 'login.html';
    a.className = 'nav-account';
    li.append(a);
    ul.append(li);
  });
  refreshNav();
  // 后台悄悄核对一下口令还有没有效
  if (get(LS_TOKEN)) me().catch(() => {});

  return { register, login, logout, me, refreshNav, token: () => get(LS_TOKEN), username: () => get(LS_NAME) };
})();
