// Константы
const STORAGE_KEY = 'study-chat-v2';
const MAX_CHARS = 1000;
const API_ENDPOINT = '/api/answer';

// DOM-элементы
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const formEl = document.getElementById('composer');
const subjectEl = document.getElementById('subject');
const gradeEl = document.getElementById('grade');
const charCounterEl = document.getElementById('charCounter');
const sendBtn = document.getElementById('send');

const dialogSelectEl = document.getElementById('dialogSelect');
const newDialogBtn = document.getElementById('newDialog');
const renameDialogBtn = document.getElementById('renameDialog');
const clearDialogBtn = document.getElementById('clearDialog');

const explainLevelEl = document.getElementById('explainLevel');
const typingEl = document.getElementById('typing');

// Экспорт/импорт и прогресс
const exportBtn = document.getElementById('exportDialog');
const importBtn = document.getElementById('importDialog');
const progressBar = document.getElementById('progressBar');

// Состояние
const state = {
  subject: subjectEl?.value || 'Математика',
  grade: gradeEl?.value || '5',
  settings: { autoQuiz: true, explainLevel: explainLevelEl?.value || 'простыми словами' },
  conversations: [],
  activeId: null
};

// Утилиты
function uid() { return Math.random().toString(36).slice(2, 10); }
function nowISO() { return new Date().toISOString(); }

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    Object.assign(state, s);
  } catch {}
}
loadState();

function activeConversation() { return state.conversations.find(c => c.id === state.activeId) || null; }

function ensureConversation() {
  if (!state.activeId || !activeConversation()) {
    const id = uid();
    const conv = { id, title: 'Диалог ' + new Date().toLocaleString(), createdAt: nowISO(), messages: [] };
    state.conversations.push(conv);
    state.activeId = id;
    saveState();
  }
}
ensureConversation();

// UI: диалоги
function rebuildDialogSelect() {
  if (!dialogSelectEl) return;
  dialogSelectEl.innerHTML = '';
  state.conversations.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.title || ('Диалог ' + c.id);
    if (c.id === state.activeId) opt.selected = true;
    dialogSelectEl.appendChild(opt);
  });
}
rebuildDialogSelect();

dialogSelectEl?.addEventListener('change', () => {
  state.activeId = dialogSelectEl.value;
  saveState();
  renderAllMessages();
});

newDialogBtn?.addEventListener('click', () => {
  const id = uid();
  state.conversations.push({ id, title: 'Новый диалог', createdAt: nowISO(), messages: [] });
  state.activeId = id;
  saveState();
  rebuildDialogSelect();
  renderAllMessages();
});

renameDialogBtn?.addEventListener('click', () => {
  const conv = activeConversation(); if (!conv) return;
  const title = prompt('Название диалога:', conv.title || '');
  if (title) { conv.title = title; saveState(); rebuildDialogSelect(); }
});

clearDialogBtn?.addEventListener('click', () => {
  const conv = activeConversation(); if (!conv) return;
  if (confirm('Удалить все сообщения в текущем диалоге?')) {
    conv.messages = [];
    saveState(); renderAllMessages();
  }
});

// Экспорт/импорт диалога
exportBtn?.addEventListener('click', () => {
  const conv = activeConversation(); if (!conv) return;
  const blob = new Blob([JSON.stringify(conv, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = (conv.title || 'dialog') + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

importBtn?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const conv = JSON.parse(text);
      if (!conv?.id || !Array.isArray(conv?.messages)) throw new Error('Неверный формат');
      state.conversations.push(conv); state.activeId = conv.id;
      saveState(); rebuildDialogSelect(); renderAllMessages();
    } catch (e) { alert('Не удалось импортировать: ' + e.message); }
  });
  input.click();
});

// Настройки/контролы
subjectEl?.addEventListener('change', () => { state.subject = subjectEl.value; saveState(); });
gradeEl?.addEventListener('change', () => { state.grade = gradeEl.value; saveState(); });
explainLevelEl?.addEventListener('change', () => { state.settings.explainLevel = explainLevelEl.value; saveState(); });

// Автрост textarea и счётчик
function autoGrowTextarea() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(180, inputEl.scrollHeight) + 'px';
}
inputEl?.addEventListener('input', () => {
  autoGrowTextarea();
  charCounterEl.textContent = `${inputEl.value.length} / ${MAX_CHARS}`;
});
autoGrowTextarea();
charCounterEl.textContent = `${inputEl.value.length} / ${MAX_CHARS}`;

// Рендер Markdown+KaTeX безопасно
function sanitize(html) {
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(html, {
      ALLOWED_ATTR: ['href','title','target','rel','class','id','aria-label','role','data-*'],
      ALLOWED_TAGS: false,
      ADD_ATTR: ['data-line-number'],
      ADD_TAGS: ['math','mrow','mi','mn','mo','msup','msub','mfrac','msqrt','mtable','mtr','mtd'],
      FORBID_ATTR: ['style','on*'],
      FORBID_TAGS: []
    });
  }
  const div = document.createElement('div'); div.textContent = html; return div.innerHTML;
}

function renderMarkdown(text) {
  if (window.marked) {
    window.marked.setOptions({ gfm: true, breaks: true });
    const raw = window.marked.parse(text);
    const withTargets = raw.replaceAll('<a ', '<a rel="noopener noreferrer" target="_blank" ');
    return sanitize(withTargets);
  }
  return sanitize(text);
}

function enhanceContent(containerEl) {
  // Подсветка кода
  if (window.hljs) {
    containerEl.querySelectorAll('pre code').forEach((block) => {
      try { hljs.highlightElement(block); } catch {}
    });
  }
  // KaTeX автопоиск
  if (window.renderMathInElement) {
    try {
      renderMathInElement(containerEl, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '```math', right: '```', display: true }
        ],
        throwOnError: false
      });
    } catch {}
  }
}

// Сообщения
function addMessageToState(role, content, extra = {}) {
  const conv = activeConversation(); if (!conv) return null;
  const msg = { id: uid(), role, content, createdAt: nowISO(), ...extra };
  conv.messages.push(msg);
  saveState();
  return msg;
}

function createMessageBubble(msg) {
  const div = document.createElement('div');
  div.className = `bubble ${msg.role === 'user' ? 'me' : 'bot'}`;
  div.dataset.id = msg.id;
  div.setAttribute('role', 'article');

  const actions = document.createElement('div');
  actions.className = 'actions';

  // копировать
  const copyBtn = document.createElement('button');
  copyBtn.className = 'icon-btn'; copyBtn.title = 'Копировать';
  copyBtn.textContent = '📋';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(msg.content || '');
  });
  actions.appendChild(copyBtn);

  // Стоп (если сейчас стримим)
  if (msg.role === 'bot' && window.__streaming && window.__streaming.msgId === msg.id) {
    const stopBtn = document.createElement('button');
    stopBtn.className = 'icon-btn'; stopBtn.title = 'Остановить';
    stopBtn.textContent = '⏹';
    stopBtn.addEventListener('click', (e) => { e.stopPropagation(); stopGeneration(); toggleProgress(false); hideTypingIndicator(); });
    actions.appendChild(stopBtn);
  }

  // Повторить ответ
  if (msg.role === 'bot') {
    const regenBtn = document.createElement('button');
    regenBtn.className = 'icon-btn'; regenBtn.title = 'Сгенерировать заново';
    regenBtn.textContent = '🔁';
    regenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const conv = activeConversation();
      const idx = conv.messages.findIndex(m => m.id === msg.id);
      const prevUser = [...conv.messages.slice(0, idx)].reverse().find(m => m.role === 'user');
      if (prevUser) { inputEl.value = prevUser.content; autoGrowTextarea(); formEl.requestSubmit(); }
    });
    actions.appendChild(regenBtn);
  }

  const content = document.createElement('div');
  content.className = 'content';
  content.innerHTML = renderMarkdown(msg.content || '');

  div.appendChild(actions);
  div.appendChild(content);

  // возможно: отрендерить квиз, источники и т.д. (если приедут от бэка)
  // if (msg.quiz) { ... }

  // улучшения (подсветка/формулы)
  enhanceContent(div);

  return div;
}

function addMessageToDOM(msg) {
  messagesEl.appendChild(createMessageBubble(msg));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function renderAllMessages() {
  messagesEl.innerHTML = '';
  const conv = activeConversation(); if (!conv) return;
  conv.messages.forEach(m => addMessageToDOM(m));
}
renderAllMessages();

function showTypingIndicator() { typingEl.hidden = false; }
function hideTypingIndicator() { typingEl.hidden = true; }
function toggleProgress(on) {
  if (!progressBar) return;
  progressBar.hidden = !on;
  progressBar.setAttribute('aria-hidden', String(!on));
}
function rerenderSingle(messageId) {
  const conv = activeConversation(); if (!conv) return;
  const idx = conv.messages.findIndex(m => m.id === messageId);
  const old = messagesEl.querySelector(`.bubble[data-id="${messageId}"]`);
  const fresh = createMessageBubble(conv.messages[idx]);
  if (old) old.replaceWith(fresh); else messagesEl.appendChild(fresh);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ---- Сетевой слой: запрос к бэкенду с потоковой доставкой ----
let abortCtrl = null;
function stopGeneration() { if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; } }

async function askBackend(payload, onDelta, onDone, onError) {
  try {
    abortCtrl = new AbortController();
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortCtrl.signal
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ctype = res.headers.get('content-type') || '';

    if (ctype.includes('text/event-stream')) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          const evt = JSON.parse(data);
          if (evt.type === 'chunk') onDelta?.(evt.delta || '');
          if (evt.type === 'done') { onDone?.(evt); done = true; break; }
        }
      }
      return;
    }

    // fallback: обычный JSON
    const json = await res.json();
    if (json?.answer) onDelta?.(json.answer);
    onDone?.(json || {});
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError?.(err);
  } finally { abortCtrl = null; window.__streaming = null; }
}

// Отправка формы
formEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = (inputEl.value || '').trim();
  if (!text) return;

  const conv = activeConversation();
  const userMsg = addMessageToState('user', text, { meta:{ subject: state.subject, grade: state.grade, explainLevel: state.settings.explainLevel } });
  addMessageToDOM(userMsg);

  inputEl.value = ''; autoGrowTextarea(); charCounterEl.textContent = `0 / ${MAX_CHARS}`;

  showTypingIndicator(); toggleProgress(true);

  const history = conv ? conv.messages.map(({ role, content }) => ({ role, content })) : [];

  // Подготовим "пустое" сообщение бота для стрима
  const botMsg = addMessageToState('bot', '');
  addMessageToDOM(botMsg);
  window.__streaming = { msgId: botMsg.id };

  askBackend(
    {
      question: text,
      subject: state.subject,
      grade: state.grade,
      dialogId: state.activeId,
      settings: state.settings,
      history
    },
    // onDelta
    (delta) => {
      hideTypingIndicator();
      const conv2 = activeConversation();
      const t = conv2.messages.find(m => m.id === botMsg.id);
      t.content += delta;

      // перерисовать только контент
      const bubbleContent = messagesEl.querySelector(`.bubble[data-id="${botMsg.id}"] .content`);
      if (bubbleContent) {
        bubbleContent.innerHTML = renderMarkdown(t.content);
        enhanceContent(bubbleContent.parentElement);
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
    },
    // onDone
    (final) => {
      toggleProgress(false);
      hideTypingIndicator();

      const conv2 = activeConversation();
      const t = conv2.messages.find(m => m.id === botMsg.id);
      if (final?.quiz && state.settings?.autoQuiz) t.quiz = final.quiz;
      if (final?.sources) t.sources = final.sources;

      rerenderSingle(botMsg.id);
    },
    // onError
    (err) => {
      toggleProgress(false); hideTypingIndicator();
      const failMsg = addMessageToState('bot', 'Упс! Не удалось получить ответ от сервера. Попробуйте ещё раз.');
      addMessageToDOM(failMsg);
      console.error(err);
    }
  );
});

// Быстрые подсказки
document.querySelectorAll('.hint').forEach(btn => {
  btn.addEventListener('click', () => { inputEl.value = btn.textContent; autoGrowTextarea(); inputEl.focus(); });
});

// Хоткей
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); formEl.requestSubmit(); }
});
