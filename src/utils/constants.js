// Central place for category and currency definitions.
// Adding a new category or currency only requires editing this file.

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
  { id: 'other', label: 'Other', type: 'expense', color: '#94A3B8' },
];

export const getCategory = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES.at(-1);

export const CURRENCIES = [
  { code: 'USD', symbol: '$', label: 'US Dollar', rate: 1 },
  { code: 'EUR', symbol: '€', label: 'Euro', rate: 0.92 },
  { code: 'GBP', symbol: '£', label: 'British Pound', rate: 0.78 },
  { code: 'KHR', symbol: '៛', label: 'Cambodian Riel', rate: 4100 },
  { code: 'JPY', symbol: '¥', label: 'Japanese Yen', rate: 149 },
];

export const getCurrency = (code) => CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
