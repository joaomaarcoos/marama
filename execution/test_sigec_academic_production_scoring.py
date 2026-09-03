"""Transactional remote checks for academic-production scoring."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    review_sig="public.sigec_review_academic_production(uuid,uuid,uuid,text,text,integer,integer,boolean,boolean,text,text)"; score_sig="public.sigec_get_academic_production_score(uuid,uuid)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str,role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p6-academic-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"ac_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run[:8],16)+7300)%1_000_000_000:09d}"
        cur.execute("insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,city,state,availability,profile_completed_at) values(%s,'Candidato Acadêmico',%s,'1990-01-01',%s,now(),'São Luís','MA','Manhã',now())",(candidate,valid_cpf(base),f"5598{(int(run[1:9],16)+7300)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values('Produção acadêmica',%s,'draft',%s,'p6-academic') returning id",(f"sigec-p6-academic-{run}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial) values(%s,'recebida','Recebida',true) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_document_requirements(process_id,code,label) values(%s,'producao','Comprovante de produção') returning id",(process,)); requirement=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id,application_state,submitted_at) values(%s,%s,%s,'submitted',now()) returning id",(process,candidate,stage)); application=cur.fetchone()[0]
        def document(index:int,approved=True):
            cur.execute("""insert into public.sigec_application_documents(application_id,requirement_id,storage_path,original_name,mime_type,size_bytes,sha256,version,technical_status,malware_status,sanitized_at,malware_scanned_at,malware_engine,review_status,reviewed_by,reviewed_at)
            values(%s,%s,%s,'comprovante.pdf','application/pdf',100,%s,%s,'validated','clean',now(),now(),'clamav',%s,case when %s then %s::uuid end,case when %s then now() end) returning id""",(application,requirement,f"{candidate}/{application}/academic-{index}.pdf",f"{index:x}"*64,index,'valid' if approved else 'pending',approved,admin,approved)); return cur.fetchone()[0]
        docs=[document(i) for i in range(1,9)]; pending_doc=document(9,False)
        review_sql="select public.sigec_review_academic_production(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
        def review(doc,category,quantity=1,hours=None,actor=manager,decision='eligible',relevant=True,mandatory=False,public=None,internal='Comprovante conferido e relacionado à vaga.'):
            cur.execute(review_sql,(actor,application,doc,decision,category,quantity,hours,relevant,mandatory,public,internal)); return cur.fetchone()[0]
        def score():
            cur.execute("select points,breakdown,eligible_evidence_count from public.sigec_get_academic_production_score(%s,%s)",(admin,application)); return cur.fetchone()
        expect("article_item_capped_at_10",bool(review(docs[0],'scientific_article',3)) and score()==(10,{'scientific_article':10},1))
        expect("article_category_capped_at_10",bool(review(docs[1],'scientific_article',1)) and score()==(10,{'scientific_article':10},2))
        expect("book_category_capped_at_5",bool(review(docs[2],'book_or_chapter',9)) and score()[0]==15)
        expect("technical_category_capped_at_6",bool(review(docs[3],'technical_material',5)) and score()[0]==21)
        expect("presentation_category_capped_at_4",bool(review(docs[4],'event_presentation',9)) and score()[0]==25)
        total=review(docs[5],'continuing_education',1,119); points,breakdown,count=score()
        expect("continuing_education_uses_full_20_hour_blocks",bool(total) and points==30 and breakdown=={'scientific_article':10,'book_or_chapter':5,'technical_material':6,'event_presentation':4,'continuing_education':5} and count==6)
        expect("global_score_remains_capped_at_30",bool(review(docs[6],'continuing_education',1,1000)) and score()[0]==30)
        sql_error(cur,"attendant_cannot_review","select public.sigec_review_academic_production(%s,%s,%s,'eligible','scientific_article',1,null,true,false,null,'Conferido')",(attendant,application,docs[7]),"42501")
        sql_error(cur,"candidate_cannot_read_score","select * from public.sigec_get_academic_production_score(%s,%s)",(candidate,application),"42501")
        sql_error(cur,"relevance_is_required",review_sql,(admin,application,docs[7],'eligible','scientific_article',1,None,False,False,None,'Sem pertinência'),"22023")
        sql_error(cur,"mandatory_requirement_cannot_score",review_sql,(admin,application,docs[7],'eligible','scientific_article',1,None,True,True,None,'Usado como requisito'),"22023")
        sql_error(cur,"approved_document_is_required",review_sql,(admin,application,pending_doc,'eligible','scientific_article',1,None,True,False,None,'Conferido'),"23514")
        sql_error(cur,"formation_requires_20_hours_for_points",review_sql,(admin,application,docs[7],'eligible','continuing_education',1,19,True,False,None,'Carga conferida'),"22023")
        sql_error(cur,"internal_rationale_is_required",review_sql,(admin,application,docs[7],'eligible','scientific_article',1,None,True,False,None,''),"22023")
        reason="O documento não comprova a autoria informada."
        expect("review_can_be_superseded",bool(review(docs[0],'scientific_article',decision='rejected',relevant=False,public=reason,internal='Autoria não localizada.')))
        expect("rejected_document_is_removed_from_score",score()[0]==25)
        expect("same_document_can_be_reclassified_without_double_count",bool(review(docs[0],'book_or_chapter',internal='Reclassificado como capítulo.')) and score()==(25,{'scientific_article':5,'book_or_chapter':5,'technical_material':6,'event_presentation':4,'continuing_education':5},7))
        cur.execute("select count(*),max(version) from public.sigec_academic_production_reviews where application_id=%s and document_id=%s",(application,docs[0])); expect("review_history_is_versioned",cur.fetchone()==(3,3))
        sql_error(cur,"review_history_is_immutable","update public.sigec_academic_production_reviews set internal_rationale='alterada' where application_id=%s",(application,),"55000")
        cur.execute("select metadata from public.sigec_audit_events where action='academic_production_reviewed' and entity_id=%s order by id desc limit 1",(str(application),)); serialized=json.dumps(cur.fetchone()[0]); expect("audit_omits_reason_bodies",reason not in serialized and 'Reclassificado' not in serialized)
        cur.execute("select not has_table_privilege('authenticated','public.sigec_academic_production_reviews','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(review_sig,review_sig,score_sig,score_sig)); expect("academic_contract_is_server_only",cur.fetchone()==(True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
