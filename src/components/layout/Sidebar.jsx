import Ico from '../ui/Icons.jsx';

const NAV = [
  { id: 'dashboard',   label: 'Dashboard',            icon: 'dashboard'  },
  { id: 'proveedores', label: 'Proveedores',           icon: 'suppliers'  },
  { id: 'clientes',    label: 'Clientes',              icon: 'clients'    },
  { id: 'ventas',      label: 'Ventas / Cotizaciones', icon: 'sales'      },
  { id: 'delivery',    label: 'Despachos',             icon: 'delivery'   },
  { id: 'ai',          label: 'Log de IA',             icon: 'ai'         },
  { id: 'inbox',       label: 'Inbox CRM',             icon: 'inbox'      },
  { id: 'config',      label: 'Configuración',         icon: 'settings'   },
];

export default function Sidebar({ active, setActive, collapsed, setCollapsed, dark, setDark }) {
  return (
    <aside
      style={{
        width: collapsed ? 60 : 240,
        minWidth: collapsed ? 60 : 240,
        background: 'var(--sidebar-bg)',
        display: 'flex', flexDirection: 'column',
        transition: 'width .2s ease, min-width .2s ease',
        overflow: 'hidden', position: 'relative', zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: '1px solid oklch(24% 0.03 255)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
          </svg>
        </div>
        {!collapsed && (
          <span style={{ color: 'white', fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}>
            Web-Repuestos
          </span>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => setActive(n.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '10px 0' : '9px 12px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: active === n.id ? 'oklch(22% 0.04 255)' : 'transparent',
              color: active === n.id ? 'white' : 'var(--sidebar-text)',
              fontFamily: 'inherit', fontSize: 13.5,
              fontWeight: active === n.id ? 600 : 400,
              transition: 'background .15s', position: 'relative',
            }}
            onMouseEnter={(e) => { if (active !== n.id) e.currentTarget.style.background = 'var(--sidebar-hover)'; }}
            onMouseLeave={(e) => { if (active !== n.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <Ico name={n.icon} size={17} style={{ flexShrink: 0, color: active === n.id ? 'var(--accent)' : 'inherit' }} />
            {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{n.label}</span>}
            {active === n.id && (
              <span style={{
                position: 'absolute', right: 0, top: '25%', height: '50%',
                width: 3, background: 'var(--accent)', borderRadius: '3px 0 0 3px',
              }} />
            )}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{
        padding: '12px 8px', borderTop: '1px solid oklch(22% 0.03 255)',
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {[
          { icon: dark ? 'sun' : 'moon', label: dark ? 'Modo claro' : 'Modo oscuro', action: () => setDark((d) => !d) },
          { icon: collapsed ? 'chevronRight' : 'chevronLeft', label: 'Colapsar', action: () => setCollapsed((c) => !c) },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '9px 0' : '9px 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--sidebar-text)',
              fontFamily: 'inherit', fontSize: 13,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sidebar-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Ico name={icon} size={16} />
            {!collapsed && <span>{label}</span>}
          </button>
        ))}
      </div>
    </aside>
  );
}
