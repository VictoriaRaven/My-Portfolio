
import fs from "node:fs/promises";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";

const LANGUAGES = {
  fr: "French",
  ru: "Russian",
  es: "Spanish",
};

if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is missing.");
}

const source = await fs.readFile("README.md", "utf8");

const prompt = `
Translate the following Markdown README into all three languages:
1. French (fr)
2. Russian (ru)
3. Spanish (es)

IMPORTANT:
- Preserve all Markdown formatting.
- Preserve headings, lists, tables and blockquotes.
- Preserve code blocks exactly without translating code.
- Preserve HTML tags and comments.
- Preserve URLs, image links, badges and link destinations.
- Preserve filenames, commands and code identifiers.
- Do not summarize or omit content.
- Translate naturally and accurately.
- Return ONLY valid JSON.
- Do not use Markdown code fences.

Required JSON format:
{
  "fr": "Complete French Markdown translation",
  "ru": "Complete Russian Markdown translation",
  "es": "Complete Spanish Markdown translation"
}

SOURCE README:
${source}
`;

const url =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let data;
let success = false;

for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    console.log(`Gemini request attempt ${attempt}/5`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 24576,
          responseMimeType: "application/json",
        },
      }),
    });

    data = await response.json();

    if (response.ok) {
      success = true;
      break;
    }

    const status = response.status;

    if (![408, 429, 500, 502, 503, 504].includes(status)) {
      throw new Error(
        `Gemini API error (${status}): ${
          data.error?.message || JSON.stringify(data)
        }`
      );
    }

    if (attempt === 5) {
      throw new Error(
        `Gemini failed after 5 attempts: ${
          data.error?.message || status
        }`
      );
    }

    const delay = Math.min(5000 * 2 ** (attempt - 1), 60000);

    console.log(`HTTP ${status}. Waiting ${delay / 1000}s...`);

    await new Promise(resolve => setTimeout(resolve, delay));

  } catch (error) {
    if (error.message.startsWith("Gemini API error")) {
      throw error;
    }

    if (attempt === 5) throw error;

    const delay = Math.min(5000 * 2 ** (attempt - 1), 60000);

    console.log(`Network error. Retrying in ${delay / 1000}s...`);

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

if (!success) {
  throw new Error("Gemini translation request failed.");
}

const candidate = data.candidates?.[0];

if (!candidate) {
  throw new Error("Gemini returned no translation candidate.");
}

if (candidate.finishReason === "MAX_TOKENS") {
  throw new Error(
    "Translation was truncated because the output token limit was reached. No files were updated."
  );
}

const rawText = candidate.content?.parts
  ?.map(part => part.text || "")
  .join("")
  .trim();

if (!rawText) {
  throw new Error("Gemini returned an empty response.");
}

let translations;

try {
  translations = JSON.parse(rawText);
} catch {
  throw new Error("Gemini returned invalid JSON. No files were updated.");
}

// Validate all translations before saving anything.
for (const [code, name] of Object.entries(LANGUAGES)) {
  if (
    typeof translations[code] !== "string" ||
    !translations[code].trim()
  ) {
    throw new Error(`Missing or empty ${name} translation.`);
  }
}

// Save all three translations.
await fs.mkdir("languages", { recursive: true });

for (const [code, name] of Object.entries(LANGUAGES)) {
  const output = `languages/README.${code}.md`;

  await fs.writeFile(
    output,
    translations[code].trim() + "\n",
    "utf8"
  );

  console.log(`Saved ${name}: ${output}`);
}

console.log("All three translations completed successfully!");
