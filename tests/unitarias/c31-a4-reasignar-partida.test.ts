import { describe, expect, it } from 'vitest';

import { reasignarPartidaServicio } from '@/modulos/produccion/servicios/reasignar-partida-servicio';
import { mensajeReasignacionPartida } from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';

describe('C31/A4 — reasignación de responsable de partida', () => {
  it('el mensaje nombra al actor, al nuevo responsable y el número real de reclamos', () => {
    const texto = mensajeReasignacionPartida({
      partidaId: 'p', ordenId: 'o', operadorAsignadoId: 'op2', operadorNombre: 'Operador Nuevo',
      yaAplicado: false, reclamosLiberados: 1, reasignadaPor: 'a1',
      reasignadaPorNombre: 'Admin A4', reasignadaEn: '2026-11-20T12:00:00Z',
    }, 'P-01');
    expect(texto).toContain('Operador Nuevo');
    expect(texto).toContain('Admin A4');
    expect(texto).toContain('1 reclamo(s)');
  });

  it('el replay no afirma un cambio nuevo', () => {
    const texto = mensajeReasignacionPartida({
      partidaId: 'p', ordenId: 'o', operadorAsignadoId: 'op2', operadorNombre: 'Operador Nuevo',
      yaAplicado: true, reclamosLiberados: 1, reasignadaPor: 'a1',
      reasignadaPorNombre: 'Admin A4', reasignadaEn: '2026-11-20T12:00:00Z',
    }, 'P-01');
    expect(texto).toContain('No se registró ningún cambio nuevo');
  });

  it('el servicio parsea el JSON de la RPC', async () => {
    const cliente = {
      rpc: async () => ({
        error: null,
        data: {
          partida_id: 'partida-1', orden_id: 'orden-1', operador_asignado_id: 'op2',
          operador_nombre: 'Operador Nuevo', ya_aplicado: false, reclamos_liberados: 2,
          reasignada_por: 'a1', reasignada_por_nombre: 'Admin A4',
          reasignada_en: '2026-11-20T12:00:00Z',
        },
      }),
    };
    const resultado = await reasignarPartidaServicio(cliente as never, {
      partidaId: 'partida-1', operadorNuevoId: 'op2', actorId: 'a1', correlationId: 'corr-1',
    });
    expect(resultado.operadorNombre).toBe('Operador Nuevo');
    expect(resultado.reclamosLiberados).toBe(2);
    expect(resultado.reasignadaPorNombre).toBe('Admin A4');
  });
});
