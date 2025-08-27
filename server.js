// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();

// ---------- базовая настройка ----------
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: false
}));

// Раздаём фронтенд из той же папки (index.html, styles.css, script.js)
app.use(express.static('.'));

// ---------- OpenAI клиент ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Утилита для отправки SSE событий
function sendSSE(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ---------- API ----------
app.post('/api/answer', async (req, res) => {
  const { question, subject, grade, history = [], settings = {}, dialogId } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Missing "question"' });

  // Инструкции для модели (аналог "system" в старом API)
  const instructions = [
    `Ты — дружелюбный учитель по предмету: ${subject || 'Общий'}.`,
    `Объясняй на уровне класса: ${grade || '7'}.`,
    `Стиль объяснений: ${settings.explainLevel || 'простыми словами'}.`,
    `Если есть формулы — используй KaTeX: $...$, $$...$$ или \`\`\`math блоки.`,
    `Структура ответа: краткое объяснение → шаги/пример → вывод.`
  ].join(' ');

  // История для модели: фронт хранит role 'bot', маппим в 'assistant'
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

  // Если клиент оборвёт соединение — аккуратно завершаем
  let clientClosed = false;
  req.on('close', () => { clientClosed = true; try { res.end(); } catch {} });

  try {
    // ВАЖНО: в Responses API используем input (НЕ messages) + instructions
    const stream = await openai.responses.stream({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions,
      input: [
        ...historyForModel,
        { role: 'user', content: question }
      ],
      stream: true
    });

    // Поток дельт текста
    stream.on('text.delta', (delta) => {
      if (clientClosed) return;
      sendSSE(res, { type: 'chunk', delta });
    });

    // Завершение текста
    stream.on('text.completed', () => {
      if (clientClosed) return;
      sendSSE(res, { type: 'done' });
      res.end();
    });

    // Ошибки стрима
    stream.on('error', (err) => {
      console.error('OpenAI stream error:', err);
      if (!clientClosed) {
        try { sendSSE(res, { type: 'error', message: 'OpenAI error' }); } catch {}
        try { res.end(); } catch {}
      }
    });
  } catch (err) {
    console.error('Handler error:', err);
    if (!clientClosed) res.status(500).json({ error: 'Server error' });
  }
});

// Простой healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- старт сервера ----------
const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY не задан. Установите переменную окружения или .env');
  }
});
