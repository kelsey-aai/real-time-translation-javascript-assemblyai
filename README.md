# Real-time translation app in JavaScript with AssemblyAI

A browser app that captions live speech and translates every finished turn into the language you pick. It streams microphone audio to AssemblyAI's Universal-3.6 Pro Realtime model, and the streaming API's built-in LLM Gateway translation returns each turn's translation over the same WebSocket.

This is the companion repo for the tutorial: [How to build a real-time language translation app in JavaScript with AssemblyAI](https://www.assemblyai.com/blog/how-to-create-a-real-time-language-translation-service-with-assemblyai-and-deepl-in-javascript).

## What's in the repo

| File | What it does |
|------|--------------|
| `server.mjs` | Express server: serves `public/`, serves the SDK's browser streaming bundle at `/vendor`, and mints a temporary streaming token at `GET /token` |
| `public/index.html` | The page: target-language picker, Start/Stop button, status line and the list of turns |
| `public/app.js` | Translation prompt, AudioWorklet microphone capture (16 kHz, 16-bit PCM, 100 ms chunks), rendering by `turn_order`, and the `StreamingTranscriber` session with `llmGateway` |

## Quick start

Requires Node.js 20.6 or later (for `--env-file`).

```bash
git clone https://github.com/kelsey-aai/real-time-translation-javascript-assemblyai
cd real-time-translation-javascript-assemblyai

npm install
cp .env.example .env
# Edit .env and set ASSEMBLYAI_API_KEY (get one at https://www.assemblyai.com/dashboard/signup)

npm start
```

Open http://localhost:3000, pick a target language, press Start and allow the microphone. Speak a sentence and pause: the caption appears as you talk, and the translation fills in underneath when the turn ends.

## How it works

- The API key stays on the server. The page fetches a short-lived token from `/token` and passes it to the SDK, which sends it as the `token` query parameter on the WebSocket.
- Each final turn is translated by LLM Gateway using the prompt in `public/app.js`. `{{turn}}` is the turn text and `{{history_3}}` adds the last three translated turns as context.
- Translations can arrive out of order, so the page matches each one to its turn by `turn_order`. If no translation arrives within 5 seconds, the turn shows "no translation".
- Changing the target language means stopping and starting a new session, because `llm_gateway` is a connection parameter.

## Troubleshooting

- A `500` from `/token` usually means `ASSEMBLYAI_API_KEY` is missing or wrong.
- If captions appear but every turn ends in "no translation", check your account's billing for LLM Gateway.
- Never commit `.env`. It is in `.gitignore`.

## Resources

- [Tutorial: How to build a real-time language translation app in JavaScript with AssemblyAI](https://www.assemblyai.com/blog/how-to-create-a-real-time-language-translation-service-with-assemblyai-and-deepl-in-javascript)
- [Real-time translation docs](https://www.assemblyai.com/docs/streaming/real-time-translation)
- [Temporary tokens](https://www.assemblyai.com/docs/temporary-tokens)
- [LLM Gateway models](https://www.assemblyai.com/docs/llm-gateway/available-models)
- [AssemblyAI JavaScript SDK](https://github.com/AssemblyAI/assemblyai-node-sdk)

## License

MIT
