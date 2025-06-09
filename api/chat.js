export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const userMessage = req.body.message || "";
  const apiKey = process.env.OPENAI_API_KEY;

  const endpoint = "https://api.openai.com/v1/chat/completions";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "あなたは親切な歯科医院のスタッフです。" },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    const gptReply = data.choices?.[0]?.message?.content || "回答が見つかりませんでした。";

    // Googleフォームにも送信
    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSdPRoDvoJqylPeEVJh8fpK2GfXBYkQJ-n1GpJ53k96KqGaSjg/formResponse";
    const formData = new URLSearchParams();
    formData.append("entry.373821226", userMessage);
    formData.append("entry.1291744880", gptReply);
    formData.append("entry.792462004", "");
    formData.append("entry.1582178216", "");
    formData.append("entry.1527040321", "");

    fetch(formUrl, {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    }).catch(err => {
      console.error("❌ Googleフォーム送信失敗:", err.message);
    });

    return res.status(200).json({ reply: gptReply });
  } catch (error) {
    console.error("❌ ChatGPT APIエラー:", error);
    return res.status(500).json({ error: "ChatGPTへの接続に失敗しました。" });
  }
}
