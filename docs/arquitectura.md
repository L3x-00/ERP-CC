# Arquitectura

## Stack

- Next.js 16 con App Router, React 19 y TypeScript estricto.
- Tailwind CSS v4 y componentes UI reutilizables.
- TanStack Query v5 para datos de servidor y Zustand v5 para estado de interfaz.
- Zod v4 y React Hook Form para validación y formularios.
- Supabase: Postgres, Auth, Storage y RLS mediante `@supabase/ssr`.
- Vitest para pruebas unitarias e integración; Playwright para E2E y pnpm como gestor de paquetes.

## Capas

```text
src/app/                         rutas y composición de pantallas
src/modulos/<dominio>/           acciones, servicios, hooks, UI, tipos y validaciones
src/compartido/                  tipos, utilidades y componentes reutilizables
src/nucleo/                      Supabase, autenticación, permisos y auditoría
src/estado/                      estado global de interfaz
supabase/migrations/             esquema y funciones SQL versionadas
tests/unitarias|integracion/     evidencia automatizada
tests/e2e/                       flujo de navegador con datos temporales aislados
```

Las rutas no contienen reglas de negocio. Las Server Actions validan con Zod, comprueban permisos cuando corresponde, llaman al servicio y registran auditoría. Los componentes no acceden directamente a Supabase.

## Seguridad y concurrencia

- RLS permanece activa en toda tabla de negocio. Las mutaciones críticas carecen de políticas PostgREST directas y pasan por acciones de servidor autorizadas.
- El `service_role` se limita a operaciones que realmente requieren privilegio elevado.
- Los folios OP, CNC e inventario se generan atómicamente en Postgres.
- Las Órdenes de Producción usan una cabecera, partidas y eventos de tiempo de operador. Su serie `OP-NNNNNN` nace en una `SEQUENCE` de Postgres y solo `service_role` puede consumirla mediante función `SECURITY DEFINER` con ruta de búsqueda acotada.
- Las nuevas tablas de órdenes separan los privilegios SQL de RLS: `authenticated` recibe exclusivamente `SELECT`; las mutaciones se realizan mediante Server Actions autorizadas y RPCs `SECURITY DEFINER` ejecutables solo por `service_role`.
- Aprobar una oportunidad y crear su OP se ejecutan en una sola función SQL con bloqueo de fila e índice único de cotización. Los cambios de estado aplican compare-and-set para rechazar pantallas obsoletas.
- `registrar_movimiento_inventario` bloquea la fila del material, rechaza stock negativo y recalcula el costo promedio ponderado dentro de la misma transacción.
- `registrar_consumo_material_op` bloquea el material, valida la partida y el stock, crea la salida de kardex y persiste consumo/scrap con el CPP histórico en una única transacción. La RPC solo es ejecutable por `service_role`; el consumo no recalcula CPP porque una salida no cambia el costo promedio.
- Las marcas de tiempo pasan por `registrar_tiempo_operador_op`: bloquea partida y OP, exige que esta siga `en_proceso`, verifica un operador activo y usa `now()` de PostgreSQL. La RPC solo es ejecutable por `service_role`; la acción contrasta además el operador con una cookie PIN HMAC vigente.
- `registrar_avance_partida_op` acumula piezas buenas y scrap bajo locks de partida y OP. El consumo de material usa el mismo estado bloqueado `en_proceso`; con ello una cancelación, término o pausa concurrentes no se intercalan con un registro de piso.
- La asignación `operador_asignado_id` se valida dentro de las RPC de tiempo, avance y consumo. El motor rechaza cualquier operación de piso fuera de su partida asignada.
- Las funciones de apoyo a RLS viven en el esquema `privado`, fijan su ruta de búsqueda y no son invocables directamente por roles de navegador.
- Los cambios de producción se publican por Supabase Realtime bajo RLS. Las terminales PIN reciben solamente una señal SSE desde el servidor, revalidan su sesión y vuelven a cargar datos ya filtrados por operador; no reciben filas, costos ni credenciales privilegiadas.
- `usarTiendaOrdenes` concentra estado efímero de taller (orden activa y filtros de máquina/estado) sin persistirlo entre turnos.
- Storage de adjuntos y documentos usa buckets privados y políticas acotadas al permiso correspondiente.
- Planeación separa el recurso programable del texto histórico `maquina_asignada`: `recursos_planeacion` identifica la máquina, celda o recurso externo; `capacidades_recurso_turno` define horas normales por turno y `programacion_areas` asigna una partida a una fecha, turno y secuencia. Un trigger garantiza que la partida pertenezca a la OP, y un índice único parcial impide dos preparaciones o ejecuciones simultáneas sobre el mismo recurso. Las tres tablas solo permiten lectura autenticada con permiso de planeación, reservan escritura a `service_role`/RPC y se publican en Realtime bajo RLS.
- El motor de capacidad de Planeación añade `excepciones_capacidad_recurso` y calcula la capacidad efectiva dentro de RPCs `SECURITY DEFINER` ejecutables solo por `service_role`. Programar, reprogramar y activar preparación bloquean los recursos con `FOR UPDATE`; las reprogramaciones bloquean varios recursos por UUID y usan `actualizado_en` como compare-and-set. La capa TypeScript puede anticipar holgura y cuellos de botella, pero PostgreSQL conserva la decisión final para que la capacidad no dependa de una pantalla obsoleta.
- La proyección de calendario de Planeación se consulta mediante una Server Action acotada por rango y permiso. TanStack Query almacena recursos, carga y programaciones bajo `['planeacion', 'calendario']`; Realtime no consume payloads, solo invalida esa clave y relee por RLS. Cambios de OP o partidas disparan además un refresco RSC ligero para renovar las opciones de asignación, sin navegar ni recargar el navegador.
- Producción enlaza `sesiones_trabajo` con la programación concreta que tomó el recurso. Los índices únicos parciales impiden dos sesiones activas del mismo operador o la misma programación. Las RPCs bloquean partida, OP, operador, programación y recurso en orden estable, registran avances inmutables y resuelven el ciclo del recurso dentro de la transacción.
- Las notas de entrega y sus partidas no poseen columnas financieras. `generar_nota_entrega` bloquea OP y partidas por UUID ordenado, deriva `es_parcial` del historial y emite `NE-NNNNNN` desde una secuencia PostgreSQL exclusiva de `service_role`.
- La proyección de Producción usa TanStack Query bajo `['produccion', 'tablero']`. `usarTiendaProduccion` solo guarda filtros, selección y una referencia de sesión; Realtime invalida y relee por RLS las tablas publicadas, sin usar sus payloads como fuente de datos.
- Cobranza separa el importe comercial de Producción: `abrir_cuenta_por_cobrar` exige OP completada y partidas totalmente producidas, mientras que el monto y el tipo de cambio se capturan de forma explícita y auditada. `cuentas_por_cobrar` mantiene saldos en la moneda de la cuenta; `clientes.saldo_a_favor` y `movimientos_saldo_favor` forman un monedero estrictamente MXN con precisión `numeric(14,4)`.
- `registrar_pago_ar_atomico` y `aplicar_saldo_favor_ar` bloquean cuenta AR, usuario y cliente en el mismo orden. La llave única `solicitud_id` y `ON CONFLICT` vuelven idempotentes los reintentos y dobles envíos. Los folios `REC-NNNNNN` salen de una secuencia PostgreSQL restringida a `service_role`.
- La cartera usa TanStack Query bajo `['cobranza', 'cartera']`; `usarTiendaCobranza` solo conserva interacción local. Realtime escucha las tres tablas financieras publicadas, invalida la consulta y relee por RLS sin proyectar payloads de difusión en pantalla.

## Convenciones de código

El código de negocio usa español: archivos kebab-case, funciones/variables camelCase y tipos PascalCase. No se usa `any`. Los hooks se implementan con nombre interno `use...` y se exportan como `usar...` para respetar las reglas de React Hooks.
