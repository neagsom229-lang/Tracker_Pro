// Central place for category and currency definitions.
// Adding a new category or currency only requires editing this file.
//
// `transfer: true` marks a category where money leaves your spendable
// balance but is NOT consumption — a savings contribution or a debt
// payment. These still count toward total expenses (the cash really did
// leave your account) but they're excluded from the "Spending by
// Category" breakdown and from the budget picker, because budgeting
// "$400/mo on savings" and then watching it compete with your food
// budget is exactly the kind of nonsense that makes people distrust a
// finance app.
export const CATEGORIES = [
  { id: 'salary', label: 'Salary', type: 'income', color: '#34D399' },
  { id: 'freelance', label: 'Freelance', type: 'income', color: '#5EEAD4' },
  { id: 'investment', label: 'Investment', type: 'income', color: '#A7F3D0' },
  { id: 'food', label: 'Food', type: 'expense', color: '#F87171' },
  { id: 'rent', label: 'Rent', type: 'expense', color: '#FB923C' },
  { id: 'transport', label: 'Transport', type: 'expense', color: '#FBBF24' },
  { id: 'entertainment', label: 'Entertainment', type: 'expense', color: '#C084FC' },
  { id: 'shopping', label: 'Shopping', type: 'expense', color: '#F472B6' },
  { id: 'utilities', label: 'Utilities', type: 'expense', color: '#60A5FA' },
  { id: 'health', label: 'Health', type: 'expense', color: '#4ADE80' },
  { id: 'savings', label: 'Savings', type: 'expense', color: '#E8C77A', transfer: true },
  { id: 'debt', label: 'Debt Payment', type: 'expense', color: '#9F7AEA', transfer: true },
  { id: 'other', label: 'Other', type: 'expense', color: '#94A3B8' },
];

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);

// Categories a user can set a monthly budget against.
export const BUDGETABLE_CATEGORIES = CATEGORIES.filter((c) => c.type === 'expense' && !c.transfer);

export const TRANSFER_CATEGORY_IDS = CATEGORIES.filter((c) => c.transfer).map((c) => c.id);

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar', rate: 1 },
  { code: 'EUR', symbol: '€', label: 'Euro', rate: 0.92 },
  { code: 'GBP', symbol: '£', label: 'British Pound', rate: 0.78 },
  { code: 'KHR', symbol: '៛', label: 'Cambodian Riel', rate: 4100 },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', rate: 149 },
];

export const getCurrency = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];

// Dashboard date-range filter options. `days: null` means "all time".
export const DATE_RANGES = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: null },
];