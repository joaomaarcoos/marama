# Moodle WebService — Funções Disponíveis

Token configurado em `MOODLE_WSTOKEN`. Endpoint base: `MOODLE_URL/webservice/rest/server.php?wstoken=...&moodlewsrestformat=json&wsfunction=...`

Todas as funções abaixo estão **ativadas** no token de serviço do projeto.

---

## Funções de Autenticação e Usuário

### `core_auth_request_password_reset`
Inicia o processo de redefinição de senha via email para o usuário.  
**Params:** `username` (string), `email` (string)  
**Uso:** Quando o aluno esqueceu a senha e quer receber um link de reset no email cadastrado.  
**Obs:** Depende do Moodle ter email configurado (SMTP). Não retorna a nova senha.

### `core_user_get_users`
Busca usuários por filtros genéricos.  
**Params:** `criteria[0][key]` (campo), `criteria[0][value]` (valor)  
Campos aceitos: `email`, `username`, `lastname`, `firstname`, `idnumber`, `phone1`, etc.  
**Uso:** Quando precisa encontrar múltiplos usuários por um campo não-único.

### `core_user_get_users_by_field`
Busca usuário por campo único — mais eficiente que `get_users`.  
**Params:** `field` (string), `values[0]` (valor)  
**Uso:** Localizar aluno por `email`, `id`, `username`, `idnumber`. Preferir esta quando o campo é único.

### `core_user_update_users`
Atualiza dados cadastrais de um ou mais usuários.  
**Params:** `users[0][id]` (moodle_id), + campos a atualizar (`password`, `firstname`, `lastname`, `email`, etc.)  
**Uso:** Trocar senha de um aluno diretamente pelo servidor. Não requer confirmação por email.  
**Obs:** A resposta pode conter `warnings[]` — sempre checar. Requer permissão de admin no token.

### `core_webservice_get_site_info`
Retorna informações do site Moodle e do token utilizado.  
**Params:** nenhum  
**Uso:** Validar se o token está ativo, obter `userid` do usuário do token, listar funções permitidas.

---

## Funções de Matrícula e Cursos

### `core_enrol_get_enrolled_users`
Lista todos os usuários matriculados em um curso.  
**Params:** `courseid` (number)  
**Retorna:** Array de usuários com `id`, `fullname`, `email`, `username`, `roles[]`, `lastcourseaccess`, `enrolledcourses[]`  
**Uso:** Obter lista de alunos de um curso (filtrar `roles[].shortname === 'student'`). Obter tutores/professores (filtrar papéis não-aluno).

### `core_enrol_get_users_courses`
Lista os cursos em que um usuário está matriculado.  
**Params:** `userid` (number)  
**Retorna:** Array de cursos com `id`, `fullname`, `shortname`, `startdate`, `enddate`, `visible` (1=ativo, 0=suspenso)  
**Uso:** Ver matrícula e datas de um aluno específico. Campo `visible` indica se está ativo ou suspenso.

### `core_course_get_courses_by_field`
Busca cursos por campo específico.  
**Params:** `field` (string: `id`, `shortname`, `idnumber`, `category`), `value` (string)  
**Retorna:** Array de cursos com metadados completos  
**Uso:** Encontrar um curso pelo shortname ou ID para enriquecer dados exibidos ao aluno.

### `core_course_get_contents`
Retorna a estrutura completa do curso (seções, módulos, atividades, recursos).  
**Params:** `courseid` (number)  
**Retorna:** Array de seções, cada uma com `modules[]` (atividades, recursos, etc.)  
**Uso:** Listar conteúdo do curso, nomes das atividades, URLs de recursos. Base para navegação de módulos.

### `core_course_get_course_module`
Busca detalhes de um módulo específico pelo `cmid` (course module ID).  
**Params:** `cmid` (number)  
**Retorna:** `cm` com `id`, `course`, `module`, `name`, `modname`, `instance`, `visible`, etc.  
**Uso:** Quando já se tem o `cmid` de uma atividade e quer os detalhes completos.

### `core_course_get_course_module_by_instance`
Busca um módulo pelo tipo e ID da instância.  
**Params:** `module` (string: `quiz`, `assign`, `forum`, etc.), `instance` (number: ID da instância)  
**Uso:** Útil quando se sabe que é um quiz ou tarefa e tem o ID da instância, mas não o cmid.

---

## Funções de Conclusão e Progresso

### `core_completion_get_course_completion_status`
Status de conclusão geral do curso para um aluno.  
**Params:** `courseid` (number), `userid` (number)  
**Retorna:** `completionstatus` com `completed` (bool) e `timecompleted` (unix timestamp)  
**Uso:** Saber se o aluno já concluiu o curso (pré-requisito para emissão de certificado).

### `core_completion_get_activities_completion_status`
Status de conclusão de cada atividade no curso.  
**Params:** `courseid` (number), `userid` (number)  
**Retorna:** `statuses[]` com `cmid`, `modname`, `name`, `state` (0=não concluído, 1=concluído), `timecompleted`, `tracking`  
**Uso:** Mostrar progresso detalhado por atividade ("você concluiu X de Y atividades").

---

## Funções de Notas

### `gradereport_overview_get_course_grades`
Nota final do aluno em cada curso (visão geral).  
**Params:** `userid` (number)  
**Retorna:** `grades[]` com `courseid`, `grade` (string formatada), `rawgrade`  
**Uso:** Resposta rápida sobre desempenho geral — "qual minha média no curso X?".

### `gradereport_user_get_grade_items`
Lista completa de itens de nota de um usuário em um curso específico.  
**Params:** `courseid` (number), `userid` (number)  
**Retorna:** `usergrades[0].gradeitems[]` com `itemname`, `itemtype` (`course`/`category`/`mod`), `itemmodule` (`quiz`/`assign`/`forum`), `graderaw`, `grademin`, `grademax`, `gradeformatted`, `percentageformatted`, `feedback`  
**Uso:** Notas detalhadas por atividade — "qual minha nota no Quiz 1?", "passei na tarefa final?".  
**Obs:** Filtrar `itemtype !== 'course'` para excluir a linha de nota total. Filtrar `itemtype !== 'category'` para excluir subcategorias.

---

## Referência rápida — por caso de uso

| Caso de uso | Função |
|---|---|
| Localizar aluno por email/username | `core_user_get_users_by_field` |
| Trocar senha de aluno | `core_user_update_users` |
| Enviar email de reset de senha | `core_auth_request_password_reset` |
| Listar cursos do aluno + status | `core_enrol_get_users_courses` |
| Listar alunos de um curso | `core_enrol_get_enrolled_users` |
| Nota geral por curso | `gradereport_overview_get_course_grades` |
| Nota por atividade (quiz, tarefa...) | `gradereport_user_get_grade_items` |
| Curso concluído? (certificado) | `core_completion_get_course_completion_status` |
| Progresso por atividade | `core_completion_get_activities_completion_status` |
| Estrutura e conteúdo de um curso | `core_course_get_contents` |
| Detalhes de uma atividade pelo cmid | `core_course_get_course_module` |
| Validar token do webservice | `core_webservice_get_site_info` |
