import { stripe, FOUNDING_COUPON_ID, FOUNDING_COUPON_MAX } from './_lib/stripe.js';

export default async (req, context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
    const remaining = Math.max(0, FOUNDING_COUPON_MAX - (coupon.times_redeemed || 0));

    return new Response(JSON.stringify({ remaining, total: FOUNDING_COUPON_MAX }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    console.error('[get-founding-spots] Error:', err.message);
    return new Response(JSON.stringify({ remaining: 0, total: FOUNDING_COUPON_MAX, error: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60',
      },
    });
  }
};
