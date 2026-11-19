export default function Card({ children, className = '', heading, subtitle }) {
  return (
    <div className={`glass-strong rounded-2xl p-5 shadow-glass ${className}`}>
      {heading && <h3 className="text-slate-100 font-medium mb-2">{heading}</h3>}
      {subtitle && <p className="text-xs text-slate-500 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}
