/* RRZ AI Client (stable contract)
   - Single endpoint: /.netlify/functions/ai
   - Tasks: panorama_json_to_report | ceph_treatment_planner | voice_to_report | ask_radiology
   - Built for PWA + graceful degradation.
*/
(function(){
  const DEFAULT_ENDPOINTS = [
    '/.netlify/functions/ai',
    '/netlify/functions/ai' // local dev / some setups
  ];

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function fetchWithTimeout(url, opts, timeoutMs){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), timeoutMs);
    try{
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  async function postJson(endpoints, body, {timeoutMs=25000, retries=2}={}){
    const payload = JSON.stringify(body);

    let lastErr = null;
    for (const ep of endpoints){
      for (let attempt=0; attempt<=retries; attempt++){
        try{
          const res = await fetchWithTimeout(ep, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          }, timeoutMs);

          const text = await res.text();
          let data;
          try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

          if (!res.ok){
            const status = res.status || 0;
            // Retry on 429/5xx only
            if ((status === 429 || status >= 500) && attempt < retries){
              await sleep(400 * Math.pow(2, attempt));
              continue;
            }
            const msg = data?.error || data?.message || ('HTTP ' + status);
            throw new Error(msg);
          }

          return data;
        } catch (e){
          lastErr = e;
          // Retry network/timeout errors on same endpoint
          if (attempt < retries){
            await sleep(400 * Math.pow(2, attempt));
            continue;
          }
        }
      }
    }
    throw lastErr || new Error('AI request failed');
  }

  window.RRZ_AI = {
    call: async function(task, payload, meta){
      const body = {
        task: String(task || ''),
        payload: payload || {},
        meta: meta || {}
      };
      return await postJson(DEFAULT_ENDPOINTS, body, { timeoutMs: 25000, retries: 2 });
    }
  };
})();
