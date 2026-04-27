import { stripe, supabaseAdmin, PRICE_PLAN_MAP } from './_lib/stripe.js';

function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return null;
  }
}

async function resolveUserId(eventObj) {
  // For checkout.session.completed, use client_reference_id directly
  if (eventObj.client_reference_id) {
    return eventObj.client_reference_id;
  }

  // For other events, look up via stripe customer ID
  const customerId = eventObj.customer;
  if (!customerId) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  return profile?.id || null;
}

async function updateProfile(userId, updates) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error(`[stripe-webhook] Profile update failed for ${userId}:`, error.message);
    return false;
  }
  console.log(`[stripe-webhook] Updated profile ${userId} -> ${updates.subscription_status}/${updates.plan || 'unchanged'}`);
  return true;
}

async function handleCheckoutCompleted(session) {
  const userId = session.client_reference_id;
  if (!userId) {
    console.error('[stripe-webhook] checkout.session.completed missing client_reference_id');
    return;
  }

  const subscriptionId = session.subscription;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const status = mapStripeStatus(subscription.status);
  if (!status) {
    console.log(`[stripe-webhook] Unmapped subscription status: ${subscription.status}`);
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = PRICE_PLAN_MAP[priceId] || null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await updateProfile(userId, {
    stripe_customer_id: session.customer,
    subscription_status: status,
    plan,
    current_period_end: periodEnd,
  });
}

async function handleSubscriptionChange(subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error('[stripe-webhook] Could not resolve userId for subscription:', subscription.id);
    return;
  }

  const status = mapStripeStatus(subscription.status);
  if (!status) {
    console.log(`[stripe-webhook] Unmapped subscription status: ${subscription.status}`);
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = PRICE_PLAN_MAP[priceId] || null;
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await updateProfile(userId, {
    stripe_customer_id: subscription.customer,
    subscription_status: status,
    plan,
    current_period_end: periodEnd,
  });
}

async function handleSubscriptionDeleted(subscription) {
  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error('[stripe-webhook] Could not resolve userId for deleted subscription:', subscription.id);
    return;
  }

  await updateProfile(userId, {
    subscription_status: 'cancelled',
    plan: null,
    current_period_end: null,
  });
}

async function handleInvoicePaymentFailed(invoice) {
  const userId = await resolveUserId(invoice);
  if (!userId) {
    console.error('[stripe-webhook] Could not resolve userId for failed invoice');
    return;
  }

  await updateProfile(userId, {
    subscription_status: 'past_due',
  });
}

async function handleInvoicePaymentSucceeded(invoice) {
  const userId = await resolveUserId(invoice);
  if (!userId) return;

  // Only update if the profile is currently past_due (recovery scenario)
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.subscription_status === 'past_due') {
    await updateProfile(userId, {
      subscription_status: 'active',
    });
  }
}

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return new Response(JSON.stringify({ error: 'Missing stripe-signature header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[stripe-webhook] Received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      default:
        console.log(`[stripe-webhook] Ignoring event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${event.type}:`, err.message);
  }

  // Always return 200 so Stripe doesn't retry
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
