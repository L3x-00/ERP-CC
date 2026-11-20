import { describe, expect, it } from 'vitest';

import { reclamarRecursoLiberadoServicio } from '@/modulos/produccion/servicios/corridas-servicio';
import {
  etiquetaFechaHoraNegocio,
} from '@/modulos/produccion/utilidades/formato-operador';
import {
  mensajeAvisoSupervision,
  mensajeFalloConfirmacionRecurso,
  mensajeLiberacionRecurso,
} from '@/modulos/produccion/utilidades/mensajes-reclamo-recurso';
import type { ReclamacionRecurso } from '@/modulos/produccion/servicios/corridas-servicio';
import { esquemaReclamarRecurso } from '@/modulos/produccion/validaciones/corridas';

const base: ReclamacionRecurso = {
  sesionId: 'sesion-1',
  recursoId: 'recurso-1',
  ordenId: 'orden-1',
  partidaId: 'partida-1',
  motivoPausaCodigo: 'MATERIAL',
  pausadaDesde: '2026-11-20T10:00:00Z',
  yaAplicado: false,
  reclamosLiberados: 1,
  liberadoPor: 'admin-1',
  liberadoPorNombre: 'Gerente A1',
  liberadoEn: '2026-11-20T12:00:00Z',
};

describe('C31/A1 — mensajes exactos de liberación de recurso', () => {
  it('la primera llamada dice quién actuó, qué orden volvió y cuántos reclamos se cerraron', () => {
    const texto = mensajeLiberacionRecurso(base, 'LASER-1', 'OP-993201');
    expect(texto).toContain('Gerente A1');
    expect(texto).toContain('OP-993201 volvió a Planeación');
    expect(texto).toContain('se cerró 1 reclamo');
    expect(texto).not.toContain('No se pudo');
  });

  it('el caso sin reclamo no miente diciendo que se cerró uno', () => {
    const texto = mensajeLiberacionRecurso(
      { ...base, reclamosLiberados: 0 }, 'LASER-1', 'OP-993201',
    );
    expect(texto).toContain('no había ningún reclamo activo que cerrar');
    expect(texto).not.toContain('se cerró 1');
  });

  it('el replay dice que no hubo cambio nuevo y conserva actor y fecha', () => {
    const texto = mensajeLiberacionRecurso(
      { ...base, yaAplicado: true }, 'LASER-1', 'OP-993201',
    );
    expect(texto).toContain('ya había sido liberada por Gerente A1');
    expect(texto).toContain('No se registró ningún cambio nuevo');
  });

  it('el replay histórico sin metadatos no inventa responsable', () => {
    const texto = mensajeLiberacionRecurso(
      { ...base, yaAplicado: true, liberadoPorNombre: null, liberadoEn: null },
      'LASER-1', 'OP-993201',
    );
    expect(texto).toContain('antes de que se registrara el responsable');
    expect(texto).not.toContain('Gerente A1');
  });

  it('el fallo de transporte indica cómo comprobar el resultado sin afirmar que no se aplicó', () => {
    const texto = mensajeFalloConfirmacionRecurso('LASER-1');
    expect(texto).toContain('Revisa «Máquinas liberadas»');
    expect(texto).not.toContain('no se aplicó');
    expect(texto).not.toContain('Quedó sin aplicar');
  });

  it('el aviso del operador nombra al actor y usa zona de negocio', () => {
    const texto = mensajeAvisoSupervision({
      actorNombre: 'Gerente A1',
      fecha: '2026-11-20T06:30:00Z',
      reclamosCerrados: 1,
    });
    expect(texto).toContain('Gerente A1 liberó esta máquina');
    expect(texto).toContain('19 nov');
    expect(texto).toContain('22:30');
  });

  it('el aviso histórico sin actor no dice «Administración» como nombre falso', () => {
    const texto = mensajeAvisoSupervision({
      actorNombre: null, fecha: null, reclamosCerrados: 0,
    });
    expect(texto).toContain('antes de que se registrara el responsable');
  });

  it('la fecha de negocio no coincide con UTC en horario nocturno', () => {
    const etiqueta = etiquetaFechaHoraNegocio('2026-11-20T06:30:00Z');
    expect(etiqueta).toContain('19 nov');
    expect(etiqueta).toContain('22:30');
  });
});

describe('C31/A1 — parser del resultado de la RPC', () => {
  it('expone ya_aplicado, conteo y actor con nombres en snake_case', async () => {
    const cliente = {
      rpc: async () => ({
        error: null,
        data: {
          sesion_id: 'sesion-1',
          recurso_id: 'recurso-1',
          orden_id: 'orden-1',
          partida_id: 'partida-1',
          motivo_pausa_codigo: 'MATERIAL',
          pausada_desde: null,
          ya_aplicado: true,
          reclamos_liberados: 2,
          liberado_por: 'admin-1',
          liberado_por_nombre: 'Gerente A1',
          liberado_en: '2026-11-20T12:00:00Z',
        },
      }),
    };
    const resultado = await reclamarRecursoLiberadoServicio(
      cliente as never,
      { recursoId: 'recurso-1', actorId: 'admin-1', correlationId: 'corr-1' },
    );
    expect(resultado.yaAplicado).toBe(true);
    expect(resultado.reclamosLiberados).toBe(2);
    expect(resultado.liberadoPorNombre).toBe('Gerente A1');
    expect(resultado.liberadoEn).toBe('2026-11-20T12:00:00Z');
  });

  it('el esquema acepta el correlation que el panel reutiliza en un doble clic', () => {
    const entrada = esquemaReclamarRecurso.parse({
      recursoId: '00000000-0000-4000-8000-000000000001',
      sesionId: '00000000-0000-4000-8000-000000000002',
      correlationId: '00000000-0000-4000-8000-000000000003',
    });
    expect(entrada.correlationId).toBe('00000000-0000-4000-8000-000000000003');
  });

  it('acepta un replay histórico con actor y fecha nulos', async () => {
    const cliente = {
      rpc: async () => ({
        error: null,
        data: {
          sesion_id: 'sesion-2',
          recurso_id: 'recurso-1',
          orden_id: 'orden-1',
          partida_id: 'partida-1',
          ya_aplicado: true,
          reclamos_liberados: null,
          liberado_por: null,
          liberado_por_nombre: null,
          liberado_en: null,
        },
      }),
    };
    const resultado = await reclamarRecursoLiberadoServicio(
      cliente as never,
      { recursoId: 'recurso-1', actorId: 'admin-1' },
    );
    expect(resultado.liberadoPor).toBeNull();
    expect(resultado.liberadoEn).toBeNull();
    expect(resultado.reclamosLiberados).toBe(0);
  });
});
