# RRZ — HARA + FMEA + Code Hardening (PWA + Netlify + Gemma)

**Scope:** دمج Panorama داخل تطبيق Royal Ray Zone مع بوابة AI واحدة (Netlify Functions) باستخدام OpenRouter Gemma في مرحلة التجربة، مع تصميم معماري يسمح بالتحويل إلى OpenAI لاحقًا بدون تغيير واجهات أو Workflow.

## 1) HARA (Hazard Analysis & Risk Assessment)

> منهجية مختصرة: تحديد الخطر → السبب → الأثر → الضوابط (Controls) → المتبقي (Residual Risk).

### H1 — توقف خدمة الذكاء الاصطناعي (AI Unavailable)
- **السبب:** انقطاع OpenRouter، خطأ مفتاح API، انتهاء الحصة، انقطاع الإنترنت، Rate limit.
- **الأثر:** تعطل إنتاج التقرير النصي أو تأخره.
- **Controls المُطبقة:**
  1. **Fallback محلي**: Panorama يحتفظ بتقرير محلي (GenerateReportUnified) ويُحسّن بالنموذج فقط إذا نجحت الاستجابة.
  2. **Timeout + Retries**: عميل `shared/aiClient.js` وFunction `ai.js` لديهم وقت أقصى ومحاولات إعادة.
  3. **رسائل صامتة + عدم كسر الواجهة**: فشل AI لا يمنع إظهار النتائج/الماسكات.
- **Residual Risk:** منخفض (يؤثر على الجودة وليس التشغيل).

### H2 — استجابة AI غير صحيحة/هلوسة (Hallucination)
- **السبب:** LLM قد يستنتج أشياء غير موجودة أو يبالغ.
- **الأثر:** تقرير طبي قد يضلل الطبيب إن لم يُراجع.
- **Controls المُطبقة:**
  1. **System Prompt صارم**: “لا تخترع بيانات غير موجودة” + إخراج JSON فقط.
  2. **اقتصار الإدخال على Findings**: نرسل ملخصًا/Findings فقط، لا نرسل صورًا.
  3. **تعريف واضح بأن التقرير مساعد**: الموديول يحفظ مساحة للمراجعة والتعديل قبل الطباعة.
- **Residual Risk:** متوسط (يتطلب اعتماد الطبيب كقرار نهائي).

### H3 — تسرب بيانات المرضى (Privacy/Data Leakage)
- **السبب:** إرسال بيانات تعريفية أو صور إلى مزود خارجي.
- **الأثر:** مخاطر امتثال وسمعة.
- **Controls المُطبقة:**
  1. **عدم إرسال الصور لـ LLM**: فقط JSON Findings.
  2. **حجب المفاتيح داخل Netlify ENV**: لا يوجد API Key في الواجهة.
  3. **حجم إدخال محدود**: `MAX_BODY_CHARS` في `ai.js` لمنع تمرير بيانات كبيرة.
- **Residual Risk:** منخفض إلى متوسط (حسب ما تضعه في payload مستقبلًا).

### H4 — Crash أو تجميد على الموبايل (Memory/CPU)
- **السبب:** صور كبيرة، Canvas overlay، تسريبات Object URLs.
- **الأثر:** تجميد صفحة/إغلاق المتصفح.
- **Controls المُطبقة:**
  1. **إدارة previewUrl**: تحرير Object URL عند تغيير الصورة.
  2. **تقليل Payload للـAI**: قص القائمة إلى 120 عنصر.
  3. **عدم caching لملفات ضخمة ديناميكية** في SW.
- **Residual Risk:** منخفض إذا الصور ضمن حدود طبيعية، متوسط إذا صور ضخمة جدًا.

### H5 — تضارب Service Workers (SW Conflict)
- **السبب:** وجود `sw.js` و`service-worker.js` مع تسجيلات متعددة.
- **الأثر:** Cache قديم/سلوك Offline غير متوقع.
- **Controls المُطبقة:**
  1. توحيد الـCache strategy عبر نفس كود SW (كلا الملفين متطابقين).
  2. إضافة ملفات Panorama + aiClient إلى CORE cache.
- **Residual Risk:** منخفض.

## 2) FMEA (Failure Modes & Effects Analysis)

| Failure Mode | Effect | Likely Causes | Detection | Mitigation implemented |
|---|---|---|---|---|
| Function `ai` returns 5xx | تقرير AI لا يظهر | مزود خارجي/Timeout | console + عدم تغير textarea | retries + timeout + fallback محلي |
| Payload كبير | Function reject/slow | إرسال JSON ضخم | status 413/400 | MAX_BODY_CHARS + قص البيانات |
| API Key missing | فشل دائم | ENV غير مضبوط | رسالة خطأ server | رسالة واضحة + خطوات إعداد |
| Rate limiting | تأخير/فشل | ضغط كبير | 429 | limiter بسيط + retries + backoff |
| JSON parsing fail | تقرير غير مضبوط | نموذج يرجع نص غير JSON | parsing fallback | prompt “JSON only” + parsing fallback |
| Offline PWA stale cache | UI قديم | cache-first بدون تحديث | ملاحظة المستخدم | HTML network-first strategy |

## 3) Code Hardening summary
### Frontend
- `shared/aiClient.js`: Timeout + retries + fallback endpoint.
- Panorama: التقرير المحلي أولًا ثم تحسين بالـAI (غير حاسم لتشغيل الموديول).
- تقليل البيانات قبل الإرسال.

### Backend (Netlify Function)
- Rate limit (best-effort) لكل IP.
- حد أقصى لحجم body.
- Timeout للاتصال بالمزود.
- Prompt مُقيد + إخراج JSON فقط.
- إمكانية تبديل provider (OpenRouter ↔ OpenAI) عبر ENV.

## 4) Upgrade path to OpenAI (No-UI change)
- غيّر فقط متغيرات البيئة:
  - `AI_PROVIDER=openai`
  - `OPENAI_API_KEY=...`
  - `MODEL_TEXT=gpt-4o-mini`
- لا تغيير في ملفات HTML/JS.

