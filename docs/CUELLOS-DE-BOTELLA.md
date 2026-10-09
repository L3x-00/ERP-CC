# Cuellos de botella — errores que no se deben repetir

Lectura obligatoria para todo agente de IA (Codex, Claude Code u otro) antes de implementar, depurar CI o aplicar migraciones. Cada entrada es un caso real que costó horas o ciclos de CI entre el 2026-10-06 y el 2026-10-09. Si aparece un caso nuevo, agregarlo aquí con síntoma, causa y regla.

## 1. CI que falla "de forma indeterminada"

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| `rbac-concurrencia`: `expected 2 to be 1` solo en CI | Las suites de integración corrían en paralelo; otras cinco creaban admins activos mientras esta contaba los admins globales | Integración y concurrencia corren con `--no-file-parallelism`. Una prueba que mide un conteo global debe controlar todo ese estado o correr aislada |
| `An invalid response was received from the upstream server` | Carga de suites paralelas contra el gateway local de Supabase | Igual que arriba; no reintentar a ciegas |
| `toomanyrequests: Rate exceeded` al levantar Supabase | Límite de descargas de Docker Hub | Es infraestructura: relanzar solo el job fallido (`gh run rerun <id> --failed`), sin tocar código |

| "CI en verde" que en realidad era de otro commit | Se vigiló la última corrida de la rama sin comprobar su `headSha`; además el PR ya estaba fusionado y los commits nuevos no tenían PR abierto, así que no corría CI | Antes de reportar CI, comprobar que la corrida corresponde al commit (`gh run list --json headSha`). Tras un merge del PO, abrir un PR nuevo para los commits siguientes |

**Regla de diagnóstico:** ante un CI rojo, leer primero `gh run view <id> --log-failed` y clasificar cada fallo como **infraestructura** (relanzar), **aislamiento de prueba** (corregir la prueba) o **defecto** (corregir el producto). Revisar todos los jobs fallidos antes de corregir: arreglar un fallo, esperar 15 minutos y descubrir el siguiente fue el bucle más caro.

## 2. Pruebas que pasan en local y fallan en la app

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| "Guardar datos" fallaba con `permission denied for schema privado` | Funciones trigger nuevas sin `SECURITY DEFINER`; pgTAP corre como `postgres` y no lo detectó | Todo trigger que llame a `privado.*` es `SECURITY DEFINER` con `search_path = ''`. Cada pgTAP de mutaciones incluye casos con `SET LOCAL ROLE service_role`, que es el rol con el que escribe la app |
| `next build` del E2E aborta con "Failed to type check" sin detalle | El build oculta el error de tipos | Correr `pnpm typecheck` antes de lanzar cualquier E2E |
| Un E2E dejará de pasar en una fecha concreta | Fechas futuras escritas a mano (`2026-10-15`) | Fechas relativas a `Date.now()` en fixtures y E2E |
| Endurecer una regla rompe decenas de pruebas ajenas | Los fixtures insertan estados imposibles por la UI (RFQ "Listo" sin requisitos) | Al endurecer un invariante, acotarlo a los registros creados por el flujo nuevo o migrar fixtures en el mismo corte; ejecutar antes el pgTAP de los bloques consumidores |
| El diálogo "Nuevo ítem" se cerraba solo | Un efecto asíncrono ("Continuar captura") sobrescribía la navegación del usuario | Todo salto automático se cancela si el usuario navegó antes de que llegue el dato |

## 3. Migraciones y base remota

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| `supabase migration list --linked` mostraba 108 migraciones pendientes que sí estaban aplicadas | El PO aplica migraciones pegándolas en el SQL Editor; el historial `supabase_migrations` no se actualiza | Nunca `supabase db push` sin reconciliar. Verificar el remoto por **huella de esquema** (funciones, columnas, triggers, políticas e índices) con `supabase db query --linked` y registrar lo aplicado con `supabase migration repair --status applied <versión> --linked` |
| Funciones locales con "??" en lugar de tildes | Pasar SQL por una tubería de PowerShell degrada UTF-8 | Aplicar en local con `supabase migration up --local` o `psql -f`; nunca `Get-Content … \| psql` |
| Migración vacía con marca de tiempo anterior a las aplicadas | Archivo creado y abandonado por un agente | Una migración nueva siempre lleva marca posterior a la última aplicada y contenido; no dejar archivos vacíos |

## 4. Proceso y coordinación entre agentes

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Trabajo perdido o a medias cuando un agente agotó su ventana de uso | Incrementos grandes sin commit ni checkpoint | Commit del incremento verificado antes de superar el 80 % de uso; al 90 %, checkpoint en `HANDOFF.md` con siguiente paso exacto y detenerse |
| Avance lento por correr toda la suite en cada cambio | Gates completos en cada incremento | Por cambio: pruebas de lo editado más `pnpm typecheck` y lint focal. Suite completa al cierre de bloque o en CI |
| Un agente continúa el corte de otro sin saber qué quedó probado | Commits WIP sin estado claro | Todo commit de trabajo incompleto dice en el mensaje qué falta y qué gates se corrieron |
| Scripts de shell rotos por comillas | Heredocs largos con comillas mezcladas | Para scripts de más de unas líneas, escribir el archivo y ejecutarlo |

## 5. Integración a producción

El PO fusiona a `main` (y por tanto a producción) desde GitHub. Los agentes trabajan en la rama, suben commits y dejan el PR con CI en verde; no mergean a `main`. Las migraciones las aplica el PO en remoto, junto con el despliegue del código que las usa.
