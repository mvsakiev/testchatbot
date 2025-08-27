import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: false
}));

// Статическая раздача фронта (положи index.html рядом)
app.use(express.static('.'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Хелпер: написать SSE событие
function writeSSE(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

app.post('/api/answer', async (req, res) => {
  const { question, subject, grade, history = [], settings = {}, dialogId } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing question' });

  // Готовим системный промпт (MVP)
  const system = [
    `Ты — учитель по предмету: ${subject || 'Общий'}.`,
    `Объясняй на уровне класса: ${grade || '7'}.`,
    `Стиль объяснений: ${settings.explainLevel || 'простыми словами'}.`,
    `Если есть формулы — используй KaTeX (строчные $...$ и блочные $$...$$ или \`\`\`math блоки).`,
    `Структурируй ответ: краткое объяснение, затем шаги/пример, затем вывод.`
  ].join(' ');

  // Клиент ждёт SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  try {
    // Используем Responses API со стримингом
    // В официальной документации: при stream: true сервер эмитит SSE события по мере генерации. :contentReference[oaicite:2]{index=2}
    const response = await openai.responses.stream({
      model: 'gpt-4.1-mini', // можешь заменить на свой доступный экономичный модельный вариант
      // Альтернатива: 'gpt-4o-mini' / другой актуальный компактный
      messages: [
        { role: 'system', content: system },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: question }
      ],
      stream: true
    });

    // Подписка на события SDK v4 (стрим текстовых дельт)
    response.on('text.delta', (delta) => {
      writeSSE(res, { type: 'chunk', delta });
    });

    response.on('text.completed', () => {
      writeSSE(res, { type: 'done' });
      res.end();
    });

    response.on('error', (err) => {
      console.error('OpenAI stream error:', err);
      try { writeSSE(res, { type: 'error', message: 'OpenAI error' }); } catch {}
      res.end();
    });
  } catch (err) {
    console.error(err);
    // Если твой тариф/SDK не поддерживает .responses.stream,
    // можно сделать потоковый fetch вручную и парсить SSE (или вернуть обычный JSON).
    res.status(500).json({ error: 'Server error' });
  }
});

// healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
