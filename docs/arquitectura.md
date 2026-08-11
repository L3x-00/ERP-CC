# Arquitectura

## Stack

- Next.js 16 con App Router, React 19 y TypeScript estricto.
- Tailwind CSS v4 y componentes UI reutilizables.
- TanStack Query v5 para datos de servidor y Zustand v5 para estado de interfaz.
- Zod v4 y React Hook Form para validación y formularios.
- Supabase: Postgres, Auth, Storage y RLS mediante `@supabase/ssr`.
- Vitest para pruebas unitarias e integración; pnpm como gestor de paquetes.

## Capas

```text
src/app/                         rutas y composición de pantallas
src/modulos/<dominio>/           acciones, servicios, hooks, UI, tipos y validaciones
src/compartido/                  tipos, utilidades y componentes reutilizables
src/nucleo/                      Supabase, autenticación, permisos y auditoría
src/estado/                      estado global de interfaz
supabase/migrations/             esquema y funciones SQL versionadas
tests/unitarias|integracion/     evidencia automatizada
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
- Storage de adjuntos y documentos usa buckets privados y políticas acotadas al permiso correspondiente.

## Convenciones de código

El código de negocio usa español: archivos kebab-case, funciones/variables camelCase y tipos PascalCase. No se usa `any`. Los hooks se implementan con nombre interno `use...` y se exportan como `usar...` para respetar las reglas de React Hooks.
