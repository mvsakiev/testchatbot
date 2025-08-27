// server.js (JSON-ответ без стрима)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();

// Базовая конфигурация
app.use(express.json({ limit: '1mb' }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: false,
  })
);

// Раздаём фронтенд из корня (index.html, styles.css, script.js)
app.use(express.static('.'));

// OpenAI клиент
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// API: обычный JSON без SSE
app.post('/api/answer', async (req, res) => {
  const { question, subject = 'Общий', grade = '7', history = [], settings = {}, dialogId } = req.body || {};
  console.log('[IN]/api/answer', { hasQ: !!question, subject, grade, dialogId });

  if (!question) return res.status(400).json({ error: 'Missing "question"' });

  // Инструкции (аналог system в старом API)
  const instructions = [
    `Ты — дружелюбный учитель по предмету: ${subject}.`,
    `Объясняй на уровне класса: ${grade}.`,
    `Стиль объяснений: ${settings.explainLevel || 'простыми словами'}.`,
    `Если есть формулы — используй KaTeX: $...$, $$...$$ или \`\`\`math блоки.`,
    `Структура ответа: краткое объяснение → шаги/пример → вывод.`
  ].join(' ');

  // История: конвертим 'bot' -> 'assistant'
  const input = [
    ...[].concat(history || []).map(m => ({
      role: m.role === 'bot' ? 'assistant' : (m.role || 'user'),
      content: m.content || ''
    })),
    { role: 'user', content: question }
  ];

  try {
    const r = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      instructions,
      input
    });

    const answer = r?.output?.[0]?.content?.[0]?.text || '';
    // при желании можно добавить sources/quiz, если начнёшь их формировать на бэке
    return res.json({ answer });
  } catch (err) {
    console.error('[OPENAI ERROR]', err);
    return res.status(500).json({ error: 'OpenAI error' });
  }
});

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// Старт сервера
const port = process.env.PORT || 8787;
app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  OPENAI_API_KEY не задан. Установите переменную окружения или .env');
  }
});
