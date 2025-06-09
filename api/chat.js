export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    // プリフライトリクエスト対応
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*"); // CORS許可

  const userMessage = req.body.message || "";
  const fakeReply = `「${userMessage}」についての回答は、準備中です。`;

  const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSdPRoDvoJqylPeEVJh8fpK2GfXBYkQJ-n1GpJ53k96KqGaSjg/formResponse";

  const formData = new URLSearchParams();
  formData.append("entry.373821226", userMessage);
  formData.append("entry.1291744880", fakeReply);
  formData.append("entry.792462004", "");
  formData.append("entry.1582178216", "");
  formData.append("entry.1527040321", "");

  try {
    await fetch(formUrl, {
      method: "POST",
      body: formData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
  } catch (err) {
    console.error("❌ Googleフォーム送信失敗:", err.message);
  }

  res.status(200).json({
    reply: fakeReply
  });
}
