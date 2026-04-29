import { schedule } from '@netlify/functions';
import { supabaseAdmin } from './_lib/stripe.js';

const PREFIX = '[auto-complete-comps]';

async function runAutoComplete() {
  const now = new Date().toISOString();
  console.log(`${PREFIX} Running at ${now}`);

  // Find live competitions past their auto_complete_at deadline
  const { data: expired, error: fetchErr } = await supabaseAdmin
    .from('competitions')
    .select('id, name, auto_complete_at')
    .eq('status', 'live')
    .lt('auto_complete_at', now);

  if (fetchErr) {
    console.error(`${PREFIX} Failed to query competitions:`, fetchErr.message);
    return { statusCode: 500, body: JSON.stringify({ error: fetchErr.message }) };
  }

  if (!expired || expired.length === 0) {
    console.log(`${PREFIX} No expired live competitions found.`);
    return { statusCode: 200, body: JSON.stringify({ processed: 0, errors: 0 }) };
  }

  console.log(`${PREFIX} Found ${expired.length} expired competition(s)`);

  let processed = 0;
  let errors = 0;

  for (const comp of expired) {
    const { error: updateErr } = await supabaseAdmin
      .from('competitions')
      .update({ status: 'complete' })
      .eq('id', comp.id);

    if (updateErr) {
      console.error(`${PREFIX} Failed to complete "${comp.name}" (${comp.id}):`, updateErr.message);
      errors++;
    } else {
      console.log(`${PREFIX} Completed "${comp.name}" (${comp.id}), was due ${comp.auto_complete_at}`);
      processed++;
    }
  }

  console.log(`${PREFIX} Done — processed: ${processed}, errors: ${errors}`);
  return { statusCode: 200, body: JSON.stringify({ processed, errors }) };
}

export const handler = schedule('@daily', runAutoComplete);
