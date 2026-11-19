import { motion } from 'framer-motion';

const VARIANTS = {
  primary: 'gilt-btn',
  secondary: 'rounded-lg bg-white/8 text-slate-100 hover:bg-white/12 border border-white/10',
  ghost: 'rounded-lg bg-transparent text-slate-300 hover:text-slate-100 hover:bg-white/5',
  danger: 'rounded-lg bg-expense-soft text-expense hover:bg-expense hover:text-white',
};

const SIZE = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5 text-sm',
};

export default function Button({ variant = 'primary', size = 'md', children, className = '', disabled = false, ...rest }) {
  const ring = 'focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors duration-200 cursor-pointer';
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.15 }}
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-medium ${VARIANTS[variant]} ${SIZE[size]} ${ring} ${disabled ? 'opacity-50 cursor-default' : ''} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
