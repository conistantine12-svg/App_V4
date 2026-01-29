// ==========================================
// 1. تعريف العناصر والتهيئة
// ==========================================
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const resultsArea = document.getElementById('resultsArea');
const processedImage = document.getElementById('processedImage');
const reportText = document.getElementById('reportText');
const apiUrlInput = document.getElementById('apiUrl');
const apiModeSelect = document.getElementById('apiMode');

const toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
const settingsCard = document.getElementById('settingsCard');

// === Hidden Advanced Settings Toggle (Admin) ===
// Settings are intentionally hidden in the UI to avoid exposing any endpoint/ngrok links to end-users.
// To reveal settings (for configuration/testing), click the tooth icon 7 times quickly.
(function(){
  const brandMark = document.getElementById('rrzBrandMark');
  if (!brandMark) return;
  let taps = 0;
  let timer = null;

  function reset(){
    taps = 0;
    if (timer) { clearTimeout(timer); timer = null; }
  }

  brandMark.addEventListener('click', () => {
    taps += 1;
    if (!timer) timer = setTimeout(reset, 1800);
    if (taps >= 7) {
      document.body.classList.toggle('rrz-show-settings');
      reset();
      // if revealed, focus input for convenience
      try { document.getElementById('apiUrl')?.focus(); } catch(e){}
    }
  });
})();


const chooseBtn = document.getElementById('chooseBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');

const fileMeta = document.getElementById('fileMeta');
const fileNameEl = document.getElementById('fileName');
const fileSizeEl = document.getElementById('fileSize');
const previewWrap = document.getElementById('previewWrap');
const previewImage = document.getElementById('previewImage');

let selectedFile = null;
let previewUrl = null;

// ==========================================
// 2. معالجة أحداث رفع الملفات
// ==========================================

// Restore settings
try {
    const savedUrl = localStorage.getItem('rrz_pano_api_url');
    if (savedUrl && apiUrlInput) apiUrlInput.value = savedUrl;
    const savedMode = localStorage.getItem('rrz_pano_api_mode');
    if (savedMode && apiModeSelect) apiModeSelect.value = savedMode;
} catch (_) {}

// initialize button state on load
updateAnalyzeBtnState();

// UI events
if (toggleSettingsBtn && settingsCard) {
    toggleSettingsBtn.addEventListener('click', () => {
        settingsCard.classList.toggle('collapsed');
    });
}

if (chooseBtn) chooseBtn.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

if (clearBtn) {
    clearBtn.addEventListener('click', () => {
        setSelectedFile(null);
    });
}

if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
        if (selectedFile) runAnalysis(selectedFile);
    });
}

// When user changes API URL, persist and update button state
if (apiUrlInput) {
    apiUrlInput.addEventListener('input', () => {
        try { localStorage.setItem('rrz_pano_api_url', apiUrlInput.value.trim()); } catch (_) {}
        updateAnalyzeBtnState();
    });
}
if (apiModeSelect) {
    apiModeSelect.addEventListener('change', () => {
        try { localStorage.setItem('rrz_pano_api_mode', apiModeSelect.value); } catch (_) {}
    });
}

// عند اختيار ملف عبر الزر
fileInput.addEventListener('change', handleFileSelect);

// تأثيرات السحب والإفلات
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#2563eb';
    dropZone.style.backgroundColor = '#eff6ff';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    dropZone.style.backgroundColor = 'white';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    dropZone.style.backgroundColor = 'white';
    if (e.dataTransfer.files.length) {
        setSelectedFile(e.dataTransfer.files[0]);
    }
});

function handleFileSelect(e) {
    if (e.target.files.length) {
        setSelectedFile(e.target.files[0]);
    }
}

function setSelectedFile(file) {
    selectedFile = file;

    // reset results
    resultsArea.style.display = 'none';
    processedImage.src = '';

    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }

    if (!file) {
        fileInput.value = '';
        fileMeta.style.display = 'none';
        previewWrap.style.display = 'none';
        previewImage.removeAttribute('src');
        updateAnalyzeBtnState();
        return;
    }

    // File meta
    fileNameEl.textContent = file.name || 'image';
    fileSizeEl.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    fileMeta.style.display = 'flex';

    // Preview
    previewUrl = URL.createObjectURL(file);
    previewImage.src = previewUrl;
    previewWrap.style.display = 'block';

    updateAnalyzeBtnState();
}

function updateAnalyzeBtnState() {
    const apiUrl = (apiUrlInput?.value || '').trim();
    analyzeBtn.disabled = !(selectedFile && apiUrl);
}

// ==========================================
// 3. الوظيفة الرئيسية: إرسال الصورة والتحليل
// ==========================================
async function runAnalysis(file) {
    const apiUrl = (apiUrlInput?.value || '').trim();
    if (!apiUrl) {
        alert("⚠️ من فضلك أدخل رابط الـ AI Endpoint أولًا.");
        return;
    }

    const cleanUrl = apiUrl.replace(/\/$/, "");
    const mode = (apiModeSelect?.value || 'auto');

    loader.style.display = 'block';
    if (loaderText) loaderText.textContent = 'جاري التحليل...';
    resultsArea.style.display = 'none';

    try {
        // Preferred: /infer (multipart)
        if (mode === 'infer' || mode === 'auto') {
            const inferRes = await tryInfer(cleanUrl, file);
            if (inferRes) {
                await renderUnifiedResult(inferRes, file);
                loader.style.display = 'none';
                resultsArea.style.display = (window.innerWidth >= 992) ? 'grid' : 'block';
                resultsArea.scrollIntoView({ behavior: 'smooth' });
                return;
            }
        }

        // Fallback: /analyze (base64)
        if (mode === 'analyze' || mode === 'auto') {
            const legacyRes = await tryLegacyAnalyze(cleanUrl, file);
            await renderUnifiedResult(legacyRes, file);
            loader.style.display = 'none';
            resultsArea.style.display = (window.innerWidth >= 992) ? 'grid' : 'block';
            resultsArea.scrollIntoView({ behavior: 'smooth' });
            return;
        }

        throw new Error('No API mode matched');

    } catch (error) {
        console.error(error);
        alert("حدث خطأ في الاتصال.\nتأكد أن السيرفر يعمل وأن الرابط صحيح.");
        loader.style.display = 'none';
    }
}

async function tryInfer(cleanUrl, file) {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch(`${cleanUrl}/infer?conf=0.05&imgsz=1024`, {
        method: 'POST',
        body: fd,
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    });

    if (!res.ok) {
        // If endpoint is missing, allow auto fallback without throwing
        if (res.status === 404 || res.status === 405) return null;
        throw new Error(`Infer failed: ${res.status}`);
    }

    const data = await res.json();
    // Expected: { result: { findings: [...] }, mask_png_base64: "..." }
    if (data && (data.mask_png_base64 || data.result)) return data;
    return null;
}

async function tryLegacyAnalyze(cleanUrl, file) {
    const base64Image = await fileToBase64(file);
    const res = await fetch(`${cleanUrl}/analyze`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ image: base64Image })
    });

    if (!res.ok) {
        throw new Error(`Legacy analyze failed: ${res.status}`);
    }
    return await res.json();
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            try {
                resolve(reader.result.split(',')[1]);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
    });
}

async function renderUnifiedResult(apiData, originalFile) {
    // 1) Build processed image
    if (apiData && apiData.mask_png_base64) {
        // /infer-style: build overlay locally
        const overlayUrl = await buildOverlayFromMask(originalFile, apiData.mask_png_base64);
        processedImage.src = overlayUrl;

        // normalize findings
        const findings = (apiData.result && apiData.result.findings) ? apiData.result.findings : [];
        generateReportUnified(findings, 'infer');
        // AI enhance (best-effort)
        enhanceReportWithAI(findings.map(f=>({label:f.label||f.class||'Unknown', confidence: (typeof f.confidence==='number')?f.confidence: (typeof f.score==='number'?f.score:null)})), { mode: 'infer' });
        return;
    }

    if (apiData && apiData.masked_image) {
        // legacy-style: already a masked/processed image
        processedImage.src = `data:image/jpeg;base64,${apiData.masked_image}`;
        const anns = apiData.annotations || [];
        generateReportUnified(anns, 'legacy');
        // AI enhance (best-effort)
        enhanceReportWithAI(anns.map(a=>({label:a.class||a.label||'Unknown', confidence: (typeof a.score==='number')?a.score: (typeof a.confidence==='number'?a.confidence:null)})), { mode: 'legacy' });
        return;
    }

    // If we get here, response is unknown
    throw new Error('Unknown API response format');
}

async function buildOverlayFromMask(originalFile, maskPngBase64) {
    const imgBitmap = await createImageBitmap(originalFile);

    const maskImg = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = `data:image/png;base64,${maskPngBase64}`;
    });

    // Create canvases
    const w = maskImg.naturalWidth || imgBitmap.width;
    const h = maskImg.naturalHeight || imgBitmap.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw original scaled to mask size
    ctx.drawImage(imgBitmap, 0, 0, w, h);

    // Colorize mask into green with alpha
    const mcan = document.createElement('canvas');
    mcan.width = w;
    mcan.height = h;
    const mctx = mcan.getContext('2d');
    mctx.drawImage(maskImg, 0, 0, w, h);
    const imgData = mctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // green tint: #10b981
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i]; // assuming grayscale mask
        if (v > 10) {
            d[i] = 16;
            d[i + 1] = 185;
            d[i + 2] = 129;
            d[i + 3] = Math.min(160, v); // alpha
        } else {
            d[i + 3] = 0;
        }
    }
    mctx.putImageData(imgData, 0, 0);

    // Draw colored mask on top
    ctx.drawImage(mcan, 0, 0);

    return canvas.toDataURL('image/png');
}

// ==========================================
// 4. توليد التقرير الطبي (تنسيق احترافي نظيف)
// ==========================================
const MODEL_CLASS_NAMES = [
  'Maxillary Sinus','Metal artifact','Coronal Filling','MC','Prosthetic crown',
  'Prosthetic Bridge','Alveolar bone atrophy','Coronal caries',
  'Distal inflammation (Pericoronitis)','Large dental Follicle',
  'Immature root ( open apex & Large root papilla )','Tooth','Remaining Root',
  'Lesion','Periapical Lesion','Nasal septum','Implant','Tooth  impaction',
  'Orthodontic treatment','Endodontic treatment','Missing tooth','Root',
  'Diastema','IAN & MC Canal','Caries','Developing Crown','Periodontal inflammation'
];

const SUPPORTED_CLASS_IDS = [0,2,3,4,5,7,9,11,12,13,14,15,19,20,24,25,26];
const NOT_TRAINED_CLASS_IDS = [1,6,8,10,16,17,18,21,22,23];

const SUPPORTED_LABELS = new Set(SUPPORTED_CLASS_IDS.map(i => MODEL_CLASS_NAMES[i]));
const NOT_TRAINED_LABELS = new Set(NOT_TRAINED_CLASS_IDS.map(i => MODEL_CLASS_NAMES[i]));

function canonicalLabel(label) {
  const s = String(label || '').trim();
  if (/^\d+$/.test(s)) {
    const id = parseInt(s, 10);
    if (!Number.isNaN(id) && MODEL_CLASS_NAMES[id]) return MODEL_CLASS_NAMES[id];
  }
  return s || 'Unknown';
}

function generateReportUnified(items, mode) {
    // تنسيق التاريخ والوقت
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // 1. الترويسة (بدون خطوط)
    let report = "RADIOLOGICAL EXAMINATION REPORT\n";
    report += `Date: ${dateStr}   |   Time: ${timeStr}\n`;
    report += `Modality: Panoramic X-Ray\n\n`; // مسافة فارغة للفصل

    // Normalize to {label, confidence}
    const norm = (items || []).map((it) => {
        if (mode === 'infer') {
            return {
                label: it.label || it.class || 'Unknown',
                confidence: (typeof it.confidence === 'number') ? it.confidence : (typeof it.score === 'number' ? it.score : null)
            };
        }
        // legacy
        return {
            label: it.class || it.label || 'Unknown',
            confidence: (typeof it.score === 'number') ? it.score : (typeof it.confidence === 'number' ? it.confidence : null)
        };
    });

    // counts
    const counts = {};
    norm.forEach((x) => {
        const k = String(x.label || 'Unknown').trim();
        counts[k] = (counts[k] || 0) + 1;
    });

    // 2. Diagnostic summary
    report += "DIAGNOSTIC SUMMARY\n";
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
        report += "• No significant pathological anomalies detected by AI screening.\n";
    } else {
        entries.slice(0, 8).forEach(([k, v]) => {
            report += `• ${formatClassName(k)}: (${v})\n`;
        });
    }

    report += "\n"; // مسافة فارغة للفصل

    // 3. Detailed annotations
    report += "DETAILED ANNOTATIONS\n";
    
    if (norm.length === 0) {
        report += "None.\n";
    } else {
        norm.forEach((item, index) => {
            const classNameEn = formatClassName(item.label);
            const conf = (typeof item.confidence === 'number') ? (item.confidence * 100).toFixed(1) : null;
            report += conf ? `${index + 1}. ${classNameEn} (AI Confidence: ${conf}%)\n` : `${index + 1}. ${classNameEn}\n`;
        });
    }

    report += "\n"; // مسافة فارغة للفصل

    // 4. ملاحظات الطبيب
    report += "PHYSICIAN NOTES & DIAGNOSIS\n";
    report += "(This space is reserved for the attending doctor's clinical assessment...)\n";

    reportText.value = report;
}

// ==========================================
// 4B. تحسين التقرير عبر RRZ AI Gateway (Gemma/OpenRouter)
//    - التقرير المحلي يبقى كـ fallback
//    - يتم استبدال النص فقط إذا نجح الذكاء الاصطناعي
// ==========================================
async function enhanceReportWithAI(normalizedItems, summary) {
    try {
        if (!window.RRZ_AI || typeof window.RRZ_AI.call !== 'function') return;

        // Reduce payload size defensively
        const items = (normalizedItems || []).slice(0, 120).map(x => ({
            label: String(x.label || 'Unknown').slice(0, 80),
            confidence: (typeof x.confidence === 'number') ? Math.max(0, Math.min(1, x.confidence)) : null
        }));

        const resp = await window.RRZ_AI.call('panorama_json_to_report', {
            findings: items,
            summary: summary || {}
        }, { lang: 'ar' });

        if (!resp || resp.ok === false) return;

        const r = resp.result || resp;
        const out = r.findings ? r : (r.result || {});
        const parts = [];
        if (out.findings) parts.push("FINDINGS\n" + out.findings.trim());
        if (out.impression) parts.push("\nIMPRESSION\n" + out.impression.trim());
        if (out.recommendations) parts.push("\nRECOMMENDATIONS\n" + out.recommendations.trim());

        const aiText = parts.join("\n");
        if (aiText && aiText.length > 20) {
            reportText.value = aiText;
        }
    } catch (e) {
        console.warn('AI enhance failed:', e);
    }
}


// دالة تنسيق الأسماء
function formatClassName(name) {
    if (!name) return 'Unknown';
    const n = String(name).trim();
    // Keep original for already human-readable class names, but title-case common snake_case
    if (n.includes('_')) {
        return n.split('_').map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w).join(' ');
    }
    // simple title-case
    return n.charAt(0).toUpperCase() + n.slice(1);
}

// ==========================================
// 5. الطباعة (تصميم Modern + الصورة في الأعلى)
// ==========================================
function printReport() {
    const reportContent = reportText.value;
    const processedImgSrc = processedImage.src;

    if (!processedImgSrc || processedImgSrc === "" || processedImgSrc.includes("window.location")) {
        alert("Please analyze an image first.");
        return;
    }

    const printWindow = window.open('', '', 'width=900,height=700');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Patient Report</title>
            <style>
                /* استيراد خط نظيف للطباعة */
                @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

                body { 
                    font-family: 'Roboto', 'Segoe UI', Arial, sans-serif; 
                    padding: 40px; 
                    color: #333;
                    max-width: 850px;
                    margin: 0 auto;
                }
                
                /* ترويسة التقرير */
                .header-container {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 2px solid #333;
                    padding-bottom: 20px;
                    margin-bottom: 30px;
                }
                .header-left h1 { margin: 0; font-size: 24px; color: #2c3e50; text-transform: uppercase; letter-spacing: 1px; }
                .header-left p { margin: 5px 0 0; color: #7f8c8d; font-size: 14px; }
                .header-right { text-align: right; font-size: 14px; color: #555; }

                /* حاوية الصورة */
                .image-section {
                    text-align: center;
                    margin-bottom: 30px;
                    padding: 10px;
                    background: #f8f9fa;
                    border: 1px solid #e1e4e8;
                    border-radius: 4px;
                }
                .image-section img {
                    max-width: 100%;
                    max-height: 450px;
                    height: auto;
                    display: block;
                    margin: 0 auto;
                }
                
                /* تنسيق نص التقرير */
                .report-body {
                    font-family: 'Roboto', 'Segoe UI', Arial, sans-serif;
                    font-size: 15px;
                    line-height: 1.6;
                    color: #2c3e50;
                    white-space: pre-wrap; /* يحافظ على المسافات والأسطر الجديدة */
                }

                /* عناوين الأقسام داخل النص (تعتمد على تنسيقنا في JS) */
                
                @media print {
                    body { padding: 0; margin: 15mm; }
                    .image-section { background: none; border: 1px solid #ccc; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <!-- ترويسة احترافية -->
            <div class="header-container">
                <div class="header-left">
                    <h1>Radiology Report</h1>
                    <p>AI-Assisted Panoramic Analysis</p>
                </div>
                <div class="header-right">
                    <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-US')}</p>
                    <p><strong>Ref ID:</strong> ${Math.floor(Math.random() * 100000)}</p>
                </div>
            </div>
            
            <!-- الصورة -->
            <div class="image-section">
                <img src="${processedImgSrc}" alt="X-Ray Scan">
            </div>

            <!-- محتوى التقرير -->
            <div class="report-body">${reportContent}</div>

            <script>
                window.onload = function() { 
                    setTimeout(function() {
                        window.print();
                    }, 600);
                }
            </script>
        </body>
        </html>
    `);
    
    printWindow.document.close();
}