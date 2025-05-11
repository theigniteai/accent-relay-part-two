import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

export function initWebSocket(server) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    console.log("🔗 Client connected to AccentRelay");

    ws.on("message", async (message) => {
      try {
        const response = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
          {
            text: "Hello! This is your accent changed voice.",
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.8 }
          },
          {
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json"
            },
            responseType: "arraybuffer"
          }
        );

        ws.send(response.data);
      } catch (err) {
        console.error("❌ Error processing audio:", err.message);
        ws.send("ERROR: " + err.message);
      }
    });

    ws.on("close", () => {
      console.log("❌ Client disconnected");
    });
  });
}