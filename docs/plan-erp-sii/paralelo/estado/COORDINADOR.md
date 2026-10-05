# Estado COORDINADOR — Integración y custodia

> Append-only. El coordinador mantiene aquí el control del trabajo paralelo.

## 2026-10-05 — Arranque del modo paralelo

- **E1 (B1.1/B1.2)**: verificado y commiteado `7f97714`. pgTAP 402/402, integración 223/223, E2E 40/40, unit 770/770, visual 4/4.
- **E3 (B1.9 archivos)**: verificado y commiteado `72d1765`. pgTAP 413/413, integración 223/223, E2E 41/41 (incluye `archivos-cliente.spec.ts`), unit 778/778. Migración `20261005100003` aplicada en local; pendiente que el PO la aplique en remoto cuando autorice.
- **Ajustes de tests por E3**: `ar-movimientos` usa razón social única; `usuario-inactivo-rls` sube fixture PDF (los límites MIME del bucket ya aplican); `subir-documento-orden` ahora registra metadata.
- **Streams lanzados**: A (E2 catálogos `2026100610xxxx`), B (E4 actividad `2026100620xxxx`), C (B2 clientes `2026100630xxxx`).
- **Zonas de coordinación activas**: `supabase.ts` (bloqueo de tipos), pruebas mutantes/E2E (bloqueo de pruebas), migraciones (las aplica el PO).
- **Fuera de los streams** (coordinador): retrofit de `correlationId` en acciones de todos los módulos, pipeline/B3 en adelante, limpieza de `clientes-contactos` si C cambia el flujo, commits e integración.
- **Bloqueos actuales**: ninguno.
- **Siguiente**: vigilar estado de A/B/C, resolver peticiones de zonas compartidas, verificar y commitear cada sub-bloque terminado.
