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

    // Запускаем ассистента без указания response_format или с "auto"
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto", // Можно также убрать эту строку
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

    // Находим последний ответ ассистента
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    const reply = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GPT backend запущен на http://localhost:${PORT}`);
});
