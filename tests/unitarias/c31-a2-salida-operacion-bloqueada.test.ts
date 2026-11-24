import { describe, expect, it } from 'vitest';

import {
  MOTIVO_BLOQUEO_TEXTO,
  matrizAccionesProceso,
} from '@/modulos/produccion/tipos/acciones-proceso';
import { accionPrincipal, type ProcesoEspacioOperador } from '@/modulos/produccion/tipos/espacio-operador';
import { operacionBloqueadaSinSesion } from '@/modulos/produccion/servicios/espacio-operador-servicio';
import { reabrirOperacionBloqueadaServicio } from '@/modulos/produccion/servicios/reabrir-operacion-servicio';
import { mensajeReaperturaOperacion } from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';

function procesoBase(): ProcesoEspacioOperador {
  return {
    id: 'proceso-1',
    reclamo: null,
    reclamadoPorMi: false,
    sesionActiva: null,
    puedeIniciar: false,
    puedeReanudar: false,
    columna: 'pausada',
    motivoBloqueo: null,
  } as unknown as ProcesoEspacioOperador;
}

describe('C31/A2 — salida de operación bloqueada sin sesión', () => {
  it('la matriz bloquea al operador y ofrece la reapertura solo con permiso', () => {
    const proceso = { ...procesoBase(), motivoBloqueo: 'programacion_bloqueada_sin_sesion' } as ProcesoEspacioOperador;
    const operador = matrizAccionesProceso(proceso, { puedeReabrirOperacion: false });
    expect(operador.principal).toBe('reabrir_operacion');
    expect(operador.etiqueta).toBe('Bloqueado por Planeación');
    expect(operador.deshabilitada).toBe(true);

    const administrador = matrizAccionesProceso(proceso, { puedeReabrirOperacion: true });
    expect(administrador.deshabilitada).toBe(false);
    expect(administrador.destino).toBe('panel-operador-produccion');
  });

  it('la matriz no ofrece «Reclamar» en el caso A2', () => {
    const proceso = { ...procesoBase(), motivoBloqueo: 'programacion_bloqueada_sin_sesion' } as ProcesoEspacioOperador;
    expect(matrizAccionesProceso(proceso).principal).not.toBe('reclamar');
    expect(accionPrincipal(proceso).etiqueta).toBe('Bloqueado por Planeación');
  });

  it('un proceso sin bloqueo ofrece iniciar directamente (sin paso de reclamar)', () => {
    expect(matrizAccionesProceso(procesoBase()).principal).toBe('iniciar');
  });

  it('el motivo dice quién debe actuar y no es genérico', () => {
    const texto = MOTIVO_BLOQUEO_TEXTO.programacion_bloqueada_sin_sesion;
    expect(texto).toContain('Bloqueado por Planeación');
    expect(texto).toContain('Administración debe reabrir la operación');
    expect(texto).not.toContain('Continuar sesión');
  });

  it('«sin sesión» ignora sesiones inválidas y pausas liberadas', () => {
    expect(operacionBloqueadaSinSesion('bloqueada', [])).toBe(true);
    expect(operacionBloqueadaSinSesion('bloqueada', [{
      estadoSesion: 'pausada', sesionInvalida: false, recursoLiberado: true,
    }])).toBe(true);
    expect(operacionBloqueadaSinSesion('bloqueada', [{
      estadoSesion: 'pausada', sesionInvalida: false, recursoLiberado: false,
    }])).toBe(false);
    expect(operacionBloqueadaSinSesion('programada', [])).toBe(false);
  });

  it('el mensaje de primera reapertura nombra al actor y el número real de reclamos', () => {
    const texto = mensajeReaperturaOperacion({
      programacionId: 'p', ordenId: 'o', partidaId: 'x', estadoPlaneacion: 'programada',
      yaAplicado: false, reclamosLiberados: 1, reabiertaPor: 'a',
      reabiertaPorNombre: 'Admin A2', reabiertaEn: '2026-11-20T12:00:00Z',
    }, 'P-01');
    expect(texto).toContain('Admin A2');
    expect(texto).toContain('se cerró 1 reclamo');
    expect(texto).toContain('Ya puedes reclamarla de nuevo');
  });

  it('el replay no afirma un cambio nuevo', () => {
    const texto = mensajeReaperturaOperacion({
      programacionId: 'p', ordenId: 'o', partidaId: 'x', estadoPlaneacion: 'programada',
      yaAplicado: true, reclamosLiberados: 1, reabiertaPor: 'a',
      reabiertaPorNombre: 'Admin A2', reabiertaEn: '2026-11-20T12:00:00Z',
    }, 'P-01');
    expect(texto).toContain('No se registró ningún cambio nuevo');
  });

  it('el servicio parsea el JSON de la RPC', async () => {
    const cliente = {
      rpc: async () => ({
        error: null,
        data: {
          programacion_id: 'prog-1', orden_id: 'orden-1', partida_id: 'partida-1',
          estado_planeacion: 'programada', ya_aplicado: false, reclamos_liberados: 2,
          reabierta_por: 'admin-1', reabierta_por_nombre: 'Admin A2',
          reabierta_en: '2026-11-20T12:00:00Z',
        },
      }),
    };
    const resultado = await reabrirOperacionBloqueadaServicio(cliente as never, {
      programacionId: 'prog-1', actorId: 'admin-1', correlationId: 'corr-1',
    });
    expect(resultado.yaAplicado).toBe(false);
    expect(resultado.reclamosLiberados).toBe(2);
    expect(resultado.reabiertaPorNombre).toBe('Admin A2');
  });
});
