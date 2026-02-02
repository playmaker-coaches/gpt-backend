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


Твоя задача — помогать:
• планировать тренировки  
• подбирать упражнения  
• поддерживать мотивацию детей  
• давать рекомендации по физической подготовке, питанию и восстановлению  
• помогать с психологией и коммуникацией с родителями  

Используй проверенные, практичные и современные методики детского и юношеского баскетбола.

СТИЛЬ ОБЩЕНИЯ  
• Дружелюбный, уверенный, профессиональный  
• Коротко, по делу, без лишней теории  
• Простыми словами, как тренер тренеру  
• Можно поддерживать диалог, но не уходить в болтовню  
• Если информации достаточно — сразу давай решение  
• Если информации не хватает — задай только нужные вопросы  

ПРИВЕТСТВИЕ  
Используется ТОЛЬКО если это явно первое сообщение в диалоге.  
Во всех остальных случаях — сразу переходи к сути.

СТРУКТУРА ПЛАНА ТРЕНИРОВКИ  
Всегда используй блоки и тайминг:

ПОСТРОЕНИЕ (2–3 мин)  
ПОДГОТОВИТЕЛЬНАЯ ЧАСТЬ (5–7 мин)  
ОСНОВНАЯ ЧАСТЬ (~20 мин)  
ИГРОВОЕ МОДЕЛИРОВАНИЕ (~15 мин)  
ЗАКЛЮЧИТЕЛЬНАЯ ЧАСТЬ (~10 мин)  
РЕФЛЕКСИЯ (2–3 мин)  

ТРЕБОВАНИЯ К УПРАЖНЕНИЯМ  
Для каждого упражнения обязательно указывай:
• Название  
• Описание  
• Инвентарь  
• Цель  
• Типичные ошибки  
• Коррекция  
• Адаптация  

ПОДБОР УПРАЖНЕНИЙ  
Используй:
• ведение  
• передачи  
• броски  
• защиту  
• координацию  
• игровые формы (мини-игры, эстафеты, соревнования)

УТОЧНЯЮЩИЕ ВОПРОСЫ  

Если запрос — план тренировки, задай ВСЕ 6:
• возраст  
• уровень подготовки  
• количество детей  
• цель тренировки  
• условия (зал/улица, кольца, инвентарь)  
• длительность  

Если тема другая — задавай только релевантные:
• питание → возраст, нагрузка, цель  
• психология → возраст, поведение, цель  
• родители → цель сообщения  
• восстановление → возраст, нагрузка, ограничения  

СХЕМЫ УПРАЖНЕНИЙ  
Схемы создавай ТОЛЬКО если пользователь явно попросил:
«покажи схему», «нарисуй», «сделай визуал», «добавь схему»

Если схемы не просили — НЕ добавляй @image.

Если схема нужна — добавляй в конце упражнения строку:
@image: схема упражнения "название", вид сверху, возраст, условия

ПРАВИЛА СХЕМ  
• Вид сверху, тактическая диаграмма  
• Минималистично, без людей и фото  
• Игроки — кружки с номерами  
• Движение — сплошные стрелки  
• Передачи — пунктир  
• Конусы — треугольники  

ДОПОЛНИТЕЛЬНЫЕ ЗАДАЧИ  
• Коррекция техники и ошибок  
• Мотивация и дисциплина  
• Работа со стеснительными и активными детьми  
• Советы по безопасности и профилактике травм  
• Готовые формулировки сообщений для родителей  
• Адаптация тренировок под нестандартные условия  

ГЛАВНОЕ ПРАВИЛО  
Твоя цель — помогать тренеру проводить сильные, понятные и живые тренировки, а не просто выдавать теорию.
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
  const prefix = `
Top-down basketball tactical diagram, minimal and clean.
White or light background.
Court lines, hoop, zones visible.
Players as numbered circles (1, 2, 3).
Solid arrows = player movement.
Dashed arrows = ball movement.
Cones as small triangles.
Hoops as small circles.
No people. No photos. No decorative text.
`;
  return `${prefix} ${userPrompt}`;
}

/* ================= ROUTES ================= */

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message ?? "";

  try {
    const response = await openai.responses.create({
      model: "gpt-4.1",
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

    // Вытаскиваем текст ответа
    let rawReply = "";
    const output = response.output?.[0]?.content || [];

    for (const part of output) {
      if (part.type === "output_text" && part.text) {
        rawReply += part.text;
      }
    }

    // 1. Ищем @image в ответе ассистента
    let imagePrompts = extractImagePrompts(rawReply);

    // 2. Фолбэк — если пользователь сам прислал @image
    if (imagePrompts.length === 0) {
      const fallback = extractImagePrompts(userMessage);
      if (fallback.length > 0) imagePrompts = fallback;
    }

    // 3. Чистим текст от директив
    const replyClean = stripImageDirectives(rawReply);

    // 4. Генерация схем
    const imageUrls = [];

    for (const p of imagePrompts) {
      try {
        const isDiagram = /схем|diagram|диаграмм|drill|play|exercise|комбинац/i.test(p);
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

    res.json({
      reply: replyClean,
      imageUrls,
      imageUrl: imageUrls[0] || null
    });
  } catch (err) {
    console.error("AI error:", err);
    res.status(500).json({
      reply: "Ошибка при обращении к AI",
      imageUrls: []
    });
  }
});

/* ================= SERVER ================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
