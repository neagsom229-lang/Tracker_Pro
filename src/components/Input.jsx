export default function Input({ id, label, error, type = 'text', placeholder, value, onChange, onBlur, disabled = false, className = '', children, ...rest }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs text-slate-400">
          {label}
        </label>
      )}
      {children ? (
        children
      ) : (
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          className={`w-full bg-card border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors cursor-pointer ${className}`}
          {...rest}
        />
      )}
      {error && (
        <p className="text-xs text-expense" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
