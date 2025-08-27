// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: false
}));

// Раздаём фронт из корня (index.html, styles.css, script.js)
app.use(express.static('.'));

// OpenAI клиент
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Утилита: отправка SSE
function sendSSE(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.post('/api/answer', async (req, res) => {
  const { question, subject, grade, history = [], settings = {}, dialogId } = req.body || {};
  console.log('[IN]/api/answer', { hasQ: !!question, subject, grade, dialogId });

  if (!question) return res.status(400).json({ error: 'Missing "question"' });

  const instructions = [
    `Ты — дружелюбный учитель по предмету: ${subject || 'Общий'}.`,
    `Объясняй на уровне класса: ${grade || '7'}.`,
    `Стиль объяснений: ${settings.explainLevel || 'простыми словами'}.`,
    `Если есть формулы — используй KaTeX: $...$, $$...$$ или \`\`\`math блоки.`,
    `Структура ответа: краткое объяснение → шаги/пример → вывод.`
  ].join(' ');

  const historyForModel = Array.isArray(history)
    ? history.map(m => ({
        role: m.role === 'bot' ? 'assistant' : (m.role || 'user'),
        content: m.content || ''
      }))
    : [];

  // Заголовки SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  // ВАЖНО: сразу сбросить заголовки, чтобы прокси начал стрим
  res.flushHeaders?.();

  let clientClosed = false;
  req.on('close', () => { clientClosed = true; try { res.end(); } catch {} });

  try {
    const stream = await openai.responses.stream({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions,
      input: [
        ...historyForModel,
        { role: 'user', content: question }
      ],
      stream: true
    });

    stream.on('text.delta', (delta) => {
      if (clientClosed) return;
      sendSSE(res, { type: 'chunk', delta });
    });

    stream.on('text.completed', () => {
      if (clientClosed) return;
      sendSSE(res, { type: 'done' });
      res.end();
    });

    stream.on('error', (err) => {
      console.error('[STREAM ERROR]', err);
      if (!clientClosed) {
        try { sendSSE(res, { type: 'error', message: 'OpenAI error' }); } catch {}
        try { res.end(); } catch {}
      }
    });
  } catch (err) {
    console.error('[HANDLER ERROR]', err);
    if (!clientClosed) res.status(500).json({ error: 'Server error' });
  }
});

// healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 8787;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY не задан');
  }
});
