export default function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'oklch(0% 0 0 / 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg2)', borderRadius: 12, padding: 28,
          width: 440, boxShadow: '0 20px 60px oklch(0% 0 0 / 0.25)',
          border: '1px solid var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
