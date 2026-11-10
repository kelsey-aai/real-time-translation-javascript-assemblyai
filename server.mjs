// server.mjs
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import express from "express";

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
if (!API_KEY) {
  console.error("Set ASSEMBLYAI_API_KEY in .env");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sdkDist = path.join(path.dirname(require.resolve("assemblyai/package.json")), "dist");

const app = express();
app.use(express.static(path.join(here, "public")));

// Serve the SDK's browser streaming bundle, so the page needs no build step.
app.get("/vendor/assemblyai-streaming.js", (req, res) => {
  res.sendFile(path.join(sdkDist, "assemblyai.streaming.umd.min.js"));
});

// Mint a short-lived streaming token. The API key never leaves the server.
app.get("/token", async (req, res) => {
  try {
    const response = await fetch("https://token.assemblyai.com/v1/token", {
      method: "POST",
      headers: { Authorization: API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "streaming",
        expires_in_seconds: 60, // window to open the WebSocket
        max_session_duration_seconds: 1800, // cap each session at 30 minutes
        access: {
          tts: { enabled: false },
          speech_to_speech: { enabled: false },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    const { token } = await response.json();
    res.json({ token });
  } catch (err) {
    console.error("Token request failed:", err.message);
    res.status(500).json({ error: "Could not create a streaming token" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
