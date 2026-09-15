// supabase/functions/parse-receipt/index.ts
//
// Deploy with: supabase functions deploy parse-receipt
//
// Same shape and same defense-in-depth validation as parse-transaction
// (see that file for the fuller reasoning on why every field from the
// model gets re-checked before it leaves this function) — this one just
// takes an image instead of a sentence.

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Keep in sync with CATEGORIES in src/utils/constants.js (same list
// parse-transaction uses).
const VALID_CATEGORIES = [
  'salary', 'freelance', 'investment',
  'food', 'rent', 'transport', 'entertainment', 'shopping', 'utilities', 'health', 'other',
];

// A base64 JPEG this size is already a very generously-sized receipt
// photo (a few megapixels at reasonable JPEG quality) — anything larger
// is almost certainly an un-downscaled camera photo the client should
// have compressed first (see ReceiptScanner.jsx, which does exactly
// that). Capping here is the server-side backstop, not the primary
// control.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Not authenticated.' }, 401);

    const { imageBase64 } = await req.json();
    if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
      return jsonResponse({ error: 'No receipt photo received.' }, 400);
    }
    if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
      // base64 is ~4/3 the size of the raw bytes; 1.4x gives headroom
      return jsonResponse({ error: 'That photo is too large — try retaking it.' }, 400);
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY is not set in this project\'s Edge Function secrets.');
      return jsonResponse({ error: 'Receipt scanning is not configured yet.' }, 500);
    }

    const todayISO = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You read a photo of a receipt and extract a single expense.
If the receipt has no visible date, use today: ${todayISO}.
Valid "category" values are exactly: ${VALID_CATEGORIES.join(', ')} — receipts are virtually always an expense category, not an income one.
Respond with ONLY a JSON object, no other text, in exactly one of these two shapes:
  {"description": string, "amount": positive number, "category": one of the valid values, "date": "YYYY-MM-DD"}
  {"error": "not_a_receipt"}   — use this if the image doesn't look like a readable receipt (e.g. blurry, wrong subject, or no total visible).
"amount" should be the receipt's TOTAL (including tax/tip if shown), not a subtotal or a single line item.
"description" should be the merchant/business name as printed (e.g. "Trader Joe's"), not a generic phrase.`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Vision quality matters more here than in parse-transaction's
        // pure-text extraction — receipts have small print, varied
        // layouts, and sometimes handwriting. gpt-4o (not the -mini
        // variant) is the more capable default for that reason; check
        // OpenAI's current docs for whichever vision-capable model you
        // prefer / have access to.
        model: Deno.env.get('OPENAI_VISION_MODEL') || 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the transaction from this receipt.' },
              { type: 'image_url', image_url: { url: imageBase64, detail: 'low' } },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error('OpenAI vision request failed:', aiResponse.status, await aiResponse.text());
      return jsonResponse({ error: 'Receipt scanning is temporarily unavailable — try again shortly.' }, 502);
    }

    const aiData = await aiResponse.json();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(aiData.choices[0].message.content);
    } catch {
      console.error('Model returned non-JSON content:', aiData.choices?.[0]?.message?.content);
      return jsonResponse({ error: "Couldn't read that receipt — try a clearer photo." }, 422);
    }

    if (parsed.error === 'not_a_receipt') {
      return jsonResponse({ error: "Couldn't find a readable receipt in that photo — try again." }, 422);
    }

    const { description, amount, category, date } = parsed;
    const errors: string[] = [];
    if (typeof description !== 'string' || !description.trim()) errors.push('description');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) errors.push('amount');
    if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) errors.push('category');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date');

    if (errors.length) {
      console.error('Model returned an invalid shape, fields:', errors.join(', '), parsed);
      return jsonResponse({ error: "Couldn't read that receipt clearly — try a clearer photo." }, 422);
    }

    return jsonResponse({
      description: (description as string).trim().slice(0, 120),
      amount,
      category,
      date,
    });
  } catch (err) {
    console.error('Unexpected error in parse-receipt:', err.message);
    return jsonResponse({ error: 'Something went wrong — try again.' }, 500);
  }
});