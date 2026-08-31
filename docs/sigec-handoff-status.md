# SIGEC Processos — Handoff, status e plano de execução

**Última atualização:** 31/08/2026
**Estado geral:** fundação, Gate P1, configuração administrativa da Fase 2, Fase 3 e implementação da Fase 4 concluídos; Gate P4 ainda precisa da bateria final de concorrência/idempotência; cadastro público permanece fechado até existir processo real pronto para publicação
**Fase atual:** `SIGEC-P4-07` concluída na branch `codex/sigec-p4-07-prazo-diligencia`; Gate P2 permanece adiado pelas confirmações normativas e pela importação oficial
**Progresso auditado:** 40 de 88 tarefas concluídas; 48 pendentes
**Última auditoria automática:** aprovada em 31/08/2026, sem achados locais ou remotos acionáveis
**Próxima revisão obrigatória:** após cada tarefa marcada como concluída ou sempre que surgir retificação do edital

## 1. Objetivo deste arquivo

Este é o registro operacional único do SIGEC Processos. Ele reúne regras confirmadas, decisões pendentes, estado real do código, plano priorizado, critérios de aceite e gates de segurança. Deve ser atualizado no mesmo conjunto de mudanças que concluir qualquer tarefa SIGEC.

Fontes funcionais, em ordem de precedência:

- `SIGDOC.docx`, fonte principal do SIGEC para vagas, documentos, fluxo e regras do processo.
- Decisões do responsável pelo produto registradas nesta conversa.
- `EDITAL Nº 01/2026 — SEDUC`, arquivo `C:\Users\joaom\Downloads\EDITAL-No-01_2026-PROCESSO-SELETIVO-EPT (1).docx`, documento mais antigo e usado somente como referência histórica.

**Observação pendente:** as regras extraídas do edital antigo nas seções 3 e 4 não devem ser implementadas como regra definitiva. Desempates, classificação, ordenação, inscrição única e cotas aguardam reconfirmação. A lógica da rubrica complementar de 30 pontos e o fluxo de aprovação de pendências foram compreendidos e aceitos como direção de produto, mas sua finalização foi adiada pelo responsável. Até esse fechamento, o SIGEC deve mantê-los configuráveis e não publicar classificação automática.

Regra de precedência atual: SIGDOC prevalece; o edital antigo serve para apontar perguntas e riscos, não para substituir o SIGDOC.

## 2. Resumo executivo

### Já concluído e verificado localmente

- [x] SIGEC-FND-01 — Separar os papéis `admin`, `gerente`, `atendente`, `candidato` e `sem_acesso`.
- [x] SIGEC-FND-02 — Bloquear candidato em telas/APIs internas e bloquear equipe em APIs exclusivas do candidato.
- [x] SIGEC-FND-03 — Criar redirecionamento de login por papel e falha fechada para papel desconhecido.
- [x] SIGEC-FND-04 — Criar migração local com 27 tabelas SIGEC, RLS e bucket privado de documentos.
- [x] SIGEC-FND-05 — Criar validações-base de CPF, WhatsApp, documentos e preferências.
- [x] SIGEC-FND-06 — Criar páginas-base pública, administrativa e do candidato.
- [x] SIGEC-FND-07 — Proteger os webhooks da Evolution API com segredo obrigatório.
- [x] SIGEC-FND-08 — Criar e executar auditorias estáticas de banco e aplicação.

### Ainda não operacional

- A fundação está aplicada no Supabase configurado desde 27/08/2026, mas ainda não há processo real configurado ou publicado.
- O cadastro, a confirmação de e-mail, a recuperação de senha, o rate limit persistente e a verificação protegida do WhatsApp estão implementados e tiveram seus testes externos aprovados. A chave `SIGEC_CANDIDATE_REGISTRATION_ENABLED` permanece desativada por decisão de lançamento até existir um processo real validado e publicado.
- **Incidente operacional encerrado (28/08/2026):** login e recuperação carregam o Turnstile no domínio oficial; o Supabase aceita o token e a recuperação retorna a resposta genérica anti-enumeração. O CAPTCHA permanece habilitado.
- As páginas são estruturas iniciais; não existe ainda fluxo completo de perfil, inscrição, análise, pontuação, classificação, recurso, convocação ou WhatsApp transacional.
- As Fases 0 e 1 estão consolidadas em `master`; a branch `codex/sigec-fase-1-cadastro-auth` preserva o histórico da fase concluída.

## 3. Regras extraídas do Edital Nº 01/2026

### 3.1 Pontuação expressamente definida

**Pós-graduação — máximo de 30 pontos, não cumulativo:**

- Doutorado: 30 pontos.
- Mestrado: 25 pontos.
- Especialização: 20 pontos.
- Deve valer somente o título de maior pontuação.

**Experiência profissional docente — máximo de 40 pontos:**

- Sem experiência: 0 ponto.
- 1 a 12 meses: 5 pontos.
- 13 a 24 meses: 10 pontos.
- 25 a 36 meses: 20 pontos.
- 37 a 48 meses: 30 pontos.
- 49 a 60 meses: 40 pontos.
- O edital não atribui pontuação adicional acima de 60 meses.

**Inconsistência documental:** o Anexo IV declara total máximo de 100 pontos, mas apresenta critérios que somam no máximo 70. A rubrica dos 30 pontos restantes não aparece na página nem em outra parte pesquisável do arquivo. O critério “produção acadêmica” aparece somente como terceiro desempate, sem forma de comprovação ou pontuação.

### 3.2 Fórmula e ordenação confirmadas

- A nota final corresponde ao total de pontos obtidos na avaliação curricular.
- A lista preliminar e a final devem ser ordenadas por nota final decrescente.
- O resultado final deve refletir eventuais mudanças de situação, pontuação ou ordem decorrentes de recurso deferido.
- A convocação deve respeitar rigorosamente a ordem de classificação, condicionada à necessidade, oportunidade, orçamento e prazo de validade do certame.

Fórmula implementável apenas parcialmente:

```text
nota_final = maior_pontuacao_de_pos_graduacao + pontuacao_de_experiencia + criterio_oficial_ainda_ausente
```

No SIGEC, configurar o total máximo de 100 com a rubrica de produto aprovada na seção 4.1. A classificação automática continua bloqueada até confirmar a transição `habilitado → classificado`, a ordem dos desempates e as demais regras de ranqueamento.

### 3.3 Desempate — ordem obrigatória

Em igualdade de pontuação e habilitação, aplicar sequencialmente:

1. maior nota na titulação;
2. maior nota na experiência profissional;
3. maior nota na produção acadêmica;
4. equivalência de licenciatura, formação ou complementação pedagógica concluída;
5. ter 60 anos de idade no ato da inscrição;
6. maior idade.

O motor deve persistir os valores usados no desempate e produzir uma explicação auditável da posição final.

### 3.4 Habilitação, classificação e desclassificação

- A avaliação curricular ocorre em etapa única, de natureza classificatória e eliminatória.
- O edital condiciona a classificação ao cumprimento das exigências obrigatórias de inscrição e à documentação exigida.
- Não foi localizada nota mínima, quantidade máxima de classificados nem uma fórmula explícita de conversão de “habilitado” em “classificado”. A leitura mais direta é: candidato que cumpre os requisitos e não é desclassificado integra o cadastro de reserva, ordenado pela nota. Isso precisa de validação oficial antes de automatizar.
- O resultado preliminar publica somente classificados; o candidato desclassificado consulta privadamente o motivo na plataforma.
- Ausência, falsidade, ilegibilidade, corrupção ou formato incorreto de documento pode causar desclassificação.

### 3.5 Recursos

- Prazo: 24 horas a partir de 00h00 do dia seguinte à publicação do resultado preliminar.
- Objeto: desclassificação, ordem de classificação ou pontuação do próprio candidato.
- Não podem ser anexados, alterados ou substituídos documentos na fase de recurso.
- Não há revisão da decisão do recurso.
- O resultado da avaliação deve ser comunicado ao interessado por e-mail.

Solicitações administrativas de esclarecimento devem ser modeladas separadamente do recurso e nunca servir para burlar a proibição de novos documentos na fase recursal.

### 3.6 Escopo da lista, cotas e convocação

- A inscrição identifica município, curso técnico e modalidade de oferta.
- O edital permite apenas uma inscrição por candidato; se houver mais de uma, vale a última dentro do prazo.
- PCD: 5% das vagas; primeiro classificado PCD na 5ª vaga aberta, depois 21ª, 41ª, 61ª e assim sucessivamente.
- PPP: 20% das vagas de cada especialidade.
- Candidato PCD deve constar na lista específica e na lista geral quando aprovado/classificado.
- Insuficiência de candidatos da reserva reverte vagas para ampla concorrência, respeitando a lista geral.
- Elegibilidade simultânea PCD/PPP exige opção; sem manifestação, o edital determina a vaga PPP.
- Desistência, ausência no prazo ou reprovação documental na convocação chama o candidato subsequente.
- A Comissão pode designar profissional habilitado de área afim quando não houver preenchimento da área técnica específica.

## 4. Decisões normativas pendentes

- [ ] SIGEC-DEC-01 — Finalizar e homologar a rubrica complementar de 30 pontos. A lógica da seção 4.1 foi aceita como direção de produto, mas o responsável decidiu deixar o fechamento para depois; a ausência da rubrica no SIGDOC permanece registrada como divergência documental.
- [ ] SIGEC-DEC-02 — Finalizar a confirmação de “produção acadêmica e desenvolvimento profissional” como grupo complementar e de seu eventual uso no desempate. A proposta foi aceita como direção, mas permanece em observação até o fechamento solicitado.
- [ ] SIGEC-DEC-03 — Confirmar formalmente se todo candidato elegível e não desclassificado será classificado no cadastro de reserva ou se haverá nota/corte mínimo. **Bloqueia transição automática `habilitado → classificado`.**
- [ ] SIGEC-DEC-04 — Resolver conflito entre o edital, que permite uma inscrição com uma opção de município/curso/modalidade, e a decisão de produto de até cinco preferências. Definir por processo: `uma_opcao` ou `ate_cinco_preferencias`. **Bloqueia publicação do formulário deste edital.**
- [ ] SIGEC-DEC-05 — Confirmar a chave exata de ranqueamento: processo + modalidade + município + curso/especialidade + tipo de concorrência. **Bloqueia geração da lista oficial.**
- [ ] SIGEC-DEC-06 — Definir a sequência operacional das vagas PPP dentro da lista e validar a combinação com a sequência PCD e ampla concorrência. **Bloqueia convocação automática por cotas.**

As decisões devem registrar fonte, responsável, data, versão do edital e impacto. Não remover o histórico quando uma decisão for substituída por retificação.

### 4.1 Rubrica de produto aceita como direção — 30 pontos

Esta rubrica foi aceita pelo responsável do produto como a lógica a ser usada para completar os 100 pontos, mas sua finalização foi adiada. Ela não foi extraída do SIGDOC nem do edital antigo; essa divergência de origem deve permanecer visível no histórico da versão da regra. Até o fechamento, pode sustentar configuração e testes internos, mas não a classificação automática publicada.

| Critério | Pontos por item | Limite |
|---|---:|---:|
| Artigo científico relacionado à vaga, com ISSN ou DOI | 5 | 10 |
| Livro ou capítulo relacionado à área, com ISBN | 5 | 5 |
| Produção técnica ou material didático comprovado | 3 | 6 |
| Apresentação de trabalho em evento científico | 2 | 4 |
| Formação continuada relacionada à vaga | 1 ponto a cada 20 horas | 5 |
| **Total de produção acadêmica e desenvolvimento profissional** |  | **30** |

Regras de cálculo e auditoria:

- somente comprovantes validados geram pontos;
- pendência documental impede a conclusão da análise e documento rejeitado vale zero;
- um comprovante não pode pontuar em mais de um critério;
- cursos usados como requisito obrigatório não pontuam novamente;
- cada categoria respeita seu próprio teto e o total do grupo é limitado a 30 pontos;
- a pertinência com a vaga deve ser confirmada pelo avaliador;
- cada lançamento preserva comprovante, avaliador, data, regra aplicada, pontos e justificativa;
- alterações manuais preservam valor anterior, novo valor e autoria;
- o período de validade sugerido é de cinco anos, ainda pendente de confirmação;
- o valor do grupo somente será usado como terceiro desempate após a confirmação da ordem oficial dos desempates.

Fórmula aceita como direção e pendente de fechamento: `nota_final = titulacao (máx. 30) + experiencia (máx. 40) + producao_e_desenvolvimento (máx. 30)`. Nota máxima pretendida: 100 pontos.

### 4.2 Regra compreendida para pendências e avanço de etapa — finalizar depois

- Uma pendência aberta e marcada como bloqueante impede a transição da candidatura para a etapa seguinte.
- O candidato pode corrigir ou complementar o que foi solicitado, mas não aprova a própria pendência.
- Administrador ou gerente responsável pela análise pode aprovar a correção e marcar a pendência como resolvida.
- Depois que todas as pendências bloqueantes da etapa estiverem aprovadas ou resolvidas, a candidatura fica liberada para a próxima etapa.
- Pendência rejeitada ou devolvida para nova correção continua bloqueando o avanço.
- Toda decisão deve preservar candidatura, pendência, documento ou campo relacionado, situação anterior e nova, analista, data/hora e justificativa.
- Exceção administrativa deve exigir permissão específica e justificativa, sem apagar nem contornar o histórico da pendência.

## 5. Plano priorizado de execução

### Fase 0 — Consolidar e proteger a fundação

- [x] SIGEC-P0-01 — Separar as alterações SIGEC das mudanças não relacionadas e revisar o diff antes de commit. Concluído em 27/08/2026: pacote funcional e de segurança identificado; temporários, caches, credenciais e `modelo_tarefas_exemplo.csv` excluídos do commit da fase.
- [x] SIGEC-P0-02 — Confirmar o projeto Supabase de homologação e documentar o `project_ref`, sem registrar segredos. Projeto do `.env`: `hvvgyiafelqylbzkzjbi`, confirmado em 20/08/2026.
- [x] SIGEC-P0-03 — Aplicar a migração em homologação, executar Advisors e corrigir alertas. Fundação e três correções complementares aplicadas em 27/08/2026; 27 tabelas, 27 com RLS, bucket privado, nenhum índice FK ausente, nenhuma migração pendente e zero achados SIGEC acionáveis nos Advisors.
- [x] SIGEC-P0-04 — Testar RLS com candidato A, candidato B, gerente, atendente, conta sem papel e usuário anônimo. Teste remoto com usuários sintéticos aprovado em 27/08/2026.
- [x] SIGEC-P0-05 — Testar Storage com caminho legítimo e forjado, antes/depois do prazo e com diligência aberta. Teste remoto aprovado, incluindo imutabilidade e isolamento de leitura; fixtures removidas e contagens confirmadas em zero.
- [x] SIGEC-P0-06 — Criar migração complementar para decisões, cotas, snapshots de classificação e explicação do desempate. Concluído em 27/08/2026 com registros versionados e append-only, congelamento imutável, explicação ordenada do desempate, bloqueio por decisão/regra de cota desatualizada e duas aprovações independentes antes da publicação.

**Gate P0:** aprovado em 27/08/2026 para a fundação técnica. Nenhuma rota de cadastro deve ser publicada antes dos gates de autenticação e abuso da Fase 1.

### Fase 1 — Cadastro e autenticação do candidato

- [x] SIGEC-P1-01 — Implementar cadastro com e-mail, senha forte e papel `candidato` atribuído somente pelo backend. Concluído em 27/08/2026 com validação duplicada em aplicação/banco, atribuição pós-inserção em `app_metadata`, perfil atômico, resposta anti-enumeração e liberação controlada por feature flag fechada.
- [x] SIGEC-P1-02 — Implementar confirmação de e-mail, recuperação de senha e revogação de sessões quando necessário. Concluído em 27/08/2026 com callback PKCE, allowlist de redirecionamento, recuperação anti-enumeração, política de senha compartilhada e logout global após alteração.
- [x] SIGEC-P1-03 — Implementar CAPTCHA e rate limit por IP, e-mail e telefone. Concluído em 28/08/2026 com Turnstile no cadastro, login e recuperação; token enviado ao Supabase Auth; buckets atômicos com identificadores em HMAC e nonce server-only contra bypass direto; URL de redirecionamento server-only validada. O smoke oficial confirmou login protegido e recuperação com resposta genérica anti-enumeração no domínio `mara.joaodantasia.com.br`.
- [x] SIGEC-P1-04 — Implementar verificação do WhatsApp com código expirável, limite de tentativas e armazenamento protegido. Concluído em 28/08/2026 com OTP de seis dígitos em HMAC, expiração de 10 minutos, cinco tentativas, invalidação de códigos anteriores, rate limit por IP/usuário/telefone, vínculo ao próprio candidato, reset ao mudar o número e envio pela Evolution. Nove cenários remotos e entrega real para número autorizado foram aprovados; o perfil foi marcado atomicamente e toda a fixture foi removida apó a confirmação.
- [x] SIGEC-P1-05 — Registrar aceite versionado do edital, veracidade, requisitos e LGPD. Concluído em 27/08/2026 com pacote atômico e idempotente vinculado à candidatura, versões derivadas no servidor, evidências de IP/user-agent em HMAC, bloqueio de inserção direta e preservação dos aceites anteriores após retificação.
- [x] SIGEC-P1-06 — Testar enumeração de contas, força bruta, replay de código e redirecionamentos por papel. Concluído em 27/08/2026 com respostas anti-enumeração auditadas, rate limit atômico, nonce de uso único, rejeição explícita de replay do OTP e 10 cenários HTTP cobrindo candidato, admin, gerente, atendente, conta sem papel e anônimo.

**Gate P1:** aprovado em 28/08/2026. Candidato confirmado acessa somente sua área e seus próprios dados; tentativas abusivas são limitadas e auditadas; login, recuperação e Turnstile foram validados em produção; cadastro público continua fechado até o Gate P2.

### Fase 2 — Configuração administrativa do processo

- [x] SIGEC-P2-01 — Criar CRUD de processo, cronograma, versão do edital e publicação. Concluído em 28/08/2026 com criação, leitura, edição e arquivamento não destrutivo de rascunhos; painel de prontidão com oito controles; publicação e encerramento atômicos, restritos ao backend, com bloqueio normativo, trava de linha e auditoria.
- [x] SIGEC-P2-02 — Configurar modalidade, município, curso/especialidade, requisitos e vagas. Concluído em 28/08/2026 com CRUD administrativo de modalidades, cadastro/edição de vagas ativas ou inativas, quantidade definida ou cadastro de reserva, catálogo reutilizável de cursos e requisitos de formação/comprovação atualizados atomicamente; alterações ficam bloqueadas fora do rascunho e são auditadas.
- [x] SIGEC-P2-03 — Importar vagas dos anexos, normalizar nomes e gerar relatório de duplicidades antes da confirmação. Concluído em 28/08/2026 com extrator determinístico do SIGDOC, normalização sem acentos, prévia administrativa editável, bloqueio de requisitos vazios e duplicidades, confirmação explícita e importação transacional auditada. A prévia real identificou 389 linhas, das quais 364 prontas e 25 bloqueadas para revisão; nenhuma linha real foi importada automaticamente.
- [x] SIGEC-P2-04 — Configurar perguntas, documentos obrigatórios, condições PCD/PPP e modelos de declaração. Concluído em 28/08/2026 com painel administrativo único, públicos `todos/PCD/PPP`, tipos e opções de pergunta validados, anexos limitados a PDF/JPG/PNG e 50 MB, declarações versionadas e RPCs transacionais somente no backend; toda alteração é auditada e bloqueada após sair do rascunho. Os textos PCD/PPP permanecem configuráveis e pendentes de confirmação oficial.
- [x] SIGEC-P2-05 — Configurar etapas, transições permitidas e mensagens públicas/WhatsApp. Concluído em 28/08/2026 com etapa inicial única, terminais sem saída, grafo alcançável, transições ativas/inativas, exigência opcional de motivo e trava configurável de pendências; mensagens públicas e templates WhatsApp usam variáveis permitidas e são obrigatórios no gate de publicação. O envio pela MARA e a execução da trava ao mudar uma candidatura permanecem, respectivamente, nas tarefas P9 e P5.
- [x] SIGEC-P2-06 — Configurar critérios de pontuação e desempate com versionamento e bloqueio de alteração após publicação. Concluído em 29/08/2026: versões `draft`, `internal` e `official`, critérios e desempates vinculados à versão exata, imutabilidade após confirmação, RPCs somente `service_role`, trigger contra confirmação direta, gate da versão mais recente oficial e não provisória e painel administrativo com histórico. Retificações preservam as versões oficiais anteriores; um novo rascunho volta a bloquear a publicação. A rubrica complementar permanece configurável e em observação até o fechamento posterior solicitado.
- [x] SIGEC-P2-07 — Configurar por processo o número de opções permitido, conforme `SIGEC-DEC-04`. Concluído em 29/08/2026: seleção explícita de uma a cinco opções no rascunho, comunicação pública sem limite global fixo e trigger que aplica o limite do processo, valida o vínculo da vaga e impede alteração após envio. A publicação continua bloqueada enquanto `SIGEC-DEC-04` não estiver oficialmente confirmada.

**Gate P2:** processo só pode ser publicado após validação de datas, vagas, requisitos, total de pontos, desempates e documentos.

### Fase 3 — Perfil profissional e documentos

- [x] SIGEC-P3-01 — Implementar dados pessoais, endereço, contatos e disponibilidade. Concluído em 29/08/2026 com tela própria do candidato, validação Zod no servidor, normalização e completude derivada no banco, CPF/e-mail protegidos, troca de WhatsApp com revogação da verificação, RLS por proprietário e auditoria somente dos nomes dos campos alterados, sem copiar valores pessoais para o log.
- [x] SIGEC-P3-02 — Implementar formação acadêmica e equivalência/complementação pedagógica. Concluído em 29/08/2026 com cadastro, edição e remoção pelo próprio candidato; tipos acadêmicos e de formação/complementação pedagógica; período, conclusão e carga horária; normalização e regras de consistência no banco; leitura gerencial sem permissão de mutação; identidade imutável, RLS por proprietário e auditoria sem copiar curso ou instituição para o log.
- [x] SIGEC-P3-03 — Implementar experiências docentes com períodos, empregador, vínculo e cálculo de meses sem dupla contagem. Concluído em 29/08/2026 com CRUD do candidato, empregador, função, tipo de vínculo, períodos encerrados ou atuais e marcação docente; o banco une intervalos docentes sobrepostos, totaliza dias únicos e os converte transparentemente em meses equivalentes de 30 dias, sem incluir vínculos não docentes. RLS, identidade imutável, leitura gerencial sem mutação e auditoria sem valores profissionais foram validadas. Esse total é um indicador cadastral; a pontuação oficial por faixas continua reservada ao `SIGEC-P6-02`.
- [x] SIGEC-P3-04 — Implementar upload versionado com tamanho/tipo, hash, validação de conteúdo e remoção de metadados de imagem. Concluído em 29/08/2026 com central do candidato, API autenticada, identificação pelo conteúdo, rejeição de PDF ativo/criptografado, regravação de JPEG/PNG sem metadados, hash SHA-256 obrigatório, caminhos aleatórios append-only, versões encadeadas e registro auditado. O candidato não possui insert direto na tabela nem no Storage; arquivos tecnicamente validados entram em quarentena com antimalware pendente e a comissão só poderá lê-los após `malware_status = clean`.
- [x] Refinamento de usabilidade da P3-04 — Em 30/08/2026, a central foi simplificada para público leigo: linguagem direta, envio por documento solicitado, lista de arquivos já enviados e ações “Adicionar outro documento” e “Remover”. Versões, hash e antimalware continuam internos. A remoção é lógica, auditada, restrita ao proprietário e ao rascunho; o objeto perde acesso imediatamente e um novo envio preserva a sequência histórica.
- [x] SIGEC-P3-05 — Adicionar varredura antimalware e quarentena antes de disponibilizar documento à comissão. Concluído e homologado em 30/08/2026 com ClamAV 1.5.4 fixado como serviço interno sem porta publicada, protocolo `INSTREAM`, timeout e erros fechados, resultados vinculados ao hash, tentativas auditadas e rota gerencial de reprocessamento com nova conferência SHA-256. Somente `malware_status = clean` libera leitura no Storage, inclusive para o próprio candidato; `pending`, `infected` e `error` permanecem em quarentena. O runtime Docker foi elevado a Node 22, suportado pelo Supabase JS. O smoke real em produção confirmou uma versão PDF limpa como `clean` e uma versão PDF EICAR controlada como `infected`, ambas tecnicamente validadas e com uma tentativa registrada. A fixture, os três objetos versionados e as credenciais temporárias foram removidos após a verificação.
- [x] SIGEC-P3-06 — Exibir completude do perfil sem permitir que o candidato marque a própria verificação. Concluído em 30/08/2026 com indicador automático e responsivo na área inicial e no perfil, quatro etapas em linguagem simples, próxima ação orientada e separação explícita entre dados preenchidos e WhatsApp confirmado. O percentual é calculado no servidor a partir dos dados persistidos; conclusão e verificação continuam sem permissão de escrita para o candidato e protegidas por trigger/RPC.

**Gate P3:** aprovado em 30/08/2026. Nenhum arquivo fica disponível para análise antes de passar por validação técnica e antimalware; o fluxo de documentos e o ClamAV real estão homologados. A completude cadastral é calculada automaticamente e o candidato não pode atribuir a si mesmo conclusão ou verificação.

### Fase 4 — Inscrição

- [x] SIGEC-P4-01 — Criar inscrição em rascunho vinculada ao processo e ao candidato. Concluída em 31/08/2026 com ação contextual na página pública do processo, retorno claro para cadastro incompleto, continuidade de rascunho existente e confirmação na área do candidato. A criação é idempotente, serializada por candidato/processo, exige perfil completo, WhatsApp confirmado, processo publicado e janela aberta; inserção direta foi revogada e a implementação privilegiada ficou no schema `private`, acessada por wrapper público `SECURITY INVOKER`.
- [x] SIGEC-P4-02 — Implementar opção única ou preferências ordenadas conforme configuração do processo. Concluída em 31/08/2026 com tela responsiva para adicionar, remover e reordenar vagas, respeitando visualmente o limite de uma a cinco opções. A lista inteira é substituída em uma única transação; o banco revalida proprietário, rascunho, prazo, vagas ativas, processo, duplicidades e limite configurado. Escritas diretas foram revogadas e o wrapper público permanece `SECURITY INVOKER`.
- [x] SIGEC-P4-03 — Implementar perguntas e anexos condicionais. Concluída em 31/08/2026 com questionário responsivo, tipos de resposta validados e públicos `todos/PCD/PPP` liberados por perguntas booleanas configuráveis. Respostas são substituídas atomicamente; o banco rejeita campo oculto, tipo/opção inválida, candidatura alheia, prazo encerrado e alteração após envio. A central mostra somente anexos aplicáveis e o registro documental repete a condição no banco. Auditoria grava apenas quantidade, nunca o conteúdo das respostas nem a condição declarada.
- [x] SIGEC-P4-04 — Validar requisitos obrigatórios no servidor e no banco antes do envio. Concluída em 31/08/2026 com seis controles calculados no banco: prazo/rascunho, perfil e WhatsApp, preferências, perguntas condicionais, documentos condicionais limpos e aceites da versão vigente. O candidato vê pendências em linguagem simples e links para corrigi-las; outra conta não consulta o diagnóstico. Uma asserção privada reutilizável impedirá a P4-05 de enviar candidatura incompleta.
- [x] SIGEC-P4-05 — Gerar protocolo imutável com data, versão do edital, respostas, opções, consentimentos e hashes dos documentos. Concluída em 31/08/2026 com confirmação explícita dos quatro aceites e uma única transação que revalida a P4-04, cria protocolo único, congela snapshot canônico com hash SHA-256, move a candidatura para a etapa inicial e registra histórico/auditoria. Cliques repetidos devolvem o mesmo protocolo; snapshot não aceita alteração ou exclusão.
- [x] SIGEC-P4-06 — Permitir correção até o encerramento com histórico; para edital de inscrição única, manter apenas a última versão válida. Concluída em 31/08/2026 com abertura explícita de correção pelo candidato, prazo revalidado no banco, protocolo anterior preservado durante a edição e novo snapshot/protocolo criado somente no reenvio. As versões formam uma cadeia imutável, a view `security_invoker` marca exclusivamente a maior versão como vigente e anexos permanecem bloqueados até a correção ser aberta. A interface apresenta linguagem simples, histórico de protocolos e esclarece que a versão anterior continua válida enquanto a correção não for reenviada.
- [x] SIGEC-P4-07 — Impedir alterações após o prazo, exceto diligência administrativa explicitamente aberta. Concluída em 31/08/2026 com prazo obrigatório, solicitação vinculada a uma candidatura já enviada e allowlist estrita de perguntas/documentos por UUID. Fora da janela, respostas e anexos comuns permanecem bloqueados; o candidato altera somente os itens pedidos até o vencimento, e a diligência só é encerrada depois que todas as respostas forem válidas e todos os anexos solicitados estiverem tecnicamente validados e limpos no antimalware. A criação e gestão administrativa da solicitação continuam reservadas à P5-04.

**Gate P4:** envio concorrente/repetido é idempotente e não cria inscrições duplicadas.

### Fase 5 — Triagem e análise administrativa

- [ ] SIGEC-P5-01 — Criar lista paginada com filtros por processo, município, curso, modalidade, concorrência, status e pendência.
- [ ] SIGEC-P5-02 — Criar tela de candidatura com documentos, respostas, versões, consentimentos e histórico.
- [ ] SIGEC-P5-03 — Validar/rejeitar documentos com motivo público obrigatório e nota interna separada.
- [ ] SIGEC-P5-04 — Implementar diligência com campos autorizados, prazo e trilha de auditoria.
- [ ] SIGEC-P5-05 — Bloquear avanço enquanto houver documento obrigatório pendente/rejeitado ou diligência aberta.
- [ ] SIGEC-P5-06 — Implementar motivos de desclassificação conforme itens 6.1.1 a 6.1.9 do edital.
- [ ] SIGEC-P5-07 — Garantir que atendente não altere análise, nota, classificação ou convocação sem autorização expressa.

**Gate P5:** toda decisão identifica ator, instante, motivo, versão analisada e dados alterados.

### Fase 6 — Pontuação, classificação, cotas e resultados

- [ ] SIGEC-P6-01 — Implementar pós-graduação não cumulativa: 30/25/20, máximo 30.
- [ ] SIGEC-P6-02 — Implementar experiência por faixas, máximo 40, com regra explícita para sobreposição de vínculos.
- [ ] SIGEC-P6-03 — Implementar no motor de avaliação a rubrica aprovada de produção acadêmica e desenvolvimento profissional, com teto de 30 pontos, comprovação, limites por categoria e trilha de auditoria.
- [ ] SIGEC-P6-04 — Calcular nota total no servidor/banco e impedir pontos acima do máximo por critério.
- [ ] SIGEC-P6-05 — Implementar desempates na ordem oficial, incluindo idade calculada na data da inscrição.
- [ ] SIGEC-P6-06 — Gerar snapshots imutáveis da classificação preliminar e final, com versão do algoritmo.
- [ ] SIGEC-P6-07 — Gerar listas geral, PCD e PPP sem expor CPF, telefone ou motivo privado de desclassificação.
- [ ] SIGEC-P6-08 — Implementar reserva/reversão de vagas e regras de dupla elegibilidade.
- [ ] SIGEC-P6-09 — Exigir revisão humana e dupla confirmação antes de publicar ou substituir resultado oficial.

**Gate P6:** amostras conhecidas cobrem todos os empates, limites de pontuação, cotas, reversões e mudanças após recurso.

### Fase 7 — Recursos

- [ ] SIGEC-P7-01 — Abrir janela de 24 horas a partir de 00h00 do dia seguinte à publicação preliminar.
- [ ] SIGEC-P7-02 — Restringir recurso à própria candidatura e aos objetos permitidos.
- [ ] SIGEC-P7-03 — Bloquear novos anexos, substituição de documentos e alteração da inscrição durante recurso.
- [ ] SIGEC-P7-04 — Implementar análise, decisão fundamentada e comunicação por e-mail/portal.
- [ ] SIGEC-P7-05 — Recalcular somente os casos deferidos e gerar novo snapshot final completo e auditável.
- [ ] SIGEC-P7-06 — Impedir segundo recurso/revisão quando o processo estiver configurado conforme este edital.

**Gate P7:** relógio, timezone `America/Sao_Paulo`, abertura e encerramento são testados nos limites exatos.

### Fase 8 — Convocação e desistência

- [ ] SIGEC-P8-01 — Criar lotes de convocação por necessidade e vaga/especialidade.
- [ ] SIGEC-P8-02 — Selecionar candidato elegível seguindo snapshot final, cotas e ordem rigorosa.
- [ ] SIGEC-P8-03 — Registrar convocação, prazo, aceite, ausência, desistência e desclassificação documental.
- [ ] SIGEC-P8-04 — Convocar subsequente sem pular posição e registrar justificativa de qualquer exceção.
- [ ] SIGEC-P8-05 — Implementar remanejamento para área afim somente com decisão autorizada e auditável.
- [ ] SIGEC-P8-06 — Gerar documentos/relatórios da convocação sem expor dados além do necessário.

**Gate P8:** simulações de PCD, PPP, ampla, dupla elegibilidade, desistência e falta de candidato passam sem quebra da ordem.

### Fase 9 — Notificações MARA/WhatsApp e e-mail

- [ ] SIGEC-P9-01 — Criar consumidor seguro da outbox com chave idempotente, retentativas e dead-letter.
- [ ] SIGEC-P9-02 — Disparar comunicação somente após a transação que registra o evento de negócio.
- [ ] SIGEC-P9-03 — Versionar templates por processo e separar mensagens públicas de notas internas.
- [ ] SIGEC-P9-04 — Registrar envio, entrega, falha e nova tentativa com telefone mascarado.
- [ ] SIGEC-P9-05 — Cobrir pendência, análise, habilitação, classificação, desclassificação, recurso e convocação.
- [ ] SIGEC-P9-06 — Configurar `WEBHOOK_SECRET` no ambiente e na Evolution API; testar assinatura e rejeição sem segredo.

**Gate P9:** reprocessar a mesma mensagem não gera envio duplicado.

### Fase 10 — Segurança, LGPD, qualidade e lançamento

- [ ] SIGEC-P10-01 — Ativar MFA para administradores e gerentes.
- [ ] SIGEC-P10-02 — Definir retenção, descarte, backup, restauração e tratamento de arquivos órfãos.
- [ ] SIGEC-P10-03 — Revisar criptografia/tokenização do CPF e mascaramento de dados em logs/exportações.
- [ ] SIGEC-P10-04 — Criar testes unitários, integração, RLS, autorização negativa, E2E e concorrência.
- [ ] SIGEC-P10-05 — Executar Advisors, auditorias locais, typecheck, build e teste de recuperação.
- [ ] SIGEC-P10-06 — Homologar com comissão julgadora usando dados sintéticos e roteiro assinado.
- [ ] SIGEC-P10-07 — Preparar monitoramento, alertas, resposta a incidente e rollback.
- [ ] SIGEC-P10-08 — Liberar cadastro gradualmente e acompanhar erros, abuso e entregas de WhatsApp.

**Gate P10:** lançamento exige aceite funcional, segurança, LGPD, operação e plano de retorno.

**Dívida de segurança registrada em 27/08/2026:** após atualização segura das dependências transitivas, `npm audit` ainda reporta cinco vulnerabilidades altas ligadas principalmente ao Next.js 14 e ao conjunto de lint/PostCSS. A correção disponível exige migração de versão principal e não deve ser executada com `--force`; precisa de tarefa própria, testes de regressão e novo build antes de qualquer lançamento.

## 6. Auditoria do plano — 20/08/2026

### Resultado

**Aprovado com bloqueios normativos explícitos.** O plano cobre as nove frentes já listadas — banco, cadastro, configuração, perfil, inscrição, análise, pontuação/classificação, convocação e WhatsApp — e adiciona recursos, cotas, LGPD, homologação e operação.

### Fios soltos encontrados e tratados no plano

1. Total de 100 pontos versus apenas 70 detalhados no SIGDOC: resolvido no produto pela rubrica complementar de 30 pontos; preservar a divergência documental na versão da regra.
2. Produção acadêmica usada no desempate: rubrica resolvida; uso como terceiro desempate ainda depende da confirmação da ordem oficial dos desempates.
3. Ausência de corte entre habilitado e classificado: bloqueado por `SIGEC-DEC-03`.
4. Uma inscrição no edital versus cinco preferências no produto: bloqueado por `SIGEC-DEC-04` e configurável por processo.
5. Escopo exato da lista de classificação: bloqueado por `SIGEC-DEC-05`.
6. Combinação operacional PCD/PPP/ampla: bloqueada por `SIGEC-DEC-06` e coberta por simulações.
7. Recurso não pode aceitar documento novo: separado de diligência e coberto por gate próprio.
8. Publicação de resultados precisa de snapshot e dupla confirmação: incluída em P6.
9. WhatsApp pode duplicar ou perder mensagem: outbox idempotente e transação lógica incluídas em P9.
10. Documento malicioso/forjado: validação de conteúdo, hash, quarentena e antimalware incluídos em P3.
11. Risco de IDOR/BOLA entre candidatos: testes negativos de RLS incluídos em P0 e P10.
12. Alteração retroativa de critérios: versionamento e bloqueio após publicação incluídos em P2/P6.

### Limite desta auditoria

A auditoria confirma a completude e a ordem do plano; não confirma como concluídas tarefas futuras. Cada conclusão exige evidência objetiva no histórico abaixo e execução do gate da fase.

## 7. Protocolo obrigatório de atualização

Ao concluir uma tarefa:

1. trocar `[ ]` por `[x]` somente após cumprir o critério de aceite;
2. atualizar data, estado geral, fase atual e próxima ação no topo;
3. registrar evidência verificável no histórico: arquivos, migração, testes ou resultado do ambiente;
4. executar `py execution\audit_sigec_plan.py`;
5. executar os gates técnicos aplicáveis antes de concluir a fase;
6. nunca apagar bloqueios ou decisões anteriores; marcar como resolvidos e registrar a fonte.

### Estratégia de branches e promoção

- Cada fase deve ser desenvolvida, testada e enviada em branch própria no padrão `codex/sigec-fase-N-descricao`.
- O push da branch só ocorre depois que o gate técnico da fase estiver aprovado e este handoff estiver atualizado.
- A integração na branch principal ocorre somente após concluir todas as fases da etapa planejada.
- Após a integração na principal, executar smoke tests, regressão, auditorias de segurança e validação do banco antes de promover o ambiente.
- Nunca incluir no commit arquivos de `.tmp/`, caches, credenciais locais ou artefatos do usuário sem relação com a fase.

## 8. Histórico de execução

| Data | Tarefas | Evidência | Resultado |
|---|---|---|---|
| 21/07/2026 | SIGEC-FND-01 a SIGEC-FND-08 | migração local, rotas, guardas e scripts de auditoria | Fundação aprovada localmente; banco remoto não alterado |
| 20/08/2026 | Análise do Edital Nº 01/2026 | páginas 2, 3, 7–11, 16 e 33 renderizadas e confrontadas com extração textual | Regras parciais confirmadas; seis decisões normativas abertas |
| 20/08/2026 | Auditoria deste plano | seções 5 e 6 deste arquivo + `execution/audit_sigec_plan.py` | Plano aprovado com bloqueios explícitos |
| 20/08/2026 | SIGEC-P0-02 | OpenAPI do projeto indicado pelo `.env`; comparação com o MCP conectado | Projeto `hvvgyiafelqylbzkzjbi` confirmado; zero tabelas SIGEC; MCP divergente não utilizado |
| 20/08/2026 | SIGEC-P2-01 (parcial) | `app/(dashboard)/sigec-processos/actions.ts`, rota `[id]` e componentes de formulário/arquivamento | CRUD local de rascunho iniciado; criação, leitura, edição de rascunho e arquivamento não destrutivo implementados; publicação permanece bloqueada |
| 27/08/2026 | Rubrica provisória dos 30 pontos | decisão do produto registrada na seção 4.1 | Aprovada para configuração e testes; publicação oficial permanece bloqueada até confirmação normativa |
| 27/08/2026 | Credencial PostgreSQL local | variável `POSTGRES` presente e não vazia no `.env.local`, sem exposição do valor | Presença confirmada; validade ainda dependia do teste de conexão registrado na linha seguinte |
| 27/08/2026 | Dry-run remoto de P0-03 | `execution/sigec_supabase_gate.py` e CLI Supabase 2.116.0 fixada no lockfile | Projeto correto confirmado; autenticação PostgreSQL recusada (`SQLSTATE 28P01`); zero alterações remotas |
| 27/08/2026 | Rubrica provisória implementada (P2-06 parcial) | `config/sigec-provisional-scoring.json`, `lib/sigec-scoring.ts`, tela administrativa e `execution/test_sigec_scoring.py` | 5 testes aprovados; máximo de 30 pontos e publicação oficial bloqueada no contrato |
| 27/08/2026 | Endurecimento do Storage | migração de fundação + `execution/audit_sigec_security.py` | Arquivos de candidatos tornados append-only; caminho preso a candidato/candidatura; diligência expirada não reabre upload; auditoria aprovada |
| 27/08/2026 | Auditoria de dependências | `npm audit fix` sem alterações principais | vulnerabilidades altas reduzidas de 12 para 5; migração de Next.js registrada como bloqueio de lançamento |
| 27/08/2026 | Gate técnico da rodada | teste da rubrica, auditoria do plano, auditoria SQL, auditoria da aplicação, TypeScript e `npm run build` | todos aprovados; 46 páginas geradas; permanecem apenas bloqueios remotos/normativos e a dívida de versão principal |
| 27/08/2026 | Nova tentativa PostgreSQL | duas execuções de `npm run sigec:db:dry-run`, resolução DNS e teste TCP | host direto resolveu somente como `AAAA`; TCP 5432 indisponível; conexão encerrada antes do dry-run; zero alterações remotas |
| 27/08/2026 | Acesso via Session pooler | `npm run sigec:db:history`, fetch temporário do histórico e `npm run sigec:db:isolated-dry-run` | conexão aprovada; 11 migrações remotas reconciliadas em diretório temporário; somente a fundação SIGEC ficou pendente; zero alterações remotas |
| 27/08/2026 | SIGEC-P0-03 | fundação + migrações `sigec_foundation_advisor_fixes`, `sigec_consolidate_rls_policies` e `sigec_fix_application_policy_recursion`; `npm run sigec:db:verify` e Advisors | 27/27 tabelas com RLS, bucket privado, 46 políticas públicas, nenhum FK sem índice, zero achados acionáveis e banco sem migração pendente |
| 27/08/2026 | SIGEC-P0-04 e SIGEC-P0-05 | `execution/test_sigec_remote_access.py` | 36 cenários remotos aprovados; recursão de política encontrada e corrigida; usuários, processos e objetos sintéticos confirmados em zero após limpeza |
| 27/08/2026 | SIGEC-P0-06 | migrações `sigec_ranking_audit_foundation` e `sigec_ranking_evidence_integrity`; `execution/test_sigec_ranking_remote.py`; verificação remota e Advisors | 33/33 tabelas com RLS; 19 cenários remotos aprovados; decisões, cotas e snapshots versionados; evidência antiga invalidada por retificação; dupla aprovação obrigatória; zero fixtures e zero achados acionáveis |
| 27/08/2026 | SIGEC-P0-01 e fechamento da Fase 0 | auditoria do diff e preparação da branch `codex/sigec-fase-0-fundacao` | pacote SIGEC separado; temporários, caches, credenciais e CSV do usuário mantidos fora do commit; estratégia de promoção registrada |
| 27/08/2026 | Promoção da Fase 0 para `master` | merge local `3066548`; auditorias de plano, SQL e aplicação; pontuação; TypeScript; build; smoke HTTP | promoção autorizada pelo responsável; 46 páginas geradas; `/api/health`, `/login`, `/processos` e `/cadastro-candidato` retornaram 200; `/minha-area` redirecionou para `/login`; rotação das credenciais históricas permanece obrigatória |
| 27/08/2026 | SIGEC-P1-01 | migrações `sigec_candidate_signup_role` e `sigec_candidate_signup_admin_compatibility`; Server Action, schema Zod e formulário; testes remotos de cadastro, acesso e ranking | 7 cenários de cadastro, 36 de acesso e 19 de ranking aprovados; gerente via Admin API preservado; 33/33 tabelas com RLS; zero fixtures; 18 verificações estáticas, build de 46 páginas e smoke HTTP 200 com formulário habilitado aprovados; rota mantida fechada por feature flag |
| 27/08/2026 | SIGEC-P1-02 | callback `/auth/confirm`, telas e ações de recuperação/redefinição, proteção no middleware e `execution/test_sigec_auth_lifecycle.py` | confirmação de e-mail obrigatória no Supabase; 8 cenários remotos aprovados com duas sessões e revogação de ambos os refresh tokens; 22 verificações estáticas, TypeScript, build de 49 páginas e smokes de acesso/redirecionamento aprovados |
| 27/08/2026 | SIGEC-P1-03 (parcial) | migrações `sigec_registration_abuse_limits`, `sigec_remove_consumed_signup_proof` e `sigec_finalize_signup_proof_cleanup`; widget Turnstile em cadastro, login e recuperação; `lib/sigec-abuse-server.ts`; `execution/test_sigec_abuse_controls.py` | 35/35 tabelas com RLS; 9 cenários de cadastro e bypass, 4 de limites incluindo 10 chamadas concorrentes e 36 de acesso aprovados; RPC e tabelas server-only; zero fixtures; 40 controles estáticos, TypeScript e build de 50 páginas aprovados; configuração externa informada como concluída, aguardando Sitekey no ambiente e smoke no hostname oficial |
| 27/08/2026 | SIGEC-P1-04 (parcial) | migrações `sigec_whatsapp_otp_hardening` e `sigec_whatsapp_replay_rejection`; ações e tela `/minha-area/verificar-whatsapp`; Evolution `marav2` conectada; `execution/test_sigec_whatsapp_otp.py` | 9 cenários remotos aprovados: hash sem texto puro, bloqueio na 5ª tentativa, não reutilização, rejeição explícita de replay, isolamento entre usuários, confirmação atômica, reset ao mudar telefone e RPC server-only; build de 50 páginas e smoke com redirecionamento `307` para `/login` aprovados; fingerprint outbound em SHA-256; entrega real aguarda segredo OTP e número autorizado |
| 27/08/2026 | SIGEC-P1-05 | migrações `sigec_consent_integrity`, `sigec_consent_eligibility_diagnostics` e `sigec_consent_conflict_fix`; Server Action de aceites; `execution/test_sigec_consents.py` | 8 cenários remotos aprovados: quatro aceites versionados, idempotência, RPC server-only, inserção direta revogada, vínculo à própria candidatura, rejeição de aceite negativo e preservação de versões após retificação; fixtures removidas |
| 27/08/2026 | SIGEC-P1-06 | `execution/test_sigec_role_redirects.mjs`; ampliação do teste OTP e da auditoria anti-enumeração | 10 cenários HTTP por papel, 9 de cadastro/nonce, 4 de rate limit e 9 de OTP aprovados; replay corrigido para `already_used`; cadastro, login e recuperação mantêm respostas genéricas; todas as fixtures removidas |
| 27/08/2026 | Validação externa do Turnstile | Sitekey configurada localmente; `execution/test_sigec_captcha_configuration.py`; login atualizado para enviar `captchaToken`; verificação pública de `mara.joaodantasia.com.br/login` | Supabase confirmou `captcha_required`; 40 controles estáticos, TypeScript e build de 50 páginas aprovados; produção ainda sem widget, portanto CAPTCHA deve permanecer desativado até a promoção e o smoke oficial |
| 28/08/2026 | Gate operacional do P1 | `execution/test_sigec_p1_readiness.py`; inspeção externa do login; status somente leitura da Evolution; testes remotos de abuso e OTP; build | Segredos independentes configurados localmente sem exposição; oito checagens de prontidão, quatro de abuso, nove de OTP e build de 50 páginas aprovados; Evolution `marav2` conectada; produção continua sem widget; nenhum WhatsApp enviado e cadastro mantido fechado |
| 28/08/2026 | SIGEC-P1-04 e smoke de entrega OTP | `execution/test_sigec_whatsapp_delivery.py`; candidato sintético temporário; Evolution `marav2`; RPC protegido do Supabase | Mensagem entregue ao número autorizado e mascarado; código recebido foi aceito, perfil marcado atomicamente e fixture apagada; nenhum OTP permaneceu em texto puro |
| 28/08/2026 | Promoção e smoke oficial do P1 (parcial) | commit `fce8d5a`; `master`; `mara.joaodantasia.com.br`; navegador e HTTP | `/login` com Turnstile e token aceito, `/api/health` 200, cadastro fechado e guardas 307/401 aprovadas; o contêiner atual confirmou todas as variáveis obrigatórias, mas `/recuperar-senha` ainda responde indisponível; P1-03 mantido pendente |
| 28/08/2026 | Diagnóstico da recuperação em produção | `lib/sigec-abuse-server.ts`; Server Action de recuperação; auditorias; testes remotos; verificação do banco; build | o teste avulso sem espera explícita não produziu evidência conclusiva; consumo dos buckets alterado para sequência determinística e logs restritos a etapa, bucket e código técnico, sem e-mail, IP, digest ou segredo; 48 controles de aplicação, plano 19/88, TypeScript, quatro cenários remotos de abuso com fixtures removidas, oito verificações de prontidão, 35/35 tabelas RLS e build de 50 páginas aprovados; aguardando nova publicação e smoke |
| 28/08/2026 | Causa isolada no segundo smoke de recuperação | log do serviço `mara_sistemamara`; `lib/sigec-app-url.ts`; Dockerfile e Compose | falha confirmada na etapa `app_url`: variável pública presente no runtime, mas vazia no bundle compilado do Server Action; redirecionamentos de recuperação e cadastro migrados para `SIGEC_APP_URL` server-only, com validação de HTTPS, exceção local controlada e fallback canônico `mara.joaodantasia.com.br`; 54 controles de aplicação, plano 19/88, TypeScript e build de 50 páginas aprovados; validação dinâmica do Compose não executada porque o Docker não está instalado na estação; aguardando publicação e smoke |
| 28/08/2026 | Fechamento do SIGEC-P1-03 e Gate P1 | imagem `sistemamara:79f16ee`; serviço `mara_sistemamara`; Turnstile e recuperação no domínio oficial | deploy convergiu em 1/1 tarefa; desafio humano concluído; recuperação retornou a mensagem genérica esperada sem revelar existência de conta; P1 passou para 6/6 tarefas concluídas. O alerta de build sobre `SUPABASE_ANON_KEY` é não bloqueante porque a anon key é pública por projeto; `SUPABASE_SERVICE_ROLE_KEY` permanece somente no runtime e fora da imagem |
| 28/08/2026 | Polimento visual pós-Gate P1 | telas de recuperação e redefinição; formulários de senha; auditoria de aplicação; renderização local | removida a dependência visual de `.bg-white`, que é remapeada globalmente para o tema escuro; painel, títulos, textos, campos, mensagens e foco agora usam contraste explícito e coerente em todo o ciclo de senha; 58 controles, TypeScript, build de 50 páginas e inspeção visual aprovados; Turnstile local recusado apenas pela restrição esperada de hostname, já validado no domínio oficial; sem alteração funcional no Auth |
| 28/08/2026 | Abertura da Fase 2 | branch `codex/sigec-fase-2-configuracao-processo` criada a partir de `master` em `02b182e` | fase isolada conforme a estratégia de branches; nenhuma tarefa P2 marcada antecipadamente; início definido pelo SIGEC-P2-01 |
| 28/08/2026 | SIGEC-P2-01 | migração `sigec_process_publication_gate`; CRUD e painel administrativo; `execution/test_sigec_process_management.py`; verificação remota, Advisors, auditorias, TypeScript e build | publicação exige oito controles, inclusive seis decisões normativas confirmadas; RPCs somente `service_role`; transições atômicas e auditadas; 11 cenários remotos aprovados com rollback integral; 35/35 tabelas com RLS, zero fixtures, zero achados acionáveis e build de 50 páginas aprovado |
| 28/08/2026 | SIGEC-P2-02 | migração `sigec_vacancy_configuration`; painel de vagas e modalidades; RPCs transacionais; teste remoto ampliado | modalidades vinculadas ao processo; vaga, curso e requisito persistidos atomicamente; exclusão com dependência rejeitada; configuração bloqueada após publicação; 15 cenários remotos aprovados com rollback integral, zero fixtures, zero Advisors acionáveis, TypeScript e build de 50 páginas aprovados |
| 28/08/2026 | SIGEC-P2-03 (extração e auditoria inicial) | `execution/extract_sigec_vacancies.py`; SIGDOC principal; teste determinístico de normalização | 389 linhas extraídas das modalidades Centros Educa Mais e EJATEC sem gravação no banco; 23 linhas com curso/requisito divergente e 2 linhas duplicadas em São Luís foram bloqueadas para revisão; 364 linhas passaram na prévia. P2-03 permanece pendente até existir tela de revisão e confirmação transacional. |
| 28/08/2026 | SIGEC-P2-03 | tela de revisão de importação; migração `sigec_confirm_vacancy_import`; validação duplicada no cliente, Server Action e banco; teste remoto ampliado | requisitos e duplicidades impedem confirmação; conflitos com vagas existentes são rejeitados; lote confirmado é atômico e auditado; 17 cenários remotos, 68 controles da aplicação, 35/35 tabelas RLS, zero fixtures, zero Advisors acionáveis, TypeScript e build de 50 páginas aprovados |
| 28/08/2026 | SIGEC-P2-04 | migração `sigec_form_configuration`; painel de perguntas, documentos e declarações; Server Actions com Zod; correção do rollback em `sigec_supabase_gate.py`; testes local e remoto | configuração condicional PCD/PPP versionada, auditada e bloqueada fora do rascunho; RPCs e declarações somente `service_role`; 20 controles remotos com rollback integral, teste de regressão do gate, 36/36 tabelas RLS, 72 controles da aplicação, zero fixtures, zero Advisors acionáveis, TypeScript e build de 50 páginas aprovados |
| 28/08/2026 | SIGEC-P2-05 | migrações `sigec_stage_configuration` e `sigec_stage_transition_fk_indexes`; painel visual do fluxo; RPCs de etapas/transições; gate de alcançabilidade; teste remoto ampliado | fluxo desconectado ou sem mensagens não pode ser publicado; terminal não aceita saída; templates rejeitam variáveis desconhecidas; RPCs e transições somente `service_role`; 25 controles remotos com rollback integral, 37/37 tabelas RLS, nenhum FK sem índice, 76 controles da aplicação, zero fixtures, zero Advisors acionáveis, TypeScript e build de 50 páginas aprovados |
| 29/08/2026 | SIGEC-P2-06 | migrações `sigec_scoring_configuration_versioning`, `sigec_scoring_latest_version_gate` e `sigec_scoring_confirmation_trigger_guard`; painel de pontuação/desempate; RPCs versionadas; gate oficial; testes e auditorias ampliados | versão confirmada é imutável; versão provisória aceita somente homologação interna; versão oficial exige total exato, desempate e seis decisões confirmadas, inclusive contra atualização direta com chave de serviço; retificações preservam o histórico e a versão mais recente governa o gate; 31 controles remotos com rollback integral, 40/40 tabelas RLS, nenhum FK sem índice, 80 controles da aplicação, zero fixtures, zero Advisors acionáveis e build de 50 páginas aprovado |
| 29/08/2026 | SIGEC-P2-07 | migração `sigec_process_preference_limit`; formulário e comunicação pública por processo; trigger de limite e imutabilidade após envio; teste remoto ampliado | processo aceita de uma a cinco opções no rascunho; banco rejeita preferência acima do limite, vaga de outro processo/inativa e mudança após envio; 34 controles remotos com rollback integral, 40/40 tabelas RLS, nenhum FK sem índice, 82 controles da aplicação, zero fixtures, zero Advisors acionáveis e build de 50 páginas aprovado |
| 29/08/2026 | Observações de produto sobre pontuação e pendências | revisão integral do SIGDOC e orientação do responsável | lógica complementar para completar 100 pontos e fluxo de aprovação de pendências compreendidos; ambos mantidos como observação para finalização posterior, sem bloquear o avanço para as próximas implementações |
| 29/08/2026 | SIGEC-P3-01 | migração `sigec_candidate_profile_management`; rota `/minha-area/perfil`; Server Action e formulário do perfil; teste transacional remoto e auditorias | candidato altera somente o próprio perfil; CPF, conclusão e verificação permanecem protegidos; WhatsApp alterado perde a verificação; completude é derivada; auditoria não registra valores pessoais; 19 controles remotos com rollback e limpeza, 40/40 tabelas RLS, 87 controles da aplicação, zero Advisors acionáveis, TypeScript e build de 51 páginas aprovados |
| 29/08/2026 | SIGEC-P3-02 | migração `sigec_candidate_education_management`; rota `/minha-area/formacao`; Server Actions e gerenciador de formações; teste transacional remoto e auditorias | candidato gerencia somente a própria formação; outro candidato não lê nem altera; gerente apenas consulta; formação pedagógica exige carga horária; datas e conclusão são consistentes; identidade é imutável; auditoria omite curso e instituição; 22 controles remotos com rollback e limpeza, 91 controles da aplicação, zero Advisors acionáveis, TypeScript e build de 52 páginas aprovados |
| 29/08/2026 | SIGEC-P3-03 | migração `sigec_candidate_experience_management`; rota `/minha-area/experiencia`; função de união de intervalos; teste transacional remoto | três vínculos testados, inclusive dois docentes sobrepostos e um não docente; total correto de 120 dias únicos/4 meses, isolamento candidato A/B, consulta gerencial sem mutação, auditoria sem empregador/função e privilégios mínimos; 21 controles remotos com rollback e limpeza, 95 controles da aplicação, 40/40 tabelas RLS, zero fixtures, zero Advisors acionáveis, TypeScript e build de 53 páginas aprovados |
| 29/08/2026 | SIGEC-P3-04 | migrações `sigec_candidate_document_processing` e `sigec_candidate_document_requirement_columns_fix`; processador Sharp/PDF; API e central de documentos; gate do pooler reforçado; testes local e remoto | seis cenários locais validaram conteúdo, hash, limite, MIME forjado e remoção de metadados; 18 controles remotos confirmaram versionamento, encadeamento, quarentena, bloqueios, RLS e auditoria com rollback e limpeza. RPC `SECURITY INVOKER` somente no backend, insert direto removido, Storage append-only e comissão bloqueada até antimalware limpo; 102 controles da aplicação, 40/40 tabelas RLS, zero Advisors acionáveis, zero fixtures, TypeScript e build de 55 páginas aprovados. |
| 30/08/2026 | SIGEC-P3-05 | migração `sigec_candidate_document_malware_scan`; cliente ClamAV `INSTREAM`; varredura imediata e reprocessamento gerencial; ClamAV interno no Compose; Node 22 | quatro testes locais cobriram limpo, EICAR, erro e configuração ausente; 24 controles remotos validaram transições, hash, tentativas, quarentena, permissões e auditoria com rollback e limpeza. 109 controles da aplicação, 40/40 tabelas RLS, zero Advisors acionáveis, zero fixtures, TypeScript e build de 56 páginas aprovados. Smoke real em produção posteriormente homologado com PDF limpo `clean` e PDF EICAR `infected`. |
| 30/08/2026 | Promoção para deploy | merge `e96a313` na `master`, autorizado pelo responsável | Fases 2 e 3 até P3-05 reunidas na principal para deploy e smoke. A promoção não homologa os Gates P2/P3, não publica processo real e não remove as decisões normativas pendentes. |
| 30/08/2026 | ClamAV operacional em produção | stack `mara`; serviço `mara_clamav`; imagem `clamav/clamav:1.5.4`; rede externa `JoaoDantasMAnet` | serviço adicionado pelo responsável através da atualização manual do stack no Portainer, sem porta publicada. Smoke real confirmou PDF limpo como `clean` e PDF EICAR em stream não comprimido como `infected`; cada documento registrou uma tentativa e o arquivo infectado permaneceu bloqueado. |
| 30/08/2026 | Fixture persistente para smoke do ClamAV | `execution/manage_sigec_clamav_smoke_fixture.py`; usuário candidato sintético; processo privado em rascunho; candidatura e requisito documental controlados | conta, processo, candidatura e requisito foram usados exclusivamente no smoke. Após a evidência `clean`/`infected`, os três objetos versionados, registros relacionados, usuário Auth, credenciais e arquivos EICAR locais foram removidos; a verificação final retornou zero processo, candidatura, requisito e documento. |
| 30/08/2026 | Hotfix de upload, sessão pública e contraste candidato | middleware; `/processos`; layout e central de documentos do candidato; favicon; testes de papéis | o primeiro smoke revelou `403` antes da rota porque o middleware não reconhecia `/api/sigec/candidate-documents` como endpoint candidato. A permissão foi aberta somente para essa rota, mantendo reprocessamento e APIs internas bloqueados. Páginas públicas agora exibem a sessão ativa e o retorno por papel; o tema claro explícito eliminou o remapeamento escuro que deixava textos ilegíveis. TypeScript, build de 57 páginas, 110 controles estáticos e 13 cenários HTTP por papel foram aprovados; o deploy manual e os uploads de produção foram concluídos. |
| 30/08/2026 | Homologação produtiva do ClamAV | versões 1 e 3 da candidatura sintética; status remoto antes da limpeza; utilitários de geração e limpeza idempotente | a versão limpa ficou `technical_status = validated`, `malware_status = clean`; a versão EICAR final ficou `technical_status = validated`, `malware_status = infected`; ambas tiveram uma tentativa de scan. Uma versão EICAR preliminar não representativa ficou `clean`, levando à correção do artefato para stream PDF não comprimido. A fixture e os objetos foram eliminados e o status final confirmou ambiente limpo. |
| 30/08/2026 | Simplificação da central de documentos | tela `/minha-area/documentos`; remoção lógica; migrations `sigec_candidate_document_removal` e `sigec_candidate_document_removed_by_index`; API candidato | termos técnicos foram retirados da experiência do candidato; um único processo não exibe seletor desnecessário; arquivos enviados aparecem em lista com estados simples, data, remoção confirmada e novo envio. O banco mantém histórico e auditoria sem expor nome/caminho, restringe remoção ao proprietário em rascunho, torna o registro removido imutável e revoga leitura no Storage. 33 controles remotos com rollback, 15 cenários HTTP por papel, 115 controles estáticos, 40/40 tabelas RLS, nenhum FK sem índice, zero fixtures e zero Advisors acionáveis foram aprovados. |
| 30/08/2026 | SIGEC-P3-06 e Gate P3 | indicador de completude em `/minha-area` e `/minha-area/perfil`; cálculo determinístico; proteção existente de colunas e trigger | quatro etapas simples mostram dados pessoais, endereço, disponibilidade e confirmação do WhatsApp; progresso vazio, parcial e completo foi testado; o candidato não recebe controle para marcar verificação. Dez verificações locais, 19 controles remotos de perfil, 15 cenários HTTP por papel, 116 controles estáticos, 40/40 tabelas RLS, nenhum FK sem índice, zero fixtures, zero Advisors acionáveis, TypeScript e build de 57 páginas foram aprovados. |
| 31/08/2026 | SIGEC-P4-01 | migrations `sigec_application_draft_creation` e `sigec_application_draft_private_implementation`; Server Action na página do processo; retorno na área do candidato | função transacional cria um único rascunho por candidato/processo, devolve o existente em repetição, bloqueia perfil incompleto, papel interno, processo fechado e inserção direta, e registra um único evento de auditoria. A rotina privilegiada foi removida do schema exposto e mantida em `private`, com wrapper `SECURITY INVOKER`. Doze controles remotos com rollback, 15 cenários HTTP por papel, 116 controles estáticos, 40/40 tabelas RLS, nenhum FK sem índice, zero fixtures, zero Advisors acionáveis, TypeScript e build de 57 páginas foram aprovados. |
| 31/08/2026 | SIGEC-P4-02 | migration `sigec_application_preferences_transaction`; rota `/minha-area/inscricoes/[id]`; seletor responsivo de vagas | candidato adiciona, remove e ordena até o limite configurado; atualização atômica preserva a ordem e rejeita duplicata, inscrição alheia, limite excedido, processo fechado e candidatura enviada. Vinte controles remotos com rollback e limpeza foram aprovados; escrita direta foi revogada e auditoria registra somente a quantidade escolhida. |
| 31/08/2026 | SIGEC-P4-03 | migrations `sigec_application_conditional_answers` e correção versionada `sigec_application_answer_json_alias_fix`; questionário e anexos por público | interface responsiva cobre texto, escolha, múltipla escolha, sim/não, número e data; perguntas marcadoras liberam campos PCD/PPP sem códigos fixos; salvamento transacional e registro de anexo revalidam proprietário, rascunho, prazo, tipo, obrigatoriedade e condição. O primeiro teste dinâmico encontrou um alias JSON inválido, a transação/fixtures foram revertidas e a migração corretiva separada passou nos mesmos 20 controles. Regressões de rascunho e documentos, oito testes locais de condição, 120 controles da aplicação, 40/40 tabelas RLS, nenhum FK sem índice, zero fixtures, zero Advisors acionáveis, TypeScript e build de 57 páginas foram aprovados. |
| 31/08/2026 | SIGEC-P4-04 | migration `sigec_application_submission_readiness`; painel de revisão na candidatura; asserção privada para P4-05 | seis controles obrigatórios são calculados no banco respeitando condições PCD/PPP; documento só conta quando ativo, tecnicamente validado e limpo no antimalware; aceites precisam corresponder à versão vigente. Doze controles remotos confirmaram progressão incompleta/completa, isolamento e bloqueio da asserção, com rollback e limpeza integral. |
| 31/08/2026 | SIGEC-P4-05 | migrations `sigec_application_submission_protocol` e `sigec_submission_pgcrypto_schema_fix`; confirmação final e protocolo | snapshot append-only contém versão do edital, data, opções ordenadas, respostas, aceites e hashes dos documentos aplicáveis; protocolo é único e o envio repetido é idempotente. O primeiro teste dinâmico revelou o `pgcrypto` no schema `extensions`; rollback/limpeza foram confirmados e a correção versionada passou nos 20 controles completos, incluindo conferência do hash, isolamento RLS, imutabilidade e tentativa de inserção direta. |
| 31/08/2026 | SIGEC-P4-06 | migration `sigec_application_correction_versions`; abertura de correção; reenvio versionado; histórico de protocolos | protocolo vigente permanece válido durante a edição; reenvio gera versão seguinte e encadeia o snapshot anterior; somente a maior versão é vigente. Trinta e dois controles transacionais, 33 de documentos e 36 de acesso passaram com rollback/limpeza; 129 controles da aplicação, 41/41 tabelas RLS, nenhum FK sem índice, zero fixtures, zero Advisors acionáveis e build de 57 páginas aprovados. O teste de acesso legado foi atualizado para refletir a proibição já vigente de upload direto no Storage. |
| 31/08/2026 | SIGEC-P4-07 | migrations `sigec_application_deadline_diligence_gate` e `sigec_diligence_staff_trigger_security`; resposta de diligência na candidatura e central de documentos | encerrado o prazo, somente solicitação administrativa aberta, não vencida e com allowlist exata permite alteração. Respostas fora do escopo, documentos não pedidos, outra candidatura, solicitação vencida/respondida e uso sem submissão são rejeitados; fechamento exige respostas válidas e anexo limpo. Quarenta e cinco controles de prontidão/diligência, 37 de acesso e 33 de documentos passaram sequencialmente com rollback/limpeza; os testes compartilham fixtures sintéticas e não devem rodar em paralelo. Auditorias aprovaram 137 controles da aplicação, 41/41 tabelas RLS, nenhum FK sem índice, zero fixtures e zero Advisors acionáveis. O verificador remoto agora falha quando qualquer controle booleano retorna falso; TypeScript e build de 57 páginas aprovados. |

## 9. Próxima ação recomendada

Executar o Gate P4 com testes deliberadamente concorrentes e repetidos para criação de rascunho, substituição de preferências/respostas, envio, correção, protocolo e diligência, confirmando idempotência e ausência de inscrições, versões ou auditorias duplicadas. Os testes remotos existentes que reutilizam os mesmos usuários sintéticos devem continuar sequenciais. Para fechar posteriormente o Gate P2, ainda será necessário revisar a prévia real, importar as 364 linhas prontas, corrigir ou excluir as 25 pendentes, finalizar e registrar as seis decisões exigidas pelo gate e confirmar a versão oficial de pontuação/desempates. Até lá, o banco rejeita corretamente a publicação e a classificação automática permanece fechada.
