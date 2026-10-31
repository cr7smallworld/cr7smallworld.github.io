// Supabase 库放在 js/vendor/supabase.js 里，由页面先加载，不依赖外部CDN
import { cropAvatar } from './cropper.js?v=20261030e';

// 公开钥匙：本来就是写在网页里给所有人看的，权限只够"投稿"和"看审核通过的内容"
const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const BUCKET = 'submissions';
const MAX_IMAGES = 9;
const TARGET_BYTES = 300 * 1024;   // 压缩目标约300KB
const MAX_SIDE = 1600;             // 最长边像素

const PRESET_TAGS = ['里斯本竞技', '抬一', '皇马', '尤文', '抬二', '沙特', '葡萄牙', '搞笑', '催泪', '场上', '场下'];

const KINDS = {
  upload: {
    desc: '分享你收藏的照片、故事或资料',
    summaryLabel: '一句话介绍',
    summaryPlaceholder: '用一句话说说这是什么',
  },
  supplement: {
    desc: '为网站上已有的内容添加更多细节',
    summaryLabel: '要补充的是哪一条',
    summaryPlaceholder: '例如：生涯档案·曼联（抬一）·首次赢得英超冠军',
  },
  correction: {
    desc: '发现哪里写错了？告诉我们',
    summaryLabel: '哪一条写错了',
    summaryPlaceholder: '例如：荣誉与数据·总进球数',
  },
};

const $ = (id) => document.getElementById(id);
const form = $('submitForm');
const msg = $('formMsg');
const btn = $('submitBtn');
let kind = 'upload';
let files = [];
let target = null;   // 补充/纠错时，指向网站上已有的那一条
let relMode = 'moment';  // 人物关系板块上传时：moment=糖点经历，person=添加人物
let people = null;       // 已收录的人物（选"是谁"用），用到时才去读

const FW_TYPES = ['混剪', '同人文', '同人图', '修图', '其它'];
const CLUB_TAGS = ['里斯本竞技', '抬一', '皇马', '尤文', '抬二', '沙特', '葡萄牙', '对手', '亲人', '其它'];
const CLUB_LABELS = { '里斯本竞技': '里斯本竞技', '抬一': '曼联·抬一', '皇马': '皇马', '尤文': '尤文', '抬二': '曼联·抬二', '沙特': '利雅得胜利', '葡萄牙': '葡萄牙国家队', '对手': '对手', '亲人': '亲人', '其它': '其它' };

const SECTION_NAMES = { fun: '有趣事件 & 性格萌点', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创', spicy: '🦌管素材' };

// ---------- 投稿类型 ----------
function setKind(k) {
  kind = KINDS[k] ? k : 'upload';
  document.querySelectorAll('.kind-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.kind === kind);
    t.setAttribute('aria-selected', t.dataset.kind === kind);
  });
  const cfg = KINDS[kind];
  $('kindDesc').textContent = cfg.desc;
  $('summaryLabel').innerHTML = `${cfg.summaryLabel} <em>必填</em>`;
  $('summary').placeholder = cfg.summaryPlaceholder;
  $('detail').placeholder = kind === 'upload' ? '' : (kind === 'supplement' ? '想补充的内容' : '正确的应该是什么，最好附上出处');
  if (kind === 'upload' && target) clearTarget();
  updateDetailLabel();
  updateRel();
  const p = new URLSearchParams(location.search);
  p.set('kind', kind);
  history.replaceState(null, '', `?${p}`);
}
document.querySelectorAll('.kind-tab').forEach((t) => t.addEventListener('click', () => setKind(t.dataset.kind)));
setKind(new URLSearchParams(location.search).get('kind'));

// 从板块页点"我要投稿"进来，自动选好板块
{
  const sec = new URLSearchParams(location.search).get('section');
  const sel = document.getElementById('section');
  if (sec && [...sel.options].some((o) => o.value === sec)) {
    sel.value = sec;
    document.getElementById('fanworksConsent').hidden = sec !== 'fanworks';
  }
}

// ---------- 从"这条有错？去纠错"进来：自动认出是哪一条 ----------
function updateDetailLabel() {
  const lbl = $('detailLabel');
  if (target && kind === 'correction') lbl.innerHTML = '正确的应该是什么 <em>必填</em>';
  else if (target && kind === 'supplement') lbl.innerHTML = '想补充的内容 <em>必填</em>';
  else lbl.innerHTML = '详细介绍 <span class="opt">选填</span>';
  $('targetLabel').textContent = kind === 'supplement' ? '你要补充的是这一条' : '你要纠错的是这一条';
}

function showTarget(it) {
  target = it;
  $('targetMeta').textContent = it.kind === 'person'
    ? `${SECTION_NAMES[it.section] || ''} · 人物`
    : `${SECTION_NAMES[it.section] || ''} · ${it.event_date || '时间未知'}`;
  $('targetTitle').textContent = it.summary;
  $('targetCard').hidden = false;
  $('summary').value = it.summary.slice(0, 100);
  $('section').value = it.section;
  $('fanworksConsent').hidden = true;
  $('summaryField').hidden = true;
  $('sectionField').hidden = true;
  updateDetailLabel();
}

function clearTarget() {
  target = null;
  $('targetCard').hidden = true;
  $('summaryField').hidden = false;
  $('sectionField').hidden = false;
  $('summary').value = '';
  $('summaryCount').textContent = '0';
  const p = new URLSearchParams(location.search);
  p.delete('target');
  history.replaceState(null, '', `?${p}`);
  updateDetailLabel();
}
$('targetClear').addEventListener('click', clearTarget);

(async () => {
  const id = new URLSearchParams(location.search).get('target');
  if (!id || kind === 'upload' || !/^[0-9a-f-]{36}$/i.test(id)) return;
  const { data } = await supabase
    .from('submissions')
    .select('id, kind, section, summary, event_date')
    .eq('id', id)
    .maybeSingle();
  if (data) showTarget(data);
})();

// ---------- 预设标签 ----------
PRESET_TAGS.forEach((tag) => {
  const label = document.createElement('label');
  label.className = 'tag-chip';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = tag;
  label.append(input, document.createTextNode('#' + tag));
  $('tagPicker').append(label);
});

// ---------- 字数 ----------
$('summary').addEventListener('input', (e) => { $('summaryCount').textContent = e.target.value.length; });
$('detail').addEventListener('input', (e) => { $('detailCount').textContent = e.target.value.length; });

// ---------- 二创须知 ----------
$('section').addEventListener('change', (e) => {
  $('fanworksConsent').hidden = e.target.value !== 'fanworks';
  updateRel();
});

// ---------- 人物关系：糖点经历 / 添加人物 ----------
CLUB_TAGS.forEach((tag) => {
  const label = document.createElement('label');
  label.className = 'tag-chip';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = tag;
  label.append(input, document.createTextNode(CLUB_LABELS[tag]));
  $('clubPicker').append(label);
});

document.querySelectorAll('.rel-opt').forEach((b) => b.addEventListener('click', () => {
  relMode = b.dataset.rel;
  const p = new URLSearchParams(location.search);
  p.set('rel', relMode);
  history.replaceState(null, '', `?${p}`);
  updateRel();
}));
{
  const r = new URLSearchParams(location.search).get('rel');
  if (r === 'person' || r === 'moment') relMode = r;
}
updateRel();

function isRelUpload() {
  return kind === 'upload' && $('section').value === 'relations';
}

function updateRel() {
  if (!$('relModeField')) return;
  const rel = isRelUpload();
  const person = rel && relMode === 'person';
  $('relModeField').hidden = !rel;
  $('personPickField').hidden = !rel || person;
  document.querySelectorAll('.rel-opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.rel === relMode);
    b.setAttribute('aria-checked', String(b.dataset.rel === relMode));
  });
  document.querySelectorAll('.person-only').forEach((n) => (n.hidden = !person));
  document.querySelectorAll('.not-person').forEach((n) => (n.hidden = person));

  if (kind === 'upload') {
    $('summaryLabel').innerHTML = person ? '名字 <em>必填</em>' : `${KINDS.upload.summaryLabel} <em>必填</em>`;
    $('summary').placeholder = person ? '例如：费迪南德' : (rel ? '例如：08年欧冠夺冠后抱在一起哭' : KINDS.upload.summaryPlaceholder);
    if (!target) {
      $('detailLabel').innerHTML = person ? '简略介绍 <span class="opt">选填</span>' : '详细介绍 <span class="opt">选填</span>';
      $('detail').placeholder = person ? '他是谁，和他是什么关系，一两段话就好' : '';
    }
  }
  $('imagesLabel').innerHTML = person
    ? '头像照片 <span class="opt">选填，1张</span>'
    : '上传图片 <span class="opt">选填，最多9张</span>';
  const wasAvatar = $('preview').classList.contains('avatar');
  if ((person && files.length && !avatarSource) || (!person && wasAvatar)) {
    files = [];
    avatarSource = null;
    $('images').value = '';
    $('preview').innerHTML = '';
    $('preview').classList.remove('avatar');
  }
  if (rel && !person) loadPeople();
  updateFw();
}

// ---------- 精彩二创：分类 / 来源平台 / 原作者 ----------
function isFwUpload() {
  return kind === 'upload' && $('section').value === 'fanworks';
}

function updateFw() {
  const fw = isFwUpload();
  document.querySelectorAll('.fw-only').forEach((n) => (n.hidden = !fw));
  $('fanworksConsent').hidden = !fw;
  document.querySelectorAll('.not-fw').forEach((n) => {
    if (fw) n.hidden = true;
    else if (!(n.classList.contains('not-person') && isRelUpload() && relMode === 'person')) n.hidden = false;
  });
  const arc = $('section').value === 'archive';
  const spicy = $('section').value === 'spicy';
  $('videoLabel').innerHTML = (fw ? '视频/帖子链接' : arc ? '视频/资料链接' : '视频链接') + ' <span class="opt">选填</span>';
  $('videoUrl').placeholder = fw ? '原作品的视频或帖子地址' : arc ? '视频地址，或者网盘分享链接（书、杂志、PDF放网盘）' : 'B站、微博、YouTube 等视频地址';
  // 🦌管素材：只留图片、配字、上传人
  document.querySelectorAll('.not-spicy').forEach((n) => {
    if (spicy) n.hidden = true;
    else if (n.classList.contains('plain')) n.hidden = false;
  });
  if (kind === 'upload' && !target) {
    if (spicy) {
      $('summaryLabel').innerHTML = '配字 <span class="opt">选填</span>';
      $('summary').placeholder = '想说点什么就写，不写也行';
      $('imagesLabel').innerHTML = '上传图片 <em>必填</em> <span class="opt">最多9张</span>';
    } else if (!isRelUpload()) {
      $('summaryLabel').innerHTML = `${KINDS.upload.summaryLabel} <em>必填</em>`;
      $('summary').placeholder = KINDS.upload.summaryPlaceholder;
      $('imagesLabel').innerHTML = '上传图片 <span class="opt">选填，最多9张</span>';
    }
  }
  $('summary').required = !spicy;
}

FW_TYPES.forEach((t) => {
  const label = document.createElement('label');
  label.className = 'tag-chip';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'fwType';
  input.value = t;
  label.append(input, document.createTextNode(t));
  $('fwTypePicker').append(label);
});

$('fwPlatform').addEventListener('change', (e) => {
  $('fwPlatformOther').hidden = e.target.value !== '__other';
  if (e.target.value === '__other') $('fwPlatformOther').focus();
});

async function loadPeople() {
  if (people) return;
  people = [];
  const { data, error } = await supabase
    .from('submissions')
    .select('id, summary, tags, person_role')
    .eq('section', 'relations')
    .eq('kind', 'person')
    .eq('status', 'approved')
    .order('summary')
    .limit(1000);
  const sel = $('personPick');
  if (error) { $('personPickHint').textContent = '人物名单加载失败了，刷新一下试试'; return; }
  people = data || [];
  CLUB_TAGS.forEach((g) => {
    const list = people.filter((p) => {
      const cs = (p.tags || []).filter((t) => CLUB_TAGS.includes(t));
      return g === '其它' ? (cs.length === 0 || cs.includes('其它')) : cs.includes(g);
    });
    if (!list.length) return;
    const og = document.createElement('optgroup');
    og.label = CLUB_LABELS[g] || g;
    list.forEach((p) => og.append(new Option(p.person_role ? `${p.summary}（${p.person_role}）` : p.summary, p.id)));
    sel.append(og);
  });
  if (!people.length) $('personPickHint').textContent = '名单里还没有人，先切到"添加人物"把他加进来，审核通过后就能选了';
  const want = new URLSearchParams(location.search).get('person');
  if (want && people.some((p) => p.id === want)) sel.value = want;
}

// ---------- 图片预览 ----------
// ---------- 人物头像：选完图先弹出裁剪框 ----------
let avatarSource = null;   // 原图留着，方便"重新调整"
let editing = null;        // 编辑自己的投稿时：{ token, id, kind, status, ... }
let existingPaths = [];    // 编辑时，这条原来就有的图
const imgUrl = (p) => supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;

function showPreview() {
  const preview = $('preview');
  preview.innerHTML = '';
  const avatar = isRelUpload() && relMode === 'person';
  if (avatar && files.length) existingPaths = [];
  preview.classList.toggle('avatar', avatar && (files.length > 0 || existingPaths.length > 0));
  const thumb = (src, onRemove, revoke) => {
    const wrap = document.createElement('span');
    wrap.className = 'pv-item';
    const img = document.createElement('img');
    img.src = src;
    if (revoke) img.onload = () => URL.revokeObjectURL(src);
    wrap.append(img);
    if (editing && !avatar) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'pv-del';
      x.setAttribute('aria-label', '去掉这张');
      x.textContent = '×';
      x.addEventListener('click', onRemove);
      wrap.append(x);
    }
    preview.append(wrap);
  };
  existingPaths.forEach((p, i) => thumb(imgUrl(p), () => { existingPaths.splice(i, 1); showPreview(); }));
  files.forEach((f, i) => thumb(URL.createObjectURL(f), () => { files.splice(i, 1); showPreview(); }, true));
  if (avatar && files.length && avatarSource) {
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'crop-again';
    again.textContent = '重新调整';
    again.addEventListener('click', () => openCrop(avatarSource));
    preview.append(again);
  }
}

async function openCrop(src) {
  let source = src;
  try {
    if ((await sniff(source)) === 'image/heic') {
      showMsg('这张是HEIC格式，正在转成JPG，可能要等几秒…');
      const heic2any = await loadHeicLib();
      const out = await heic2any({ blob: source, toType: 'image/jpeg', quality: 0.92 });
      source = Array.isArray(out) ? out[0] : out;
      showMsg('');
    }
    const blob = await cropAvatar(source);
    if (!blob) return false;
    avatarSource = source;
    files = [new File([blob], 'avatar.jpg', { type: 'image/jpeg' })];
    showPreview();
    return true;
  } catch (_) {
    showMsg('这张图打不开，换一张试试，或者截图后传截图', 'error');
    return false;
  }
}

$('images').addEventListener('change', async (e) => {
  if (isRelUpload() && relMode === 'person') {
    const f = e.target.files[0];
    const many = e.target.files.length > 1;
    e.target.value = '';
    if (!f) return;
    if (many) showMsg('头像只要1张，用的是第1张', 'warn');
    else showMsg('');
    await openCrop(f);
    return;
  }
  avatarSource = null;
  const max = MAX_IMAGES - existingPaths.length;
  if (max <= 0) { e.target.value = ''; return showMsg('已经有9张图了，先去掉几张再加', 'warn'); }
  files = [...(editing ? files : []), ...Array.from(e.target.files)].slice(0, max);
  e.target.value = '';
  if (files.length >= max && e.target.files.length > max) showMsg(`最多9张，多出来的没加上`, 'warn');
  else showMsg('');
  showPreview();
});

// ---------- 图片压缩 ----------
// 看文件开头几个字节判断真实格式，不信文件名和浏览器报的类型
// （有的手机把HEIC照片标成 image/jpeg，之前就是这样传上去一张打不开的图）
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (i, j) => String.fromCharCode(...b.slice(i, j));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 3) === 'GIF') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1|avif)$/.test(ascii(8, 12))) return 'image/heic';
  return 'unknown';
}

// HEIC 转换库比较大，只有真碰到HEIC照片时才加载
let heicLib;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!heicLib) {
    heicLib = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'js/vendor/heic2any.min.js';
      sc.onload = () => (window.heic2any ? resolve(window.heic2any) : reject(new Error('load')));
      sc.onerror = () => reject(new Error('load'));
      document.head.append(sc);
    });
  }
  return heicLib;
}

// 先用 createImageBitmap 解码（大图更省内存，还会按照片方向自动转正），不行再退回 <img>
async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (_) { /* 退回下面的方法 */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality);
  });
}

async function compress(file, n) {
  const real = await sniff(file);

  // 动图压缩会变成静图，原样上传（仓库限制单张1MB）
  if (real === 'image/gif') return new Blob([file], { type: 'image/gif' });

  let source = file;
  if (real === 'image/heic') {
    showMsg(`第 ${n} 张是HEIC格式，正在转成JPG，可能要等几秒…`);
    try {
      const heic2any = await loadHeicLib();
      const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      source = Array.isArray(out) ? out[0] : out;
    } catch (_) {
      throw new Error(`第 ${n} 张是HEIC格式，转换失败了。可以在相机设置里关掉"高效格式"，或者截个图再传截图`);
    }
  } else if (real === 'unknown') {
    throw new Error(`第 ${n} 张不是能识别的图片（${file.name || '未命名'}）。换一张试试，或者截图后传截图`);
  }

  let img;
  try {
    img = await decode(source);
  } catch (_) {
    // 浏览器解不开，但文件本身确实是jpg/png/webp且不大，就原样传
    if (real !== 'image/heic' && source.size <= 1024 * 1024) return new Blob([source], { type: real });
    throw new Error(`第 ${n} 张图片打不开（${file.name || '未命名'}）。换一张试试，或者截图后传截图`);
  }

  let width = img.width;
  let height = img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  let quality = 0.85;
  let blob;
  try {
    for (let i = 0; i < 6; i++) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= TARGET_BYTES) break;
      if (quality > 0.6) quality -= 0.1;
      else { width = Math.round(width * 0.8); height = Math.round(height * 0.8); }
    }
  } catch (_) {
    throw new Error(`第 ${n} 张图片压缩失败，可能太大了，截图后再传试试`);
  } finally {
    if (img.close) img.close();
  }
  return blob;
}

// 网络抖一下就会 Failed to fetch，自动重试几次
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function isNetworkError(e) {
  const m = String((e && e.message) || e || '');
  return /failed to fetch|networkerror|load failed|network request failed|timeout|timed out|aborted/i.test(m);
}
function friendly(err) {
  return isNetworkError(err)
    ? '网络好像断了一下。换个网络（WiFi和流量切一下）或者换个浏览器，再点一次提交试试，填的内容都还在'
    : '提交失败了：' + err.message + '。可以稍后再试一次';
}
async function uploadWithRetry(path, blob, n, total) {
  const tries = 3;
  for (let t = 1; t <= tries; t++) {
    let error;
    try {
      ({ error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type }));
    } catch (e) { error = e; }
    if (!error) return;
    // 上一次其实传上去了只是回信丢了，再传会提示已存在，当成功
    if (t > 1 && /exists|duplicate/i.test(error.message || '')) return;
    if (!isNetworkError(error) || t === tries) {
      const e = new Error(isNetworkError(error) ? 'Failed to fetch' : '图片上传失败：' + error.message);
      throw e;
    }
    showMsg(`第 ${n}/${total} 张图片网络不太稳，正在重试（${t}/${tries - 1}）…`);
    await sleep(1500 * t);
  }
}

async function uploadImages() {
  const paths = [];
  const folder = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  for (let i = 0; i < files.length; i++) {
    showMsg(`正在处理第 ${i + 1}/${files.length} 张图片…`);
    const blob = await compress(files[i], i + 1);
    if (blob.size > 1024 * 1024) throw new Error(`第 ${i + 1} 张图片太大了（超过1MB）`);
    const ext = { 'image/gif': 'gif', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
    const path = `${folder}/${i + 1}.${ext}`;
    await uploadWithRetry(path, blob, i + 1, files.length);
    paths.push(path);
  }
  return paths;
}

// ---------- 提交 ----------
function showMsg(text, type = '') {
  msg.textContent = text;
  msg.className = 'form-msg' + (type ? ' ' + type : '');
}

function collectTags() {
  const picked = Array.from($('tagPicker').querySelectorAll('input:checked')).map((i) => i.value);
  const custom = $('customTags').value.split(/[,，\s#]+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set([...picked, ...custom])).slice(0, 20).map((t) => t.slice(0, 20));
}

const clean = (v) => (v.trim() === '' ? null : v.trim());

// 查询码：投稿人凭它看审核结果，只记在自己设备上
function newToken() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function rememberToken(token, summary) {
  const KEY = 'cr7_my_submissions';
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY)) || []; } catch (_) {}
  list.unshift({ token, summary: summary.slice(0, 60), at: new Date().toISOString() });
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50))); } catch (_) {}
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (editing) return submitEdit();
  const section = $('section').value;
  const summary = $('summary').value.trim();
  const videoUrl = $('videoUrl').value.trim();

  const relPerson = kind === 'upload' && section === 'relations' && relMode === 'person';
  const relMoment = kind === 'upload' && section === 'relations' && relMode === 'moment';
  const personId = relMoment ? $('personPick').value : '';
  if (!section) return showMsg('请选择投稿板块', 'error');
  if (relMoment && !personId) return showMsg('请选一下是谁和他之间的事', 'error');
  const spicyUpload = kind === 'upload' && section === 'spicy';
  if (spicyUpload && !files.length) return showMsg('🦌管素材要传至少一张图', 'error');
  if (!summary && !spicyUpload) return showMsg(relPerson ? '请填写名字' : '请填写' + KINDS[kind].summaryLabel, 'error');
  if (target && kind !== 'upload' && !$('detail').value.trim()) {
    return showMsg(kind === 'correction' ? '请写一下正确的应该是什么' : '请写一下想补充的内容', 'error');
  }
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) return showMsg('链接要以 http:// 或 https:// 开头', 'error');
  const fwUpload = kind === 'upload' && section === 'fanworks';
  const fwType = (form.querySelector('input[name="fwType"]:checked') || {}).value || '';
  const fwPlatform = $('fwPlatform').value === '__other' ? $('fwPlatformOther').value.trim() : $('fwPlatform').value;
  const fwAuthor = $('fwAuthor').value.trim();
  if (fwUpload && !fwType) return showMsg('请选一下作品分类', 'error');
  if (fwUpload && !fwPlatform) return showMsg($('fwPlatform').value === '__other' ? '请写一下是哪个平台' : '请选一下来源平台', 'error');
  if (fwUpload && !fwAuthor) return showMsg('请填写原作者昵称', 'error');
  if (fwUpload && !$('consent').checked) return showMsg('二创投稿需要先获得原作者同意', 'error');

  btn.disabled = true;
  try {
    const image_paths = files.length ? await uploadImages() : [];
    showMsg('正在提交…');
    const token = newToken();
    const row = {
      token,
      kind,
      section,
      summary,
      event_date: clean($('eventDate').value),
      detail: clean($('detail').value),
      source: clean($('source').value),
      tags: collectTags(),
      uploader: clean($('uploader').value),
      ...memberFields(),
      image_paths,
      video_url: videoUrl || null,
      target_id: target && kind !== 'upload' ? target.id : null,
    };
    if (relPerson) {
      Object.assign(row, {
        kind: 'person',
        event_date: null,
        video_url: null,
        tags: Array.from($('clubPicker').querySelectorAll('input:checked')).map((i) => i.value),
        person_role: clean($('personRole').value),
        person_alias: clean($('personAlias').value),
      });
    }
    if (relMoment) row.person_id = personId;
    if (fwUpload) {
      Object.assign(row, {
        event_date: null,
        source: null,
        fanwork_type: fwType,
        fanwork_platform: fwPlatform,
        fanwork_author: fwAuthor,
      });
    }
    if (spicyUpload) Object.assign(row, { summary: summary || '🦌', detail: null, event_date: null, source: null, video_url: null, tags: [] });
    const { error } = await supabase.from('submissions').insert(row);
    if (error) throw new Error(error.message);
    const who = relMoment ? (people || []).find((p) => p.id === personId) : null;
    rememberToken(token, relPerson ? `添加人物：${summary}` : (who ? `${who.summary}：${summary}` : summary));
    $('doneCode').textContent = token;
    form.hidden = true;
    $('done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showMsg(friendly(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

$('again').addEventListener('click', () => {
  form.reset();
  files = [];
  avatarSource = null;
  $('preview').innerHTML = '';
  $('preview').classList.remove('avatar');
  $('summaryCount').textContent = '0';
  $('detailCount').textContent = '0';
  $('fanworksConsent').hidden = true;
  if (target) clearTarget();
  const sec = new URLSearchParams(location.search).get('section');
  if (sec && [...$('section').options].some((o) => o.value === sec)) $('section').value = sec;
  $('fwPlatformOther').hidden = true;
  updateRel();
  showMsg('');
  $('done').hidden = true;
  form.hidden = false;
});

$('copyCode').addEventListener('click', async () => {
  const code = $('doneCode').textContent;
  try { await navigator.clipboard.writeText(code); $('copyCode').textContent = '已复制 ✓'; }
  catch (_) { prompt('长按复制查询码', code); }
});


// ================= 编辑自己的投稿 =================
// 从"我的投稿"点"编辑"进来：submit.html?edit=投稿id
// 查询码只认这台设备上存过的（或者"我的投稿"页临时交过来的），不放进网址
async function findToken(id) {
  const t = sessionStorage.getItem('cr7_edit_token_' + id);
  if (t) return t;
  let list = [];
  try { list = JSON.parse(localStorage.getItem('cr7_my_submissions')) || []; } catch (_) {}
  if (!list.length) return null;
  const { data } = await supabase.rpc('check_submissions', { p_tokens: list.map((x) => x.token) });
  const hit = (data || []).find((x) => x.id === id);
  return hit ? hit.token : null;
}

async function startEdit(id) {
  document.querySelector('.kind-tabs').hidden = true;
  $('kindDesc').textContent = '正在读取这条投稿…';
  const token = await findToken(id);
  if (!token) { $('kindDesc').textContent = '这台设备上找不到这条投稿的查询码。先去"我的投稿"粘贴查询码找回，再点编辑'; form.hidden = true; return; }
  const { data: d, error } = await supabase.rpc('get_my_submission', { p_token: token, p_id: id });
  if (error || !d) { $('kindDesc').textContent = '读取失败了，这条投稿可能已经被删除'; form.hidden = true; return; }
  if (d.kind !== 'upload' && d.kind !== 'person') { $('kindDesc').textContent = '补充和纠错交了就不能再改了'; form.hidden = true; return; }

  editing = { token, ...d };
  kind = 'upload';
  $('section').value = d.section;
  relMode = d.kind === 'person' ? 'person' : 'moment';
  updateRel();

  // 板块、投什么、挂在谁下面都不能改
  $('sectionField').hidden = true;
  $('relModeField').hidden = true;
  $('personPickField').hidden = true;
  $('fanworksConsent').hidden = true;
  $('kindDesc').textContent = d.status === 'approved'
    ? '这条已经在网站上了。改完交上去以后，旧版照常显示，站长审核通过新版才会换上去'
    : '改完交上去以后会重新排队等站长审核';
  $('targetLabel').textContent = '你在修改的是这一条';
  const names = { fun: '有趣事件 & 性格萌点', relations: '人物关系', archive: '珍贵资料库', fanworks: '精彩二创' };
  $('targetMeta').textContent = [names[d.section], d.kind === 'person' ? '人物' : (d.person_name ? '和' + d.person_name : '')].filter(Boolean).join(' · ');
  $('targetTitle').textContent = d.summary;
  $('targetClear').hidden = true;
  $('targetCard').hidden = false;
  if (d.has_pending_edit) {
    const n = document.createElement('p');
    n.className = 'edit-note';
    n.textContent = '你上次的修改还在等审核，下面填的是上次改的内容。再交一次会替换掉上次那份';
    $('targetCard').append(n);
  }

  // 把原来的内容填进去
  const set = (id2, v) => { $(id2).value = v || ''; };
  set('summary', d.section === 'spicy' && d.summary === '🦌' ? '' : d.summary); set('eventDate', d.event_date); set('detail', d.detail); set('source', d.source);
  set('videoUrl', d.video_url); set('uploader', d.uploader);
  set('personRole', d.person_role); set('personAlias', d.person_alias); set('fwAuthor', d.fanwork_author);
  $('summaryCount').textContent = (d.summary || '').length;
  $('detailCount').textContent = (d.detail || '').length;
  const tags = d.tags || [];
  if (d.kind === 'person') {
    $('clubPicker').querySelectorAll('input').forEach((i) => { i.checked = tags.includes(i.value); });
  } else {
    $('tagPicker').querySelectorAll('input').forEach((i) => { i.checked = tags.includes(i.value); });
    $('customTags').value = tags.filter((t) => !PRESET_TAGS.includes(t)).join(' ');
  }
  if (d.fanwork_type) {
    const r = form.querySelector(`input[name="fwType"][value="${CSS.escape(d.fanwork_type)}"]`);
    if (r) r.checked = true;
  }
  if (d.fanwork_platform) {
    const opt = [...$('fwPlatform').options].some((o) => o.value === d.fanwork_platform);
    $('fwPlatform').value = opt ? d.fanwork_platform : '__other';
    $('fwPlatformOther').hidden = opt;
    if (!opt) $('fwPlatformOther').value = d.fanwork_platform;
  }
  existingPaths = [...(d.image_paths || [])];
  showPreview();
  btn.textContent = '提交修改';
  $('submitBtn').nextElementSibling.textContent = '修改也要站长审核通过才会生效';
}

async function submitEdit() {
  const person = editing.kind === 'person';
  const fw = editing.section === 'fanworks' && editing.kind === 'upload';
  const summary = $('summary').value.trim();
  const videoUrl = $('videoUrl').value.trim();
  const spicyEdit = editing.section === 'spicy';
  if (!summary && !spicyEdit) return showMsg(person ? '请填写名字' : '请填写一句话介绍', 'error');
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) return showMsg('链接要以 http:// 或 https:// 开头', 'error');
  const fwType = (form.querySelector('input[name="fwType"]:checked') || {}).value || '';
  const fwPlatform = $('fwPlatform').value === '__other' ? $('fwPlatformOther').value.trim() : $('fwPlatform').value;
  const fwAuthor = $('fwAuthor').value.trim();
  if (fw && !fwType) return showMsg('请选一下作品分类', 'error');
  if (fw && !fwPlatform) return showMsg('请选一下来源平台', 'error');
  if (fw && !fwAuthor) return showMsg('请填写原作者昵称', 'error');

  btn.disabled = true;
  try {
    const added = files.length ? await uploadImages() : [];
    const image_paths = person ? (added.length ? added : existingPaths).slice(0, 1) : [...existingPaths, ...added].slice(0, MAX_IMAGES);
    showMsg('正在提交修改…');
    const data = {
      summary: summary || (spicyEdit ? '🦌' : summary),
      event_date: person || fw ? null : clean($('eventDate').value),
      detail: clean($('detail').value),
      source: fw ? null : clean($('source').value),
      tags: person ? Array.from($('clubPicker').querySelectorAll('input:checked')).map((i) => i.value) : collectTags(),
      uploader: clean($('uploader').value),
      image_paths,
      video_url: person ? null : (videoUrl || null),
      person_role: person ? clean($('personRole').value) : null,
      person_alias: person ? clean($('personAlias').value) : null,
      fanwork_type: fw ? fwType : null,
      fanwork_platform: fw ? fwPlatform : null,
      fanwork_author: fw ? fwAuthor : null,
    };
    const { data: res, error } = await supabase.rpc('submit_edit', { p_token: editing.token, p_id: editing.id, p_data: data });
    if (error) throw new Error(error.message);
    sessionStorage.removeItem('cr7_edit_token_' + editing.id);
    // 我的投稿里的标题跟着更新
    try {
      const list = JSON.parse(localStorage.getItem('cr7_my_submissions')) || [];
      const it = list.find((x) => x.token === editing.token);
      if (it) { it.summary = summary.slice(0, 60); localStorage.setItem('cr7_my_submissions', JSON.stringify(list)); }
    } catch (_) {}
    const done = $('done');
    done.querySelector('h2').textContent = '修改交上去啦';
    done.querySelector('h2').nextElementSibling.textContent = res === 'edit_pending'
      ? '站长审核通过以后，网站上就会换成新版，在这之前大家看到的还是旧版'
      : '已经重新排队，等站长审核';
    done.querySelector('.done-code').hidden = true;
    $('again').hidden = true;
    form.hidden = true;
    done.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showMsg(friendly(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

{
  const id = new URLSearchParams(location.search).get('edit');
  if (id && /^[0-9a-f-]{36}$/i.test(id)) startEdit(id);
}


// ================= 登录了就自动署用户名 =================
// 只交登录口令，用户名由数据库自己认出来，没法冒充别人；勾了匿名前台显示"匿名"
function memberFields() {
  const acct = window.cr7Account;
  const tk = acct && acct.token();
  if (!tk || editing) return {};
  return { member_token: tk, is_anon: $('memberAnon').checked };
}
function syncMember() {
  const acct = window.cr7Account;
  const name = acct && acct.token() ? acct.username() : null;
  const on = !!name && !editing;
  $('memberField').hidden = !on;
  $('uploaderField').hidden = on;
  if (on) $('memberName').textContent = name;
}
syncMember();
if (window.cr7Account) window.cr7Account.me().then(syncMember).catch(() => {});
