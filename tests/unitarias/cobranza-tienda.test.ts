import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaCobranza } from '@/estado/uso-tienda-cobranza';

describe('usarTiendaCobranza', () => {
  beforeEach(() => {
    usarTiendaCobranza.setState({
      cuentaSeleccionadaId: null,
      periodo: 'este_mes',
      rangoPersonalizado: null,
      busqueda: '',
      revisionCartera: 0,
    });
  });

  it('mantiene filtros y selección separados de la cartera de servidor', () => {
    const tienda = usarTiendaCobranza.getState();
    tienda.seleccionarCuenta('10000000-0000-4000-8000-000000000001');
    tienda.establecerPeriodo('personalizado');
    tienda.establecerRangoPersonalizado({ inicio: '2026-08-01', fin: '2026-08-31' });
    tienda.establecerBusqueda('ACME');

    expect(usarTiendaCobranza.getState()).toMatchObject({
      cuentaSeleccionadaId: '10000000-0000-4000-8000-000000000001',
      periodo: 'personalizado',
      rangoPersonalizado: { inicio: '2026-08-01', fin: '2026-08-31' },
      busqueda: 'ACME',
    });
  });

  it('incrementa la revisión tras una mutación para refetch, sin copiar saldos', () => {
    usarTiendaCobranza.getState().notificarActualizacion();
    usarTiendaCobranza.getState().notificarActualizacion();

    const estado = usarTiendaCobranza.getState();
    expect(estado.revisionCartera).toBe(2);
    expect('cuentas' in estado).toBe(false);
  });
});
