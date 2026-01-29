// netlify/functions/ai.js

exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    const incoming = JSON.parse(event.body || "{}");

    // ✅ استخدم ENV اللي عندك
    const provider = (process.env.AI_PROVIDER || "openrouter").toLowerCase();
    const model = process.env.MODEL_TEXT || "openai/gpt-4o-mini";
    const fallbackModel = process.env.MODEL_TEXT_FALLBACK || "openai/gpt-4o-mini";

    // حالياً هنشتغل OpenRouter فقط لأن المفتاح الموجود عندك OpenRouter
    if (provider !== "openrouter") {
      console.error("UNSUPPORTED_PROVIDER", provider);
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Unsupported provider", provider }),
      };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("MISSING_ENV", { hasOpenRouterKey: !!apiKey });
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing OPENROUTER_API_KEY" }),
      };
    }

    const url = "https://openrouter.ai/api/v1/chat/completions"; // ✅ OpenRouter endpoint
    // OpenRouter بيقبل OpenAI-compatible body: model + messages
    const messages =
      incoming.messages ||
      (incoming.prompt
        ? [{ role: "user", content: String(incoming.prompt) }]
        : [{ role: "user", content: String(incoming.text || incoming.input || "") }]);

    // لو مفيش رسالة واضحة
    if (!messages?.[0]?.content) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing prompt/messages in request body" }),
      };
    }

    const payload = {
      model,
      messages,
      temperature: incoming.temperature ?? 0.2,
      // لو عايز fallback logic لاحقاً ممكن نضيفه
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Headers اختيارية لكن مفيدة مع OpenRouter
        "HTTP-Referer": "https://super-sfogliatella-edee76.netlify.app",
        "X-Title": "Royal Ray Zone",
      },
      body: JSON.stringify(payload),
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
};
