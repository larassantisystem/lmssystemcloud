/**
 * Cloudflare D1 Database Client Adapter (Replaces Supabase with Cloudflare D1)
 * Zero Egress Bandwidth Fees - Zero localStorage dependency
 * All transactions execute directly against Cloudflare D1
 */

import { cloudflareD1 } from '../cloudflare/cloudflareClient';

export const isCloudflareConfigured = true;
export const isSupabaseConfigured = true; // Flag maintained for existing consumer modules

// Supabase PostgREST adapter powered by Cloudflare D1
export const supabase = cloudflareD1 as any;
export const cloudflare = cloudflareD1;

export default cloudflareD1;
