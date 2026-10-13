// @vitest-environment jsdom
// Obs. cliente 2026-10-13: antes de validar, la ficha lista en rojo lo que falta
// (ítem, ruteo por proceso, costeo y archivo), lleva a la pestaña correcta y
// mantiene «Validar» bloqueado hasta completarlo. El panel de archivos marca el
// campo en rojo cuando no hay ningún archivo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Las Server Actions se aíslan: aquí solo importa lo que el panel muestra.
vi.mock('@/modulos/propuestas/acciones/aceptar-revision', () => ({ aceptarRevisionAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/cerrar-propuesta', () => ({ cerrarPropuestaAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/confirmar-venta', () => ({ confirmarVentaAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/enviar-revision', () => ({ enviarRevisionAccion: vi.fn() }));
vi.mock('@/modulos/propuestas/acciones/firmar-archivo-propuesta', () => ({
  firmarArchivoPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/generar-pdf-revision', () => ({
  generarPdfRevisionAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/rechazar-propuesta', () => ({
  rechazarPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/registrar-seguimiento-propuesta', () => ({
  registrarSeguimientoPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/validar-revision-con-seguimiento', () => ({
  validarRevisionConSeguimientoAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/retirar-archivo-propuesta', () => ({
  retirarArchivoPropuestaAccion: vi.fn(),
}));
vi.mock('@/modulos/propuestas/acciones/subir-archivo-propuesta', () => ({
  prepararSubidaArchivoPropuestaAccion: vi.fn(),
  confirmarArchivoPropuestaAccion: vi.fn(),
  descartarSubidaArchivoPropuestaAccion: vi.fn(),
}));
vi.mock('@/nucleo/almacenamiento/archivos/subida-navegador', () => ({
  subirArchivoDirecto: vi.fn(),
}));
vi.mock('@/modulos/propuestas/componentes/panel-orden-pendiente', () => ({
  PanelOrdenPendiente: () => null,
}));

import type {
  DetallePropuestaFicha,
  RevisionConTotales,
} from '@/modulos/propuestas/acciones/obtener-propuesta';
import { PanelAccionesPropuesta } from '@/modulos/propuestas/componentes/panel-acciones-propuesta';
import { PanelArchivosPropuesta } from '@/modulos/propuestas/componentes/panel-archivos-propuesta';
import type { PermisosPropuesta, RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';
import type { FaltantesValidacionPropuesta } from '@/modulos/propuestas/utilidades/validacion-propuesta';

const PERMISOS = {
  editarArticulo: true,
  editarPrecio: true,
  editarRuteo: true,
  editarCosto: true,
  validar: true,
  generarPdf: true,
  enviar: true,
  seguimiento: true,
  aceptar: true,
  crearRevision: true,
  cerrar: true,
} as PermisosPropuesta;

function revision(parcial: Partial<RevisionConTotales> = {}): RevisionConTotales {
  return {
    id: 'rev-a',
    propuestaId: 'propuesta-1',
    letra: 'A',
    folioRevision: 'CNC-0001-A',
    estado: 'DRAFT',
    motivoCreacion: null,
    requiereRevisionRuteo: false,
    requiereRevisionCosteo: false,
    snapshotCabecera: { ivaPorcentaje: 16, moneda: 'MXN' },
    totales: { subtotal: 0, iva: 0, total: 0, moneda: 'MXN' },
    pdfs: [],
    ...parcial,
  } as unknown as RevisionConTotales;
}

const DETALLE = {
  propuesta: { id: 'propuesta-1', acceptedRevisionId: null },
  acciones: [],
} as unknown as DetallePropuestaFicha;

function faltantes(parcial: Partial<FaltantesValidacionPropuesta>): FaltantesValidacionPropuesta {
  const base: FaltantesValidacionPropuesta = {
    sinItemsActivos: false,
    itemsSinRuteo: [],
    itemsSinCostear: [],
    sinArchivos: false,
    confirmaciones: [],
    contenido: [],
    mensajes: [],
    ...parcial,
  };
  return { ...base, mensajes: [...base.contenido, ...base.confirmaciones] };
}

function montarPanel(opciones: {
  faltantes?: FaltantesValidacionPropuesta | null;
  revision?: RevisionConTotales;
  onIrA?: (destino: 'items' | 'ruteo' | 'archivos') => void;
}) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(PanelAccionesPropuesta, {
        detalle: DETALLE,
        revision: opciones.revision ?? revision(),
        catalogos: null,
        permisos: PERMISOS,
        faltantes: opciones.faltantes ?? null,
        ...(opciones.onIrA ? { onIrA: opciones.onIrA } : {}),
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('PanelAccionesPropuesta — qué falta para validar (obs. cliente 2026-10-13)', () => {
  it('lista en rojo lo que falta y bloquea «Validar»', () => {
    montarPanel({
      faltantes: faltantes({
        sinItemsActivos: true,
        sinArchivos: true,
        contenido: ['al menos un ítem activo', 'al menos un archivo'],
      }),
    });

    const aviso = screen.getByTestId('faltantes-validacion');
    expect(aviso.className).toContain('border-peligro');
    expect(aviso.textContent).toContain('al menos un ítem activo');
    expect(aviso.textContent).toContain('al menos un archivo');

    const validar = screen.getByRole('button', { name: 'Validar' }) as HTMLButtonElement;
    expect(validar.disabled).toBe(true);
    expect(validar.getAttribute('title')).toBe('Completa lo marcado en rojo antes de validar');
  });

  it('con la propuesta completa no hay aviso y «Validar» queda disponible', () => {
    montarPanel({ faltantes: faltantes({}) });

    expect(screen.queryByTestId('faltantes-validacion')).toBeNull();
    expect((screen.getByRole('button', { name: 'Validar' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('las confirmaciones «Requiere revisión» también aparecen en la lista', () => {
    montarPanel({
      onIrA: vi.fn(),
      revision: revision({ requiereRevisionCosteo: true }),
      faltantes: faltantes({ confirmaciones: ['guardar los costos para confirmarlos'] }),
    });

    expect(screen.getByTestId('faltantes-validacion').textContent).toContain(
      'guardar los costos para confirmarlos',
    );
    expect(screen.getByRole('button', { name: 'Ir a Ruteo/Costeo' })).toBeDefined();
  });

  it('cada atajo lleva a la pestaña que corresponde y solo aparece si aplica', () => {
    const onIrA = vi.fn();
    montarPanel({
      onIrA,
      faltantes: faltantes({
        sinItemsActivos: true,
        itemsSinRuteo: ['IT01'],
        sinArchivos: true,
        contenido: ['al menos un ítem activo', 'ítem IT01: ruteo por proceso', 'al menos un archivo'],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ir a Ítems' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Ruteo/Costeo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Archivos' }));

    expect(onIrA.mock.calls.map(([destino]) => destino)).toEqual(['items', 'ruteo', 'archivos']);
  });

  it('si solo falta el archivo no ofrece los demás atajos', () => {
    montarPanel({
      onIrA: vi.fn(),
      faltantes: faltantes({ sinArchivos: true, contenido: ['al menos un archivo'] }),
    });

    expect(screen.getByRole('button', { name: 'Ir a Archivos' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Ir a Ítems' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ir a Ruteo/Costeo' })).toBeNull();
  });

  it('fuera de borrador no muestra el aviso', () => {
    montarPanel({
      revision: revision({ estado: 'READY_TO_SEND' }),
      faltantes: faltantes({ sinArchivos: true, contenido: ['al menos un archivo'] }),
    });

    expect(screen.queryByTestId('faltantes-validacion')).toBeNull();
  });
});

describe('PanelArchivosPropuesta — archivo obligatorio para validar (obs. cliente 2026-10-13)', () => {
  function montarArchivos(faltaArchivo: boolean, puedeSubir = true) {
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      createElement(
        QueryClientProvider,
        { client: consultas },
        createElement(PanelArchivosPropuesta, {
          revision: revision() as unknown as RevisionPropuesta,
          revisiones: [revision() as unknown as RevisionPropuesta],
          archivosPropios: [],
          archivosHeredados: [],
          archivosPorItem: [],
          items: [],
          puedeSubir,
          faltaArchivo,
        }),
      ),
    );
  }

  it('sin archivos marca el campo en rojo y explica qué subir', () => {
    montarArchivos(true);

    const entrada = screen.getByLabelText('Archivo de la propuesta');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.className).toContain('border-peligro');
    expect(entrada.getAttribute('aria-describedby')).toContain('archivo-propuesta-requerido');
    expect(screen.getByTestId('archivo-propuesta-requerido').textContent).toMatch(
      /al menos un archivo/i,
    );
  });

  it('con archivos no hay marca ni aviso', () => {
    montarArchivos(false);

    expect(screen.getByLabelText('Archivo de la propuesta').getAttribute('aria-invalid')).toBe(
      'false',
    );
    expect(screen.queryByTestId('archivo-propuesta-requerido')).toBeNull();
  });
});
