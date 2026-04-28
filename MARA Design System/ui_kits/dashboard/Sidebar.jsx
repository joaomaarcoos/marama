/* MARA UI Kit · <Sidebar />
   Mirrors components/sidebar.tsx — primary navigation IA. */

const NAV_SECTIONS = [
  { title: 'Visão Geral', items: [
    { href: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  ] },
  { title: 'Atendimento', items: [
    { href: '/conversas', label: 'Conversas MARA', sublabel: 'chatbot automático', icon: 'message-square' },
    { href: '/conversacoordenacao', label: 'Coord. WhatsApp', sublabel: 'respostas manuais', icon: 'messages-square' },
  ] },
  { title: 'Conteúdo', items: [
    { href: '/prompt',     label: 'Prompt da MARA',       icon: 'file-text' },
    { href: '/documentos', label: 'Base de Conhecimento', icon: 'book-open' },
    { href: '/disparos',   label: 'Disparos',             icon: 'send' },
  ] },
  { title: 'Equipe & Alunos', items: [
    { href: '/contatos', label: 'Contatos',              icon: 'user' },
    { href: '/alunos',   label: 'Alunos',                icon: 'graduation-cap' },
    { href: '/tutores',  label: 'Tutores / Professores', icon: 'graduation-cap' },
    { href: '/usuarios', label: 'Usuários',              icon: 'shield-check' },
  ] },
  { title: 'Sistema', items: [
    { href: '/relatorios',    label: 'Relatórios',       icon: 'bar-chart-2' },
    { href: '/suporte',       label: 'Suporte',          icon: 'ticket-check' },
    { href: '/logs',          label: 'Logs Evolution',   icon: 'scroll-text' },
    { href: '/conexao',       label: 'Conexão WhatsApp', icon: 'smartphone' },
    { href: '/configuracoes', label: 'Configurações',    icon: 'settings' },
  ] },
];

function MARAOrbCanvas({ size = 32 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.drawMARAOrb) {
      window.drawMARAOrb(ref.current, { size, isStatic: true });
    }
  }, [size]);
  return <canvas ref={ref} />;
}

function Icon({ name, size = 14 }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = '';
      const i = document.createElement('i');
      i.setAttribute('data-lucide', name);
      ref.current.appendChild(i);
      window.lucide && window.lucide.createIcons({ attrs: { width: size, height: size } });
    }
  }, [name, size]);
  return <span ref={ref} style={{ display: 'inline-flex', width: size, height: size }} />;
}

function Sidebar({ activePath, onNavigate, theme = 'dark', onToggleTheme }) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <aside className="sidebar" style={{ width: collapsed ? 56 : 224 }}>
      <div className="sidebar-brand">
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <MARAOrbCanvas size={36} />
            <div>
              <div className="b-name">MARA</div>
              <div className="b-sub">MARANHÃO PROF.</div>
            </div>
          </div>
        )}
        {collapsed && <div style={{margin:'0 auto'}}><MARAOrbCanvas size={30} /></div>}
        <button className="collapse-btn" onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
          <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} style={{ marginBottom: 12 }}>
            {!collapsed && <div className="sidebar-section">{section.title}</div>}
            {collapsed && si > 0 && <div style={{ borderTop: '1px solid hsl(var(--sidebar-border-subtle))', margin: '6px 8px' }} />}
            {section.items.map(item => {
              const isActive = activePath === item.href;
              return (
                <a key={item.href} href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(item.href); }}
                  className={'sidebar-item' + (isActive ? ' active' : '')}
                  title={collapsed ? item.label : undefined}
                  style={collapsed ? { justifyContent: 'center', padding: '6px 0' } : undefined}>
                  <Icon name={item.icon} />
                  {!collapsed && (
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block' }}>{item.label}</span>
                      {item.sublabel && <span className="item-sub">{item.sublabel}</span>}
                    </div>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={onToggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo noturno'}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          {!collapsed && <span>{theme === 'dark' ? 'Modo claro' : 'Modo noturno'}</span>}
        </button>
        <button>
          <Icon name="log-out" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar, Icon, MARAOrbCanvas });
