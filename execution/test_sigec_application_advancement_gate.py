"""Transactional remote checks for the SIGEC administrative advancement gate."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from psycopg2.extras import Json
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    readiness_sig="public.sigec_get_application_advancement_readiness(uuid,uuid)"; advance_sig="public.sigec_advance_application_stage(uuid,uuid,uuid,text)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str, role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p5-advance-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"advance_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run[:8],16)+5100)%1_000_000_000:09d}"
        cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,'Candidato Avanço',%s,'1990-01-01',%s,now(),'65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",(candidate,valid_cpf(base),f"5598{(int(run[1:9],16)+5100)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,published_at,created_by,edital_version) values('Processo avanço',%s,'open',now(),%s,'p5-advance') returning id",(f"sigec-p5-advance-{run}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0) returning id",(process,)); received=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,position) values(%s,'habilitada','Habilitada',1) returning id",(process,)); enabled=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,position) values(%s,'outra','Outra',2) returning id",(process,)); other_stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stage_transitions(process_id,from_stage_id,to_stage_id,blocks_on_pending) values(%s,%s,%s,true)",(process,received,enabled))
        cur.execute("insert into public.sigec_process_questions(process_id,code,label,question_type) values(%s,'confirmacao','Confirme a informação','short_text') returning id",(process,)); question=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label,required) values(%s,'obrigatorio','Documento obrigatório',true) returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id) values(%s,%s,%s) returning id",(process,candidate,received)); application=cur.fetchone()[0]
        sql_error(cur,"candidate_cannot_read_gate","select * from public.sigec_get_application_advancement_readiness(%s,%s)",(candidate,application),"42501")
        sql_error(cur,"attendant_cannot_advance","select public.sigec_advance_application_stage(%s,%s,%s,'Avanço solicitado')",(attendant,application,enabled),"42501")
        cur.execute("select * from public.sigec_get_application_advancement_readiness(%s,%s)",(admin,application)); expect("draft_application_not_ready",cur.fetchone()==(False,1,0))
        cur.execute("update public.sigec_applications set application_state='submitted',submitted_at=now() where id=%s",(application,)); cur.execute("insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at) values(%s,1,%s,'p5-advance','{}',%s,now())",(application,f"SIGEC-2026-{run.upper()}","a"*64))
        sql_error(cur,"missing_required_document_blocks","select public.sigec_advance_application_stage(%s,%s,%s,'Documentos conferidos')",(admin,application,enabled),"23514")
        path=f"{candidate}/{application}/{uuid.uuid4()}.pdf"; cur.execute("""insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine) values(%s,%s,%s,'documento.pdf','application/pdf',10,%s,'validated','clean',now(),now(),'clamav') returning id""",(application,requirement,path,"b"*64)); document=cur.fetchone()[0]
        sql_error(cur,"pending_document_blocks","select public.sigec_advance_application_stage(%s,%s,%s,'Documentos conferidos')",(admin,application,enabled),"23514")
        cur.execute("select * from public.sigec_review_application_document(%s,%s,'rejected','Documento ilegível',null)",(manager,document)); sql_error(cur,"rejected_document_blocks","select public.sigec_advance_application_stage(%s,%s,%s,'Documentos conferidos')",(admin,application,enabled),"23514")
        cur.execute("select * from public.sigec_review_application_document(%s,%s,'valid',null,'Conferência interna')",(manager,document))
        cur.execute("select public.sigec_create_information_request(%s,%s,'Confirme a informação solicitada',%s,now()+interval '1 day')",(admin,application,Json([{"kind":"question","id":str(question)}]))); request=cur.fetchone()[0]
        sql_error(cur,"open_diligence_blocks","select public.sigec_advance_application_stage(%s,%s,%s,'Documentos conferidos')",(admin,application,enabled),"23514")
        cur.execute("update public.sigec_information_requests set status='answered',answered_at=now() where id=%s",(request,)); sql_error(cur,"answered_diligence_blocks_until_acceptance","select public.sigec_advance_application_stage(%s,%s,%s,'Documentos conferidos')",(admin,application,enabled),"23514")
        cur.execute("select public.sigec_close_information_request(%s,%s,'accepted','Resposta conferida e aceita')",(manager,request)); cur.execute("select * from public.sigec_get_application_advancement_readiness(%s,%s)",(manager,application)); expect("accepted_diligence_releases_gate",cur.fetchone()==(True,0,0))
        sql_error(cur,"unconfigured_transition_rejected","select public.sigec_advance_application_stage(%s,%s,%s,'Destino inválido')",(admin,application,other_stage),"23514")
        cur.execute("select public.sigec_advance_application_stage(%s,%s,%s,'Documentos e informações conferidos')",(manager,application,enabled)); expect("manager_advances_application",cur.fetchone()[0]==enabled)
        cur.execute("select stage_id from public.sigec_applications where id=%s",(application,)); expect("stage_changed_atomically",cur.fetchone()[0]==enabled)
        cur.execute("select from_stage_id,to_stage_id,public_message,changed_by from public.sigec_application_status_history where application_id=%s order by id desc limit 1",(application,)); expect("history_identifies_reason_and_actor",cur.fetchone()==(received,enabled,"Documentos e informações conferidos",manager))
        cur.execute("select metadata from public.sigec_audit_events where action='application_stage_advanced' and entity_id=%s",(str(application),)); metadata=cur.fetchone()[0]; expect("audit_identifies_version_and_changed_fields",metadata["submissionVersion"]==1 and metadata["changedFields"]==["stage_id"])
        cur.execute("select not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(readiness_sig,readiness_sig,advance_sig,advance_sig)); expect("advancement_contract_is_server_only",cur.fetchone()==(True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
