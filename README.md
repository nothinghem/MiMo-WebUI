# MiMo Chat

A Claude-like web UI for Xiaomi MiMo API (mimo-v2.5-pro).

## Features
- ✅ Full conversation context — MiMo always remembers what you said earlier in the chat
- ✅ Persistent chat history — saved as JSON files in `/chats/` folder
- ✅ Real-time streaming responses
- ✅ Sidebar with chat list, search, grouped by date
- ✅ Markdown rendering with code highlighting + copy buttons
- ✅ Mobile responsive
- ✅ API key saved in browser localStorage

## Setup

```bash
# Install dependencies
npm install

# Start the server
node server.js
# or
npm start
```

Then open http://localhost:3737

## Usage

1. Enter your MiMo API key (`sk-xxxxx`) in the sidebar bottom
2. Click **Save**
3. Start chatting!

## Chat History

All chats are saved in the `chats/` folder as `.json` files. Each file contains the full message history — this is what enables proper multi-turn context (MiMo always sees the full conversation).

## API Key

Get your API key at: https://api.xiaomimimo.com
