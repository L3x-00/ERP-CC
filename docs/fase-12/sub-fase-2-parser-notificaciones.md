# Sub-fase 12.2 — Menciones, sanitización y servicios

## Resultado

Se implementó `extraerMencionesYSanitizar()` para resolver menciones contra la
lista de usuarios activos y devolver texto escapado como texto plano. El parser:

- reconoce nombres completos sin confundir prefijos (`@Ana` no coincide con
  `@Anabel`);
- elimina duplicados y mantiene un orden determinista;
- descarta UUIDs inválidos o usuarios no disponibles;
- escapa `&`, `<`, `>`, comillas simples y dobles antes de persistir.

El servicio de comentarios carga hilos activos con nombres de autor, ofrece la
lista mínima de usuarios mencionables, consulta notificaciones acotadas y marca
una notificación únicamente cuando pertenece al usuario de sesión.

## Contratos

Los mappers `filaAComentario()` y `filaANotificacion()` convierten filas de
Supabase a contratos camelCase y descartan JSON malformado. Zod v4 valida UUID,
entidad, contenido (1–2000 caracteres), menciones y límites de lectura.
