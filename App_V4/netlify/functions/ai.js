/**
 * RRZ Unified AI Gateway (Netlify Function)
 *
 * Goals:
 * - Single stable endpoint for all app modules
 * - Provider switch by ENV only (OpenRouter now, OpenAI later)
 * - Defensive coding to reduce crashes/timeouts
 *
 * ENV (OpenRouter):
 *   AI_PROVIDER=openrouter
 *   OPENROUTER_API_KEY=...
 *   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
 *   MODEL_TEXT=google/gemma-3-12b-it:free
 *   MODEL_TEXT_FALLBACK=google/gemma-3-4b-it:free
 *
 * ENV (OpenAI later):
 *   AI_PROVIDER=openai
 *   OPENAI_API_KEY=...
 *   OPENAI_BASE_URL=https://api.openai.com/v1
 *   MODEL_TEXT=gpt-4o-mini
 *
 * Tasks:
 *   panorama_json_to_report
 *   ceph_treatment_planner
 *   voice_to_report
 *   ask_radiology
 */

const DEFAULT_TIMEOUT_MS = 25000;
const MAX_BODY_CHARS = 250_000; // hard cap to protect function memory

// Simple in-memory rate limiter (best-effort; resets per warm instance)
const RATE = {
  windowMs: 60_000,
  max: 40,
  buckets: new Map()
};

function now(){ return Date.now(); }

function corsHeaders(origin){
  // Prefer same-origin; allow all if Origin missing (file:// or some PWA contexts)
  const allow = origin || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function rateLimit(ip){
  const t = now();
  const b = RATE.buckets.get(ip) || { start: t, count: 0 };
  if (t - b.start > RATE.windowMs){
    b.start = t;
    b.count = 0;
  }
  b.count++;
  RATE.buckets.set(ip, b);
  return b.count <= RATE.max;
}

function safeJsonParse(str){
  try { return JSON.parse(str); } catch { return null; }
}

function clampString(s, max){
  const x = (s ?? '').toString();
  if (x.length <= max) return x;
  return x.slice(0, max);
}

function buildPrompts(task, payload, meta){
  const lang = (meta?.lang || payload?.lang || 'ar').toString().toLowerCase().startsWith('en') ? 'en' : 'ar';

  if (task === 'panorama_json_to_report'){
    const findings = payload?.findings || payload?.items || [];
    const summary = payload?.summary || {};

    const system = lang === 'ar'
      ? 'أنت مساعد أشعة أسنان محترف. اكتب تقرير أشعة بانوراما طبي منظم بناءً على نتائج ذكاء اصطناعي (قائمة Findings). لا تخترع بيانات غير موجودة. أخرج JSON فقط.'
      : 'You are a professional dental radiology assistant. Write a structured panoramic radiology report based on AI findings. Do not hallucinate. Output JSON only.';

    const user = {
      instruction: lang === 'ar'
        ? 'حوّل بيانات الـAI إلى تقرير طبي احترافي (Findings/Impression/Recommendations). استخدم لغة علمية واضحة. لو البيانات غير كافية، اذكر ذلك صراحة.'
        : 'Convert AI output into a professional report (Findings/Impression/Recommendations). If data is insufficient, state that explicitly.',
      schema: {
        findings: 'string (multi-line)',
        impression: 'string (multi-line)',
        recommendations: 'string (multi-line)'
      },
      input: {
        findings,
        summary
      }
    };

    return { system, user: JSON.stringify(user) };
  }

  if (task === 'ceph_treatment_planner'){
    const ceph = payload?.ceph || payload?.measurements || payload || {};
    const system = lang === 'ar'
      ? 'أنت أخصائي تقويم أسنان. استنتج خطة علاج تقويمية بناءً على التحاليل القياسية. لا تذكر أدوية. لا تؤكد تشخيصات غير مدعومة. أخرج JSON فقط.'
      : 'You are an orthodontic specialist. Propose an orthodontic treatment plan from cephalometric analyses. Output JSON only.';

    const user = {
      instruction: lang === 'ar'
        ? 'اكتب خطة علاج تقويمية منظمة من مراحل، أهداف، خيارات أجهزة، Anchorage، مخاطر ومتابعة. التزم بالبيانات. لو ناقصة، اطلب ما يلزم.'
        : 'Write a structured orthodontic plan: objectives, phases, appliance options, anchorage, risks/consent, follow-up. Ask for missing critical data.',
      schema: {
        diagnostic_summary: 'string',
        problem_list: 'array of strings',
        objectives: 'array of strings',
        plan_phases: 'array of {name, steps[]}',
        appliance_options: 'array of strings',
        anchorage: 'string',
        risks_and_consents: 'array of strings',
        follow_up: 'array of strings'
      },
      input: ceph
    };

    return { system, user: JSON.stringify(user) };
  }

  if (task === 'voice_to_report'){
    const transcript = (payload?.transcript || payload?.text || '').toString();
    const template = (payload?.template || '').toString();

    const system = lang === 'ar'
      ? 'أنت محرر تقارير أشعة. حوّل إملاء الطبيب إلى تقرير طبي منظم. لا تخترع نتائج. أخرج JSON فقط.'
      : 'You are a radiology report editor. Turn dictated text into a structured report. Output JSON only.';

    const user = {
      instruction: lang === 'ar'
        ? 'نظّف النص، صحح الأخطاء، واكتب تقريرًا احترافيًا. قسّم إلى Findings و Impression و Recommendations. حافظ على نفس المعنى.'
        : 'Polish the text and produce a professional report. Split into Findings/Impression/Recommendations.',
      template,
      schema: {
        findings: 'string',
        impression: 'string',
        recommendations: 'string'
      },
      input: transcript
    };

    return { system, user: JSON.stringify(user) };
  }

  if (task === 'ask_radiology'){
    const q = (payload?.question || payload?.q || '').toString();
    const system = lang === 'ar'
      ? 'أنت مساعد أشعة أسنان. أجب بشكل علمي، مختصر، وتجنب الهلوسة. إذا السؤال يحتاج معلومات إضافية اطلبها. أخرج JSON فقط.'
      : 'You are a dental radiology assistant. Answer scientifically and concisely. Ask for missing details. Output JSON only.';

    const user = {
      instruction: lang === 'ar'
        ? 'أجب عن السؤال. اذكر نقاط عملية للطبيب. إذا هناك حدود للـAI، اذكرها.'
        : 'Answer the question with practical points. Mention limits if relevant.',
      schema: {
        answer: 'string',
        follow_up_questions: 'array of strings'
      },
      input: q
    };

    return { system, user: JSON.stringify(user) };
  }

  return null;
}

async function fetchWithTimeout(url, opts, timeoutMs){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function callChatCompletion({provider, model, system, user, temperature=0.2}){
  if (provider === 'openrouter'){
    const apiKey = process.env.OPENROUTER_API_KEY;
    const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    if (!apiKey) throw new Error('Server missing OPENROUTER_API_KEY');

    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature
      })
    }, DEFAULT_TIMEOUT_MS);

    const text = await res.text();
    const data = safeJsonParse(text);
    if (!res.ok){
      throw new Error((data && (data.error?.message || data.error || data.message)) || `Upstream error: ${res.status}`);
    }
    const content = data?.choices?.[0]?.message?.content || '';
    return { raw: content, usage: data?.usage };
  }

  if (provider === 'openai'){
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    if (!apiKey) throw new Error('Server missing OPENAI_API_KEY');

    const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature
      })
    }, DEFAULT_TIMEOUT_MS);

    const text = await res.text();
    const data = safeJsonParse(text);
    if (!res.ok){
      throw new Error((data && (data.error?.message || data.error || data.message)) || `Upstream error: ${res.status}`);
    }
    const content = data?.choices?.[0]?.message?.content || '';
    return { raw: content, usage: data?.usage };
  }

  throw new Error('Unknown AI_PROVIDER');
}

function extractJson(raw){
  const s = (raw || '').toString().trim();
  if (!s) return null;
  // Try direct JSON
  const direct = safeJsonParse(s);
  if (direct) return direct;

  // Try to find JSON block
  const m = s.match(/\{[\s\S]*\}/);
  if (m){
    const inner = safeJsonParse(m[0]);
    if (inner) return inner;
  }
  return null;
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };

  if (event.httpMethod === 'OPTIONS'){
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST'){
    return { statusCode: 405, headers, body: JSON.stringify({ ok:false, error:'Method Not Allowed' }) };
  }

  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (!rateLimit(ip)){
    return { statusCode: 429, headers, body: JSON.stringify({ ok:false, error:'Rate limit exceeded' }) };
  }

  const rawBody = (event.body || '').toString();
  if (rawBody.length > MAX_BODY_CHARS){
    return { statusCode: 413, headers, body: JSON.stringify({ ok:false, error:'Payload too large' }) };
  }

  const req = safeJsonParse(rawBody);
  if (!req){
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:'Invalid JSON' }) };
  }

  const task = (req.task || '').toString().trim();
  const payload = req.payload || {};
  const meta = req.meta || {};

  const prompts = buildPrompts(task, payload, meta);
  if (!prompts){
    return { statusCode: 400, headers, body: JSON.stringify({ ok:false, error:'Unknown task' }) };
  }

  const provider = (process.env.AI_PROVIDER || 'openrouter').toLowerCase();
  const model = (process.env.MODEL_TEXT || 'google/gemma-3-12b-it:free');
  const fallback = (process.env.MODEL_TEXT_FALLBACK || 'google/gemma-3-4b-it:free');

  const temperature = typeof payload.temperature === 'number' ? payload.temperature : 0.2;

  async function run(modelName){
    const out = await callChatCompletion({ provider, model: modelName, system: prompts.system, user: prompts.user, temperature });
    const parsed = extractJson(out.raw);
    if (!parsed){
      // Return raw as safest fallback
      return { parsed: { raw: clampString(out.raw, 50_000) }, usage: out.usage, raw: out.raw };
    }
    return { parsed, usage: out.usage, raw: out.raw };
  }

  try {
    let result;
    try {
      result = await run(model);
    } catch (e){
      // Try fallback only on upstream-ish failures
      result = await run(fallback);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        task,
        provider,
        model_used: model,
        result: result.parsed,
        usage: result.usage || null
      })
    };
  } catch (e){
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ ok:false, error:'AI upstream error', details: String(e) })
    };
  }
};
