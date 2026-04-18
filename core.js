export function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function tokenize(text) {
  return normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function summarize(text) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length <= 2) return compact.slice(0, 420);

  const first = sentences.slice(0, 2);
  const best = mostInformativeSentence(sentences);
  const combined = [...new Set([...first, best])].join(" ");
  return combined.slice(0, 420);
}

export function mostInformativeSentence(sentences) {
  let winner = "";
  let max = -Infinity;

  for (const sentence of sentences) {
    const words = tokenize(sentence).filter((w) => w.length > 4);
    const score = new Set(words).size + Math.min(sentence.length / 60, 3);
    if (score > max) {
      max = score;
      winner = sentence;
    }
  }

  return winner;
}

export function extractKeywords(text) {
  const stopwords = new Set([
    "và", "là", "của", "cho", "một", "những", "các", "this", "that", "with", "from",
    "được", "trong", "này", "đó", "đang", "rằng", "thì", "khi", "nên", "cũng", "như",
    "the", "and", "for", "are", "was", "have", "has", "into", "you", "your", "what",
  ]);

  const freq = new Map();
  const words = tokenize(text).filter((w) => w.length > 3 && !stopwords.has(w));

  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

export function scorePageQuality(summary, keywords) {
  return clamp(Math.round(summary.length / 12 + keywords.length * 5), 1, 100);
}

export function rankPages({ pages, sources, question, mode = "balanced", topK = 3 }) {
  const queryTokens = tokenize(question);
  const strict = mode === "strict";

  const scored = pages
    .map((page) => {
      const titleTokens = tokenize(page.title);
      const summaryTokens = tokenize(page.summary);
      const keywordTokens = page.keywords.map((k) => normalize(k));

      let score = 0;
      const explainParts = [];

      for (const token of queryTokens) {
        let tokenScore = 0;
        if (titleTokens.includes(token)) tokenScore += strict ? 8 : 6;
        if (summaryTokens.includes(token)) tokenScore += strict ? 2 : 3;
        if (keywordTokens.some((k) => k.includes(token))) tokenScore += strict ? 10 : 8;

        if (tokenScore > 0) explainParts.push(`${token}:${tokenScore}`);
        score += tokenScore;
      }

      if (strict && queryTokens.length > 0) {
        const ratio = explainParts.length / queryTokens.length;
        if (ratio < 0.4) score = 0;
      }

      score += Math.round((page.quality || 0) / 20);
      const source = sources.find((s) => s.id === page.sourceId);
      return { page, source, score, explain: explainParts.join(", ") || "no token match" };
    })
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { queryTokens, scored };
}

export function get3DChartRows({ pages, sources, metric, limit }) {
  return pages
    .slice(0, limit)
    .map((page) => {
      const source = sources.find((s) => s.id === page.sourceId);
      const sourceLength = Number(source?.length || source?.content?.length || 0);
      const value =
        metric === "quality"
          ? Number(page.quality || 0)
          : metric === "keywords"
            ? Number(page.keywords.length || 0)
            : sourceLength;
      return { title: page.title, value };
    })
    .sort((a, b) => b.value - a.value);
}

export function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}
