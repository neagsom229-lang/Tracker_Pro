// supabase/functions/parse-transaction/index.ts
//
// Deploy with: supabase functions deploy parse-transaction
//
// Turns a free-text sentence ("spent $15 on lunch today") into the
// structured shape TransactionModal/addTransaction already expect:
// { description, amount, category, date }. This function does NOT write
// to the database itself — it only parses and validates. The actual
// insert still goes through the normal client-side `addTransaction()`
// store action, so it goes through the exact same optimistic-update /
// RLS / error-handling path as a transaction typed in by hand. That
// also means a bug or bad response here can, at worst, fail to add a
// transaction — it can never write something unexpected into a user's
// data on its own.
//
// AUTH: deployed WITHOUT --no-verify-jwt (same as customer-portal), so
// Supabase's gateway rejects any request without a valid user access
// token before this code even runs. We additionally resolve the caller
// via that token below — not because we need their identity for
// anything (there's no user-scoped data read/written here), but as a
// second, defense-in-depth check, and so a `console.log` of `user.id`
// is available if you ever want to add per-user rate limiting later.
//
// COST/ABUSE CONTROL: the OpenAI key is a metered secret — anyone who
// could call this endpoint could run up your bill. Being behind
// Supabase's JWT check means only YOUR signed-in users can reach it at
// all; the input-length cap below then bounds the cost of any single
// call.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

// Keep this in sync with `CATEGORIES` in src/utils/constants.js. Edge
// Functions run in a separate Deno deployment from the Vite app, so
// they can't share a JS import for this — it's duplicated on purpose
// rather than reached into across a build boundary.
const VALID_CATEGORIES = [
  'salary', 'freelance', 'investment', // income
  'food', 'rent', 'transport', 'entertainment', 'shopping', 'utilities', 'health', 'other', // expense
];

const MAX_INPUT_LENGTH = 200; // generous for "spent $42.50 on dinner with friends last Tuesday"

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } });

  try {
    // Resolve the caller (see AUTH note above) — also doubles as a
    // belt-and-braces check in case JWT verification were ever
    // misconfigured at the function level.
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not authenticated.' }, 401);

    const { text } = await req.json();
    if (typeof text !== 'string' || !text.trim()) {
      return jsonResponse({ error: 'Describe a transaction first, e.g. "spent $15 on lunch".' }, 400);
    }
    if (text.length > MAX_INPUT_LENGTH) {
      return jsonResponse({ error: `Keep it under ${MAX_INPUT_LENGTH} characters.` }, 400);
    }

    // Computed server-side (not trusted from the client) so "today" /
    // "yesterday" resolve against the actual current date regardless of
    // the caller's device clock — this app has already hit one bug
    // caused by trusting a client clock (see useProStatus.js history),
    // so the server is deliberately the source of truth here too.
    const todayISO = new Date().toISOString().slice(0, 10);

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY is not set in this project\'s Edge Function secrets.');
      return jsonResponse({ error: 'AI Quick Add is not configured yet.' }, 500);
    }

    const systemPrompt = `You turn one sentence describing a single expense or income event into JSON.
Today's date is ${todayISO} (YYYY-MM-DD) — resolve relative dates ("today", "yesterday", "last Monday") against this.
Valid "category" values are exactly: ${VALID_CATEGORIES.join(', ')}.
Income categories are: salary, freelance, investment. All others are expenses.
Respond with ONLY a JSON object, no other text, in exactly one of these two shapes:
  {"description": string, "amount": positive number, "category": one of the valid values, "date": "YYYY-MM-DD"}
  {"error": "not_a_transaction"}   — use this if the sentence doesn't describe a single clear expense/income with an amount.
"amount" must always be a positive number (never negative) — direction is implied by the category, not the sign.
"description" should be a short, cleaned-up label (e.g. "Lunch", not "Spent $15 on lunch today").`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // A small, cheap model is plenty for this one-shot extraction
        // task. Swap for whichever model you prefer / have access to —
        // check OpenAI's current model list, since pricing and
        // availability change over time.
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text.trim() },
        ],
      }),
    });

    if (!aiResponse.ok) {
      // Log the real failure for us; never forward OpenAI's raw error
      // body (could contain account/billing details) to the client.
      console.error('OpenAI request failed:', aiResponse.status, await aiResponse.text());
      return jsonResponse({ error: 'AI Quick Add is temporarily unavailable — try again shortly.' }, 502);
    }

    const aiData = await aiResponse.json();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(aiData.choices[0].message.content);
    } catch {
      console.error('Model returned non-JSON content:', aiData.choices?.[0]?.message?.content);
      return jsonResponse({ error: "Couldn't understand that — try rephrasing." }, 422);
    }

    if (parsed.error === 'not_a_transaction') {
      return jsonResponse({ error: "Couldn't find an amount in that — try e.g. \"spent $15 on lunch\"." }, 422);
    }

    // Never trust the model's output shape at face value — validate
    // every field before it goes anywhere near the client, the same way
    // you'd validate any other untrusted input.
    const { description, amount, category, date } = parsed;
    const errors: string[] = [];
    if (typeof description !== 'string' || !description.trim()) errors.push('description');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) errors.push('amount');
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) errors.push('category');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date');

    if (errors.length) {
      console.error('Model returned an invalid shape, fields:', errors.join(', '), parsed);
      return jsonResponse({ error: "Couldn't understand that — try rephrasing." }, 422);
    }

    return jsonResponse({
      description: (description as string).trim().slice(0, 120),
      amount,
      category,
      date,
    });
  } catch (err) {
    console.error('Unexpected error in parse-transaction:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});