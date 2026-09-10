import { beforeEach, describe, expect, it } from 'vitest';
import { usarTiendaNotificaciones } from '@/estado/uso-tienda-notificaciones';

const base = {
  id: '20000000-0000-4000-8000-000000000001', usuarioId: '10000000-0000-4000-8000-000000000001',
  emisorId: null, emisorNombre: null, tipo: 'mencion' as const,
  titulo: 'Te mencionaron', mensaje: 'Revisa', enlace: '/ordenes?ordenId=1', leida: false,
  creadoEn: '2026-09-10T00:00:00.000Z',
};

beforeEach(() => usarTiendaNotificaciones.getState().limpiar());

describe('usarTiendaNotificaciones', () => {
  it('calcula no leídas y actualiza el snapshot local', () => {
    usarTiendaNotificaciones.getState().establecerNotificaciones(base.usuarioId, [base, { ...base, id: '20000000-0000-4000-8000-000000000002', leida: true }]);
    expect(usarTiendaNotificaciones.getState().noLeidas).toBe(1);
    usarTiendaNotificaciones.getState().marcarComoLeidaLocal(base.id);
    expect(usarTiendaNotificaciones.getState().noLeidas).toBe(0);
  });

  it('no muestra el snapshot anterior cuando cambia la sesión', () => {
    usarTiendaNotificaciones.getState().establecerNotificaciones(base.usuarioId, [base]);
    usarTiendaNotificaciones.getState().establecerNotificaciones('30000000-0000-4000-8000-000000000003', []);
    expect(usarTiendaNotificaciones.getState().usuarioId).toBe('30000000-0000-4000-8000-000000000003');
    expect(usarTiendaNotificaciones.getState().notificaciones).toEqual([]);
  });

  it('controla apertura sin persistir datos en el navegador', () => {
    usarTiendaNotificaciones.getState().alternarAbierto();
    expect(usarTiendaNotificaciones.getState().abierto).toBe(true);
    usarTiendaNotificaciones.getState().cerrar();
    expect(usarTiendaNotificaciones.getState().abierto).toBe(false);
  });
});
