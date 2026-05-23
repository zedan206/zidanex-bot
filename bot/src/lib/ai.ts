import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function chatAI(prompt: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "أنت مساعد ذكي ودود في سيرفر ديسكورد عربي. أجب بالعربية بشكل واضح ومختصر ومفيد.",
      },
      { role: "user", content: prompt },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || "ما عندي رد الآن، جرب مرة ثانية.";
}

export async function translateToArabic(text: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "أنت مترجم محترف. ترجم النص التالي إلى العربية الفصحى بشكل دقيق وطبيعي. أعد الترجمة فقط بدون شروحات.",
      },
      { role: "user", content: text },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || text;
}

export async function textToSpeech(text: string): Promise<Buffer> {
  const res = await openai.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input: text,
    response_format: "opus",
  });
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function generateImage(prompt: string): Promise<Buffer> {
  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image generation failed");
  return Buffer.from(b64, "base64");
}
