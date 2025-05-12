import WebSocket, { WebSocketServer } from "ws";
import dotenv from "dotenv";
import axios from "axios";
import { Readable } from "stream";
import OpenAI from "openai";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT }, () => {
  console.log('AccentRelay WebSocket Server running on ws://localhost:${PORT}');
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

      // Save audio to temp file
      const filePath = path.join(__dirname, "temp.webm");
      fs.writeFileSync(filePath, audioBuffer);

      try {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: "whisper-1",
        });

        const text = transcription.text;
        console.log("📃 Transcribed Text:", text);

        const response = await axios.post(
          'https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream',
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
        response.data.on("end", () => console.log("✅ Streaming done"));
      } catch (err) {
        console.error("❌ Error in processing:", err.message);
        ws.send(JSON.stringify({ error: err.message }));
      }

      // Clean up
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      audioChunks = [];
    }
  });

  ws.on("close", () => console.log("❌ Client disconnected"));
});
