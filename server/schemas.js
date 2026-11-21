// Zod schemas for the local Express API (v4).
import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const registerSchema = z.object({
  email: z.string().regex(emailRegex, 'Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().max(60).optional(),
});

export const loginSchema = z.object({
  email: z.string().regex(emailRegex, 'Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createTransactionSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number().refine((v) => v !== 0, 'Amount must not be zero (CHECK: transactions_amount_check)'),
  category: z.string().min(1).max(100),
  date: z.string().regex(isoDate, 'Date must be YYYY-MM-DD'),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const budgetUpsertSchema = z.object({
  category: z.string().min(1).max(100),
  monthly_limit: z.number().refine((v) => v > 0, 'Monthly limit must be > 0'),
});

export const recurringCreateSchema = z.object({
  description: z.string().min(1).max(500),
  amount: z.number(),
  category: z.string().min(1).max(100),
  frequency: z.enum(['weekly', 'monthly', 'yearly']),
  nextRunDate: z.string().regex(isoDate, 'nextRunDate must be YYYY-MM-DD'),
});

export const recurringUpdateSchema = z.object({
  nextRunDate: z.string().regex(isoDate, 'nextRunDate must be YYYY-MM-DD'),
});

export const profileUpdateSchema = z.object({
  // Whitelist: display_name and currency only (not is_pro/is_admin — those
  // live on `users` and this endpoint never writes them).
  currency: z.string().min(1).max(10).optional(),
  display_name: z.string().max(60).optional(),
});

export const proToggleSchema = z.object({
  // Local-mode dev toggle (flips users.is_pro). Deliberately not part of
  // the Supabase product surface — no equivalent there.
  enabled: z.boolean(),
});
