import {
  stripe,
  supabaseAdmin,
  PLAN_PRICE_MAP,
  VALID_PLANS,
  FOUNDING_COUPON_ID,
  FOUNDING_COUPON_MAX,
} from './_lib/stripe.js';

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { userId, plan } = await req.json();

    if (!userId || !plan) {
      return new Response(JSON.stringify({ error: 'userId and plan are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!VALID_PLANS.includes(plan)) {
      return new Response(
        JSON.stringify({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) {
      console.error(`[create-checkout-session] Missing env var for plan: ${plan}`);
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Look up the user's profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('[create-checkout-session] Profile lookup error:', profileError.message);
      return new Response(JSON.stringify({ error: 'Failed to look up user profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user email from Supabase Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authError) {
      console.error('[create-checkout-session] Auth lookup error:', authError.message);
    }

    // Founding 25 coupon logic — check redemption count
    let discounts = [];
    try {
      const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON_ID);
      if (coupon && coupon.times_redeemed < FOUNDING_COUPON_MAX) {
        discounts = [{ coupon: FOUNDING_COUPON_ID }];
        console.log(`[create-checkout-session] Founding coupon applied (${coupon.times_redeemed}/${FOUNDING_COUPON_MAX} used)`);
      } else {
        console.log(`[create-checkout-session] Founding coupon exhausted (${coupon.times_redeemed}/${FOUNDING_COUPON_MAX})`);
      }
    } catch (couponErr) {
      console.log('[create-checkout-session] Coupon lookup skipped:', couponErr.message);
    }

    // Build session params
    const baseUrl = process.env.URL || 'http://localhost:5173';
    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard`,
      client_reference_id: userId,
    };

    if (discounts.length > 0) {
      sessionParams.discounts = discounts;
    }

    if (profile?.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id;
    } else if (user?.email) {
      sessionParams.customer_email = user.email;
    }

    console.log('[create-checkout-session] Creating session for user:', userId, 'plan:', plan);
    const session = await stripe.checkout.sessions.create(sessionParams);
    console.log('[create-checkout-session] Session created:', session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[create-checkout-session] Error:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
