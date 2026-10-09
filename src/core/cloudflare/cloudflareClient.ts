/**
 * Cloudflare D1 Universal Database Client & Supabase Compatible Adapter
 * Replaces Supabase with Cloudflare D1 (Edge SQLite Database)
 * Enforces Zero localStorage - All transactions persist directly to Cloudflare D1
 */

export interface D1QueryResult<T = any> {
  results: T[];
  success: boolean;
  meta?: {
    changes?: number;
    last_row_id?: number;
    duration?: number;
  };
}

class CloudflareD1Client {
  private apiBase: string;

  constructor() {
    this.apiBase = '/api';
  }

  /**
   * Execute raw SQL query against Cloudflare D1
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<D1QueryResult<T>> {
    try {
      const cfAccountId = typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDFLARE_ACCOUNT_ID;
      const cfDbId = typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDFLARE_DATABASE_ID;
      const cfToken = typeof import.meta !== 'undefined' && import.meta.env?.VITE_CLOUDFLARE_API_TOKEN;

      // Direct Cloudflare D1 REST API query (for Vercel / external hosting)
      if (cfAccountId && cfDbId && cfToken) {
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${cfDbId}/query`;
        const res = await fetch(cfUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql, params }),
        });
        const cfData: any = await res.json();
        if (!cfData.success) {
          throw new Error(cfData.errors?.[0]?.message || 'Cloudflare D1 REST query failed');
        }
        const resultObj = cfData.result?.[0] || {};
        return {
          results: resultObj.results || [],
          success: true,
          meta: resultObj.meta,
        };
      }

      // Default: local server proxy / Cloudflare Pages function
      const response = await fetch(`${this.apiBase}/d1/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare D1 Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return {
        results: data.results || [],
        success: true,
        meta: data.meta,
      };
    } catch (err: any) {
      console.error('[Cloudflare D1] Query failed:', err.message, { sql, params });
      throw err;
    }
  }

  /**
   * Health check for Cloudflare D1 Connection
   */
  async checkHealth(): Promise<{ status: string; engine: string; serverTime: string }> {
    const res = await fetch(`${this.apiBase}/health`);
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
    return res.json();
  }

  /**
   * Fluent SQL Query Builder compatible with Supabase PostgREST syntax
   */
  from(tableName: string) {
    return new D1QueryBuilder(this, tableName);
  }

  /**
   * Auth facade compatible with Supabase Auth interface
   */
  get auth() {
    return {
      getUser: async () => {
        const res = await this.query('SELECT * FROM profiles LIMIT 1');
        const user = res.results[0] || null;
        return { data: { user }, error: null };
      },
      getSession: async () => {
        return { data: { session: null }, error: null };
      },
      signInWithPassword: async ({ email, password }: { email?: string; password?: string }) => {
        const identifier = (email || '').trim();
        const sql = 'SELECT * FROM profiles WHERE LOWER(nik) = LOWER(?) OR LOWER(id) = LOWER(?) LIMIT 1';
        const res = await this.query(sql, [identifier, identifier]);
        const profile = res.results[0];

        if (!profile) {
          return { data: { user: null, session: null }, error: { message: 'Pengguna tidak ditemukan dalam sistem Cloudflare D1' } };
        }

        return {
          data: {
            user: {
              id: profile.id,
              email: `${profile.nik}@larassanti.co.id`,
              user_metadata: {
                name: profile.name,
                role: profile.role,
                department: profile.department,
              },
            },
            session: { access_token: `cf-d1-token-${profile.id}`, user: profile },
          },
          error: null,
        };
      },
      signUp: async ({ email, password, options }: any) => {
        const name = options?.data?.name || email;
        const role = options?.data?.role || 'staff';
        const department = options?.data?.department || 'rnd';
        const nik = email.split('@')[0].toUpperCase();
        const id = `usr-${Date.now()}`;

        await this.query(
          'INSERT INTO profiles (id, nik, name, role, department, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
          [id, nik, name, role, department, password]
        );

        return {
          data: {
            user: { id, email },
            session: null,
          },
          error: null,
        };
      },
      signOut: async () => {
        return { error: null };
      },
      onAuthStateChange: () => {
        return {
          data: {
            subscription: {
              unsubscribe: () => {},
            },
          },
        };
      },
    };
  }
}

/**
 * Fluent Query Builder providing PostgREST syntax on top of Cloudflare D1
 */
class D1QueryBuilder {
  private client: CloudflareD1Client;
  private table: string;
  private selectCols: string = '*';
  private whereClauses: { col: string; op: string; val: any }[] = [];
  private orderClauses: { col: string; ascending: boolean }[] = [];
  private limitVal?: number;
  private offsetVal?: number;
  private countMode?: string;
  private headOnly: boolean = false;

  constructor(client: CloudflareD1Client, table: string) {
    this.client = client;
    this.table = table;
  }

  select(columns: string = '*', options: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean } = {}) {
    this.selectCols = columns;
    if (options.count) {
      this.countMode = options.count;
    }
    if (options.head) {
      this.headOnly = true;
    }
    return this;
  }

  eq(col: string, val: any) {
    this.whereClauses.push({ col, op: '=', val });
    return this;
  }

  neq(col: string, val: any) {
    this.whereClauses.push({ col, op: '!=', val });
    return this;
  }

  in(col: string, values: any[]) {
    this.whereClauses.push({ col, op: 'IN', val: values });
    return this;
  }

  like(col: string, val: string) {
    this.whereClauses.push({ col, op: 'LIKE', val });
    return this;
  }

  ilike(col: string, val: string) {
    this.whereClauses.push({ col, op: 'LIKE', val });
    return this;
  }

  order(col: string, options: { ascending?: boolean } = {}) {
    this.orderClauses.push({ col, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.limitVal = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetVal = from;
    this.limitVal = to - from + 1;
    return this;
  }

  async single() {
    this.limitVal = 1;
    const res = await this.executeSelect();
    if (res.error) return { data: null, error: res.error };
    const row = res.data && res.data.length > 0 ? res.data[0] : null;
    return { data: row, error: null };
  }

  async maybeSingle() {
    this.limitVal = 1;
    const res = await this.executeSelect();
    if (res.error) return { data: null, error: res.error };
    const row = res.data && res.data.length > 0 ? res.data[0] : null;
    return { data: row, error: null };
  }

  /**
   * Execute SELECT query
   */
  private async executeSelect() {
    const params: any[] = [];
    let wherePart = '';

    if (this.whereClauses.length > 0) {
      const parts = this.whereClauses.map((w) => {
        if (w.op === 'IN') {
          if (!Array.isArray(w.val) || w.val.length === 0) return '1=0';
          const placeholders = w.val.map(() => '?').join(',');
          params.push(...w.val);
          return `${w.col} IN (${placeholders})`;
        }
        params.push(w.val);
        return `${w.col} ${w.op} ?`;
      });
      wherePart = ` WHERE ${parts.join(' AND ')}`;
    }

    if (this.headOnly) {
      try {
        const countSql = `SELECT COUNT(*) as count FROM ${this.table}${wherePart}`;
        const countRes = await this.client.query(countSql, params);
        const count = countRes.results[0]?.count || 0;
        return { data: null, count, error: null };
      } catch (err: any) {
        return { data: null, count: 0, error: err };
      }
    }

    let sql = `SELECT ${this.selectCols === '*' ? '*' : this.selectCols} FROM ${this.table}${wherePart}`;

    if (this.orderClauses.length > 0) {
      const parts = this.orderClauses.map((o) => `${o.col} ${o.ascending ? 'ASC' : 'DESC'}`);
      sql += ` ORDER BY ${parts.join(', ')}`;
    }

    if (this.limitVal !== undefined) {
      sql += ` LIMIT ${this.limitVal}`;
    }
    if (this.offsetVal !== undefined) {
      sql += ` OFFSET ${this.offsetVal}`;
    }

    try {
      let count = undefined;
      if (this.countMode === 'exact') {
        const countSql = `SELECT COUNT(*) as count FROM ${this.table}${wherePart}`;
        const countRes = await this.client.query(countSql, params);
        count = countRes.results[0]?.count || 0;
      }

      const res = await this.client.query(sql, params);
      return { data: res.results, count, error: null };
    } catch (err: any) {
      return { data: null, count: 0, error: err };
    }
  }

  then(resolve: any, reject: any) {
    return this.executeSelect().then(resolve, reject);
  }

  /**
   * INSERT statement with chainable .select().single() support
   */
  insert(values: Record<string, any> | Record<string, any>[]) {
    const list = Array.isArray(values) ? values : [values];

    const executeInsert = async () => {
      if (list.length === 0) return { data: [], error: null };
      try {
        const inserted: any[] = [];
        for (const item of list) {
          const keys = Object.keys(item);
          const placeholders = keys.map(() => '?').join(', ');
          const vals = keys.map((k) => {
            const val = item[k];
            if (val && typeof val === 'object' && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val;
          });

          const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
          await this.client.query(sql, vals);
          inserted.push(item);
        }
        return { data: inserted, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    };

    return {
      then: (resolve: any, reject: any) => executeInsert().then(resolve, reject),
      select: (_cols?: string) => ({
        single: async () => {
          const res = await executeInsert();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data[0] || null, error: null };
        },
        maybeSingle: async () => {
          const res = await executeInsert();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data[0] || null, error: null };
        },
        then: (resolve: any, reject: any) => executeInsert().then(resolve, reject),
      }),
    };
  }

  /**
   * UPSERT statement with chainable .select().single() support
   */
  upsert(values: Record<string, any> | Record<string, any>[], options: { onConflict?: string } = {}) {
    const list = Array.isArray(values) ? values : [values];
    const conflictCol = options.onConflict || 'id';

    const executeUpsert = async () => {
      if (list.length === 0) return { data: [], error: null };
      try {
        const results: any[] = [];
        for (const item of list) {
          const keys = Object.keys(item);
          const placeholders = keys.map(() => '?').join(', ');
          const updateSets = keys
            .filter((k) => k !== conflictCol)
            .map((k) => `${k} = excluded.${k}`)
            .join(', ');

          const vals = keys.map((k) => {
            const val = item[k];
            if (val && typeof val === 'object' && !(val instanceof Date)) {
              return JSON.stringify(val);
            }
            return val;
          });

          const sql = `
            INSERT INTO ${this.table} (${keys.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(${conflictCol}) DO UPDATE SET ${updateSets || `${conflictCol} = excluded.${conflictCol}`}
          `;
          await this.client.query(sql, vals);
          results.push(item);
        }
        return { data: results, error: null };
      } catch (err: any) {
        return { data: null, error: err };
      }
    };

    return {
      then: (resolve: any, reject: any) => executeUpsert().then(resolve, reject),
      select: (_cols?: string) => ({
        single: async () => {
          const res = await executeUpsert();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data[0] || null, error: null };
        },
        maybeSingle: async () => {
          const res = await executeUpsert();
          if (res.error) return { data: null, error: res.error };
          return { data: res.data[0] || null, error: null };
        },
        then: (resolve: any, reject: any) => executeUpsert().then(resolve, reject),
      }),
    };
  }

  /**
   * UPDATE statement
   */
  update(values: Record<string, any>) {
    return {
      eq: async (col: string, val: any) => {
        try {
          const keys = Object.keys(values);
          const sets = keys.map((k) => `${k} = ?`).join(', ');
          const params = keys.map((k) => {
            const v = values[k];
            if (v && typeof v === 'object' && !(v instanceof Date)) {
              return JSON.stringify(v);
            }
            return v;
          });
          params.push(val);

          const sql = `UPDATE ${this.table} SET ${sets} WHERE ${col} = ?`;
          await this.client.query(sql, params);
          return { data: [values], error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
    };
  }

  /**
   * DELETE statement
   */
  delete() {
    return {
      eq: async (col: string, val: any) => {
        try {
          const sql = `DELETE FROM ${this.table} WHERE ${col} = ?`;
          await this.client.query(sql, [val]);
          return { data: null, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },
    };
  }
}

export const cloudflareD1 = new CloudflareD1Client();
