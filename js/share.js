// 一键生成分享图：竖版卡片，网址印在图上（小红书不会判成站外链接）
const W = 1080, H = 1440;
const SITE = 'cr7smallworld.github.io';

function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

// 中文一个字一个字断行
function wrap(ctx, text, maxW, maxLines) {
  const lines = [];
  let line = '';
  for (const ch of String(text || '').replace(/\s+/g, ' ')) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else line += ch;
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + '…').width > maxW && last) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// opts: { kicker, title, detail, image, footer }
export async function makeShareImage(opts) {
  const SERIF = '"Noto Serif SC", "Songti SC", serif';
  const SANS = '"Noto Sans SC", -apple-system, sans-serif';
  try {
    await Promise.all([
      document.fonts.load(`700 60px "Noto Serif SC"`, opts.title || '7'),
      document.fonts.load(`400 34px "Noto Sans SC"`, (opts.detail || '') + SITE),
    ]);
  } catch (_) {}
  const img = await loadImg(opts.image);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  // 底色：海天淡蓝到阳光暖金
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#E4EFF5');
  bg.addColorStop(0.55, '#FAFBFC');
  bg.addColorStop(1, '#F5ECD7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 右下角大 7
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#D4A847';
  ctx.font = `600 620px Lora, Georgia, serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('7', W - 30, H + 90);
  ctx.restore();

  // 顶部站名
  ctx.fillStyle = '#D4A847';
  ctx.font = `600 34px Lora, Georgia, serif`;
  ctx.textBaseline = 'top';
  ctx.fillText('CR7的小世界', 72, 64);
  ctx.fillRect(72, 118, 64, 3);

  let y = 160;
  const PAD = 72, CW = W - PAD * 2;

  if (img) {
    const ih = 760;
    ctx.save();
    roundRect(ctx, PAD, y, CW, ih, 28);
    ctx.clip();
    const s = Math.max(CW / img.width, ih / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, PAD + (CW - dw) / 2, y + (ih - dh) / 2.6, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(212,168,71,0.55)';
    ctx.lineWidth = 3;
    roundRect(ctx, PAD, y, CW, ih, 28);
    ctx.stroke();
    y += ih + 52;
  } else {
    y += 120;
  }

  if (opts.kicker) {
    ctx.fillStyle = '#D4A847';
    ctx.font = `600 34px Lora, ${SANS}`;
    ctx.fillText(opts.kicker, PAD, y);
    y += 58;
  }

  ctx.fillStyle = '#1E2A38';
  ctx.font = `700 ${img ? 58 : 76}px ${SERIF}`;
  const tl = wrap(ctx, opts.title || '', CW, img ? 2 : 4);
  tl.forEach((l) => { ctx.fillText(l, PAD, y); y += img ? 80 : 104; });
  y += 10;

  if (opts.detail) {
    ctx.fillStyle = '#4A5A6A';
    ctx.font = `400 34px ${SANS}`;
    const left = Math.max(1, Math.floor((H - 210 - y) / 54));
    wrap(ctx, opts.detail, CW, Math.min(img ? 3 : 9, left)).forEach((l) => { ctx.fillText(l, PAD, y); y += 54; });
  }

  // 底栏
  ctx.fillStyle = 'rgba(30,42,56,0.1)';
  ctx.fillRect(PAD, H - 168, CW, 2);
  ctx.fillStyle = '#1E2A38';
  ctx.font = `600 38px Lora, ${SANS}`;
  ctx.fillText(SITE, PAD, H - 130);
  ctx.fillStyle = '#6B7D8D';
  ctx.font = `400 28px ${SANS}`;
  ctx.fillText(opts.footer || '罗蜜自己的考古小站 · 浏览器打开就能看', PAD, H - 76);

  return c;
}

// 弹一个框：显示图片，手机长按保存，电脑点按钮下载
export async function showShare(opts, btn) {
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '正在生成…'; }
  let canvas;
  try { canvas = await makeShareImage(opts); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
  const url = canvas.toDataURL('image/png');

  const wrap = document.createElement('div');
  wrap.className = 'share-pop';
  wrap.innerHTML = '<div class="share-pop-box"><button type="button" class="share-pop-x" aria-label="关闭">×</button>'
    + '<img alt="分享图"><p class="share-pop-tip">手机长按图片保存，发小红书、微博都行，网址已经印在图上了</p>'
    + '<div class="share-pop-act"><a class="share-btn" download="CR7的小世界.png">下载图片</a></div></div>';
  wrap.querySelector('img').src = url;
  wrap.querySelector('a').href = url;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.classList.contains('share-pop-x')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
}
