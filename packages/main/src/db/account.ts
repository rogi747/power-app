import {db} from '.';
import type {DB} from '../../../shared/types/db';
import {encrypt, decrypt} from '../utils/crypto';

/**
 * Phase 3.4 — Account CRUD.
 *
 * Persistence rule: `password` / `secret` are encrypted on write into
 * `password_enc` / `secret_enc`, and decrypted back into `password` / `secret`
 * on read. Callers (IPC / API) only ever see the decrypted app-facing shape.
 */

interface AccountRow {
  id?: number;
  window_id?: number | null;
  platform?: string | null;
  username?: string | null;
  password_enc?: string | null;
  secret_enc?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string | null;
}

const toRow = (account: DB.Account): AccountRow => {
  const row: AccountRow = {
    window_id: account.window_id ?? null,
    platform: account.platform ?? null,
    username: account.username ?? null,
    notes: account.notes ?? null,
  };
  // Only set encrypted columns when the plaintext field was provided, so a
  // partial update does not wipe an existing credential.
  if (account.password !== undefined) {
    row.password_enc = encrypt(account.password);
  }
  if (account.secret !== undefined) {
    row.secret_enc = encrypt(account.secret);
  }
  return row;
};

const fromRow = (row: AccountRow): DB.Account => ({
  id: row.id,
  window_id: row.window_id ?? null,
  platform: row.platform ?? '',
  username: row.username ?? '',
  password: decrypt(row.password_enc),
  secret: decrypt(row.secret_enc),
  notes: row.notes ?? '',
  created_at: row.created_at,
  updated_at: row.updated_at ?? undefined,
});

const all = async (): Promise<DB.Account[]> => {
  const rows: AccountRow[] = await db('account').select('*').orderBy('created_at', 'desc');
  return rows.map(fromRow);
};

const getById = async (id: number): Promise<DB.Account | undefined> => {
  const row: AccountRow | undefined = await db('account').where({id}).first();
  return row ? fromRow(row) : undefined;
};

const getByWindowId = async (windowId: number): Promise<DB.Account[]> => {
  const rows: AccountRow[] = await db('account')
    .where({window_id: windowId})
    .orderBy('created_at', 'desc');
  return rows.map(fromRow);
};

const create = async (account: DB.Account) => {
  const insertData = {
    ...toRow(account),
    created_at: new Date().toISOString(),
  };
  const [id] = await db('account').insert(insertData);
  return {
    success: true,
    message: 'Account created successfully.',
    data: {id},
  };
};

const update = async (id: number, account: DB.Account) => {
  try {
    await db('account')
      .where({id})
      .update({...toRow(account), updated_at: new Date().toISOString()});
    return {success: true, message: 'Account updated successfully.'};
  } catch (error) {
    return {success: false, message: 'Failed to update account. ' + error};
  }
};

const remove = async (id: number) => {
  return await db('account').where({id}).delete();
};

const batchDelete = async (ids: number[]) => {
  return await db('account').whereIn('id', ids).delete();
};

export const AccountDB = {
  all,
  getById,
  getByWindowId,
  create,
  update,
  remove,
  batchDelete,
};
