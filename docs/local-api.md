# Local API (AdsPower-compatible) — `/api/v1`

The app exposes an AdsPower-compatible Local API so existing AdsPower SDKs and
automation scripts can drive `chrome-power` without modification.

- **Base URL:** `http://localhost:<port>/api/v1` (default port `49156`, auto-increments if busy — check `GET /status` on the root server).
- **Envelope:** every response is `{ "code": 0, "msg": "success", "data": { ... } }`. `code: 0` means success; any non-zero `code` is an error and `data` may be omitted.
- **ID mapping:** the AdsPower `user_id` maps to the internal window `profile_id`. The API resolves it to the numeric `id` for all DB operations.

## Endpoints

| Method | Path | Query / Body | Description |
| ------ | ---- | ------------ | ----------- |
| GET | `/status` | — | Health check. Returns `{code:0}`. |
| GET | `/browser/start` | `user_id` | Open the profile. Returns `data.ws.puppeteer` (webSocketDebuggerUrl), `data.debug_port`, `data.webdriver`. |
| GET | `/browser/stop` | `user_id` | Close the profile. |
| GET | `/browser/active` | `user_id` | Running status: `data.status` is `Active` / `Inactive`, plus `ws` and `debug_port` when active. |
| GET | `/browser/list` | — | All profiles (`data.list`). |
| GET | `/user/list` | — | All profiles (`data.list`). |
| POST | `/user/create` | window JSON | Create a profile. Returns `data.id` (profile_id) and `data.internal_id`. |
| POST | `/user/update` | `user_id` + fields | Update a profile. |
| POST | `/user/delete` | `user_ids[]` or `user_id` | Soft-delete profiles. |
| GET | `/group/list` | — | All groups (`data.list`). |
| POST | `/group/create` | `group_name` | Create a group. Returns `data.group_id`. |
| GET | `/proxy/list` | — | All proxies (`data.list`). |
| POST | `/proxy/create` | proxy JSON | Create a proxy. Returns `data.proxy_id`. |

## Example: start a browser

```bash
curl "http://localhost:49156/api/v1/browser/start?user_id=<profile_id>"
```

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "ws": { "puppeteer": "ws://127.0.0.1:9222/devtools/browser/<id>", "selenium": "127.0.0.1:9222" },
    "debug_port": "9222",
    "webdriver": ""
  }
}
```

> Note: the legacy routes (`/profiles`, `/window`, `/proxy`, `/ip`) remain unchanged. The v1 API is additive.
