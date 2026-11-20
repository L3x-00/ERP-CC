import { describe, expect, it } from 'vitest';

import { registrarMotivoExcesoSesionServicio } from '@/modulos/produccion/servicios/registrar-motivo-exceso-servicio';
import { esquemaCerrarSesion } from '@/modulos/produccion/validaciones/produccion';

const BASE = {
  sesionId: '00000000-0000-4000-8000-000000000001',
  piezasProducidas: 200,
  estadoDestino: 'finalizada' as const,
  motivoExceso: 'OTRO' as const,
  detalleExceso: 'El láser se recalibró a mitad del lote',
};

describe('C31/A12 — motivo de demora', () => {
  it('el esquema de cierre acepta el motivo y su detalle', () => {
    const resultado = esquemaCerrarSesion.parse(BASE);
    expect(resultado.motivoExceso).toBe('OTRO');
    expect(resultado.detalleExceso).toContain('recalibró');
  });

  it('el esquema rechaza un detalle demasiado corto', () => {
    expect(() => esquemaCerrarSesion.parse({ ...BASE, detalleExceso: 'x' })).toThrow();
  });

  it('el servicio interpreta la respuesta de la RPC', async () => {
    const cliente = {
      rpc: async () => ({
        error: null,
        data: {
          sesion_id: BASE.sesionId,
          motivo_exceso: 'OLVIDE_CERRAR',
          motivo_exceso_detalle: 'Hora real declarada: 2026-11-20 12:10',
          ya_aplicado: false,
        },
      }),
    };
    const resultado = await registrarMotivoExcesoSesionServicio(cliente as never, {
      sesionId: BASE.sesionId,
      operadorId: '00000000-0000-4000-8000-000000000002',
      motivoExceso: 'OLVIDE_CERRAR',
      detalleExceso: 'Hora real declarada: 2026-11-20 12:10',
    });
    expect(resultado.motivoExceso).toBe('OLVIDE_CERRAR');
    expect(resultado.detalle).toContain('12:10');
    expect(resultado.yaAplicado).toBe(false);
  });
});
