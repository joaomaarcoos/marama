"""Transactional remote checks for the paginated SIGEC review queue."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from psycopg2.extras import Json
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env = load_env(); api = Api(env["NEXT_PUBLIC_SUPABASE_URL"], env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], env["SUPABASE_SERVICE_ROLE_KEY"])
    run_id = uuid.uuid4().hex[:12]; password = f"Sg!{secrets.token_urlsafe(24)}9z"; users: list[str] = []; checks: list[str] = []; connection = None
    signature = "public.sigec_list_applications_for_review(uuid,integer,integer,uuid,text,uuid,uuid,text,text,uuid,text,text)"
    def expect(name: str, condition: bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def create_user(label: str, role: str) -> str:
        status, body = api.request("POST", "/auth/v1/admin/users", service=True, body={"email":f"sigec-p5-list-{label}-{run_id}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}", status == 200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def error(cur: Any, name: str, sql: str, params: tuple, code: str):
        savepoint=f"p5_list_{len(checks)}"; cur.execute(f"savepoint {savepoint}")
        try: cur.execute(sql, params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {savepoint}"); expect(name, exc.pgcode == code)
        else: cur.execute(f"rollback to savepoint {savepoint}"); raise AssertionError(name)
    def cleanup():
        return all(api.request("DELETE",f"/auth/v1/admin/users/{uid}",service=True)[0] in {200,204,404} for uid in reversed(users))
    call = "select * from public.sigec_list_applications_for_review(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"
    def list_rows(cur: Any, actor: str, *, page=1, size=25, process=None, municipality=None, course=None, modality=None, competition="all", state=None, stage=None, pending="all", search=None):
        cur.execute(call, (actor,page,size,process,municipality,course,modality,competition,state,stage,pending,search)); return cur.fetchall(), [item.name for item in cur.description]
    try:
        admin=create_user("admin","admin"); manager=create_user("manager","gerente"); attendant=create_user("attendant","atendente"); candidate_a=create_user("candidate-a","candidato"); candidate_b=create_user("candidate-b","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        for index, candidate in enumerate((candidate_a,candidate_b),1):
            base=f"{(int(run_id[:8],16)+900+index)%1_000_000_000:09d}"
            cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,%s,%s,'1990-01-01',%s,now(),'65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",(candidate,f"Candidato Filtro {index}",valid_cpf(base),f"5598{(int(run_id[1:9],16)+900+index)%1_000_000_000:09d}"))
        cur.execute("""insert into public.sigec_processes(title,slug,status,published_at,applications_open_at,applications_close_at,created_by,edital_version,max_preferences) values(%s,%s,'open',now()-interval '1 hour',now()-interval '1 hour',now()+interval '1 day',%s,'p5-list',2) returning id""",("Processo lista P5",f"sigec-p5-list-{run_id}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0) returning id",(process,)); stage=cur.fetchone()[0]
        cur.execute("insert into public.sigec_modalities(process_id,name,slug) values(%s,'Presencial','presencial') returning id",(process,)); modality=cur.fetchone()[0]
        vacancies=[]; courses=[]
        for index, municipality in enumerate(("São Luís","Caxias"),1):
            name=f"Curso Lista {run_id} {index}"; cur.execute("insert into public.sigec_courses(canonical_name,normalized_name) values(%s,%s) returning id",(name,name.lower())); course=cur.fetchone()[0]; courses.append(course)
            cur.execute("insert into public.sigec_vacancies(process_id,modality_id,course_id,municipality,vacancy_kind,vacancy_count) values(%s,%s,%s,%s,'quantidade',1) returning id",(process,modality,course,municipality)); vacancies.append(cur.fetchone()[0])
        cur.execute("insert into public.sigec_process_questions(process_id,code,label,question_type,required,config) values(%s,'declara_pcd','Concorrência PCD?','boolean',false,%s) returning id",(process,Json({"audience":"all","audienceMarker":"pcd"}))); question=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id) values(%s,%s) returning id",(process,candidate_a)); app_a=cur.fetchone()[0]
        cur.execute("insert into public.sigec_applications(process_id,candidate_id) values(%s,%s) returning id",(process,candidate_b)); app_b=cur.fetchone()[0]
        cur.execute("insert into public.sigec_application_preferences(application_id,vacancy_id,position) values(%s,%s,1),(%s,%s,1)",(app_a,vacancies[0],app_b,vacancies[1]))
        cur.execute("insert into public.sigec_application_answers(application_id,question_id,answer) values(%s,%s,'true'::jsonb)",(app_a,question))
        cur.execute("update public.sigec_applications set stage_id=%s,application_state='submitted',submitted_at=now() where id=%s",(stage,app_a))
        protocol=f"SIGEC-2026-{run_id.upper()}"; cur.execute("insert into public.sigec_application_submissions(application_id,version,protocol,edital_version,snapshot,snapshot_sha256,submitted_at) values(%s,1,%s,'p5-list','{}',%s,now())",(app_a,protocol,"a"*64))
        cur.execute("insert into public.sigec_information_requests(application_id,message,requested_fields,due_at,requested_by) values(%s,'Confirme a informação',%s,now()+interval '1 hour',%s)",(app_a,Json([{"kind":"question","id":str(question)}]),manager))

        rows, columns=list_rows(cur,admin,page=1,size=1); expect("pagination_returns_one_row",len(rows)==1); expect("pagination_reports_total",rows[0][-1]==2)
        rows2,_=list_rows(cur,admin,page=2,size=1); expect("second_page_is_distinct",len(rows2)==1 and rows2[0][0]!=rows[0][0] and rows2[0][-1]==2)
        expect("list_omits_sensitive_columns",not ({"cpf","whatsapp","street","address_number","answer","storage_path","original_name"}&set(columns)))
        expect("list_has_operational_columns",{"candidate_name","protocol","preferences","has_pending","competition_scopes"}<set(columns))
        pcd,_=list_rows(cur,manager,competition="pcd"); expect("competition_pcd_filter",len(pcd)==1 and pcd[0][0]==app_a)
        geral,_=list_rows(cur,manager,competition="geral"); expect("competition_general_filter",len(geral)==1 and geral[0][0]==app_b)
        by_municipality,_=list_rows(cur,admin,municipality="Caxias"); expect("municipality_filter",len(by_municipality)==1 and by_municipality[0][0]==app_b)
        by_course,_=list_rows(cur,admin,course=courses[0]); expect("course_filter",len(by_course)==1 and by_course[0][0]==app_a)
        by_modality,_=list_rows(cur,admin,modality=modality); expect("modality_filter",len(by_modality)==2)
        by_state,_=list_rows(cur,admin,state="submitted"); expect("application_state_filter",len(by_state)==1 and by_state[0][0]==app_a)
        by_stage,_=list_rows(cur,admin,stage=stage); expect("stage_filter",len(by_stage)==1 and by_stage[0][0]==app_a)
        with_pending,_=list_rows(cur,admin,pending="with"); expect("pending_filter",len(with_pending)==1 and with_pending[0][0]==app_a)
        without_pending,_=list_rows(cur,admin,pending="without"); expect("without_pending_filter",len(without_pending)==1 and without_pending[0][0]==app_b)
        by_name,_=list_rows(cur,admin,search="Filtro 2"); expect("candidate_name_search",len(by_name)==1 and by_name[0][0]==app_b)
        by_protocol,_=list_rows(cur,admin,search=run_id.upper()); expect("protocol_search",len(by_protocol)==1 and by_protocol[0][0]==app_a)
        error(cur,"candidate_actor_rejected",call,(candidate_a,1,25,None,None,None,None,"all",None,None,"all",None),"42501")
        error(cur,"attendant_actor_rejected",call,(attendant,1,25,None,None,None,None,"all",None,None,"all",None),"42501")
        cur.execute("select not has_function_privilege('anon',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not (select prosecdef from pg_proc where oid=%s::regprocedure)",(signature,signature,signature,signature)); expect("service_only_security_invoker",cur.fetchone()==(True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__ == "__main__": sys.exit(main())
