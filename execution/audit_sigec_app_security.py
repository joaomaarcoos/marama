"""Static application security gate for SIGEC role isolation.

Run alongside audit_sigec_security.py before releasing candidate access.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


def main() -> int:
    findings: list[dict[str, str]] = []

    checks = {
        "candidate_api_isolation": (
            "middleware.ts",
            "role === 'candidato' && !isCandidateApi",
        ),
        "unknown_role_fails_closed": (
            "lib/roles.ts",
            "? role : 'sem_acesso'",
        ),
        "roles_from_app_metadata": (
            "lib/roles.ts",
            "user?.app_metadata?.role",
        ),
        "webhook_fails_closed": (
            "lib/webhook-auth.ts",
            "if (!expected)",
        ),
        "constant_time_webhook_secret": (
            "lib/webhook-auth.ts",
            "timingSafeEqual",
        ),
        "candidate_layout_guard": (
            "app/(candidate)/minha-area/layout.tsx",
            "role !== 'candidato'",
        ),
        "documents_role_guard": (
            "app/api/documentos/route.ts",
            "requireApiUser(['admin', 'gerente'])",
        ),
        "reports_role_guard": (
            "app/api/relatorios/route.ts",
            "requireApiUser(['admin', 'gerente'])",
        ),
        "logs_admin_guard": (
            "app/api/logs/evolution/route.ts",
            "requireApiUser(['admin'])",
        ),
        "process_manager_guard": (
            "app/(dashboard)/sigec-processos/actions.ts",
            "role === 'admin' || role === 'gerente'",
        ),
        "draft_only_process_edit": (
            "app/(dashboard)/sigec-processos/actions.ts",
            ".eq('status', 'draft')",
        ),
        "process_publication_uses_atomic_rpc": (
            "app/(dashboard)/sigec-processos/actions.ts",
            "adminClient.rpc('sigec_publish_process'",
        ),
        "process_close_uses_atomic_rpc": (
            "app/(dashboard)/sigec-processos/actions.ts",
            "adminClient.rpc('sigec_close_process'",
        ),
        "process_publication_has_readiness_panel": (
            "app/(dashboard)/sigec-processos/[id]/page.tsx",
            "SigecProcessPublicationPanel",
        ),
        "process_publication_button_fails_closed": (
            "components/sigec-process-publication-panel.tsx",
            "disabled={!canPublish || isPending}",
        ),
        "candidate_registration_feature_flag": (
            "app/(public)/cadastro-candidato/actions.ts",
            "candidateRegistrationEnabled()",
        ),
        "candidate_registration_uses_public_signup": (
            "app/(public)/cadastro-candidato/actions.ts",
            "supabase.auth.signUp",
        ),
        "candidate_registration_uses_generic_result": (
            "app/(public)/cadastro-candidato/actions.ts",
            "return { status: 'success', message: GENERIC_SUCCESS }",
        ),
        "login_masks_account_existence": (
            "app/(auth)/login/actions.ts",
            "return { error: 'Email ou senha incorretos.' }",
        ),
        "login_requires_captcha_configuration": (
            "app/(auth)/login/actions.ts",
            "captchaSecurityConfigured()",
        ),
        "login_passes_captcha_token_to_supabase": (
            "app/(auth)/login/actions.ts",
            "options: { captchaToken }",
        ),
        "candidate_password_strength": (
            "lib/sigec-registration.ts",
            ".min(12",
        ),
        "auth_callback_destination_allowlist": (
            "app/auth/confirm/route.ts",
            "ALLOWED_DESTINATIONS.has(requestedNext)",
        ),
        "password_recovery_generic_response": (
            "app/(auth)/recuperar-senha/actions.ts",
            "GENERIC_RESPONSE",
        ),
        "password_recovery_always_returns_generic_success": (
            "app/(auth)/recuperar-senha/actions.ts",
            "return { status: 'success' as const, message: GENERIC_RESPONSE }",
        ),
        "password_recovery_has_explicit_contrast": (
            "app/(auth)/recuperar-senha/page.tsx",
            "bg-[#0b1322] p-7 text-slate-50",
        ),
        "password_recovery_form_has_readable_labels": (
            "components/password-recovery-form.tsx",
            "text-sm font-bold text-slate-200",
        ),
        "password_update_has_explicit_contrast": (
            "app/(auth)/redefinir-senha/page.tsx",
            "bg-[#0b1322] p-7 text-slate-50",
        ),
        "password_update_form_has_readable_labels": (
            "components/password-update-form.tsx",
            "text-sm font-bold text-slate-200",
        ),
        "password_update_revalidates_user": (
            "app/(auth)/redefinir-senha/actions.ts",
            "supabase.auth.getUser()",
        ),
        "password_change_revokes_all_sessions": (
            "app/(auth)/redefinir-senha/actions.ts",
            "signOut({ scope: 'global' })",
        ),
        "registration_requires_captcha_configuration": (
            "lib/sigec-registration.ts",
            "SIGEC_SUPABASE_CAPTCHA_ENABLED",
        ),
        "signup_rate_limits_ip_email_phone": (
            "lib/sigec-abuse-server.ts",
            "'signup_ip', value: ip",
        ),
        "rate_limit_identifiers_use_hmac": (
            "lib/sigec-abuse-server.ts",
            "createHmac('sha256'",
        ),
        "rate_limit_rules_are_consumed_sequentially": (
            "lib/sigec-abuse-server.ts",
            "for (const rule of rules)",
        ),
        "password_recovery_logs_safe_failure_stage": (
            "app/(auth)/recuperar-senha/actions.ts",
            "unavailable('rate_limit')",
        ),
        "server_redirect_url_is_not_next_public": (
            "lib/sigec-app-url.ts",
            "process.env.SIGEC_APP_URL",
        ),
        "server_redirect_url_has_canonical_fallback": (
            "lib/sigec-app-url.ts",
            "https://mara.joaodantasia.com.br",
        ),
        "recovery_uses_validated_server_url": (
            "app/(auth)/recuperar-senha/actions.ts",
            "getSigecAppUrl()",
        ),
        "signup_uses_validated_server_url": (
            "app/(public)/cadastro-candidato/actions.ts",
            "getSigecAppUrl()",
        ),
        "docker_runner_has_server_app_url": (
            "Dockerfile",
            "ENV SIGEC_APP_URL=https://mara.joaodantasia.com.br",
        ),
        "compose_passes_server_app_url": (
            "docker-compose.yml",
            "SIGEC_APP_URL: ${SIGEC_APP_URL:-https://mara.joaodantasia.com.br}",
        ),
        "signup_requires_server_nonce": (
            "app/(public)/cadastro-candidato/actions.ts",
            "issueCandidateSignupNonce()",
        ),
        "whatsapp_otp_uses_hmac": (
            "lib/sigec-whatsapp-verification.ts",
            "createHmac('sha256'",
        ),
        "whatsapp_request_revalidates_candidate": (
            "app/(candidate)/minha-area/verificar-whatsapp/actions.ts",
            "extractRole(user) !== 'candidato'",
        ),
        "whatsapp_rate_limits_ip_user_phone": (
            "lib/sigec-abuse-server.ts",
            "'whatsapp_user', value: userId",
        ),
        "evolution_send_timeout": (
            "lib/evolution.ts",
            "AbortSignal.timeout(10_000)",
        ),
        "outbound_fingerprint_does_not_store_otp_plaintext": (
            "lib/evolution.ts",
            "createHash('sha256').update(normalized)",
        ),
        "consent_action_revalidates_candidate": (
            "app/(candidate)/minha-area/aceites/actions.ts",
            "extractRole(user) !== 'candidato'",
        ),
        "consent_action_checks_all_required_flags": (
            "app/(candidate)/minha-area/aceites/actions.ts",
            "lgpd: z.literal('on')",
        ),
        "consent_action_rechecks_application_owner": (
            "app/(candidate)/minha-area/aceites/actions.ts",
            ".eq('candidate_id', user.id)",
        ),
        "consent_evidence_uses_hmac": (
            "lib/sigec-abuse-server.ts",
            "update(`consent_user_agent:${userAgent}`)",
        ),
        "docker_build_receives_turnstile_sitekey": (
            "Dockerfile",
            "ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY",
        ),
        "docker_runtime_expects_supabase_captcha": (
            "Dockerfile",
            "ENV SIGEC_SUPABASE_CAPTCHA_ENABLED=true",
        ),
        "compose_build_passes_turnstile_sitekey": (
            "docker-compose.yml",
            "NEXT_PUBLIC_TURNSTILE_SITE_KEY: ${NEXT_PUBLIC_TURNSTILE_SITE_KEY}",
        ),
        "compose_runtime_passes_rate_limit_secret": (
            "docker-compose.yml",
            "SIGEC_RATE_LIMIT_SECRET: ${SIGEC_RATE_LIMIT_SECRET}",
        ),
        "compose_runtime_passes_whatsapp_otp_secret": (
            "docker-compose.yml",
            "SIGEC_WHATSAPP_OTP_SECRET: ${SIGEC_WHATSAPP_OTP_SECRET}",
        ),
        "compose_registration_defaults_closed": (
            "docker-compose.yml",
            "SIGEC_CANDIDATE_REGISTRATION_ENABLED: ${SIGEC_CANDIDATE_REGISTRATION_ENABLED:-false}",
        ),
    }

    for name, (path, expected) in checks.items():
        try:
            contents = read(path)
        except FileNotFoundError:
            findings.append({"severity": "critical", "check": name, "detail": f"Missing {path}"})
            continue
        if expected not in contents:
            findings.append({"severity": "high", "check": name, "detail": f"Control absent in {path}"})

    webhook_coord = read("app/api/webhook/evolution-coord/route.ts")
    webhook_mara = read("app/api/webhook/evolution/route.ts")
    for name, contents in (("evolution_coord", webhook_coord), ("evolution", webhook_mara)):
        if "verifyWebhookSecret" not in contents:
            findings.append({"severity": "critical", "check": f"{name}_webhook_auth", "detail": "Webhook has no shared-secret gate."})

    process_actions = read("app/(dashboard)/sigec-processos/actions.ts")
    if ".delete()" in process_actions:
        findings.append({
            "severity": "high",
            "check": "process_archive_is_non_destructive",
            "detail": "Process actions must archive instead of hard deleting records.",
        })

    registration_action = read("app/(public)/cadastro-candidato/actions.ts")
    if "app_metadata" in registration_action or "adminClient" in registration_action:
        findings.append({
            "severity": "critical",
            "check": "candidate_role_not_controlled_by_public_action",
            "detail": "Public registration must not assign app_metadata or import the service-role client.",
        })

    server_app_url = read("lib/sigec-app-url.ts")
    if "NEXT_PUBLIC_APP_URL" in server_app_url:
        findings.append({
            "severity": "high",
            "check": "server_redirect_url_must_not_use_build_time_public_env",
            "detail": "Server redirect URL resolver must not depend on a NEXT_PUBLIC build-time value.",
        })

    result = {"ok": not findings, "checks": len(checks) + 4, "findings": findings}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
