import Ico from '../ui/Icons.jsx';

export default function Topbar({ title, subtitle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px', height: 60,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg2)', flexShrink: 0,
      }}
    >
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</h1>
        {subtitle && (
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>{subtitle}</p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <button
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text2)',
            }}
          >
            <Ico name="bell" size={16} />
          </button>
          <span
            style={{
              position: 'absolute', top: 7, right: 7,
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--red)', border: '2px solid var(--bg2)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '6px 12px 6px 6px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg)',
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 700, fontSize: 13,
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>Admin</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>admin@web-repuestos.cl</div>
          </div>
        </div>
      </div>
    </div>
  );
}
