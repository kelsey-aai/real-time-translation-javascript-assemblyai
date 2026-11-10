// public/app.js
const SAMPLE_RATE = 16_000;

const recordBtn = document.querySelector("#record");
const languageEl = document.querySelector("#language");
const statusEl = document.querySelector("#status");
const turnsEl = document.querySelector("#turns");

let transcriber = null;
let mic = null;
let isOpen = false;
const rows = new Map(); // turn_order -> row element

// 1. The translation prompt. The server fills in {{history_3}} and {{turn}}.
function buildPrompt(targetLanguage) {
  return [
    "Earlier turns of the conversation, for context only:",
    "{{history_3}}",
    "",
    `Translate the following turn from whatever language is spoken into natural ${targetLanguage}.`,
    "Reply with only the translation:",
    "{{turn}}",
  ].join("\n");
}
// 2. Microphone capture: an AudioWorklet hands raw samples to the page,
//    which converts them to 16-bit PCM and sends 100 ms chunks.
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

async function startMicrophone(onChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const moduleUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: "application/javascript" })
  );
  await ctx.audioWorklet.addModule(moduleUrl);
  URL.revokeObjectURL(moduleUrl);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  source.connect(node);
  node.connect(ctx.destination); // keeps the node running; it outputs silence

  const chunkSamples = SAMPLE_RATE / 10; // 100 ms per chunk
  let chunk = new Int16Array(chunkSamples);
  let filled = 0;

  node.port.onmessage = ({ data }) => {
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      chunk[filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (filled === chunkSamples) {
        onChunk(chunk.buffer);
        chunk = new Int16Array(chunkSamples);
        filled = 0;
      }
    }
  };

  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      ctx.close();
    },
  };
}
// 3. One row per turn, keyed by turn_order, so late translations land in place.
function rowFor(turnOrder) {
  let row = rows.get(turnOrder);
  if (!row) {
    row = document.createElement("div");
    row.className = "turn";
    row.innerHTML = '<p class="source"></p><p class="translation"></p>';
    turnsEl.append(row);
    rows.set(turnOrder, row);
  }
  return row;
}

function showTurn(turn) {
  if (!turn.transcript) return;
  const row = rowFor(turn.turn_order);
  const source = row.querySelector(".source");
  source.textContent = turn.transcript;

  if (turn.end_of_turn) {
    row.classList.add("final");
    if (turn.language_code) source.dataset.lang = turn.language_code;
    const translation = row.querySelector(".translation");
    if (!translation.textContent) {
      translation.textContent = "Translating…";
      translation.classList.add("pending");
      // No LLMGatewayResponse is sent if the gateway call fails or times out.
      setTimeout(() => {
        if (translation.classList.contains("pending")) {
          translation.textContent = "(no translation for this turn)";
        }
      }, 5000);
    }
  }
}

function showTranslation(response) {
  const text = response.data?.choices?.[0]?.message?.content?.trim();
  if (!text) return;
  const translation = rowFor(response.turn_order).querySelector(".translation");
  translation.textContent = text;
  translation.classList.remove("pending");
}
// 4. Start and stop a session.
async function start() {
  recordBtn.disabled = true;
  languageEl.disabled = true;
  statusEl.textContent = "Connecting…";

  const res = await fetch("/token");
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  const { token } = await res.json();

  transcriber = new assemblyai.StreamingTranscriber({
    token,
    sampleRate: SAMPLE_RATE,
    speechModel: "universal-3-6-pro",
    languageDetection: true,
    llmGateway: {
      model: "qwen3.5-4b-32k-fast",
      messages: [{ role: "user", content: buildPrompt(languageEl.value) }],
      max_tokens: 400,
    },
  });

  transcriber.on("turn", showTurn);
  transcriber.on("llmGatewayResponse", showTranslation);
  transcriber.on("error", (error) => {
    console.error(error);
    statusEl.textContent = `Error: ${error.message}`;
  });
  transcriber.on("close", (code, reason) => {
    isOpen = false;
    console.log("Session closed:", code, reason);
  });

  mic = await startMicrophone((pcm) => {
    if (isOpen) transcriber.sendAudio(pcm);
  });
  await transcriber.connect();
  isOpen = true;

  statusEl.textContent = `Listening. Translating into ${languageEl.value}.`;
  recordBtn.textContent = "Stop";
  recordBtn.disabled = false;
}

async function stop() {
  recordBtn.disabled = true;
  mic?.stop();
  mic = null;
  try {
    await transcriber?.close(); // waits for the server to end the session
  } catch (err) {
    console.error(err);
  }
  transcriber = null;
  isOpen = false;

  statusEl.textContent = "Stopped.";
  recordBtn.textContent = "Start";
  recordBtn.disabled = false;
  languageEl.disabled = false;
}

recordBtn.addEventListener("click", async () => {
  try {
    if (transcriber) await stop();
    else await start();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Error: ${err.message}`;
    await stop();
  }
});
