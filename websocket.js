import { WebSocketServer } from "ws";
import { Readable } from "stream";
import { ElevenLabsClient } from "elevenlabs";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function initWebSocket() {
  const wss = new WebSocketServer({ port: 8080 }, () => {
    console.log("🟢 AccentRelay WebSocket Server Running on ws://localhost:8080");
  });

  wss.on("connection", (ws) => {
    console.log("🔗 WebSocket connected");

    let audioChunks = [];
    let accent = "us";

    ws.on("message", async (data) => {
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "start") accent = parsed.accent || "us";
        } catch (e) {
          console.warn("Non-JSON message received, skipping:", e.message);
        }
        return;
      }

      if (data.toString() === "stop") {
        const audioBuffer = Buffer.concat(audioChunks);
        const audioStream = Readable.from(audioBuffer);

        try {
          const transcript = await openai.audio.transcriptions.create({
            file: audioStream,
            model: "whisper-1",
          });
          const text = transcript.text;
          console.log("Transcribed Text:", text);

          const voices = {
            us: "EXAVITQu4vr4xnSDxMaL",
            uk: "ErXwobaYiN019PkySvjV",
            aus: "MF3mGyEYCl7XYWbV9V6O",
            in: "TX3LPaxmHKxFdv7VOQHJ"
          };

          const tts = await elevenlabs.textToSpeech.convert({
            voiceId: voices[accent] || voices["us"],
            text,
            model_id: "eleven_multilingual_v2"
          });

          const audioData = Buffer.from(await tts.arrayBuffer());
          ws.send(audioData);

        } catch (err) {
          console.error("❌ Error:", err.message);
          ws.send("ERROR: " + err.message);
        }

        audioChunks = [];
      } else {
        audioChunks.push(data);
      }
    });

    ws.on("close", () => console.log("❌ WebSocket disconnected"));
  });
}