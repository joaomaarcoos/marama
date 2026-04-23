'use client'

import Image from 'next/image'
import { Inter } from 'next/font/google'
import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { login } from './actions'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const styles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
    background: #f4f4f5;
  }

  body {
    overflow: hidden;
  }

  .mp-login-screen {
    min-height: 100dvh;
    height: 100dvh;
    padding: 0;
    background: #f4f4f5;
  }

  .mp-login-frame {
    position: relative;
    min-height: 100dvh;
    height: 100dvh;
    overflow: hidden;
    border-radius: 0;
    background:
      radial-gradient(circle at center, rgba(255, 255, 255, 0.85) 0%, rgba(248, 248, 248, 0.98) 48%, #f3f3f3 100%);
    box-shadow: inset 0 0 0 1.5px rgba(205, 212, 222, 0.82);
  }

  .mp-login-shell {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(560px, 1.02fr) minmax(520px, 0.98fr);
    align-items: stretch;
    gap: clamp(28px, 3vw, 56px);
    min-height: 100dvh;
    height: 100dvh;
    max-width: 1420px;
    margin: 0 auto;
    padding: clamp(20px, 4vh, 52px) clamp(28px, 4vw, 68px) clamp(16px, 2.5vh, 28px);
  }

  .mp-login-left {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-self: stretch;
    min-height: 0;
    height: 100%;
    padding-left: 18px;
    padding-top: clamp(8px, 1.6vh, 16px);
  }

  .mp-login-logo {
    position: relative;
    z-index: 2;
    width: min(100%, clamp(300px, 25vw, 470px));
    margin-bottom: clamp(8px, 1.6vh, 18px);
  }

  .mp-login-mascot-stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 300px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-start;
    padding-left: 48px;
    overflow: visible;
  }

  .mp-login-map {
    position: absolute;
    left: 12px;
    bottom: 6px;
    transform: none;
    width: min(100%, clamp(320px, 27vw, 440px));
    max-width: 100%;
    max-height: 92%;
    opacity: 0.78;
  }

  .mp-login-mascot {
    position: relative;
    z-index: 2;
    width: auto;
    height: clamp(470px, 64vh, 660px);
    max-width: 100%;
    max-height: none;
    object-fit: contain;
    object-position: center bottom;
    transform: translateY(56px);
  }

  .mp-login-right {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 12px;
  }

  .mp-login-auth {
    width: min(100%, 630px);
  }

  .mp-login-card {
    border-radius: 32px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(252, 252, 252, 0.98) 100%);
    border: 1px solid rgba(228, 233, 240, 0.95);
    box-shadow:
      0 14px 34px rgba(15, 23, 42, 0.06),
      0 2px 6px rgba(15, 23, 42, 0.04);
    padding: clamp(24px, 3vh, 36px) clamp(28px, 3.3vw, 58px) clamp(26px, 3.2vh, 42px);
  }

  .mp-login-badge {
    width: clamp(62px, 7vh, 76px);
    height: clamp(62px, 7vh, 76px);
    margin: 0 auto clamp(16px, 2vh, 26px);
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    border: 1px solid #eef1f5;
    box-shadow:
      0 9px 22px rgba(15, 23, 42, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .mp-login-card h1 {
    margin: 0;
    text-align: center;
    font-size: clamp(27px, 3.2vh, 31px);
    line-height: 1.1;
    font-weight: 800;
    color: #15346d;
    letter-spacing: -0.02em;
  }

  .mp-login-subtitle {
    margin: 10px 0 clamp(22px, 3vh, 38px);
    text-align: center;
    font-size: 15px;
    line-height: 1.4;
    font-weight: 400;
    color: #697489;
  }

  .mp-login-form {
    display: flex;
    flex-direction: column;
  }

  .mp-login-field {
    margin-bottom: clamp(18px, 2.4vh, 30px);
  }

  .mp-login-field label {
    display: block;
    margin-bottom: clamp(10px, 1.2vh, 14px);
    color: #253247;
    font-size: 15px;
    line-height: 1;
    font-weight: 700;
  }

  .mp-login-input-wrap {
    position: relative;
  }

  .mp-login-input {
    width: 100%;
    height: clamp(44px, 5.2vh, 50px);
    padding: 0 50px 0 58px;
    border-radius: 12px;
    border: 1px solid #d7dde6;
    background: #ffffff;
    color: #344052;
    font: inherit;
    font-size: 15px;
    outline: none;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease;
  }

  .mp-login-input::placeholder {
    color: #8692a8;
  }

  .mp-login-input:focus {
    border-color: #9bb4f3;
    box-shadow: 0 0 0 4px rgba(24, 77, 209, 0.09);
    background: #ffffff;
  }

  .mp-login-icon-left,
  .mp-login-icon-right {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 22px;
    height: 22px;
    color: #5f6a7e;
  }

  .mp-login-icon-left {
    left: 16px;
    pointer-events: none;
  }

  .mp-login-toggle {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    padding: 0;
    border-radius: 999px;
    background: transparent;
    color: #5f6a7e;
    cursor: pointer;
  }

  .mp-login-toggle:hover {
    background: rgba(22, 52, 109, 0.06);
  }

  .mp-login-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin: 4px 0 clamp(18px, 2.5vh, 34px);
  }

  .mp-login-remember {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    color: #586477;
    font-size: 15px;
    line-height: 1;
    font-weight: 500;
    cursor: pointer;
    user-select: none;
  }

  .mp-login-check {
    appearance: none;
    width: 22px;
    height: 22px;
    margin: 0;
    border-radius: 6px;
    border: 1.5px solid #cdd4de;
    background: #ffffff;
    display: inline-grid;
    place-content: center;
    cursor: pointer;
  }

  .mp-login-check::before {
    content: '';
    width: 12px;
    height: 12px;
    transform: scale(0);
    transition: transform 0.12s ease-in-out;
    box-shadow: inset 1em 1em #184dd1;
    clip-path: polygon(14% 44%, 0 59%, 43% 100%, 100% 16%, 84% 0, 41% 62%);
  }

  .mp-login-check:checked {
    border-color: #184dd1;
  }

  .mp-login-check:checked::before {
    transform: scale(1);
  }

  .mp-login-forgot {
    border: 0;
    padding: 0;
    background: transparent;
    color: #0f58ff;
    font: inherit;
    font-size: 15px;
    line-height: 1;
    font-weight: 500;
    cursor: pointer;
  }

  .mp-login-forgot:hover {
    text-decoration: underline;
  }

  .mp-login-error {
    margin-bottom: 16px;
    border-radius: 12px;
    border: 1px solid rgba(220, 38, 38, 0.16);
    background: rgba(220, 38, 38, 0.05);
    color: #c32727;
    padding: 13px 15px;
    font-size: 14px;
    line-height: 1.45;
    font-weight: 500;
  }

  .mp-login-submit {
    width: 100%;
    height: clamp(44px, 5vh, 49px);
    border: 0;
    border-radius: 12px;
    background: linear-gradient(180deg, #184dd1 0%, #1748c2 100%);
    color: #ffffff;
    font: inherit;
    font-size: 17px;
    line-height: 1;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    box-shadow: 0 8px 18px rgba(24, 77, 209, 0.18);
    transition:
      transform 0.14s ease,
      box-shadow 0.14s ease,
      filter 0.14s ease;
  }

  .mp-login-submit:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(24, 77, 209, 0.22);
    filter: brightness(1.02);
  }

  .mp-login-submit:disabled {
    opacity: 0.8;
    cursor: not-allowed;
  }

  .mp-login-security {
    margin-top: clamp(16px, 2vh, 28px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #8a93a2;
    font-size: 14px;
    line-height: 1;
    font-weight: 500;
  }

  .mp-login-security svg {
    width: 14px;
    height: 14px;
  }

  @keyframes mp-login-spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }

  @media (max-height: 860px) {
    .mp-login-shell {
      padding-top: 18px;
      padding-bottom: 14px;
    }

    .mp-login-logo {
      width: min(100%, 360px);
      margin-bottom: 4px;
    }

    .mp-login-mascot-stage {
      min-height: 270px;
    }

    .mp-login-map {
      left: 8px;
      width: min(100%, 340px);
      bottom: 0;
    }

    .mp-login-mascot {
      height: 500px;
      transform: translateY(42px);
    }

    .mp-login-card {
      padding: 22px 30px 24px;
    }

    .mp-login-badge {
      width: 60px;
      height: 60px;
      margin-bottom: 14px;
    }

    .mp-login-card h1 {
      font-size: 27px;
    }

    .mp-login-subtitle {
      margin-bottom: 20px;
    }

    .mp-login-field {
      margin-bottom: 16px;
    }

    .mp-login-meta {
      margin-bottom: 18px;
    }

    .mp-login-security {
      margin-top: 14px;
    }
  }

  @media (max-width: 1240px), (max-height: 760px) {
    body {
      overflow-y: auto;
    }

    .mp-login-screen,
    .mp-login-frame,
    .mp-login-shell {
      height: auto;
      min-height: 100dvh;
    }

    .mp-login-shell {
      grid-template-columns: 1fr;
      gap: 18px;
      max-width: 760px;
      padding: 24px 22px 20px;
    }

    .mp-login-left {
      min-height: auto;
      align-items: center;
      text-align: center;
      padding-left: 0;
    }

    .mp-login-logo {
      margin: 0 auto 8px;
      width: min(100%, 380px);
    }

    .mp-login-mascot-stage {
      display: none;
    }

    .mp-login-right {
      padding-top: 0;
    }

    .mp-login-auth {
      width: min(100%, 620px);
    }
  }

  @media (max-width: 1240px) {
    .mp-login-shell {
      min-height: 100dvh;
    }
  }

  @media (max-width: 720px) {
    .mp-login-frame {
      min-height: 100dvh;
      border-radius: 0;
    }

    .mp-login-shell {
      min-height: 100dvh;
      padding: 18px 14px 16px;
    }

    .mp-login-screen {
      padding: 0;
    }

    .mp-login-logo {
      width: 100%;
      max-width: 320px;
    }

    .mp-login-card {
      padding: 22px 16px 20px;
      border-radius: 26px;
    }

    .mp-login-card h1 {
      font-size: 27px;
    }

    .mp-login-subtitle {
      margin-bottom: 18px;
    }

    .mp-login-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
    }
  }
`

function MaranhaoMap() {
  return (
    <svg className="mp-login-map" viewBox="0 0 620 660" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M297.129 25.159c18.478 17.265 42.026 28.773 67.149 24.166 30.181-5.535 47.573 12.16 55.614 39.142 7.553 25.35 27.618 35.364 52.264 41.113 32.754 7.647 47.621 32.515 42.4 66.194-4.401 28.398 5.416 48.206 27.937 64.529 24.639 17.862 31.039 43.994 17.586 72.726-11.293 24.127-8.268 46.183-.449 70.722 9.691 30.404-.749 54.111-29.989 67.922-24.554 11.592-37.265 30.795-42.332 56.565-5.648 28.739-25.521 44.871-55.242 45.469-26.305.529-44.435 11.53-61.46 31.309-20.247 23.515-45.744 27.91-73.866 12.861-23.788-12.727-46.437-12.055-69.944 1.092-30.694 17.174-55.443 12.331-76.927-13.19-17.082-20.292-35.772-31.203-62.613-30.297-30.486 1.029-50.246-15.932-56.162-45.478-4.892-24.425-16.639-42.584-40.334-53.787-31.037-14.671-41.858-38.036-31.929-70.553 8.101-26.543 10.011-49.245-1.616-75.454-11.982-27.022-3.802-52.108 19.404-69.286 22.123-16.376 32.343-35.17 27.85-63.748-5.495-34.961 8.503-60.355 42.986-68.401 23.49-5.481 42.032-14.796 49.33-39.019 8.872-29.447 27.156-45.81 60.151-39.738 22.238 4.092 43.542-5.882 60.443-21.69 25.418-23.768 52.471-24.259 78.165-.236Z"
        fill="#EEF1F6"
      />
      <path
        d="M133.582 404.308 156.987 421.91l29.586-2.743 18.236 24.099 28.824-7.971 23.041 20.746 28.168-11.894 25.286 17.921 25.921-19.076 28.033 9.749 24.616-21.753 28.107 7.107 18.394-24.486 29.775 1.824 23.2-18.769-3.769-29.583 18.565-23.35-12.751-27.03 8.529-28.946-26.574-12.409-10.288-27.999-29.155 1.104-21.642-20.067-26.763 12.442-25.634-16.662-24.933 17.204-27.046-11.805-20.944 20.67-29.106-.554-11.258 27.614-26.977 11.475 7.314 29.055-13.882 26.472 17.645 23.714-5.009 29.283Z"
        fill="#E8EDF4"
      />
      <path
        d="m100.775 393.754 32.951 20.244 33.561-18.704 33.984 17.922 34.031-17.451 24.153 29.567 15.463 36.351-16.381 36.404-23.56 29.464-34.093-16.545-33.825 18.512-33.664-19.229-25.383 31.858-36.501-15.35-32.68-19.934 3.031-39.546-20.271-34.501 24.783-26.361 15.747-37.266 39.655 3.565Z"
        fill="#FFFFFF"
        opacity="0.42"
      />
      <polygon
        points="94.5,348.2 103.9,376.6 133.8,376.6 109.5,393.8 118.8,422.4 94.5,405 70.2,422.4 79.5,393.8 55.2,376.6 85.1,376.6"
        fill="#FFFFFF"
        opacity="0.96"
      />
    </svg>
  )
}

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData(event.currentTarget)
      const result = await login(formData)

      if (result?.error) {
        setError(result.error)
        setLoading(false)
      }
    } catch {
      setError('Não foi possível entrar. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />

      <main className={`${inter.className} mp-login-screen`}>
        <div className="mp-login-frame">
          <div className="mp-login-shell">
            <section className="mp-login-left" aria-label="Apresentação da plataforma">
              <Image
                className="mp-login-logo"
                src="/logo-maranhao-profissionalizado.png"
                alt="Maranhão Profissionalizado"
                width={560}
                height={220}
                priority
              />

              <div className="mp-login-mascot-stage">
                <MaranhaoMap />
                <Image
                  className="mp-login-mascot"
                  src="/mascote-mara.png"
                  alt="Mascote MARA"
                  width={1024}
                  height={1536}
                  priority
                />
              </div>
            </section>

            <section className="mp-login-right" aria-label="Área de autenticação">
              <div className="mp-login-auth">
                <div className="mp-login-card">
                  <div className="mp-login-badge">
                    <Image
                      src="/bandeira-maranhao.svg"
                      alt="Bandeira do Maranhão"
                      width={42}
                      height={28}
                      priority
                    />
                  </div>

                  <h1>Bem-vindo(a)!</h1>
                  <p className="mp-login-subtitle">Acesse o sistema para continuar</p>

                  <form className="mp-login-form" onSubmit={handleSubmit}>
                    <div className="mp-login-field">
                      <label htmlFor="email">E-mail</label>
                      <div className="mp-login-input-wrap">
                        <svg
                          className="mp-login-icon-left"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path d="M3 7l9 6 9-6" />
                        </svg>
                        <input
                          className="mp-login-input"
                          id="email"
                          name="email"
                          type="email"
                          placeholder="Digite seu e-mail"
                          autoComplete="email"
                          required
                        />
                      </div>
                    </div>

                    <div className="mp-login-field">
                      <label htmlFor="password">Senha</label>
                      <div className="mp-login-input-wrap">
                        <svg
                          className="mp-login-icon-left"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                        </svg>
                        <input
                          className="mp-login-input"
                          id="password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Digite sua senha"
                          autoComplete="current-password"
                          required
                        />
                        <button
                          className="mp-login-toggle"
                          type="button"
                          onClick={() => setShowPassword(value => !value)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                        >
                          <svg
                            className="mp-login-icon-right"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            {showPassword ? (
                              <>
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </>
                            ) : (
                              <>
                                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
                                <circle cx="12" cy="12" r="3" />
                              </>
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="mp-login-meta">
                      <label className="mp-login-remember" htmlFor="remember">
                        <input className="mp-login-check" id="remember" name="remember" type="checkbox" />
                        <span>Lembrar-me</span>
                      </label>

                      <button className="mp-login-forgot" type="button">
                        Esqueci minha senha
                      </button>
                    </div>

                    {error ? <div className="mp-login-error">{error}</div> : null}

                    <button className="mp-login-submit" type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 size={18} style={{ animation: 'mp-login-spin 1s linear infinite' }} />
                          Entrando...
                        </>
                      ) : (
                        'Entrar'
                      )}
                    </button>
                  </form>
                </div>

                <div className="mp-login-security">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                  </svg>
                  <span>Sistema seguro e protegido</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
