# ORCA MFG ERP — CC Manufacturing Group

ERP modular para manufactura CNC (Tijuana, BC). Sucesor de un SPA monolítico (`ERP-CC v1`,
`App.jsx` de 4,600 líneas, lógica de negocio en el navegador). v2 mueve todo a Next.js con
capa de servidor real. Especificación completa de Fase 0/1: `documentos/Fase-0.md`.

## Stack (cerrado, no cambia sin discutirlo)

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui
- Zustand + TanStack Query v5
- Zod v4 para validación
- Supabase (Postgres + Auth + Storage + Realtime) vía `@supabase/ssr`
  — **no** `@supabase/auth-helpers-nextjs` (deprecado, desinstalado)
- Hosting Vercel; Cloudflare (DNS), Brevo (correo), Sentry (errores)

Notas de versión que difieren de docs/specs antiguos:
- Tailwind v4: config vive en `src/estilos/globals.css` (`@theme`, `@custom-variant`), **no** hay `tailwind.config.ts`.
- Zod v4: `z.email({ message: '...' })` en vez de `z.string().email()`; `z.iso.datetime()` para fechas ISO.
- `cookies()` de `next/headers` es **async** — siempre `await cookies()`.

## Estructura

```
src/
├── app/            # Rutas Next.js (page.tsx, layout.tsx) — sin lógica de negocio
├── modulos/        # Lógica de negocio, un dir por dominio (15 módulos)
├── compartido/     # Código reutilizable (tipos, constantes, utilidades)
├── nucleo/         # Infraestructura (clientes Supabase, sesión, auditoría)
├── estado/         # Zustand stores
└── estilos/        # CSS global (Tailwind v4)
supabase/migrations/ # SQL numerado, idempotente
tests/unitarias/      # Vitest
```

Cada módulo en `src/modulos/<dominio>/` sigue siempre: `acciones/` (Server Actions),
`componentes/`, `hooks/`, `servicios/` (lógica BD/cálculos), `tipos/`, `validaciones/` (Zod).

## Convenciones (no negociables)

- **Español 100%**: variables, funciones, tipos, nombres de archivo. Nunca mezclar inglés.
  `usuarioId` no `userId`; `crear-cliente.ts` no `createClient.ts`.
- Archivos: kebab-case. Variables/funciones: camelCase. Tipos: PascalCase.
- Tipos centralizados en `tipos/indice.ts` por módulo; utilidades en `utilidades/indice.ts`.
- Imports con alias `@/` y ruta completa al archivo (incluyendo `/indice` cuando aplica).
- Nunca `any`. Zod para todo input externo; tipos inferidos con `z.infer<typeof esquema>`.
- Server Actions: `'use server'` primera línea → `safeParse` → `can()` si la acción muta algo
  sensible → ejecutar → `registrarLog()` (nunca lanza, no debe romper la acción si falla).
- RLS activo en toda tabla nueva. Nunca confiar solo en el frontend para permisos.
- Errores hacia el usuario: genéricos (no revelar si un email existe, por qué falló el login, etc.).
- JSDoc solo cuando el *por qué* no es obvio (constraint oculto, workaround). No documentar el qué.
- Archivo > ~300 líneas o con responsabilidades mezcladas → candidato a dividir.
- **Hooks en español** (`usar-algo.ts`): `eslint-plugin-react-hooks` detecta hooks con una
  regex fija `/^use[A-Z0-9]/` (sin opción de config) — `usarAlgo` no matchea y sus
  llamadas internas a `useState`/`useEffect`/etc. se marcan como error. Patrón: declarar
  la función como `useAlgo` y exportar con alias — `export { useAlgo as usarAlgo }`. No
  desactivar la regla.
- **Regenerar tipos de Supabase** (`src/compartido/tipos/supabase.ts`, vía
  `supabase gen types typescript`): en PowerShell, redirigir con `>` escribe UTF-16LE, no
  UTF-8. `tsc` autodetecta el BOM y compila igual, pero ESLint falla con "File appears to
  be binary". Generar con `... | Out-File -Encoding utf8 ruta.ts` (o regenerar y volver a
  guardar en UTF-8 explícito) — nunca `>` a secas para este archivo.

## Lecciones aprendidas (bugs reales ya pagados — no repetir)

1. **Errores de dos pasos**: si una operación valida en varios pasos (ej. auth OK pero
   perfil inexistente), el mensaje al usuario sigue genérico PERO se loguea la causa real
   con `console.error` interno. No dar por bueno un flujo porque el primer paso pasó —
   probar end-to-end, no con `curl` a medias (un `curl` a Supabase Auth no ejercita el
   lookup de perfil que hace la Server Action después).
2. **Encoding**: nunca generar código/tipos con `>` de PowerShell (UTF-16). Verificar
   encoding antes de dar por terminado — ESLint rechaza UTF-16 como binario.
3. **Renombrar exports**: antes de renombrar/mover una función exportada, `grep` TODOS sus
   imports en `src/` y actualizarlos en el mismo cambio. Un `tsc` limpio no basta si el
   editor tiene caché — verificar con `pnpm typecheck` desde cero (borrar `.next` si hay
   tipos generados obsoletos que referencian rutas/archivos eliminados).
4. **Cookies en middleware/loops**: al mutar `NextResponse` dentro de un loop, reasignar el
   objeto UNA vez para el lote, no por iteración (recrearlo por cookie descarta las
   anteriores, solo sobrevive la última).
5. **Migraciones**: tras cada `supabase db push`, correr `supabase migration list` y
   confirmar que historial remoto == archivos locales. Si alguna vez se migró a mano por
   SQL Editor, reconciliar con `supabase migration repair --status applied <version> --linked`
   ANTES del siguiente push — evita drift.
6. **Auto-provisión de perfil**: existe trigger `manejar_nuevo_usuario_auth` (migración
   000005) que crea `public.usuarios` al insertarse un `auth.users`. Toda tabla nueva
   ligada a usuarios/auth debe seguir el patrón — nunca depender de que alguien cree la
   fila a mano.
7. **Menor privilegio por defecto**: todo cambio de datos vía trigger/función usa el rol de
   MENOR privilegio posible (`vendedor`, no `admin`). Nunca auto-otorgar permisos elevados.

Decisiones de arquitectura con su razón: ver `.claude/decision-log.md`.

## Comandos

```
pnpm dev         # servidor local
pnpm build       # verifica compilación
pnpm typecheck   # tsc --noEmit
pnpm lint        # ESLint
pnpm test        # vitest run
```

Prefijar con `rtk` (ver `~/.claude/CLAUDE.md` global) para output comprimido.

## Seguridad — no negociable

- PIN de operador: siempre bcrypt (`RONDAS_SAL_BCRYPT` en `nucleo/autenticacion/constantes.ts`),
  nunca texto plano.
- Secrets solo en `.env.local` (gitignored). Nunca hardcodeados, nunca en commits.
- `crearClienteSupabaseAdmin()` (service role, sin RLS) **solo** en código de servidor
  (auditoría, validación de PIN, setup) — nunca importado desde código de cliente.
- `can(usuario, permiso)` antes de cualquier mutación crítica en Server Actions.
  Excepción intencional: acciones que mutan el propio RBAC (`asignar-permiso.ts`,
  `revocar-permiso.ts`) exigen `usuario.rol === 'admin'` explícito, no un permiso — una
  acción que puede otorgar cualquier permiso no puede depender de un permiso otorgable.
- `can()` y `obtenerUsuario()`/`obtenerUsuarioServidor()` revisan `usuario.activo` — un
  usuario desactivado se trata como sin sesión en todo punto de consumo, no solo al login.
  Mensajes de error de login: **siempre** el mismo genérico
  (`'Credenciales inválidas o correo no verificado'`), incluida la cuenta desactivada —
  un mensaje distinto ahí es un oráculo para credential stuffing.
- Login (PIN y password) tiene rate-limiting por IP (`nucleo/autenticacion/limitar-intentos.ts`
  + función SQL atómica `registrar_intento_fallido`, migración `...000004`):
  `INTENTOS_LOGIN_MAXIMOS` intentos fallidos → bloqueo de `BLOQUEO_LOGIN_MINUTOS`. El
  bloqueo se verifica **antes** de tocar `buscarOperadorPorPin` (evita además que el loop
  de bcrypt sobre todos los operadores sea un vector de agotamiento de CPU).
- Pendiente (fuera de alcance de Fase 1): no hay enforcement propio de expiración de
  sesión admin — `TIMEOUT_SESION_ADMIN_HORAS` existe pero depende del comportamiento por
  defecto de Supabase Auth. Tampoco hay invalidación de sesión activa al desactivar un
  usuario (`activo = false` bloquea el siguiente request que resuelva el usuario, pero un
  JWT ya emitido sigue siendo válido para Supabase hasta su propio refresh). Si esto
  importa antes de producción, revisar configuración de expiración de JWT/refresh token
  en el dashboard de Supabase y considerar invalidar el refresh token al desactivar.
