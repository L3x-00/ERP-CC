-- Corrige descripciones creadas con codificación dañada en la migración inicial
-- de la Sub-fase 6.1. No modifica datos ni estructura.
COMMENT ON TABLE public.recursos_planeacion IS
  'Recurso programable: máquina concreta, área virtual o capacidad externa.';

COMMENT ON TABLE public.programacion_areas IS
  'Programación secuenciada de partidas por recurso, fecha y turno.';
