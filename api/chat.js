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

    tamagawa: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSclRVMUX4EHA1-MhMlZb_Ee5gUw3EiZWJobIXDMzyc8DMvCBQ/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://www.tamagawa-sika.com/contact/",
      tel: "078-331-4008",
      showPhone: true,
      showEmergencyNotice: true,
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

    // ▼ oiki（耳鼻科）：サイト限定回答モード＋医院目線
    oiki: {
      specialty: "耳鼻科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfQ1jboQd0YxoTZ3U_pfUHWNk6zsKYdDKj906AJVBiV9ab-sw/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },

      // --- サイト限定回答ガード ---
      siteOnlyMode: true,
      siteUrl: "https://www.oikiiin.com/",
      inquiryUrl: "https://www.oikiiin.com/",
      reservationUrl: "https://oikiiin.reserve.ne.jp/sp/index.php?",

      // oikiでは電話・救急を出さない
      showPhone: false,
      showEmergencyNotice: false,
      reservationLabel: "ご予約はこちら", // 例: 「手術相談のご予約」に変えてもOK
      siteFallbackText:
        "当院サイト（{SITE_URL}）に記載のない内容のため、個別確認が必要です。お手数ですが「お問い合わせ」からご相談ください。",

      // 外出し本文テンプレ（入れたらLLMは呼びません。下の置換キーが使えます）
      // 置換キー: {USER_MESSAGE} / {SITE_URL} / {RESERVATION_URL} / {INQUIRY_URL} / {TEL}
      staticBodyTemplate: null,

      // oiki専用プロンプト（医院目線を強制）
      promptOverride: `
【oiki専用方針：サイト限定回答 & 医院目線】
- 私たちは当院（耳鼻咽喉科）の受付スタッフとして回答します。主語は「当院」にしてください。第三者目線（「こちらの医院」「近くの医院」等）は使いません。
- 回答は当院サイト（https://www.oikiiin.com/）に明記された範囲に限定します。
- サイトに見当たらない事柄は推測や一般論を出さず、次の定型文のみでご案内します：
  「当院サイト（https://www.oikiiin.com/）に記載のない内容のため、個別確認が必要です。お手数ですが『お問い合わせ』からご相談ください。」
- 診断・服薬指示・費用の断定・保険算定等の専門判断は行いません。
- 最後に必ず「予約リンク」をご案内します。
- 個別の症状に対する、診療的な回答をしない。あくまで一般論の回答を行う。
- 症状に関する質問には、HP内の情報のみで回答を完結させてください。
- 電話での相談へ誘導しない。
- できるかぎり手術相談へ誘導する。
- 緊急時の119、#7119への誘導は控えてください。

■確認してほしいポイント（必要な場合のみ簡潔に）
- いつから（急に/徐々に、きっかけ）
- 耳/鼻/喉のどこか、伴う症状（発熱・強いめまい・呼吸のしにくさ等）
- 小児/成人、妊娠中、基礎疾患、服用中薬
- 危険サイン（急な難聴、激しいめまい＋嘔吐、強い耳痛や顔の腫れ、呼吸困難、意識障害、強い喉の腫れ感 等）は救急（119/#7119）を優先案内
      `,
      // true: 共通/科別を無視して完全置換、false: 共通＋科別に追記
      promptReplace: false,

      // 医院別フッター（電話非表示）
      footerTemplate: ({ reservationUrl, inquiryUrl }) => {
        return [
          "— — —",
          `▼ご予約はこちら\n<a href="${reservationUrl}" target="_blank" rel="noopener noreferrer">${reservationUrl}</a>`,
          `\n▼お問い合わせはこちら\n<a href="${inquiryUrl}" target="_blank" rel="noopener noreferrer">${inquiryUrl}</a>`,
        ].join("\n");
      },
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
回答の最後に「予約リンク」と（医院設定に応じて）電話やお問い合わせ導線を促してください。`,
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

  // 文単位で改行（日本語の句点で区切る）
  const formatReply = (text) => (text || "").replace(/。(?=[^\n])/g, "。\n");

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
      `▼${reservationLabel}\n<a href="${cfg.reservationUrl}" target="_blank" rel="noopener noreferrer">${cfg.reservationUrl}</a>`
    );

    const showPhone = cfg.showPhone !== false; // 未指定はtrue
    if (showPhone && cfg.tel) {
      const telDigits = (cfg.tel || "").replace(/\D/g, "");
      const inquiryLabel = cfg.inquiryLabel || "お電話でのご相談";
      rows.push(`\n▼${inquiryLabel}\n<a href="tel:${telDigits}">${cfg.tel}</a>`);
    }
    return rows.join("\n");
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

    // ③ 整形＋フッター＋（医院設定に応じた）緊急注意文
    const formattedReply = formatReply(bodyText);
    const footer = buildFooter(config);

    const showEmergency = config.showEmergencyNotice !== false; // 未指定はtrue
    const emergencyNoticeText = showEmergency && config.emergencyNotice ? `\n\n${config.emergencyNotice}` : "";

    const finalReply = `${formattedReply}\n\n${footer}${emergencyNoticeText}`;

    // ④ Googleフォーム送信（キーが揃っている医院のみ。失敗しても主処理は継続）
    if (config.formUrl && config.entries?.user && config.entries?.bot) {
      const formData = new URLSearchParams();
      formData.append(config.entries.user, userMessage);
      formData.append(config.entries.bot, finalReply);

      fetch(config.formUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      }).catch((err) => {
        console.error("❌ Googleフォーム送信失敗:", err?.message);
      });
    }

    return res.status(200).json({ reply: finalReply });
  } catch (error) {
    console.error("❌ サーバー内部エラー:", error);
    return res.status(500).json({ error: "サーバー内部エラーが発生しました。" });
  }
}
