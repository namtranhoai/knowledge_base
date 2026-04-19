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
- **Sources table**: xem nguồn chi tiết (URL, kích thước, thời gian).
- Giữ đầy đủ local-first workflow: ingest, QA, export/import backup, log.

## Chạy nhanh
Mở `index.html` trực tiếp trên trình duyệt.

## Hướng mở rộng tiếp
- Tách `app.js` thành modules + unit tests.
- Thay scoring heuristic bằng embedding/vector search.
- Đồng bộ đa thiết bị qua backend và auth.
