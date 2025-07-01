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
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: userMessage,
    });
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id,
    });

    let status = "queued";
    let runStatus;
    while (status !== "completed" && status !== "failed") {
      await new Promise((r) => setTimeout(r, 1500));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = runStatus.status;
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const reply = messages.data.find((m) => m.role === "assistant")?.content[0]?.text?.value;

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Произошла ошибка на сервере." });
  }
});

app.listen(3000, () => {
  console.log("GPT backend запущен на http://localhost:3000");
});
