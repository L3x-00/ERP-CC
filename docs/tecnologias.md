# Tecnologías

Versiones tomadas de `package.json` al 2026-11-16. La fuente de verdad es el propio manifiesto y el lockfile.

## Frontend

| Tecnología | Versión | Uso |
| --- | --- | --- |
| Next.js (App Router) | 16.3.3 | Rutas, RSC, Server Actions y build |
| React / React DOM | 19.2.4 | Interfaz y componentes de servidor/cliente |
| TypeScript | 5.x (`strict`) | Tipado de extremo a extremo; prohibido `any` |
| Tailwind CSS | 4.3.2 | Sistema visual y utilidades |
| Base UI (`@base-ui/react`) | 1.9 | Primitivas accesibles |
| Radix Dialog | 1.1 | Diálogos del sistema |
| shadcn | 4.22 | Componentes base copiados al repositorio |
| Lucide React | 1.61 | Iconografía |
| next-themes | 0.4 | Tema claro/oscuro persistido |
| TanStack Query | 5.101 | Datos de servidor, caché e invalidación |
| Zustand | 5.0 | Estado efímero de interfaz |
| React Hook Form | 7.84 | Formularios |
| Zod | 4.4 | Validación de entradas y respuestas |
| Recharts | 3.10 | Gráficas del dashboard |
| Fumadocs | 16.17 / 15.4 | Documentación dentro del producto (`content/docs`) |
| `@react-pdf/renderer` | 4.9 | Generación de PDF de propuestas y documentos |

## Backend

| Tecnología | Versión | Uso |
| --- | --- | --- |
| Supabase PostgreSQL | local/remoto | Datos, RPCs, RLS, secuencias y pgTAP |
| `@supabase/supabase-js` | 2.110 | Cliente administrativo y de pruebas |
| `@supabase/ssr` | 0.12 | Sesión SSR, cookies y RLS por usuario |
| Supabase Auth | — | Inicio de sesión, usuarios y recuperación |
| Supabase Storage | — | Adjuntos y documentos en buckets privados |
| Supabase Realtime | — | Invalidación de consultas bajo RLS y señal SSE de piso |
| Server Actions de Next.js | — | Mutaciones autorizadas y auditadas |
| `bcryptjs` | 3.0 | Hash de PIN de operadores |
| OpenRouter API | — | OCR de comprobantes con modelo de visión |
| Brevo API v3 | — | Correo transaccional y webhook de eventos |

## Pruebas y calidad

| Herramienta | Uso |
| --- | --- |
| Vitest 4.1 | Unitarias e integración |
| Testing Library + jsdom | Componentes y hooks |
| Playwright 1.62 | E2E de navegador con Supabase local |
| pgTAP | RPCs, RLS, folios y máquinas de estado |
| ESLint 9 + `eslint-config-next` | Lint del repositorio |
| TypeScript `tsc --noEmit` | Verificación de tipos |

## Infraestructura y desarrollo

- **Node.js 24** y **pnpm 11**.
- **Supabase CLI + Docker** para el stack local.
- **GitHub Actions** con jobs `cambios`, `verificacion` y `e2e-local`.
- **Vercel** para previews y despliegue de la aplicación.
- **PowerShell** en Windows para los scripts locales (`scripts/dev-local.ps1`).

## Variables de entorno principales

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública sujeta a RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones privilegiadas de servidor |
| `SECRETO_SESION_OPERADOR` | Firma HMAC de la cookie PIN |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | OCR de comprobantes |
| `OPENROUTER_BASE_URL` / `OPENROUTER_PERMITIR_ENDPOINT_LOCAL` | Stub local de OCR para E2E |
| `BREVO_API_KEY` / `CORREO_REMITENTE` / `BREVO_WEBHOOK_TOKEN` | Correo transaccional |
| `NEXT_PUBLIC_SITIO_URL` | Enlaces absolutos en correos |

Nunca se versionan `.env` reales; la plantilla es `.env.example`.
