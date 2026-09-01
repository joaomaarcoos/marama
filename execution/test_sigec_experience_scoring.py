"""Transactional remote checks for teaching-experience band scoring."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    review_sig="public.sigec_review_experience_evidence(uuid,uuid,uuid,uuid,text,text)"; score_sig="public.sigec_get_experience_score(uuid,uuid)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p6-experience-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"ex_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato"); other=user("other","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run[:8],16)+7200)%1_000_000_000:09d}"
        for index,person in enumerate((candidate,other)):
            cur.execute("insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,city,state,availability,profile_completed_at) values(%s,%s,%s,'1990-01-01',%s,now(),'São Luís','MA','Manhã',now())",(person,f"Candidato {index}",valid_cpf(f"{(int(base)+index)%1_000_000_000:09d}"),f"5598{(int(run[1:9],16)+7200+index)%1_000_000_000:09d}"))
        def experience(days:int,teaching=True,owner=candidate,start="2010-01-01"):
            cur.execute("insert into public.sigec_candidate_experience(candidate_id,employment_type,institution,role_title,starts_on,ends_on,is_teaching) values(%s,'outro','Instituição','Professor',%s::date,%s::date + (%s - 1),%s) returning id",(owner,start,start,days,teaching)); return cur.fetchone()[0]
        def application(label:str):
            cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values(%s,%s,'draft',%s,'p6-experience') returning id",(f"Experiência {label}",f"sigec-p6-experience-{label}-{run}",manager)); process=cur.fetchone()[0]
            cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
            cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'experiencia','Comprovante de experiência') returning id",(process,)); requirement=cur.fetchone()[0]
            cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id,application_state,submitted_at) values(%s,%s,%s,'submitted','2025-01-01 12:00:00+00') returning id",(process,candidate,stage)); app=cur.fetchone()[0]
            cur.execute("insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine,review_status,reviewed_by,reviewed_at) values(%s,%s,%s,'experiencia.pdf','application/pdf',100,%s,1,'validated','clean',now(),now(),'clamav','valid',%s,now()) returning id",(app,requirement,f"{candidate}/{app}/experiencia.pdf",uuid.uuid4().hex*2,admin)); return app,cur.fetchone()[0]
        empty_app,_=application("empty")
        cur.execute("select * from public.sigec_get_experience_score(%s,%s)",(admin,empty_app)); expect("no_experience_scores_zero",cur.fetchone()==(0,0,0,0,0))
        cases=((30,1,5),(360,12,5),(390,13,10),(750,25,20),(1110,37,30),(1470,49,40),(2400,80,40))
        first=None
        for days,months,points in cases:
            app,document=application(str(days)); exp=experience(days)
            if first is None: first=(app,document,exp)
            cur.execute("select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(manager,app,exp,document)); expect(f"review_{days}_days",bool(cur.fetchone()[0]))
            cur.execute("select total_unique_days,total_months,remaining_days,points,eligible_experience_count from public.sigec_get_experience_score(%s,%s)",(admin,app)); expect(f"band_{months}_months_is_{points}",cur.fetchone()==(days,months,0,points,1))
        overlap_app,overlap_doc=application("overlap"); exp_a=experience(300,start="2012-01-01"); exp_b=experience(300,start="2012-06-29")
        for exp in (exp_a,exp_b): cur.execute("select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(admin,overlap_app,exp,overlap_doc)); cur.fetchone()
        cur.execute("select * from public.sigec_get_experience_score(%s,%s)",(manager,overlap_app)); expect("overlapping_periods_count_once",cur.fetchone()==(480,16,0,10,2))
        app,document,exp=first
        sql_error(cur,"attendant_cannot_review_experience","select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(attendant,app,exp,document),"42501")
        sql_error(cur,"candidate_cannot_read_experience_score","select * from public.sigec_get_experience_score(%s,%s)",(candidate,app),"42501")
        foreign=experience(30,owner=other); nonteaching=experience(30,teaching=False)
        sql_error(cur,"foreign_experience_rejected","select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(admin,app,foreign,document),"23514")
        sql_error(cur,"nonteaching_experience_rejected","select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(admin,app,nonteaching,document),"23514")
        reason="O comprovante não confirma o período informado."
        cur.execute("select public.sigec_review_experience_evidence(%s,%s,%s,%s,'rejected',%s)",(admin,app,exp,document,reason)); expect("experience_review_can_be_superseded",bool(cur.fetchone()[0]))
        cur.execute("select * from public.sigec_get_experience_score(%s,%s)",(manager,app)); expect("rejection_removes_experience_points",cur.fetchone()==(0,0,0,0,0))
        sql_error(cur,"experience_history_is_immutable","update public.sigec_experience_evidence_reviews set public_reason='alterada' where application_id=%s",(app,),"55000")
        cur.execute("select metadata from public.sigec_audit_events where action='experience_evidence_reviewed' and entity_id=%s order by id desc limit 1",(str(app),)); expect("experience_audit_omits_reason",reason not in json.dumps(cur.fetchone()[0]))
        cur.execute("select not has_table_privilege('authenticated','public.sigec_experience_evidence_reviews','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(review_sig,review_sig,score_sig,score_sig)); expect("experience_scoring_is_server_only",cur.fetchone()==(True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
