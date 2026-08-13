# Fase 6 — Sub-fase 6.4: Operación funcional y gate E2E

## Entregado

- Ruta RSC protegida `/planeacion`, con permiso de visualización o gestión antes de cargar datos.
- Calendario operativo con filtros de fecha, área, recurso, turno y estado; muestra horas programadas, capacidad y holgura retornada por PostgreSQL.
- Panel para asignar una partida, reprogramar una seleccionada y activar preparación. El formulario solo valida forma; capacidad, candado y concurrencia permanecen en la RPC.
- TanStack Query centraliza la proyección de servidor. Las mutaciones y Realtime invalidan la misma clave, por lo que recursos, carga y programaciones se actualizan sin refresco manual.

## Gate E2E remoto

La prueba `planeacion-flujo-colaborativo.spec.ts` crea un usuario administrador, cliente, OP con folio atómico, partida, recurso y capacidades con identificadores E2E aislados. Luego:

1. Inicia sesión y programa la partida desde `/planeacion`.
2. Comprueba la programación y las entradas de auditoría.
3. Activa preparación desde la interfaz.
4. Abre una segunda vista autenticada y reprograma la fila directamente por la RPC de prueba.
5. Comprueba que la segunda vista recibe la nueva fecha por Realtime sin navegar ni recargar.
6. Elimina exclusivamente los IDs de prueba; si falla el preparado, el bloque de recuperación limpia los recursos ya creados.

No se aplicó una Skill de UI/UX Pro Max: esta sub-fase mantiene UI funcional, accesible y responsiva como soporte del backend transaccional.
