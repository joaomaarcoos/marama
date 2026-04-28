/* MARA UI Kit · <AlunosScreen /> + <DocumentosScreen />
   Mirrors Alunos table + Base de Conhecimento (RAG documents). */

const SAMPLE_STUDENTS = [
  { name: 'Maria Silva Santos',     cpf: '123.456.789-00', phone: '+55 98 9 8123-4567', course: 'Auxiliar Administrativo',  group: '2025/1 · Manhã',  role: 'aluno',  active: true,  synced: '12m' },
  { name: 'João Pedro Lima',        cpf: '987.654.321-00', phone: '+55 98 9 8456-1289', course: 'Eletricista Industrial',   group: '2025/1 · Tarde',  role: 'aluno',  active: true,  synced: '12m' },
  { name: 'Ana Costa Ribeiro',      cpf: '456.789.123-00', phone: '+55 98 9 8772-3344', course: 'Confeitaria',              group: '2025/1 · Noite', role: 'aluno',  active: true,  synced: '12m' },
  { name: 'Carlos Henrique Dias',   cpf: '321.654.987-00', phone: '+55 98 9 8129-9087', course: 'Soldador',                 group: '2024/2 · Manhã',  role: 'aluno',  active: false, synced: '1h' },
  { name: 'Fernanda Oliveira',      cpf: '789.123.456-00', phone: '+55 98 9 8223-3445', course: 'Cabeleireiro(a)',          group: '2025/1 · Tarde',  role: 'aluno',  active: true,  synced: '12m' },
  { name: 'Roberto Nunes',          cpf: '654.987.321-00', phone: '+55 98 9 8112-2334', course: 'Pedreiro',                 group: '2024/2 · Noite', role: 'gestor', active: true,  synced: '12m' },
  { name: 'Patrícia Mendes Souza',  cpf: '147.258.369-00', phone: '+55 98 9 8556-6677', course: 'Auxiliar Administrativo',  group: '2025/1 · Manhã',  role: 'aluno',  active: true,  synced: '12m' },
  { name: 'Lucas Oliveira Pinto',   cpf: '258.369.147-00', phone: '+55 98 9 8771-1223', course: 'Mecânico de Automóveis',   group: '2025/1 · Tarde',  role: 'aluno',  active: true,  synced: '12m' },
];

function AlunosScreen() {
  const [search, setSearch] = React.useState('');
  const [course, setCourse] = React.useState('Todos os cursos');
  const filtered = SAMPLE_STUDENTS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) &&
    (course === 'Todos os cursos' || s.course === course)
  );
  const courses = ['Todos os cursos', ...Array.from(new Set(SAMPLE_STUDENTS.map(s => s.course)))];

  return (
    <>
      <div className="app-header">
        <div>
          <h1>Alunos</h1>
          <div className="subtitle">{SAMPLE_STUDENTS.length} alunos sincronizados · última sync há 12m</div>
        </div>
        <div className="row">
          <button className="btn btn-ghost"><Icon name="download" />Exportar CSV</button>
          <button className="btn btn-blue"><Icon name="refresh-cw" />Sincronizar Moodle</button>
        </div>
      </div>

      <div className="app-content animate-fade-up">
        <div className="card card-pad" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--fg2))', display: 'block', marginBottom: 6 }}>Buscar</label>
            <div className="input-search">
              <Icon name="search" />
              <input className="input" placeholder="Nome, CPF, telefone..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div style={{ width: 240 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--fg2))', display: 'block', marginBottom: 6 }}>Curso</label>
            <select className="input" value={course} onChange={e => setCourse(e.target.value)}>
              {courses.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ width: 160 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'hsl(var(--fg2))', display: 'block', marginBottom: 6 }}>Tipo</label>
            <select className="input"><option>Todos</option><option>Aluno</option><option>Gestor</option></select>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Aluno</th><th>CPF</th><th>Telefone</th><th>Curso</th><th>Turma</th><th>Tipo</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.cpf}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div className="conv-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{s.name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'hsl(var(--fg3))' }}>sync há {s.synced}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{s.cpf}</td>
                  <td className="mono">{s.phone}</td>
                  <td>{s.course}</td>
                  <td>{s.group}</td>
                  <td>
                    <span className="badge" style={{
                      background: s.role === 'gestor' ? 'hsl(217 91% 60% / 0.18)' : 'hsl(160 84% 39% / 0.18)',
                      color: s.role === 'gestor' ? 'hsl(217 91% 75%)' : 'hsl(160 70% 65%)'
                    }}>{s.role}</span>
                  </td>
                  <td>
                    {s.active
                      ? <span className="badge badge-active"><span className="dot pulse" style={{ background: 'currentColor' }} />Ativo</span>
                      : <span className="badge badge-inactive">Inativo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid hsl(var(--border))', fontSize: 12, color: 'hsl(var(--fg3))' }}>
            <span>Mostrando {filtered.length} de {SAMPLE_STUDENTS.length}</span>
            <div className="row">
              <button className="btn btn-ghost" style={{ padding: '4px 10px' }}><Icon name="chevron-left" size={14} />Anterior</button>
              <span className="mono">1 / 35</span>
              <button className="btn btn-ghost" style={{ padding: '4px 10px' }}>Próximo<Icon name="chevron-right" size={14} /></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const SAMPLE_DOCS = [
  { title: 'Edital 2025/1 — Maranhão Profissionalizado.pdf', size: '1.2 MB', chunks: 47, indexed: '2 dias atrás', status: 'indexado' },
  { title: 'Manual do Aluno · Versão 3.pdf',                  size: '892 KB', chunks: 28, indexed: '5 dias atrás', status: 'indexado' },
  { title: 'FAQ Certificados e Diplomas.docx',                size: '54 KB',  chunks: 8,  indexed: '1 semana',     status: 'indexado' },
  { title: 'Calendário Letivo 2025.xlsx',                     size: '32 KB',  chunks: 4,  indexed: '12m atrás',    status: 'indexando' },
  { title: 'Lista de Cursos por Polo.pdf',                    size: '410 KB', chunks: 19, indexed: '2 semanas',    status: 'indexado' },
  { title: 'Procedimentos · Trancamento de Matrícula.pdf',    size: '128 KB', chunks: 6,  indexed: '3 dias atrás', status: 'indexado' },
];

function DocumentosScreen() {
  return (
    <>
      <div className="app-header">
        <div>
          <h1>Base de Conhecimento</h1>
          <div className="subtitle">Documentos indexados para consulta da MARA · 86 docs · 3.412 chunks</div>
        </div>
        <button className="btn btn-primary"><Icon name="upload" />Adicionar documento</button>
      </div>

      <div className="app-content animate-fade-up">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div className="stat-card" style={{ '--accent': 'hsl(262 80% 65%)', cursor: 'default' }}>
            <div className="head">
              <div className="ico" style={{ '--accent': 'hsl(262 80% 65%)' }}><Icon name="book-open" /></div>
            </div>
            <p className="value">86</p>
            <p className="label">Documentos</p>
          </div>
          <div className="stat-card" style={{ '--accent': 'hsl(217 91% 60%)', cursor: 'default' }}>
            <div className="head">
              <div className="ico" style={{ '--accent': 'hsl(217 91% 60%)' }}><Icon name="layers" /></div>
            </div>
            <p className="value">3.412</p>
            <p className="label">Chunks indexados</p>
          </div>
          <div className="stat-card" style={{ '--accent': 'hsl(160 84% 39%)', cursor: 'default' }}>
            <div className="head">
              <div className="ico" style={{ '--accent': 'hsl(160 84% 39%)' }}><Icon name="check-circle-2" /></div>
            </div>
            <p className="value">98%</p>
            <p className="label">Hit rate (RAG)</p>
          </div>
        </div>

        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid hsl(var(--border))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Documentos</h3>
            <div className="input-search" style={{ width: 240 }}>
              <Icon name="search" />
              <input className="input" placeholder="Buscar documentos..." />
            </div>
          </div>
          {SAMPLE_DOCS.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderBottom: i === SAMPLE_DOCS.length - 1 ? 'none' : '1px solid hsl(var(--sidebar-border-subtle))' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'hsl(262 80% 65% / 0.12)', color: 'hsl(262 80% 65%)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="file-text" size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</div>
                <div style={{ fontSize: 11, color: 'hsl(var(--fg3))', marginTop: 2 }}>{d.size} · {d.chunks} chunks · indexado {d.indexed}</div>
              </div>
              {d.status === 'indexado'
                ? <span className="badge badge-active"><Icon name="check" />Indexado</span>
                : <span className="badge badge-recent"><Icon name="loader" />Indexando</span>}
              <button className="btn btn-ghost btn-icon" title="Mais"><Icon name="more-horizontal" size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

Object.assign(window, { AlunosScreen, DocumentosScreen });
