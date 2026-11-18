# Arquitectura

## Stack

Next.js 16 con App Router, React 19 y TypeScript estricto; Tailwind CSS v4 y componentes accesibles sobre Base UI/Radix. TanStack Query v5 para datos de servidor, Zustand v5 para estado efímero, Zod v4 y React Hook Form para validación. Supabase aporta Postgres, Auth, Storage, Realtime y RLS mediante `@supabase/ssr`. El detalle de versiones está en [Tecnologías](tecnologias.md).

## Capas

```text
src/app/                         rutas y composición de pantallas (RSC)
src/modulos/<dominio>/           acciones, servicios, hooks, UI, tipos y validaciones
src/compartido/                  tipos, utilidades y componentes reutilizables
src/nucleo/                      Supabase, autenticación, permisos, IA y correo
src/estado/                      estado global de interfaz
content/docs/                    documentación dentro del producto
supabase/migrations/             esquema, RPCs y políticas versionadas
supabase/tests/                  pgTAP
tests/unitarias|integracion/     evidencia automatizada
tests/e2e/                       flujos de navegador con datos aislados
```

Las rutas no contienen reglas de negocio. Las Server Actions validan con Zod, comprueban permisos, llaman al servicio o RPC y registran auditoría. Los componentes no acceden directamente a Supabase.

## Dominios

`autenticacion`, `permisos`, `auditoria`, `pipeline`, `rfq`, `propuestas`, `clientes`, `inventario`, `compras`, `ordenes`, `planeacion`, `produccion`, `entregas`, `cobranza`, `tesoreria`, `gastos`, `facturacion`, `dashboard`, `configuracion`, `comentarios`, `cierres`, `catalogos` y `cotizador`. Cada módulo expone acciones, servicios, tipos y UI; `portal-cliente` y `kpis` están preparados sin flujo de producción completo.

## Seguridad y concurrencia

- RLS permanece activa en todas las tablas de negocio. Las mutaciones críticas no tienen políticas PostgREST directas: pasan por Server Actions autorizadas y RPCs `SECURITY DEFINER`.
- El `service_role` se limita a operaciones que exigen privilegio elevado. Las funciones sensibles fijan `search_path = ''`, revocan ejecución pública y validan al actor.
- Los helpers de RLS viven en el esquema `privado`; no son invocables desde el navegador.
- Las marcas de tiempo usan `now()` de PostgreSQL. Las fechas de negocio se calculan en `America/Tijuana`, no con `current_date` UTC.
- Los folios se emiten desde secuencias atómicas de Postgres; nunca contando filas ni desde el cliente.
- Los cambios de estado usan compare-and-set sobre `actualizado_en` o el estado esperado para rechazar pantallas obsoletas.
- Aprobar una oportunidad y crear su OP ocurren en una sola función SQL con bloqueo de fila e índice único de cotización.
- `registrar_movimiento_inventario` bloquea el material, rechaza stock negativo y recalcula el costo promedio ponderado en la misma transacción.
- `registrar_consumo_material_op` bloquea material y partida, valida stock, crea la salida de kardex y persiste consumo/scrap con el CPP histórico.
- `registrar_avance_partida_op` acumula piezas buenas y scrap bajo locks de partida y OP. Una cancelación, término o pausa concurrente no se intercala con un registro de piso.
- La asignación `operador_asignado_id` se valida dentro de las RPC de tiempo, avance y consumo; el motor rechaza operaciones fuera de la partida asignada.
- El PIN de piso exige coincidencia unívoca con un operador activo; una coincidencia duplicada falla cerrada y se audita.
- Los adjuntos usan buckets privados, URLs firmadas, validación MIME/tamaño y confirmación explícita.

## Planeación y capacidad

- `recursos_planeacion` identifica la máquina, celda o recurso externo; `capacidades_recurso_turno` define horas por turno y `programacion_areas` asigna partida, fecha, turno y secuencia.
- Un trigger garantiza que la partida pertenezca a la OP; un índice único parcial impide dos preparaciones o ejecuciones simultáneas sobre el mismo recurso.
- Programar, reprogramar y activar preparación bloquean los recursos con `FOR UPDATE` en orden estable.
- El motor calcula la capacidad efectiva dentro de RPCs; TypeScript puede anticipar holgura y cuellos de botella, pero PostgreSQL conserva la decisión final.
- **Horario laboral (C18/C24):** lunes a viernes 8 h, sábado 4 h, domingo cerrado. Matutino y vespertino son solo etiquetas visuales: ambos ven la jornada completa y no la reparten. `privado.jornada_laboral_dia(fecha)` es la fuente única para capacidad, planeación, producción y la jornada del operador.

## Producción y entregas

- `sesiones_trabajo` se enlaza con la programación concreta que tomó el recurso. Índices únicos parciales impiden dos sesiones activas del mismo operador o de la misma programación.
- Las RPCs de piso bloquean partida, OP, operador, programación y recurso en orden estable, registran avances inmutables y resuelven el ciclo del recurso dentro de la transacción.
- El reclamo de proceso usa `reclamos_proceso_operador` y valida la jornada del día en el servidor.
- La pausa por material libera la máquina a los 60 minutos; el reclamo posterior vuelve a validar capacidad y permisos.
- Las notas de entrega y sus partidas no tienen columnas financieras. `generar_nota_entrega` bloquea OP y partidas por UUID ordenado, deriva `es_parcial` del historial y emite `NE-NNNNNN` desde una secuencia exclusiva de `service_role`.
- **Cierre por entrega (C19):** al entregar el 100 % la orden pasa a `CERRADA`; anular la nota la reabre. El cierre administrativo completa costo y margen.

## Dinero y finanzas

- Cobranza separa el importe comercial de Producción: `abrir_cuenta_por_cobrar` exige OP completada y partidas totalmente producidas; el monto y el tipo de cambio se capturan de forma explícita y auditada.
- `cuentas_por_cobrar` mantiene saldos en la moneda de la cuenta. `clientes.saldo_a_favor` y `movimientos_saldo_favor` forman un monedero estrictamente MXN con precisión `numeric(14,4)`.
- `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` bloquean cuenta, usuario y cliente en el mismo orden. La llave única `solicitud_id` y `ON CONFLICT` vuelven idempotentes los reintentos.
- Los folios `REC-NNNNNN`, `GTO-NNNNNN` y `NE-NNNNNN` salen de secuencias restringidas a `service_role`.
- `obtener_rentabilidad_orden` agrega CxC no cancelada, consumos de material (usada + scrap), sesiones cerradas con la tarifa histórica y gastos no cancelados; el margen no calculable queda explícito.
- `recursos_planeacion.costo_hora_interno` es la tarifa vigente. El trigger de `sesiones_trabajo` la copia al alta para que cambios posteriores no alteren la historia.
- Facturación emite y cancela facturas internas; el ERP **no timbra CFDI** (fuera de alcance hasta definir PAC y reglas fiscales).

## Dashboard, configuración y colaboración

- Las RPCs de dashboard (ejecutivo, vendedor, equipo y contador) fijan `search_path`, limitan el rango a 366 días y devuelven un JSON atómico con periodo actual y anterior. `ver_finanzas` controla CxC/CxP/utilidad/margen; el vendedor solo recibe su pipeline y el operador es redirigido a Producción.
- `configuracion_sistema` es un singleton `id = 'main'`; los bloques JSONB se normalizan con mappers estrictos y TC/IVA viven en columnas numéricas. `actualizar_configuracion_seccion` valida al actor, bloquea la fila con `FOR UPDATE` y actualiza solo la sección solicitada.
- El tipo de cambio diario usa columnas dedicadas (`tipo_cambio_actualizado_en`/`_por`) y se confirma en `/dashboard` si cambió el día en Tijuana o pasaron 24 horas.
- `comentarios_registro` y `notificaciones_usuario` tienen RLS por entidad/usuario; un trigger `SECURITY DEFINER` deriva notificaciones de menciones en la misma transacción. El parser escapa el texto antes de persistir.

## Realtime y estado cliente

- Las proyecciones usan TanStack Query como fuente de datos; Zustand solo conserva filtros, selección y estado efímero.
- Supabase Realtime se usa como **invalidación**, nunca como payload de negocio: la pantalla relee bajo RLS.
- Las terminales PIN reciben una señal SSE desde `/api/produccion-piso/sincronizacion`; revalidan sesión y recargan datos ya filtrados por operador.
- Las ráfagas de eventos se agrupan para evitar refetch en cascada; cambios de OP o partidas pueden refrescar opciones RSC sin recargar la página.

## Integraciones

- **OpenRouter:** OCR de comprobantes solo en Server Actions, con límite de tamaño, MIME validado y respuesta Zod estricta. Los errores al cliente son genéricos.
- **Brevo:** correo transaccional con remitente verificado y webhook de eventos con token en tiempo constante.
- **PDF:** `@react-pdf/renderer` genera documentos en el servidor; no se envían plantillas ejecutables al navegador.

## Convenciones de código

El código de negocio usa español: archivos kebab-case, funciones y variables camelCase, tipos PascalCase. No se usa `any`. Los hooks se implementan con nombre interno `use...` y se exportan como `usar...` para respetar las reglas de React Hooks. Las rutas y componentes no contienen reglas de negocio.
