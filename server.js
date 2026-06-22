const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CHATS_DIR = path.join(__dirname, 'chats');
if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR);

const MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
const MODEL = 'mimo-v2.5-pro';

function getChatPath(id) {
  return path.join(CHATS_DIR, `${id}.json`);
}

function loadChat(id) {
  const p = getChatPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function saveChat(chat) {
  fs.writeFileSync(getChatPath(chat.id), JSON.stringify(chat, null, 2));
}

function listChats() {
  return fs.readdirSync(CHATS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const chat = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf-8'));
      return {
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function generateTitle(firstMessage) {
  const text = firstMessage.slice(0, 60);
  return text.length < firstMessage.length ? text + '…' : text;
}

// Routes
app.get('/api/chats', (req, res) => {
  res.json(listChats());
});

app.get('/api/chats/:id', (req, res) => {
  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json(chat);
});

app.post('/api/chats', (req, res) => {
  const id = uuidv4();
  const now = new Date().toISOString();
  const chat = {
    id,
    title: 'New Chat',
    createdAt: now,
    updatedAt: now,
    messages: []
  };
  saveChat(chat);
  res.json(chat);
});

app.delete('/api/chats/:id', (req, res) => {
  const p = getChatPath(req.params.id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

app.patch('/api/chats/:id/title', (req, res) => {
  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Not found' });
  chat.title = req.body.title;
  chat.updatedAt = new Date().toISOString();
  saveChat(chat);
  res.json({ ok: true });
});

// Main chat endpoint — streaming SSE
app.post('/api/chats/:id/message', async (req, res) => {
  const { content, apiKey } = req.body;
  if (!content || !apiKey) return res.status(400).json({ error: 'Missing content or apiKey' });

  const chat = loadChat(req.params.id);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });

  // Add user message
  const userMsg = { role: 'user', content, timestamp: new Date().toISOString() };
  chat.messages.push(userMsg);

  // Update title from first message
  if (chat.messages.filter(m => m.role === 'user').length === 1) {
    chat.title = generateTitle(content);
  }

  // Build message array for API (only role + content, no timestamp)
  const apiMessages = chat.messages.map(m => ({ role: m.role, content: m.content }));

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let assistantContent = '';

  try {
    const response = await axios.post(
      `${MIMO_BASE_URL}/chat/completions`,
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are MiMo, an AI assistant developed by Xiaomi. Today's date: ${new Date().toDateString()}. Your knowledge cutoff date is December 2024.`
          },
          ...apiMessages
        ],
        max_completion_tokens: 4096,
        temperature: 1.0,
        top_p: 0.95,
        stream: true,
        frequency_penalty: 0,
        presence_penalty: 0
      },
      {
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    );

    response.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          break;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            assistantContent += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {}
      }
    });

    response.data.on('end', () => {
      // Save assistant message
      const assistantMsg = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString()
      };
      chat.messages.push(assistantMsg);
      chat.updatedAt = new Date().toISOString();
      saveChat(chat);
      res.write('data: [DONE]\n\n');
      res.end();
    });

    response.data.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3737;
app.listen(PORT, () => console.log(`MiMo Chat running at http://localhost:${PORT}`));
