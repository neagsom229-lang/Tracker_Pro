// supabase/functions/customer-portal/index.ts
//
// Deploy with: supabase functions deploy customer-portal
//
// Lets a signed-in user manage their own subscription (update card, view
// invoices, cancel) on Stripe's hosted Customer Portal, without us
// building any of that UI or ever touching card data ourselves.
//
// Note: this function still needs a normal Supabase auth token (unlike
// the webhook), so it's deployed WITHOUT --no-verify-jwt — only a
// logged-in user of YOUR app can call it, and only for their own
// customer id.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@17.5.0';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    // Identify the caller from their Supabase access token.
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Not authenticated');

    // Service-role client to read stripe_customers regardless of RLS —
    // safe because we've already verified the caller's identity above,
    // and we only ever look up THEIR row (eq('user_id', user.id)).
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link } = await admin
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!link?.stripe_customer_id) {
      throw new Error('No billing account found yet — subscribe first, then manage billing here.');
    }

    const { returnUrl } = await req.json();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: link.stripe_customer_id,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});