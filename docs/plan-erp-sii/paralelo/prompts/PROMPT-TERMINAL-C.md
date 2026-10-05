# Prompt — TERMINAL C · Stream B2: Clientes

Trabajas como desarrollador autónomo en el repo `D:\ERP-CC` (Next.js 16 + Supabase), en paralelo con otras 2 terminales. **Lee primero** `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` y cúmplelo al pie de la letra. Tu stream no toca archivos de A ni de B.

## Lecturas obligatorias

1. `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`.
2. `docs/plan-erp-sii/02-clientes.md` completo (tu bloque).
3. `docs/ERP_SII_Handoff_Tecnico_Funcional.md` §8 (clientes), §6.1 (folio CLI-####), §17.
4. `docs/plan-erp-sii/00-fundamentos.md` §0.8 y §0.6.

Estado de partida: E1 (permisos) y E3 (archivos) implementados y commiteados. **Los documentos del cliente ya viven en el modelo `archivos`** (subida y lectura con versiones): no los migres de nuevo; completa lo que falta (pestaña Documentos con historial de versiones y reemplazo trazado).

## Objetivo

Cerrar B2: folio `CLI-####`, alta atómica cliente + contacto principal, contactos con baja lógica y un solo principal activo, pestaña Comercial (moneda/crédito/días/límite), estado por acción, ficha con pestañas del documento y cola de trabajo.

## Migraciones (banda propia `2026100630xxxx`)

Crea los archivos manualmente (NO uses `supabase migration new`):

1. `20261006300001_sii_b2_cliente_folio.sql`
2. `20261006300002_sii_b2_cliente_comercial_estado.sql`
3. `20261006300003_sii_b2_contactos_logicos.sql`

### 1) Folio `CLI-####`

```sql
create sequence if not exists public.secuencia_folio_cliente start 1;
create or replace function public.generar_folio_cliente() returns text
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  v := nextval('public.secuencia_folio_cliente');
  return 'CLI-' || lpad(v::text, 4, '0');
end $$;
alter table public.clientes add column if not exists folio text;
create unique index if not exists ux_clientes_folio on public.clientes (folio);
-- Backfill idempotente en orden creado_en para clientes sin folio.
-- Trigger BEFORE INSERT que asigna folio si viene null.
-- Grants: EXECUTE solo service_role; REVOKE de PUBLIC/anon/authenticated.
```
Reglas: global, secuencial, atómico, **nunca se reutiliza** (aunque el cliente se inactive); el cliente nunca envía folio.

### 2) Comercial y estado por acción

```sql
alter table public.clientes
  add column if not exists moneda text not null default 'MXN',
  add column if not exists credito_habilitado boolean not null default false,
  add column if not exists dias_credito integer;
-- CHECK moneda in ('MXN','USD')
-- CHECK coherencia: credito_habilitado=true → dias_credito 1..365;
--                   credito_habilitado=false → dias_credito null o 0
-- Backfill desde condiciones_pago: contado→false/0, 15_dias→true/15,
--                                 30_dias→true/30, credito→true/45
```
RPC `public.crear_cliente_con_contacto(p_datos jsonb, p_actor uuid)` (`SECURITY DEFINER`, `search_path=''`, solo `service_role`): valida actor activo con `cliente_editar` (o admin), dedup por RFC/correo/razón social (`cliente_duplicado` con folio existente), inserta cliente + contacto principal **en una transacción**; devuelve `{clienteId, folio, contactoId}`; audita con `correlation_id` cuando exista.

RPC `public.cambiar_estado_cliente(p_cliente_id uuid, p_nuevo_estado text, p_motivo text, p_actor uuid, p_actualizado_en timestamptz)`: CAS con `actualizado_en`; transiciones `prospecto→activo|inactivo`, `activo→inactivo`, `inactivo→activo`; motivo obligatorio para inactivar; error tipado `cliente_desactualizado`/`estado_invalido`/`motivo_requerido`; **no existe RPC de borrado**.

### 3) Contactos lógicos

```sql
alter table public.contactos_cliente
  add column if not exists activo boolean not null default true,
  add column if not exists desactivado_en timestamptz,
  add column if not exists desactivado_por uuid references public.usuarios(id);
drop index if exists ux_contactos_cliente_principal;
create unique index if not exists ux_contactos_cliente_principal_activo
  on public.contactos_cliente (cliente_id) where es_principal and activo;
```
RPC `marcar_contacto_principal` (quita el anterior y marca el nuevo en una transacción con lock del cliente), `desactivar_contacto_cliente` (baja lógica, motivo, auditoría), `reactivar_contacto_cliente`. Elimina de la UI el borrado duro (`eliminar-contacto-cliente.ts` deja de usarse; consérvalo bloqueado o retíralo con cuidado).

## Código y UI (dueño: tú, `src/modulos/clientes/**`)

- Acciones: `crear-cliente.ts` usa la RPC atómica (mantén compatibilidad: si algo ya llama sin contacto, permite `contacto` opcional), `actualizar-cliente.ts` incorpora moneda/crédito/días/límite sincronizando `condiciones_pago`; nueva acción de estado; acciones de contactos.
- Ficha con pestañas del documento: **Resumen, Contactos, Comercial, Documentos, Historial** (Direcciones pasa a Resumen; la funcionalidad de comentarios existente se conserva visible, puede quedar como pestaña adicional). Acciones de negocio arriba (Editar, Activar/Inactivar, Nuevo RFQ).
- Pestaña Comercial: moneda MXN/USD, crédito sí/no, días, límite, tier y crédito usado/disponible (lo existente).
- Pestaña Documentos: lista las versiones vigentes del modelo `archivos` (ya conectado en E3) y permite **reemplazar** (subida con el mismo nombre ERP genera versión nueva) y ver historial de versiones.
- Lista `/clientes`: columna folio, buscador por folio/nombre/RFC/correo y filtros actuales + moneda/crédito.
- **Compatibilidad obligatoria:** no rompas consumidores en `src/modulos/pipeline/**` (alta rápida, `promover-a-cliente`, `vincular-desde-pipeline`). Si un cambio de firma es imprescindible, repórtalo como bloqueo; no edites pipeline.
- Tipos: edita `src/compartido/tipos/supabase.ts` con el protocolo §4 del PROTOCOLO (bloqueo de tipos).

## Pruebas

- pgTAP `supabase/tests/sii_b2_clientes.test.sql`: folio único/no reutilizable/backfill/trigger; coherencia de crédito; RPC atómica (rollback si falla el contacto; duplicado); transiciones de estado y CAS; índice de principal activo (dos principales falla); baja lógica.
- Unitarias `tests/unitarias/clientes-*.test.ts`: validaciones nuevas (moneda/días/crédito), coherencia con `condiciones_pago`, principal activo, mapeos de ficha.
- E2E `tests/e2e/clientes-ficha.spec.ts` (nuevo): alta atómica desde UI (cliente + contacto principal), folio visible, cambio a Comercial (moneda + crédito), inactivar/activar con motivo, contacto principal único; **actualiza** `clientes-contactos.spec.ts` si el flujo de baja cambió. Capturas 1440/768 claro/oscuro en `.ai-shared/qa/sii-b2/visual/`.
- Regresión: `clientes-historial.spec.ts`, `aceptacion-comercial.spec.ts` y `archivos-cliente.spec.ts` verdes.

## Gates y reporte

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `supabase test db`, `pnpm test:integracion`, E2E focal + regresión, `pnpm build`. Usa los bloqueos del protocolo para pruebas mutantes/E2E.
Reporta las 3 migraciones al PO para que las aplique (no las apliques tú) y registra avance en `docs/plan-erp-sii/paralelo/estado/TERMINAL-C.md` (formato §7 del protocolo).

## Exclusiones

No toques catálogos/configuración (A), auditoría/actividad (B), pipeline, RFQ, propuestas, órdenes, producción ni el núcleo de archivos (`src/nucleo/almacenamiento/archivos/**` congelado). No hagas git add/commit.
