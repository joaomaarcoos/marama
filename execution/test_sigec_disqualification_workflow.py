"""Transactional remote checks for the versioned SIGEC disqualification workflow."""
from __future__ import annotations
import json, secrets, sys, uuid
from typing import Any
import psycopg2
from test_sigec_candidate_signup import valid_cpf
from test_sigec_remote_access import Api, load_env


def main() -> int:
    env=load_env(); api=Api(env["NEXT_PUBLIC_SUPABASE_URL"],env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],env["SUPABASE_SERVICE_ROLE_KEY"])
    run=uuid.uuid4().hex[:12]; password=f"Sg!{secrets.token_urlsafe(24)}9z"; users=[]; checks=[]; connection=None
    create_sig="public.sigec_create_disqualification_catalog(uuid,uuid)"; confirm_sig="public.sigec_confirm_disqualification_catalog(uuid,uuid)"; decide_sig="public.sigec_disqualify_application(uuid,uuid,uuid,text,text)"
    def expect(name:str, condition:bool):
        if not condition: raise AssertionError(name)
        checks.append(name)
    def user(label:str, role:str)->str:
        status,body=api.request("POST","/auth/v1/admin/users",service=True,body={"email":f"sigec-p5-disqualify-{label}-{run}@example.invalid","password":password,"email_confirm":True,"app_metadata":{"role":role}})
        expect(f"create_{label}",status==200 and bool(body.get("id"))); users.append(body["id"]); return body["id"]
    def cleanup(): return all(api.request("DELETE",f"/auth/v1/admin/users/{item}",service=True)[0] in {200,204,404} for item in reversed(users))
    def sql_error(cur:Any,name:str,sql:str,params:tuple,code:str):
        save=f"dq_{len(checks)}"; cur.execute(f"savepoint {save}")
        try: cur.execute(sql,params)
        except psycopg2.Error as exc: cur.execute(f"rollback to savepoint {save}"); expect(name,exc.pgcode==code)
        else: cur.execute(f"rollback to savepoint {save}"); raise AssertionError(name)
    def auth(cur:Any,user_id:str,role:str):
        cur.execute("select set_config('request.jwt.claim.sub',%s,true),set_config('request.jwt.claims',%s,true)",(user_id,json.dumps({"sub":user_id,"role":"authenticated","app_metadata":{"role":role}})))
    def reset(cur:Any): cur.execute("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)")
    try:
        admin=user("admin","admin"); manager=user("manager","gerente"); attendant=user("attendant","atendente"); candidate=user("candidate","candidato"); other=user("other","candidato")
        connection=psycopg2.connect(env["POSTGRES"]); connection.autocommit=False; cur=connection.cursor()
        base=f"{(int(run[:8],16)+6200)%1_000_000_000:09d}"
        for index,person in enumerate((candidate,other)):
            cur.execute("""insert into public.sigec_candidate_profiles(user_id,full_name,cpf,birth_date,whatsapp,whatsapp_verified_at,postal_code,street,address_number,district,city,state,availability,profile_completed_at) values(%s,%s,%s,'1990-01-01',%s,now(),'65000123','Rua Privada','10','Centro','São Luís','MA','Manhã',now())""",(person,f"Candidato {index}",valid_cpf(f"{(int(base)+index)%1_000_000_000:09d}"),f"5598{(int(run[1:9],16)+6200+index)%1_000_000_000:09d}"))
        cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values('Processo desclassificação',%s,'draft',%s,'p5-disqualify') returning id",(f"sigec-p5-disqualify-{run}",manager)); process=cur.fetchone()[0]
        cur.execute("insert into public.sigec_processes(title,slug,status,created_by,edital_version) values('Outro processo',%s,'draft',%s,'other') returning id",(f"sigec-p5-disqualify-other-{run}",manager)); other_process=cur.fetchone()[0]
        sql_error(cur,"attendant_cannot_create_catalog","select public.sigec_create_disqualification_catalog(%s,%s)",(attendant,process),"42501")
        cur.execute("select public.sigec_create_disqualification_catalog(%s,%s)",(admin,process)); catalog=cur.fetchone()[0]; expect("admin_creates_draft_catalog",bool(catalog))
        cur.execute("select status,normative_status,version from public.sigec_disqualification_catalog_versions where id=%s",(catalog,)); expect("catalog_starts_pending_confirmation",cur.fetchone()==("draft","pending_confirmation",1))
        cur.execute("select count(*),min(position),max(position),count(distinct code) from public.sigec_disqualification_reason_items where catalog_version_id=%s",(catalog,)); expect("catalog_contains_exact_nine_reasons",cur.fetchone()==(9,1,9,9))
        sql_error(cur,"only_one_draft_catalog","select public.sigec_create_disqualification_catalog(%s,%s)",(manager,process),"23505")
        cur.execute("select public.sigec_create_disqualification_catalog(%s,%s)",(admin,other_process)); other_catalog=cur.fetchone()[0]; cur.execute("select id from public.sigec_disqualification_reason_items where catalog_version_id=%s order by position limit 1",(other_catalog,)); other_reason=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_initial,position) values(%s,'recebida','Recebida',true,0) returning id",(process,)); received=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stages(process_id,code,label,is_terminal,position) values(%s,'desclassificado','Desclassificado',true,1) returning id",(process,)); disqualified=cur.fetchone()[0]
        cur.execute("insert into public.sigec_process_stage_transitions(process_id,from_stage_id,to_stage_id) values(%s,%s,%s)",(process,received,disqualified))
        cur.execute("insert into public.sigec_applications(process_id,candidate_id,stage_id,application_state,submitted_at) values(%s,%s,%s,'submitted',now()) returning id",(process,candidate,received)); application=cur.fetchone()[0]
        cur.execute("select id from public.sigec_disqualification_reason_items where catalog_version_id=%s order by position limit 1",(catalog,)); reason=cur.fetchone()[0]
        sql_error(cur,"unconfirmed_catalog_cannot_disqualify","select public.sigec_disqualify_application(%s,%s,%s,'Motivo comunicado',null)",(admin,application,reason),"23514")
        cur.execute("select public.sigec_confirm_disqualification_catalog(%s,%s)",(manager,catalog)); expect("manager_confirms_catalog_explicitly",cur.fetchone()[0]==catalog)
        cur.execute("select status,normative_status,confirmed_by,confirmed_at is not null from public.sigec_disqualification_catalog_versions where id=%s",(catalog,)); expect("confirmation_records_normative_actor",cur.fetchone()==("confirmed","confirmed",manager,True))
        sql_error(cur,"attendant_cannot_disqualify","select public.sigec_disqualify_application(%s,%s,%s,'Motivo comunicado',null)",(attendant,application,reason),"42501")
        sql_error(cur,"reason_from_other_process_rejected","select public.sigec_disqualify_application(%s,%s,%s,'Motivo comunicado',null)",(admin,application,other_reason),"23514")
        internal="Nota interna sigilosa do teste"; public="Documento obrigatório não foi apresentado após análise."
        cur.execute("select public.sigec_disqualify_application(%s,%s,%s,%s,%s)",(admin,application,reason,public,internal)); decision=cur.fetchone()[0]; expect("admin_disqualifies_with_confirmed_reason",bool(decision))
        cur.execute("select reason_code,catalog_version,public_message,decided_by from public.sigec_application_disqualifications where id=%s",(decision,)); expect("decision_snapshots_reason_and_version",cur.fetchone()==("edital_6_1_1",1,public,admin))
        cur.execute("select body,author_id from public.sigec_disqualification_internal_notes where disqualification_id=%s",(decision,)); expect("internal_note_is_stored_separately",cur.fetchone()==(internal,admin))
        cur.execute("select stage_id from public.sigec_applications where id=%s",(application,)); expect("application_moves_to_disqualified_stage",cur.fetchone()[0]==disqualified)
        cur.execute("select public_message,changed_by from public.sigec_application_status_history where application_id=%s order by id desc limit 1",(application,)); expect("status_history_records_public_reason_and_actor",cur.fetchone()==(public,admin))
        sql_error(cur,"duplicate_disqualification_rejected","select public.sigec_disqualify_application(%s,%s,%s,'Repetição inválida',null)",(manager,application,reason),"23505")
        auth(cur,candidate,"candidato"); cur.execute("select reason_code,public_message from public.sigec_get_candidate_disqualification(%s)",(application,)); expect("candidate_privately_reads_own_reason",cur.fetchone()==("edital_6_1_1",public))
        auth(cur,other,"candidato"); cur.execute("select count(*) from public.sigec_get_candidate_disqualification(%s)",(application,)); expect("other_candidate_cannot_read_reason",cur.fetchone()[0]==0); reset(cur)
        cur.execute("select metadata from public.sigec_audit_events where action='application_disqualified' and entity_id=%s",(str(application),)); serialized=json.dumps(cur.fetchone()[0]); expect("audit_omits_public_and_internal_bodies",public not in serialized and internal not in serialized)
        cur.execute("select not has_table_privilege('authenticated','public.sigec_disqualification_internal_notes','SELECT,INSERT,UPDATE,DELETE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE'),not has_function_privilege('authenticated',%s,'EXECUTE'),has_function_privilege('service_role',%s,'EXECUTE')",(create_sig,create_sig,confirm_sig,confirm_sig,decide_sig,decide_sig)); expect("workflow_contract_is_server_only",cur.fetchone()==(True,True,True,True,True,True,True))
        connection.rollback(); connection.close(); connection=None; checks.append("database_fixtures_rolled_back")
    except Exception as exc:
        if connection: connection.rollback(); connection.close()
        ok=cleanup(); print(json.dumps({"ok":False,"error":str(exc),"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 1
    ok=cleanup(); print(json.dumps({"ok":ok,"checks":checks,"cleanup":ok},ensure_ascii=False,indent=2)); return 0 if ok else 1


if __name__=="__main__": sys.exit(main())
