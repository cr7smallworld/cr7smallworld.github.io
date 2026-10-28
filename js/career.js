// Tab切换
const tabs = document.querySelectorAll('.era-tab');
const contents = document.querySelectorAll('.era-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const era = tab.dataset.era;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    contents.forEach(c => c.classList.remove('active'));
    document.getElementById('era-' + era).classList.add('active');

    window.scrollTo({ top: document.querySelector('.timeline-container').offsetTop - 120, behavior: 'smooth' });
  });
});