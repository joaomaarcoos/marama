# MARA Design System

**MARA — Maranhão Profissionalizado** is a WhatsApp-first educational support platform built for the Government of Maranhão's vocational training program ("Maranhão Profissionalizado — Mais trabalho, mais futuro"). MARA itself is the AI assistant: a conversational agent that answers students over WhatsApp, pulls grades and progress from Moodle, and is supervised by a coordination team through this web dashboard.

The brand carries strong **state pride** — the four bandeira colors (red, blue, yellow, green) are the visual anchor — paired with a **dark, focused operations console** for staff who run support during business hours. The mascot **MARA** (a friendly Black woman with curly hair waving in a polo shirt that mixes the four flag colors) is the personable face on every onboarding/empty-state surface.

> Built on Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, Supabase, OpenAI GPT-4o, Moodle WebServices and Evolution API (WhatsApp).

---

## Sources used to build this system

- **Codebase (mounted):** `SISTEMAMARA/` — Next.js dashboard. Key files referenced:
  - `app/globals.css` — full token system (dark + light), chat tokens, login keyframes
  - `tailwind.config.ts` — shadcn/ui token wiring
  - `components/sidebar.tsx` — primary navigation IA
  - `components/mara-orb.tsx` — animated dot-grid logo
  - `components/chat-interface.tsx` — coordination chat surface
  - `app/(auth)/login/page.tsx` — light-theme branded entry point
  - `app/(dashboard)/dashboard/page.tsx` — stat-card pattern
  - `public/{bandeira-maranhao.svg, logo-maranhao-profissionalizado.png, mascote-mara.png}`
- **GitHub:** `joaomaarcoos/marama` (mirror, master branch) — same product, browsed on demand.

---

## Index of this design system

```
README.md                   ← you are here
SKILL.md                    ← skill manifest (Agent Skills compatible)
colors_and_type.css         ← all CSS variables (tokens) + element defaults
fonts/                      ← Google Fonts loader (Sora + Manrope)
assets/
  ├── mascote-mara.png                  ← MARA mascot (1024×1536, transparent)
  ├── logo-maranhao-profissionalizado.png  ← state program logo (1536×1024)
  └── bandeira-maranhao.svg             ← Maranhão state flag (cleaned)
preview/                    ← design-system cards rendered into the DS tab
ui_kits/dashboard/          ← high-fidelity recreation of the staff console
```

---

## Content fundamentals

**Language:** Brazilian Portuguese (pt-BR) throughout. Never English in the product.

**Voice & casing:**
- Sentence case for almost everything: page titles ("Conversas MARA", "Base de Conhecimento", "Disparos"), buttons ("Adicionar bloco", "Sincronizar Moodle"), helpers.
- ALL CAPS reserved for: section labels in the sidebar ("VISÃO GERAL", "ATENDIMENTO", "CONTEÚDO", "EQUIPE & ALUNOS", "SISTEMA"), table column headers ("Nome", "Email", "CPF" — but rendered uppercase via CSS `text-transform`), tiny status pills ("ONLINE", "ENCERRADO").
- The brand wordmark **MARA** is always uppercase and italic in display contexts.

**Pronoun stance:** Mostly impersonal/neutral ("Acesse o sistema para continuar", "Visão geral do sistema MARA"). When addressing the user, it warms up to second-person inclusive ("Bem-vindo(a)!", "Esqueci minha senha"). MARA the agent speaks first-person to students over WhatsApp; the dashboard talks *about* MARA in third-person ("MARA está ativa e recebendo mensagens").

**Tone:** professional-warm. Operational where it has to be ("Configuração do Supabase ausente", "Revalide o container"), reassuring at the edges ("Sistema seguro e protegido"). Empty states are softly written, not jokey.

**Specific copy patterns observed:**
- Status microcopy: `MARA está ativa e recebendo mensagens` · `ONLINE` · `agora`, `5m`, `2h`, `3d`
- Section sublabels under nav items: `chatbot automático`, `respostas manuais`
- Empty states: `Nenhum aluno encontrado.` + helper line `Clique em "Sincronizar Moodle" para importar os alunos.`
- Date helpers: `Hoje`, `Ontem`, then `dd de mês de aaaa`
- Confirmation/closing labels: `Encerrado`, `Aguardando`, `Ativo`, `Inativo`, `Rascunho`, `Enviando`, `Pausado`, `Concluído`, `Falhou`

**Emoji:** essentially none in product chrome. The only "emoji" surface is the chat composer's `EmojiPicker` (for staff replying to students over WhatsApp). Documentation/support copy uses plain text.

**Iconography vs words:** lucide-react icons accompany almost every label (sidebar items, stat cards, table headers). Icons are never standalone — there's always a label on first use; standalone-icon buttons get a `title` tooltip.

---

## Visual foundations

### Color
- **Bandeira do Maranhão** is the brand armature: red `#C8102E`, blue `#1A4FD6`, green `#00C853`, yellow `#F5A623`, plus white and a deep navy. The flag SVG itself uses `#C53425 / #25247B / #000` (historic exact tones).
- The **dark theme** (default in-product) shifts primary to **emerald green** `hsl(162 72% 40%)` — this is the working "MARA brand" color you see on the orb, the active sidebar pill, the composer send button, all status-active pulses. The Maranhão flag colors appear at the brand layer (logo, mascot shirt, login badge, dashboard stat-card top borders).
- **Backgrounds** are deep navy/near-black: `hsl(220 40% 5%)` page, `hsl(220 35% 9%)` cards, `hsl(220 40% 4%)` sidebar. Never pure black, never gray — always tinted blue.
- **Light theme** (toggleable per-user) is **offwhite cream `#F5F4F0`** (canonical) — `hsl(40 23% 95%)`, the warm cream pulled from the bandeira's white field. White cards on top, sidebar a touch lighter (`hsl(42 25% 97%)`). User-toggleable.
- **Semantic accents** (used as 2px top-borders on dashboard cards): blue `hsl(217 91% 60%)`, emerald `hsl(160 84% 39%)`, amber `hsl(38 92% 50%)`, violet `hsl(262 80% 65%)`. One accent per category.

### Type
- Display / headings / brand: **Sora** (400/600/700/800). Used italic-bold for the MARA wordmark, regular-bold for h1/h2 and section labels.
- UI / body: **Inter** (400/500/600/700). All form labels, table cells, conversation text. **Default weight 500** — never 400, which reads too thin against dark surfaces.
- Numerals (stat values, log times): a `.font-data` utility falls back through `var(--font-mono, 'JetBrains Mono', monospace)`.
- Base `html { font-size: calc(100% + 2px) }` — i.e. ~17–18px base, generous.

### Backgrounds & imagery
- No textures, no grain, no patterns inside the app. The dashboard is flat dark cards on a flat dark page.
- The **login screen** is the one full-bleed brand moment: soft radial-white gradient page background, the mascot standing in front of a stylized Maranhão-state map (a custom SVG silhouette in offwhite tones with a single 5-point star). Mascot + map + logo on the left, white auth card on the right.
- Hero/empty states use the mascote PNG at large sizes; everywhere else, lucide icons.

### Animation & motion
- Easings: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth ease-out, the favorite) and `cubic-bezier(0.34, 1.56, 0.64, 1)` (springy hover for the login card).
- Keyframes named: `fade-up` (0.4s), `fade-in` (0.3s), `slide-in-left/right` (0.18–0.3s), `chat-bubble-in` (0.2s), `card-in` (0.7s), `card-bounce` (0.6s), `chat-latest-pulse` (2.4s loop).
- The MARA orb has a 4-second intro fly-in then perpetual gentle dot-pulse. Static prop is supported for sidebar use.
- Transitions on hover/active are short — `0.12s–0.2s`, almost always color/background only. Translate on hover is small (`-1px` to `-0.5px`).

### Hover / press states
- Buttons: hover lifts `translateY(-1px)` and brightens shadow; active drops back to `translateY(0)`.
- Sidebar items: hover background `hsl(var(--sidebar-hover))` (a 3% white wash), active state adds a 0.5×16px primary-colored bar on the left edge with a glow shadow.
- Cards: `hover:-translate-y-0.5` plus a deeper shadow.
- Disabled: `opacity: 0.45`, `cursor: not-allowed`, no transform.

### Borders, radii, shadows
- Radii: `--radius: 0.375rem` (6px) is the base; Tailwind `lg/md/sm` derive from it. Buttons/inputs commonly use 10–12px (`rounded-lg`/explicit `12px`). Login card goes big at 26–32px. Avatars are circles. Bubbles in chat are 14px with one corner clipped to 4px (Telegram-style tail).
- Border colors are tokenized: `hsl(var(--border))` — `220 28% 18%` in dark, `220 16% 87%` in light. Never use `#ccc` etc.
- Shadows are subtle and blue-tinted: `0 1px 3px hsl(220 40% 2% / 0.4)` (sm), `0 8px 24px -8px hsl(220 40% 2% / 0.5)` (card-hover), `0 20px 40px -12px hsl(220 40% 2% / 0.6)` (xl). The login submit uses a blue-glow shadow `0 8px 18px rgba(24, 77, 209, 0.18)`.
- The dashboard stat-card pattern is signature: `border: 1px solid hsl(216 32% 15%)` + `border-top: 2px solid <category color>`. **Always 2px (not 3px) top border in code** — the brief said 3px but the implementation uses 2px; treat 2px as canonical.

### Transparency & blur
- `color-mix(in srgb, X 12%, transparent)` is heavily used for tinted backgrounds (status pills, hover layers).
- Backdrop-blur appears in one place: the chat emoji picker (`backdrop-filter: blur(20px)`).
- Glass effects elsewhere: avoided.

### Layout rules
- Sidebar is fixed-width 224px (collapsed: 56px), always full-height, always present.
- Dashboard inner padding `p-8`.
- Dashboard card grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`.
- Chat workspace is a 3-pane layout: 320px conversation list · flexible message panel · 280–308px contact info drawer (toggleable).
- Tables full-width inside cards; rows have `hover:bg-gray-50` mapped to `hsl(var(--muted))`.

### Imagery vibe
- Photography: none in the product (only the mascot illustration). If photography were added, the mascot's palette suggests warm-but-saturated, with strong primaries — never desaturated/cinematic.
- Illustrations are flat, bold, slightly cartoon-realistic with subtle shading (mascot style). Star motifs from the flag recur (login map decoration).

---

## Iconography

- **Primary library: `lucide-react` 0.474** — already a dep. Every nav item, stat card, table header, status pill uses lucide icons. Stroke weight 2, default size depends on context but is small-and-tight: `h-3.5 w-3.5` (14px) inside the sidebar, `h-3.5 w-3.5` inside stat-card icon chips, `h-4 w-4`–`h-5 w-5` for headers.
- **CDN substitution for HTML kits in this design system:** load via `<script src="https://unpkg.com/lucide@latest"></script>` then call `lucide.createIcons()` — pixel-identical to the React version.
- **Icons used most often:** `LayoutDashboard, MessageSquare, MessagesSquare, Send, Users, GraduationCap, BookOpen, FileText, ShieldCheck, Smartphone, ScrollText, BarChart2, Settings, TicketCheck, Bot, User, Sun, Moon, PanelLeftClose, PanelLeftOpen, LogOut, Plus, Search, Loader2, AlertCircle, CheckCircle2, XCircle, Clock, Tag, RefreshCw, Trash2, Mic, Paperclip, SendHorizontal, Smile`.
- **Custom illustration / "logo" art:** the `MARAOrb` canvas — not an SVG; it's a runtime-drawn dot grid forming an "M" inside a circular halo, ported from a PIL Python animation. We preserve it via `mara-orb.js` in `assets/`.
- **Brand assets (raster):** `mascote-mara.png` (1024×1536, transparent — used at hero sizes only, ~470–660px tall), `logo-maranhao-profissionalizado.png` (1536×1024, transparent), `bandeira-maranhao.svg` (state flag — hand-coded, used inside a 76px white-circle badge on the login card).
- **Emoji:** only inside the chat composer for student-facing replies (a small picker grid). Not used in chrome or marketing copy.
- **Unicode glyphs as icons:** `→` (used as a hover affordance arrow on stat cards, opacity-0 → opacity-100), `·` (separator). Otherwise lucide.

---

## Fonts

Loaded from Google Fonts CDN — no local TTFs needed.

| Slot | Family | Notes |
|---|---|---|
| **Display** (h1/h2/h3, MARA wordmark) | **Sora** 600/700/800 | Picked for the technical-but-modern voice that suits a state-government operations product. The italic 700 carries the brand. |
| **Body / UI** (every label, table cell, conversation) | **Inter** 500/600 (700 for emphasis) | "Roboto-adjacent" without Roboto's slightly dated feel. High x-height makes it strong in dense tables and CPF/phone strings. **Default body weight is 500, not 400** — earlier Manrope-400 looked too thin in the dashboard. |
| **Numerals & code** | **JetBrains Mono** 400/500/600 | Differentiates 0/O cleanly for IDs/CPFs/timestamps. |

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

**To swap to a more "governmental" feel later:** replace `Inter` with **IBM Plex Sans** in `colors_and_type.css` (`--font-body`). Same metrics; slightly more technical traço.

---

## SKILL

See `SKILL.md` for the cross-tool agent skill manifest.
