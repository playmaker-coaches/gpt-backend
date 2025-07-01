const express = require("express");
const cors = require("cors");
const { OpenAI } = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistant_id = process.env.ASSISTANT_ID;

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // Создаем новую ветку диалога
    const thread = await openai.beta.threads.create();

    // Отправляем сообщение пользователя
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    // Запускаем ассистента с автоформатом ответа
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    // Ожидаем завершения ответа ассистента
    let status = "queued";
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    // Получаем все сообщения в ветке
    const messages = await openai.beta.threads.messages.list(thread.id);

    // Ищем последний ответ ассистента
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    if (!assistantMessage) {
      return res.json({ reply: "Пустой ответ ассистента." });
    }

    // Проверяем, есть ли изображение в ответе
    // Обычно контент — массив объектов с type и value
    // Ищем объект с type "image_url" или похожий
    const imageContent = assistantMessage.content.find(c => c.type === "image_url" || c.type === "image");
    if (imageContent && imageContent.value) {
      return res.json({ image: imageContent.value });
    }

    // Иначе возвращаем текстовый ответ (предполагаем, что первый элемент с type text)
    const textContent = assistantMessage.content.find(c => c.type === "text");
    const replyText = textContent ? textContent.value : "Пустой текстовый ответ";

    res.json({ reply: replyText });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
