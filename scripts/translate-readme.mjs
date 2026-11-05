
import fs from "node:fs/promises";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";

const language = process.argv[2];
const outputFile = process.argv[3] || `languages/README.${language}.md`;

const languageNames = {
  fr: "French",
  ru: "Russian",
  es: "Spanish",
};

if (!API_KEY) {
  throw new Error("GEMINI_API_KEY is missing.");
}

if (!languageNames[language]) {
  throw new Error(`Unsupported language: ${language}`);
}

const source = await fs.readFile("README.md", "utf8");

const prompt = `
Translate the following Markdown README into ${languageNames[language]}.

IMPORTANT RULES:
- Preserve all Markdown formatting.
- Preserve headings, lists, tables and blockquotes.
- Preserve code blocks exactly without translating code.
- Preserve HTML tags and HTML comments.
- Preserve URLs, image links, badges and Markdown link destinations.
- Preserve filenames, commands, code identifiers and technical terms.
- Translate explanatory text naturally.
- Do not summarize or omit any content.
- Return ONLY the translated Markdown.
- Do not wrap the result in Markdown code fences.

SOURCE README:

${source}
`;

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
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
        maxOutputTokens: 8192,
      },
    }),
  }
);

const data = await response.json();

if (!response.ok) {
  throw new Error(
    `Gemini API error (${response.status}): ${
      data.error?.message || JSON.stringify(data)
    }`
  );
}

const translatedText = data.candidates?.[0]?.content?.parts
  ?.map((part) => part.text || "")
  .join("");

if (!translatedText?.trim()) {
  throw new Error("Gemini returned an empty translation.");
}

await fs.mkdir("languages", { recursive: true });
await fs.writeFile(outputFile, translatedText.trim() + "\n", "utf8");

console.log(`Successfully translated README into ${languageNames[language]}`);
console.log(`Saved: ${outputFile}`);
