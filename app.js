const STORAGE_KEY = "llm-wiki-app-state-v3";
const THEME_KEY = "llm-wiki-theme";

const defaultState = {
  sources: [],
  pages: [],
  log: [],
};

const state = loadState();

const el = {
  sourceForm: document.getElementById("source-form"),
  sourceTitle: document.getElementById("source-title"),
  sourceUrl: document.getElementById("source-url"),
  sourceContent: document.getElementById("source-content"),
  queryForm: document.getElementById("query-form"),
  queryInput: document.getElementById("query-input"),
  topK: document.getElementById("top-k"),
  queryMode: document.getElementById("query-mode"),
  answer: document.getElementById("answer"),
  queryExplain: document.getElementById("query-explain"),
  stats: document.getElementById("stats"),
  filter: document.getElementById("page-filter"),
  indexList: document.getElementById("index-list"),
  pages: document.getElementById("pages"),
  graph: document.getElementById("graph"),
  clusters: document.getElementById("clusters"),
  sources: document.getElementById("sources"),
  log: document.getElementById("log"),
  exportBtn: document.getElementById("export-btn"),
  importInput: document.getElementById("import-input"),
  clearBtn: document.getElementById("clear-btn"),
  seedBtn: document.getElementById("seed-btn"),
  themeBtn: document.getElementById("theme-btn"),
  pageTemplate: document.getElementById("page-template"),
};

bootstrap();

function bootstrap() {
  applySavedTheme();

  el.sourceForm.addEventListener("submit", onIngest);
  el.queryForm.addEventListener("submit", onQuery);
  el.filter.addEventListener("input", render);
  el.exportBtn.addEventListener("click", onExport);
  el.importInput.addEventListener("change", onImport);
  el.clearBtn.addEventListener("click", onClearAll);
  el.seedBtn.addEventListener("click", onSeedDemo);
  el.themeBtn.addEventListener("click", toggleTheme);

  render();
}

function onIngest(event) {
  event.preventDefault();

  const title = el.sourceTitle.value.trim();
  const content = el.sourceContent.value.trim();
  const url = el.sourceUrl.value.trim();
  if (!title || !content) return;

  const source = {
    id: `source-${crypto.randomUUID()}`,
    title,
    url,
    content,
    createdAt: isoNow(),
    length: content.length,
  };

  const page = synthesizePage(source);
  upsertPage(page);

  state.sources.push(source);
  appendLog("ingest", `Ingest nguồn: ${title}`);
  saveState();

  el.sourceForm.reset();
  render();
}

function onQuery(event) {
  event.preventDefault();
  const question = el.queryInput.value.trim();
  if (!question) return;

  const topK = clamp(Number(el.topK.value) || 3, 1, 10);
  const mode = el.queryMode.value;
  const result = answerQuestion(question, topK, mode);

  el.answer.innerHTML = result.html;
  el.queryExplain.textContent = result.explain;
  appendLog("query", `Hỏi: ${question} | mode: ${mode} | hits: ${result.hits}`);
  saveState();
  renderLog();
}

function onExport() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-wiki-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();

  URL.revokeObjectURL(url);
  appendLog("backup", "Export dữ liệu JSON");
  saveState();
  renderLog();
}

function onImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      if (!incoming || !Array.isArray(incoming.pages) || !Array.isArray(incoming.sources)) {
        throw new Error("invalid_payload");
      }

      state.pages = incoming.pages;
      state.sources = incoming.sources;
      state.log = Array.isArray(incoming.log) ? incoming.log : [];

      appendLog("restore", `Import backup thành công: ${file.name}`);
      saveState();
      render();
    } catch {
      alert("File JSON không hợp lệ.");
    } finally {
      el.importInput.value = "";
    }
  };

  reader.readAsText(file);
}

function onClearAll() {
  const ok = confirm("Bạn chắc chắn muốn xóa toàn bộ dữ liệu wiki?");
  if (!ok) return;

  state.sources = [];
  state.pages = [];
  state.log = [];

  appendLog("reset", "Xóa toàn bộ dữ liệu");
  saveState();
  render();
}

function onSeedDemo() {
  if (state.sources.length > 0 || state.pages.length > 0) {
    const proceed = confirm("Đã có dữ liệu. Bạn vẫn muốn nạp thêm demo data?");
    if (!proceed) return;
  }

  const demo = [
    {
      title: "Agent evaluation checklist",
      url: "https://example.com/agent-eval",
      content:
        "Agent evaluation cần test nhiệm vụ đa bước, độ ổn định, latency, và tỷ lệ fail-safe. Quan trọng nhất là offline benchmark và online canary rollout trước khi mở rộng traffic.",
    },
    {
      title: "RAG production notes",
      url: "https://example.com/rag-prod",
      content:
        "RAG production cần ingestion pipeline ổn định, chunking nhất quán, và cache truy vấn. Retrieval quality phụ thuộc vào embedding, metadata filter, và chiến lược re-ranking.",
    },
    {
      title: "Prompt ops handbook",
      url: "https://example.com/prompt-ops",
      content:
        "Prompt ops cần version control cho prompt, A/B test theo intent, và logging đầy đủ. Mỗi thay đổi prompt nên có metric rõ ràng như accuracy, cost, latency.",
    },
  ];

  for (const item of demo) {
    const source = {
      id: `source-${crypto.randomUUID()}`,
      title: item.title,
      url: item.url,
      content: item.content,
      createdAt: isoNow(),
      length: item.content.length,
    };
    state.sources.push(source);
    upsertPage(synthesizePage(source));
  }

  appendLog("seed", "Nạp demo data thành công");
  saveState();
  render();
}

function synthesizePage(source) {
  const summary = summarize(source.content);
  const keywords = extractKeywords(source.content);

  return {
    id: `page-${crypto.randomUUID()}`,
    sourceId: source.id,
    title: source.title,
    summary,
    keywords,
    quality: scorePageQuality(summary, keywords),
    updatedAt: isoNow(),
  };
}

function upsertPage(page) {
  const existing = state.pages.findIndex(
    (p) => normalize(p.title) === normalize(page.title)
  );

  if (existing >= 0) {
    state.pages[existing] = {
      ...state.pages[existing],
      ...page,
      id: state.pages[existing].id,
      updatedAt: isoNow(),
    };
    appendLog("merge", `Hợp nhất page trùng tiêu đề: ${page.title}`);
    return;
  }

  state.pages.push(page);
}

function summarize(text) {
  const compact = text.replace(/\s+/g, " ").trim();
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

function mostInformativeSentence(sentences) {
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

function extractKeywords(text) {
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

function scorePageQuality(summary, keywords) {
  return clamp(Math.round(summary.length / 12 + keywords.length * 5), 1, 100);
}

function answerQuestion(question, topK, mode = "balanced") {
  const queryTokens = tokenize(question);
  const strict = mode === "strict";

  const scored = state.pages
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
        const matched = explainParts.length;
        const ratio = matched / queryTokens.length;
        if (ratio < 0.4) score = 0;
      }

      score += Math.round((page.quality || 0) / 20);

      const source = state.sources.find((s) => s.id === page.sourceId);
      return { page, source, score, explain: explainParts.join(", ") || "no token match" };
    })
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) {
    return {
      html: "Không tìm thấy dữ liệu phù hợp. Hãy ingest thêm nguồn hoặc đổi query mode.",
      hits: 0,
      explain: `query_tokens=${queryTokens.join(", ")}\nmode=${mode}\nno_matches=true`,
    };
  }

  const maxScore = scored[0].score || 1;
  const items = scored
    .map(({ page, source, score }, idx) => {
      const confidence = Math.round((score / maxScore) * 100);
      const citation = source?.url
        ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a>`
        : `${escapeHtml(source?.title || "Nguồn nội bộ")}`;

      return `<li>
        <strong>${idx + 1}. ${escapeHtml(page.title)}</strong><br>
        ${escapeHtml(page.summary)}<br>
        <em>Độ phù hợp: ${confidence}% | Quality: ${page.quality} | Keywords: ${escapeHtml(
          page.keywords.join(", ")
        )}</em><br>
        <small>Nguồn: ${citation}</small>
      </li>`;
    })
    .join("");

  const explain = [
    `query_tokens=${queryTokens.join(", ")}`,
    `mode=${mode}`,
    ...scored.map((item, i) => `${i + 1}. ${item.page.title} => ${item.explain} | score=${item.score}`),
  ].join("\n");

  return {
    html: `<p>Kết quả tổng hợp từ wiki:</p><ol>${items}</ol>`,
    hits: scored.length,
    explain,
  };
}

function render() {
  renderStats();
  renderIndex();
  renderPages();
  renderClusters();
  renderGraph();
  renderSources();
  renderLog();
}

function renderStats() {
  const sourceCount = state.sources.length;
  const pageCount = state.pages.length;
  const keywordPool = new Set(state.pages.flatMap((p) => p.keywords));
  const avgQuality =
    pageCount === 0
      ? 0
      : Math.round(state.pages.reduce((sum, p) => sum + (p.quality || 0), 0) / pageCount);

  el.stats.innerHTML = `
    <div><strong>${sourceCount}</strong><span>nguồn</span></div>
    <div><strong>${pageCount}</strong><span>wiki pages</span></div>
    <div><strong>${keywordPool.size}</strong><span>keywords unique</span></div>
    <div><strong>${avgQuality}</strong><span>avg quality</span></div>
  `;
}

function renderIndex() {
  const key = normalize(el.filter.value.trim());
  const filtered = state.pages.filter((page) => {
    if (!key) return true;
    return normalize(`${page.title} ${page.summary} ${page.keywords.join(" ")}`).includes(key);
  });

  el.indexList.innerHTML = "";
  if (filtered.length === 0) {
    el.indexList.innerHTML = "<li>Không có page phù hợp.</li>";
    return;
  }

  filtered.forEach((page, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${i + 1}. ${escapeHtml(page.title)}</strong> — ${escapeHtml(
      page.summary.slice(0, 110)
    )}${page.summary.length > 110 ? "..." : ""}`;
    el.indexList.appendChild(li);
  });
}

function renderPages() {
  el.pages.innerHTML = "";

  if (state.pages.length === 0) {
    el.pages.innerHTML = "<p class='muted'>Chưa có page nào.</p>";
    return;
  }

  [...state.pages]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((page) => {
      const source = state.sources.find((s) => s.id === page.sourceId);
      const node = el.pageTemplate.content.firstElementChild.cloneNode(true);

      node.querySelector(".page-title").textContent = `${page.title} (Q:${page.quality})`;
      node.querySelector(".page-summary").textContent = page.summary;
      node.querySelector(".page-keywords").textContent = page.keywords.join(", ") || "none";
      node.querySelector(".page-updated").textContent = `Cập nhật: ${formatDate(page.updatedAt)}`;

      const link = node.querySelector(".page-source-link");
      const fallback = node.querySelector(".page-source-fallback");
      if (source?.url) {
        link.textContent = source.title;
        link.href = source.url;
      } else {
        link.remove();
        fallback.textContent = source?.title || "Không có URL";
      }

      node.querySelector(".delete-btn").addEventListener("click", () => deletePage(page.id));
      node.querySelector(".regenerate-btn").addEventListener("click", () => regeneratePage(page.id));
      node.querySelector(".edit-btn").addEventListener("click", () => editPage(page.id));

      el.pages.appendChild(node);
    });
}

function renderClusters() {
  if (state.pages.length === 0) {
    el.clusters.innerHTML = "<p class='muted'>Chưa có dữ liệu cụm chủ đề.</p>";
    return;
  }

  const clusterMap = new Map();
  for (const page of state.pages) {
    const key = page.keywords[0] || "uncategorized";
    if (!clusterMap.has(key)) clusterMap.set(key, []);
    clusterMap.get(key).push(page.title);
  }

  const blocks = [...clusterMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([topic, titles]) => `<div class="cluster">
        <strong>${escapeHtml(topic)}</strong> (${titles.length})
        <ul>${titles.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
      </div>`
    )
    .join("");

  el.clusters.innerHTML = blocks;
}

function renderGraph() {
  if (state.pages.length < 2) {
    el.graph.innerHTML = "<p class='muted'>Cần ít nhất 2 page để hiển thị liên kết.</p>";
    return;
  }

  const links = [];
  for (let i = 0; i < state.pages.length; i += 1) {
    for (let j = i + 1; j < state.pages.length; j += 1) {
      const a = state.pages[i];
      const b = state.pages[j];
      const shared = a.keywords.filter((k) => b.keywords.includes(k));
      if (shared.length > 0) links.push({ a: a.title, b: b.title, shared });
    }
  }

  if (links.length === 0) {
    el.graph.innerHTML = "<p class='muted'>Chưa có keywords chung giữa các page.</p>";
    return;
  }

  el.graph.innerHTML = links
    .map(
      (link) => `<div class="edge"><strong>${escapeHtml(link.a)}</strong> ↔ <strong>${escapeHtml(
        link.b
      )}</strong><br><small>Shared: ${escapeHtml(link.shared.join(", "))}</small></div>`
    )
    .join("");
}

function renderSources() {
  if (state.sources.length === 0) {
    el.sources.innerHTML = "<p class='muted'>Chưa có nguồn nào.</p>";
    return;
  }

  el.sources.innerHTML = `
    <table class="source-table">
      <thead>
        <tr>
          <th>Title</th><th>URL</th><th>Size</th><th>Created</th>
        </tr>
      </thead>
      <tbody>
        ${state.sources
          .slice()
          .reverse()
          .map(
            (src) => `<tr>
              <td>${escapeHtml(src.title)}</td>
              <td>${
                src.url
                  ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noreferrer noopener">link</a>`
                  : "-"
              }</td>
              <td>${Number(src.length || src.content?.length || 0)} chars</td>
              <td>${formatDate(src.createdAt)}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderLog() {
  if (state.log.length === 0) {
    el.log.textContent = "Chưa có hoạt động.";
    return;
  }
  el.log.textContent = [...state.log].reverse().join("\n");
}

function deletePage(pageId) {
  const target = state.pages.find((p) => p.id === pageId);
  if (!target) return;

  state.pages = state.pages.filter((p) => p.id !== pageId);
  appendLog("delete", `Xóa page: ${target.title}`);
  saveState();
  render();
}

function regeneratePage(pageId) {
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;

  const source = state.sources.find((s) => s.id === page.sourceId);
  if (!source) return;

  page.summary = summarize(source.content);
  page.keywords = extractKeywords(source.content);
  page.quality = scorePageQuality(page.summary, page.keywords);
  page.updatedAt = isoNow();

  appendLog("regenerate", `Regenerate page: ${page.title}`);
  saveState();
  render();
}

function editPage(pageId) {
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;

  const newSummary = prompt("Sửa summary", page.summary);
  if (newSummary === null) return;
  const newKeywordsRaw = prompt("Sửa keywords (phân tách bằng dấu phẩy)", page.keywords.join(", "));
  if (newKeywordsRaw === null) return;

  page.summary = newSummary.trim() || page.summary;
  page.keywords = newKeywordsRaw
    .split(",")
    .map((k) => normalize(k).trim())
    .filter(Boolean)
    .slice(0, 12);
  page.quality = scorePageQuality(page.summary, page.keywords);
  page.updatedAt = isoNow();

  appendLog("edit", `Chỉnh sửa page: ${page.title}`);
  saveState();
  render();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);

    const parsed = JSON.parse(raw);
    return {
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      log: Array.isArray(parsed.log) ? parsed.log : [],
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function appendLog(action, detail) {
  state.log.push(`[${formatDate(isoNow())}] ${action.toUpperCase()} | ${detail}`);
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  setTheme(saved);
}

function toggleTheme() {
  const current = document.body.dataset.theme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  el.themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function formatDate(input) {
  const value = new Date(input);
  if (!Number.isFinite(value.getTime())) return "-";
  return value.toLocaleString("vi-VN");
}

function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function isoNow() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
