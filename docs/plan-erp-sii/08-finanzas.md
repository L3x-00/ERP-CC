# B8 — Finanzas (fase posterior)

Referencias del documento: §14 completo (facturación/CxC, cobranza, compras/gastos/CxP, tesorería), §6.1 (folios `RP-MMYY_XX-YY`, `CG-MMYY_####`), §16.5 (qué postergar).
Depende de: B7. **Este bloque es de diseño ahora y de implementación solo cuando el PO autorice la fase**; el primer Go Live puede operar sin sustituir facturación/cobro (§14).

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

| Fase | Alcance | Depende |
|---|---|---|
| F1 | Folio `RP-MMYY_XX-YY` para recibos nuevos + `solicitud_id` en cobros legacy | B7 |
| F2 | Factura borrador + vínculo entrega→facturación→CxC (sin timbrado CFDI) | F1 |
| F3 | Aplicaciones many-to-many + promesas de pago | F1 |
| F4 | Compras/CxP con folio `CG-MMYY_####` y pagos a proveedores | F2 |
| F5 | Tesorería: saldos, transferencias internas, conciliación básica | F4 |

Cada fase repite los gates §0.9 y exige autorización explícita del PO. El ERP no timbra CFDI: solo registra folios fiscales capturados (decisión alineada con §2: "no pretende sostener la estabilidad fiscal ni CFDI").

---

## 8.4 Criterios de diseño a validar por el PO antes de implementar

1. ¿La AR seguirá naciendo al aprobar (no cobrable) y activándose al entregar, o nacerá de la factura cuando exista? (propuesta: conservar el flujo actual y vincular factura cuando aplique).
2. ¿Los gastos migran a folio `CG-MMYY_####` para registros nuevos conservando `GTO-######` históricos?
3. ¿Promesas de pago requieren recordatorios/notificaciones? (no implementar sin pedido).
