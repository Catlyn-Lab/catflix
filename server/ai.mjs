// Subtitle translation by an AI model, through any OpenAI-compatible chat endpoint
// (AI_BASE_URL, AI_API_KEY, AI_MODEL in `.env`).
import { config } from "./config.mjs";

/** The tones offered in the app; "custom" carries the viewer's own short instruction. */
export const TONES = {
  formal: "Formal and polite, as in an official broadcast.",
  neutral: "Natural and neutral, as in a professional subtitle.",
  casual:
    "Casual and relaxed, the way friends talk. For Indonesian, use everyday Jakarta slang (bahasa gaul: gue/lo, nggak, banget, dong, sih) where it fits the speaker.",
  kids: "Simple words and short sentences a child can follow.",
};

export const languageName = (code) => new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;

function instruction(target, tone, custom) {
  const style = tone === "custom" ? `Follow this style: ${custom}` : (TONES[tone] ?? TONES.neutral);
  return [
    `You translate film and TV subtitles into ${languageName(target)}.`,
    `Tone: ${style}`,
    "You receive JSON with `lines` to translate and `before`, the lines just before them (already translated) for context.",
    'Answer with JSON only: {"lines": [...]} with exactly one translated string per input line, in the same order.',
    "Keep each line about as short as the original, keep a line break inside a line where it helps reading, keep names as they are, and add no notes or explanations.",
  ].join("\n");
}

async function ask(lines, before, target, tone, custom) {
  const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.ai.apiKey ? { Authorization: `Bearer ${config.ai.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.ai.model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instruction(target, tone, custom) },
        { role: "user", content: JSON.stringify({ before, lines }) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`the AI answered ${response.status}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  // Some models wrap JSON in a code fence or add words around it.
  const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  const out = JSON.parse(json).lines;
  if (!Array.isArray(out) || out.length !== lines.length)
    throw new Error("the AI returned a different number of lines");
  return out.map((line) => String(line ?? ""));
}

/**
 * Translate a batch of subtitle lines. If the model miscounts, the batch is retried once and then
 * split in halves, down to single lines, so one bad answer never shifts the timing of the rest.
 */
export async function translateWithAi(lines, before, target, tone, custom) {
  try {
    return await ask(lines, before, target, tone, custom);
  } catch (error) {
    try {
      return await ask(lines, before, target, tone, custom);
    } catch {
      if (lines.length === 1) throw error;
      const half = Math.ceil(lines.length / 2);
      const first = await translateWithAi(lines.slice(0, half), before, target, tone, custom);
      const second = await translateWithAi(
        lines.slice(half),
        [...before, ...first].slice(-6),
        target,
        tone,
        custom,
      );
      return [...first, ...second];
    }
  }
}
