# Feature Roadmap: chrome-power → AdsPower/MultiLogin parity

> Bản plan để giao cho agent thực thi. Mục tiêu: bổ sung các chức năng tương tự AdsPower / MultiLogin vào `chrome-power` (Electron + React/AntD + SQLite/Knex, 4 package: `main`, `preload`, `renderer`, `shared`).

---

## Conventions every task follows

- **Layering pattern (giữ nguyên):** migration → `db/*.ts` → `services/*-service.ts` (IPC `ipcMain.handle`) → `server/routes/*` (Local API) → `renderer` UI. Đăng ký service mới trong `packages/main/src/services/index.ts`.
- **Migrations:** file Knex trong `migrations/`, prefix timestamp `YYYYMMDDHHMMSS_name.js`, có `exports.up` / `exports.down`. Theo style file `20240317074532_add_fingerprint_to_window.js`.
- **Types:** mở rộng `packages/shared/types/db.d.ts` (namespace `DB`) và `common.d.ts` (`SettingOptions`).
- **Constants:** `DB_CONFIG`, `CONFIG_FILE_PATH`, `LOGS_PATH`, logger labels nằm ở `packages/main/src/constants/index.ts`.
- **Settings:** đọc qua `getSettings()` (`packages/main/src/utils/get-settings.ts`), shape ở `SettingOptions`.
- **No new deps** trừ khi task ghi rõ. Crypto dùng Node built-in `crypto`.

---

## QUY TẮC BẮT BUỘC (áp dụng cho toàn bộ plan)

1. **Không hỏi lại người dùng.** Agent tự xử lý mọi tình huống đến cùng, không dừng chờ xác nhận hay làm rõ.
2. **Tự quyết định khi mơ hồ.** Mọi điểm mơ hồ (đường dẫn file, chữ ký hàm, format dữ liệu, vị trí UI, tên cột DB…) phải tự đưa ra quyết định hợp lý nhất dựa trên pattern sẵn có trong repo và thông lệ phổ biến.
3. **Chọn phương án phổ biến nhất + ghi lại.** Khi có nhiều cách, chọn phương án chuẩn/phổ biến nhất (industry-standard hoặc khớp convention repo) và ghi vào `docs/decisions.md`.

### Decision Log

- **File:** `docs/decisions.md` (tạo nếu chưa có, append nếu đã có).
- **Khi nào ghi:** mỗi lần gặp tình huống mơ hồ hoặc nhiều phương án và phải tự chọn.
- **Format mỗi entry:**

```markdown
## [Phase X.Y] <Tiêu đề quyết định ngắn>
- **Ngày:** YYYY-MM-DD
- **Bối cảnh:** Điểm mơ hồ / cần quyết định.
- **Các phương án cân nhắc:** A, B, C (ngắn gọn).
- **Phương án đã chọn:** <X> — phổ biến nhất / khớp convention repo.
- **Lý do:** 1–2 câu.
- **Ảnh hưởng:** file/module bị tác động.
```

- Entry mới append xuống cuối, theo thứ tự thời gian. Không để trống lý do; không gộp nhiều quyết định vào một entry.

---

## Phase 0 — Prep reads (agent làm trước, không code)

Đọc các file sau để task sau không phải đoán: `packages/main/src/constants/index.ts` (đã xác nhận), `packages/shared/types/common.d.ts` (đã xác nhận), `packages/renderer/src` (router + layout các page), `migrations/20240317074532_add_fingerprint_to_window.js`, `packages/main/src/server/routes/proxy.ts` và `ip.ts`, `packages/main/src/utils/get-db-path.ts`.

Xác nhận lệnh build/typecheck trong `package.json`: `npm run typecheck:main`, `npm run typecheck:preload`, `npm run build`.

---

## Phase 1 — Fingerprint Engine (AdsPower-shaped, injection-ready)

**Mục tiêu:** App sinh fingerprint JSON đầy đủ theo schema AdsPower cho mỗi profile, truyền vào Chromium tùy biến qua `--extended-parameters=<base64(JSON)>`. App KHÔNG diễn giải field lúc runtime; browser (cắm sau) đọc.

- **1.1 Schema** — file mới `packages/shared/types/fingerprint.d.ts`: interface `Fingerprint` mirror `fingerprint_config` của AdsPower: `ua`, `ua_version`, `os`, `screen_resolution`, `color_depth`, `pixel_ratio`, `languages`, `language_switch`, `timezone`/`timezone_switch`, `geolocation` (`mode`, `lat`, `lon`, `accuracy`), `webrtc` (`mode`), `webgl_image`, `webgl_metadata` (`mode`, `vendor`, `renderer`), `canvas`, `audio`, `client_rects`, `fonts` (`mode`, `list[]`), `hardware_concurrency`, `device_memory`, `do_not_track`, `flash`, `media_devices`, `speech_voices`, `fpVersion` (int).
- **1.2 Generator** — file mới `packages/main/src/fingerprint/generator.ts`: `generateFingerprint(seed?)` sinh fingerprint nhất quán (UA OS ↔ platform ↔ fonts ↔ screen). Thay `randomFingerprint()` ở `window-service.ts:169`. Thêm `buildExtendedParameters(fp): string` trả `base64(JSON)`.
- **1.3 Injection** — trong `fingerprint/index.ts` (~dòng 241-298): bật lại `--extended-parameters`, `--user-agent`, `--timezone` từ fingerprint đã lưu (parse `windowData.fingerprint`; nếu rỗng → generate + persist qua `WindowDB.update`). Gate sau `if (!useLocalChrome)`. Local Chrome giữ args tối thiểu hiện tại.
- **1.4 Migration** — `add_fingerprint_meta_to_window.js`: thêm `fp_locked` (boolean, default true); đảm bảo cột `fingerprint` chứa full JSON. Update `DB.Window`.
- **1.5 IPC** — trong `window-service.ts`: `window-generate-fingerprint` (trả fingerprint mới cho editor), `window-update-fingerprint` (persist JSON đã sửa).
- **1.6 UI** — panel editor fingerprint trong page create/edit profile (random / lock toggle / override từng field).

---

## Phase 2 — AdsPower-compatible Local API

**Mục tiêu:** namespace `/api/v1/...` trả `{code:0, msg:"success", data:{...}}` (code != 0 khi lỗi), để SDK/script AdsPower chạy không sửa.

- **2.1 Response helper** — `server/routes/_resp.ts`: `ok(data)` / `fail(msg, code)`.
- **2.2 Router mới** — `server/routes/api-v1.ts`, mount trong `server/index.ts` qua `app.use('/api/v1', apiV1Router)`. Endpoint map vào DB/fingerprint layer hiện có:
  - `GET /browser/start?user_id=<profile_id>` → `openFingerprintWindow`, trả `data.ws.puppeteer` (webSocketDebuggerUrl), `data.debug_port`, `data.webdriver`.
  - `GET /browser/stop?user_id=` → `closeFingerprintWindow`.
  - `GET /browser/active?user_id=` → status từ `WindowDB`.
  - `GET /browser/list`, `POST /user/create`, `POST /user/update`, `POST /user/delete`, `GET /user/list` → `WindowDB`.
  - `GET /group/list`, `POST /group/create`; proxy endpoints → `ProxyDB`.
  - `GET /status` → `{code:0}`.
  - Map `user_id` (AdsPower) ↔ `id` nội bộ qua `WindowDB` (lookup theo `profile_id`).
- **2.3 Docs** — `docs/local-api.md` với bảng endpoint.

---

## Phase 3 — Cookie & Account management (mã hóa nhẹ)

- **3.1 Crypto util** — `packages/main/src/utils/crypto.ts`: AES-256-GCM (Node `crypto`), key sinh lần đầu lưu trong config dir. `encrypt(str)` / `decrypt(str)`.
- **3.2 Migration** — `create_account_table.js`: `account(id, window_id FK, platform, username, password_enc, secret_enc, notes, created_at, updated_at)`. Thêm `DB.Account`.
- **3.3 Cookie import/export** — mở rộng `window-service.ts` + `puppeteer/helpers.ts`: import format (EditThisCookie JSON, Netscape, header string) chuẩn hóa về shape `presetCookie`; `window-export-cookie` đọc cookie live qua CDP trả JSON. Bulk apply cho nhiều `windowIds`.
- **3.4 Account DB + service** — `db/account.ts` (CRUD, encrypt on write / decrypt on read) + `services/account-service.ts` (IPC), đăng ký trong `services/index.ts`.
- **3.5 UI** — nút import/export cookie trên row profile + section account trong editor.

---

## Phase 4 — Bulk operations & proxy pool

- **4.1 Batch create** — `window-batch-create`: N profile từ template, mỗi cái sinh fingerprint, gán proxy round-robin từ list proxy-id.
- **4.2 Proxy pool** — `db/proxy.ts`: `getUnusedProxies`, phát hiện trùng; health re-check qua `testProxy` (`fingerprint/prepare.ts:215`).
- **4.3 Concurrency-limited open/close** — `packages/main/src/utils/concurrency.ts` (queue). `window-batch-open(ids, maxConcurrent)` / `window-batch-close`. Progress qua `bridgeMessageToUI`.
- **4.4 Window tiling** — `window-tile` dùng native `windowManager` (đã load ở `multi-window-sync-service.ts:155`).
- **4.5 UI** — toolbar batch: create N, open/close selected (progress), tile.

---

## Phase 5 — Automation & RPA hooks (tùy chọn, chỉ build nếu Phase 1–4 ổn)

- **5.1 Script storage** — migration `create_script_table.js`: `script(id, name, steps_json, created_at, updated_at)`; `DB.Script`. Steps = JSON array `{action, selector?, value?, timeout?}` (goto, click, type, wait, scroll, evaluate).
- **5.2 Runner** — `packages/main/src/automation/runner.ts`: connect CDP profile đang chạy (pattern `puppeteer.connect` ở `multi-window-sync-service.ts:1214`), chạy step tuần tự, timeout/error per-step, trả run log.
- **5.3 IPC + API** — `services/automation-service.ts` (`script-create/update/delete/list/run`) đăng ký trong `services/index.ts`; expose `POST /api/v1/script/run`.
- **5.4 UI** — list script + editor JSON steps + nút "Run on selected profiles".

---

## Cross-cutting validation (chạy sau mỗi phase)

- **Type check + build:** chạy `npm run typecheck:main` / `typecheck:preload` / `npm run build` sau mỗi phase; phase chưa xong nếu chưa compile sạch.
- **Migration round-trip:** mỗi migration `up` rồi `down` không lỗi trên DB scratch.
- **API smoke test (sau Phase 2):** gọi `/api/v1/status`, `/browser/list`, chu trình `start`→`active`→`stop` trên 1 profile thật; xác nhận envelope `{code, msg, data}` và `webSocketDebuggerUrl` hợp lệ.
- **No-regression:** route cũ (`/profiles`, `/window`) và multi-window sync vẫn chạy — v1 là additive.
- **Backward-compat:** profile tạo trước Phase 1 (fingerprint rỗng) vẫn mở được — injection path generate-and-persist lần mở đầu.
- **Decision log:** sau mỗi phase, kiểm tra `docs/decisions.md` đã ghi đủ mọi quyết định tự đưa ra. Phase chưa xong nếu còn quyết định mơ hồ chưa log.

---

## Sequencing

1. **Phase 0 → 1 → 2 trước.** Fingerprint + v1 API là lõi parity, unblock phần còn lại; cũng rủi ro cao nhất (chạm launch path + server).
2. **Phase 3 và 4 độc lập** nhau, làm thứ tự nào cũng được sau khi 1–2 ổn.
3. **Phase 5 tùy chọn** — gate sau khi các phase kia land sạch.
