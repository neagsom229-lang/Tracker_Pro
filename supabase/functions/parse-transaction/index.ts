// supabase/functions/parse-transaction/index.ts

//
// Deploy: supabase functions deploy parse-transaction --no-verify-jwt
// (see the "Why --no-verify-jwt" note below -- this is the actual CORS fix)
//
// Turns "Spent $15 on lunch today" into a transaction row, inserts it,
// and returns the created row.

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------
// For local development `*` is fine. For production, replace it with an
// allow-list check against the request's Origin header, e.g.:
//
//   const ALLOWED_ORIGINS = ['https://obsidian.app', 'https://www.obsidian.app'];
//   function corsHeadersFor(origin: string | null) {
//     const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
//     return { ...corsHeaders, 'Access-Control-Allow-Origin': allow, Vary: 'Origin' };
//   }
//
// `*` cannot be combined with credentialed requests (cookies), but this
// function is called with a Bearer token in a header, not cookies, so
// `*` is safe here -- it's a stricter-than-necessary default you can
// tighten later, not a hole.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  // Lets the browser skip re-sending a preflight for 10 minutes on
  // repeat calls from the same page load -- pure optimization.
  "Access-Control-Max-Age": "600",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------
// Category table -- kept in sync by hand with src/utils/constants.js.
// Duplicated because Edge Functions run in Deno with no access to the
// Vite app's module graph.
// ---------------------------------------------------------------------
const CATEGORY_TYPES: Record<string, "income" | "expense"> = {
  salary: "income",
  freelance: "income",
  investment: "income",
  food: "expense",
  rent: "expense",
  transport: "expense",
  entertainment: "expense",
  shopping: "expense",
  utilities: "expense",
  health: "expense",
  savings: "expense",
  debt: "expense",
  other: "expense",
};
const CATEGORY_IDS = Object.keys(CATEGORY_TYPES);

const MAX_INPUT_CHARS = 200;
const MAX_AMOUNT = 10_000_000;
const DAILY_LIMIT_FREE = 15;
const DAILY_LIMIT_PRO = 300;
const ACTIVE_SUB_STATUSES = ["active", "trialing"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function isSaneDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const year = parsed.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

// ---------------------------------------------------------------------
// Fallback parser, used when OPENAI_API_KEY isn't set -- lets you test
// the whole flow, including CORS, before spending anything on OpenAI.
// ---------------------------------------------------------------------
const KEYWORD_CATEGORIES: Array<[RegExp, string]> = [
  [/\b(salary|payday|paycheck|wage|got paid|stipend)\b/i, "salary"],
  [/\b(freelance|client|invoice|gig|commission)\b/i, "freelance"],
  [/\b(dividend|interest|stock|crypto|investment|returns)\b/i, "investment"],
  [
    /\b(lunch|dinner|breakfast|coffee|cafe|restaurant|food|groceries|grocery|snack|eat|meal)\b/i,
    "food",
  ],
  [/\b(rent|landlord|lease|mortgage)\b/i, "rent"],
  [
    /\b(taxi|grab|tuk|uber|bus|train|fuel|petrol|gas|parking|moto|transport|flight)\b/i,
    "transport",
  ],
  [
    /\b(movie|cinema|game|concert|netflix|spotify|bar|party|entertainment)\b/i,
    "entertainment",
  ],
  [/\b(clothes|shoes|shirt|shopping|amazon|bought|store|mall)\b/i, "shopping"],
  [
    /\b(electricity|water bill|internet|wifi|phone bill|utility|utilities)\b/i,
    "utilities",
  ],
  [
    /\b(doctor|pharmacy|medicine|hospital|dentist|clinic|gym|health)\b/i,
    "health",
  ],
];
const INCOME_HINT =
  /\b(earned|received|got paid|salary|refund|reimbursed|income|bonus|deposit|sold)\b/i;

function heuristicParse(text: string, today: string) {
  const amountMatch = text
    .replace(/,(?=\d{3}\b)/g, "")
    .match(/(\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let category = "other";
  for (const [pattern, id] of KEYWORD_CATEGORIES) {
    if (pattern.test(text)) {
      category = id;
      break;
    }
  }
  if (category === "other" && INCOME_HINT.test(text)) category = "salary";

  let date = today;
  if (/\byesterday\b/i.test(text)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    date = d.toISOString().slice(0, 10);
  }

  const cleaned = text
    .replace(/[$€£¥៛]/g, " ")
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .replace(
      /\b(spent|paid|on|for|today|yesterday|i|a|an|the|about|around|riel|usd|dollars?)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const description = (cleaned || "Quick entry").slice(0, 60);

  return {
    description: description.charAt(0).toUpperCase() + description.slice(1),
    amount,
    category,
    date,
    confidence: 0.5,
  };
}

async function openAIParse(apiKey: string, text: string, today: string) {
  const systemPrompt = [
    "You convert one short personal-finance note into a single structured transaction.",
    `Today's date in the user's local timezone is ${today}. Resolve relative dates against that`,
    "date, and never return a date in the future.",
    "The amount is always a POSITIVE magnitude; whether it is money in or out is determined by",
    "the category, not the sign.",
    `Pick exactly one category from: ${CATEGORY_IDS.join(", ")}. Use "other" when nothing fits.`,
    "The description is a short human label (2-4 words, no amount, no date).",
    "Set confidence between 0 and 1; use a low value when the note is vague.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "transaction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "description",
              "amount",
              "category",
              "date",
              "confidence",
            ],
            properties: {
              description: { type: "string" },
              amount: { type: "number" },
              category: { type: "string", enum: CATEGORY_IDS },
              date: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    console.error("openai error", response.status, await response.text());
    throw new Error(
      "The AI service is unavailable right now. Please try again in a moment.",
    );
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content)
    throw new Error("Couldn't read that -- try rephrasing with an amount.");
  return JSON.parse(content);
}

serve(async (req) => {
  // ---- CORS preflight: THE VERY FIRST THING, before any other code
  // runs. This was already correct in the function itself -- see the
  // explanation below about why the browser could still see this fail.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // ---- 1. Who is calling? --------------------------------------
    // The gateway is deployed with verify_jwt OFF for this function
    // (see the deploy note at the top), so this getUser() call -- using
    // the caller's own forwarded token -- IS the authentication check,
    // not a redundant extra one.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated." }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Not authenticated." }, 401);

    // ---- 2. Validate input -----------------------------------------
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text)
      return json(
        { error: 'Type what you spent, e.g. "Spent $15 on lunch today".' },
        400,
      );
    if (text.length > MAX_INPUT_CHARS)
      return json(
        { error: `Keep it under ${MAX_INPUT_CHARS} characters.` },
        400,
      );

    const clientToday =
      typeof body.today === "string" && isSaneDate(body.today)
        ? body.today
        : null;
    const today = clientToday ?? new Date().toISOString().slice(0, 10);

    // ---- 3. Quota (service role -- ai_usage has no client policies) --
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isPro =
      !!subscription && ACTIVE_SUB_STATUSES.includes(subscription.status);
    const limit = isPro ? DAILY_LIMIT_PRO : DAILY_LIMIT_FREE;

    const { data: quota, error: quotaError } = await admin
      .rpc("increment_ai_usage", { p_user_id: user.id, p_limit: limit })
      .maybeSingle();

    if (quotaError) {
      console.error("quota rpc failed", quotaError.message);
      return json(
        {
          error:
            "Quick Add is temporarily unavailable. Please try again shortly.",
        },
        503,
      );
    }
    if (quota && quota.allowed === false) {
      return json(
        {
          error: isPro
            ? "You've hit today's Quick Add limit. It resets at midnight UTC."
            : `Free plan includes ${DAILY_LIMIT_FREE} AI Quick Adds per day. Upgrade to Pro for ${DAILY_LIMIT_PRO}.`,
          code: "quota_exceeded",
        },
        429,
      );
    }

    // ---- 4. Parse ----------------------------------------------------
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const raw = apiKey
      ? await openAIParse(apiKey, text, today)
      : heuristicParse(text, today);
    if (!raw)
      return json(
        {
          error:
            'Couldn\'t find an amount in that. Try "Spent 15 on lunch today".',
        },
        422,
      );

    // ---- 5. Validate the MODEL's output too --------------------------
    const amount = Math.abs(Number(raw.amount));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return json(
        { error: "Couldn't read a sensible amount from that. Try rephrasing." },
        422,
      );
    }
    const category = CATEGORY_IDS.includes(raw.category)
      ? raw.category
      : "other";
    const date = isSaneDate(raw.date) && raw.date <= today ? raw.date : today;
    const description =
      (typeof raw.description === "string" ? raw.description.trim() : "").slice(
        0,
        60,
      ) || "Quick entry";
    const signedAmount =
      CATEGORY_TYPES[category] === "income" ? amount : -amount;

    // ---- 6. Insert -----------------------------------------------------
    // Uses userClient, not admin -- RLS's "Users can insert own
    // transactions" policy (auth.uid() = user_id) is what actually
    // enforces ownership here, as a second, independent guarantee on
    // top of the getUser() check above.
    const { data: inserted, error: insertError } = await userClient
      .from("transactions")
      .insert({
        user_id: user.id,
        description,
        amount: signedAmount,
        category,
        date,
      })
      .select("id, description, amount, category, date, created_at")
      .single();

    if (insertError) {
      console.error("insert failed", insertError.message);
      return json(
        { error: "Couldn't save that transaction. Please try again." },
        500,
      );
    }

    return json({
      transaction: {
        id: inserted.id,
        description: inserted.description,
        amount: Number(inserted.amount),
        category: inserted.category,
        date: inserted.date,
        createdAt: inserted.created_at,
      },
      usage: quota ? { used: quota.used, limit } : null,
      mocked: !apiKey,
    });
  } catch (err) {
    console.error("parse-transaction failed", err);
    return json(
      { error: err instanceof Error ? err.message : "Something went wrong." },
      400,
    );
  }
});
