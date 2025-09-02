const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistant_id = process.env.ASSISTANT_ID;

/* ===================== helpers ===================== */

/** Достаём весь текст из сообщения ассистента */
function extractAssistantText(message) {
  if (!message?.content) return "";
  try {
    return message.content
      .map((part) => {
        if (part.type === "text" && part.text?.value) return part.text.value;
        if (part.type === "input_text" && part.input_text) return part.input_text;
        return "";
      })
      .join("\n")
      .trim();
  } catch {
    return message?.content?.[0]?.text?.value || "";
  }
}

/** Все строки вида "@image: ..." — в массив промптов */
function extractImagePrompts(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const prompts = [];
  for (const line of lines) {
    const m = line.match(/^\s*@image\s*:\s*(.+?)\s*$/i);
    if (m && m[1]) prompts.push(m[1].trim());
  }
  return prompts;
}

/** Убираем из видимого ответа служебные строки "@image:" */
function stripImageDirectives(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*@image\s*:/i.test(line))
    .join("\n")
    .trim();
}

/** Подкручиваем промпт под чистую баскетбольную схему (вид сверху) */
function buildDiagramPrompt(userPrompt) {
  const prefix =
    "Top-down basketball tactical diagram, minimal and clean: court lines, hoop, zones. Players as numbered circles. Solid arrows = player movement. Dashed arrows = ball movement. Cones as small triangles, hoops as small circles. No people, no photos, no decorative text, white or light background. ";
  return `${prefix}${userPrompt}`;
}

/* ===================== routes ===================== */

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message ?? "";

  try {
    // 1) создаём ветку
    const thread = await openai.beta.threads.create();

    // 2) добавляем сообщение пользователя
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    // 3) запускаем ассистента
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    // 4) ждём завершения
    let status = "queued";
    while (!["completed", "failed", "cancelled", "expired"].includes(status)) {
      await new Promise((r) => setTimeout(r, 1200));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }
    if (status !== "completed") {
      return res
        .status(500)
        .json({ reply: "Ассистент не успел ответить. Повторите попытку.", imageUrls: [] });
    }

    // 5) забираем последнее сообщение ассистента
    const messages = await openai.beta.threads.messages.list(thread.id, { order: "desc", limit: 10 });
    const assistantMessage = messages.data.find((m) => m.role === "assistant");
    const rawReply = extractAssistantText(assistantMessage) || "Пустой ответ";

    // 6) вытаскиваем все @image: ...
    const imagePrompts = extractImagePrompts(rawReply);

    // 7) чистим текст от служебных строк
    const replyClean = stripImageDirectives(rawReply);

    // 8) генерим изображения (гибридная логика)
    const imageUrls = [];
    for (const p of imagePrompts) {
      try {
        // если похоже на схему/диаграмму/дрилл — используем gpt-image-1, иначе dall-e-3
        const isDiagram = /схем|diagram|диаграмм|drill|play|exercise|комбинац/i.test(p);
        const modelName = isDiagram ? "gpt-image-1" : "dall-e-3";
        const promptToSend = isDiagram ? buildDiagramPrompt(p) : p;

        const img = await openai.images.generate({
          model: modelName,
          prompt: promptToSend,
          size: "1024x1024",
        });

        const url = img?.data?.[0]?.url;
        if (url) imageUrls.push(url);
      } catch (e) {
        console.error("Image generation error:", e?.message || e);
      }
    }

    // 9) отдаём клиенту
    res.json({
      reply: replyClean,
      imageUrls,
      imageUrl: imageUrls[0] || null, // для совместимости со старым фронтом
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере.", imageUrls: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
