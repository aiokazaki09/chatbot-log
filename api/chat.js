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
    },
    tamagawa: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSclRVMUX4EHA1-MhMlZb_Ee5gUw3EiZWJobIXDMzyc8DMvCBQ/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://www.tamagawa-sika.com/contact/",
      tel: "078-331-4008",
    },
    masahisa: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfRZ1X2B05ZJFxfevKFFugKwuOxW3-9q1Ltv_duh95R1qEQVA/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://m-dental.net/inquiry/",
      tel: "086-234-5255",
    },
    uruma: {
      specialty: "歯科",
      formUrl:
        "https://docs.google.com/forms/u/0/d/e/1FAIpQLSel3Mgus8qTt3Pu-OGaXMvuh3ew8n5spj1ne-46v9AYQQh4jQ/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://1st-dc.com/contact/",
      tel: "098-973-8010",
    },
    // ▼ oiki（耳鼻科）：サイト限定回答モード＋医院目線
    oiki: {
      specialty: "耳鼻科",
      formUrl:"https://docs.google.com/forms/u/0/d/e/1FAIpQLSfQ1jboQd0YxoTZ3U_pfUHWNk6zsKYdDKj906AJVBiV9ab-sw/formResponse",
      entries: { user: "entry.1291744880", bot: "entry.373821226" },
      reservationUrl: "https://oikiiin.reserve.ne.jp/sp/index.php?",

      // --- サイト限定回答ガード ---
      siteOnlyMode: true,                         // サイト外の回答を抑制
      siteUrl: "https://www.oikiiin.com/",        // 参照サイト
      inquiryUrl: "https://www.oikiiin.com/",     // ★要差し替え：お問い合わせURL
      siteFallbackText:
        `当院サイト（{SITE_URL}）に記載のない内容のため、個別確認が必要です。お手数ですが「お電話」または「お問い合わせ」からご相談ください。`,

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
緊急性が疑われる場合は直ちに119または救急相談（#7119等）を案内してください。
回答の最後に「予約リンク」と「電話相談」を促してください。
`,
    歯科: `
患者さんは歯・歯ぐき・噛み合わせ・インプラント・矯正などのお悩みを想定。
痛みの強さ、発症時期、詰め物/被せ物の脱離、外傷（歯の破折/脱臼）、腫れや発熱の有無などを優しく確認し、
応急対応（うがいは水で、患部は冷やし過ぎない等）の一般情報と受診目安を案内してください。
`,
    内科: `
患者さんは発熱・咳・喉痛・腹痛・下痢・吐き気・頭痛・生活習慣病相談等を想定。
重篤サイン（強い胸痛/息苦しさ/意識障害/ろれつ不良/片側の麻痺/激しい頭痛/血便など）は即時救急を案内。
それ以外は受診目安（症状の持続時間、重症度、基礎疾患、妊娠中か等）を丁寧に確認し、適切に来院/オンライン/電話相談を促してください。
`,
    皮膚科: `
発疹・かゆみ・湿疹・蕁麻疹・にきび・やけど等を想定。
広がり・発熱の有無・痛み/膿・使用中の外用/内服・アレルギー歴などを確認し、
市販薬の自己判断は控える旨と適切な受診案内をしてください。
`,
    耳鼻科: `
患者さんは耳・鼻・喉に関する症状（耳の痛み・耳だれ・耳の詰まり感、鼻づまり・鼻水・副鼻腔炎、喉の痛み・声のかすれ・いびき等）を想定。
症状の持続期間、発熱の有無、聞こえの変化、強いめまいや吐き気、耳や顔の腫れ、呼吸のしにくさなどを優しく確認してください。
強い耳の痛み・急な難聴・激しいめまい・呼吸困難などは救急受診を案内し、
それ以外は受診目安（急ぎか様子見可か）をわかりやすく伝えてください。
`,
  };

  // クリニック用に最終systemプロンプトを構築
  const buildSystemPrompt = (config) => {
    const common = specialtyPrompts["共通"] || "";
    const byDept = specialtyPrompts[config.specialty] || "";
    const clinicTail = `
ここは「${config.specialty}」の医療機関です。予約や電話の案内は必ず末尾に含めてください。
宣伝ではなく、患者さんの不安を軽くする実務的な案内を心がけてください。`;

    const merged = [common, byDept, clinicTail].filter(Boolean).join("\n");

    // クリニック専用プロンプトがあれば反映
    if (config.promptOverride) {
      return config.promptReplace ? config.promptOverride : [merged, config.promptOverride].join("\n");
    }
    return merged;
  };

  const apiKey = process.env.OPENAI_API_KEY;
  const endpoint = "https://api.openai.com/v1/chat/completions";
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini"; // 任意差し替え可

  try {
    // ChatGPTへ送信
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(config),
          },
          {
            role: "user",
            content: userMessage,
          },
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

    const gptReply = data?.choices?.[0]?.message?.content || "うまく回答できませんでした。";

    // 文単位で改行（日本語の句点で区切る）
    const formatReply = (text) => text.replace(/。(?=[^\n])/g, "。\n");
    const formattedReply = formatReply(gptReply);

    // 予約導線（URL・電話）
    const telDigits = (config.tel || "").replace(/\D/g, ""); // 数字以外を除去
    const replyWithLink = `${formattedReply}

— — —
▼ご予約はこちら  
<a href="${config.reservationUrl}" target="_blank" rel="noopener noreferrer">${config.reservationUrl}</a>

▼お電話でのご相談  
<a href="tel:${telDigits}">${config.tel}</a>

※ 激しい痛み・呼吸困難・意識障害など緊急性が疑われる場合は、ただちに119番や#7119等の救急相談をご利用ください。`;

    // Googleフォーム送信（Q/Aログ）※失敗しても主処理は継続
    const formData = new URLSearchParams();
    formData.append(config.entries.user, userMessage);
    formData.append(config.entries.bot, replyWithLink);

    fetch(config.formUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }).catch((err) => {
      console.error("❌ Googleフォーム送信失敗:", err?.message);
    });

    return res.status(200).json({ reply: replyWithLink });
  } catch (error) {
    console.error("❌ ChatGPT API接続エラー:", error);
    return res.status(500).json({ error: "ChatGPTへの接続に失敗しました。" });
  }
}
