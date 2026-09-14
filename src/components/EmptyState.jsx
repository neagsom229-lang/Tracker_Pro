import { motion } from 'framer-motion';
import { PiggyBank, Plus } from 'lucide-react';
import { useStore } from '../store/useStore';

export default function EmptyState({ title = 'No transactions yet', subtitle = 'Add your first transaction to see it appear here.' }) {
  const openTransactionModal = useStore((s) => s.openTransactionModal);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-12 px-4"
    >
      <div className="w-16 h-16 rounded-2xl bg-gilt-gradient/20 border border-gilt-gold/20 flex items-center justify-center mb-4">
        <PiggyBank size={28} className="text-gilt-gold" strokeWidth={1.5} />
      </div>
      <h4 className="text-slate-200 font-medium mb-1">{title}</h4>
      <p className="text-sm text-slate-500 max-w-xs mb-5">{subtitle}</p>
      <button
        onClick={() => openTransactionModal()}
        className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
      >
        <Plus size={15} /> Add your first transaction
      </button>
    </motion.div>
  );
}
