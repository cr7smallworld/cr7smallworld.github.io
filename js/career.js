// 生涯档案：时期切换
const tabs = document.querySelectorAll('.era-tab');
const contents = document.querySelectorAll('.era-content');

function showEra(era, scroll) {
  const panel = document.getElementById('era-' + era);
  if (!panel) return;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.era === era));
  contents.forEach((c) => c.classList.toggle('active', c === panel));
  const tab = document.querySelector(`.era-tab[data-era="${era}"]`);
  if (tab) tab.scrollIntoView({ block: 'nearest', inline: 'center', behavior: scroll ? 'smooth' : 'auto' });
  history.replaceState(null, '', '?era=' + era);
  updateToggleAll();
  if (scroll) {
    window.scrollTo({ top: document.querySelector('.timeline-container').offsetTop - 120, behavior: 'smooth' });
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => showEra(tab.dataset.era, true)));

// 从首页点某个时期进来，直接打开那一页
const start = new URLSearchParams(location.search).get('era');
if (start) showEra(start, false);

// 全部展开 / 全部收起
const toggleAll = document.getElementById('toggleAll');
function activeCards() {
  return document.querySelectorAll('.era-content.active .timeline-card');
}
function updateToggleAll() {
  if (!toggleAll) return;
  const cards = [...activeCards()];
  toggleAll.textContent = cards.length && cards.every((c) => c.classList.contains('open')) ? '全部收起' : '全部展开';
}
if (toggleAll) {
  toggleAll.addEventListener('click', () => {
    const cards = [...activeCards()];
    const open = !cards.every((c) => c.classList.contains('open'));
    cards.forEach((c) => c.classList.toggle('open', open));
    updateToggleAll();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.timeline-card-header')) setTimeout(updateToggleAll, 0);
  });
  updateToggleAll();
}
