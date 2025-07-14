app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
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
    const reply = assistantMessage?.content?.[0]?.text?.value || "Пустой ответ";

    let imageUrl = null;

    // Если ассистент сказал, что "сейчас сделаю схему", вызываем генерацию изображения
    if (/схем[ауы]|картинк[ауы]/i.test(userMessage)) {
      const image = await openai.images.generate({
        model: "dall-e-3",
        prompt: userMessage, // можно уточнить prompt
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
