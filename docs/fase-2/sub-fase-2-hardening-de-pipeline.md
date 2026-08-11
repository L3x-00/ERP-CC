# Fase 2 · Subfase 2 — Hardening de seguridad y concurrencia

## Hallazgos corregidos

- Un cambio directo de etapa por PostgREST podía evitar la Server Action: un trigger bloquea las columnas controladas para clientes autenticados.
- La reversión de etapa podía saltar la autorización de Ganada: la máquina de transiciones se validó y cubrió con pruebas.
- Las búsquedas podían inyectar filtros PostgREST: los términos se sanitizan antes de construir consultas.
- Los nombres de adjuntos podían usarse para path traversal: se normalizan en servidor.
- Storage solo validaba bucket: las políticas se limitaron al directorio de la oportunidad y su acceso padre.
- La promoción de clientes podía duplicar registros en carrera: índices únicos y manejo del conflicto `23505` protegen el flujo.
- Las RPC de folio heredaban ejecución de `PUBLIC`: se revocó y se concedió únicamente a `service_role`.

## Decisión vigente

El parser DXF se mantiene fuera de alcance como Fase 2b. La cotización manual es funcional y evita bloquear la operación comercial por un parser CAD de alto riesgo.
