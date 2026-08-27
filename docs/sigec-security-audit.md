# Auditoria de segurança — SIGEC Processos

O plano vivo, o estado de execução e as decisões normativas estão registrados em [sigec-handoff-status.md](sigec-handoff-status.md).

Data da revisão: 21/07/2026.

## Escopo e premissas

O SIGEC armazenará dados pessoais, documentos profissionais, decisões de seleção e contatos por WhatsApp. A segurança foi desenhada considerando quatro fronteiras: visitante público, candidato, equipe interna e integrações externas. Toda regra sensível deve ser validada no servidor e no banco; esconder botões na interface não é controle de acesso.

## Prioridade 0 — bloqueios antes de produção

1. **Aplicar a migração apenas no projeto Supabase correto.** A migração local ainda não foi executada nem validada pelo banco remoto. Depois da aplicação, executar os Advisors de segurança e desempenho e testar as políticas com usuários reais de cada papel.
2. **Liberar cadastro somente com provisionamento confiável.** A conta deve receber `app_metadata.role = candidato` exclusivamente pelo backend. Não confiar em `user_metadata`. Cadastro público precisa de CAPTCHA, limitação de tentativas por IP/e-mail/telefone, confirmação de e-mail e verificação do WhatsApp.
3. **Manter o formulário público fechado até o item anterior.** A rota existe, mas não coleta dados nem cria contas incompletamente protegidas.
4. **Configurar `WEBHOOK_SECRET` e atualizar a Evolution API.** Os dois webhooks agora falham com 503 sem segredo e aceitam o segredo somente no cabeçalho `x-webhook-secret`; segredo em URL não é aceito.
5. **Criar o consumidor da fila de WhatsApp.** O envio deve usar a chave idempotente da outbox, retentativas limitadas, registro de entrega e mascaramento de telefone em logs. Mudança de status e envio precisam estar na mesma transação lógica para não perder notificações.

## Prioridade 1 — controles já implementados

- Papéis separados: `admin`, `gerente`, `atendente`, `candidato` e `sem_acesso`.
- Papel desconhecido falha fechado; não herda mais permissão de atendente.
- Papel lido de `app_metadata`, que não é editável pelo próprio usuário.
- Middleware impede candidato de acessar qualquer API interna e impede equipe interna de usar APIs exclusivas do candidato.
- Rotas sensíveis de usuários, documentos, relatórios e logs repetem a autorização no servidor.
- Webhooks usam comparação de segredo em tempo constante e falham fechados.
- RLS habilitada nas 27 tabelas SIGEC; candidato lê somente seus registros e equipe autorizada lê o conjunto administrativo.
- Bucket de documentos privado, limite de 10 MB e tipos PDF/JPEG/PNG.
- Caminho de arquivo vinculado ao usuário e à candidatura; alteração bloqueada após o prazo, salvo solicitação de informação aberta.
- Candidato não pode marcar o próprio WhatsApp ou perfil como verificado/concluído.
- Até cinco preferências, únicas e ordenadas, validadas na aplicação e no banco.
- Histórico de status, auditoria, consentimentos e outbox idempotente previstos no esquema.
- Observações internas não possuem política de leitura para candidato.

## Prioridade 2 — pendências de endurecimento

1. Ativar MFA obrigatório para administradores e gerentes; revisar sessões, recuperação de senha e política de senhas vazadas.
2. Adicionar varredura antimalware e validação pelo conteúdo real do arquivo, não apenas MIME/extensão. Remover metadados desnecessários das imagens.
3. Definir retenção e descarte: documentos, candidaturas, logs, recursos, backups e arquivos órfãos.
4. Criptografar ou tokenizar CPF em repouso quando a busca exata permitir; evitar CPF, telefone, conteúdo de documento e segredo em logs.
5. Definir resposta a incidente, rotação de chaves, restauração de backup e teste periódico de recuperação.
6. Registrar todas as operações administrativas críticas com ator, alvo, instante e motivo; impedir alteração/remoção desses eventos pela aplicação.
7. Aplicar limitação de taxa também em login, recuperação de senha, upload, recurso e solicitação de novo código de WhatsApp.
8. Fazer testes de autorização negativa: candidato A versus candidato B, atendente versus gerente, conta sem papel, sessão expirada e objeto de storage com caminho forjado.

## Regras de fluxo que evitam inconsistências

- Uma candidatura não avança enquanto existir documento obrigatório pendente ou solicitação de informação aberta.
- `habilitado` significa documentação/requisitos validados; `classificado` significa aprovação; `convocado` significa chamado para ocupar a vaga.
- Toda mudança de status exige motivo público quando afetar o candidato e pode ter nota interna separada.
- Alteração após envio até o encerramento gera versão auditável; depois do prazo, somente campos explicitamente reabertos podem mudar.
- Pontuação continua configurável. A regra dos 30 pontos não deve ser codificada até a definição oficial.

## Gates de liberação

Executar antes de cada publicação:

```powershell
py execution\audit_sigec_security.py supabase\migrations\20260722022016_sigec_processos_foundation.sql
py execution\audit_sigec_app_security.py
npx tsc --noEmit
npm run build
```

A liberação do cadastro exige, além dos comandos acima, testes reais de RLS no projeto de homologação, configuração de CAPTCHA/verificação de contatos, teste do webhook com segredo e teste de idempotência do WhatsApp.
# Credenciais históricas rastreadas — bloqueio de promoção

Em 27/08/2026, o gate de preparação da branch identificou credenciais privilegiadas em `.claude/settings.local.json`, arquivo local que estava rastreado pelo Git. A branch da Fase 0 remove o arquivo do índice e passa a ignorá-lo, preservando a cópia local.

Como os valores podem estar presentes no histórico remoto, a remoção do arquivo não é suficiente para invalidá-los. Antes de integrar o SIGEC na branch principal, devem ser rotacionados os segredos de Supabase, Evolution API e Moodle encontrados nesse arquivo, atualizar somente os ambientes seguros que os consomem e executar novamente os smoke tests das integrações.
