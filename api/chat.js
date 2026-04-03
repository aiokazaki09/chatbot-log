// Node16保険（Node18ならそのままスルー）
if (typeof fetch === "undefined") {
  global.fetch = (await import("node-fetch")).default;
}
export default async function handler(req, res) {
  // --- CORS ---
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { message: userMessage = "", clinicId } = req.body;
  if (!clinicId) return res.status(400).json({ error: "clinicIdが未指定です" });
  console.log("[handler] start", { method: req.method, clinicId });

  // 各医院ごとの設定（予約URL/電話＋診療科）
  const formConfigs = {
    sakura: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/d/e/1FAIpQLSdPRoDvoJqylPeEVJh8fpK2GfXBYkQJ-n1GpJ53k96KqGaSjg/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://sakurashika-clinic.jp/reservation/",
      tel: "098-875-8044",

      // 表示制御（未指定はデフォルトtrue）
      showPhone: true,
      showEmergencyNotice: true,

      // 任意ラベル
      reservationLabel: "ご予約はこちら",
      inquiryLabel: "お電話でのご相談"
    },

    masahisa: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfRZ1X2B05ZJFxfevKFFugKwuOxW3-9q1Ltv_duh95R1qEQVA/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://m-dental.net/inquiry/",
      tel: "086-234-5255",
      showPhone: true,
      showEmergencyNotice: true,
      reservationLabel: "ご予約はこちら",
      inquiryLabel: "お電話でのご相談"
    },

    uruma: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSel3Mgus8qTt3Pu-OGaXMvuh3ew8n5spj1ne-46v9AYQQh4jQ/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://1st-dc.com/contact/",
      tel: "098-973-8010",
      showPhone: true,
      showEmergencyNotice: true,
      reservationLabel: "ご予約はこちら",
      inquiryLabel: "お電話でのご相談"
    },
     yasuda: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSdUp97aKd7Lwto5KCBIuyjKIeheJYdReFyl68ZAvBIJT-1-Og/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://reservation.stransa.co.jp/3776e7de192a5c9830ee492c49550526",
      tel: "0120-87-3015",
      showPhone: true,
      showEmergencyNotice: true,
      reservationLabel: "ご予約はこちら",
      inquiryLabel: "お電話でのご相談"
    },
};
console.log("📌 受信したclinicId:", clinicId); 
const config = formConfigs[clinicId]; 
if (!config) return res.status(400).json({ error: `未対応のclinicIdです: ${clinicId}` });

  // --- 診療科別のプロンプトテンプレ ---
  const specialtyPrompts = {
    共通: `
あなたは医療機関の受付スタッフです。専門用語は避け、やさしく具体的に案内してください。
診断はせず、一般的な情報提供と受診案内に徹してください。
回答の最後に「予約リンク」と（医院設定に応じて）電話やお問い合わせ導線を促してください。
【出力形式】
回答は必ずHTML形式で返してください。
- 重要な語句は <b>太字</b> にする
- 箇条書きは <ul><li>内容</li></ul> を使う
- 注意書きは <div class="r-note">内容</div> で囲む
- 最後のリンクは <a href="URL">ラベル</a> タグで出す
- マークダウン（**や##）は使わない
`,
    歯科: `
患者さんは歯・歯ぐき・噛み合わせ・インプラント・矯正などのお悩みを想定。
痛みの強さ、発症時期、詰め物/被せ物の脱離、外傷（歯の破折/脱臼）、腫れや発熱の有無などを優しく確認し、
応急対応（うがいは水で、患部は冷やし過ぎない等）の一般情報と受診目安を案内してください。`,
    内科: `
発熱・咳・喉痛・腹痛・下痢・吐き気・頭痛・生活習慣病相談等を想定。
重篤サイン（強い胸痛/息苦しさ等）は救急。それ以外は症状の持続時間・重症度等を確認して案内してください。`,
    皮膚科: `
発疹・かゆみ・湿疹・蕁麻疹・にきび・やけど等を想定。
広がり・発熱の有無・痛み/膿・使用中の外用/内服・アレルギー歴などを確認し、受診案内をしてください。`,
    耳鼻科: `
耳・鼻・喉の症状を想定。急な難聴・激しいめまい・呼吸困難などは救急。
それ以外は受診目安（急ぎ/様子見）をわかりやすく。`,
  };

  // クリニック用に最終systemプロンプトを構築
  const buildSystemPrompt = (cfg) => {
    const common = specialtyPrompts["共通"] || "";
    const byDept = specialtyPrompts[cfg.specialty] || "";
    const clinicTail = `
ここは「${cfg.specialty}」の医療機関です。予約や連絡導線は医院設定に従って末尾に含めてください。
宣伝ではなく、患者さんの不安を軽くする実務的な案内を心がけてください。`;

    const merged = [common, byDept, clinicTail].filter(Boolean).join("\n");

    // クリニック専用プロンプトがあれば反映
    if (cfg.promptOverride) {
      return cfg.promptReplace ? cfg.promptOverride : [merged, cfg.promptOverride].join("\n");
    }
    return merged;
  };

const formatReply = (text) => {
  // HTMLタグが含まれている場合はそのまま返す
  if (/<[a-z][\s\S]*>/i.test(text)) return text.trim();

  // プレーンテキストのみ整形
  const s = (text || "").replace(/\r\n?|\r/g, "\n");
  const noSentenceBreaks = s
    .replace(/。\n(?!\n)/g, "。")
    .replace(/(?<!。)\n(?!\n)/g, " ");
  return noSentenceBreaks.replace(/\n{3,}/g, "\n\n").trim();
};

  // 医院ごとのフッター（電話表示の有無や文言を尊重）
  const buildFooter = (cfg) => {
    if (typeof cfg.footerTemplate === "function") {
      return cfg.footerTemplate({
        reservationUrl: cfg.reservationUrl,
        inquiryUrl: cfg.inquiryUrl,
        tel: cfg.tel,
      });
    }
    const rows = ["— — —"];
    const reservationLabel = cfg.reservationLabel || "ご予約はこちら";
    rows.push(
      `▼${reservationLabel}<br><a href="${cfg.reservationUrl}" target="_blank" rel="noopener noreferrer">${cfg.reservationUrl}</a>`
    );

    const showPhone = cfg.showPhone !== false; // 未指定はtrue
    if (showPhone && cfg.tel) {
      const telDigits = (cfg.tel || "").replace(/\D/g, "");
      const inquiryLabel = cfg.inquiryLabel || "お電話でのご相談";
      rows.push(`▼${inquiryLabel}<br><a href="tel:${telDigits}">${cfg.tel}</a>`);
    }
    return rows.join("<br><br>");
  };

  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"; // 任意差し替え可

  try {
    let bodyText;

    // ① 本文の外出し（oikiなど）：入っていればLLMは呼ばない
    if (config.staticBodyTemplate && typeof config.staticBodyTemplate === "string") {
      bodyText = config.staticBodyTemplate
        .replaceAll("{USER_MESSAGE}", userMessage)
        .replaceAll("{SITE_URL}", config.siteUrl || "")
        .replaceAll("{RESERVATION_URL}", config.reservationUrl || "")
        .replaceAll("{INQUIRY_URL}", config.inquiryUrl || "")
        .replaceAll("{TEL}", config.tel || "");
    } else {
      // ② 通常：LLMで本文生成
      if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY が未設定です。" });
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: buildSystemPrompt(config) },
            { role: "user", content: userMessage },
          ],
          temperature: 0.5, // ぶれ少なめで案内安定
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const apiErr = data?.error?.message || "Unknown API error";
        console.error("❌ OpenAI API response not ok:", apiErr);
        return res.status(502).json({ error: `ChatGPT APIエラー: ${apiErr}` });
      }

      bodyText = data?.choices?.[0]?.message?.content || "うまく回答できませんでした。";
    }
const replaceMap = {
  "{USER_MESSAGE}": userMessage,
  "{SITE_URL}": config.siteUrl || "",
  "{RESERVATION_URL}": config.reservationUrl || "",
  "{INQUIRY_URL}": config.inquiryUrl || "",
  "{TEL}": config.tel || "",
};
bodyText = Object.entries(replaceMap).reduce(
  (t, [k, v]) => t.replaceAll(k, v),
  bodyText || ""
);
    // ③ 整形＋フッター＋（医院設定に応じた）緊急注意文
    const formattedReply = formatReply(bodyText);
    const footer = buildFooter(config);

    const showEmergency = config.showEmergencyNotice !== false; // 未指定はtrue
    const emergencyNoticeText = showEmergency && config.emergencyNotice ? `\n\n${config.emergencyNotice}` : "";
    
    const finalReply = `${formattedReply}<hr style="border:none;border-top:1px dashed #f4c0c8;margin:12px 0;">${footer}`;

// === ここから差し替え ===
function normalizeHtml(finalReply) {
  const s = String(finalReply || "").trim();

  // すでにブロックタグを含むHTMLならそのまま返す
  if (/<(p|ul|div|table|br)\b/i.test(s)) return s;

  // プレーンテキストの場合だけ段落変換
  return "<p>" + s
    .replace(/\r\n?/g, "\n")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, " ")
    + "</p>";
}

const htmlReply = normalizeHtml(finalReply);

// ④ Googleフォーム送信（任意）
if (config.formUrl && config.entries?.user && config.entries?.bot) {
  const formData = new URLSearchParams();
  formData.append(config.entries.user, userMessage);
  formData.append(config.entries.bot, htmlReply);         // ← htmlReply を送る
  fetch(config.formUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  }).catch(err => console.error("❌ Googleフォーム送信失敗:", err?.message));
}

return res.status(200).json({ reply: htmlReply });        // ← htmlReply を返す
  } catch (error) {
    console.error("❌ サーバー内部エラー:", error);
    return res.status(500).json({ error: "サーバー内部エラーが発生しました。" });
  }
}
