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
    // Создаём новую ветку
    const thread = await openai.beta.threads.create();

    // Добавляем сообщение пользователя
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    // Запускаем ассистента
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    // Ждём выполнения
    let status = "queued";
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    // Получаем сообщение ассистента
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    const reply = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    // Проверим, нужно ли сгенерировать изображение
    let imageUrl = null;
    const needImage = /схем|картинк|рисунк|изображен/i.test(userMessage);
    if (needImage) {
      const image = await openai.images.generate({
        model: "dall-e-3",
        prompt: userMessage,
        n: 1,
        size: "1024x1024",
      });
      imageUrl = image.data[0].url;
    }

    res.json({ reply, imageUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
