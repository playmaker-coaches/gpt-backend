const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistant_id = process.env.ASSISTANT_ID;

// Простейший кэш: ключ — промт, значение — URL картинки
const imageCache = new Map();

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // Запрос к ассистенту
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    let status = "queued";
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    const replyText = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    // Генерация картинки
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: userMessage,
      size: "512x512",
      n: 1,
    });

    const imageUrl = imageResponse.data[0].url;

    // Кэшируем URL картинки под ключом — промтом
    imageCache.set(userMessage, imageUrl);

    // Отправляем ответ с текстом и ID картинки (промт)
    res.json({ reply: replyText, imageId: userMessage });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Ошибка на сервере." });
  }
});

// Эндпоинт для отдачи картинки по ID (промту)
app.get("/image", async (req, res) => {
  const { id } = req.query;
  const imageUrl = imageCache.get(id);

  if (!imageUrl) {
    return res.status(404).send("Картинка не найдена");
  }

  try {
    const response = await fetch(imageUrl);
    const contentType = response.headers.get("content-type");
    res.set("Content-Type", contentType);
    response.body.pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send("Ошибка при получении картинки");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
