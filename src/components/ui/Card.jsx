export default function Card({ children, style }) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--card-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
