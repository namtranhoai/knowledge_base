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

export function rankPages({ pages, sources, question, mode = "balanced", topK = 3, fuzzyBoost = 0.35 }) {
  const queryTokens = tokenize(question);
  const strict = mode === "strict";

  const scored = pages
    .map((page) => {
      const titleTokens = tokenize(page.title);
      const summaryTokens = tokenize(page.summary);
      const keywordTokens = page.keywords.map((k) => normalize(k));

      let score = 0;
      let matchedTokens = 0;
      const explainParts = [];

      for (const token of queryTokens) {
        let tokenScore = 0;
        if (titleTokens.includes(token)) tokenScore += strict ? 8 : 6;
        if (summaryTokens.includes(token)) tokenScore += strict ? 2 : 3;
        if (keywordTokens.some((k) => k.includes(token))) tokenScore += strict ? 10 : 8;

        const similarity = bestTokenSimilarity(token, [
          ...titleTokens,
          ...summaryTokens,
          ...keywordTokens,
        ]);
        if (similarity >= 0.35) {
          tokenScore += Math.max(1, Math.round(similarity * 6 * fuzzyBoost));
        }

        if (tokenScore > 0) {
          explainParts.push(`${token}:${tokenScore}`);
          matchedTokens += 1;
        }
        score += tokenScore;
      }

      if (strict && queryTokens.length > 0) {
        const ratio = explainParts.length / queryTokens.length;
        if (ratio < 0.4) score = 0;
      }

      if (queryTokens.length > 0 && matchedTokens === 0) score = 0;
      if (score > 0) score += Math.round((page.quality || 0) / 20);
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



export function bestTokenSimilarity(token, candidates) {
  let best = 0;
  for (const candidate of candidates) {
    const sim = jaccardTrigramSimilarity(token, candidate);
    if (sim > best) best = sim;
  }
  return best;
}

export function jaccardTrigramSimilarity(a, b) {
  const A = toTrigrams(a);
  const B = toTrigrams(b);
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

function toTrigrams(value) {
  const s = normalize(value).replace(/\s+/g, "");
  const grams = new Set();
  if (s.length < 3) {
    if (s) grams.add(s);
    return grams;
  }
  for (let i = 0; i <= s.length - 3; i += 1) {
    grams.add(s.slice(i, i + 3));
  }
  return grams;
}

export function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}


export function buildTimelineBuckets(logLines, days = 7, now = new Date()) {
  const buckets = [];
  const msDay = 24 * 60 * 60 * 1000;
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * msDay);
    const key = d.toISOString().slice(0, 10);
    buckets.push({ key, ingest: 0, query: 0, other: 0 });
  }

  for (const line of logLines || []) {
    const dateMatch = line.match(/\[(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    const parsed = parseLooseDate(dateMatch[1]);
    if (!parsed) continue;
    const key = parsed.toISOString().slice(0, 10);
    const bucket = buckets.find((b) => b.key === key);
    if (!bucket) continue;

    const lower = line.toLowerCase();
    if (lower.includes('ingest')) bucket.ingest += 1;
    else if (lower.includes('query')) bucket.query += 1;
    else bucket.other += 1;
  }

  return buckets;
}

function parseLooseDate(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const mon = m[2].padStart(2, '0');
  const year = m[3];
  const date = new Date(`${year}-${mon}-${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}


export function sanitizeImportedState(payload, options = {}) {
  const maxSources = options.maxSources ?? 500;
  const maxPages = options.maxPages ?? 500;
  const maxLogs = options.maxLogs ?? 5000;

  const warnings = [];
  const rawSources = Array.isArray(payload?.sources) ? payload.sources.slice(0, maxSources) : [];
  const rawPages = Array.isArray(payload?.pages) ? payload.pages.slice(0, maxPages) : [];
  const rawLog = Array.isArray(payload?.log) ? payload.log.slice(0, maxLogs) : [];

  if (!Array.isArray(payload?.sources)) warnings.push("sources_missing_or_invalid");
  if (!Array.isArray(payload?.pages)) warnings.push("pages_missing_or_invalid");
  if (!Array.isArray(payload?.log)) warnings.push("log_missing_or_invalid");

  const sources = rawSources
    .map((item, idx) => ({
      id: String(item?.id || `source-import-${idx}`),
      title: String(item?.title || "Untitled source"),
      url: String(item?.url || ""),
      content: String(item?.content || ""),
      createdAt: String(item?.createdAt || new Date().toISOString()),
      length: Number(item?.length || String(item?.content || "").length),
    }))
    .filter((s) => s.title.trim().length > 0);

  const sourceIds = new Set(sources.map((s) => s.id));

  const pages = rawPages
    .map((item, idx) => ({
      id: String(item?.id || `page-import-${idx}`),
      sourceId: String(item?.sourceId || ""),
      title: String(item?.title || "Untitled page"),
      summary: String(item?.summary || ""),
      keywords: Array.isArray(item?.keywords)
        ? item.keywords.map((k) => String(k)).filter(Boolean).slice(0, 20)
        : [],
      quality: Number(item?.quality || 0),
      pinned: Boolean(item?.pinned),
      versions: Array.isArray(item?.versions) ? item.versions.slice(0, 20) : [],
      updatedAt: String(item?.updatedAt || new Date().toISOString()),
    }))
    .filter((p) => p.title.trim().length > 0)
    .map((p) => {
      if (!sourceIds.has(p.sourceId) && sources.length > 0) {
        warnings.push(`page_source_missing:${p.id}`);
        return { ...p, sourceId: sources[0].id };
      }
      return p;
    });

  const log = rawLog.map((line) => String(line)).filter(Boolean);
  return { sources, pages, log, warnings };
}
