# Checklist de puesta en producción — ORCA MFG ERP

Fecha: 2026-09-11
Estado: listo para ejecutar por el Product Owner
Nota: este documento **no contiene secretos**. Los valores reales se copian
desde `.env.local` (local, nunca se sube a GitHub) o desde el dashboard de
Supabase.

## 1. Importación del proyecto en Vercel

Pantalla "New Project → Importing from GitHub (L3x-00/ERP-CC)":

| Campo | Valor |
|---|---|
| Project Name | `erp-cc` (o el preferido) |
| Application Preset | Next.js (autodetectado) |
| Root Directory | `./` |
| Build Command | vacío (Vercel usa `pnpm build`) |
| Output Directory | vacío (`.next`) |
| Install Command | vacío (detecta `pnpm-lock.yaml`) |

## 2. Variables de entorno (Producción y Preview)

| Variable | Obligatoria | Origen del valor |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | Supabase → Settings → Data API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Supabase → Settings → API Keys → anon/publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Supabase → Settings → API Keys → service_role (solo servidor) |
| `SECRETO_SESION_OPERADOR` | Sí | Generar nuevo (ver abajo). Mínimo 32 caracteres |
| `NEXT_PUBLIC_SITIO_URL` | Sí (correo) | Dominio final, p. ej. `https://erp.tudominio.com`; sin él los correos salen sin enlace |
| `OPENROUTER_API_KEY` | Sí (OCR) | openrouter.ai → Keys. Sin ella, el OCR de comprobantes falla con aviso genérico |
| `OPENROUTER_MODEL` | Opcional | Default `google/gemma-4-26b-a4b-it:free`; alternativas `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, `openrouter/free` |
| `BREVO_API_KEY` | Sí (correo) | Brevo → SMTP & API → API Keys (la `xkeysib-…`) |
| `CORREO_REMITENTE` | Sí (correo) | Correo verificado en Brevo → Senders & Domains |
| `CORREO_REMITENTE_NOMBRE` | Opcional | Nombre visible del remitente (default `ORCA MFG ERP`) |
| `BREVO_WEBHOOK_TOKEN` | Sí (webhook) | Cadena aleatoria generada por ti para el webhook de eventos |
| `NODE_ENV` | **Nunca** | Vercel lo define; si se pega `.env.local`, borrarlo |

Nota: `SENTRY_AUTH_TOKEN` y `ANTHROPIC_*` ya no se usan; no los agregues.

Generar secreto de sesión de operador (PowerShell):

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Reglas:
- No reutilizar el secreto de desarrollo.
- Rotar el secreto invalida todas las sesiones de piso activas (efecto esperado).
- La anon key es pública por diseño; la service role key **jamás** debe tener
  prefijo `NEXT_PUBLIC_` ni llegar al cliente.

## 3. Ajustes posteriores al import en Vercel

1. Settings → General → **Node.js Version**: 22.x (Next 16 exige ≥20.9).
2. Settings → Functions → **Region**: la más cercana al proyecto Supabase.
3. Plan: el plan Hobby es solo para uso no comercial; un ERP en operación real
   requiere plan Pro.
4. Settings → Domains: agregar dominio propio. Con Cloudflare DNS, CNAME a
   `cname.vercel-dns.com` (nube gris, o naranja con SSL/TLS Full strict).
5. Deployment Protection: los Preview quedan protegidos con autenticación de
   Vercel por defecto; mantenerlo así y no apuntar Preview a datos reales.

## 4. Supabase en producción

1. Proyecto: se recomienda un proyecto nuevo y limpio (el actual contiene datos
   ficticios de pruebas). Aplicar las 51 migraciones de `supabase/migrations/`
   en orden.
   - Si se reutiliza el proyecto actual, verificar:
     `select count(*) from supabase_migrations.schema_migrations;` (debe dar 51)
2. Auth → Providers → Email: **desactivar** "Allow new users to sign up" (el
   trigger crea perfiles con rol `vendedor`; sin esto cualquiera con la anon key
   puede registrarse).
3. Auth → Users → Add user: crear el administrador con Auto Confirm y metadata:

   ```json
   { "rol": "admin", "nombre_completo": "Nombre del responsable" }
   ```

   El trigger `trigger_nuevo_usuario_auth` crea la fila en `public.usuarios`
   con ese rol. Si el usuario ya existía, promover manualmente:
   `update public.usuarios set rol='admin' where email='...';`
4. Auth → URL Configuration: Site URL = dominio de producción.
5. Auth → Settings: activar protección contra contraseñas filtradas
   (HaveIBeenPwned).
6. Backups: el plan free no incluye PITR; programar `pg_dump` periódico o subir
   a Pro.
7. Realtime: las tablas ya quedan agregadas a la publicación
   `supabase_realtime` por las migraciones; verificar en Database → Replication.
8. Usuarios y roles: crear a cada persona en Auth → Add user (Auto Confirm). El
   trigger la registra como `vendedor`; después ejecutar
   `supabase/semillas/usuarios-produccion.sql` en el SQL Editor para asignar
   `admin | gerente | vendedor | contador | operador` y el PIN de piso
   (bcrypt compatible). El script incluye verificación y una consulta final.

## 5. Brevo (correo transaccional) — pasos manuales

La app ya envía correo en menciones de comentarios y expone un webhook de
eventos. Falta lo que solo se hace en el panel de Brevo:

1. **Verificar el remitente**: Senders & Domains → agregar `CORREO_REMITENTE` y
   confirmar el enlace de verificación. Sin esto, Brevo rechaza los envíos.
   Para volumen real se recomienda verificar el dominio completo (SPF/DKIM/DMARC)
   en Cloudflare.
2. **Webhook de eventos**: Transactional → Settings → Webhooks → crear uno con
   URL `https://<tu-dominio>/api/webhooks/brevo?token=<BREVO_WEBHOOK_TOKEN>`
   (el mismo token que pusiste en Vercel) y eventos `delivered`, `hard_bounce`,
   `soft_bounce`, `blocked`, `spam`, `opened`, `click`.
3. **Recibir correo entrante** (respuestas de clientes dentro del ERP): requiere
   dominio propio con registros MX apuntando a Brevo (Inbound Parsing) y una
   regla de negocio definida (a qué hilo/entidad asociar la respuesta). Está
   documentado como pendiente: no se implementa hasta definir ese flujo.

## 6. Configuración inicial dentro de la aplicación

Con el usuario admin, en **Configuración**:
- Empresa (datos fiscales y de contacto).
- Áreas de trabajo.
- Tarifas.
- Cuentas bancarias.
- Plantillas de documentos.

Después, en `/operador`: crear operadores de piso y sus PIN.

## 7. Prueba de humo post-despliegue

1. `/iniciar-sesion` carga y autentica al admin.
2. `/dashboard` muestra métricas sin errores de consola.
3. Crear una orden de producción de prueba y avanzarla.
4. `/operador` → PIN → `/produccion-piso` carga en modo oscuro táctil.
5. Abrir dos pestañas: verificar que Realtime actualiza sin recargar.
6. Cerrar sesión y confirmar que las rutas protegidas redirigen al login.
7. Mencionar a un usuario en un comentario y confirmar que recibe el correo con
   enlace directo a la entidad.
8. Probar el OCR de gastos con una imagen JPG/PNG (máx. 5 MiB) y verificar que
   rellena los campos.

## 8. Regla de secretos (permanente)

- Nunca subir a GitHub archivos `.env`, `.env.local` ni variantes con valores
  reales; solo `.env.example` con campos vacíos.
- `.gitignore` bloquea `.env` y `.env.*` (con excepción de `.env.example`).
- Antes de cada commit: `git status` y confirmar que no aparece ningún archivo
  de entorno.
