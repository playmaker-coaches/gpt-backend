const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= SYSTEM PROMPT ================= */

const systemPrompt = `
Ты — профессиональный тренер по детскому баскетболу и помощник тренеров.
Твоё имя — Майки.

Твоя цель — быстро и практично помогать:
• планировать тренировки
• подбирать упражнения
• поддерживать мотивацию детей
• давать советы по восстановлению и питанию
• помогать с коммуникацией с родителями

ОСНОВНЫЕ ПРАВИЛА
• Отвечай по сути, без лишней болтовни
• Если данных достаточно — сразу давай решение
• Если данных не хватает — задай только нужные вопросы

СТРУКТУРА ПЛАНА ТРЕНИРОВКИ
ПОСТРОЕНИЕ (2–3 мин)
ПОДГОТОВИТЕЛЬНАЯ ЧАСТЬ (5–7 мин)
ОСНОВНАЯ ЧАСТЬ (~20 мин)
ИГРОВОЕ МОДЕЛИРОВАНИЕ (~15 мин)
ЗАКЛЮЧИТЕЛЬНАЯ ЧАСТЬ (~10 мин)
РЕФЛЕКСИЯ (2–3 мин)

ТРЕБОВАНИЯ К УПРАЖНЕНИЯМ
Для каждого упражнения указывай:
Название, Описание, Инвентарь, Цель, Типичные ошибки, Коррекция, Адаптация

СХЕМЫ
Схемы добавляй ТОЛЬКО если пользователь прямо попросил показать или нарисовать схему.
`;

/* ================= HELPERS ================= */

function extractImagePrompts(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const prompts = [];
  for (const line of lines) {
    const m = line.match(/^\s*@image\s*:\s*(.+?)\s*$/i);
    if (m && m[1]) prompts.push(m[1].trim());
  }
  return prompts;
}

function stripImageDirectives(text) {
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !/^\s*@image\s*:/i.test(line))
    .join("\n")
    .trim();
}

function buildDiagramPrompt(userPrompt) {
  const prefix =
    "Top-down basketball tactical diagram, minimal and clean: court lines, hoop, zones. Players as numbered circles. Solid arrows = player movement. Dashed arrows = ball movement. Cones as small triangles, hoops as small circles. No people, no photos, no decorative text, white or light background. ";
  return `${prefix}${userPrompt}`;
}

/* ================= ROUTE ================= */

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message ?? "";

  try {
    // === 1. Генерация текста ===
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const rawReply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    // === 2. Ищем @image в ответе ассистента
    let imagePrompts = extractImagePrompts(rawReply);

    // === 3. ЕСЛИ пользователь явно просит схему — генерируем её сами
    if (imagePrompts.length === 0) {
      if (/схем|покажи|diagram|draw|нарисуй/i.test(userMessage)) {
        imagePrompts.push(userMessage);
      }
    }

    const replyClean = stripImageDirectives(rawReply);

    // === 4. Генерация изображений
    const imageUrls = [];

    for (const p of imagePrompts) {
      try {
        const isDiagram = /схем|diagram|drill|play|exercise|комбинац/i.test(p);
        const modelName = isDiagram ? "gpt-image-1" : "dall-e-3";
        const promptToSend = isDiagram ? buildDiagramPrompt(p) : p;

        const img = await openai.images.generate({
          model: modelName,
          prompt: promptToSend,
          size: "1024x1024"
        });

        const url = img?.data?.[0]?.url;
        if (url) imageUrls.push(url);
      } catch (e) {
        console.error("Image generation error:", e?.message || e);
      }
    }

    // === 5. Ответ клиенту
    res.json({
      reply: replyClean,
      imageUrls,
      imageUrl: imageUrls[0] || null
    });
  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({
      reply: "Произошла ошибка на сервере.",
      imageUrls: []
    });
  }
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
