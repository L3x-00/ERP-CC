import { beforeEach, describe, expect, it, vi } from 'vitest';

// Obs. cliente 2026-10-21: el PDF de la propuesta imprime el plazo comercial del
// RFQ de origen. Se corta en la subida a Storage para inspeccionar los bytes.
const { obtenerUsuarioMock, canMock, filasMock, subirMock } = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  filasMock: vi.fn(),
  subirMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: vi.fn(),
  nuevoCorrelationId: () => 'corr-pdf',
}));
vi.mock('@/nucleo/almacenamiento/archivos/servicio', () => ({
  construirRutaArchivo: () => 'propuesta_revision/rev-1/propuesta.pdf',
  descartarSubidaArchivo: vi.fn(),
  registrarArchivo: vi.fn(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => {
      const cadena = {
        eq: () => cadena,
        order: () => cadena,
        maybeSingle: () => filasMock(tabla),
        then: (resolver: (valor: unknown) => unknown) => resolver(filasMock(tabla)),
      };
      return { select: () => cadena };
    },
    storage: { from: () => ({ upload: (...args: unknown[]) => subirMock(...args) }) },
  }),
}));

import { generarPdfRevisionAccion } from '@/modulos/propuestas/acciones/generar-pdf-revision';

const REVISION_ID = '33333333-3333-4333-8333-333333333333';

function prepararFilas(plazoComercial: string | null): void {
  filasMock.mockImplementation((tabla: string) => {
    switch (tabla) {
      case 'propuesta_revisiones':
        return {
          data: {
            id: REVISION_ID,
            propuesta_id: 'propuesta-1',
            estado: 'READY_TO_SEND',
            folio_revision: 'CNC-1026_01-A',
            validada_en: '2026-10-06T10:00:00Z',
            actualizado_en: '2026-10-06T10:00:00Z',
            snapshot_cabecera: {},
          },
          error: null,
        };
      case 'propuesta_items':
        return { data: [], error: null };
      case 'propuestas':
        return { data: { rfq_id: 'rfq-1' }, error: null };
      case 'pipeline':
        return { data: { fecha_requerida: null, plazo_comercial: plazoComercial }, error: null };
      case 'propuesta_pdfs':
        return { data: null, error: null };
      default:
        throw new Error(`Tabla no esperada en la prueba: ${tabla}`);
    }
  });
}

describe('generarPdfRevisionAccion — plazo comercial del RFQ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    obtenerUsuarioMock.mockResolvedValue({ id: 'usuario-1', rol: 'vendedor', activo: true });
    canMock.mockResolvedValue(true);
    subirMock.mockResolvedValue({ error: { message: 'corte de la prueba' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('imprime el plazo capturado en el RFQ de origen', async () => {
    prepararFilas('Fabricación 5-7 días');

    const respuesta = await generarPdfRevisionAccion({ revisionId: REVISION_ID });

    expect(respuesta).toEqual({ exito: false, error: 'No se pudo subir el PDF de la propuesta' });
    const bytes = subirMock.mock.calls[0]?.[1] as Buffer;
    expect(bytes.toString('latin1')).toContain('Plazo comercial: Fabricaci');
  });

  it('sin plazo en el RFQ el PDF no incluye la línea', async () => {
    prepararFilas(null);

    await generarPdfRevisionAccion({ revisionId: REVISION_ID });

    const bytes = subirMock.mock.calls[0]?.[1] as Buffer;
    expect(bytes.toString('latin1')).not.toContain('Plazo comercial');
  });
});
