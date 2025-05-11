import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";
import OpenAI from "openai";

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`🟢 AccentRelay WebSocket running on ws://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  console.log("🔗 Client connected");

  let audioChunks = [];
  let selectedAccent = "us";

  ws.on("message", async (message, isBinary) => {
    try {
      if (!isBinary) {
        const data = JSON.parse(message.toString());
        if (data.type === "start") {
          selectedAccent = data.accent || "us";
          return;
        }
      } else {
        audioChunks.push(message);
      }

      if (message.toString() === "stop") {
        console.log("🛑 Stop received, processing...");

        const audioBuffer = Buffer.concat(audioChunks);

        // FormData for Whisper
        const form = new FormData();
        form.append("file", audioBuffer, { filename: "audio.webm", contentType: "audio/webm" });
        form.append("model", "whisper-1");

        const whisperResponse = await axios.post(
          "https://api.openai.com/v1/audio/transcriptions",
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
          }
        );

        const text = whisperResponse.data.text;
        console.log("📃 Transcribed:", text);

        await new Promise(res => setTimeout(res, 1000)); // minor delay to avoid 429

        const ttsResponse = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
          {
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.8,
            },
          },
          {
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            responseType: "stream",
          }
        );

        ttsResponse.data.on("data", (chunk) => ws.send(chunk));
        ttsResponse.data.on("end", () => console.log("✅ Streaming done"));

        audioChunks = [];
      }
    } catch (err) {
      console.error("❌ Error:", err.message);
      ws.send(JSON.stringify({ error: err.message }));
    }
  });

  ws.on("close", () => console.log("❌ Client disconnected"));
});
