# B8 — Finanzas (fase posterior)

Referencias del documento: §14 completo (facturación/CxC, cobranza, compras/gastos/CxP, tesorería), §6.1 (folios `RP-MMYY_XX-YY`, `CG-MMYY_####`), §16.5 (qué postergar).
Depende de: B7. **Este bloque es de diseño con validación del PO; las fases F1–F5 se implementan solo con autorización explícita (repetida por fase).** F1 quedó implementada y verificada el 2026-10-06 (§8.5); F2–F5 siguen pendientes de autorización. El primer Go Live puede operar sin sustituir facturación/cobro (§14).

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
| F2 | Factura borrador + vínculo entrega→facturación→CxC (sin timbrado CFDI) | F1 | PENDIENTE (autorización del PO) |
| F3 | Aplicaciones many-to-many + promesas de pago (**con recordatorios**, decisión PO 2026-10-06) | F1 | PENDIENTE (autorización del PO) |
| F4 | Compras/CxP con folio `CG-MMYY_####` y pagos a proveedores | F2 | PENDIENTE (autorización del PO) |
| F5 | Tesorería: saldos, transferencias internas, conciliación básica | F4 | PENDIENTE (autorización del PO) |

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
