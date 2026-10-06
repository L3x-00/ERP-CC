# B8 — Finanzas (fase posterior)

Referencias del documento: §14 completo (facturación/CxC, cobranza, compras/gastos/CxP, tesorería), §6.1 (folios `RP-MMYY_XX-YY`, `CG-MMYY_####`), §16.5 (qué postergar).
Depende de: B7. **Este bloque es de diseño con validación del PO; las fases F1–F5 se implementan solo con autorización explícita (repetida por fase).** F1–F5 quedaron implementadas y verificadas el 2026-10-06 (§8.5–§8.9); el bloque está completo localmente a falta del commit del PO. El primer Go Live puede operar sin sustituir facturación/cobro (§14).

**Objetivo:** dejar la arquitectura lista para conectar `Entrega → Facturación → CxC → Cobranza` y `Compras/Gastos/CxP → Tesorería`, sin romper lo ya construido (CxC con pagos idempotentes, reversos, anulación, anticipos y monedero; gastos con OCR).

---

## 8.1 Estado actual y brechas

| Submódulo | Hoy | Falta según documento |
|---|---|---|
| Facturación | Adjuntar folio fiscal a una AR existente (`registrar_factura_ar`) | Borrador administrativo de factura, folio fiscal propio por periodo, términos por cliente, vínculo explícito entrega→factura |
| CxC | AR con saldo, aging, pagos, reversos, anulación, anticipos, monedero | Promesa de pago; términos por cliente ya existen (`condiciones_pago` + `dias_credito` B2) |
| Cobranza | Pago aplicado a una AR; sobrepago a monedero | Aplicaciones many-to-many de un pago a varias AR; folio de recibo `RP-MMYY_XX-YY` |
| Compras/Gastos/CxP | `gastos` con `GTO-######`, estado de pago, OCR | Compras/órdenes de compra, pagos a proveedores, CxP formal, folio `CG-MMYY_####` |
| Tesorería | Catálogo de cuentas + flujo informativo | 2 cuentas bancarias + efectivo como cuentas contables; transferencias internas (no ingreso/gasto); saldos |

---

## 8.2 Diseño objetivo (DDL tentativo, no implementar aún)

```sql
-- Facturación
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  folio_fiscal text,                       -- capturado del PAC/CFDI (no se timbra en el ERP)
  rfc_receptor text, uuid_fiscal text,
  cliente_id uuid not null references public.clientes(id),
  entrega_id uuid references public.notas_entrega(id),
  subtotal numeric(14,4), iva numeric(14,4), total numeric(14,4),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR','EMITIDA','CANCELADA')),
  emitida_en timestamptz, cancelada_en timestamptz,
  creado_por uuid, creado_en timestamptz not null default now()
);
-- CxC: una AR puede nacer de factura o de orden (comportamiento vigente)
alter table public.cuentas_por_cobrar add column factura_id uuid references public.facturas(id);

-- Cobranza many-to-many
create table public.aplicaciones_pago (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos_ar(id),
  cuenta_id uuid not null references public.cuentas_por_cobrar(id),
  monto numeric(14,4) not null check (monto > 0),
  creado_en timestamptz not null default now(),
  unique (pago_id, cuenta_id)
);
create table public.promesas_pago (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_por_cobrar(id),
  fecha_prometida date not null, monto numeric(14,4) not null,
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE','CUMPLIDA','VENCIDA','CANCELADA')),
  creado_por uuid, creado_en timestamptz not null default now()
);

-- Compras / CxP
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  folio_sii text unique,                   -- CG-MMYY_####
  proveedor_id uuid, orden_id uuid references public.ordenes_produccion(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR','CONFIRMADA','RECIBIDA','PAGADA','CANCELADA')),
  subtotal numeric(14,4), iva numeric(14,4), total numeric(14,4),
  creado_por uuid, creado_en timestamptz not null default now()
);

-- Tesorería
create table public.movimientos_tesoreria (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_bancarias(id),
  tipo text not null check (tipo in ('COBRO','PAGO','TRANSFERENCIA_ENTRADA','TRANSFERENCIA_SALIDA','SALDO_INICIAL')),
  monto numeric(14,4) not null, moneda text not null default 'MXN',
  referencia text, par_movimiento_id uuid references public.movimientos_tesoreria(id),
  creado_por uuid, creado_en timestamptz not null default now()
);
```

Regla clave: **las transferencias internas entre cuentas no son ingreso ni gasto** (par de movimientos enlazados que se excluyen de KPIs); el efectivo se modela como una cuenta `efectivo`.

---

## 8.3 Fases de implementación (solo al autorizar)

| Fase | Alcance | Depende | Estado |
|---|---|---|---|
| F1 | Folio `RP-MMYY_XX-YY` para recibos nuevos + `solicitud_id` en cobros legacy | B7 | **COMPLETADA localmente 2026-10-06** (§8.5): migraciones `20261007160001/0002`, pgTAP 12/12, E2E `cobranza-folio-rp`; la idempotencia por `solicitud_id` ya existía. |
| F2 | Factura borrador + vínculo entrega→facturación→CxC (sin timbrado CFDI) | F1 | **COMPLETADA localmente 2026-10-06** (§8.6): migración `20261007170001`, pgTAP 19/19, E2E `facturacion-flujo`; UI `/facturacion`. |
| F3 | Aplicaciones many-to-many + promesas de pago (**con recordatorios**, decisión PO 2026-10-06) | F1 | **COMPLETADA localmente 2026-10-06** (§8.7): migraciones `20261007180001`–`0005`, pgTAP 27/27, E2E `cobranza-cobro-multiple`; UI en `/cobranza`. |
| F4 | Compras/CxP con folio `CG-MMYY_####` y pagos a proveedores | F2 | **COMPLETADA localmente 2026-10-06** (§8.8): migraciones `20261007190001/0002`, pgTAP 29/29, E2E `compras-flujo`; UI `/compras`. |
| F5 | Tesorería: saldos, transferencias internas, conciliación básica | F4 | **COMPLETADA localmente 2026-10-06** (§8.9): migraciones `20261007200001`–`0003`, pgTAP 27/27, E2E `tesoreria-flujo`; UI `/tesoreria`. |

Cada fase repite los gates §0.9 y exige autorización explícita del PO. El ERP no timbra CFDI: solo registra folios fiscales capturados (decisión alineada con §2: "no pretende sostener la estabilidad fiscal ni CFDI").

---

## 8.4 Criterios de diseño a validar por el PO antes de implementar

> **Respondidos por el PO el 2026-10-06** (registro en `.ai-shared/memory/decisions/ADR-SII-B8-FINANZAS-20261006.md`).

1. ¿La AR seguirá naciendo al aprobar (no cobrable) y activándose al entregar, o nacerá de la factura cuando exista? **Decidido: conservar el flujo actual (D-04) y vincular la factura cuando aplique.**
2. ¿Los gastos migran a folio `CG-MMYY_####` para registros nuevos conservando `GTO-######` históricos? **Decidido: sí, nuevos registros con `CG`; los históricos conservan `GTO` (fase F4).**
3. ¿Promesas de pago requieren recordatorios/notificaciones? **Decidido: sí, con recordatorios (fase F3).**

## 8.5 Estado F1 — folio de recibo `RP-MMYY_XX-YY` (2026-10-06)

- **Derivación decidida por el PO:** espejo del `NE` — `XX` = sufijo del `folio_sii` de la orden (`O-/OI-MMYY_XX`); `YY` = consecutivo de recibos de esa orden (`CASE` a partir de 100). Órdenes históricas sin `folio_sii` conservan `REC-######`.
- **Migraciones:** `20261007160001_sii_b8_folio_recibo.sql` (CHECK dual `REC`/`RP`, `privado.siguiente_folio_recibo` con advisory lock por orden, `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` recreadas sin cambiar firmas) y `20261007160002_sii_b8_folio_recibo_limpieza.sql` (retira el índice redundante; ya existía `pagos_ar_folio_recibo_key`).
- **Regla clave:** la idempotencia por `solicitud_id` no cambió; un reintento devuelve el mismo folio. Los folios nunca se reutilizan (el conteo incluye recibos reversados).
- **Evidencia:** pgTAP `sii_b8_folio_recibo` 12/12 (espejo OI, consecutivo 01→02, monedero 03, fallback REC, idempotencia, CHECK y unicidad) · pgTAP global 980/980 · unit 935/935 · E2E `cobranza-folio-rp` + regresión de cobranza 6/6 · build OK · capturas en `.ai-shared/qa/sii-b8-f1/visual/`.
- **Pendiente del PO:** aplicar en remoto `20261007160001` y `20261007160002` (después de `20261007120005`).

## 8.6 Estado F2 — Facturación: borrador y vínculo entrega→factura→CxC (2026-10-06)

- **Decisiones del PO:** montos precargados desde la AR y editables (F2.1); una factura por entrega (F2.2); emitir vincula la AR —`factura_id`, `folio_factura_remision` y vencimiento por términos del cliente— (F2.3); cancelar con motivo desvincula la AR y permite re-facturar conservando el vencimiento (F2.4).
- **Migración:** `20261007170001_sii_b8_facturacion.sql` — tabla `public.facturas` (BORRADOR→EMITIDA→CANCELADA, folio fiscal único, una activa por entrega), columna `cuentas_por_cobrar.factura_id` (única), RLS de lectura con `ver_finanzas` y RPC `crear_factura_borrador` / `actualizar_factura_borrador` (CAS) / `emitir_factura` / `cancelar_factura` (solo `service_role`).
- **UI:** ruta `/facturacion` (Finanzas) con cola de borradores/emitidas/canceladas, alta desde entregas sin factura activa, edición con CAS, emisión con folio capturado del PAC y cancelación; botón “Facturar entrega” en el detalle de la entrega (`/entregas/[id]`).
- **Compatibilidad:** el flujo vigente de `registrar_factura_ar` (folio directo sobre la AR desde `/cobranza`) no se modifica; D-04 (activación de AR al entregar) queda intacto y una AR por-entregar conserva vencimiento NULL al facturarse.
- **Evidencia:** pgTAP `sii_b8_facturacion` 19/19 · pgTAP global 999/999 · unit 940/940 · E2E `facturacion-flujo` + regresión entregas/cobranza 5/5 · build OK · capturas 4/4 en `.ai-shared/qa/sii-b8-f2/visual/`.
- **Pendiente del PO:** aplicar en remoto `20261007170001` (tras `20261007160002`).

## 8.7 Estado F3 — Aplicaciones many-to-many y promesas de pago (2026-10-06)

- **Decisiones del PO:** recibo único aplicable a varias facturas del mismo cliente (F3.1); folio `RP-MMYY_0000-YY` con contador global del periodo para cobros repartidos (F3.2); recordatorios internos 2 días antes y al vencer, para usuarios con `registrar_pagos` y el creador (F3.3); promesa CUMPLIDA automáticamente al pagarse su factura (F3.4).
- **Migraciones:** `20261007180001` (tablas `aplicaciones_pago` y `promesas_pago`, `pagos_ar.ar_id`/`reversos_pago_ar.ar_id` nullable con backfill de aplicaciones, RLS/grants), `20261007180002` (motores: `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` registran su aplicación y cumplen promesas; `reversar_pago_ar` por aplicaciones —legacy y repartido—; folio múltiple; `registrar_cobro_multiple`; RPC de promesas y procesador de recordatorios; **corrige los literales acentuados del motor recreado en F1**), `20261007180003` (CHECK del folio admite el sufijo reservado `0000`), `20261007180004` (aplicaciones sin `ON CONFLICT` ambiguo), `20261007180005` (recordatorios con `tipo=alerta_sistema` y enlace interno `/ordenes?ordenId=`, compatibles con los CHECK de `notificaciones_usuario`).
- **UI:** botón “Cobro múltiple” y modal con selección de cliente/facturas y montos por AR; botón “Promesa” por cuenta con alta/cancelación; los recordatorios se materializan al abrir `/cobranza` o el centro de notificaciones (idempotente).
- **Compatibilidad:** el flujo 1-AR y el modal de facturación por AR quedan intactos; el reverso conserva valores históricos y funciona con recibos repartidos.
- **Evidencia:** pgTAP `sii_b8_cobros_promesas` 27/27 · global 1026/1026 · unit 944/944 · E2E `cobranza-cobro-multiple` 1/1 + regresión cobranza/facturación 5/5 · build OK · capturas 2/2 en `.ai-shared/qa/sii-b8-f3/visual/`.
- **Pendiente del PO:** aplicar en remoto `20261007180001`–`20261007180005` (tras `20261007170001`). Riesgo heredado: colisión de folios `O-`/`OI-` sigue pendiente de decisión.

## 8.8 Estado F4 — Compras/CxP con folio CG y pagos a proveedores (2026-10-06)

- **Decisiones del PO:** compra = cabecera (proveedor, orden opcional, montos, vencimiento, notas) con estados BORRADOR→CONFIRMADA→RECIBIDA→PAGADA/CANCELADA (F4.1); serie `CG-MMYY_####` **compartida** entre compras y gastos nuevos (F4.2); pagos parciales con saldo (F4.3); las compras **no** entran a la rentabilidad (F4.4).
- **Migraciones:** `20261007190001` (tablas `compras` y `pagos_compra` con RLS, `gastos.folio_sii` con CHECK/único, generador `privado.siguiente_folio_cg` con advisory lock por periodo y máximo real entre ambas tablas) y `20261007190002` (`registrar_gasto` recreada asigna `folio_sii` CG conservando el GTO interno; RPC `crear_compra`, `actualizar_compra_borrador`, `cambiar_estado_compra` y `pagar_compra`).
- **UI:** ruta `/compras` (Finanzas) con cola filtrable, alta/edición en borrador, confirmar/recibir, pagar (parcial/total) y cancelar con motivo; los gastos nuevos muestran su folio CG (el histórico conserva GTO) y la búsqueda de gastos lo incluye.
- **Compatibilidad:** `registrar_gasto` mantiene su firma y el folio interno GTO; cobranza/facturación/rentabilidad quedan intactas (rentabilidad sigue leyendo gastos).
- **Evidencia:** pgTAP `sii_b8_compras` 29/29 · global 1055/1055 · unit 948/948 · E2E `compras-flujo` 1/1 + regresión gastos 3/3 · build OK · capturas 4/4 en `.ai-shared/qa/sii-b8-f4/visual/`.
- **Pendiente del PO:** aplicar en remoto `20261007190001` y `20261007190002` (tras `20261007180005`).

## 8.9 Estado F5 — Tesorería: saldos, transferencias y conciliación (2026-10-06)

- **Decisiones del PO:** saldo inicial por cuenta + movimientos vivos (sin ledger duplicado, F5.1); efectivo como cuenta con `tipo` banco/efectivo (F5.2); transferencias internas como par enlazado de la misma moneda, fuera de KPIs (F5.3); conciliación básica por marca manual auditada, sin importar extractos (F5.4).
- **Migraciones:** `20261007200001` (tipo de cuenta, `saldos_iniciales_tesoreria`, `movimientos_tesoreria` en par enlazado y `conciliaciones_tesoreria` únicos por movimiento, con RLS de lectura), `20261007200002` (RPC `registrar_saldo_inicial`, `registrar_transferencia`, `conciliar_movimiento` y `desconciliar_movimiento`) y `20261007200003` (RETURNING calificado por alias).
- **Saldos:** en la moneda de la cuenta — inicial + cobros con cuenta − pagos a proveedores − gastos pagados con cuenta ± transferencias; los gastos USD→cuenta MXN se convierten con su TC. La sección “Flujo por cuenta” de Cobranza sigue siendo la vista consolidada MXN.
- **UI:** ruta `/tesoreria` (Finanzas) con tarjetas por cuenta (banco/efectivo, saldo actual, conciliados), captura de saldo inicial, registro de transferencias y conciliación/desconciliación por movimiento con auditoría.
- **Evidencia:** pgTAP `sii_b8_tesoreria` 27/27 · global 1082/1082 · unit 951/951 · E2E `tesoreria-flujo` 1/1 · build OK (ruta `/tesoreria`) · capturas 4/4 en `.ai-shared/qa/sii-b8-f5/visual/`.
- **Pendiente del PO:** aplicar en remoto `20261007200001`–`0003` (tras `20261007190002`). Con F5 cerrada, **B8 queda completo localmente** a falta de commit y publicación.
