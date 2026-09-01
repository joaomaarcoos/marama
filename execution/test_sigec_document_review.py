"""Transactional remote checks for the SIGEC document review workflow."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    signature="public.sigec_review_application_document(uuid,uuid,text,text,text)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p5-review-{label}-{run_id}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def error(cur:Any,name:str,actor:str,document:str,decision:str,reason:Any,note:Any,code:str):
        save=f"review_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute("select * from public.sigec_review_application_document(%s,%s,%s,%s,%s)",(actor,document,decision,reason,note))
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run_id[:8],16)+2600)%1_000_000_000:09d}"
        cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,'Candidato Revisão',%s,'1990-01-01',%s,now(),'65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",(candidate,valid_cpf(base),f"5598{(int(run_id[1:9],16)+2600)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,published_at,applications_open_at,applications_close_at,created_by,edital_version) values('Processo revisão',%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s,'p5-review') returning id",(f"sigec-p5-review-{run_id}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'diploma','Diploma') returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id) values(%s,%s,%s) returning id",(process,candidate,stage)); application=cur.fetchone()[0]
        def document(version:int,status="clean",technical="validated",supersedes=None):
            cur.execute("""insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine,supersedes_document_id) values(%s,%s,%s,'privado.pdf','application/pdf',100,%s,%s,%s,%s,case when %s='validated' then now() end,case when %s<>'pending' then now() end,case when %s<>'pending' then 'clamav' end,%s) returning id""",(application,requirement,f"{candidate}/{application}/review-{version}.pdf",str(version)*64,version,technical,status,technical,status,status,supersedes)); return cur.fetchone()[0]
        previous=document(1); current=document(2,supersedes=previous)
        dirty=document(3,status="pending",technical="pending",supersedes=current)
        error(cur,"draft_application_blocked",admin,dirty,"rejected","Arquivo inválido",None,"23514")
        cur.execute("update public.sigec_applications set application_state='submitted',submitted_at=now() where id=%s",(application,))
        error(cur,"previous_version_blocked",admin,previous,"rejected","Arquivo inválido",None,"23514")
        error(cur,"unclean_document_blocked",admin,dirty,"rejected","Arquivo inválido",None,"23514")
        # Remove the pending successor so version 2 is current and reviewable.
        cur.execute("update public.sigec_application_documents set removed_at=now(),removed_by=%s where id=%s",(candidate,dirty))
        error(cur,"rejection_requires_public_reason",admin,current,"rejected","",None,"22023")
        error(cur,"approval_rejects_public_reason",admin,current,"valid","Não deveria existir",None,"22023")
        error(cur,"candidate_actor_rejected",candidate,current,"valid",None,None,"42501")
        error(cur,"attendant_actor_rejected",attendant,current,"valid",None,None,"42501")
        cur.execute("select * from public.sigec_review_application_document(%s,%s,'rejected','Diploma ilegível. Envie uma cópia nítida.','Conferir frente e verso no novo envio.')",(manager,current)); expect("manager_rejects_current_clean_document",cur.fetchone()[0]=="rejected")
        cur.execute("select review_status,review_message,reviewed_by,reviewed_at is not null from public.sigec_application_documents where id=%s",(current,)); expect("public_rejection_persisted",cur.fetchone()==("rejected","Diploma ilegível. Envie uma cópia nítida.",manager,True))
        cur.execute("select decision,public_reason,internal_note,reviewed_by from public.sigec_document_reviews where document_id=%s",(current,)); expect("public_and_internal_notes_are_separate",cur.fetchone()==("rejected","Diploma ilegível. Envie uma cópia nítida.","Conferir frente e verso no novo envio.",manager))
        cur.execute("select metadata from public.sigec_audit_events where action='application_document_reviewed' and entity_id=%s order by id desc limit 1",(str(current),)); metadata=cur.fetchone()[0]; expect("audit_omits_note_contents",metadata.get("hasPublicReason") is True and metadata.get("hasInternalNote") is True and "Diploma" not in json.dumps(metadata))
        cur.execute("select * from public.sigec_review_application_document(%s,%s,'valid',null,'Segunda conferência concluída.')",(admin,current)); expect("admin_can_approve_after_review",cur.fetchone()[0]=="valid")
        cur.execute("select review_status,review_message,count(*) over() from public.sigec_application_documents document join public.sigec_document_reviews review on review.document_id=document.id where document.id=%s limit 1",(current,)); expect("approval_clears_public_reason_and_preserves_history",cur.fetchone()==("valid",None,2))
        save="immutable"; cur.execute(f"savepoint {save}")
        try: cur.execute("update public.sigec_document_reviews set internal_note='alterada' where document_id=%s",(current,))
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect("review_history_is_immutable",exc.pgcode=="55000")
        else: raise AssertionError("review_history_is_immutable")
        cur.execute("""select not has_table_privilege('authenticated','public.sigec_document_reviews','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('anon',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not (select prosecdef from pg_proc where oid=%s::regprocedure)""",(signature,signature,signature,signature)); expect("review_contract_is_server_only",cur.fetchone()==(True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
