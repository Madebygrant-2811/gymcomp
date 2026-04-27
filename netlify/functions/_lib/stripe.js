import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
});

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export const PLAN_PRICE_MAP = {
  quarterly: process.env.STRIPE_PRICE_QUARTERLY,
  six_month: process.env.STRIPE_PRICE_SIX_MONTH,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

export const PRICE_PLAN_MAP = Object.fromEntries(
  Object.entries(PLAN_PRICE_MAP).map(([plan, priceId]) => [priceId, plan])
);

export const VALID_PLANS = ['quarterly', 'six_month', 'annual'];

export const FOUNDING_COUPON_ID = '7fGGt1xL';
export const FOUNDING_COUPON_MAX = 10;
