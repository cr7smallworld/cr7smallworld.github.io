// 社区共建页：贡献榜
(() => {
  const A = window.cr7Account;
  const list = document.getElementById('rankList');
  if (!A || !list) return;
  const month = () => {
    const d = new Date(Date.now() + 8 * 3600e3);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  async function show(mode) {
    document.querySelectorAll('.rank-tab').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    list.innerHTML = '<li class="rank-empty">正在加载…</li>';
    try {
      const rows = await A.rpc('contrib_board', mode === 'month' ? { p_month: month() } : {});
      list.innerHTML = '';
      if (!rows || !rows.length) {
        list.innerHTML = `<li class="rank-empty">${mode === 'month' ? '这个月还没人上榜，来当第一个考古王吧' : '还没人上榜'}</li>`;
        return;
      }
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        li.className = 'rank-row' + (i < 3 ? ' top' + (i + 1) : '');
        const no = document.createElement('span');
        no.className = 'rank-no';
        no.textContent = i + 1;
        const name = document.createElement('span');
        name.className = 'rank-name';
        name.append(window.cr7Who(r.username));
        if (i === 0 && mode === 'month') {
          const b = document.createElement('em');
          b.textContent = '本月考古王';
          name.append(b);
        }
        const n = document.createElement('span');
        n.className = 'rank-n';
        n.textContent = r.n + ' 条';
        li.append(no, name, n);
        list.append(li);
      });
    } catch (err) {
      list.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'rank-empty';
      li.textContent = err.message;
      list.append(li);
    }
  }
  document.querySelectorAll('.rank-tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.m)));
  show('month');
})();
