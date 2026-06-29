import {db} from '.';
import type {DB, SafeAny} from '../../../shared/types/db';

const all = async () => {
  return await db('proxy')
    .leftJoin('window', function () {
      this.on('window.proxy_id', '=', 'proxy.id').andOn('window.status', '>', 0 as SafeAny); //Added filter conditions
    })
    .select('proxy.*')
    .count('window.id as usageCount')
    .groupBy('proxy.id')
    .orderBy('proxy.created_at', 'desc');
};

const getById = async (id: number) => {
  return await db('proxy').where({id}).first();
};

const getByProxy = async (proxy_type?: string, proxy?: string) => {
  return await db('proxy').where({proxy_type, proxy}).first();
};

const update = async (id: number, updatedData: DB.Proxy) => {
  return await db('proxy').where({id}).update(updatedData);
};

const create = async (proxyData: DB.Proxy) => {
  return await db('proxy').insert(proxyData);
};

const importProxies = async (proxies: DB.Proxy[]) => {
  return await db('proxy').insert(proxies);
};

/**
 * Phase 4.2 — Proxies not currently assigned to any active window (status > 0).
 * Used by batch-create round-robin assignment so new profiles prefer free proxies.
 */
const getUnusedProxies = async (): Promise<DB.Proxy[]> => {
  return await db('proxy')
    .leftJoin('window', function () {
      this.on('window.proxy_id', '=', 'proxy.id').andOn('window.status', '>', 0 as SafeAny);
    })
    .whereNull('window.id')
    .select('proxy.*')
    .orderBy('proxy.created_at', 'desc');
};

/**
 * Phase 4.2 — Detect duplicate proxies (same proxy_type + proxy string).
 * Returns groups with their ids so the UI can surface/prune duplicates.
 */
const findDuplicates = async (): Promise<
  Array<{proxy_type: string; proxy: string; count: number; ids: number[]}>
> => {
  const rows: DB.Proxy[] = await db('proxy').select('id', 'proxy_type', 'proxy');
  const map = new Map<string, number[]>();
  for (const row of rows) {
    const key = `${row.proxy_type ?? ''}::${row.proxy ?? ''}`;
    const list = map.get(key) ?? [];
    if (row.id !== undefined) {
      list.push(row.id);
    }
    map.set(key, list);
  }
  const result: Array<{proxy_type: string; proxy: string; count: number; ids: number[]}> = [];
  for (const [key, ids] of map.entries()) {
    if (ids.length > 1) {
      const [proxy_type, proxy] = key.split('::');
      result.push({proxy_type, proxy, count: ids.length, ids});
    }
  }
  return result;
};

const remove = async (id: number) => {
  return await db('proxy').where({id}).delete();
};

const deleteAll = async () => {
  return await db('proxy').delete();
};

const batchDelete = async (ids: number[]) => {
  //First, check if these IDs are referenced by the window table
  const referencedIds = await db('window')
    .select('proxy_id')
    .where('status', '>', 0)
    .whereIn('proxy_id', ids)
    .then(rows => rows.map(row => row.proxy_id));

  //If there is a referenced ID, you can choose to throw an error or return relevant information
  if (referencedIds.length > 0) {
    //Or return relevant information
    return {success: false, message: 'Some IDs are referenced in the window table.', referencedIds};
  } else {
    try {
      await db('proxy').delete().whereIn('id', ids);
      return {success: true};
    } catch (error) {
      return {success: false, message: 'Failed to delete.'};
    }
  }
};

export const ProxyDB = {
  all,
  getById,
  getByProxy,
  getUnusedProxies,
  findDuplicates,
  batchDelete,
  importProxies,
  update,
  create,
  remove,
  deleteAll,
};
