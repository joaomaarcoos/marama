/* MARA UI Kit · <ConversationsScreen />
   3-pane chat workspace: list / messages / contact info. */

const SAMPLE_CONVERSATIONS = [
  {
    phone: '5598981234567', name: 'Maria Silva Santos', initials: 'MS',
    preview: 'Obrigada! Já consegui ver minhas notas no Moodle.',
    time: 'agora', status: 'ativa', tags: ['Auxiliar Adm.'], unread: 2,
  },
  {
    phone: '5598984561289', name: 'João Pedro Lima', initials: 'JL',
    preview: 'Quando começa o módulo 3?',
    time: '2m', status: 'ativa', tags: ['Eletricista Industrial'],
  },
  {
    phone: '5598987723344', name: 'Ana Costa Ribeiro', initials: 'AC',
    preview: 'Preciso do meu certificado.',
    time: '5m', status: 'pendente', tags: ['Confeitaria'],
  },
  {
    phone: '5598981299087', name: 'Carlos Henrique Dias', initials: 'CD',
    preview: 'MARA: Sua presença foi registrada. ✓',
    time: '12m', status: 'encerrada', tags: ['Soldador'],
  },
  {
    phone: '5598999990001', name: '+55 98 9 9999-0001', initials: '?',
    preview: 'Bom dia. Quero saber sobre as inscrições.',
    time: '1h', status: 'ativa', tags: [],
  },
  {
    phone: '5598922334455', name: 'Fernanda Oliveira', initials: 'FO',
    preview: 'Vou anexar o documento aqui mesmo.',
    time: '3h', status: 'ativa', tags: ['Cabeleireiro(a)'],
  },
  {
    phone: '5598911223344', name: 'Roberto Nunes', initials: 'RN',
    preview: 'Perfeito, obrigado pela ajuda.',
    time: 'Ontem', status: 'encerrada', tags: ['Pedreiro'],
  },
];

const SAMPLE_MESSAGES = [
  { role: 'user',      time: '14:00', text: 'Oi, quero saber minhas notas.' },
  { role: 'assistant', time: '14:00', text: 'Olá Maria! Sou a MARA, assistente do Maranhão Profissionalizado. Vou consultar suas notas no Moodle agora mesmo.' },
  { role: 'assistant', time: '14:01', text: 'Encontrei suas notas no curso Auxiliar Administrativo:\n\n• Módulo 1: 9.2 ✅\n• Módulo 2: 8.5 ✅\n• Módulo 3: em andamento' },
  { role: 'user',      time: '14:02', text: 'Maravilha! E o certificado, quando sai?' },
  { role: 'assistant', time: '14:02', text: 'O certificado é gerado automaticamente após você concluir todos os módulos com nota ≥ 7.0 e 75% de presença. Quer que eu verifique sua presença atual?' },
  { role: 'user',      time: '14:03', text: 'Sim, por favor.' },
  { role: 'assistant', time: '14:03', text: 'Sua presença até hoje é 88%. Está tudo certo para receber o certificado quando concluir o Módulo 3.' },
  { role: 'user',      time: '14:04', text: 'Obrigada! Já consegui ver minhas notas no Moodle.' },
];

function statusBadge(status) {
  if (status === 'ativa')     return <span className="badge badge-active"><span className="dot pulse" style={{background:'currentColor'}} />Ativa</span>;
  if (status === 'pendente')  return <span className="badge badge-recent"><Icon name="clock" />Aguardando</span>;
  if (status === 'encerrada') return <span className="badge badge-inactive"><Icon name="x" />Encerrada</span>;
  return null;
}

function ConvRow({ conv, selected, onClick }) {
  return (
    <div className={'conv-row' + (selected ? ' selected' : '')} onClick={onClick}>
      <div className="conv-avatar">{conv.initials}</div>
      <div className="conv-body">
        <div className="conv-line1">
          <span className="conv-name">{conv.name}</span>
          <span className="conv-time">{conv.time}</span>
        </div>
        <div className="conv-preview">{conv.preview}</div>
        <div className="conv-tags">
          {statusBadge(conv.status)}
          {conv.tags.map(t => <span key={t} className="badge badge-course">{t}</span>)}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const me = msg.role === 'assistant';
  return (
    <div className={'bubble-row' + (me ? ' me' : '')}>
      {!me && <div className="conv-avatar" style={{ width: 28, height: 28, fontSize: 11 }}>U</div>}
      <div>
        <div className={'bubble ' + (me ? 'from-me' : 'from-them')}>
          {msg.text.split('\n').map((l, i) => <div key={i}>{l || '\u00A0'}</div>)}
        </div>
        <div className="bubble-time" style={{ textAlign: me ? 'right' : 'left' }}>
          {me ? 'MARA · ' : ''}{msg.time}
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend }) {
  const [text, setText] = React.useState('');
  const submit = () => {
    if (!text.trim()) return;
    onSend && onSend(text.trim());
    setText('');
  };
  return (
    <div className="composer">
      <div className="composer-shell">
        <button className="ico-btn" title="Emoji"><Icon name="smile" size={16} /></button>
        <button className="ico-btn" title="Anexar"><Icon name="paperclip" size={16} /></button>
        <textarea rows={1} placeholder="Digite uma mensagem..." value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <button className="ico-btn" title="Áudio"><Icon name="mic" size={16} /></button>
        <button className="send-btn" onClick={submit} title="Enviar"><Icon name="send-horizontal" size={15} /></button>
      </div>
    </div>
  );
}

function ContactInfo({ conv }) {
  return (
    <aside className="contact-info">
      <div className="ci-avatar">{conv.initials}</div>
      <div className="ci-name">{conv.name}</div>
      <div className="ci-phone">+55 98 9 8123-4567</div>

      <div className="ci-section">
        <h4>MARA</h4>
        <div className="ci-row">
          <span className="key">Status</span>
          <span className="val" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="dot pulse" style={{ background: 'hsl(160 84% 39%)' }} />Ativa
          </span>
        </div>
        <div className="ci-row"><span className="key">Atribuída</span><span className="val">Auto · IA</span></div>
        <div className="ci-row"><span className="key">Última msg</span><span className="val mono" style={{ fontSize: 11 }}>14:04</span></div>
      </div>

      <div className="ci-section">
        <h4>Aluno</h4>
        <div className="ci-row"><span className="key">CPF</span><span className="val mono">123.456.789-00</span></div>
        <div className="ci-row"><span className="key">Curso</span><span className="val">Aux. Administrativo</span></div>
        <div className="ci-row"><span className="key">Turma</span><span className="val">2025/1 · Manhã</span></div>
        <div className="ci-row"><span className="key">Tutor</span><span className="val">Prof. Almeida</span></div>
      </div>

      <div className="ci-section">
        <h4>Ações</h4>
        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }}>
          <Icon name="pause-circle" />Pausar MARA
        </button>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
          <Icon name="user-check" />Atribuir atendente
        </button>
      </div>
    </aside>
  );
}

function ConversationsScreen() {
  const [convs, setConvs] = React.useState(SAMPLE_CONVERSATIONS);
  const [selectedPhone, setSelectedPhone] = React.useState(SAMPLE_CONVERSATIONS[0].phone);
  const [messages, setMessages] = React.useState(SAMPLE_MESSAGES);
  const [filter, setFilter] = React.useState('');
  const selected = convs.find(c => c.phone === selectedPhone) || convs[0];

  const filtered = convs.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || c.preview.toLowerCase().includes(filter.toLowerCase()));

  const sendMessage = (text) => {
    setMessages([...messages, { role: 'assistant', time: 'agora', text }]);
    setConvs(convs.map(c => c.phone === selected.phone ? { ...c, preview: 'MARA: ' + text, time: 'agora' } : c));
  };

  return (
    <>
      <div className="app-header" style={{ padding: '14px 24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem' }}>Conversas MARA</h1>
          <div className="subtitle">Atendimento automatizado · WhatsApp</div>
        </div>
        <div className="row">
          <button className="btn btn-ghost"><Icon name="filter" />Filtrar</button>
          <button className="btn btn-secondary"><Icon name="refresh-cw" />Recarregar</button>
        </div>
      </div>
      <div className="three-pane" style={{ flex: 1, minHeight: 0 }}>
        <div className="conv-list">
          <div className="conv-list-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 12, color: 'hsl(var(--fg3))', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{convs.length} conversas</span>
              <span className="mono" style={{ fontSize: 11, color: 'hsl(var(--fg3))' }}>últ. sync 14:04</span>
            </div>
            <div className="input-search conv-list-search">
              <Icon name="search" />
              <input className="input" placeholder="Buscar..." value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
          </div>
          <div className="conv-list-items">
            {filtered.map(c => (
              <ConvRow key={c.phone} conv={c} selected={c.phone === selected.phone} onClick={() => setSelectedPhone(c.phone)} />
            ))}
          </div>
        </div>

        <div className="conv-panel">
          <div className="conv-header">
            <div className="conv-header-left">
              <div className="conv-avatar">{selected.initials}</div>
              <div>
                <h3>{selected.name}</h3>
                <div className="meta">+55 98 9 8123-4567 · {selected.tags[0] || '—'}</div>
              </div>
            </div>
            <div className="conv-header-actions">
              <button className="btn btn-ghost btn-icon" title="Pausar MARA"><Icon name="pause-circle" size={16} /></button>
              <button className="btn btn-ghost btn-icon" title="Atribuir"><Icon name="user-check" size={16} /></button>
              <button className="btn btn-ghost btn-icon" title="Mais"><Icon name="more-horizontal" size={16} /></button>
            </div>
          </div>
          <div className="conv-stream">
            <div className="day-divider">Hoje · 26 de abril</div>
            {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
          </div>
          <Composer onSend={sendMessage} />
        </div>

        <ContactInfo conv={selected} />
      </div>
    </>
  );
}

Object.assign(window, { ConversationsScreen });
