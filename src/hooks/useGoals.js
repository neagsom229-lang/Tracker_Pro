import { useMemo, useCallback } from 'react';
import { useStore, selectGoalTotals } from '../store/useStore';

/**
 * useGoals()
 * ----------
 * The read/write surface for savings goals.
 *
 * Why a hook and not just `useStore` calls in the component: the *derived*
 * values here (days remaining, required monthly pace, whether a goal is
 * behind schedule) are needed in two places already — GoalManager and the
 * dashboard summary card — and would otherwise be duplicated. Keeping
 * them here means "behind schedule" can only ever mean one thing.
 *
 * Each field is selected individually rather than pulling the whole store
 * object, so a component using this hook doesn't re-render when an
 * unrelated slice (transactions, notifications) changes.
 */

const MS_PER_DAY = 86_400_000;

function daysUntil(isoDate) {
  if (!isoDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target - today) / MS_PER_DAY);
}

export function useGoals() {
  const goals = useStore((s) => s.goals);
  const addGoalAction = useStore((s) => s.addGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const contributeToGoal = useStore((s) => s.contributeToGoal);

  const enriched = useMemo(
    () =>
      goals.map((goal) => {
        const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
        const progress = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
        const daysLeft = daysUntil(goal.deadline);
        const isComplete = goal.currentAmount >= goal.targetAmount;

        // What you'd need to set aside per month from today to land on
        // time. Null when there's no deadline or the goal is already met.
        let requiredMonthly = null;
        if (!isComplete && daysLeft !== null && daysLeft > 0) {
          requiredMonthly = remaining / Math.max(daysLeft / 30, 0.25);
        }

        return {
          ...goal,
          remaining,
          progress,
          percent: Math.min(progress * 100, 100),
          daysLeft,
          isComplete,
          isOverdue: !isComplete && daysLeft !== null && daysLeft < 0,
          requiredMonthly,
        };
      }),
    [goals]
  );

  const totals = useMemo(() => selectGoalTotals(goals), [goals]);

  // Normalises and validates before hitting the network, so the user gets
  // an instant message instead of a round trip to a CHECK constraint.
  const addGoal = useCallback(
    ({ name, targetAmount, deadline }) => {
      const cleanName = (name || '').trim();
      const amount = Number(targetAmount);
      if (!cleanName) throw new Error('Give your goal a name.');
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a target greater than zero.');
      return addGoalAction({ name: cleanName.slice(0, 60), targetAmount: amount, deadline: deadline || null });
    },
    [addGoalAction]
  );

  return { goals: enriched, totals, addGoal, removeGoal, contributeToGoal };
}