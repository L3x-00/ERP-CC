# B2 — Módulo Clientes

Referencias del documento: §8 completo (pantallas, clave de datos, reglas), §6.1 (folio `CLI-####`), §17 (UX ficha/formulario).
Depende de: B0, B1 (archivos, audit, catálogos no requeridos). Es prerrequisito de B3 (RFQ usa cliente y contactos).

**Resultado del bloque:** cliente con folio global `CLI-####` atómico y no reutilizable; alta atómica cliente + contacto principal; contactos con baja lógica y un solo principal activo; pestaña "Comercial" con moneda, crédito habilitado, días y límite; cambio Activo/Inactivo por acción controlada; documentos versionados sin borrado silencioso; ficha con pestañas Resumen/Contactos/Comercial/Documentos/Historial.

---

## 2.1 Folio `CLI-####` atómico

**Documento (§8, §6.1):** "El código `CLI-####` es global, secuencial, atómico y nunca se reutiliza."

```sql
create sequence public.secuencia_folio_cliente start 1;
create or replace function public.generar_folio_cliente()
returns text language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  v := nextval('public.secuencia_folio_cliente');
  return 'CLI-' || lpad(v::text, 4, '0');
end $$;
alter table public.clientes add column folio text;
create unique index ux_clientes_folio on public.clientes (folio);
-- backfill idempotente: asignar en orden creado_en a clientes sin folio
-- trigger BEFORE INSERT: folio := coalesce(new.folio, private.generar_folio_cliente())
```

Reglas: EXECUTE solo `service_role`; el cliente nunca envía folio; jamas se reutiliza (aunque el cliente se inactive); si el backfill encuentra folios ya asignados, no los cambia.

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B2.1-01 | Migración `20261005200001_sii_b2_cliente_folio.sql` (secuencia, función, columna, backfill, trigger, unique) | SQL | pgTAP: unicidad, no reutilización, backfill idempotente |
| SII-B2.1-02 | Mostrar `CLI-####` en lista, ficha, historial y buscadores | UI | Unitarias de mapper + E2E |
| SII-B2.1-03 | Concurrencia: dos altas simultáneas nunca repiten folio | Integración | `test:concurrencia` |

---

## 2.2 Alta atómica cliente + contacto principal

**Documento (§8.3):** "Cliente + contacto principal se crea de forma atómica."

**Decisión:** RPC `crear_cliente_con_contacto(p_datos jsonb, p_actor uuid)` que crea ambas filas en una transacción; si falla cualquiera, no queda nada. El formulario maestro de alta usa esta RPC; la edición sigue por acciones parciales.

```sql
-- firma
public.crear_cliente_con_contacto(p_datos jsonb, p_actor uuid) returns jsonb
-- datos: nombre_comercial*, razon_social*, rfc?, correo?, telefono?, moneda*, condiciones_pago,
--        credito_habilitado, dias_credito, limite_credito, direcciones?,
--        contacto: { nombre*, puesto?, telefono?, correo? }
```

Reglas: valida actor activo con `CLIENTE_EDITAR` (o perfil admin); dedup existente por RFC/correo/razón social (se conserva: error `cliente_duplicado` con el folio existente para que el usuario decida); el contacto se marca principal; audita con `correlationId`.

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B2.2-01 | RPC transaccional + errores tipados | Migración | pgTAP: rollback completo si falla el contacto; duplicados |
| SII-B2.2-02 | Formulario maestro de alta con secciones General/Contacto/Comercial y validación Zod | UI + acción | Unitarias + E2E |
| SII-B2.2-03 | Migrar alta rápida desde RFQ (B3) a la misma RPC | Código | Integración |

---

## 2.3 Contactos: un solo principal activo y baja lógica

**Documento (§8.3):** "Solo un contacto principal activo"; "no eliminar clientes históricos" (aplica análogo a contactos).

```sql
alter table public.contactos_cliente
  add column activo boolean not null default true,
  add column desactivado_en timestamptz,
  add column desactivado_por uuid references public.usuarios(id);
-- reemplazar índice principal por parcial con activo
drop index ux_contactos_cliente_principal;
create unique index ux_contactos_cliente_principal_activo
  on public.contactos_cliente (cliente_id) where es_principal and activo;
```

Acciones: `desactivar_contacto_cliente` (baja lógica, no borra), `marcar_contacto_principal` (quita el anterior y marca el nuevo en una transacción), `reactivar_contacto`. La acción antigua de hard delete se retira de la UI (la RPC puede conservarse bloqueada).

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B2.3-01 | Migración columnas + índice parcial + backfill (`activo=true`) | SQL | pgTAP índice único |
| SII-B2.3-02 | RPCs marcar principal / desactivar / reactivar con auditoría y CAS | Migración | pgTAP: dos principales simultáneos fallan; concurrencia |
| SII-B2.3-03 | UI de contactos con estados y confirmaciones | Componentes | E2E + visual |

---

## 2.4 Pestaña Comercial

**Documento (§8.2):** "Moneda MXN/USD*, crédito sí/no, días de crédito, límite de crédito"; §8.1 pestañas "Resumen, Contactos, Comercial, Documentos, Historial".

```sql
alter table public.clientes
  add column moneda text not null default 'MXN' check (moneda in ('MXN','USD')),
  add column credito_habilitado boolean not null default false,
  add column dias_credito integer check (dias_credito between 0 and 365);
-- coherencia: si credito_habilitado=false → dias_credito=0 y limite_credito=0 (CHECK)
```

Reglas: moneda obligatoria (default MXN); días de crédito editables solo con `CLIENTE_COMERCIAL`; límite > 0 con `ver_finanzas` (regla vigente); el crédito usado/alertas existentes siguen funcionando; `condiciones_pago` se conserva y se sincroniza con `credito_habilitado`/`dias_credito` (contado = crédito no).

**Tareas:** migración, mapper, pestaña Comercial con resumen (tier, crédito usado/disponible, historial de cambios), pruebas unitarias de coherencia.

---

## 2.5 Estado Activo/Inactivo por acción controlada

**Documento (§8.2):** "Estado Activo/Inactivo mediante acción controlada"; §8.3 "No eliminar clientes históricos".

**Decisión:** se conserva `prospecto` como estado inicial heredado (el documento no lo menciona: comportamiento actual que no se debe cambiar sin orden), pero **toda transición pasa por RPC** `cambiar_estado_cliente(p_cliente_id, p_nuevo_estado, p_motivo, p_actor, p_actualizado_en)` con CAS, motivo obligatorio para inactivar, permiso `CLIENTE_EDITAR` y auditoría. No existe acción de borrado de cliente.

Transiciones permitidas: `prospecto → activo | inactivo`; `activo → inactivo`; `inactivo → activo`. Inactivo no participa en flujos nuevos (RFQ exige cliente activo como hoy), pero conserva historial completo.

---

## 2.6 Documentos versionados sin borrado silencioso

**Documento (§8.3):** "Documentos privados y versionados lógicamente; sin borrado silencioso."

**Decisión:** migrar `documentos_cliente` (tipos csf/contrato/identificacion/comprobante_domicilio/otro) al modelo `archivos` de B1.9 (`entidad='cliente'`, `clase='documento'`, `tema_codigo=tipo`). Reemplazo con versión nueva + `reemplaza_a`; "eliminar" = `vigente=false` con motivo y auditoría. La tabla anterior queda de solo lectura y se elimina en limpieza futura autorizada.

**Tareas:** backfill idempotente, acciones de subida/reemplazo, pestaña Documentos con historial de versiones y descarga firmada 60–300 s, E2E de reemplazo trazado.

---

## 2.7 Pantallas del módulo (§8.1 + §17)

1. **Lista / Work Queue** (`/clientes`): buscador por folio/nombre/RFC/correo; filtros estado/tier/moneda/crédito; columnas folio, nombre, contactos activos, moneda, crédito, estado; acciones de fila (abrir ficha, editar).
2. **Ficha** (`/clientes?cliente=<id>`): encabezado con nombre + chip de estado + folio; acciones de negocio arriba (Editar, Activar/Inactivar, Nuevo RFQ); pestañas Resumen, Contactos, Comercial, Documentos, Historial.
3. **Formulario maestro** de alta/edición reutilizable (mismas secciones que la ficha; alta pasa por RPC atómica).
4. **Historial** existente (cotizaciones/órdenes/notas) se enriquece con accesos a RFQ/propuestas (B3/B4) cuando existan.

**Tareas:** reorganización de ficha en pestañas Comercial y Documentos (hoy General/Contactos/Direcciones/Documentos/Historial/Comentarios; Direcciones pasa a General), E2E del flujo completo, capturas visuales 1440/768 claro/oscuro.

---

## 2.8 Criterios de aceptación del bloque

1. Todo cliente nuevo recibe `CLI-####`; ningún folio se repite ni se reutiliza (pgTAP + concurrencia).
2. Alta atómica: cliente sin contacto principal no puede persistir (test de rollback).
3. Solo un contacto principal activo por cliente (índice + prueba de carrera).
4. Ficha con pestañas del documento y acciones de negocio visibles arriba.
5. Documentos con reemplazo versionado y sin borrado silencioso.
6. Estado solo cambia por acción auditada; no existe borrado de clientes.
7. Gates §0.9 + regresión E2E de clientes y pipeline.

**Exclusiones:** portal del cliente, fusión de clientes duplicados, campos fiscales adicionales no listados en el documento.
