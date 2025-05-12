// server.js
import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import axios from "axios";
import { Readable } from "stream";
import FormData from "form-data";
import OpenAI from "openai";

dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: PORT }, () => {
  console.log(`🟢 AccentRelay WebSocket Server running on ws://localhost:${PORT}`);
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
    } catch (err) {
      console.warn("⚠️ Non-JSON message received, skipping:", err.message);
    }

    if (message.toString() === "stop") {
      console.log("🛑 Stop received, processing...");
      const audioBuffer = Buffer.concat(audioChunks);
      const stream = Readable.from(audioBuffer);

      const formData = new FormData();
      formData.append("file", stream, {
        filename: "audio.wav",
        contentType: "audio/wav",
      });
      formData.append("model", "whisper-1");

      try {
        const transcription = await axios.post(
          "https://api.openai.com/v1/audio/transcriptions",
          formData,
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
              ...formData.getHeaders(),
            },
          }
        );

        const text = transcription.data.text;
        console.log("📃 Transcribed Text:", text);

        const response = await axios.post(
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

        response.data.on("data", (chunk) => ws.send(chunk));
        response.data.on("end", () => {
          console.log("✅ Playback complete");
          ws.send(JSON.stringify({ status: "done" }));
        });

      } catch (err) {
        console.error("❌ Error:", err.message);
        ws.send(JSON.stringify({ error: err.message }));
      }

      audioChunks = [];
    }
  });

  ws.on("close", () => console.log("❌ Client disconnected"));
});
