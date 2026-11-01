// 大图浏览器：一条投稿里的多张图，左右滑动看上一张下一张
// 用法：openLightbox(['url1','url2'], 从第几张开始)
// 手机：左右滑动切换，往下拉关掉
// 电脑：左右两侧箭头，键盘←→切换，Esc关掉

let box = null;
let track = null;
let dots = null;
let counter = null;
let urls = [];
let cur = 0;

function build() {
  box = document.createElement('div');
  box.className = 'lb';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', '查看大图');
  box.innerHTML = `
    <button type="button" class="lb-x" aria-label="关掉">×</button>
    <span class="lb-n" aria-hidden="true"></span>
    <button type="button" class="lb-arrow prev" aria-label="上一张">‹</button>
    <button type="button" class="lb-arrow next" aria-label="下一张">›</button>
    <div class="lb-track"></div>
    <div class="lb-dots" aria-hidden="true"></div>`;
  track = box.querySelector('.lb-track');
  dots = box.querySelector('.lb-dots');
  counter = box.querySelector('.lb-n');

  box.querySelector('.lb-x').addEventListener('click', close);
  box.querySelector('.prev').addEventListener('click', () => go(cur - 1));
  box.querySelector('.next').addEventListener('click', () => go(cur + 1));
  // 点黑色底色关掉，点图片本身不关
  box.addEventListener('click', (e) => { if (e.target === box || e.target === track) close(); });

  bindSwipe();
  document.body.append(box);
}

function render() {
  track.innerHTML = '';
  dots.innerHTML = '';
  urls.forEach((u, i) => {
    const cell = document.createElement('div');
    cell.className = 'lb-cell';
    const img = document.createElement('img');
    img.src = u;
    img.alt = `第${i + 1}张`;
    img.draggable = false;
    cell.append(img);
    track.append(cell);

    if (urls.length > 1) {
      const d = document.createElement('span');
      d.className = 'lb-dot';
      dots.append(d);
    }
  });
  box.classList.toggle('one', urls.length <= 1);
}

function paint(animate) {
  track.style.transition = animate ? 'transform 0.28s cubic-bezier(.22,.61,.36,1)' : 'none';
  track.style.transform = `translate3d(${-cur * 100}%, 0, 0)`;
  counter.textContent = urls.length > 1 ? `${cur + 1} / ${urls.length}` : '';
  [...dots.children].forEach((d, i) => d.classList.toggle('on', i === cur));
  box.querySelector('.prev').disabled = cur === 0;
  box.querySelector('.next').disabled = cur === urls.length - 1;
}

function go(i) {
  if (i < 0 || i > urls.length - 1) return;
  cur = i;
  paint(true);
}

// ---------- 手指滑动 ----------
function bindSwipe() {
  let x0 = 0, y0 = 0, dx = 0, dy = 0, dir = '', down = false;

  const start = (x, y) => { x0 = x; y0 = y; dx = dy = 0; dir = ''; down = true; track.style.transition = 'none'; };
  const move = (x, y, ev) => {
    if (!down) return;
    dx = x - x0; dy = y - y0;
    if (!dir) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      else return;
    }
    if (dir === 'x') {
      if (ev && ev.cancelable) ev.preventDefault();
      let move = dx;
      // 第一张往右拉、最后一张往左拉，拉不动那么多（有阻力）
      if ((cur === 0 && dx > 0) || (cur === urls.length - 1 && dx < 0)) move = dx * 0.32;
      track.style.transform = `translate3d(calc(${-cur * 100}% + ${move}px), 0, 0)`;
    } else {
      // 往下拉关掉
      box.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy) / 420));
    }
  };
  const end = () => {
    if (!down) return;
    down = false;
    box.style.opacity = '';
    if (dir === 'y' && Math.abs(dy) > 110) return close();
    if (dir === 'x') {
      const need = Math.min(70, window.innerWidth * 0.16);
      if (dx < -need) return go(cur + 1);
      if (dx > need) return go(cur - 1);
    }
    paint(true);
  };

  track.addEventListener('touchstart', (e) => start(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  track.addEventListener('touchmove', (e) => move(e.touches[0].clientX, e.touches[0].clientY, e), { passive: false });
  track.addEventListener('touchend', end);
  track.addEventListener('touchcancel', end);

  track.addEventListener('mousedown', (e) => { e.preventDefault(); start(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e) => { if (down) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', end);
}

function onKey(e) {
  if (!box || !box.classList.contains('open')) return;
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowLeft') go(cur - 1);
  else if (e.key === 'ArrowRight') go(cur + 1);
}

export function openLightbox(list, index = 0) {
  urls = (list || []).filter(Boolean);
  if (!urls.length) return;
  if (!box) build();
  cur = Math.min(Math.max(0, index), urls.length - 1);
  render();
  paint(false);
  box.classList.add('open');
  document.documentElement.classList.add('lb-lock');
  document.addEventListener('keydown', onKey);
}

export function close() {
  if (!box) return;
  box.classList.remove('open');
  box.style.opacity = '';
  document.documentElement.classList.remove('lb-lock');
  document.removeEventListener('keydown', onKey);
}

// 给没用 import 的页面留一个全局入口
window.cr7Lightbox = openLightbox;
