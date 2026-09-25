-- A19: la carga binaria directa evita límites de cuerpo de Vercel/Next.
-- Supabase aplica MIME y tamaño aunque el navegador ignore validaciones.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'
    ]::text[],
    public = false
WHERE id = 'comprobantes-gasto';

CREATE UNIQUE INDEX IF NOT EXISTS gastos_comprobante_ruta_unica_a19
  ON public.gastos (comprobante_ruta)
  WHERE comprobante_ruta IS NOT NULL;
