export default async function handler(req, res) {
  // CORS対応
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

   // 各医院ごとの設定
  const formConfigs = {
    sakura: {
      formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdPRoDvoJqylPeEVJh8fpK2GfXBYkQJ-n1GpJ53k96KqGaSjg/formResponse",
      entries: {
        user: "entry.1291744880", // ユーザー質問
        bot: "entry.373821226" // ボット回答
      },
    reservationUrl: "https://sakurashika-clinic.jp/reservation/",
    tel: "098-875-8044" // 電話番号（半角ハイフンあり）
    },
    tamagawa: {
      formUrl: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSclRVMUX4EHA1-MhMlZb_Ee5gUw3EiZWJobIXDMzyc8DMvCBQ/formResponse",
      entries: {
        user: "entry.1291744880",
        bot: "entry.373821226"
      },
    reservationUrl: "https://www.tamagawa-sika.com/contact/",
    tel: "078-331-4008" // 電話番号（半角ハイフンあり）
    },
    masahisa: {
        formUrl: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSclRVMUX4EHA1-MhMlZb_Ee5gUw3EiZWJobIXDMzyc8DMvCBQ/formResponse",
        entries: {
            user: "entry.1291744880",
            bot: "entry.373821226"
        },
        reservationUrl: "https://m-dental.net/inquiry/",
        tel: "086-234-5255" // 電話番号（半角ハイフンあり）
    },
    uruma: {
        formUrl: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSel3Mgus8qTt3Pu-OGaXMvuh3ew8n5spj1ne-46v9AYQQh4jQ/formResponse",
        entries: {
            user: "entry.1291744880",
            bot: "entry.373821226"
        },
        reservationUrl: "https://1st-dc.com/contact/",
        tel: "098-973-8010" // 電話番号（半角ハイフンあり）
    },
        oiki: {
        formUrl: "https://docs.google.com/forms/u/0/d/e/1FAIpQLSfQ1jboQd0YxoTZ3U_pfUHWNk6zsKYdDKj906AJVBiV9ab-sw/formResponse",
        entries: {
            user: "entry.1291744880",
            bot: "entry.373821226"
        },
        reservationUrl: "https://oiki.atat.jp/i/f.php",
        tel: "0725-47-3113" // 電話番号（半角ハイフンあり）
    }
  // ここに追加可能
  };
  
  // clinicIdの受信確認ログ（デバッグ用）
console.log("📌 受信したclinicId:", clinicId);

// 未定義のclinicIdが渡された場合はエラーにする
if (!formConfigs[clinicId]) {
  return res.status(400).json({ error: `未対応のclinicIdです: ${clinicId}` });
}

const config = formConfigs[clinicId];
const apiKey = process.env.OPENAI_API_KEY;
const endpoint = "https://api.openai.com/v1/chat/completions";


  try {
    // ChatGPTへ送信
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "あなたは親切な歯科医院のスタッフです。専門用語はなるべく避けてわかりやすい回答をお願いします。また、予約を促すような内容にしてください。"
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const gptReply = data.choices?.[0]?.message?.content || "回答が見つかりませんでした。";

    // 回答を文末ごとに改行する関数
    function formatReply(text) {
  return text.replace(/。(?=[^\n])/g, "。\n");
}

    const formattedReply = formatReply(gptReply);

    // 回答に予約リンクと電話番号を追加
    const replyWithLink = `${formattedReply}
    
    ▼ご予約はこちら  
    <a href="${config.reservationUrl}" target="_blank" rel="noopener noreferrer">${config.reservationUrl}</a>
    
    ▼お電話でのご相談はこちら  
    <a href="tel:${config.tel.replace(/-/g, '')}">${config.tel}</a>
    `;

    // Googleフォームに送信
    const formData = new URLSearchParams();
    formData.append(config.entries.user, userMessage);
    formData.append(config.entries.bot, replyWithLink);

    await fetch(config.formUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString() // ←これが必要
    }).catch(err => {
      console.error("❌ Googleフォーム送信失敗:", err.message);
    });

    return res.status(200).json({ reply: replyWithLink });
  } catch (error) {
    console.error("❌ ChatGPT APIエラー:", error);
    return res.status(500).json({ error: "ChatGPTへの接続に失敗しました。" });
  }
}
