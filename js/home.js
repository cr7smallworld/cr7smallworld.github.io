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
    .select('id, section, summary, event_date, image_paths')
    .eq('kind', 'upload')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) return;

  SECTIONS.forEach((sec) => {
    const box = document.getElementById('preview-' + sec);
    if (!box) return;
    const items = (data || []).filter((x) => x.section === sec).slice(0, 3);
    if (!items.length) {
      const p = el('p', 'home-empty');
      p.append('这里还空着，');
      const a = el('a', null, '来投第一条吧');
      a.href = `submit.html?kind=upload&section=${sec}`;
      p.append(a);
      box.replaceWith(p);
      return;
    }
    items.forEach((it) => {
      const a = el('a', 'hp-card');
      a.href = `${sec}.html?id=${it.id}`;
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
      b.append(el('p', 'hp-date', it.event_date || '时间未知'), el('p', 'hp-title', it.summary));
      a.append(b);
      box.append(a);
    });
  });
}
load();
