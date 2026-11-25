import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('../lib/dataProvider', () => ({ dataProvider: { addTransaction: vi.fn() } }));

import toast from 'react-hot-toast';
import { dataProvider } from '../lib/dataProvider';
import { useStore, selectSpendingThisMonth } from './useStore';

describe('transaction guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ session: { id: 'user-1' }, transactions: [] });
  });

  it('selectSpendingThisMonth does not throw for a row without date', () => {
    expect(() => selectSpendingThisMonth([{ id: '1', amount: -10, category: 'Food' }])).not.toThrow();
  });

  it('addTransaction with no description/date leaves state empty, never calls dataProvider.addTransaction, and calls toast.error', async () => {
    await useStore.getState().addTransaction({ amount: -10, category: 'Food' });
    expect(useStore.getState().transactions).toEqual([]);
    expect(dataProvider.addTransaction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });
});
