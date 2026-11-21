-- 003 — amount CHECK.
--
-- The app treats transactions as income (amount > 0) or expense (amount < 0);
-- a zero-amount transaction is not meaningful in this app (CategoryChart
-- buckets on `t.amount < 0`, selectTotals splits on `amount > 0` / `< 0`).

ALTER TABLE transactions
  ADD CONSTRAINT transactions_amount_check CHECK (amount <> 0);
