// netlify/functions/deepseek-polish.js
// Uses OpenRouter + Google Gemma instead of DeepSeek

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "google/gemma-3-12b-it:free";
const FALLBACK_MODEL = "google/gemma-3-4b-it:free";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function callOpenRouter({ apiKey, model, messages }) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`OpenRouter error ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

exports.handler = async (event) => {
  const origin = event.headers.origin;
  const headers = cors(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method Not Allowed" };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: "Missing OPENROUTER_API_KEY" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers, body: "Invalid JSON" };
  }

  const inputText = String(body.text || body.input || "").trim();
  if (!inputText) {
    return { statusCode: 400, headers, body: "Missing text" };
  }

  const system = `You are a dental radiology reporting assistant.
Rewrite the provided text into clear, professional medical English (or Arabic if the input is Arabic),
keeping meaning, adding structure, and fixing grammar.
Do NOT invent findings. If information is missing, keep it neutral.`;

  const messages = [
    { role: "system", content: system },
    { role: "user", content: inputText },
  ];

  const model =
    process.env.MODEL_TEXT ||
    process.env.GEMMA_MODEL ||
    DEFAULT_MODEL;

  const fallback =
    process.env.MODEL_TEXT_FALLBACK ||
    FALLBACK_MODEL;

  try {
    const out = await callOpenRouter({ apiKey, model, messages });
    const polished = out?.choices?.[0]?.message?.content ?? "";
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, model, polished }),
    };
  } catch (e) {
    // fallback attempt
    try {
      const out2 = await callOpenRouter({ apiKey, model: fallback, messages });
      const polished = out2?.choices?.[0]?.message?.content ?? "";
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, model: fallback, polished, fallback: true }),
      };
    } catch (e2) {
      return {
        statusCode: 502,
        headers,
        body: `AI failed: ${String(e2.message || e2)}`,
      };
    }
  }
};
