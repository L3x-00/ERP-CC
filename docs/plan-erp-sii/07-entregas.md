# B7 — Entregas (Go Live 4)

Referencias del documento: §13 completo (parciales, folio NE, cantidades por tema, quién entrega/recibe/fecha, evidencia y firma), §6.1 (folio `NE-O-MMYY_XX-YY` / `NE-OI-MMYY_XX-YY`, decisión D1-B), §7 (Delivery 1:N desde Order), §17.
Depende de: B5 y B6 (la entrega consume producción y snapshot de la orden). Alimenta B8 (AR al entregar) y B9 (KPIs).

**Resultado del bloque:** entregas parciales/totales con folio `NE-O-MMYY_XX-YY` / `NE-OI-MMYY_XX-YY`; cantidades por ítem (`ITxx`) ligadas al snapshot de la orden; registro de quién entrega, quién recibe y fecha; evidencia fotográfica y firma (digital o digitalizada) cuando aplique; idempotencia al generar; cola de entregas dedicada; activación de CxC conservada.

---

## 7.1 Modelo y folio (§6.1, §13)

Migración `20261005700001_sii_b7_entregas.sql`:

```sql
alter table public.notas_entrega
  add column folio_sii text,                        -- NE-O-MMYY_XX-YY / NE-OI-MMYY_XX-YY (nuevas)
  add column entregado_por_id uuid references public.usuarios(id),
  add column recibido_por_id uuid references public.contactos_cliente(id),
  add column solicitud_id uuid;                     -- idempotencia
create unique index ux_notas_folio_sii on public.notas_entrega (folio_sii);
create unique index ux_notas_solicitud on public.notas_entrega (solicitud_id)
  where solicitud_id is not null;
alter table public.partidas_nota_entrega
  add column codigo_item text;                      -- ITxx del snapshot de la orden
```

**Generación del folio (decisión final D1-B, 2026-10-06):** si la orden tiene `folio_sii` (`O-MMYY_XX` u `OI-MMYY_XX`), el folio de entrega es `NE-` + folio completo de la orden (con prefijo `O-`/`OI-`) + `-` + consecutivo de entregas de esa orden (`YY` con 2 dígitos); así `O-2610_05` produce `NE-O-2610_05-01` y `OI-2610_05` produce `NE-OI-2610_05-01`, sin colisiones ni renumeración manual. Para órdenes históricas sin `folio_sii` se conserva `NE-######`. El consecutivo se calcula con lock de la orden (`max` de notas de esa orden + 1) o contador dedicado; nunca se reutiliza aunque la entrega se cancele. Migración de la decisión: `20261007230001_sii_folios_derivados_prefijo.sql`.

**Reglas (las actuales se conservan y ordenan):**
1. Parciales/totales: `es_parcial` se calcula como hoy (entregado histórico + nuevo vs solicitado).
2. No se entrega más de lo producido; máximo de renglones por RPC; locks partidas→orden→creador (vigentes).
3. **Cantidades por tema/ítem:** los renglones usan `partida_id` + `codigo_item` (ITxx); la UI agrupa por ítem del snapshot.
4. **Quién entrega / recibe / fecha:** `entregado_por_id` = usuario que genera; `recibido_por` (texto) + `recibido_por_id` (contacto del cliente si existe); fecha = `creado_en` + `fecha_entrega` editable con validación ≥ fecha de generación. **Implementado 2026-10-07 (auditoría):** migración `20261007230007` agrega `actualizado_en` (CAS) y la RPC `actualizar_fecha_entrega` (permiso `entrega_generar`; no anterior al día de generación ni futura), con edición desde el detalle de la nota.
5. **Idempotencia:** `generar_nota_entrega` recibe `solicitud_id`; repetir la misma solicitud devuelve la nota existente (corrige la carencia actual).
6. Al cubrir todas las partidas se conserva el comportamiento vigente: archivo de la orden + activación de AR con vencimiento por condición del cliente.

**Tareas:** migración + RPC idempotente + backfill `codigo_item` desde partida; actualización de UI (`formulario-nota-entrega.tsx`) con ítems y quién entrega/recibe; pgTAP folio/idempotencia/parciales; concurrencia de dos generaciones simultáneas con la misma solicitud.

---

## 7.2 Evidencia y firma (§13)

**Documento:** "Evidencia fotográfica y firma digital cuando aplique"; "Clientes industriales pueden solicitar hoy impresión con venta/fecha/firma y posterior digitalización."

**Implementación con `archivos` (B1.9), `entidad='entrega'`:**
| Clase | Uso |
|---|---|
| `evidencia` | fotos del material entregado (múltiples; sin límite rígido, máximo por config) |
| `firma` | firma digital capturada en pantalla (canvas → PNG) |
| `firma_escaneada` | nota impresa firmada, escaneada/fotografiada y subida |

Reglas (decisión del cliente 2026-10-05):
1. **Obligatorio en toda entrega:** cantidades, quién entrega, quién recibe y fecha.
2. **Cliente industrial:** hoja impresa con sello, fecha y firma del cliente; posterior digitalización (`firma_escaneada`).
3. **Cliente no industrial:** preferencia por firma digital capturada en pantalla (`firma`).
4. **Evidencia fotográfica disponible** en ambos casos (`evidencia`), con recordatorio en la UI.
5. La firma queda vinculada a la nota exacta (`entidad_id=nota.id`) con versión y reemplazo trazado; no se sobrescribe.
6. El documento imprimible sigue disponible con el nuevo folio; lectura por URL firmada con permiso `ENTREGA_EVIDENCIA`/`ORDEN_VISTA` (corrección de auditoría 2026-10-07, migración `20261007230004`: `entrega_evidencia` incluido en la RLS de `archivos` para `entrega`).
7. Futuro: configurabilidad por cliente (fase posterior; hoy el operador elige el flujo industrial/no industrial al generar la entrega).

**Tareas:** UI de captura (canvas + conversión) y subida de escaneo; integración con servicio de archivos; E2E de firma digital y de digitalización; visual móvil (piso/entrega en tablet).

---

## 7.3 UI, pruebas y criterios de aceptación

**UI:** nueva cola `/entregas` (Logística) con filtros por cliente/orden/estado (parcial/completa), pendientes por orden y acceso a la nota; la generación sigue disponible desde `/produccion` y desde la ficha de orden; detalle de nota con renglones por ITxx, evidencias y firma.

**Criterios del bloque:**
1. Folio `NE-O-MMYY_XX-YY` / `NE-OI-MMYY_XX-YY` correcto, único, sin reutilización en cancelaciones (pgTAP).
2. Reintento con la misma `solicitud_id` no duplica (pgTAP + concurrencia).
3. Cantidades por ítem nunca exceden lo producido ni lo pendiente por entregar (pgTAP).
4. Quién entrega/recibe/fecha registrados y auditados (E2E).
5. Evidencia y firma vinculadas a la nota con versionado (E2E + pgTAP de reemplazo).
6. La activación de AR al entregar total se mantiene idéntica (regresión de cobranza).
7. Gates §0.9 + regresión de producción y cobranza.

**Exclusiones:** portal del cliente para firmar, guías de envío/paquetería, devoluciones.
