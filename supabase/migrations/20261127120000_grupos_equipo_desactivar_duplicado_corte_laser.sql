-- Bug producción 2026-11-27: existían dos grupos casi idénticos,
-- `CL1 · CORTE LASER` (con proceso y máquinas) y `CORTE_LASER · Corte láser`
-- (sin proceso ni máquinas). El duplicado aparecía en los selectores y
-- confundía el alta de equipos. Se desactiva, no se borra, para conservar
-- historial y auditoría.
--
-- Guardarraíles: solo actúa sobre el grupo sin procesos ni máquinas y con el
-- código/nombre exactos. Si en otro entorno ese grupo sí tuviera uso, no cambia
-- nada.
update grupos_equipo g
set activo = false
where g.codigo = 'CORTE_LASER'
  and g.nombre = 'Corte láser'
  and g.activo
  and not exists (
    select 1 from catalogo_procesos p where p.grupo_equipo_id = g.id
  )
  and not exists (
    select 1 from recursos_planeacion r where r.grupo_equipo_id = g.id
  );
