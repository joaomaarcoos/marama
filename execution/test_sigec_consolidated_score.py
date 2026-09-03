"""Transactional remote checks for consolidated SIGEC score snapshots."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None; signature="public.sigec_recalculate_application_score(uuid,uuid)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p6-total-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"total_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor(); base=f"{(int(run[:8],16)+7400)%1_000_000_000:09d}"
        cur.execute("insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,city,state,availability,profile_completed_at) values(%s,'Candidato Nota Total',%s,'1990-01-01',%s,now(),'São Luís','MA','Manhã',now())",(candidate,valid_cpf(base),f"5598{(int(run[1:9],16)+7400)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values('Nota consolidada',%s,'draft',%s,'p6-total') returning id",(f"sigec-p6-total-{run}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'pontuacao','Comprovantes') returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id,application_state,submitted_at) values(%s,%s,%s,'submitted','2025-01-01 12:00:00+00') returning id",(process,candidate,stage)); application=cur.fetchone()[0]
        def document(index:int):
            cur.execute("insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine,review_status,reviewed_by,reviewed_at) values(%s,%s,%s,'prova.pdf','application/pdf',100,%s,%s,'validated','clean',now(),now(),'clamav','valid',%s,now()) returning id",(application,requirement,f"{candidate}/{application}/score-{index}.pdf",f"{index:x}"*64,index,admin)); return cur.fetchone()[0]
        docs=[document(i) for i in range(1,8)]
        cur.execute("insert into public.sigec_candidate_education(candidate_id,level,course_name,institution,completion_date,is_completed) values(%s,'doutorado','Doutorado','Instituição','2020-01-01',true) returning id",(candidate,)); education=cur.fetchone()[0]
        cur.execute("select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'eligible',null)",(admin,application,education,docs[0])); cur.fetchone()
        cur.execute("insert into public.sigec_candidate_experience(candidate_id,employment_type,institution,role_title,starts_on,ends_on,is_teaching) values(%s,'outro','Instituição','Professor','2010-01-01','2014-01-09',true) returning id",(candidate,)); experience=cur.fetchone()[0]
        cur.execute("select public.sigec_review_experience_evidence(%s,%s,%s,%s,'eligible',null)",(manager,application,experience,docs[1])); cur.fetchone()
        academic=(('scientific_article',2,None),('book_or_chapter',1,None),('technical_material',2,None),('event_presentation',2,None),('continuing_education',1,100))
        for doc,(category,quantity,hours) in zip(docs[2:],academic):
            cur.execute("select public.sigec_review_academic_production(%s,%s,%s,'eligible',%s,%s,%s,true,false,null,'Comprovante conferido')",(admin,application,doc,category,quantity,hours)); cur.fetchone()
        cur.execute("select public.sigec_recalculate_application_score(%s,%s)",(manager,application)); first=cur.fetchone()[0]; expect("maximum_components_consolidate_to_100",bool(first))
        cur.execute("select version,algorithm_version,postgraduate_points,experience_points,academic_points,total_points,component_details from public.sigec_application_score_snapshots where id=%s",(first,)); row=cur.fetchone(); expect("snapshot_preserves_components_and_algorithm",row[:6]==(1,'sigec-score-v1',30,40,30,100) and row[6]['experience']['months']==49)
        cur.execute("select score_total from public.sigec_applications where id=%s",(application,)); expect("application_total_updates_atomically",cur.fetchone()[0]==100)
        sql_error(cur,"application_total_constraint_blocks_above_100","update public.sigec_applications set score_total=101 where id=%s",(application,),"23514")
        sql_error(cur,"attendant_cannot_recalculate","select public.sigec_recalculate_application_score(%s,%s)",(attendant,application),"42501")
        sql_error(cur,"candidate_cannot_recalculate","select public.sigec_recalculate_application_score(%s,%s)",(candidate,application),"42501")
        cur.execute("select public.sigec_review_postgraduate_evidence(%s,%s,%s,%s,'rejected','Título não confirmado.')",(admin,application,education,docs[0])); cur.fetchone()
        cur.execute("select public.sigec_recalculate_application_score(%s,%s)",(admin,application)); second=cur.fetchone()[0]
        cur.execute("select version,total_points,supersedes_snapshot_id from public.sigec_application_score_snapshots where id=%s",(second,)); expect("recalculation_creates_chained_version",cur.fetchone()==(2,70,first))
        cur.execute("select score_total from public.sigec_applications where id=%s",(application,)); expect("latest_total_replaces_operational_score",cur.fetchone()[0]==70)
        sql_error(cur,"score_snapshots_are_immutable","delete from public.sigec_application_score_snapshots where id=%s",(first,),"55000")
        cur.execute("select metadata from public.sigec_audit_events where action='application_score_recalculated' and entity_id=%s order by id",(str(application),)); events=cur.fetchall(); expect("score_recalculation_is_audited",len(events)==2 and events[-1][0]['totalPoints']==70)
        cur.execute("select not has_table_privilege('authenticated','public.sigec_application_score_snapshots','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(signature,signature)); expect("consolidated_score_contract_is_server_only",cur.fetchone()==(True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
