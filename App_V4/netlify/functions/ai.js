// netlify/functions/ai.js

export async function handler(event) {
  // CORS (اختياري لكنه مفيد لو بتجرب من المتصفح)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const AI_URL = process.env.AI_URL;
    const AI_KEY = process.env.AI_KEY;

    if (!AI_URL || !AI_KEY) {
      console.error("MISSING_ENV", { hasAIURL: !!AI_URL, hasAIKEY: !!AI_KEY });
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Missing ENV",
          details: { hasAIURL: !!AI_URL, hasAIKEY: !!AI_KEY },
        }),
      };
    }

    const r = await fetch(AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();

    if (!r.ok) {
      console.error("UPSTREAM_ERROR", {
        upstream_status: r.status,
        upstream_statusText: r.statusText,
        upstream_body: text?.slice(0, 2000),
      });

      return {
        statusCode: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "AI upstream error",
          upstream_status: r.status,
          upstream_statusText: r.statusText,
          upstream_body: text?.slice(0, 2000),
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: text,
    };
  } catch (e) {
    console.error("FUNCTION_CRASH", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Function error", details: String(e) }),
    };
  }
}
