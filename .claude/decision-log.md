# Registro de decisiones de arquitectura — ORCA MFG ERP

Una entrada por decisión no obvia. Formato: **Decisión** / **Razón** / **Alternativas descartadas**.
Las convenciones estables viven en `CLAUDE.md`; esto es el historial del *por qué*.

---

## Fase 1 — Autenticación / Permisos / Auditoría

### Sesión de operador firmada con HMAC en cookie propia (no Supabase Auth)
- **Decisión**: los operadores de piso entran con PIN y su sesión es una cookie httpOnly
  firmada con HMAC-SHA256 (`src/nucleo/autenticacion/sesion.ts`), separada de Supabase Auth.
- **Razón**: el PIN identifica al operador sin email/password; la sesión es corta (15 min de
  inactividad) y no necesita el ciclo de refresh de Supabase. HMAC vía Web Crypto es
  compatible con Edge (middleware) y Node (Server Actions).
- **Alternativas**: crear usuarios Supabase Auth por operador (overkill, no hay email);
  JWT sin firmar (inseguro).

### Rate-limiting de login vía función SQL atómica, no en el cliente
- **Decisión**: `registrar_intento_fallido` (Postgres, `SECURITY DEFINER`) incrementa y
  evalúa bloqueo en un solo statement `INSERT ... ON CONFLICT DO UPDATE`.
- **Razón**: contar-luego-escribir en el app-layer tiene condición de carrera bajo intentos
  concurrentes; el UPSERT atómico no. El bloqueo se verifica ANTES del loop de bcrypt para
  que el brute-force del PIN no sea además un vector de agotamiento de CPU.
- **Alternativas**: Upstash/Redis (infra extra no justificada aún); contador en memoria
  (no sobrevive a múltiples instancias serverless).

### Acciones que mutan el RBAC exigen `rol === 'admin'`, no `can(..., 'configuracion')`
- **Decisión**: `asignar-permiso`/`revocar-permiso` chequean rol admin explícito.
- **Razón**: una acción que puede otorgar cualquier permiso no puede depender de un permiso
  que ella misma puede otorgar (auto-escalación si 'configuracion' se asigna a un no-admin).

---

## Fase 2 — Pipeline / CRM

### Folios: `OP-XXXX` por SEQUENCE global; `CNC-MMYY-XXXX` por tabla contador con UPSERT atómico
- **Decisión**: `folio_op` usa una `SEQUENCE` de Postgres (`seq_folio_op`), formateada
  `OP-0001`. `folio_cnc` usa una tabla `contador_folios (periodo PK, ultimo)` con
  `INSERT ... ON CONFLICT (periodo) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo`,
  formateado `CNC-MMYY-XXXX`. Ambos expuestos como funciones SQL (`generar_folio_op()`,
  `generar_folio_cnc()`) llamadas por RPC desde los servicios.
- **Razón**: v1 generaba folios contando filas en el cliente → condición de carrera y
  duplicados bajo concurrencia. Las secuencias son atómicas por diseño (nunca duplican). El
  CNC necesita reinicio por mes (MMYY), cosa que una secuencia global no da; la tabla
  contador con UPSERT+RETURNING es un solo statement atómico, sin DDL en runtime.
- **Alternativas descartadas**: (a) crear una `SEQUENCE` por mes con SQL dinámico —
  ejecuta DDL en caliente, más frágil; (b) contar `MAX(folio)+1` en el app-layer — es
  exactamente el bug de v1; (c) generar el folio en el cliente — nunca, no atómico.
- **Nota**: las secuencias dejan huecos ante rollback de transacción. Es aceptable: los
  folios deben ser únicos, no consecutivos sin huecos.

### Cotizador DXF automático → diferido a Fase 2b (se implementa captura MANUAL primero)
- **Decisión**: Fase 2 implementa el flujo de cotización con captura manual de líneas
  (cantidad, descripción, material, precio unitario ingresado a mano). El parser DXF de v1
  (geometría LINE/CIRCLE/ARC/LWPOLYLINE → perímetro/perforaciones → costo láser
  auto-calculado) se pospone a una Fase 2b separada.
- **Razón**: el parser DXF es de complejidad alta y riesgo alto (parsing de geometría,
  casos borde de formatos CAD). Bloquear todo el pipeline por él contradice la lección de
  Fase 1 (los bugs no detectados se acumulan). La captura manual es funcional, probable y
  desbloquea el CRM completo; el DXF es una optimización aditiva encima.
- **Alternativas descartadas**: portar el parser de v1 tal cual dentro de Fase 2 (arrastra
  su deuda y su superficie de bugs sin haber estabilizado el pipeline base).

### Escritura del pipeline vía cliente de servidor con RLS (no cliente admin)
- **Decisión**: lecturas y escrituras ordinarias del pipeline (crear prospecto, editar
  oportunidad propia) usan el cliente de servidor con políticas RLS; solo auditoría
  (`registrarLog`) y generación de folios (RPC `SECURITY DEFINER`) usan privilegio elevado.
- **Razón**: RLS da defensa en profundidad — un vendedor solo ve/edita lo suyo aunque el
  código de app fallara. El cliente admin (bypass total de RLS) se reserva para lo que
  realmente lo necesita. Helper `usuario_tiene_permiso(p)` (`SECURITY DEFINER`) permite a
  las políticas RLS respetar `ver_pipeline_equipo` sin recursión.
- **Alternativas descartadas**: todo vía cliente admin + checks solo en app (como algunas
  acciones de Fase 1) — pierde la red de seguridad de RLS para datos vendor-scoped.

### Endurecimiento RLS post-revisión (migraciones 000006/000007)
- **Decisión**: (a) las columnas controladas del pipeline (`etapa`, `folio_op`, `folio_cnc`,
  `cliente_id`) solo se cambian con cliente admin (service_role) desde Server Actions; un
  trigger `BEFORE UPDATE` rechaza el cambio directo por un cliente `authenticated`, y la
  política INSERT exige alta de prospecto limpio. (b) Storage de adjuntos acotado por carpeta
  = `pipeline_id`, heredando el acceso a la oportunidad padre. (c) Índice único
  `lower(correo)` en `clientes` + manejo de conflicto en la promoción. (d) `EXECUTE` de las
  funciones de folio revocado de PUBLIC, otorgado solo a `service_role`.
- **Razón**: los hooks usan el cliente de navegador (anon key + JWT del usuario), así que
  **RLS es la frontera real**: una regla que solo viva en la Server Action es evadible por
  PostgREST directo. Sin (a), un vendedor técnico fijaba `etapa='ganada'` saltándose
  `aprobar_ordenes` y la promoción. Sin (b), cualquier autenticado leía/borraba adjuntos de
  cualquier vendedor (planos del cliente). Verificado en vivo (auth bloqueado, service_role
  permitido) antes de cerrar.
- **Alternativas descartadas**: replicar toda la máquina de estados en un trigger SQL
  (duplica `reglas-transicion` en Postgres, propenso a divergir); dejar la validación solo en
  la acción (evadible por el cliente de navegador).

### `clientes` mínima en Fase 2, se expande en Fase 3
- **Decisión**: se crea `clientes` con solo los campos necesarios para el FK y la promoción
  (`nombre_comercial`, `rfc`, `contacto`, `correo`, `telefono`). Tiers/crédito → Fase 3.
- **Razón**: `pipeline.cliente_id` necesita la tabla destino ya existente, y "Ganada"
  dispara `promoverAClienteSiNoExiste()`. Construir el sistema completo de clientes aquí
  sería adelantar Fase 3. La migración de `clientes` se ordena ANTES de `pipeline` (el FK
  la requiere), desviándose del orden de nombres sugerido en el prompt.
