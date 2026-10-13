// Vercel Serverless Function: Cloudflare D1 API Proxy
// Handles /api/* requests on Vercel deployment with zero CORS limitations
import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.VITE_CLOUDFLARE_ACCOUNT_ID;
  const cfDbId = process.env.CLOUDFLARE_DATABASE_ID || process.env.VITE_CLOUDFLARE_DATABASE_ID;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN || process.env.VITE_CLOUDFLARE_API_TOKEN;

  if (req.url?.includes('/api/health')) {
    return res.status(200).json({
      status: 'ok',
      engine: cfAccountId ? 'Cloudflare D1 Remote Network' : 'Vercel Edge Proxy',
      serverTime: new Date().toISOString(),
      persistentStorage: true,
      localStorageUsed: false,
    });
  }

  if (req.url?.includes('/api/d1/query') && req.method === 'POST') {
    if (!cfAccountId || !cfDbId || !cfToken) {
      return res.status(500).json({
        error: 'Cloudflare D1 credentials (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_DATABASE_ID, CLOUDFLARE_API_TOKEN) are not configured in Vercel Environment Variables.'
      });
    }

    try {
      const { sql, params = [] } = req.body || {};
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/d1/database/${cfDbId}/query`;
      const cfRes = await fetch(cfUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });

      const cfData: any = await cfRes.json();
      if (!cfData.success) {
        return res.status(500).json({
          error: cfData.errors?.[0]?.message || 'Cloudflare D1 query failed'
        });
      }

      const resultObj = cfData.result?.[0] || {};
      return res.status(200).json({
        success: true,
        results: resultObj.results || [],
        meta: resultObj.meta,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Error executing query on Cloudflare D1' });
    }
  }

  return res.status(404).json({ error: `Not found: ${req.url}` });
}
