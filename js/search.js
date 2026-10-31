// 全站搜索：投稿内容从数据库拿，生涯档案直接读 career.html
(() => {
  const A = window.cr7Account;
  const $ = (id) => document.getElementById(id);
  const IMG = 'https://ldxcrwilgvmswmbplcap.supabase.co/storage/v1/object/public/submissions/';
  const SECS = [
    ['career', '生涯档案'], ['fun', '有趣事件'], ['relations', '人物关系'],
    ['archive', '珍贵资料库'], ['fanworks', '精彩二创'], ['spicy', '🦌管素材'],
  ];
  const SEC = Object.fromEntries(SECS);
  let all = null;
  let filter = '';

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  async function loadCareer() {
    try {
      const html = await (await fetch('career.html', { cache: 'no-cache' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const names = {};
      doc.querySelectorAll('.era-tab').forEach((t) => { names[t.dataset.era] = t.textContent.trim(); });
      const out = [];
      doc.querySelectorAll('.era-content').forEach((era) => {
        const key = era.id.replace(/^era-/, '');
        era.querySelectorAll('.timeline-item').forEach((it, i) => {
          const h = it.querySelector('h3');
          if (!h) return;
          out.push({
            sec: 'career',
            title: h.textContent.trim(),
            date: (it.querySelector('.timeline-date') || {}).textContent || '',
            text: (it.querySelector('.timeline-card-body') || {}).textContent || '',
            extra: names[key] || '',
            href: `career.html?era=${key}&i=${i}`,
            img: '',
          });
        });
      });
      return out;
    } catch (_) { return []; }
  }

  async function loadSubs() {
    const rows = await A.rest('submissions?select=id,section,kind,summary,event_date,detail,source,tags,uploader,person_role,person_alias,person_id,fanwork_type,fanwork_author,fanwork_platform,image_paths'
      + '&status=eq.approved&kind=in.(upload,person)&order=created_at.desc&limit=3000');
    const people = Object.fromEntries(rows.filter((r) => r.kind === 'person').map((r) => [r.id, r]));
    return rows.map((r) => {
      const who = r.person_id && people[r.person_id];
      const isPerson = r.kind === 'person';
      const spicyBlank = r.section === 'spicy' && r.summary === '🦌';
      return {
        sec: r.section,
        title: isPerson ? r.summary : spicyBlank ? '🦌管素材' : r.summary,
        date: isPerson ? (r.person_role || '人物') : (r.event_date || r.fanwork_type || ''),
        text: r.detail || '',
        extra: [
          who ? `咪和${who.summary} ${who.person_alias || ''}` : '',
          isPerson ? r.person_alias || '' : '',
          r.source, r.uploader, r.fanwork_author, r.fanwork_platform, (r.tags || []).join(' '),
        ].filter(Boolean).join(' '),
        lead: who ? `咪和${who.summary}` : '',
        href: r.section === 'relations' ? (isPerson ? `relations.html?p=${r.id}` : `relations.html?id=${r.id}`) : `${r.section}.html?id=${r.id}`,
        img: (r.image_paths || [])[0] ? IMG + r.image_paths[0] : (who && (who.image_paths || [])[0] ? IMG + who.image_paths[0] : ''),
      };
    });
  }

  // 把关键词标成金色
  function mark(text, words) {
    const frag = document.createDocumentFragment();
    if (!words.length) { frag.append(text); return frag; }
    const re = new RegExp('(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    text.split(re).forEach((part, i) => {
      if (!part) return;
      if (i % 2) frag.append(el('mark', null, part)); else frag.append(part);
    });
    return frag;
  }
  // 摘一段带关键词的正文
  function snippet(text, words) {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const low = t.toLowerCase();
    let at = -1;
    words.some((w) => { at = low.indexOf(w); return at >= 0; });
    if (at < 0 || t.length <= 90) return t.length > 90 ? t.slice(0, 90) + '…' : t;
    const s = Math.max(0, at - 30);
    return (s ? '…' : '') + t.slice(s, s + 90) + (s + 90 < t.length ? '…' : '');
  }

  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return { words, list: [] };
    const list = [];
    all.forEach((it) => {
      const hay = [it.title, it.date, it.text, it.extra].join(' ').toLowerCase();
      if (!words.every((w) => hay.includes(w))) return;
      const t = it.title.toLowerCase();
      const score = words.filter((w) => t.includes(w)).length * 10 + (it.sec === 'career' ? 1 : 0);
      list.push({ it, score });
    });
    list.sort((a, b) => b.score - a.score);
    return { words, list: list.map((x) => x.it) };
  }

  function render() {
    const q = $('gInput').value.trim();
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (filter) qs.set('in', filter);
    history.replaceState(null, '', qs.toString() ? '?' + qs : location.pathname);

    const box = $('gResults');
    box.replaceChildren();
    const f = $('gFilters');
    if (!q) { $('gCount').textContent = ''; f.hidden = true; return; }
    const { words, list } = search(q);
    const counts = {};
    list.forEach((x) => { counts[x.sec] = (counts[x.sec] || 0) + 1; });
    if (filter && !counts[filter]) filter = '';

    f.replaceChildren();
    const btn = (key, label, n) => {
      const b = el('button', 'g-chip' + (filter === key ? ' on' : ''), `${label} ${n}`);
      b.type = 'button';
      b.addEventListener('click', () => { filter = key; render(); });
      f.append(b);
    };
    btn('', '全部', list.length);
    SECS.forEach(([k, label]) => { if (counts[k]) btn(k, label, counts[k]); });
    f.hidden = !list.length;

    const shown = filter ? list.filter((x) => x.sec === filter) : list;
    $('gCount').textContent = list.length ? `找到 ${list.length} 条` : '';
    if (!list.length) {
      const p = el('div', 'board-state');
      p.append(el('span', 'state-mark'), el('h2', null, '没有找到'), el('p', null, '换个说法试试，比如只搜人名或者年份'));
      box.append(p);
      return;
    }
    shown.slice(0, 200).forEach((it) => {
      const a = el('a', 'g-item');
      a.href = it.href;
      if (it.img) {
        const img = el('img');
        img.loading = 'lazy';
        img.src = it.img;
        img.alt = '';
        a.append(img);
      } else a.append(el('span', 'u-noimg', '7'));
      const b = el('span', 'g-body');
      const top = el('span', 'g-sec');
      top.append(SEC[it.sec] || '');
      if (it.sec === 'career' && it.extra) top.append(' · ' + it.extra);
      if (it.lead) top.append(' · ' + it.lead);
      if (it.date) top.append(' · ' + it.date.trim());
      b.append(top);
      const t = el('span', 'g-title');
      t.append(mark(it.title, words));
      b.append(t);
      const sn = snippet(it.text, words);
      if (sn) { const s = el('span', 'g-snip'); s.append(mark(sn, words)); b.append(s); }
      a.append(b);
      box.append(a);
    });
    if (shown.length > 200) box.append(el('p', 'g-count', '只显示前200条，关键词再写具体一点'));
  }

  async function ensure() {
    if (all) return;
    $('loading').hidden = false;
    try {
      const [c, s] = await Promise.all([loadCareer(), loadSubs()]);
      all = [...c, ...s];
    } catch (err) {
      all = await loadCareer();
      $('gCount').textContent = err.message;
    }
    $('loading').hidden = true;
  }

  let timer;
  $('gInput').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { await ensure(); render(); }, 250);
  });
  $('gForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('gInput').blur();
    await ensure();
    render();
  });

  const qs = new URLSearchParams(location.search);
  $('gInput').value = qs.get('q') || '';
  filter = qs.get('in') || '';
  if ($('gInput').value) ensure().then(render);
  else { $('gInput').focus(); ensure(); }
})();
