# Cuestionario final de decisiones — ERP SII/CC (cierre del plan)

**Para:** dueño del software (cliente).
**Objetivo:** cerrar las decisiones que la implementación dejó explícitamente pendientes. Todo lo
demás ya quedó implementado y verificado (plan B1–B9 completo localmente).

## Instrucciones

1. Responda **solo** las preguntas donde quiera cambiar la opción propuesta; si deja una en blanco,
   se aplica la opción marcada como *Default*.
2. Cada pregunta indica el impacto técnico y qué está implementado hoy, para que la respuesta sea
   informada.
3. Las respuestas se registran como decisión (ADR/plan) y, cuando cambien una regla del documento
   del cliente, se actualiza primero la especificación y después el sistema (§23).

---

## 1. Folios derivados cuando coexisten órdenes `O-` y `OI-` del mismo mes

**Situación hoy:** el documento define `O-MMYY_XX`, `OI-MMYY_XX`, `NE-MMYY_XX-YY` (entregas) y
`RP-MMYY_XX-YY` (recibos). Una orden comercial `O-2610_05` y una interna `OI-2610_05` pueden tomar el
mismo `XX` en el mismo mes; sus entregas/recibos derivados colisionarían y el sistema lo detecta y
falla (índice único), sin corromper datos.

**Opciones:**
- A) Mantener el formato del documento tal cual y regla operativa: no coexistir con el mismo `XX` en
  el mes; si ocurre, renumerar la orden interna manualmente. *(literal al documento)*
- B) **Desambiguar los folios derivados con el prefijo de origen:** `NE-O-2610_05-01` /
  `NE-OI-2610_05-01` (y `RP-...` igual). Conserva `O-`/`OI-` y sus contadores; solo cambia la
  nomenclatura de entregas/recibos y se actualiza el documento. **(Default)**
- C) Compartir un solo contador mensual: `O-` usa `01–499` y `OI-` usa `500–999` (mismo formato,
  sin colisiones, cambia la numeración interna).

**Impacto:** B5/B7/B8-F1 (folio NE/RP). **Respuesta:** ______

---

## 2. Jornada exacta por turno (horas extra y capacidad)

**Situación hoy:** la jornada es configurable por recurso/turno; si no se captura, el sistema usa
8 h. Las horas extra se autorizan al exceder la jornada configurada del turno (Management/Admin).

**Opciones:**
- A) **Jornada estándar de 8 h por turno**, ajustable por recurso (override) cuando aplique.
  **(Default)**
- B) Otro valor estándar: matutino ____ h, vespertino ____ h, otro turno ____ h.
- C) Diferenciar por recurso desde el inicio (indicar tabla de valores).

**Impacto:** B6 (producción/horas extra), B9 (utilización). **Respuesta:** ______

---

## 3. Recordatorios de promesas de pago

**Situación hoy:** implementado con aviso interno **2 días antes** del vencimiento y otro al quedar
**vencida**, para usuarios con permiso de pagos y el creador de la promesa.

**Opciones:**
- A) **Mantener 2 días antes + vencida.** **(Default)**
- B) Otra anticipación: ____ días antes.
- C) Solo aviso al quedar vencida.

**Impacto:** B8-F3. **Respuesta:** ______

---

## 4. Plazo de crédito estándar (condición de pago `credito`)

**Situación hoy:** `contado` vence el día de la entrega; `15_dias` y `30_dias` a 15/30 días; y
`credito` **45 días calendario tras la entrega total** (regla vigente). Al emitir factura, el sistema
recalcula el vencimiento con la misma regla (ya corregido y probado).

**Opciones:**
- A) **Mantener 45 días para `credito`.** **(Default)**
- B) Usar días por cliente (existe el campo de días de crédito por cliente, hoy no habilitado en la
  fórmula): especificar si sustituye los 45 para `credito`.
- C) Otro plazo: ____ días.

**Impacto:** Cobranza/AR (D-04/A16). **Respuesta:** ______

---

## 5. Validación del diccionario de KPIs con aproximaciones

**Situación hoy:** el diccionario §9.3 está implementado en el dashboard con estas aproximaciones:
- Utilización = horas reales ÷ capacidad nominal (equipos × jornada × días del rango).
- WIP valorado con la tarifa interna más reciente de cada partida (las partidas sin tarifa valen 0 y
  se contabilizan aparte).
- Scrap de partida se atribuye a las órdenes con actividad en el rango.

**Opciones:**
- A) **Aceptar las aproximaciones documentadas.** **(Default)**
- B) Ajustar alguna fórmula (indicar cuál y cómo).

**Impacto:** B9 (dashboard de KPIs). **Respuesta:** ______

---

## Resoluciones finales del cliente (2026-10-06)

| # | Tema | Respuesta | Implementación / estado |
|---|---|---|---|
| 1 | Folios derivados | **B** | `NE-O-2610_05-01` / `NE-OI-2610_05-01` (y `RP-` equivalente), sin renumeración manual. Migración `20261007230001_sii_folios_derivados_prefijo.sql`; CHECKs, generadores NE/RP, tests B7/B8 y E2E actualizados. |
| 2 | Jornada | **A** | Jornada estándar de 8 h por turno, ajustable/configurable por recurso; horas extra al exceder la jornada configurada con autorización Management/Admin. Ya implementado (B6); queda registrado como regla vigente (sin cambio de motor). |
| 3 | Promesas de pago | **A** | Recordatorio 2 días antes y al quedar vencida. Ya implementado en B8-F3 (`20261007180005`); sin cambio. |
| 4 | Plazo de crédito | **B** | `credito` usa `clientes.dias_credito`; si el cliente con crédito no tiene días configurados se exige completarlos antes de usar crédito (`cliente_credito_sin_dias` en entrega/factura y `dias_credito_requeridos` en alta/edición). `contado` 0, `15_dias` 15 y `30_dias` 30 no cambian. Migración `20261007230002_sii_credito_dias_cliente.sql`; UI de clientes y sugerencia de vencimiento en `/cobranza` ajustadas. |
| 5 | KPIs | **A** | Aproximaciones del MVP aceptadas, con fórmulas documentadas y sustituibles; utilización, WIP y scrap se rotulan “aprox.” y como estimaciones operativas (no cifras contables exactas). Sin cambio en las fórmulas del RPC. |

**Nota:** la migración `20261007220001_sii_b8_emitir_factura_credito.sql` (crédito 45 fijo) queda superada por la resolución 4; se conserva como historia aplicada y el remoto aplica después `20261007230002`.

---

## Comentarios abiertos (opcional)

```
____________________________________________________________________________
____________________________________________________________________________
```

---

**Nota para el Product Owner (no requiere respuesta del cliente):** quedan como acciones de
publicación/operación: autorizar `supabase db reset` local + fixture (rendimiento de suites), push,
aplicación de las migraciones pendientes en remoto, CI y aceptación formal.
