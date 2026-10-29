import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// 公开钥匙：本来就是写在网页里给所有人看的，权限只够"投稿"和"看审核通过的内容"
const SUPABASE_URL = 'https://ldxcrwilgvmswmbplcap.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i0TGeGqYBCvBTcWotN3C7A_N7Kxtl87';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  history.replaceState(null, '', `?kind=${kind}`);
}
document.querySelectorAll('.kind-tab').forEach((t) => t.addEventListener('click', () => setKind(t.dataset.kind)));
setKind(new URLSearchParams(location.search).get('kind'));

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
});

// ---------- 图片预览 ----------
$('images').addEventListener('change', (e) => {
  files = Array.from(e.target.files).slice(0, MAX_IMAGES);
  if (e.target.files.length > MAX_IMAGES) showMsg(`最多9张，只保留了前9张`, 'warn');
  else showMsg('');
  const preview = $('preview');
  preview.innerHTML = '';
  files.forEach((f) => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.onload = () => URL.revokeObjectURL(img.src);
    preview.append(img);
  });
});

// ---------- 图片压缩 ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片读取失败'));
    img.src = URL.createObjectURL(file);
  });
}

async function compress(file) {
  // 动图压缩会变成静图，原样上传（仓库限制单张1MB）
  if (file.type === 'image/gif') return file;
  const img = await loadImage(file);
  let { width, height } = img;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  let quality = 0.85;
  let blob;
  for (let i = 0; i < 6; i++) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob.size <= TARGET_BYTES) break;
    if (quality > 0.6) quality -= 0.1;
    else { width = Math.round(width * 0.8); height = Math.round(height * 0.8); }
  }
  URL.revokeObjectURL(img.src);
  return blob;
}

async function uploadImages() {
  const paths = [];
  const folder = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}`;
  for (let i = 0; i < files.length; i++) {
    showMsg(`正在处理第 ${i + 1}/${files.length} 张图片…`);
    const blob = await compress(files[i]);
    if (blob.size > 1024 * 1024) throw new Error(`第 ${i + 1} 张图片太大了（超过1MB）`);
    const ext = blob.type === 'image/gif' ? 'gif' : 'jpg';
    const path = `${folder}/${i + 1}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
    if (error) throw new Error('图片上传失败：' + error.message);
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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const section = $('section').value;
  const summary = $('summary').value.trim();
  const videoUrl = $('videoUrl').value.trim();

  if (!section) return showMsg('请选择投稿板块', 'error');
  if (!summary) return showMsg('请填写' + KINDS[kind].summaryLabel, 'error');
  if (videoUrl && !/^https?:\/\//i.test(videoUrl)) return showMsg('视频链接要以 http:// 或 https:// 开头', 'error');
  if (section === 'fanworks' && !$('consent').checked) return showMsg('二创投稿需要先注明原作者并获得同意', 'error');

  btn.disabled = true;
  try {
    const image_paths = files.length ? await uploadImages() : [];
    showMsg('正在提交…');
    const { error } = await supabase.from('submissions').insert({
      kind,
      section,
      summary,
      event_date: clean($('eventDate').value),
      detail: clean($('detail').value),
      source: clean($('source').value),
      tags: collectTags(),
      uploader: clean($('uploader').value),
      image_paths,
      video_url: videoUrl || null,
    });
    if (error) throw new Error(error.message);
    form.hidden = true;
    $('done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    showMsg('提交失败了：' + err.message + '。可以稍后再试一次', 'error');
  } finally {
    btn.disabled = false;
  }
});

$('again').addEventListener('click', () => {
  form.reset();
  files = [];
  $('preview').innerHTML = '';
  $('summaryCount').textContent = '0';
  $('detailCount').textContent = '0';
  $('fanworksConsent').hidden = true;
  showMsg('');
  $('done').hidden = true;
  form.hidden = false;
});
