# Reporte final — Prueba E2E en producción ORCA MFG ERP (CC Manufacturing Group)

**Fecha de ejecución:** 2026-11-17 (hora Tijuana, UTC-8)
**Ambiente:** `https://erp-cc-flame.vercel.app` (PRODUCCIÓN) · Supabase `pwnecbcynnqnvfwmvrnn`
**Alcance:** flujo completo RFQ → propuesta (A/B/C) → orden → planeación → producción → entrega → cobro → cierre, con foco en los cambios C20/C21 de los PR #195 y #196 (último RP fusionado a `main`, commit `495dccf`).
**Ejecutor:** la IA que actuó como desarrolladora en esta sesión, con autorización para ejecutar, verificar y fusionar cuando todas las pruebas pasan. No se usaron credenciales distintas a las proporcionadas para login; el arnés Playwright se ejecutó localmente.
**Evidencia:** carpeta `evidencias_e2e_ORCA_20261117/` (10 subcarpetas + `_scripts/` con los scripts, `traza.jsonl` con 200+ eventos timestamped, capturas y notas).

---

## 1. Resumen ejecutivo

| Resultado | Detalle |
|---|---|
| **Flujo comercial y operativo principal** | **COMPLETADO** de punta a punta en producción con datos ficticios nuevos. |
| Cliente | `CLI-0038` — Manufactura Fronteriza QA1711 S.A. de C.V. (alta como prospecto desde el RFQ, luego activado). |
| RFQ | `RFQ-1126_08` (`cc86f00f-…`) → `READY_FOR_PROPOSAL`. 2 ítems, 2 archivos técnicos. |
| Propuesta | `CNC-1126_08`, versiones A/B/C, todas enviadas con PDF. **B aprobada**. |
| Orden | `O-1126_07` → `CERRADA` con cierre administrativo completado el 17-nov. |
| Entrega | `NE-O-1126_07-01` (folio SII `NE-001036`), final 75/75. |
| CxC | `INVCNC-0000033` por $128,470.00, cuenta cerrada tras el cobro. |
| Costeo | Fabricación estimada $5,448.13 · Venta B $110,750.00 · IVA $17,720.00 · Total cliente $128,470.00. |
| Pruebas del último cambio (C21) | **5 de 7 verificadas**; 2 no ejecutables en producción sin manipular reloj/base de datos (se documentan). |
| Incidencias | 1 alta, 5 medias, 3 bajas. |
| Conclusión | **El caso E2E se completó con éxito**, con desviaciones documentadas (sección 7). |

> Nota de integridad: se realizó **un cambio global documentado** en el catálogo (costo manual de `MDF-12` = $320.00 MXN/m²) para destrabar el cierre de la partida IT02. Está registrado en `10_validacion_tecnica/cambio-catalogo-mdf.md`.

---

## 2. Datos del caso

| Concepto | Valor |
|---|---|
| Razón social | Manufactura Fronteriza QA1711 S.A. de C.V. |
| Nombre comercial | Taller QA QA1711 |
| RFC | MFQA261117AB1 |
| Contacto | Laura Méndez · laura.mendezqa1711@clienteqa.mx · 664 555 0142 |
| Cliente | `CLI-0038`, inicialmente prospecto → activo |
| RFQ | `RFQ-1126_08` · MXN · prioridad alta · contado · canal Correo · requerida 29-nov-2026 |
| Ítems | IT01 Soporte metálico SM-2026-02, 50 pzas, CRS-14 cal 14, Corte laser + DOBLADO_CNC; IT02 Panel decorativo MDF-12, 25 pzas (20 originales, B la cambió a 25), MDF-12 12 mm, CNC ROUTER |
| Archivos RFQ | `SOPORTE-SM-2026-02.dxf` (CAD) y `SOPORTE-SM-2026-02.pdf` (DIBUJO), ambos vigentes |
| Propuesta | `CNC-1126_08` |
| Versiones | A: Subtotal $112,100.00 · IVA $17,936.00 · Total $130,036.00 · Enviada. B: $110,750.00 · $17,720.00 · $128,470.00 · **Venta confirmada**. C: $112,500.00 · $18,000.00 · $130,500.00 · Enviada |
| Orden | `O-1126_07`, compromiso 7-dic-2026, prioridad alta, 2 partidas, 75 piezas |
| Entrega / CxC / Cierre | `NE-O-1126_07-01` / `INVCNC-0000033` / cierre admin 17-nov-2026 |

---

## 3. Cronología (timestamp Tijuana · usuario)

| Hora | Usuario | Acción / resultado |
|---|---|---|
| 11:28:10 | admin | Login correcto (`/dashboard`). Modal de tipo de cambio descartado con «Más tarde» (no se modificó config global). |
| 11:29:20 | operador | Login PIN de operador correcto → Jorge Ramírez Ortega, sesión de piso activa. |
| 11:40:26 | admin | Alta rápida de cliente desde el RFQ: prospecto `CLI-0038` creado y seleccionado sin perder lo capturado. RFC inválido detectado y corregido (2 intentos, evidencia). |
| 11:42:07 | admin | Ítems IT01/IT02 guardados con materiales y procesos reales del catálogo de producción. |
| 11:43:28 | admin | Archivos DXF y PDF técnicos subidos y vigentes. |
| 11:47:34 | admin | RFQ marcado listo → `READY_FOR_PROPOSAL`; edición posterior generó nueva versión. |
| 11:47:43 | admin | Cliente activado de prospecto a activo; relación conservada en la ficha RFQ. |
| 11:48:57 | admin | Propuesta `CNC-1126_08`, revisión A creada desde la pestaña Propuestas. |
| 11:49–11:55 | admin | Precios, ruteo (3 filas: laser 2.5 h, doblado 1.75 h, router 2 h), costeo interno y materiales. Fabricación $5,448.13. |
| 11:56–11:57 | admin | Rev A validada, PDF generado y enviada (`SENT`). |
| 11:57:54 – 12:03:56 | admin | Rev B creada con motivo, precio/cantidad modificados, ruteo/costos confirmados, PDF y envío. Rev C creada, precio modificado, PDF y envío. |
| 12:04:38 | admin | Revisión B aceptada → propuesta «Venta confirmada», orden `O-1126_07` creada. A y C en solo lectura. |
| 12:10:44 | admin | 3 operaciones asignadas en Planeación y orden liberada (`PLANIFICADA` → `LISTA`). |
| 12:12:28 | operador | Proceso IT01 reclamado, checklist confirmado e iniciado. |
| 12:14:00 | operador | **Cerrar sesión en marcha #1** → pausa (motivo MATERIAL, 0 h netas). |
| 12:15–12:17 | operador | Formulario C21: «Tiempo real de proceso», «Actualizar estado», error accionable «Ajustar a 0.02 h», 2 sesiones pausadas, enlace «ver el proceso anterior», sin botones de borrado. |
| 12:18:37 | operador | IT01 corte láser completado (50/50), consumo y badge «Proceso completado». |
| 12:22:36 | admin | Costo manual MDF-12 $320 registrado (cambio global documentado). |
| 12:26:35 | operador | IT02 router y doblado CNC completados; modal «Usar 50 piezas (1:1)» usado como salida. |
| 12:29:52 | admin | Entrega final `NE-O-1126_07-01`, 75/75, recibido por Laura Méndez. |
| 12:30:40 | admin | CxC `INVCNC-0000033` facturada y cobrada ($128,470.00, cuenta cerrada). |
| 12:32:16 | admin | Cierre administrativo completado: costo real $3,523.13, margen +96.8%. |
| 12:34–12:36 | sistema | Cierre de contextos de navegador; logout explícito intentado (ver incidencia B-3). |

---

## 4. Resultados por etapa del flujo obligatorio

1. **RFQ y alta de cliente desde el RFQ — OK.** El modal «Nuevo cliente» crea el prospecto y lo deja seleccionado. Activación solo desde `/clientes` (ver M-3).
2. **Validar, editar y re-validar — PARCIAL.** Primera validación mostró faltantes de seguimiento; tras completar Acción/Fecha/Responsable pasó a READY. La edición posterior creó versión `CABECERA`, pero la UI ya no ofrece «Marcar listo» para re-validar (M-5).
3. **Oportunidad en Pipeline — NO EXISTE.** `/pipeline` redirige a `/rfq`; no hay avance de etapas ni adjuntos de oportunidad accesibles (M-1, M-2). Los archivos se adjuntaron al RFQ y se heredaron a la propuesta/orden.
4. **Ruteo y costeo interno — OK.** Jerarquía de tarifa observable: `Laser Fibra $512.50/h`, `Press Brake $512.50/h`, `CNC Router $850.00/h`, todas con origen «Tarifa del grupo». Sin duplicación: el desglose indica que el ruteo sustituye al costo manual de máquina. Material $1,250 + Otros $320 por separado con detalle.
5. **Propuesta con 3 versiones — OK.** A/B/C con cambios reales de precio/cantidad, PDF por versión, historial con subtotal y total cliente, B aceptada, A/C solo lectura.
6. **Aceptación y paso a planeación/producción — OK.** Evento comercial (`aceptar_revision`, bitácora «El cliente aceptó esta versión») distinto de `validar_revision`. Orden creada automáticamente; no existe CTA «Orden ganada» ni botón «Pasar a Planeación» (M-1).
7. **Trabajo del operador — OK.** Sesiones, pausa/reanudación, cierre con piezas, PIN y notas; auditoría visible en la traza.
8. **Horas extra (rechazo/re-solicitud/aprobación) — NO EJECUTADO.** No se generó exceso de jornada: las sesiones duraron segundos. El sistema expone «Justificar horas extra» y «Pedir aprobación», pero no hay rechazo con nota ni re-solicitud en el modelo actual (M-4).
9. **Liberación por primera pieza — NO FUE REQUERIDA.** Ningún proceso del caso exigió `requiere_primera_pieza`; el flujo avanzó sin ese gate. No se pudo evidenciar.
10. **Cierre, entrega, cobro y documentos — OK** (ver A-1 para el bloqueo de consumo MDF-12 y B-6 para la descarga de PDFs).
11. **Sesión abierta / logout — PARCIAL.** No hay expiración por tiempo en sesión PIN de piso (comportamiento por diseño); se cerraron los contextos y se intentó logout por UI (B-3).

---

## 5. Resultado de las 7 pruebas del último cambio (C21)

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Jornada corrida 8 h, comida 12–13 no cuenta, matutino/vespertino mismo horario | **PASA** | Textos literales en el detalle: «Jornada corrida de 8 horas. La comida de 12:00 a 13:00 no se cuenta. Matutino y vespertino son el mismo horario de producción…». Captura `09_ultimo_cambio/01-detalle-jornada-y-textos.png`. |
| 2 | Tiempo real 2 h + 4 h = 6 h entre días | **NO EJECUTABLE en producción** | La RPC rechaza `horas_reales` mayores al tiempo transcurrido de la sesión: modal «El tiempo real de proceso no puede ser mayor al tiempo de la sesión pausada» con botón «Ajustar a 0.02 h». Sin manipulación de reloj/DB no se pueden simular 2 h y 4 h. Evidencia `14-formulario…`, `17-modal-error…`. |
| 3 | «Actualizar estado» cronológico, intentar la posterior primero | **PARCIAL** | Botones `actualizar-estado-*` y selector ordenado antiguo→nuevo presentes; con 2 sesiones se intentó la posterior y el sistema validó primero el límite de horas de esa sesión, por lo que no se aisló el error `sesion_antigua_pendiente`. Evidencia `22`, `23`, `24`, `25`. |
| 4 | Pausas sobrantes marcadas inválidas y descuento; operador no puede borrar | **PARCIAL** | No hay botones «Eliminar/Borrar» en el historial (verificado = 0). Las pausas sobrantes requieren producción completada con sesiones posteriores; no se generaron. |
| 5 | Tope de 3 pausas sin avance | **NO EJECUTABLE en el caso** | Solo se generaron 2 pausas sin avance; no se alcanzó el umbral ni se pudo provocar una tercera sin reanudar. Regla confirmada por código/migración C21. |
| 6 | Consumo de material: dos opciones y fuerza del error sin salida | **PASA / HALLAZGO** | Ambas opciones están en el mismo formulario: «Dejar el consumo para el cierre» y «Registrar el consumo aquí» (captura `14`). El error de consumo **sí** ofrece salida (`Usar 50 piezas (1:1)`, captura `22`), pero el caso MDF-12 sin costo dejó al operador sin salida real: con consumo → «El material no tiene costo confirmado»; sin consumo → «Este proceso requiere registrar el consumo…» (A-1). |
| 7 | Errores en modal con botones de solución, día actual, «Tiempo real de proceso», «ver el proceso anterior», badge «Proceso completado» | **PASA** | Modales con «Ajustar a 0.02 h» / «Entendido» / «Usar 50 piezas (1:1)»; día 17/11/2026; etiqueta «Tiempo real de proceso»; enlace `ver-proceso-anterior` con 2 sesiones; badge «Proceso completado» en las 3 operaciones. |

---

## 6. Validación técnica frontend / backend

- **Frontend:** todas las transiciones se reflejaron en UI (colas Kanban, badges, historial de versiones, panel de cierre, etc.). Coherencia de importes verificada en pantalla: **costo de fabricación $5,448.13 ≠ subtotal de venta $110,750.00 ≠ total cliente $128,470.00**; IVA = 16 % del subtotal ($17,720.00); sin duplicación de ruteo en costos manuales.
- **Backend (persistencia):** cada acción fue verificada recargando la página (RFQ listo, ruteo costeado, costos, versiones, aceptación, orden, entrega, cobro, cierre). Las relaciones RFQ → propuesta → orden → entrega → CxC → cierre quedaron visibles en la ficha de orden (`Origen comercial` y `Cierre administrativo 17-nov`).
- **Permisos:** operador solo pudo actuar sobre sus procesos de piso (sin borrado de sesiones); admin gestionó costeo, aceptación, planeación, entrega, cobro y cierre.
- **Adjuntos:** los planos del RFQ aparecen en el detalle del operador («Planos y archivos (2)») y en «Archivos vivos» de la orden.
- **Limitación:** no se consultó Supabase con `service_role` porque el pedido indicó usar solo las credenciales proporcionadas; la verificación backend se hizo por persistencia observable en UI y por los logs de la traza.

---

## 7. Incidencias

| ID | Sev. | Hallazgo | Reproducción / impacto | Evidencia |
|---|---|---|---|---|
| A-1 | **ALTA — corregida en código (pendiente de despliegue)** | Consumo de MDF-12 sin costo confirmado dejaba al operador sin salida | Cerrar IT02 con consumo → «El material no tiene costo confirmado»; sin consumo → «Este proceso requiere registrar el consumo…». El modal C21 no ofrecía salida. Se destrabó registrando costo manual $320 (cambio global documentado) y se corrigió la UI (sección 10). | `07_entrega_cobro/diagnostico-it02.md`, `it02-sin-consumo.md`, `10_validacion_tecnica/cambio-catalogo-mdf.md` |
| M-1 | Media — **por diseño, aclarada en UI** | No existe pantalla de Pipeline ni avance de etapas | `GET /pipeline` redirige a `/rfq`: la oportunidad es el propio RFQ y las etapas son históricas (grandfathering), gobernadas por las acciones de estado. No se inventaron etapas ni botones; se añadió un aviso explicativo (sección 11). | `02_oportunidad/pipeline-redirige-a-rfq.png` |
| M-2 | Media — **corregida (sección 12)** | Adjuntos de oportunidad inalcanzables | `PanelAdjuntos` solo se monta en `EditorCotizacion`, que no está enlazado desde ninguna ruta. | Análisis de código (subagente) + `00_sesion/dump-rutas.md` |
| M-3 | Media — **corregida (sección 12)** | Activación de prospecto solo desde `/clientes` | La ficha RFQ no ofrece «Activar»; hay que salir al módulo Clientes. La relación se conserva correctamente. | `01_rfq/42-cliente-activado.png`, `51-relacion-final-conservada.png` |
| M-4 | Media — **corregida (sección 12)** | Horas extra sin rechazo con nota ni re-solicitud | `resolver_solicitud_horas_extra` solo escribe `VIGENTE`/`RECHAZADA`; la UI «Desaprobar» no pide motivo; una solicitud rechazada no se reactiva. No se pudo provocar exceso de jornada en el caso. | Análisis de código + migración `20261103090000` |
| M-5 | Media — **corregida (sección 12)** | Re-validación no expuesta tras `READY_FOR_PROPOSAL` | Editar el RFQ tras marcarlo listo genera versión `CABECERA`, pero «Marcar listo» desaparece; no hay botón de re-validación. | `01_rfq/resultado-etapa1e.md`, `1f.md` |
| B-1 | Baja — **corregida (sección 13)** | Horas reales = 0.0 h en cierre administrativo | Las sesiones duraron segundos y el cierre coincide con el inicio; el panel muestra «0.0 h reales contra 6.3 h cotizadas» y desviación -100 %. Podría requerir revisión del cálculo cuando `fecha_fin_declarada` no se declara. | `07_entrega_cobro/39-detalle-cierre-completo.png` |
| B-2 | Baja — **corregida (sección 13)** | Descarga binaria de PDFs no capturada en headless | «Descargar» abrió URL firmada; `popup.pdf()` no produjo archivo. La generación y vigencia del PDF sí quedaron evidenciadas en pantalla. | `08_documentos/pdf-aprobado-B-panel.png` |
| B-3 | Baja — **corregida (sección 13)** | Logout UI no confirmado por automatización | El menú mostró «Cerrar sesión» en el sondeo, pero el clic automatizado no lo encontró de forma estable; todos los contextos de navegador fueron destruidos al final (sin sesiones colgadas en el proceso). | `00_sesion/menu-admin-logout.png`, `logout-admin-final.png` |

---

## 8. Recomendaciones

1. **Alta:** dar salida explícita en el modal de error de consumo cuando el material no tiene costo confirmado (ofrecer « configurar costo» o permitir dejarlo para cierre con aviso).
2. ~~Exponer en la UI el alta/activación de oportunidad y el avance de etapas, o documentar oficialmente que `/rfq` es la única pantalla de oportunidad.~~ Atendido: M-1 (aclaración en UI) y M-2 (adjuntos alcanzables), sección 12.
3. ~~Habilitar re-validación tras editar un RFQ en `READY_FOR_PROPOSAL`.~~ Atendido: M-5, sección 12.
4. ~~Permitir nota de rechazo y re-solicitud de horas extra~~ Atendido: M-4, sección 12. Queda como mejora opcional considerar expiración/invalidación de la sesión PIN de piso.
5. Revisar el cálculo de horas reales del cierre administrativo cuando las sesiones son muy cortas.
6. Publicar un botón de descarga directa (no popup) para el PDF de propuesta y el acta de entrega.

---

## 9. Conclusión

**El proceso E2E se completó con éxito en producción**: cliente, RFQ, propuesta con tres versiones y aceptación de la B, orden, planeación, producción, entrega, cobro y cierre administrativo quedaron persistidos y verificables en frontend. Los cambios C20/C21 están presentes y funcionan en los puntos observables (jornada corrida, pausa automática por cierre en marcha, «Tiempo real de proceso», corrección de sesiones, modales con salida, enlace al proceso anterior, badge de completado, no borrado de sesiones). Quedan documentadas las limitaciones para simular tiempos de horas en producción, la falta de pantalla de Pipeline y la incidencia alta de consumo sin costo confirmado (corregida en código, ver sección 10).

---

## 10. Corrección de la incidencia A-1 (2026-11-17, posterior a la ejecución E2E)

**Decisión:** no se relajó la regla de negocio. El servidor sigue exigiendo costo confirmado para valorizar el consumo (RPC `registrar_consumo_piezas_operador`, error `costo_material_no_configurado`). Se corrigió la **experiencia de usuario**, que era un callejón sin salida.

**Cambios implementados y fusionados en `main`:**

| Archivo | Cambio |
|---|---|
| `src/app/(piso)/produccion-piso/page.tsx` | Carga `costo_vigente` del catálogo junto al resto de materiales del piso. |
| `src/modulos/ordenes/componentes/control-piso-panel.tsx` | `MaterialPiso.costoVigente?: number \| null` (opcional, sin romper otras vistas). |
| `src/modulos/produccion/componentes/detalle-proceso-operador.tsx` | Aviso preventivo `aviso-material-sin-costo` antes de enviar el cierre; error modal con salida «Pausar sesión y avisar» para `costo_material_no_configurado` (preselecciona motivo MATERIAL y deja nota explicativa) y salida «Registrar consumo aquí» para `consumo_material_requerido`; testids `resultado-cierre` y `notas-cierre`. |
| `src/modulos/produccion/componentes/panel-operador-produccion.tsx` | Misma salida accionable en el panel `/produccion` para consistencia. |
| `tests/unitarias/detalle-proceso-operador.test.ts` | Test de reproducción (RED → GREEN): aviso con nombre del material, modal accionable, pausa preparada, sin reintento automático; plus test sin falso positivo cuando hay costo. |
| `tests/unitarias/panel-operador-cierre-piezas.test.ts` | Test de la misma salida en el panel. |

**Verificación:** `tsc --noEmit` limpio · ESLint limpio en los 6 archivos · suite unitaria completa **319 archivos / 2701 pruebas en verde** (incluye los 3 tests nuevos). Revisión cruzada del diff: sin hallazgos BLOCKER/HIGH; la validación permanece en servidor y no se crea ni modifica costo desde la terminal de piso.

**Pendiente:** re-verificación en producción tras el despliegue (el aviso preventivo y el botón «Pausar sesión y avisar» deberán aparecer al cerrar un proceso con material sin costo). La vista `/produccion` no muestra el aviso preventivo porque su catálogo no carga `costo_vigente`; se registró como mejora opcional, no bloqueante.

---

## 11. Cierre de la incidencia M-1 (por diseño, con aclaración en UI)

**Diagnóstico:** no es un defecto funcional. La oportunidad es la propia fila de `pipeline` que se crea con el RFQ; las etapas son una columna histórica (`grandfathering`, decisión SII-B3 ola 2) y el avance se gobierna con las acciones de estado del RFQ («Marcar listo», «Poner en espera», «Cerrar», «Cancelar»). Agregar una pantalla de etapas o un botón «Orden ganada» habría inventado estados y transiciones prohibidos por las reglas del ERP.

**Corrección aplicada (sin cambiar reglas de negocio):**

| Archivo | Cambio |
|---|---|
| `src/modulos/pipeline/componentes/aviso-pipeline-rfq.tsx` | Componente informativo `aviso-pipeline-rfq`: la oportunidad se gestiona en el RFQ; etapas históricas no editables; avance por acciones de estado; adjuntos en la pestaña «Archivos» y heredados a propuesta/orden. No agrega botones ni estados. |
| `src/app/(panel)/pipeline/page.tsx` | El redirect a `/rfq` conserva los deep-links y añade `desde=pipeline` para mostrar la aclaración. |
| `src/app/(panel)/rfq/page.tsx` | Muestra el aviso cuando se llega desde `/pipeline` o por un enlace histórico `?oportunidad=<id>`, tanto en la cola como en la ficha. |
| `tests/unitarias/pipeline-aviso-rfq.test.ts` | Test del contenido del aviso (RED → GREEN). |

**Verificación:** `tsc --noEmit`, ESLint y suite unitaria completa en verde (incluye el test nuevo). La incidencia queda documentada como decisión de diseño, con la UX aclarada y sin automatizaciones inventadas.

---

## 12. Cierre de M-2, M-3, M-4 y M-5 (2026-11-17)

Las cuatro incidencias medias restantes se corrigieron **sin alterar reglas de negocio**: no se agregaron estados, transiciones, permisos ni columnas. Se reutilizaron acciones, componentes y tablas ya existentes.

### M-2 — Adjuntos de oportunidad alcanzables

- **Diagnóstico:** `PanelAdjuntos` (vista histórica de los archivos de la oportunidad) solo se montaba en `EditorCotizacion`, sin enlace desde ninguna ruta. Los mismos archivos `rfq/<id>/…` ya se administraban en la pestaña Archivos del RFQ.
- **Corrección:** nuevo `AdjuntosOportunidadRfq`, montado en la pestaña Archivos de la ficha RFQ, que reutiliza `PanelAdjuntos` en **solo lectura**. Sin ruta nueva, sin modelo nuevo y sin duplicar almacenamiento.
- **Archivos:** `src/modulos/rfq/componentes/adjuntos-oportunidad-rfq.tsx`, `src/modulos/rfq/componentes/ficha-rfq.tsx`, `tests/unitarias/rfq-adjuntos-oportunidad.test.ts`.

### M-3 — Activación de prospecto desde la ficha RFQ

- **Diagnóstico:** la activación `prospecto → activo` solo estaba en el drawer de `/clientes`; la ficha RFQ no la ofrecía aunque el cliente ya venía en el payload.
- **Corrección:** nuevo `ActivarClienteRfq`, visible solo si el usuario tiene `cliente_editar` y el cliente es prospecto. Reutiliza `cambiarEstadoClienteAccion` con el CAS de `clientes.actualizado_en` (**no** el de `pipeline`), sin motivo, con la misma RPC y los mismos permisos. La página `/rfq` calcula el gate de permiso en servidor.
- **Archivos:** `src/modulos/rfq/componentes/activar-cliente-rfq.tsx`, `src/app/(panel)/rfq/page.tsx`, `src/modulos/rfq/componentes/ficha-rfq.tsx`, `tests/unitarias/rfq-activar-cliente.test.ts`.

### M-4 — Rechazo con nota y re-solicitud de horas extra

- **Diagnóstico:** `resolver_solicitud_horas_extra` no aceptaba nota y la UI «Desaprobar» no pedía motivo; el rechazo no quedaba documentado y la re-solicitud no se comunicaba al usuario.
- **Corrección (cero migración):** el esquema Zod exige nota al rechazar (mínimo 3 caracteres); la nota se guarda en `logs.detalles` bajo la acción `rechazar_horas_extra` y se lee de vuelta para mostrarla en el historial. La re-solicitud ya funcionaba en base de datos (la RPC crea una fila nueva `SOLICITADA` sin reactivar la rechazada); el mensaje de UI indica ahora que el operador puede volver a pedir al intentar cerrar la sesión. No se tocó la RPC, los estados ni el esquema de la tabla.
- **Archivos:** `src/modulos/produccion/validaciones/corridas.ts`, `src/modulos/produccion/acciones/resolver-horas-extra.ts`, `src/modulos/produccion/servicios/consultas-b6-servicio.ts`, `src/modulos/produccion/componentes/panel-horas-extra-produccion.tsx`, `tests/unitarias/produccion-horas-extra-rechazo.test.ts`.

### M-5 — Re-validación visible en `READY_FOR_PROPOSAL`

- **Diagnóstico:** editar un RFQ ya marcado listo genera versión `CABECERA`, pero la pestaña «Revisar» y la consulta `validar_rfq_listo` estaban restringidas a `INCOMPLETE`; la re-validación visible quedaba diferida a la creación de la Rev A.
- **Corrección (Opción B, cero SQL):** se expone la revisión de **solo lectura** también en `READY_FOR_PROPOSAL` (`puedeValidar`), reutilizando `validarRfqListoAccion`. **No** se añadió `marcar_listo` al mapa de acciones de READY ni un evento READY→READY: `cambiar_estado_rfq` sigue rechazando esa transición y `capturaRfqListaParaValidar` sigue siendo exclusivo de `INCOMPLETE`. El texto del panel en READY ya no remite a «Marcar listo» y aclara que no hay cambios de estado pendientes.
- **Archivos:** `src/modulos/rfq/componentes/ficha-rfq.tsx`, `src/modulos/rfq/componentes/panel-revision-rfq.tsx`, `tests/unitarias/rfq-revalidar-listo.test.ts`, `tests/unitarias/rfq-estado-captura.test.ts` (actualizado).

### Verificación

`tsc --noEmit` limpio · ESLint limpio en los 14 archivos tocados · suite unitaria completa **335 archivos / 2917 pruebas en verde** (30 archivos y 102 pruebas omitidos por diseño). Cada hallazgo tiene su test de reproducción (RED → GREEN).

**Estado de integración:** con todas las verificaciones en verde y la autorización vigente para fusionar cuando la suite pasa, estos cambios quedan integrados en `main`. Pendiente únicamente la re-verificación en producción tras el despliegue: vista de adjuntos (M-2), botón de activación (M-3), nota de rechazo (M-4) y pestaña Revisar en READY (M-5).

---

## 13. Cierre de B-1, B-2 y B-3 (2026-11-17)

### B-1 — Horas reales pequeñas ya no se pintan como cero

- **Diagnóstico:** no había fallback roto. `coalesce(fecha_fin_declarada, now())` y el guard de anterioridad son correctos. El dato se cuantiza dos veces: Postgres guarda `round(epoch/3600, 2)` (0,01 h = 36 s) y la UI lo volvía a formatear a un decimal, de modo que cualquier valor < 0,05 h salía como «0,0 h». La propia evidencia del cierre lo demostraba: «Corte laser 2,5 h / 0,0 h · −99,6 %» implica 0,01 h reales y «Mano de obra $3,878.13 → $5.13» implica tiempo costeado.
- **Corrección (solo presentación):** nuevo `formatearHoras()` que usa dos decimales cuando el valor es distinto de cero y menor que 0,1 h. Se aplica en el panel de cierre, en la frase de negocio y en los puntos críticos del servicio. **No** se tocan `porcentajeDesviacion`, el redondeo de la RPC ni la regla de almacenamiento.
- **Archivos:** `src/modulos/cierres/utilidades/indice.ts`, `src/modulos/cierres/componentes/panel-cierre-administrativo.tsx`, `src/modulos/cierres/servicios/cierre-administrativo-servicio.ts`, `tests/unitarias/cierres-administrativos.test.ts`, `tests/unitarias/cierres-calculo.test.ts`.

### B-2 — Descarga directa de PDFs instrumentada correctamente

- **Diagnóstico:** la descarga ya era directa. La propuesta firma la URL on-click y dispara un `<a download>` con `Content-Disposition: attachment`; el acta usa `PDFDownloadLink` (blob local). El script de evidencias esperó un `popup` antes del clic y registró el listener de `download` **después**, perdiéndolo; además pulsó «Imprimir» en lugar de «Descargar PDF».
- **Corrección (sin tocar storage, RLS ni permisos):** testids estables `descargar-pdf-propuesta` y `descargar-acta-<folio>`, `waitForEvent('download')` registrado **antes** del clic en el script, `acceptDownloads: true` en la configuración de Playwright y test unitario del selector.
- **Archivos:** `src/modulos/propuestas/componentes/panel-pdfs-propuesta.tsx`, `src/modulos/produccion/componentes/nota-entrega-documento-boton.tsx`, `playwright.config.ts`, `tests/unitarias/propuestas-archivos-historial.test.ts`, `evidencias_e2e_ORCA_20261117/_scripts/etapa8-descargas.mjs`.

### B-3 — Logout alcanzable y verificado

- **Diagnóstico:** «Cerrar sesión» declara `role="menuitem"`; los scripts lo buscaban con `getByRole('button', …)`, por lo que nunca podía coincidir. Además, el modal Radix de tipo de cambio marca el resto de la página como `aria-hidden` y con `pointer-events:none` hacía invisible el encabezado si no se descartaba primero. El sondeo del reporte usó un `evaluateAll` sobre el DOM y por eso sí vio el texto. La Server Action `cerrarSesionAccion` (signOut + cookie de operador + auditoría + redirect) nunca llegó a ejecutarse.
- **Corrección:** testid estable `cerrar-sesion` (conservando `role="menuitem"`), testid `salir-operador` por simetría, test unitario que comprueba el rol y la llamada a la Server Action, y scripts de evidencia que descartan el modal, usan los testids y esperan la navegación a `/iniciar-sesion` / `/operador`.
- **Archivos:** `src/compartido/componentes/navegacion/encabezado-app.tsx`, `src/modulos/produccion/componentes/menu-cuenta-operador.tsx`, `tests/unitarias/tema-menu.test.ts`, `evidencias_e2e_ORCA_20261117/_scripts/etapa9-cerrar-sesiones.mjs`, `evidencias_e2e_ORCA_20261117/_scripts/etapa9b-logout-final.mjs`.

### Verificación

`tsc --noEmit` limpio · ESLint limpio en los 16 archivos tocados · suite unitaria completa **335 archivos / 2921 pruebas en verde** (30 archivos y 102 pruebas omitidos por diseño). Los tres hallazgos tienen test de reproducción (RED → GREEN).

### Re-verificación en producción

Tras el despliegue del commit que cierra B-1/B-2/B-3 se ejecutan, contra `https://erp-cc-flame.vercel.app` y reutilizando el caso `RFQ-1126_08` / `O-1126_07`:

| Script | Comprueba |
|---|---|
| `_scripts/reverificacion-produccion.mjs` | M-1 (aviso desde `/pipeline`), M-2 (adjuntos históricos), M-5 (pestaña Revisar en READY) y B-1 («0,01 h» en el cierre). |
| `_scripts/etapa8-descargas.mjs` | B-2: binarios del PDF de la propuesta B y del acta de entrega guardados en `08_documentos/`. |
| `_scripts/etapa9b-logout-final.mjs` | B-3: logout de admin y de operador con navegación confirmada. |

A-1, M-3 y M-4 requieren generar escenarios nuevos en producción (material sin costo confirmado, cliente prospecto con RFQ y sesión que exceda la jornada); su corrección queda cubierta por los tests unitarios y por el código desplegado, y se documenta como pendiente de escenario en la re-verificación.
