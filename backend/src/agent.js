import { getPromptForRole } from "./prompts.js";

// ✅ Safe JSON parser
function parseJSONSafe(raw, log) {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "");

    return JSON.parse(cleaned);
  } catch (err) {
    log?.(`❌ JSON parse failed. Raw output:\n${raw}`);
    return {};
  }
}

// ✅ Retry wrapper
async function withRetry(fn, log, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      log?.(`⚠ Retry ${i + 1} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function callProvider(systemPrompt, userMessage, log) {
  const providerName = (process.env.AI_PROVIDER || "openai").toLowerCase();
  log?.(`🤖 Provider: ${providerName}`);

  return withRetry(async () => {
    if (providerName === "openai") {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });

      return response.choices[0].message.content;
    }

    if (providerName === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      return msg.content[0].text;
    }

    if (providerName === "gemini") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent(userMessage);
      return result.response.text();
    }

    throw new Error(`Unknown AI_PROVIDER: "${providerName}"`);
  }, log);
}

export async function runAgent(role, input, log) {
  const systemPrompt = getPromptForRole(role);
  const userMessage =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);

  log?.(`🤖 Agent started: ${role}`);

  const raw = await callProvider(systemPrompt, userMessage, log);

  log?.(`📥 Agent response received: ${role}`);

  return parseJSONSafe(raw, log);
}