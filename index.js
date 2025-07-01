app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // 1. Создаем новую ветку диалога
    const thread = await openai.beta.threads.create();

    // 2. Отправляем сообщение пользователя
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });

    // 3. Запускаем ассистента
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
      response_format: "auto",
    });

    // 4. Ждем окончания ответа ассистента
    let status = "queued";
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      const runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    // 5. Получаем все сообщения ветки
    const messages = await openai.beta.threads.messages.list(thread.id);

    // 6. Ищем последний ответ ассистента с текстом
    const assistantMessage = messages.data.reverse().find((m) => m.role === "assistant");
    const replyText = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    // 7. Дополнительно генерируем картинку через DALL·E по тому же промту
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: userMessage, // Можно модифицировать промт по желанию
      size: "512x512",
      n: 1,
    });

    const imageUrl = imageResponse.data[0].url;

    // 8. Отдаем клиенту и текст, и картинку
    res.json({
      reply: replyText,
      imageUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});
