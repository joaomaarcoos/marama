"""Transactional remote checks for noncumulative postgraduate scoring."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    review_sig="public.sigec_review_postgraduate_evidence(uuid,uuid,uuid,uuid,text,text)"; score_sig="public.sigec_get_postgraduate_score(uuid,uuid)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p6-postgrad-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"pg_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato"); other=user("other","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run[:8],16)+7100)%1_000_000_000:09d}"
        for index,person in enumerate((candidate,other)):
            cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,city,state,availability,profile_completed_at) values(%s,%s,%s,'1990-01-01',%s,now(),'São Luís','MA','Manhã',now())""",(person,f"Candidato {index}",valid_cpf(f"{(int(base)+index)%1_000_000_000:09d}"),f"5598{(int(run[1:9],16)+7100+index)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values('Processo pós-graduação',%s,'draft',%s,'p6-postgrad') returning id",(f"sigec-p6-postgrad-{run}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'titulos','Comprovantes de títulos') returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id,application_state,submitted_at) values(%s,%s,%s,'submitted',now()) returning id",(process,candidate,stage)); application=cur.fetchone()[0]
        education={}
        for level in ("especializacao","mestrado","doutorado"):
            cur.execute("insert into public.sigec_candidate_education(candidate_id,level,course_name,institution,completion_date,is_completed) values(%s,%s,%s,'Instituição','2020-01-01',true) returning id",(candidate,level,level.title())); education[level]=cur.fetchone()[0]
        cur.execute("insert into public.sigec_candidate_education(candidate_id,level,course_name,institution,is_completed) values(%s,'doutorado','Doutorado em andamento','Instituição',false) returning id",(candidate,)); incomplete=cur.fetchone()[0]
        cur.execute("insert into public.sigec_candidate_education(candidate_id,level,course_name,institution,completion_date,is_completed) values(%s,'mestrado','Mestrado alheio','Instituição','2020-01-01',true) returning id",(other,)); foreign_education=cur.fetchone()[0]
        def document(version:int,approved:bool):
            cur.execute("""insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine,review_status,reviewed_by,reviewed_at) values(%s,%s,%s,'titulo.pdf','application/pdf',100,%s,%s,'validated','clean',now(),now(),'clamav',%s,case when %s then %s::uuid end,case when %s then now() end) returning id""",(application,requirement,f"{candidate}/{application}/titulo-{version}.pdf",str(version)*64,version,"valid" if approved else "pending",approved,admin,approved)); return cur.fetchone()[0]
        approved=document(1,True); pending=document(2,False)
        # The pending document is a successor, so keep the approved evidence current by removing it.
        cur.execute("update public.sigec_application_documents set removed_at=now(),removed_by=%s where id=%s",(candidate,pending))
        sql_error(cur,"attendant_cannot_review_title","select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(attendant,application,education["especializacao"],approved),"42501")
        sql_error(cur,"candidate_cannot_read_score","select * from public.sigec_get_postgraduate_score(%s,%s)",(candidate,application),"42501")
        sql_error(cur,"foreign_education_rejected","select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(admin,application,foreign_education,approved),"23514")
        sql_error(cur,"incomplete_title_rejected","select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(admin,application,incomplete,approved),"23514")
        sql_error(cur,"unapproved_document_rejected","select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(admin,application,education["especializacao"],pending),"23514")
        sql_error(cur,"eligible_title_rejects_reason","select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible','não deveria')",(admin,application,education["especializacao"],approved),"22023")
        for level,points in (("especializacao",20),("mestrado",25),("doutorado",30)):
            cur.execute("select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(manager,application,education[level],approved)); expect(f"{level}_evidence_approved",bool(cur.fetchone()[0]))
            cur.execute("select points,selected_level,eligible_title_count from public.sigec_get_postgraduate_score(%s,%s)",(admin,application)); expect(f"{level}_selects_highest_only",cur.fetchone()==(points,level,{"especializacao":1,"mestrado":2,"doutorado":3}[level]))
        reason="Documento de doutorado não comprova a conclusão."
        cur.execute("select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'rejected',%s)",(admin,application,education["doutorado"],approved,reason)); expect("doctorate_review_can_be_superseded",bool(cur.fetchone()[0]))
        cur.execute("select points,selected_level,eligible_title_count from public.sigec_get_postgraduate_score(%s,%s)",(manager,application)); expect("rejected_doctorate_falls_back_to_masters",cur.fetchone()==(25,"mestrado",2))
        cur.execute("select count(*),max(version),count(*) filter(where decision='rejected') from public.sigec_postgraduate_evidence_reviews where application_id=%s and education_id=%s",(application,education["doutorado"])); expect("review_history_is_versioned",cur.fetchone()==(2,2,1))
        sql_error(cur,"review_history_is_immutable","update public.sigec_postgraduate_evidence_reviews set public_reason='alterada' where application_id=%s",(application,),"55000")
        cur.execute("select metadata from public.sigec_audit_events where action='postgraduate_evidence_reviewed' and entity_id=%s order by id desc limit 1",(str(application),)); expect("audit_omits_reason_body",reason not in json.dumps(cur.fetchone()[0]))
        cur.execute("select not has_table_privilege('authenticated','public.sigec_postgraduate_evidence_reviews','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(review_sig,review_sig,score_sig,score_sig)); expect("postgraduate_contract_is_server_only",cur.fetchone()==(True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
