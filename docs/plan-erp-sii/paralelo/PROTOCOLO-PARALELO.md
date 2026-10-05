# Protocolo de desarrollo paralelo — ERP SII/CC

**Vigente desde:** 2026-10-05. Obligatorio para las 3 terminales simultáneas y para el coordinador.
**Fuente funcional:** `docs/plan-erp-sii/` (bloques) + `docs/ERP_SII_Handoff_Tecnico_Funcional.md` (cliente).

## 1. Reparto de trabajo

| Terminal | Stream | Alcance | Banda de migraciones | Estado |
|---|---|---|---|---|
| A | E2 Catálogos | B1.3–B1.8 (materiales, espesores, procesos, grupos equipo/planeados, próximas acciones, versionado, UI) | `2026100610xxxx` | `estado/TERMINAL-A.md` |
| B | E4 Actividad | B1.10 (`logs.correlation_id`, `/actividad`, RPC, propagación en `registrar-log`) | `2026100620xxxx` | `estado/TERMINAL-B.md` |
| C | B2 Clientes | Folio CLI-, alta atómica, contactos lógicos, pestaña Comercial, estado por acción, ficha nueva | `2026100630xxxx` | `estado/TERMINAL-C.md` |
| Coordinador | Integración | Custodia de zonas compartidas, verificación, commits, resolución de conflictos, siguiente bloque | — | `estado/COORDINADOR.md` |

Regla: **una terminal no toca archivos de otro stream** (mapa en §3). Si lo necesita, se detiene y lo pide en su archivo de estado.

## 2. Reglas de convivencia

1. **Un escritor por archivo.** Antes de editar, verifica que el archivo pertenece a tu stream (§3).
2. **Nunca `git add/commit/push`.** Solo lectura (`git status`, `git diff`, `git log`). Los commits los hace el coordinador tras verificar.
3. **Nunca aplicar migraciones** (`supabase migration up`, `db push`, `reset`). La migración la aplica el PO; tú la escribes, la registras y la reportas.
4. **Nunca tocar** `.env*`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.agents/`, `.ai-shared/` (salvo tu carpeta de estado), `entregables/*`, `docs/ERP_SII_Handoff_Tecnico_Funcional.md`, ni migraciones/tests de otro stream.
5. **No reformatear** archivos compartidos ni "limpiar" código ajeno.
6. Si un comando falla por trabajo de otro stream (p. ej. un tipo que aún no existe), **no lo arregles fuera de tu alcance**: anótalo en tu estado y sigue con lo que sí puedes.
7. Antes de empezar cada jornada: `git status` y leer tu archivo de estado y el del coordinador.

## 3. Mapa de propiedad de archivos

| Zona | Dueño | Notas |
|---|---|---|
| `supabase/migrations/2026100610*`, `supabase/tests/sii_b1_catalogos*` | A | solo prefijo propio |
| `src/modulos/catalogos/**` (nuevo, tú lo creas) | A | servicios, acciones, tipos, componentes |
| `src/modulos/configuracion/componentes/pestana-catalogos-base.tsx`, `src/modulos/configuracion/acciones/catalogos-base*.ts` | A | archivos nuevos |
| `src/modulos/configuracion/componentes/operacion-configuracion.tsx` | A | zona compartida: única terminal autorizada |
| `tests/unitarias/catalogos-*.test.ts`, `tests/e2e/catalogos-base.spec.ts` | A | |
| `supabase/migrations/2026100620*`, `supabase/tests/sii_b1_actividad*` | B | solo prefijo propio |
| `src/nucleo/auditoria/registrar-log.ts` | B | zona sensible: cambio aditivo y compatible |
| `src/modulos/auditoria/**` | B | |
| `src/app/(privado)/actividad/**` (nuevo), `src/compartido/componentes/navegacion/modulos-navegacion.ts` | B | enlace de navegación |
| `tests/unitarias/actividad-*.test.ts`, `tests/e2e/actividad.spec.ts` | B | |
| `supabase/migrations/2026100630*`, `supabase/tests/sii_b2_*` | C | solo prefijo propio |
| `src/modulos/clientes/**`, `src/app/(panel)/clientes/**` | C | incluye `ficha-cliente.tsx` |
| `tests/unitarias/clientes-*.test.ts`, `tests/e2e/clientes-*.spec.ts` | C | actualizar los existentes de clientes si cambia la UI |
| `src/compartido/tipos/supabase.ts` | **Zona de coordinación** | ver §4 (bloqueo) |
| `src/compartido/constantes/indice.ts`, `package.json`, `docs/plan-erp-sii/README.md` | Coordinador | pedir cambio en tu estado |
| `src/modulos/permisos/**`, `src/nucleo/almacenamiento/archivos/**` | Congelado (E1/E3) | no editar |

## 4. Zona de coordinación: `supabase.ts`

Cada stream **sí** agrega sus tablas/columnas/funciones al tipo generado, con este protocolo:

1. Toma el bloqueo: crea `docs/plan-erp-sii/paralelo/BLOQUEO-TIPOS.lock` con tu terminal y hora. Si ya existe y tiene menos de 15 min, espera y reintenta; si es viejo, ignóralo y tómalo.
2. `git diff -- src/compartido/tipos/supabase.ts` para detectar ediciones ajenas en curso.
3. Agrega **solo tu bloque** (al final de la sección `Tables` o `Functions` según corresponda), formato generado por Supabase, sin tocar lo demás.
4. Verifica que tu bloque quedó (`Select-String`), libera el bloqueo (borra el `.lock`).
5. Si al liberar detectas que tu bloque desapareció (alguien guardó encima), vuelve a insertarlo.

## 5. Bloqueos de pruebas mutantes y E2E

`pnpm test:integracion`, `pnpm test:concurrencia` y `pnpm test:e2e` **mutan la base local** y E2E usa el puerto 3100:

1. Toma `docs/plan-erp-sii/paralelo/BLOQUEO-PRUEBAS.lock` (mismo criterio de vencimiento de 20 min).
2. Corre tus pruebas.
3. Libera el bloqueo.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test` (unitarias) y `supabase test db` **no necesitan bloqueo** (unitarias no mutan; pgTAP revierte).

## 6. Flujo por tarea

1. Lee tu prompt, tu bloque en `docs/plan-erp-sii/` y tu estado.
2. Implementa por sub-tarea con IDs del plan (`SII-Bx.y-nn`).
3. Escribe migración con tu banda; pide al PO aplicarla (mensaje en tu reporte). Mientras: unitarias + estáticas.
4. Aplicada la migración: `supabase test db` + integración/E2E con bloqueo.
5. Registra en `estado/TERMINAL-X.md`: hora, tarea, archivos, comandos, resultado, bloqueos, siguiente.
6. Al cerrar un sub-bloque: reporte final al usuario (formato §7). El coordinador verifica y commitea.

## 7. Formato de reporte (al usuario y en tu estado)

```
TERMINAL: A | FECHA-HORA:
ESTADO: EN_CURSO | BLOQUEADO | SUB-BLOQUE LISTO
TAREAS: SII-B1.3-01 … (estado por tarea)
ARCHIVOS: rutas nuevas/modificadas
MIGRACIONES: nombre exacto | APLICADA POR PO: sí/no
GATES: unit N/N · lint · typecheck · pgTAP N/N · integración N/N · E2E N/N
EVIDENCIA: comandos + resultado (sin secretos)
BLOQUEOS: qué, desde cuándo, qué necesitas (dueño del archivo, migración, decisión)
SIGUIENTE: tarea concreta
```

## 8. Conflictos

- Archivo ajeno necesario → escribe la petición en tu estado (`BLOQUEOS`) y sigue con otra tarea.
- Migración de otro stream no aplicada y te bloquea → repórtalo; no la apliques tú.
- Duda de negocio no resuelta en el documento del cliente → anótala como decisión pendiente; **no inventes reglas**.
- El coordinador puede reasignar un archivo o una tarea; se registra en `estado/COORDINADOR.md`.
