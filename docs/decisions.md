# Decision Log

> Ghi lại mọi quyết định tự đưa ra khi gặp tình huống mơ hồ hoặc nhiều phương án, theo QUY TẮC BẮT BUỘC trong `docs/feature-roadmap.md`. Entry mới append xuống cuối, theo thứ tự thời gian.

---

## [Phase 1] Injection fingerprint qua `--extended-parameters`
- **Ngày:** 2026-06-29
- **Bối cảnh:** Cơ chế tiêm fingerprint vào Chromium. Đoạn code `--extended-parameters`, `--user-agent`, `--timezone` trong `packages/main/src/fingerprint/index.ts` đang bị comment. Chưa verify được Chromium tùy biến (cắm sau) có thực sự đọc flag này không.
- **Các phương án cân nhắc:** (A) Wire injection qua `--extended-parameters` theo schema AdsPower, coi việc browser đọc flag là assumption; (B) Inject bằng CDP/JS (`evaluateOnNewDocument`) chạy trên Chrome thường nhưng dễ bị phát hiện; (C) Chờ verify browser trước khi làm.
- **Phương án đã chọn:** A — wire theo schema AdsPower, ghi nhận "Chromium tùy biến đọc flag" là giả định, không chặn tiến độ.
- **Lý do:** Khớp yêu cầu người dùng (fingerprint để dạng chờ cắm browser sau) và đúng cơ chế nguyên bản của repo; CDP/JS inject dễ bị phát hiện, kém hơn cho anti-detect.
- **Ảnh hưởng:** `packages/main/src/fingerprint/index.ts`, `packages/main/src/fingerprint/generator.ts`, `packages/shared/types/fingerprint.d.ts`.

---

## [Phase 3] Mã hóa credential tài khoản
- **Ngày:** 2026-06-29
- **Bối cảnh:** Cần lưu thông tin đăng nhập tài khoản (username/password/secret) có mã hóa nhẹ, kèm cookie.
- **Các phương án cân nhắc:** (A) AES-256-GCM với key tự quản lưu trong config dir (portable); (B) Electron `safeStorage` (dùng OS keychain, an toàn hơn nhưng không portable giữa máy).
- **Phương án đã chọn:** A — AES-256-GCM, key sinh lần đầu lưu trong config dir.
- **Lý do:** Khớp yêu cầu "mã hóa nhẹ" + portable; phổ biến cho loại app này. Trade-off: key nằm cùng đĩa với dữ liệu nên chỉ chặn xem xét thông thường, không chống được kẻ tấn công có quyền truy cập filesystem.
- **Ảnh hưởng:** `packages/main/src/utils/crypto.ts`, `packages/main/src/db/account.ts`, migration `create_account_table.js`.

---

## [Phase 1.2] Generator fingerprint deterministic theo seed
- **Ngày:** 2026-06-29
- **Bối cảnh:** `generateFingerprint(seed?)` cần sinh fingerprint cho mỗi profile. Mơ hồ: nên random thuần mỗi lần gọi, hay deterministic theo seed?
- **Các phương án cân nhắc:** (A) Deterministic seeded PRNG (mulberry32), seed mặc định là `profile_id`; (B) Random thuần `Math.random()` mỗi lần.
- **Phương án đã chọn:** A — deterministic seeded, seed = `profile_id`.
- **Lý do:** Re-generate cho cùng một profile ra cùng kết quả → identity ổn định, tránh đổi fingerprint ngoài ý muốn; vẫn cho phép re-roll bằng seed mới. Các field tương quan (OS↔UA↔platform↔fonts↔screen) sinh cùng nhau để nhất quán.
- **Ảnh hưởng:** `packages/main/src/fingerprint/generator.ts`, `fingerprint/index.ts`, `services/window-service.ts`.

---

## [Phase 1.4] Migration idempotent với `hasColumn` guard
- **Ngày:** 2026-06-29
- **Bối cảnh:** Migration `add_fingerprint_meta_to_window` thêm `fp_locked` và đảm bảo cột `fingerprint`. Một số DB cũ đã có sẵn cột `fingerprint`.
- **Các phương án cân nhắc:** (A) `alterTable` thẳng (lỗi nếu cột đã tồn tại); (B) Guard `hasColumn` trước khi thêm/xóa cột.
- **Phương án đã chọn:** B — guard `hasColumn` cho cả up/down.
- **Lý do:** Idempotent, an toàn khi migrate trên DB đã có sẵn cột; khớp yêu cầu migration round-trip up→down không lỗi.
- **Ảnh hưởng:** `migrations/20260629120000_add_fingerprint_meta_to_window.js`.

---

## [Phase 1.5] Default `fp_locked = true`
- **Ngày:** 2026-06-29
- **Bối cảnh:** Cột `fp_locked` quyết định fingerprint có bị auto-regenerate hay không. Cần chọn giá trị mặc định.
- **Các phương án cân nhắc:** (A) Default `true` (khóa, không tự đổi); (B) Default `false` (cho phép tự sinh lại).
- **Phương án đã chọn:** A — default `true`.
- **Lý do:** An toàn cho anti-detect: một khi profile có fingerprint thì giữ nguyên, tránh thay đổi vô tình giữa các lần mở. Khớp roadmap (`fp_locked boolean default true`).
- **Ảnh hưởng:** `migrations/...add_fingerprint_meta_to_window.js`, `DB.Window`.

---

## [Phase 2.2] Map `user_id` (AdsPower) ↔ `profile_id` nội bộ
- **Ngày:** 2026-06-29
- **Bối cảnh:** API v1 nhận `user_id` theo contract AdsPower; nội bộ DB dùng `id` (số) + `profile_id` (chuỗi).
- **Các phương án cân nhắc:** (A) Coi `user_id` == `profile_id`, lookup qua `WindowDB.find({profile_id})` rồi lấy `id`; (B) Coi `user_id` == `id` nội bộ.
- **Phương án đã chọn:** A — `user_id` == `profile_id`.
- **Lý do:** `profile_id` là định danh public/ổn định của profile (giống AdsPower user_id), không phụ thuộc autoincrement nội bộ; SDK AdsPower kỳ vọng chuỗi.
- **Ảnh hưởng:** `packages/main/src/server/routes/api-v1.ts`.

---

## [Phase 2.1] Tách response helper `_resp.ts`
- **Ngày:** 2026-06-29
- **Bối cảnh:** Cần envelope `{code,msg,data}` dùng lại cho mọi endpoint v1.
- **Các phương án cân nhắc:** (A) File helper riêng `_resp.ts` export `ok()`/`fail()`; (B) Inline literal trong từng handler.
- **Phương án đã chọn:** A — helper riêng.
- **Lý do:** DRY, đồng nhất format, dễ đổi sau; prefix `_` để phân biệt không phải route file.
- **Ảnh hưởng:** `packages/main/src/server/routes/_resp.ts`, `api-v1.ts`.

---

## [Tooling] Không chạy được typecheck/build trong môi trường
- **Ngày:** 2026-06-29
- **Bối cảnh:** Môi trường offline, `node_modules` chưa cài (`tsc` không tồn tại), không thể chạy `npm run typecheck:main` / `build`.
- **Các phương án cân nhắc:** (A) Dừng chờ cài deps; (B) Tiếp tục code theo pattern repo + review thủ công, ghi chú validate sau.
- **Phương án đã chọn:** B — tiếp tục, đánh dấu cần validate.
- **Lý do:** QUY TẮC BẮT BUỘC: không dừng chờ. Cần chạy `npm install` rồi typecheck/build trước khi coi phase là xong.
- **Ảnh hưởng:** Cross-cutting validation toàn plan.

---

## [Phase 1.6] Vị trí & cơ chế UI fingerprint editor
- **Ngày:** 2026-06-29
- **Bối cảnh:** Cần panel chỉnh fingerprint trong page create/edit profile.
- **Các phương án cân nhắc:** (A) Tách component riêng `FingerprintPanel` nhúng vào form create/edit; (B) Viết trực tiếp inline trong page.
- **Phương án đã chọn:** A — component tái sử dụng, gọi IPC `window-generate-fingerprint`/`window-update-fingerprint`.
- **Lý do:** Dùng lại cho cả create lẫn edit, tách concern UI fingerprint khỏi form chính.
- **Ảnh hưởng:** `packages/renderer/src` (component fingerprint + page create/edit), preload bridge.

---

## [Phase 1.6] Thay `FingerprintInfo` read-only bằng `FingerprintPanel` edit
- **Ngày:** 2026-06-29
- **Bối cảnh:** Page detail trước đây hiển thị fingerprint bằng component read-only `FingerprintInfo`. Khi thêm panel chỉnh sửa, mơ hồ: giữ song song read-only + edit, hay thay hẳn.
- **Các phương án cân nhắc:** (A) Thay hẳn `FingerprintInfo` bằng `FingerprintPanel` (panel vừa xem vừa sửa); (B) Hiển thị cả hai cạnh nhau (read-only + edit).
- **Phương án đã chọn:** A — thay hẳn, gỡ import `FingerprintInfo` không còn dùng.
- **Lý do:** Panel đã hiển thị đầy đủ field và cho sửa inline → giữ thêm read-only là dư thừa, gây nhiễu UI và trùng dữ liệu. Tránh dead import làm fail typecheck (`noUnusedLocals`).
- **Ảnh hưởng:** `packages/renderer/src/pages/windows/detail/index.tsx`; `fingerprint-info` không còn được dùng ở detail (giữ file để tránh phá vỡ import khác nếu có).

---

## [Phase 1.6] Lưu fingerprint ở tab create (chưa có window id)
- **Ngày:** 2026-06-29
- **Bối cảnh:** Trên tab create chưa có `id`/`profile_id`, không thể gọi `window-update-fingerprint` (cần id). Cần quyết định cách giữ fingerprint vừa generate cho đến khi tạo profile.
- **Các phương án cân nhắc:** (A) Giữ fingerprint trong state của page, đổ vào `formValue.fingerprint` (+`ua`) qua `onChange`, persist cùng lúc với `window-create`; (B) Tạo window rỗng trước rồi update fingerprint.
- **Phương án đã chọn:** A — hold trong `formValue`, persist khi create.
- **Lý do:** Không tạo bản ghi rác; create flow vốn nhận `window` + `fingerprint` nên chỉ cần đảm bảo `formValue.fingerprint` đã set. Nút Save (gọi `updateFingerprint`) chỉ hiển thị/áp dụng khi đã có `windowId` (edit).
- **Ảnh hưởng:** `packages/renderer/src/pages/windows/detail/index.tsx` (`onFingerprintChange` set `ua`+`fingerprint`), `FingerprintPanel`.

---

## [Phase 3.3] Tự động nhận diện định dạng cookie khi import
- **Ngày:** 2026-06-29
- **Bối cảnh:** Người dùng dán/upload cookie ở nhiều định dạng khác nhau (EditThisCookie JSON, Netscape cookies.txt, raw `Cookie:` header). Cần chuẩn hóa về `ICookie` (`Protocol.Network.CookieParam`) cho `presetCookie` / CDP `Network.setCookies`.
- **Các phương án cân nhắc:** (A) Auto-detect định dạng từ nội dung text (thử JSON → tab-separated Netscape → header string); (B) Bắt người dùng chọn định dạng trước khi import.
- **Phương án đã chọn:** A — auto-detect trong `normalizeCookies()`.
- **Lý do:** UX tối giản, khớp hành vi phổ biến của các tool quản lý profile (người dùng chỉ cần dán). Heuristic: chuỗi expiry 13 chữ số coi là ms → đổi sang giây; `sameSite` map về `Lax|Strict|None`. Với header string không có domain → dùng `defaultDomain` do UI cung cấp.
- **Ảnh hưởng:** `packages/main/src/utils/cookie.ts`, `services/window-service.ts` (`window-import-cookie`).

---

## [Phase 3.3] Export cookie ưu tiên CDP live, fallback preset
- **Ngày:** 2026-06-29
- **Bối cảnh:** Export cookie của một profile. Mơ hồ: lấy cookie đang chạy thật (CDP) hay cookie preset đã lưu trong DB?
- **Các phương án cân nhắc:** (A) Nếu profile đang chạy (`status === 2`) → đọc live qua `Network.getAllCookies`; nếu không → trả cookie preset đã lưu; (B) Luôn trả preset đã lưu.
- **Phương án đã chọn:** A — ưu tiên live, fallback preset.
- **Lý do:** Cookie live phản ánh đúng phiên đăng nhập hiện tại (giá trị mới nhất sau khi user thao tác trong browser), hữu ích hơn cho backup/di chuyển; fallback preset đảm bảo export vẫn hoạt động khi profile chưa mở.
- **Ảnh hưởng:** `services/window-service.ts` (`window-export-cookie`).

---

## [Phase 4.2] Round-robin gán proxy khi batch-create
- **Ngày:** 2026-06-29
- **Bối cảnh:** Tạo hàng loạt profile từ template. Cần quyết định cách gán proxy cho từng profile mới.
- **Các phương án cân nhắc:** (A) Round-robin từ danh sách `proxyIds` do UI truyền; nếu rỗng → dùng pool proxy chưa sử dụng (`getUnusedProxies`); (B) Gán cùng một proxy của template cho tất cả; (C) Để trống proxy.
- **Phương án đã chọn:** A — round-robin, ưu tiên proxy chưa dùng.
- **Lý do:** Phân tán proxy giúp tránh nhiều profile share cùng IP (giảm rủi ro liên kết tài khoản) — đúng tinh thần anti-detect; pool unused giúp tận dụng proxy rảnh trước. Nếu hết proxy thì lặp lại theo modulo, không chặn việc tạo profile.
- **Ảnh hưởng:** `packages/main/src/db/proxy.ts` (`getUnusedProxies`), `services/batch-service.ts` (`window-batch-create`).

---

## [Phase 4.3] Concurrency runner không abort khi một task lỗi
- **Ngày:** 2026-06-29
- **Bối cảnh:** Batch open/close nhiều profile. Mơ hồ: một profile lỗi có nên dừng cả batch không, và giới hạn song song bao nhiêu?
- **Các phương án cân nhắc:** (A) `runWithConcurrency` gom lỗi per-task vào kết quả, không reject; mặc định `maxConcurrent = 5`; (B) `Promise.all` (một lỗi là fail toàn bộ); (C) chạy tuần tự.
- **Phương án đã chọn:** A — worker-pool với cap mặc định 5, capture lỗi per-task.
- **Lý do:** Một profile lỗi (proxy hỏng, Chromium crash) không được kéo theo cả batch; cap 5 cân bằng tốc độ và tải CPU/RAM (mở Chromium khá nặng). Progress stream về UI qua `bridgeMessageToUI`.
- **Ảnh hưởng:** `packages/main/src/utils/concurrency.ts`, `services/batch-service.ts` (`window-batch-open`/`window-batch-close`).

---

## [Phase 4.4] Tiling cửa sổ là best-effort, feature-detect native addon
- **Ngày:** 2026-06-29
- **Bối cảnh:** Sắp xếp lưới (tile) các cửa sổ Chromium đang chạy. Native addon `window-addon.node` hiện chỉ expose method đọc (`getAllWindows`, `getWindowBounds`) và gửi event, chưa thấy primitive move/setBounds chắc chắn.
- **Các phương án cân nhắc:** (A) Feature-detect `windowManager.setWindowBounds`; có thì tile theo lưới `ceil(sqrt(n))` cột trên `workArea` của primary display, không có thì trả thông báo "không hỗ trợ"; (B) Giả định API tồn tại và gọi thẳng (rủi ro crash); (C) Bỏ tính năng tile.
- **Phương án đã chọn:** A — best-effort + feature-detect.
- **Lý do:** Không chặn tiến độ, không crash khi build/platform thiếu primitive; khi addon có `setWindowBounds` thì tile chạy ngay. Lưới `ceil(sqrt(n))` là cách bố trí phổ biến, cân đối hàng/cột.
- **Ảnh hưởng:** `services/batch-service.ts` (`window-tile`).

---

## [Phase 3.5] AccountPanel đặt full-width dưới form + fingerprint (edit mode)
- **Ngày:** 2026-06-29
- **Bối cảnh:** Nhúng panel quản lý tài khoản (credential) vào trang detail. Mơ hồ về vị trí: cạnh fingerprint, trong tab riêng, hay khối riêng.
- **Các phương án cân nhắc:** (A) Khối full-width xếp dọc bên dưới hàng (form + FingerprintPanel), chỉ hiện ở edit mode (đã có `windowId`); (B) Thêm tab riêng; (C) Cột thứ ba cạnh fingerprint.
- **Phương án đã chọn:** A — khối full-width bên dưới, chỉ edit mode.
- **Lý do:** Account gắn với `window_id` nên chỉ có nghĩa khi profile đã tồn tại; bảng account cần chiều ngang → đặt full-width dễ đọc hơn cột hẹp; tránh thêm tab làm phân mảnh luồng. Create mode (chưa có id) không hiện panel để tránh thao tác vô nghĩa.
- **Ảnh hưởng:** `packages/renderer/src/pages/windows/detail/index.tsx`, `components/account-panel`.

---

## [Phase 4.5] Batch open/close dùng handler concurrency; cookie/tile vào menu "More"
- **Ngày:** 2026-06-29
- **Bối cảnh:** Wire các thao tác hàng loạt vào trang danh sách windows. Trước đây nút Open/Close lặp tuần tự từng profile.
- **Các phương án cân nhắc:** (A) Nút Open/Close toolbar gọi `batchOpen`/`batchClose` (handler concurrency mới); Cookie import/export và Tile đưa vào dropdown "More" cùng Export/Delete; (B) Thêm hàng loạt nút mới ra toolbar; (C) Giữ vòng lặp tuần tự cũ.
- **Phương án đã chọn:** A — tái dùng nút Open/Close sẵn có cho batch, gom thao tác ít dùng vào "More".
- **Lý do:** Tận dụng concurrency runner để mở/đóng nhanh hơn và có progress; giữ toolbar gọn (chỉ action chính), action phụ (cookie/tile) nằm trong "More" theo đúng pattern hiện có của trang. Vẫn giữ `openWindows`/`closeWindows` per-row cho nút trong từng dòng.
- **Ảnh hưởng:** `packages/renderer/src/pages/windows/index.tsx`, `components/cookie-modal`, `WindowBridge` (`batchOpen/batchClose/tile/importCookie/exportCookie`).


