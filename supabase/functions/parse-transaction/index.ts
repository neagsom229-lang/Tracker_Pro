// supabase/functions/parse-transaction/index.ts
//
// Deploy with: supabase functions deploy parse-transaction
// (deliberately WITHOUT --no-verify-jwt — see the auth section below)
//
// Turns "Spent $15 on lunch today" into
//   { description: "Lunch", amount: 15, type: "expense",
//     category: "food", date: "2026-09-15", confidence: 0.94 }
//
// WHY THIS IS A SERVER FUNCTION AND NOT A fetch() IN THE BROWSER
// -------------------------------------------------------------
// An OpenAI key in frontend code is public, full stop — Vite inlines
// every VITE_* variable into the shipped JS bundle, and even a
// non-prefixed one would be visible in DevTools the moment it appeared
// in a request header. Anyone could then spend your credits from a
// script. Keeping the key as a Supabase secret means it exists only in
// this Deno process's environment; the browser never sees it and never
// talks to OpenAI directly.
//
// Three layers of protection against abuse:
//   1. Supabase's platform-level JWT verification (on by default).
//   2. Our own getUser() check, so we know exactly WHO is calling.
//   3. A per-user daily quota in Postgres, incremented atomically —
//      so a stolen/shared token still can't run up an unbounded bill.
//      (See supabase/migrations/003_ai_usage.sql.)

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ---------------------------------------------------------------------
// Kept in sync by hand with src/utils/constants.js. Duplicated rather
// than imported because Edge Functions run in Deno with no access to the
// Vite app's module graph. If you add a category there, add it here.
//
// The *type* (income/expense) is derived from this table rather than
// asked of the model, which removes a whole class of inconsistency — the
// model can't return category "food" with type "income".
// ---------------------------------------------------------------------
const CATEGORY_TYPES: Record<string, 'income' | 'expense'> = {
  salary: 'income',
  freelance: 'income',
  investment: 'income',
  food: 'expense',
  rent: 'expense',
  transport: 'expense',
  entertainment: 'expense',
  shopping: 'expense',
  utilities: 'expense',
  health: 'expense',
  other: 'expense',
};
const CATEGORY_IDS = Object.keys(CATEGORY_TYPES);

const MAX_INPUT_CHARS = 200;
const MAX_AMOUNT = 10_000_000;
const DAILY_LIMIT_FREE = 15;
const DAILY_LIMIT_PRO = 300;
const ACTIVE_SUB_STATUSES = ['active', 'trialing'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isSaneDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const year = parsed.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

// ---------------------------------------------------------------------
// Fallback parser — used when OPENAI_API_KEY isn't set.
//
// This is what makes the feature "mockable": you can deploy, click
// around, and demo the whole flow (including the quota and the review
// card) before you've added a key or spent a cent. It handles the common
// shapes well enough to be useful and is intentionally dumb about
// everything else.
// ---------------------------------------------------------------------
const KEYWORD_CATEGORIES: Array<[RegExp, string]> = [
  [/\b(salary|payday|paycheck|wage|got paid|stipend)\b/i, 'salary'],
  [/\b(freelance|client|invoice|gig|commission)\b/i, 'freelance'],
  [/\b(dividend|interest|stock|crypto|investment|returns)\b/i, 'investment'],
  [/\b(lunch|dinner|breakfast|coffee|cafe|restaurant|food|groceries|grocery|snack|eat|meal|noodle|rice)\b/i, 'food'],
  [/\b(rent|landlord|lease|mortgage)\b/i, 'rent'],
  [/\b(taxi|grab|tuk|uber|bus|train|fuel|petrol|gas|parking|moto|transport|flight)\b/i, 'transport'],
  [/\b(movie|cinema|game|concert|netflix|spotify|bar|party|entertainment)\b/i, 'entertainment'],
  [/\b(clothes|shoes|shirt|shopping|amazon|bought|store|mall)\b/i, 'shopping'],
  [/\b(electricity|water bill|internet|wifi|phone bill|utility|utilities)\b/i, 'utilities'],
  [/\b(doctor|pharmacy|medicine|hospital|dentist|clinic|gym|health)\b/i, 'health'],
];

const INCOME_HINT = /\b(earned|received|got paid|salary|refund|reimbursed|income|bonus|deposit|sold)\b/i;

function heuristicParse(text: string, today: string) {
  // Grab the first number that looks like money. Strips thousands
  // separators so "1,200" reads as 1200 rather than 1.
  const amountMatch = text.replace(/,(?=\d{3}\b)/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let category = 'other';
  for (const [pattern, id] of KEYWORD_CATEGORIES) {
    if (pattern.test(text)) {
      category = id;
      break;
    }
  }
  if (category === 'other' && INCOME_HINT.test(text)) category = 'salary';

  let date = today;
  if (/\byesterday\b/i.test(text)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }

  // Description: drop the amount, currency symbols and filler verbs,
  // then title-case the first word.
  const cleaned = text
    .replace(/[$€£¥៛]/g, ' ')
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/\b(spent|paid|on|for|today|yesterday|i|a|an|the|about|around|riel|usd|dollars?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const description = (cleaned || 'Quick entry').slice(0, 60);

  return {
    description: description.charAt(0).toUpperCase() + description.slice(1),
    amount,
    category,
    date,
    confidence: 0.5,
  };
}

// ---------------------------------------------------------------------
// The real parser.
// ---------------------------------------------------------------------
async function openAIParse(apiKey: string, text: string, today: string) {
  const systemPrompt = [
    'You convert one short personal-finance note into a single structured transaction.',
    `Today's date in the user's local timezone is ${today}. Resolve relative dates ("today",`,
    '"yesterday", "last Friday") against that date, and never return a date in the future.',
    'The amount is always a POSITIVE magnitude — whether it is money in or money out is',
    'determined by the category, not by the sign.',
    `Pick exactly one category from: ${CATEGORY_IDS.join(', ')}. Use "other" when nothing fits.`,
    'The description is a short human label (2-4 words, no amount, no date), e.g. "Lunch",',
    '"Grab to work", "October rent".',
    'Set confidence between 0 and 1 to reflect how sure you are; use a low value when the',
    'note is vague or you had to guess the amount.',
  ].join(' ');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // Cheap, fast, and more than capable of this extraction task.
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      // Structured Outputs: the API guarantees the response matches this
      // schema, so we never have to strip markdown fences or defend
      // against prose wrapped around the JSON.
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'transaction',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['description', 'amount', 'category', 'date', 'confidence'],
            properties: {
              description: { type: 'string', description: 'Short human label, 2-4 words' },
              amount: { type: 'number', description: 'Positive magnitude' },
              category: { type: 'string', enum: CATEGORY_IDS },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              confidence: { type: 'number' },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('openai error', response.status, detail);
    // Never forward the provider's raw error to the browser — it can
    // echo back parts of the request, including headers.
    throw new Error('The AI service is unavailable right now. Please try again in a moment.');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Couldn't read that — try rephrasing with an amount.");
  return JSON.parse(content);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // ---- 1. Who is calling? ------------------------------------------
    // This client is created with the ANON key plus the caller's own
    // Authorization header, so getUser() validates the JWT signature
    // against the project's secret. A forged or expired token fails
    // here, before a single token of OpenAI quota is spent.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated.' }, 401);

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Not authenticated.' }, 401);

    // ---- 2. Validate input before trusting any of it ------------------
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return json({ error: 'Type what you spent, e.g. "Spent $15 on lunch today".' }, 400);
    if (text.length > MAX_INPUT_CHARS) {
      return json({ error: `Keep it under ${MAX_INPUT_CHARS} characters.` }, 400);
    }

    // The client sends its LOCAL date so timezones resolve correctly.
    // It's user-controlled input, so it's regex-validated and falls back
    // to the server's date rather than being passed through blindly.
    const clientToday = typeof body.today === 'string' && isSaneDate(body.today) ? body.today : null;
    const today = clientToday ?? new Date().toISOString().slice(0, 10);

    // ---- 3. Quota ----------------------------------------------------
    // Service-role client: needed to read `subscriptions` and to write
    // `ai_usage` (which has no client-writable RLS policy at all). Safe
    // because the caller's identity is already verified above and every
    // query below is scoped to THEIR user id.
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: subscription } = await admin
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isPro = !!subscription && ACTIVE_SUB_STATUSES.includes(subscription.status);
    const limit = isPro ? DAILY_LIMIT_PRO : DAILY_LIMIT_FREE;

    const { data: quota, error: quotaError } = await admin
      .rpc('increment_ai_usage', { p_user_id: user.id, p_limit: limit })
      .maybeSingle();

    if (quotaError) {
      // Fail closed on a quota error rather than handing out free calls.
      console.error('quota rpc failed', quotaError.message);
      return json({ error: 'Quick Add is temporarily unavailable. Please try again shortly.' }, 503);
    }

    if (quota && quota.allowed === false) {
      return json(
        {
          error: isPro
            ? "You've hit today's Quick Add limit. It resets at midnight UTC."
            : `Free plan includes ${DAILY_LIMIT_FREE} AI Quick Adds per day. Upgrade to Pro for ${DAILY_LIMIT_PRO}.`,
          code: 'quota_exceeded',
          isPro,
        },
        429
      );
    }

    // ---- 4. Parse ----------------------------------------------------
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    const raw = apiKey ? await openAIParse(apiKey, text, today) : heuristicParse(text, today);

    if (!raw) {
      return json({ error: "Couldn't find an amount in that. Try \"Spent 15 on lunch today\"." }, 422);
    }

    // ---- 5. Validate the MODEL's output too --------------------------
    // Structured Outputs constrains the shape, not the meaning. A model
    // can still hand back a negative amount, a 1970 date, or a 2,000
    // character description — all of which would land straight in the
    // user's ledger if we just forwarded it.
    const amount = Math.abs(Number(raw.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return json({ error: "Couldn't read a sensible amount from that. Try rephrasing." }, 422);
    }

    const category = CATEGORY_IDS.includes(raw.category) ? raw.category : 'other';
    const date = isSaneDate(raw.date) && raw.date <= today ? raw.date : today;
    const description =
      (typeof raw.description === 'string' ? raw.description.trim() : '').slice(0, 60) || 'Quick entry';

    return json({
      description,
      amount: Math.round(amount * 100) / 100,
      // Derived from the category, never taken from the model.
      type: CATEGORY_TYPES[category],
      category,
      date,
      confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : null,
      // Lets the UI show "N of M left today" if you ever want it.
      usage: quota ? { used: quota.used, limit } : null,
      mocked: !apiKey,
    });
  } catch (err) {
    console.error('parse-transaction failed', err);
    return json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, 400);
  }
});