# LLM Wiki Web App Ultra

Bản nâng cấp tiếp theo của app local-first theo ý tưởng `llm-wiki`.

## Nâng cấp mới
- **Theme system**: Light/Dark mode và lưu theme theo phiên.
- **Seed demo data** để khởi tạo nhanh và test luồng query.
- **Query modes**: `balanced` và `strict`.
- **Query explain**: hiển thị token nào match và score từng page.
- **Page quality score** để đánh giá nhanh mức hoàn chỉnh của page.
- **Page operations**: edit summary/keywords, regenerate, delete.
- **Topic clusters**: gom nhóm page theo keyword chủ đạo.
- **3D charts (canvas)**: biểu diễn cột giả lập 3D cho `quality`, `keyword count`, hoặc `source length`.
- **Sources table**: xem nguồn chi tiết (URL, kích thước, thời gian).
- **Core module tách riêng** (`core.js`) để test thuật toán dễ hơn.
- **Automated tests** cho các hàm lõi bằng `node:test` (`core.test.mjs`).
- Giữ đầy đủ local-first workflow: ingest, QA, export/import backup, log.

## Chạy nhanh
Mở `index.html` trực tiếp trên trình duyệt hiện đại (hỗ trợ ES modules).

## Chạy test
```bash
npm test
```

## Hướng mở rộng tiếp
- Thay scoring heuristic bằng embedding/vector search.
- Đồng bộ đa thiết bị qua backend và auth.
