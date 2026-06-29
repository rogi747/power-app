import express from 'express';
import type {DB} from '../../../../shared/types/db';
import {WindowDB} from '/@/db/window';
import {ProxyDB} from '/@/db/proxy';
import {GroupDB} from '/@/db/group';
import {openFingerprintWindow, closeFingerprintWindow} from '../../fingerprint/index';
import {ok, fail} from './_resp';

/**
 * AdsPower-compatible Local API (namespace `/api/v1`).
 *
 * Every response uses the `{code, msg, data}` envelope so existing AdsPower SDKs
 * and scripts work unmodified. `user_id` in the AdsPower contract maps to the
 * internal window `profile_id`; we resolve it to the numeric `id` for all DB ops.
 */
const router = express.Router();

/** Resolve an AdsPower `user_id` (== profile_id) to the internal window row. */
async function resolveWindowByUserId(userId: string): Promise<DB.Window | undefined> {
  if (!userId) return undefined;
  const rows = await WindowDB.find({profile_id: userId});
  return rows && rows.length ? rows[0] : undefined;
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------
router.get('/status', (_req, res) => {
  res.send(ok());
});

// ---------------------------------------------------------------------------
// browser lifecycle
// ---------------------------------------------------------------------------
router.get('/browser/start', async (req, res) => {
  const userId = String(req.query.user_id || '');
  const window = await resolveWindowByUserId(userId);
  if (!window?.id) {
    res.send(fail('user_id not found'));
    return;
  }
  try {
    const data = await openFingerprintWindow(window.id);
    if (!data?.webSocketDebuggerUrl) {
      res.send(fail('failed to start browser'));
      return;
    }
    const refreshed = await WindowDB.getById(window.id);
    res.send(
      ok({
        ws: {
          puppeteer: data.webSocketDebuggerUrl,
          selenium: `127.0.0.1:${refreshed.port}`,
        },
        debug_port: String(refreshed.port ?? ''),
        webdriver: '',
      }),
    );
  } catch (error) {
    res.send(fail(`failed to start browser: ${error}`));
  }
});

router.get('/browser/stop', async (req, res) => {
  const userId = String(req.query.user_id || '');
  const window = await resolveWindowByUserId(userId);
  if (!window?.id) {
    res.send(fail('user_id not found'));
    return;
  }
  try {
    await closeFingerprintWindow(window.id, true);
    res.send(ok());
  } catch (error) {
    res.send(fail(`failed to stop browser: ${error}`));
  }
});

router.get('/browser/active', async (req, res) => {
  const userId = String(req.query.user_id || '');
  const window = await resolveWindowByUserId(userId);
  if (!window?.id) {
    res.send(fail('user_id not found'));
    return;
  }
  const refreshed = await WindowDB.getById(window.id);
  const active = refreshed.status === 2;
  res.send(
    ok({
      status: active ? 'Active' : 'Inactive',
      ws: active ? {puppeteer: '', selenium: `127.0.0.1:${refreshed.port}`} : {},
      debug_port: active ? String(refreshed.port ?? '') : '',
    }),
  );
});

router.get('/browser/list', async (_req, res) => {
  const windows = await WindowDB.all();
  res.send(ok({list: windows}));
});

// ---------------------------------------------------------------------------
// user (profile) CRUD
// ---------------------------------------------------------------------------
router.get('/user/list', async (_req, res) => {
  const windows = await WindowDB.all();
  res.send(ok({list: windows}));
});

router.post('/user/create', async (req, res) => {
  const window = (req.body || {}) as DB.Window;
  const result = await WindowDB.create(window);
  if (!result.success) {
    res.send(fail(result.message));
    return;
  }
  res.send(ok({id: result.data?.profile_id, internal_id: result.data?.id}));
});

router.post('/user/update', async (req, res) => {
  const userId = String(req.body?.user_id || '');
  const window = await resolveWindowByUserId(userId);
  if (!window?.id) {
    res.send(fail('user_id not found'));
    return;
  }
  const result = await WindowDB.update(window.id, {...window, ...(req.body || {})});
  res.send(result.success ? ok() : fail(result.message));
});

router.post('/user/delete', async (req, res) => {
  const ids: string[] = req.body?.user_ids || (req.body?.user_id ? [req.body.user_id] : []);
  if (!ids.length) {
    res.send(fail('user_ids is required'));
    return;
  }
  for (const userId of ids) {
    const window = await resolveWindowByUserId(userId);
    if (window?.id) {
      await WindowDB.remove(window.id);
    }
  }
  res.send(ok());
});

// ---------------------------------------------------------------------------
// group
// ---------------------------------------------------------------------------
router.get('/group/list', async (_req, res) => {
  const groups = await GroupDB.all();
  res.send(ok({list: groups}));
});

router.post('/group/create', async (req, res) => {
  const name = String(req.body?.group_name || req.body?.name || '');
  if (!name) {
    res.send(fail('group_name is required'));
    return;
  }
  const [id] = await GroupDB.create({name});
  res.send(ok({group_id: id, group_name: name}));
});

// ---------------------------------------------------------------------------
// proxy
// ---------------------------------------------------------------------------
router.get('/proxy/list', async (_req, res) => {
  const proxies = await ProxyDB.all();
  res.send(ok({list: proxies}));
});

router.post('/proxy/create', async (req, res) => {
  const proxy = (req.body || {}) as DB.Proxy;
  const result = await ProxyDB.create(proxy);
  res.send(ok({proxy_id: result[0]}));
});

export default router;
