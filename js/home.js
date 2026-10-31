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

// ===== 站长公告 =====
(async function loadAnnouncements() {
  const bar = document.getElementById('announcementBar');
  if (!bar) return;
  const dismissed = (() => { try { return JSON.parse(localStorage.getItem('cr7_ann_dismissed') || '[]'); } catch (_) { return []; } })();
  const { data, error } = await supabase.from('announcements').select('id, content, created_at, is_active').order('sort_order', { ascending: false }).order('created_at', { ascending: false }).limit(50);
  if (error || !data || !data.length) return;
  const active = data.filter(a => a.is_active);
  const visible = active.filter(a => !dismissed.includes(a.id));
  if (visible.length) bar.hidden = false;
  visible.forEach(a => {
    const div = document.createElement('div');
    div.className = 'ann-item';
    const d = new Date(a.created_at);
    const ts = `${d.getMonth() + 1}.${d.getDate()}`;
    div.innerHTML = `<span class="ann-icon">📢</span><div class="ann-text">${esc(a.content)}<span class="ann-time">${ts}</span></div><button class="ann-close" title="关掉这条公告" aria-label="关闭">&times;</button>`;
    div.querySelector('.ann-close').addEventListener('click', () => {
      dismissed.push(a.id);
      try { localStorage.setItem('cr7_ann_dismissed', JSON.stringify(dismissed)); } catch (_) {}
      div.remove();
      if (!bar.querySelector('.ann-item, .ann-history')) bar.hidden = true;
    });
    bar.append(div);
  });
  if (active.length) {
    bar.hidden = false;
    const det = document.createElement('details');
    det.className = 'ann-history';
    const sum = document.createElement('summary');
    sum.textContent = '历史公告（' + active.length + '）';
    det.append(sum);
    const sorted = active.slice().sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    sorted.forEach(a => {
      const row = document.createElement('div');
      row.className = 'ann-history-item';
      const d = new Date(a.created_at);
      const pad = (n) => String(n).padStart(2, '0');
      const ts = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
      row.innerHTML = '<span class="ann-history-date">' + ts + '</span><span class="ann-history-text">' + esc(a.content) + '</span>';
      det.append(row);
    });
    bar.append(det);
  }
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
})();
