# LLM Wiki Web App Ultra

Bản nâng cấp tiếp theo của app local-first theo ý tưởng `llm-wiki`.

## Nâng cấp mới
- **Theme system**: Light/Dark mode và lưu theme theo phiên.
- **Seed demo data** để khởi tạo nhanh và test luồng query.
- **Query modes**: `balanced` và `strict` + **fuzzy boost** cho typo-tolerant retrieval.
- **Query explain**: hiển thị token nào match và score từng page.
- **Page quality score** để đánh giá nhanh mức hoàn chỉnh của page.
- **Page operations**: edit summary/keywords, regenerate, delete.
- **Pin pages + version history**: pin/unpin page quan trọng, lưu lịch sử chỉnh sửa và restore snapshot.
- **Topic clusters**: gom nhóm page theo keyword chủ đạo.
- **3D charts (canvas)**: biểu diễn cột giả lập 3D cho `quality`, `keyword count`, hoặc `source length`.
- **Sources table**: xem nguồn chi tiết (URL, kích thước, thời gian).
- **Pinned filter**: lọc nhanh chỉ những page đã pin.
- **Core module tách riêng** (`core.js`) để test thuật toán dễ hơn.
- **Automated tests** cho các hàm lõi bằng `node:test` (`core.test.mjs`), bao gồm fuzzy similarity và import-sanitization.
- **Safe import pipeline**: `sanitizeImportedState` chuẩn hóa payload backup trước khi ghi vào state.
- Giữ đầy đủ local-first workflow: ingest, QA, export/import backup, log.

## Nâng cấp liên tục 3 vòng
### Vòng 1
- Quick Actions: undo/redo đa mức (20 bước), export markdown report.
- Keyboard shortcuts: `Ctrl/Cmd + K` (focus query), `Ctrl/Cmd + I` (focus ingest), `Ctrl/Cmd + Z` (undo), `Ctrl/Cmd + Shift + Z` (redo).

### Vòng 2
- Activity Timeline chart (7 ngày gần nhất).
- Core helper `buildTimelineBuckets` + unit test.

### Vòng 3
- Health panel cho wiki: stale pages, low quality pages, pages chưa có version history.

## Publish-ready improvements
- **PWA nền tảng**: thêm `manifest.webmanifest` + `sw.js` để chạy offline cho các asset chính.
- **CI pipeline**: GitHub Actions chạy `npm run check` + `npm test` tự động.
- **Project scripts**: `npm run check`, `npm test`, `npm start`.

## Chạy local
```bash
npm run check
npm test
npm start
# mở http://localhost:8080/index.html
```

## Hướng mở rộng tiếp
- Thay scoring heuristic bằng embedding/vector search.
- Đồng bộ đa thiết bị qua backend và auth.
- Bổ sung e2e tests (Playwright) cho full UI regression.


## Đánh giá hiện trạng (liên tục)
- Chất lượng lõi: có unit tests cho ranking, fuzzy, timeline, import sanitize.
- Độ an toàn dữ liệu: import JSON được giới hạn kích thước mảng và chuẩn hóa field trước khi dùng.
- Độ sẵn sàng publish: có CI + PWA + scripts check/test/start.
