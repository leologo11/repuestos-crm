import { useState, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar.jsx';
import Topbar  from './components/layout/Topbar.jsx';
import Dashboard  from './views/Dashboard.jsx';
import Proveedores from './views/Proveedores.jsx';
import Clientes    from './views/Clientes.jsx';
import Ventas      from './views/Ventas.jsx';
import AILog       from './views/AILog.jsx';
import InboxCRM    from './views/InboxCRM.jsx';
import Config      from './views/Config.jsx';
import Delivery    from './views/Delivery.jsx';

const PAGE_META = {
  dashboard:   ['Dashboard',               'Hoy, 25 de Abril 2026'],
  proveedores: ['Proveedores',             'Gestiona tus proveedores de repuestos'],
  clientes:    ['Clientes',               'Historial y datos de clientes'],
  ventas:      ['Ventas / Cotizaciones',  'Seguimiento de pedidos y márgenes'],
  delivery:    ['Despachos',              'Pedidos en camino y repartidores'],
  ai:          ['Log de IA · WhatsApp',   'Conversaciones procesadas en tiempo real'],
  inbox:       ['Inbox CRM',              'Omnichannel — Clientes & Proveedores'],
  config:      ['Configuración',          'Ajustes del sistema'],
};

export default function App() {
  const [active,    setActive]    = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [dark,      setDark]      = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const [title, subtitle] = PAGE_META[active] || ['—', ''];

  const VIEW = {
    dashboard:   <Dashboard />,
    proveedores: <Proveedores />,
    clientes:    <Clientes />,
    ventas:      <Ventas />,
    delivery:    <Delivery />,
    ai:          <AILog />,
    inbox:       <InboxCRM />,
    config:      <Config />,
  };

  return (
    <>
      <Sidebar
        active={active} setActive={setActive}
        collapsed={collapsed} setCollapsed={setCollapsed}
        dark={dark} setDark={setDark}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar title={title} subtitle={subtitle} />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {VIEW[active]}
        </div>
      </div>
    </>
  );
}
