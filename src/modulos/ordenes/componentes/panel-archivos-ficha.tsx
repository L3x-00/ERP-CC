import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';

export function PanelArchivosFicha({ archivos }: { archivos: ArchivoFicha[] }) {
  return (
    <section className="grid gap-2" data-testid="ficha-panel-archivos">
      {archivos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin archivos vivos referenciados por el snapshot.</p>
      ) : archivos.map((archivo) => (
        <div key={`${archivo.archivoId}-${archivo.itemCodigo ?? 'rev'}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde px-3 py-2 text-sm">
          <span className="font-medium text-texto-primario">
            {archivo.nombreErp ?? archivo.nombreOriginal ?? archivo.archivoId}
          </span>
          <span className="text-xs text-texto-secundario">
            {archivo.clase ?? 'general'} · {archivo.origen === 'item' ? `ítem ${archivo.itemCodigo}` : 'revisión'}
          </span>
        </div>
      ))}
    </section>
  );
}
