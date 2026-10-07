-- SII-B1 / H-B1-32 y H-B1-33 -- Storage privado, sin mutación directa.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(7);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'adjuntos_insertar'),
  'Adjuntos no admite INSERT directo de authenticated'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'adjuntos_eliminar'),
  'Adjuntos no admite DELETE directo de authenticated'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'documentos_cliente_storage_insertar'),
  'Documentos de cliente no admite INSERT directo de authenticated'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'documentos_cliente_storage_eliminar'),
  'Documentos de cliente no admite DELETE directo de authenticated'
);
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage'
    AND tablename = 'objects' AND policyname = 'adjuntos_seleccionar'),
  'Adjuntos conserva lectura privada para URLs firmadas'
);
SELECT ok(
  (SELECT qual LIKE '%foldername%[2]%' FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'adjuntos_seleccionar'),
  'La lectura reconoce rutas nuevas rfq/<id>/archivo'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'adjuntos-cotizacion'),
  false,
  'El bucket de adjuntos continúa privado'
);

SELECT * FROM finish();
ROLLBACK;
