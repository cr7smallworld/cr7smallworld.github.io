// CR7的小世界 · 自动拿视频封面（Supabase Edge Function：fetch-cover）
// 站长在后台点"通过"时调用：投稿没传图、但贴了B站或YouTube链接，就去拿封面存进图片仓库
// 只有登录的站长能调用；网友调不了

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const BUCKET = 'submissions';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const PUB = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')['default'] || Deno.env.get('SUPABASE_ANON_KEY')!;
const SECRET = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 新版 sb_secret_ 钥匙只能放在 apikey 头里，放进 Authorization 会被当成登录凭证认错
// supabase-js 默认两个头都放，这里把 Authorization 去掉
const adminFetch: typeof fetch = (input, init = {}) => {
  const h = new Headers(init.headers || {});
  if (SECRET.startsWith('sb_secret_') && h.get('Authorization') === `Bearer ${SECRET}`) h.delete('Authorization');
  return fetch(input, { ...init, headers: h });
};

// 从视频链接找到封面图地址；不认识的平台返回 null
async function findCover(raw: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  let host = u.hostname.toLowerCase();

  // B站短链先跟到真地址
  if (/(^|\.)b23\.tv$|(^|\.)bili2233\.cn$/.test(host)) {
    const r = await fetch(raw, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    await r.body?.cancel();
    u = new URL(r.url);
    host = u.hostname.toLowerCase();
  }

  if (/(^|\.)bilibili\.com$/.test(host)) {
    const bv = u.pathname.match(/BV[0-9A-Za-z]{10}/);
    const av = u.pathname.match(/\/av(\d+)/i);
    if (!bv && !av) return null;
    const api = `https://api.bilibili.com/x/web-interface/view?${bv ? 'bvid=' + bv[0] : 'aid=' + av![1]}`;
    const r = await fetch(api, { headers: { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' } });
    const d = await r.json().catch(() => null);
    const pic: string | undefined = d?.data?.pic;
    if (!pic) return null;
    // 拿一张 960×540 的小图，几十KB，不会超过仓库1MB的限制
    return pic.replace(/^http:/, 'https:') + '@960w_540h_1c.jpg';
  }

  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) {
    let id = '';
    if (host.endsWith('youtu.be')) id = u.pathname.slice(1, 12);
    else id = u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/) || [])[1] || '';
    if (!/^[\w-]{11}$/.test(id)) return null;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // 1. 确认是站长
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: '没有登录' }, 401);
  const asUser = createClient(URL_, PUB, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await asUser.auth.getUser(token);
  if (!u?.user) return json({ error: '没有登录' }, 401);
  const { data: ok } = await asUser.rpc('is_admin');
  if (!ok) return json({ error: '不是站长' }, 403);

  // 2. 找到这条投稿
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: '投稿编号不对' }, 400);
  const admin = createClient(URL_, SECRET, { auth: { persistSession: false }, global: { fetch: adminFetch } });
  const { data: it, error } = await admin.from('submissions').select('id, video_url, image_paths').eq('id', id).maybeSingle();
  if (error) return json({ error: '读投稿出错：' + error.message }, 500);
  if (!it) return json({ error: '找不到这条投稿' }, 404);
  if (it.image_paths && it.image_paths.length) return json({ skipped: '已经有图了' });
  if (!it.video_url) return json({ skipped: '没有视频链接' });

  // 3. 拿封面
  let cover: string | null = null;
  try { cover = await findCover(it.video_url); } catch { cover = null; }
  if (!cover) return json({ skipped: '这个平台拿不到封面' });

  let img: Response;
  try { img = await fetch(cover, { headers: { 'User-Agent': UA } }); } catch { return json({ skipped: '封面下载失败' }); }
  const type = (img.headers.get('content-type') || '').split(';')[0];
  if (!img.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return json({ skipped: '封面下载失败' });
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length > 1024 * 1024) return json({ skipped: '封面太大' });

  // 4. 存进图片仓库，写回这条投稿
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `covers/${id}.${ext}`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: type, upsert: true });
  if (up.error) return json({ error: '存封面失败：' + up.error.message }, 500);
  const { error: e2 } = await admin.from('submissions').update({ image_paths: [path] }).eq('id', id);
  if (e2) return json({ error: '写回投稿失败：' + e2.message }, 500);

  return json({ path });
});
