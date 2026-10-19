# Semillas de demo local

Estas semillas son **solo para el stack local** (`127.0.0.1:54321`). No se ejecutan contra el proyecto remoto: `guardia-supabase-local.mjs` aborta si la URL no es loopback.

## Reinicio limpio + datos de presentación

```powershell
# 1. Recrear el esquema local desde las migraciones (borra TODOS los datos locales)
supabase db reset --local

# 2. Crear usuarios, catálogos y operación comercial/producción
$env:NEXT_PUBLIC_SUPABASE_URL = (supabase status -o env | Select-String '^API_URL=').ToString().Split('=',2)[1]
$env:SUPABASE_SERVICE_ROLE_KEY = (supabase status -o env | Select-String '^SERVICE_ROLE_KEY=').ToString().Split('=',2)[1]
$env:CONFIRMAR_DEMO = 'si'
node supabase/semillas/demo-cliente.mjs sembrar

# 3. Completar propuestas, compras, facturas y tesorería (C10)
node supabase/semillas/demo-finanzas-c10.mjs
```

En PowerShell es más seguro exportar las variables desde `supabase status -o env` antes de ejecutar; `.env.local` puede apuntar al proyecto remoto.

## Acceso

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `ales_2_@hotmail.com` | `Demo2026!` |
| Ventas | `ventas@ccmanufacturing.mx` | `Demo2026!` |
| Gerencia | `gerencia@ccmanufacturing.mx` | `Demo2026!` |
| Finanzas | `finanzas@ccmanufacturing.mx` | `Demo2026!` |
| Operadores | `jorge.ramirez@…`, `luis.torres@…`, `sergio.pena@…` | PIN de piso (no password web) |

Los operadores se crean con contraseña aleatoria porque su acceso es por PIN; no se imprimen credenciales de operador.

## Qué datos deja

- 8 clientes, 4 proveedores, 10 materiales canónicos/legacy, 10 oportunidades y 8 líneas.
- 13 órdenes en todos los estados, 17 partidas, 13 programaciones, 9 sesiones, 2 entregas.
- 3 propuestas con revisión/costeo y snapshot de Orden para conciliación estimado/comprometido/real.
- 4 compras (material, subcontratación y gastos directos), 1 pago a proveedor y aviso de pago sin recepción.
- 2 facturas (1 emitida, 1 borrador) vinculadas a entregas/CxC.
- 6 CxC, 5 cobros, 10 gastos, saldos iniciales, transferencia enlazada y una conciliación.
- Comentarios, notificaciones y metas del vendedor.

## Verificación

```powershell
node supabase/semillas/demo-cliente.mjs verificar
```

Si se ejecuta `demo-finanzas-c10.mjs`, el conteo de `cuentas_bancarias` es 4 (se agrega HSBC para la transferencia demo); el verificador base ya lo contempla.

## Rollback

Antes del reinicio se guardan dumps en `.ai-shared/backups/` (schema y `--data-only`). Para volver al estado anterior, restaurar ambos dumps en el stack local; nunca usar `db push` ni tocar remoto para esto.
