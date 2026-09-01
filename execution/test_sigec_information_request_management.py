"""Transactional remote checks for administrative SIGEC diligence management."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from psycopg2.extras import Json
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    create_signature="public.sigec_create_information_request(uuid,uuid,text,jsonb,timestamp with time zone)"
    close_signature="public.sigec_close_information_request(uuid,uuid,text,text)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p5-diligence-{label}-{run_id}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"diligence_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    create_sql="select public.sigec_create_information_request(%s,%s,%s,%s,now()+interval '2 days')"
    close_sql="select public.sigec_close_information_request(%s,%s,%s,%s)"
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run_id[:8],16)+3400)%1_000_000_000:09d}"
        cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,'Candidato Diligência',%s,'1990-01-01',%s,now(),'65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",(candidate,valid_cpf(base),f"5598{(int(run_id[1:9],16)+3400)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,published_at,applications_open_at,applications_close_at,created_by,edital_version) values('Processo diligência',%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s,'p5-diligence') returning id",(f"sigec-p5-diligence-{run_id}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_questions(process_id,code,label,question_type) values(%s,'complemento','Informe o complemento','short_text') returning id",(process,)); question=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'comprovante','Comprovante adicional') returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id) values(%s,%s,%s) returning id",(process,candidate,stage)); application=cur.fetchone()[0]
        fields=Json([{"kind":"question","id":str(question)},{"kind":"document","id":str(requirement)}])
        sql_error(cur,"draft_application_blocked",create_sql,(admin,application,"Envie as informações solicitadas.",fields),"23514")
        cur.execute("update public.sigec_applications set application_state='submitted',submitted_at=now() where id=%s",(application,))
        sql_error(cur,"missing_submission_snapshot_blocked",create_sql,(admin,application,"Envie as informações solicitadas.",fields),"23514")
        cur.execute("insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at) values(%s,1,%s,'p5-diligence','{}',%s,now())",(application,f"SIGEC-2026-{run_id.upper()}","a"*64))
        sql_error(cur,"candidate_actor_rejected",create_sql,(candidate,application,"Envie as informações solicitadas.",fields),"42501")
        sql_error(cur,"attendant_actor_rejected",create_sql,(attendant,application,"Envie as informações solicitadas.",fields),"42501")
        sql_error(cur,"deadline_is_bounded","select public.sigec_create_information_request(%s,%s,'Prazo inválido',%s,now()+interval '366 days')",(admin,application,fields),"22023")
        cur.execute(create_sql,(manager,application,"Envie as informações solicitadas.",fields)); request_one=cur.fetchone()[0]; expect("manager_creates_scoped_request",bool(request_one))
        cur.execute("select status,jsonb_array_length(requested_fields),requested_by,due_at>now() from public.sigec_information_requests where id=%s",(request_one,)); expect("request_is_open_with_exact_scope",cur.fetchone()==("open",2,manager,True))
        sql_error(cur,"one_active_request_per_application",create_sql,(admin,application,"Outro pedido simultâneo.",fields),"23505")
        sql_error(cur,"open_request_cannot_be_accepted",close_sql,(admin,request_one,"accepted","Respostas conferidas."),"23514")
        cur.execute(close_sql,(admin,request_one,"canceled","Solicitação cancelada pela equipe.")); expect("admin_cancels_open_request",cur.fetchone()[0]=="canceled")
        cur.execute("select status,closed_by,closed_at is not null,resolution_message from public.sigec_information_requests where id=%s",(request_one,)); expect("cancellation_records_actor_and_message",cur.fetchone()==("canceled",admin,True,"Solicitação cancelada pela equipe."))
        cur.execute(create_sql,(admin,application,"Confirme novamente os dados.",Json([{"kind":"question","id":str(question)}]))); request_two=cur.fetchone()[0]; expect("new_request_allowed_after_close",bool(request_two))
        cur.execute("update public.sigec_information_requests set status='answered',answered_at=now(),updated_at=now() where id=%s",(request_two,))
        cur.execute(close_sql,(manager,request_two,"accepted","Informações recebidas e conferidas.")); expect("manager_accepts_answered_request",cur.fetchone()[0]=="accepted")
        cur.execute("select status,closed_by,closed_at is not null from public.sigec_information_requests where id=%s",(request_two,)); expect("acceptance_closes_request",cur.fetchone()==("accepted",manager,True))
        cur.execute("select action,metadata from public.sigec_audit_events where entity_id in (%s,%s) and action like 'information_request_%%' order by id",(str(request_one),str(request_two))); events=cur.fetchall(); serialized=json.dumps(events,default=str); expect("management_actions_are_audited_without_message_body",len(events)==4 and "Envie as informações" not in serialized and "Informações recebidas" not in serialized)
        sql_error(cur,"closed_request_is_immutable_to_workflow",close_sql,(admin,request_two,"canceled","Não pode reabrir ou fechar novamente."),"23514")
        cur.execute("""select not has_table_privilege('authenticated','public.sigec_information_requests','INSERT,UPDATE,DELETE'),not has_function_privilege('anon',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('anon',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')""",(create_signature,create_signature,create_signature,close_signature,close_signature,close_signature)); expect("management_contract_is_server_only",cur.fetchone()==(True,True,True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
