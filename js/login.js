// 登录 / 注册页：用户名 + 密码，账号工具在 main.js 的 window.cr7Account 里
(() => {
  const A = window.cr7Account;
  const $ = (id) => document.getElementById(id);
  let mode = 'login';

  const showMsg = (id, text, type = '') => {
    $(id).textContent = text;
    $(id).className = 'form-msg' + (type ? ' ' + type : '');
  };

  // 从别的页面跳过来登录的，登完回去
  const back = (() => {
    const r = new URLSearchParams(location.search).get('back') || '';
    return /^[a-z]+\.html([?#].*)?$/i.test(r) ? r : '';
  })();

  function setMode(m) {
    mode = m;
    const reg = m === 'register';
    document.querySelectorAll('.acct-tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === m));
    $('acctTitle').textContent = reg ? '注册' : '登录';
    $('acctBtn').textContent = reg ? '注册并登录' : '登录';
    $('pass2Field').hidden = !reg;
    $('nameHint').hidden = !reg;
    $('passHint').hidden = !reg;
    $('acctPass').autocomplete = reg ? 'new-password' : 'current-password';
    $('acctSwitch').innerHTML = reg
      ? '已经有账号了？<a href="#" data-go="login">去登录</a>'
      : '还没有账号？<a href="#" data-go="register">注册一个</a>';
    showMsg('acctMsg', '');
  }

  document.querySelectorAll('.acct-tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  $('acctSwitch').addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); setMode(a.dataset.go); }
  });
  document.querySelectorAll('.pass-eye').forEach((b) => b.addEventListener('click', () => {
    const inp = $(b.dataset.for);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.textContent = show ? '隐藏' : '显示';
  }));

  function showIn(me) {
    $('acctOut').hidden = true;
    $('acctIn').hidden = false;
    $('meName').textContent = me.username;
    $('meSince').textContent = me.created_at ? new Date(me.created_at).toLocaleDateString('zh-CN') : '';
  }
  function showOut() {
    $('acctIn').hidden = true;
    $('acctOut').hidden = false;
    setMode(new URLSearchParams(location.search).get('mode') === 'register' ? 'register' : 'login');
  }

  $('acctForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('acctName').value.trim();
    const pass = $('acctPass').value;
    if (!name) return showMsg('acctMsg', '先填用户名', 'error');
    if (!pass) return showMsg('acctMsg', '先填密码', 'error');
    if (mode === 'register') {
      if (!/^[A-Za-z0-9_\u4e00-\u9fa5]{2,16}$/.test(name)) return showMsg('acctMsg', '用户名要2到16个字，只能用中文、字母、数字和下划线', 'error');
      if (pass.length < 6) return showMsg('acctMsg', '密码至少6位', 'error');
      if (pass !== $('acctPass2').value) return showMsg('acctMsg', '两次密码不一样，再看看', 'error');
    }
    $('acctBtn').disabled = true;
    showMsg('acctMsg', mode === 'register' ? '注册中…' : '登录中…');
    try {
      const me = mode === 'register' ? await A.register(name, pass) : await A.login(name, pass);
      showMsg('acctMsg', mode === 'register' ? '注册成功，欢迎你！' : '登录成功');
      if (back) { location.href = back; return; }
      showIn({ username: me.username, created_at: new Date().toISOString() });
      A.refreshNav();
      A.me().then((m) => m && showIn(m));
    } catch (err) {
      showMsg('acctMsg', err.message, 'error');
    } finally {
      $('acctBtn').disabled = false;
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    $('logoutBtn').disabled = true;
    await A.logout();
    $('logoutBtn').disabled = false;
    $('acctPass').value = '';
    $('acctPass2').value = '';
    showOut();
  });

  A.me().then((me) => (me ? showIn(me) : showOut())).catch(() => showOut());
})();
