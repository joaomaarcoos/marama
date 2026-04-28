/* MARA UI Kit · <DashboardScreen /> — overview metrics
   Mirrors app/(dashboard)/dashboard/page.tsx */

const DASHBOARD_CARDS = [
  { label: 'Conversas Ativas',         value: 2448,  icon: 'message-square',   accent: 'hsl(217 91% 60%)', href: '/conversas' },
  { label: 'Alunos Sincronizados',     value: 17420, icon: 'graduation-cap',   accent: 'hsl(160 84% 39%)', href: '/alunos' },
  { label: 'Campanhas de Disparo',     value: 12,    icon: 'send',             accent: 'hsl(38 92% 50%)',  href: '/disparos' },
  { label: 'Blocos de Prompt Ativos',  value: 8,     icon: 'file-text',        accent: 'hsl(262 80% 65%)', href: '/prompt' },
];

function StatCard({ card, delay, onNavigate }) {
  return (
    <a className="stat-card" style={{ '--accent': card.accent, animationDelay: `${delay}ms` }}
       href="#" onClick={(e) => { e.preventDefault(); onNavigate && onNavigate(card.href); }}>
      <div className="head">
        <div className="ico" style={{ '--accent': card.accent }}>
          <Icon name={card.icon} />
        </div>
        <span className="arrow">→</span>
      </div>
      <p className="value">{card.value.toLocaleString('pt-BR')}</p>
      <p className="label">{card.label}</p>
    </a>
  );
}

function SystemStatus() {
  return (
    <div className="card card-pad mt-4" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div className="row">
        <span style={{ position: 'relative', width: 8, height: 8 }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'hsl(160 84% 39%)', opacity: 0.5,
            animation: 'ping 1.6s cubic-bezier(0,0,0.2,1) infinite',
          }} />
          <span style={{ position: 'relative', display: 'block', width: 8, height: 8, borderRadius: '50%', background: 'hsl(160 84% 39%)' }} />
        </span>
        <span style={{ fontSize: 13, color: 'hsl(var(--fg2))' }}>MARA está ativa e recebendo mensagens</span>
      </div>
      <span className="status-chip">ONLINE</span>
    </div>
  );
}

function RecentActivity() {
  const rows = [
    { phone: '+55 98 9 8123-4567', name: 'Maria Silva Santos',   action: 'iniciou conversa',           time: 'agora',    accent: 'hsl(217 91% 60%)' },
    { phone: '+55 98 9 8456-1289', name: 'João Pedro Lima',      action: 'recebeu nota Módulo 2',      time: '2m',       accent: 'hsl(160 84% 39%)' },
    { phone: '+55 98 9 8772-3344', name: 'Ana Costa Ribeiro',    action: 'pediu certificado',          time: '5m',       accent: 'hsl(38 92% 50%)' },
    { phone: '+55 98 9 8129-9087', name: 'Carlos Henrique Dias', action: 'foi marcada como encerrada', time: '12m',      accent: 'hsl(215 18% 55%)' },
  ];
  return (
    <div className="card mt-6">
      <div style={{ padding: '14px 18px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Atividade recente</h3>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }}>Ver tudo</button>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i === rows.length - 1 ? 'none' : '1px solid hsl(var(--sidebar-border-subtle))' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: 'hsl(var(--fg1))' }}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: 'hsl(var(--fg3))' }}> · {r.action}</span>
            </div>
            <div className="mono" style={{ marginTop: 2 }}>{r.phone}</div>
          </div>
          <span className="mono" style={{ fontSize: 11 }}>{r.time}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardScreen({ onNavigate }) {
  return (
    <>
      <div className="app-header">
        <div>
          <h1>Dashboard</h1>
          <div className="subtitle">Visão geral do sistema MARA</div>
        </div>
        <div className="row">
          <span className="status-chip">ONLINE</span>
          <button className="btn btn-secondary"><Icon name="refresh-cw" />Atualizar</button>
        </div>
      </div>

      <div className="app-content animate-fade-up">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {DASHBOARD_CARDS.map((c, i) => <StatCard key={c.label} card={c} delay={i * 60} onNavigate={onNavigate} />)}
        </div>
        <SystemStatus />
        <RecentActivity />
      </div>
    </>
  );
}

Object.assign(window, { DashboardScreen });
