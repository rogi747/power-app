import type {SafeAny} from '../../../../shared/types/db';

/**
 * AdsPower-compatible response envelope: `{code, msg, data}`.
 * `code: 0` => success; any non-zero code => error.
 */
export interface ApiV1Response<T = SafeAny> {
  code: number;
  msg: string;
  data?: T;
}

export function ok<T>(data?: T): ApiV1Response<T> {
  return {code: 0, msg: 'success', data};
}

export function fail(msg: string, code = -1): ApiV1Response {
  return {code, msg};
}
