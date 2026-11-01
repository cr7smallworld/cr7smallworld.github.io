// 首页：每个开放板块显示最新3条审核通过的投稿
const supabase = window.supabase.createClient(
  'https://ldxcrwilgvmswmbplcap.supabase.co',
  'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87',
);
const SECTIONS = ['fun', 'relations', 'archive', 'fanworks'];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function load() {
  const { data, error } = await supabase
    .from('submissions')
    .select('id, kind, section, summary, event_date, image_paths, person_role')
    .in('kind', ['upload', 'person'])
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) return;

  SECTIONS.forEach((sec) => {
    const box = document.getElementById('preview-' + sec);
    if (!box) return;
    // 人物关系板块首页放最新收录的人物，其他板块放最新投稿
    const items = (data || []).filter((x) => x.section === sec && (sec === 'relations' ? x.kind === 'person' : x.kind === 'upload')).slice(0, 3);
    if (!items.length) {
      const p = el('p', 'home-empty');
      p.append('这里还空着，');
      const a = el('a', null, '来投第一条吧');
      a.href = `submit.html?kind=upload&section=${sec}${sec === 'relations' ? '&rel=person' : ''}`;
      p.append(a);
      box.replaceWith(p);
      return;
    }
    items.forEach((it) => {
      const a = el('a', 'hp-card');
      a.href = sec === 'relations' ? `relations.html?p=${it.id}` : `${sec}.html?id=${it.id}`;
      if (it.image_paths && it.image_paths.length) {
        const w = el('div', 'hp-img');
        const img = el('img');
        img.loading = 'lazy';
        img.alt = it.summary;
        img.src = supabase.storage.from('submissions').getPublicUrl(it.image_paths[0]).data.publicUrl;
        w.append(img);
        a.append(w);
      } else {
        a.append(el('div', 'hp-noimg', '7'));
      }
      const b = el('div', 'hp-body');
      b.append(el('p', 'hp-date', it.kind === 'person' ? (it.person_role || '人物') : (it.event_date || '时间未知')), el('p', 'hp-title', it.summary));
      a.append(b);
      box.append(a);
    });
  });
}
load();

// 首页最底下：C罗生日倒计时（按北京时间算）
function birthday() {
  const box = document.getElementById('bdayCard');
  if (!box) return;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).split('-').map(Number);
  const today = Date.UTC(p[0], p[1] - 1, p[2]);
  let year = p[0];
  if (p[1] > 2 || (p[1] === 2 && p[2] > 5)) year += 1;
  const days = Math.round((Date.UTC(year, 1, 5) - today) / 86400000);
  const age = year - 1985;
  if (days === 0) {
    box.classList.add('today');
    document.getElementById('bdayMain').textContent = `今天是C罗${age}岁生日 🎂`;
    document.getElementById('bdaySub').textContent = '生日快乐，克里斯蒂亚诺';
  } else {
    document.getElementById('bdayMain').innerHTML = `距离C罗${age}岁生日还有 <b>${days}</b> 天`;
  }
}
birthday();

// 首页进球档案预览：最近3个进球
(function goalsPreview() {
  const box = document.getElementById('preview-goals');
  if (!box || !window.CR7_GOALS) return;
  const ZH = window.CR7_ZH || { team: {}, comp: {} };
  const SHORT = { 'Real Madrid': '皇马', Portugal: '葡萄牙', 'Manchester United': '曼联', 'Al Nassr': '利雅得胜利', Juventus: '尤文', 'Sporting CP': '葡萄牙体育' };
  const TYPE = { right: '右脚', left: '左脚', head: '头球', other: '其他' };
  const G = window.CR7_GOALS;
  const latest = G.slice(-3).reverse();
  latest.forEach(function(r) {
    var n=r[0], date=r[1], team=r[2], opp=r[3], gf=r[4], ga=r[5], comp=r[6], min=r[9], type=r[10];
    var a = document.createElement('a');
    a.className = 'hp-card';
    a.href = 'goals.html?n=' + n;
    var noimg = document.createElement('div');
    noimg.className = 'hp-noimg';
    noimg.textContent = n;
    a.appendChild(noimg);
    var b = document.createElement('div');
    b.className = 'hp-body';
    var p1 = document.createElement('p');
    p1.className = 'hp-date';
    p1.textContent = (ZH.comp[comp] || comp) + ' · ' + (TYPE[type] || '') + ' · ' + date.replace(/-/g, '.');
    var p2 = document.createElement('p');
    p2.className = 'hp-title';
    p2.textContent = (SHORT[team] || team) + ' ' + gf + '-' + ga + ' ' + (ZH.team[opp] || opp);
    b.appendChild(p1);
    b.appendChild(p2);
    a.appendChild(b);
    box.appendChild(a);
  });
})();
