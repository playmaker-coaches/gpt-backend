const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch"); // Убедись, что в package.json есть "node-fetch": "^2.6.7"
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistant_id = process.env.ASSISTANT_ID;

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // --- 1. Создаем ветку диалога и отправляем запрос ассистенту ---
    const thread = await openai.beta.threads.create();

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    // Ждем, пока ассистент ответит
    let status = "queued";
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    // Получаем все сообщения и последний ответ ассистента
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    const replyText = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    // --- 2. Генерируем картинку через DALL·E ---
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: userMessage,
      size: "512x512",
      n: 1,
    });

    const imageUrl = imageResponse.data[0].url;

    // --- 3. Скачиваем картинку по URL ---
    const imageFetch = await fetch(imageUrl);
    if (!imageFetch.ok) {
      throw new Error("Ошибка при скачивании картинки");
    }

    const contentType = imageFetch.headers.get("content-type");
    const imageBuffer = await imageFetch.buffer();

    // --- 4. Отправляем JSON с текстом и картинкой base64 ---
    res.json({
      reply: replyText,
      imageBase64: imageBuffer.toString("base64"),
      imageContentType: contentType,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
