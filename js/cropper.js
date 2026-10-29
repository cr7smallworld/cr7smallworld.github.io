// 头像裁剪：拖动移位置，双指 / 滑条 / 滚轮放大缩小，确定后输出一张正方形 JPG
// 用法：const blob = await cropAvatar(file)   取消返回 null

const OUT = 640; // 输出边长（像素）

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

export async function cropAvatar(file) {
  const { img, url } = await loadImage(file);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  return new Promise((resolve) => {
    // ---------- 弹窗 ----------
    const mask = el('div', 'crop-mask');
    const box = el('div', 'crop-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.append(el('h3', 'crop-title', '调整头像'));
    const view = el('div', 'crop-view');
    const pic = el('img', 'crop-img');
    pic.src = url;
    pic.alt = '';
    pic.draggable = false;
    view.append(pic, el('div', 'crop-ring'));
    box.append(view);

    const zoomRow = el('div', 'crop-zoom');
    const minus = el('span', null, '－');
    const plus = el('span', null, '＋');
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1000';
    slider.value = '0';
    slider.setAttribute('aria-label', '放大缩小');
    zoomRow.append(minus, slider, plus);
    box.append(zoomRow);
    box.append(el('p', 'crop-tip', '拖动图片调整位置，双指或拉滑条放大缩小。圆圈里是名单上显示的样子'));

    const btns = el('div', 'crop-btns');
    const cancel = el('button', 'crop-cancel', '取消');
    const ok = el('button', 'crop-ok', '确定');
    cancel.type = 'button';
    ok.type = 'button';
    btns.append(cancel, ok);
    box.append(btns);
    mask.append(box);
    document.body.append(mask);
    document.body.classList.add('no-scroll');

    // ---------- 位置和缩放 ----------
    // 视口边长 V，图片缩放 s（图片像素→屏幕像素），图片左上角在视口里的位置 (x, y)
    let V = view.clientWidth;
    let minS = Math.max(V / W, V / H);
    let s = minS;
    const maxS = () => minS * 5;
    let x = (V - W * s) / 2;
    let y = (V - H * s) / 2;

    function clamp() {
      x = Math.min(0, Math.max(V - W * s, x));
      y = Math.min(0, Math.max(V - H * s, y));
    }
    function draw() {
      clamp();
      pic.style.width = `${W * s}px`;
      pic.style.height = `${H * s}px`;
      pic.style.transform = `translate(${x}px, ${y}px)`;
      slider.value = String(Math.round(((s - minS) / (maxS() - minS)) * 1000));
    }
    // 以视口里的 (cx, cy) 为中心缩放
    function zoomTo(ns, cx = V / 2, cy = V / 2) {
      ns = Math.min(maxS(), Math.max(minS, ns));
      x = cx - ((cx - x) * ns) / s;
      y = cy - ((cy - y) * ns) / s;
      s = ns;
      draw();
    }
    draw();

    const onResize = () => {
      const nv = view.clientWidth;
      if (!nv || nv === V) return;
      const k = nv / V;
      V = nv;
      minS = Math.max(V / W, V / H);
      s = Math.max(minS, s * k);
      x *= k;
      y *= k;
      draw();
    };
    window.addEventListener('resize', onResize);

    // ---------- 拖动 & 双指 ----------
    const pts = new Map();
    let last = null;
    const local = (e) => {
      const r = view.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    function snapshot() {
      const p = [...pts.values()];
      if (p.length === 1) return { cx: p[0].x, cy: p[0].y, d: 0 };
      const [a, b] = p;
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    }
    view.addEventListener('pointerdown', (e) => {
      view.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      last = snapshot();
      e.preventDefault();
    });
    view.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const now = snapshot();
      if (last) {
        if (now.d && last.d) zoomTo((s * now.d) / last.d, now.cx, now.cy);
        x += now.cx - last.cx;
        y += now.cy - last.cy;
        draw();
      }
      last = now;
      e.preventDefault();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      last = pts.size ? snapshot() : null;
    };
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = local(e);
      zoomTo(s * (e.deltaY < 0 ? 1.08 : 1 / 1.08), p.x, p.y);
    }, { passive: false });

    slider.addEventListener('input', () => zoomTo(minS + (Number(slider.value) / 1000) * (maxS() - minS)));
    minus.addEventListener('click', () => zoomTo(s / 1.15));
    plus.addEventListener('click', () => zoomTo(s * 1.15));

    // ---------- 结束 ----------
    function close(result) {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
      mask.remove();
      document.body.classList.remove('no-scroll');
      URL.revokeObjectURL(url);
      resolve(result);
    }
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    cancel.addEventListener('click', () => close(null));

    ok.addEventListener('click', () => {
      ok.disabled = true;
      // 视口对应原图里的哪一块
      const sx = -x / s;
      const sy = -y / s;
      const sw = V / s;
      const size = Math.min(OUT, Math.round(sw));
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sw, 0, 0, size, size);
      c.toBlob((b) => close(b), 'image/jpeg', 0.9);
    });
  });
}
