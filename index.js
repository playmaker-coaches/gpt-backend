import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ====== НАСТРОЙКИ ======
const OPENAI_CHAT_MODEL = "gpt-4.1-mini";
const OPENAI_IMAGE_MODEL = "gpt-image-1";

// ====== ПРОВЕРКА НА ЗАПРОС СХЕМЫ ======
function detectSchemeRequest(text = "") {
  return /схем|схему|схемы|diagram|draw|нарисуй|нарисовать|покажи|показать|рисунок|картинк/i.test(
    text.toLowerCase()
  );
}

// ====== CHAT GPT ======
async function generateText(prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Ты — профессиональный тренер по детскому баскетболу и помощник тренеров школы Playmaker. Ты даёшь чёткие, структурированные, практичные ответы. Схемы ты описываешь ТЕКСТОМ, но НЕ задаёшь вопросов «показать?» — если схема нужна, сервер сам её сгенерирует."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();

  return data.choices?.[0]?.message?.content || "Ошибка генерации ответа";
}

// ====== DALL·E / IMAGE ======
async function generateImage(prompt) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: `Минималистичная чёрно-белая схема для детской баскетбольной тренировки. Вид сверху. 
Конусы — треугольники, игроки — кружки, движение — стрелки.
Подписи на русском языке.
Упражнение: ${prompt}
Чистый фон, без художественных эффектов, стиль — спортивная тактическая схема.`,
      size: "1024x1024"
    })
  });

  const data = await response.json();
  return data.data?.[0]?.url || null;
}

// ====== API ======
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";
    const wantsScheme = detectSchemeRequest(userMessage);

    const replyText = await generateText(userMessage);

    let imageUrl = null;
    let imageUrls = [];

    // ЕСЛИ ХОТЯ БЫ ПОХОЖЕ НА ЗАПРОС СХЕМЫ — ГЕНЕРИМ КАРТИНКУ
    if (wantsScheme) {
      imageUrl = await generateImage(userMessage);
      if (imageUrl) imageUrls.push(imageUrl);
    }

    res.json({
      reply: replyText,
      imageUrl,
      imageUrls
    });
  } catch (err) {
    console.error("Ошибка сервера:", err);
    res.status(500).json({
      error: "Ошибка сервера",
      details: err.message
    });
  }
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
