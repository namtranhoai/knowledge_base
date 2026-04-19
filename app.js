import {
  clamp,
  extractKeywords,
  get3DChartRows,
  buildTimelineBuckets,
  sanitizeImportedState,
  normalize,
  rankPages,
  scorePageQuality,
  summarize,
  tokenize,
} from "./core.js";

const STORAGE_KEY = "llm-wiki-app-state-v4";
const THEME_KEY = "llm-wiki-theme";

const defaultState = { sources: [], pages: [], log: [] };
const state = loadState();
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 20;

const el = {
  sourceForm: document.getElementById("source-form"),
  sourceTitle: document.getElementById("source-title"),
  sourceUrl: document.getElementById("source-url"),
  sourceContent: document.getElementById("source-content"),
  queryForm: document.getElementById("query-form"),
  queryInput: document.getElementById("query-input"),
  topK: document.getElementById("top-k"),
  queryMode: document.getElementById("query-mode"),
  fuzzyBoost: document.getElementById("fuzzy-boost"),
  chartMetric: document.getElementById("chart-metric"),
  chartLimit: document.getElementById("chart-limit"),
  chart3d: document.getElementById("chart3d"),
  timelineChart: document.getElementById("timeline-chart"),
  healthPanel: document.getElementById("health-panel"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  exportMdBtn: document.getElementById("export-md-btn"),
  answer: document.getElementById("answer"),
  queryExplain: document.getElementById("query-explain"),
  stats: document.getElementById("stats"),
  filter: document.getElementById("page-filter"),
  pinnedOnly: document.getElementById("pinned-only"),
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
  el.pinnedOnly.addEventListener("change", render);
  el.exportBtn.addEventListener("click", onExport);
  el.importInput.addEventListener("change", onImport);
  el.clearBtn.addEventListener("click", onClearAll);
  el.seedBtn.addEventListener("click", onSeedDemo);
  el.themeBtn.addEventListener("click", toggleTheme);
  el.chartMetric.addEventListener("change", render3DChart);
  el.chartLimit.addEventListener("input", render3DChart);
  el.undoBtn.addEventListener("click", onUndo);
  el.redoBtn.addEventListener("click", onRedo);
  el.exportMdBtn.addEventListener("click", onExportMarkdown);
  document.addEventListener("keydown", onHotkey);

  render();
  registerServiceWorker();
}

function onIngest(event) {
  snapshotState();
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
  const fuzzyBoost = clamp(Number(el.fuzzyBoost.value) || 0, 0, 1);
  const result = answerQuestion(question, topK, mode, fuzzyBoost);

  el.answer.innerHTML = result.html;
  el.queryExplain.textContent = result.explain;
  appendLog("query", `Hỏi: ${question} | mode: ${mode} | hits: ${result.hits}`);
  saveState();
  renderLog();
}

function onExport() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
  snapshotState();
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(String(reader.result));
      const sanitized = sanitizeImportedState(incoming);
      if (sanitized.sources.length === 0 && sanitized.pages.length === 0) {
        throw new Error("invalid_payload");
      }
      state.pages = sanitized.pages;
      state.sources = sanitized.sources;
      state.log = sanitized.log;
      appendLog("restore", `Import backup thành công: ${file.name}`);
      if (sanitized.warnings.length > 0) {
        appendLog("restore_warn", sanitized.warnings.join(", "));
      }
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
  snapshotState();
  if (!confirm("Bạn chắc chắn muốn xóa toàn bộ dữ liệu wiki?")) return;
  state.sources = [];
  state.pages = [];
  state.log = [];
  appendLog("reset", "Xóa toàn bộ dữ liệu");
  saveState();
  render();
}

function onSeedDemo() {
  snapshotState();
  if (state.sources.length > 0 && !confirm("Đã có dữ liệu. Bạn vẫn muốn nạp thêm demo data?")) {
    return;
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
    pinned: false,
    versions: [],
    updatedAt: isoNow(),
  };
}

function upsertPage(page) {
  const idx = state.pages.findIndex((p) => normalize(p.title) === normalize(page.title));
  if (idx >= 0) {
    state.pages[idx] = { ...state.pages[idx], ...page, id: state.pages[idx].id, pinned: state.pages[idx].pinned || false, versions: state.pages[idx].versions || [], updatedAt: isoNow() };
    appendLog("merge", `Hợp nhất page trùng tiêu đề: ${page.title}`);
    return;
  }
  state.pages.push(page);
}

function answerQuestion(question, topK, mode, fuzzyBoost = 0.35) {
  const { queryTokens, scored } = rankPages({
    pages: state.pages,
    sources: state.sources,
    question,
    mode,
    topK,
    fuzzyBoost,
  });

  if (scored.length === 0) {
    return {
      html: "Không tìm thấy dữ liệu phù hợp. Hãy ingest thêm nguồn hoặc đổi query mode.",
      hits: 0,
      explain: `query_tokens=${queryTokens.join(", ")}\nmode=${mode}\nfuzzy_boost=${fuzzyBoost}\nno_matches=true`,
    };
  }

  const maxScore = scored[0].score || 1;
  const items = scored
    .map(({ page, source, score }, idx) => {
      const confidence = Math.round((score / maxScore) * 100);
      const citation = source?.url
        ? `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(source.title)}</a>`
        : escapeHtml(source?.title || "Nguồn nội bộ");

      return `<li><strong>${idx + 1}. ${escapeHtml(page.title)}</strong><br>${escapeHtml(
        page.summary
      )}<br><em>Độ phù hợp: ${confidence}% | Quality: ${page.quality} | Keywords: ${escapeHtml(
        page.keywords.join(", ")
      )}</em><br><small>Nguồn: ${citation}</small></li>`;
    })
    .join("");

  return {
    html: `<p>Kết quả tổng hợp từ wiki:</p><ol>${items}</ol>`,
    hits: scored.length,
    explain: [
      `query_tokens=${queryTokens.join(", ")}`,
      `mode=${mode}`,
      `fuzzy_boost=${fuzzyBoost}`,
      ...scored.map((it, i) => `${i + 1}. ${it.page.title} => ${it.explain} | score=${it.score}`),
    ].join("\n"),
  };
}

function render() {
  renderStats();
  renderIndex();
  renderPages();
  renderClusters();
  render3DChart();
  renderGraph();
  renderSources();
  renderTimeline();
  renderHealth();
  renderLog();
}

function renderStats() {
  const avgQuality = state.pages.length
    ? Math.round(state.pages.reduce((sum, p) => sum + (p.quality || 0), 0) / state.pages.length)
    : 0;

  el.stats.innerHTML = `
    <div><strong>${state.sources.length}</strong><span>nguồn</span></div>
    <div><strong>${state.pages.length}</strong><span>wiki pages</span></div>
    <div><strong>${new Set(state.pages.flatMap((p) => p.keywords)).size}</strong><span>keywords unique</span></div>
    <div><strong>${avgQuality}</strong><span>avg quality</span></div>
    <div><strong>${state.pages.filter((p) => p.pinned).length}</strong><span>pinned pages</span></div>
  `;
}

function renderIndex() {
  const key = normalize(el.filter.value.trim());
  const pinnedOnly = el.pinnedOnly.checked;
  const filtered = state.pages.filter((p) => {
    if (pinnedOnly && !p.pinned) return false;
    return !key ? true : normalize(`${p.title} ${p.summary} ${p.keywords.join(" ")}`).includes(key);
  });

  el.indexList.innerHTML = filtered.length
    ? filtered
        .map(
          (page, i) =>
            `<li><strong>${i + 1}. ${escapeHtml(page.title)}</strong> — ${escapeHtml(
              page.summary.slice(0, 110)
            )}${page.summary.length > 110 ? "..." : ""}</li>`
        )
        .join("")
    : "<li>Không có page phù hợp.</li>";
}

function renderPages() {
  el.pages.innerHTML = "";
  if (!state.pages.length) {
    el.pages.innerHTML = "<p class='muted'>Chưa có page nào.</p>";
    return;
  }

  [...state.pages]
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .forEach((page) => {
      const source = state.sources.find((s) => s.id === page.sourceId);
      const node = el.pageTemplate.content.firstElementChild.cloneNode(true);

      node.querySelector(".page-title").textContent = `${page.pinned ? "📌 " : ""}${page.title} (Q:${page.quality})`;
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

      const pinBtn = node.querySelector(".pin-btn");
      pinBtn.textContent = page.pinned ? "Unpin" : "Pin";
      pinBtn.addEventListener("click", () => togglePin(page.id));
      node.querySelector(".history-btn").addEventListener("click", () => showHistory(page.id));
      node.querySelector(".delete-btn").addEventListener("click", () => deletePage(page.id));
      node.querySelector(".regenerate-btn").addEventListener("click", () => regeneratePage(page.id));
      node.querySelector(".edit-btn").addEventListener("click", () => editPage(page.id));
      el.pages.appendChild(node);
    });
}

function renderClusters() {
  if (!state.pages.length) {
    el.clusters.innerHTML = "<p class='muted'>Chưa có dữ liệu cụm chủ đề.</p>";
    return;
  }

  const map = new Map();
  for (const page of state.pages) {
    const key = page.keywords[0] || "uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(page.title);
  }

  el.clusters.innerHTML = [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(
      ([topic, titles]) =>
        `<div class="cluster"><strong>${escapeHtml(topic)}</strong> (${titles.length})<ul>${titles
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul></div>`
    )
    .join("");
}

function render3DChart() {
  const canvas = el.chart3d;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const metric = el.chartMetric.value;
  const limit = clamp(Number(el.chartLimit.value) || 8, 3, 20);
  const rows = get3DChartRows({ pages: state.pages, sources: state.sources, metric, limit });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getCssVar("--surface");
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!rows.length) {
    ctx.fillStyle = getCssVar("--muted");
    ctx.font = "16px sans-serif";
    ctx.fillText("Chưa có dữ liệu để vẽ 3D chart.", 28, 40);
    return;
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1);
  const baseY = canvas.height - 65;
  const barW = Math.min(72, Math.floor((canvas.width - 120) / rows.length) - 8);
  const depth = 16;

  rows.forEach((row, idx) => {
    const x = 40 + idx * (barW + 14);
    const h = Math.max(8, Math.round((row.value / maxValue) * 250));
    drawBar3D(ctx, x, baseY, barW, h, depth, colorByIndex(idx));

    ctx.fillStyle = getCssVar("--text");
    ctx.font = "12px sans-serif";
    ctx.fillText(String(row.value), x + 4, baseY - h - depth - 8);

    ctx.save();
    ctx.translate(x + 2, baseY + 12);
    ctx.rotate(-0.15);
    ctx.fillStyle = getCssVar("--muted");
    const label = row.title.slice(0, 12) + (row.title.length > 12 ? "…" : "");
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = getCssVar("--text");
  ctx.font = "13px sans-serif";
  ctx.fillText(`3D metric: ${metric} | max=${maxValue} | items=${rows.length}`, 24, 24);
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

  el.graph.innerHTML = links.length
    ? links
        .map(
          (link) =>
            `<div class="edge"><strong>${escapeHtml(link.a)}</strong> ↔ <strong>${escapeHtml(
              link.b
            )}</strong><br><small>Shared: ${escapeHtml(link.shared.join(", "))}</small></div>`
        )
        .join("")
    : "<p class='muted'>Chưa có keywords chung giữa các page.</p>";
}

function renderSources() {
  if (!state.sources.length) {
    el.sources.innerHTML = "<p class='muted'>Chưa có nguồn nào.</p>";
    return;
  }

  el.sources.innerHTML = `
    <table class="source-table"><thead><tr><th>Title</th><th>URL</th><th>Size</th><th>Created</th></tr></thead>
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
    </table>`;
}

function renderLog() {
  el.log.textContent = state.log.length ? [...state.log].reverse().join("\n") : "Chưa có hoạt động.";
}


function togglePin(pageId) {
  snapshotState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;
  page.pinned = !page.pinned;
  appendLog("pin", `${page.pinned ? "Pin" : "Unpin"} page: ${page.title}`);
  saveState();
  render();
}

function pushVersion(page, reason) {
  if (!Array.isArray(page.versions)) page.versions = [];
  page.versions.unshift({
    snapshotAt: isoNow(),
    reason,
    summary: page.summary,
    keywords: [...page.keywords],
    quality: page.quality,
  });
  page.versions = page.versions.slice(0, 10);
}

function showHistory(pageId) {
  snapshotState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;
  const versions = Array.isArray(page.versions) ? page.versions : [];
  if (!versions.length) {
    alert("Page này chưa có version history.");
    return;
  }

  const lines = versions
    .map((v, i) => `${i + 1}. [${formatDate(v.snapshotAt)}] ${v.reason} | Q:${v.quality}`)
    .join("\n");
  const choice = prompt(`Lịch sử của ${page.title}\n${lines}\nNhập số để restore, hoặc để trống để đóng:`);
  if (!choice) return;
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= versions.length) {
    alert("Index không hợp lệ.");
    return;
  }

  const selected = versions[idx];
  pushVersion(page, "restore");
  page.summary = selected.summary;
  page.keywords = [...selected.keywords];
  page.quality = selected.quality;
  page.updatedAt = isoNow();

  appendLog("restore", `Restore page version: ${page.title} (#${idx + 1})`);
  saveState();
  render();
}

function deletePage(pageId) {
  snapshotState();
  const target = state.pages.find((p) => p.id === pageId);
  if (!target) return;
  state.pages = state.pages.filter((p) => p.id !== pageId);
  appendLog("delete", `Xóa page: ${target.title}`);
  saveState();
  render();
}

function regeneratePage(pageId) {
  snapshotState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;
  const source = state.sources.find((s) => s.id === page.sourceId);
  if (!source) return;

  pushVersion(page, "regenerate");
  page.summary = summarize(source.content);
  page.keywords = extractKeywords(source.content);
  page.quality = scorePageQuality(page.summary, page.keywords);
  page.updatedAt = isoNow();

  appendLog("regenerate", `Regenerate page: ${page.title}`);
  saveState();
  render();
}

function editPage(pageId) {
  snapshotState();
  const page = state.pages.find((p) => p.id === pageId);
  if (!page) return;

  const newSummary = prompt("Sửa summary", page.summary);
  if (newSummary === null) return;
  const raw = prompt("Sửa keywords (phân tách bằng dấu phẩy)", page.keywords.join(", "));
  if (raw === null) return;

  pushVersion(page, "edit");
  page.summary = newSummary.trim() || page.summary;
  page.keywords = raw
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


function onUndo() {
  if (undoStack.length === 0) {
    alert("Không có thao tác nào để undo.");
    return;
  }

  const current = snapshotPayload();
  const previous = undoStack.pop();
  redoStack.push(current);
  if (redoStack.length > UNDO_LIMIT) redoStack.shift();

  restorePayload(previous);
  appendLog("undo", "Khôi phục thao tác gần nhất");
  saveState();
  render();
}

function onRedo() {
  if (redoStack.length === 0) {
    alert("Không có thao tác nào để redo.");
    return;
  }

  const current = snapshotPayload();
  const next = redoStack.pop();
  undoStack.push(current);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();

  restorePayload(next);
  appendLog("redo", "Khôi phục thao tác vừa undo");
  saveState();
  render();
}

function onExportMarkdown() {
  const lines = [];
  lines.push(`# LLM Wiki Report (${new Date().toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(`- Sources: ${state.sources.length}`);
  lines.push(`- Pages: ${state.pages.length}`);
  lines.push(`- Pinned: ${state.pages.filter((p) => p.pinned).length}`);
  lines.push("");
  lines.push("## Pages");

  for (const page of state.pages) {
    lines.push(`### ${page.pinned ? "📌 " : ""}${page.title}`);
    lines.push(page.summary || "");
    lines.push(`- Keywords: ${(page.keywords || []).join(", ")}`);
    lines.push(`- Quality: ${page.quality}`);
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `llm-wiki-report-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);

  appendLog("export", "Export markdown report");
  saveState();
  renderLog();
}

function onHotkey(event) {
  const ctrl = event.ctrlKey || event.metaKey;
  if (!ctrl) return;

  const key = event.key.toLowerCase();
  if (key === "k") {
    event.preventDefault();
    el.queryInput.focus();
  }
  if (key === "i") {
    event.preventDefault();
    el.sourceTitle.focus();
  }
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    onUndo();
  }
  if (key === "z" && event.shiftKey) {
    event.preventDefault();
    onRedo();
  }
}

function snapshotState() {
  const payload = snapshotPayload();
  undoStack.push(payload);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function snapshotPayload() {
  return JSON.stringify({
    sources: structuredClone(state.sources),
    pages: structuredClone(state.pages),
    log: structuredClone(state.log),
  });
}

function restorePayload(payload) {
  const parsed = JSON.parse(payload);
  state.sources = parsed.sources || [];
  state.pages = parsed.pages || [];
  state.log = parsed.log || [];
}

function renderTimeline() {
  const canvas = el.timelineChart;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const buckets = buildTimelineBuckets(state.log, 7, new Date());
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = getCssVar("--surface");
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const max = Math.max(1, ...buckets.map((b) => b.ingest + b.query + b.other));
  const w = Math.floor((canvas.width - 80) / buckets.length);

  buckets.forEach((b, i) => {
    const x = 40 + i * w;
    const total = b.ingest + b.query + b.other;
    const h = Math.round((total / max) * 170);

    ctx.fillStyle = "#4f8cff";
    ctx.fillRect(x, canvas.height - 50 - h, w - 8, h);
    ctx.fillStyle = getCssVar("--text");
    ctx.font = "11px sans-serif";
    ctx.fillText(String(total), x + 4, canvas.height - 54 - h);
    ctx.fillStyle = getCssVar("--muted");
    ctx.fillText(b.key.slice(5), x + 2, canvas.height - 28);
  });

  ctx.fillStyle = getCssVar("--text");
  ctx.font = "12px sans-serif";
  ctx.fillText("Tổng hoạt động / ngày (7 ngày gần nhất)", 18, 20);
}

function renderHealth() {
  if (!state.pages.length) {
    el.healthPanel.innerHTML = "<p class='muted'>Chưa có dữ liệu sức khỏe wiki.</p>";
    return;
  }

  const now = Date.now();
  const stale = state.pages.filter((p) => now - new Date(p.updatedAt).getTime() > 7 * 24 * 3600 * 1000);
  const weak = state.pages.filter((p) => (p.quality || 0) < 45);
  const noVersion = state.pages.filter((p) => !p.versions || p.versions.length === 0);

  el.healthPanel.innerHTML = `
    <div class="health-item"><strong>Stale pages (&gt;7 ngày):</strong> ${stale.length}</div>
    <div class="health-item"><strong>Low quality pages (&lt;45):</strong> ${weak.length}</div>
    <div class="health-item"><strong>Pages chưa có history:</strong> ${noVersion.length}</div>
  `;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      pages: Array.isArray(parsed.pages)
        ? parsed.pages.map((p) => ({ ...p, pinned: Boolean(p.pinned), versions: Array.isArray(p.versions) ? p.versions : [] }))
        : [],
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
  setTheme(localStorage.getItem(THEME_KEY) || "light");
}

function toggleTheme() {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  setTheme(next);
  localStorage.setItem(THEME_KEY, next);
}

function setTheme(theme) {
  document.body.dataset.theme = theme;
  el.themeBtn.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function drawBar3D(ctx, x, baseY, width, height, depth, color) {
  ctx.fillStyle = color.front;
  ctx.fillRect(x, baseY - height, width, height);

  ctx.beginPath();
  ctx.moveTo(x, baseY - height);
  ctx.lineTo(x + depth, baseY - height - depth);
  ctx.lineTo(x + width + depth, baseY - height - depth);
  ctx.lineTo(x + width, baseY - height);
  ctx.closePath();
  ctx.fillStyle = color.top;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + width, baseY - height);
  ctx.lineTo(x + width + depth, baseY - height - depth);
  ctx.lineTo(x + width + depth, baseY - depth);
  ctx.lineTo(x + width, baseY);
  ctx.closePath();
  ctx.fillStyle = color.side;
  ctx.fill();
}

function colorByIndex(idx) {
  const palette = [
    ["#4f8cff", "#86adff", "#2f69db"],
    ["#33b679", "#7fdcb2", "#25885a"],
    ["#ff8a47", "#ffb07c", "#dd6723"],
    ["#c084fc", "#ddb9ff", "#8f5bd1"],
    ["#ff5e57", "#ff908c", "#cc3f39"],
  ];
  const [front, top, side] = palette[idx % palette.length];
  return { front, top, side };
}

function getCssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || "#999";
}

function formatDate(input) {
  const value = new Date(input);
  return Number.isFinite(value.getTime()) ? value.toLocaleString("vi-VN") : "-";
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

// exposed for quick manual debugging in browser console
window.__wikiDev = { state, tokenize, summarize, extractKeywords, rankPages };


function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js");
      appendLog("pwa", "Service worker registered");
      saveState();
    } catch {
      // do not interrupt app usage if SW fails
    }
  });
}
