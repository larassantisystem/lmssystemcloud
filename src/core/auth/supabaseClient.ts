/**
 * Cloudflare D1 Database Client Adapter (Replaces Supabase with Cloudflare D1)
 * Zero Egress Bandwidth Fees - Zero localStorage dependency
 * All transactions execute directly against Cloudflare D1
 */

import { cloudflareD1 } from '../cloudflare/cloudflareClient';

export const isCloudflareConfigured = true;
export const isD1Configured = true;
export const isSupabaseConfigured = true; // Compatibility flag for existing modules

export const d1 = cloudflareD1;
export const cloudflare = cloudflareD1;
export const supabase = cloudflareD1 as any; // PostgREST-compatible syntax adapter powered by Cloudflare D1

export default cloudflareD1;
