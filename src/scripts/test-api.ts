/**
 * Brute-force DashScope API endpoint discovery script.
 * Tests every known STT and TTS endpoint to find what actually works.
 *
 * Run: bun run src/scripts/test-api.ts
 */

const API_KEY = process.env.DASHSCOPE_API_KEY;
if (!API_KEY) {
  console.error("❌ DASHSCOPE_API_KEY not set. Run: export DASHSCOPE_API_KEY=sk-xxx");
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Create a minimal WAV buffer with a tone so STT has something to work with */
function createTestWav(): Buffer {
  const sampleRate = 16000;
  const durationSec = 1;
  const numSamples = sampleRate * durationSec;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + numSamples * 2, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);   // PCM
  header.writeUInt16LE(1, 22);   // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(numSamples * 2, 40);

  // Generate a 440Hz sine wave (audible tone)
  const data = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000);
    data.writeInt16LE(sample, i * 2);
  }

  return Buffer.concat([header, data]);
}

function separator(title: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"═".repeat(60)}\n`);
}

// ─── LLM Test ──────────────────────────────────────────────────────────────────

async function testLLM(): Promise<string> {
  separator("TEST: LLM (qwen-max via OpenAI compat)");

  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-max",
      messages: [{ role: "user", content: "用一句话介绍尘螨" }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.log(`❌ LLM failed: ${response.status} ${err.substring(0, 200)}`);
    return "你好，这是一段测试语音。";
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  console.log(`✅ LLM works! Response: ${text.substring(0, 100)}`);
  return text;
}

// ─── STT Tests ─────────────────────────────────────────────────────────────────

async function testSTT_NativeMultimodal(model: string): Promise<boolean> {
  console.log(`\n--- STT: ${model} via native multimodal endpoint ---`);

  const wav = createTestWav();
  const base64 = wav.toString("base64");
  const dataUri = `data:audio/wav;base64,${base64}`;

  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "disable",
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ audio: dataUri }],
            },
          ],
        },
        parameters: {
          result_format: "message",
        },
      }),
    });

    const contentType = response.headers.get("content-type") ?? "";
    console.log(`  Status: ${response.status}, Content-Type: ${contentType}`);

    const body = await response.text();

    if (!response.ok) {
      console.log(`  ❌ Error: ${body.substring(0, 300)}`);
      return false;
    }

    const data = JSON.parse(body);
    const text =
      data.output?.choices?.[0]?.message?.content?.[0]?.text ??
      data.output?.choices?.[0]?.message?.content ??
      JSON.stringify(data.output).substring(0, 200);
    console.log(`  ✅ Transcription: "${text}"`);
    return true;
  } catch (err) {
    console.log(`  ❌ Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function testSTT_NativeMultimodalWithText(model: string): Promise<boolean> {
  console.log(`\n--- STT: ${model} via native multimodal (with text prompt) ---`);

  const wav = createTestWav();
  const base64 = wav.toString("base64");
  const dataUri = `data:audio/wav;base64,${base64}`;

  const url = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-SSE": "disable",
      },
      body: JSON.stringify({
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [
                { audio: dataUri },
                { text: "请将这段音频转录为文字。只返回转录的文字内容。" },
              ],
            },
          ],
        },
        parameters: {
          result_format: "message",
        },
      }),
    });

    const body = await response.text();
    console.log(`  Status: ${response.status}`);

    if (!response.ok) {
      console.log(`  ❌ Error: ${body.substring(0, 300)}`);
      return false;
    }

    const data = JSON.parse(body);
    const text =
      data.output?.choices?.[0]?.message?.content?.[0]?.text ??
      data.output?.choices?.[0]?.message?.content ??
      JSON.stringify(data.output).substring(0, 200);
    console.log(`  ✅ Transcription: "${text}"`);
    return true;
  } catch (err) {
    console.log(`  ❌ Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function testSTT_OpenAICompat(model: string): Promise<boolean> {
  console.log(`\n--- STT: ${model} via OpenAI compat chat/completions ---`);

  const wav = createTestWav();
  const base64 = wav.toString("base64");
  const dataUri = `data:audio/wav;base64,${base64}`;

  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  // Try multiple content formats
  const contentFormats = [
    {
      name: "audio_url format",
      content: [
        { type: "audio_url", audio_url: { url: dataUri } },
        { type: "text", text: "请将这段音频转录为文字。" },
      ],
    },
    {
      name: "input_audio format",
      content: [
        { type: "input_audio", input_audio: { data: dataUri, format: "wav" } },
        { type: "text", text: "请将这段音频转录为文字。" },
      ],
    },
  ];

  for (const fmt of contentFormats) {
    console.log(`  Trying ${fmt.name}...`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: fmt.content }],
        }),
      });

      const body = await response.text();

      if (!response.ok) {
        console.log(`    ❌ ${response.status}: ${body.substring(0, 200)}`);
        continue;
      }

      const data = JSON.parse(body);
      const text = data.choices?.[0]?.message?.content ?? "";
      console.log(`    ✅ Response: "${text.substring(0, 100)}"`);
      return true;
    } catch (err) {
      console.log(`    ❌ Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return false;
}

// ─── TTS Tests ─────────────────────────────────────────────────────────────────

async function testTTS_REST(
  name: string,
  url: string,
  body: Record<string, unknown>
): Promise<boolean> {
  console.log(`\n--- TTS: ${name} ---`);
  console.log(`  URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-DataInspection": "disable",
      },
      body: JSON.stringify(body),
    });

    const contentType = response.headers.get("content-type") ?? "";
    console.log(`  Status: ${response.status}, Content-Type: ${contentType}`);

    if (!response.ok) {
      const errBody = await response.text();
      console.log(`  ❌ Error: ${errBody.substring(0, 300)}`);
      return false;
    }

    if (contentType.includes("application/json")) {
      const json = await response.json();
      // Some TTS endpoints return JSON with an audio URL or task_id
      console.log(`  📋 JSON response: ${JSON.stringify(json).substring(0, 300)}`);
      // Check if it's a task-based async response
      if (json.output?.task_id) {
        console.log(`  ⏳ Async task created: ${json.output.task_id}`);
        return true; // Endpoint works, just async
      }
      return false;
    }

    const buffer = await response.arrayBuffer();
    console.log(`  ✅ Got audio: ${buffer.byteLength} bytes`);
    return true;
  } catch (err) {
    console.log(`  ❌ Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function testTTS_OpenAICompat(): Promise<boolean> {
  console.log(`\n--- TTS: OpenAI compat /audio/speech ---`);

  const url = "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/speech";

  const models = ["cosyvoice-v2", "cosyvoice-v1", "sambert-zhichu-v1"];

  for (const model of models) {
    console.log(`  Trying model=${model}...`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: "你好，这是一段测试语音。",
          voice: "alloy",
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok) {
        const errBody = await response.text();
        console.log(`    ❌ ${response.status}: ${errBody.substring(0, 200)}`);
        continue;
      }

      const buffer = await response.arrayBuffer();
      console.log(`    ✅ Got audio: ${buffer.byteLength} bytes, Content-Type: ${contentType}`);
      return true;
    } catch (err) {
      console.log(`    ❌ Fetch error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return false;
}

async function testTTS_CosyVoiceWebSocket(): Promise<boolean> {
  console.log(`\n--- TTS: CosyVoice v2 via WebSocket ---`);

  const wsUrl = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("  ❌ WebSocket timeout (10s)");
      ws.close();
      resolve(false);
    }, 10000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      clearTimeout(timeout);
      console.log(`  ❌ WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`);
      resolve(false);
      return;
    }

    let audioChunks: Buffer[] = [];
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    ws.onopen = () => {
      console.log("  ✅ WebSocket connected");

      // Send run-task message
      const runTask = {
        header: {
          action: "run-task",
          task_id: taskId,
          streaming: "out",
        },
        payload: {
          task_group: "audio",
          task: "tts",
          function: "SpeechSynthesizer",
          model: "cosyvoice-v2",
          parameters: {
            voice: "longxiaochun_v2",
            format: "mp3",
            sample_rate: 22050,
          },
          input: {
            text: "你好，这是一段测试语音。",
          },
        },
        header_extra: {
          "X-DashScope-DataInspection": "disable",
        },
      };

      // DashScope WS requires auth via first message or URL param
      // Try with Authorization header in the message
      const authRunTask = {
        ...runTask,
        header: {
          ...runTask.header,
          authorization: `Bearer ${API_KEY}`,
        },
      };

      ws.send(JSON.stringify(authRunTask));
      console.log("  📤 Sent run-task message");
    };

    ws.onmessage = (event) => {
      const msgData = event.data;

      if (typeof msgData === "string") {
        try {
          const msg = JSON.parse(msgData);
          console.log(`  📨 Received: action=${msg.header?.action}, event=${msg.header?.event}`);

          if (msg.header?.event === "task-failed") {
            console.log(`  ❌ Task failed: ${JSON.stringify(msg.payload).substring(0, 200)}`);
            clearTimeout(timeout);
            ws.close();
            resolve(false);
          }

          if (msg.header?.event === "task-finished") {
            console.log(`  ✅ Task finished! Total audio chunks: ${audioChunks.length}`);
            const totalBytes = audioChunks.reduce((acc, c) => acc + c.length, 0);
            console.log(`  ✅ Total audio bytes: ${totalBytes}`);
            clearTimeout(timeout);
            ws.close();
            resolve(totalBytes > 0);
          }
        } catch {
          console.log(`  📨 Non-JSON text message: ${String(msgData).substring(0, 100)}`);
        }
      } else if (msgData instanceof ArrayBuffer || msgData instanceof Blob) {
        // Binary data = audio
        const buf = msgData instanceof ArrayBuffer
          ? Buffer.from(msgData)
          : Buffer.from(new Uint8Array(0)); // Blob needs async handling
        audioChunks.push(buf);
      }
    };

    ws.onerror = (event) => {
      console.log(`  ❌ WebSocket error: ${String(event)}`);
      clearTimeout(timeout);
      resolve(false);
    };

    ws.onclose = (event) => {
      console.log(`  🔌 WebSocket closed: code=${event.code} reason=${event.reason}`);
      clearTimeout(timeout);
    };
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║     DashScope API Endpoint Discovery - Brute Force       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const results: { name: string; success: boolean }[] = [];

  // ── 1. LLM (known working) ──
  try {
    const llmText = await testLLM();
    results.push({ name: "LLM (qwen-max)", success: true });
  } catch (err) {
    console.log(`❌ LLM fatal: ${err instanceof Error ? err.message : String(err)}`);
    results.push({ name: "LLM (qwen-max)", success: false });
  }

  // ── 2. STT Tests ──
  separator("STT ENDPOINT TESTS");

  // Test 1: qwen3-asr-flash via native multimodal (recommended by librarian)
  const stt1 = await testSTT_NativeMultimodal("qwen3-asr-flash");
  results.push({ name: "STT: qwen3-asr-flash (native multimodal)", success: stt1 });

  // Test 2: qwen2-audio-instruct via native multimodal
  const stt2 = await testSTT_NativeMultimodal("qwen2-audio-instruct");
  results.push({ name: "STT: qwen2-audio-instruct (native multimodal)", success: stt2 });

  // Test 3: qwen-audio-turbo via native multimodal
  const stt3 = await testSTT_NativeMultimodal("qwen-audio-turbo");
  results.push({ name: "STT: qwen-audio-turbo (native multimodal)", success: stt3 });

  // Test 4: qwen2-audio-instruct via native multimodal with text prompt
  const stt4 = await testSTT_NativeMultimodalWithText("qwen2-audio-instruct");
  results.push({ name: "STT: qwen2-audio-instruct (native + text)", success: stt4 });

  // Test 5: sensevoice-v1 via native multimodal
  const stt5 = await testSTT_NativeMultimodal("sensevoice-v1");
  results.push({ name: "STT: sensevoice-v1 (native multimodal)", success: stt5 });

  // Test 6: qwen2-audio-instruct via OpenAI compat (audio_url and input_audio)
  const stt6 = await testSTT_OpenAICompat("qwen2-audio-instruct");
  results.push({ name: "STT: qwen2-audio-instruct (OpenAI compat)", success: stt6 });

  // Test 7: qwen-audio-turbo via OpenAI compat
  const stt7 = await testSTT_OpenAICompat("qwen-audio-turbo");
  results.push({ name: "STT: qwen-audio-turbo (OpenAI compat)", success: stt7 });

  // ── 3. TTS Tests ──
  separator("TTS ENDPOINT TESTS");

  // Test 1: Sambert via native REST
  const tts1 = await testTTS_REST(
    "sambert-zhichu-v1 (native REST)",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/synthesis",
    {
      model: "sambert-zhichu-v1",
      input: { text: "你好，这是一段测试语音。" },
      parameters: { format: "mp3", sample_rate: 16000 },
    }
  );
  results.push({ name: "TTS: sambert-zhichu-v1 (native REST)", success: tts1 });

  // Test 2: CosyVoice v2 via native REST (known broken, but verify)
  const tts2 = await testTTS_REST(
    "cosyvoice-v2 (native REST - expected to fail)",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/synthesis",
    {
      model: "cosyvoice-v2",
      input: { text: "你好，这是一段测试语音。" },
      parameters: { voice: "longxiaochun_v2", format: "mp3", sample_rate: 22050 },
    }
  );
  results.push({ name: "TTS: cosyvoice-v2 (native REST)", success: tts2 });

  // Test 3: CosyVoice v1 via native REST
  const tts3 = await testTTS_REST(
    "cosyvoice-v1 (native REST)",
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/synthesis",
    {
      model: "cosyvoice-v1",
      input: { text: "你好，这是一段测试语音。" },
      parameters: { voice: "longxiaochun", format: "mp3", sample_rate: 22050 },
    }
  );
  results.push({ name: "TTS: cosyvoice-v1 (native REST)", success: tts3 });

  // Test 4: OpenAI compat /audio/speech
  const tts4 = await testTTS_OpenAICompat();
  results.push({ name: "TTS: OpenAI compat /audio/speech", success: tts4 });

  // Test 5: CosyVoice via WebSocket
  const tts5 = await testTTS_CosyVoiceWebSocket();
  results.push({ name: "TTS: cosyvoice-v2 (WebSocket)", success: tts5 });

  // Test 6: sambert via different REST path
  const tts6 = await testTTS_REST(
    "sambert-zhichu-v1 (alternative path)",
    "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/synthesis",
    {
      model: "sambert-zhichu-v1",
      input: { text: "你好，这是一段测试语音。" },
      parameters: { format: "mp3", sample_rate: 16000 },
    }
  );
  results.push({ name: "TTS: sambert-zhichu-v1 (alt path)", success: tts6 });

  // ── Results Summary ──
  separator("RESULTS SUMMARY");

  let anySTT = false;
  let anyTTS = false;

  for (const r of results) {
    const icon = r.success ? "✅" : "❌";
    console.log(`  ${icon} ${r.name}`);
    if (r.success && r.name.startsWith("STT:")) anySTT = true;
    if (r.success && r.name.startsWith("TTS:")) anyTTS = true;
  }

  console.log("");
  console.log(`  STT: ${anySTT ? "✅ At least one endpoint works" : "❌ No working endpoint found"}`);
  console.log(`  TTS: ${anyTTS ? "✅ At least one endpoint works" : "❌ No working endpoint found"}`);
  console.log("");
}

main().catch((err) => {
  console.error("💥 Fatal:", err);
  process.exit(1);
});
