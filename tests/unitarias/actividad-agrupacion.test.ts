import { describe, expect, it } from 'vitest';

import type { RegistroActividad } from '@/modulos/auditoria/tipos/indice';
import {
  agruparPorCorrelacion,
  etiquetaAccion,
  etiquetaGrupoActividad,
  etiquetaModulo,
  textoRecurso,
} from '@/modulos/auditoria/utilidades/actividad';
import { enlaceRegistroActividad } from '@/modulos/auditoria/utilidades/enlace-registro';

function registro(parcial: Partial<RegistroActividad> & { id: string }): RegistroActividad {
  return {
    creadoEn: '2026-10-01T12:00:00Z',
    correlationId: null,
    nombreUsuario: 'Ana',
    rol: 'vendedor',
    accion: 'crear',
    modulo: 'pipeline',
    recursoId: '10000000-0000-4000-8000-000000000001',
    contexto: null,
    recursoEtiqueta: null,
    entidad: 'otro',
    ...parcial,
  };
}

describe('agrupación de actividad por correlationId', () => {
  it('agrupa eventos correlacionados aunque no sean contiguos y deja sueltos los demás', () => {
    const grupos = agruparPorCorrelacion([
      registro({ id: 'a', correlationId: 'corr-1' }),
      registro({ id: 'b', correlationId: null }),
      registro({ id: 'c', correlationId: 'corr-1' }),
      registro({ id: 'd', correlationId: 'corr-2' }),
    ]);

    expect(grupos.map((grupo) => grupo.registros.map((item) => item.id))).toEqual([
      ['a', 'c'],
      ['b'],
      ['d'],
    ]);
    expect(grupos[0]?.correlationId).toBe('corr-1');
    expect(grupos[1]?.correlationId).toBeNull();
  });

  it('titula el grupo con la acción común o "Acción de negocio" si difieren', () => {
    const mismo = agruparPorCorrelacion([
      registro({ id: 'a', correlationId: 'corr', accion: 'actualizar_etapa' }),
      registro({ id: 'b', correlationId: 'corr', accion: 'actualizar_etapa' }),
    ]);
    expect(etiquetaGrupoActividad(mismo[0]!)).toBe(etiquetaAccion('actualizar_etapa'));

    const mixto = agruparPorCorrelacion([
      registro({ id: 'a', correlationId: 'corr', accion: 'crear' }),
      registro({ id: 'b', correlationId: 'corr', accion: 'enviar' }),
    ]);
    expect(etiquetaGrupoActividad(mixto[0]!)).toBe('Acción de negocio');
  });
});

describe('presentación sin UUID crudo', () => {
  it('prioriza la etiqueta resuelta, humaniza códigos y nunca muestra un UUID', () => {
    expect(textoRecurso(registro({ id: 'a', recursoEtiqueta: 'CNC-2610-0001' }))).toBe('CNC-2610-0001');
    expect(textoRecurso(registro({ id: 'b', recursoId: 'vendedor' }))).toBe('vendedor');
    expect(textoRecurso(registro({ id: 'c', recursoId: '10000000-0000-4000-8000-0000000000ff' }))).toBe('—');
  });

  it('traduce acciones y módulos conocidos y humaniza los códigos nuevos', () => {
    expect(etiquetaAccion('crear')).toBe('Alta');
    expect(etiquetaAccion('actualizar_permisos_rol')).toBe('Actualizar permisos rol');
    expect(etiquetaModulo('pipeline')).toBe('RFQ');
    expect(etiquetaModulo('modulo_nuevo')).toBe('Modulo nuevo');
  });

  it('construye enlaces solo para entidades resueltas y uuid válidos', () => {
    const id = '10000000-0000-4000-8000-000000000001';
    expect(enlaceRegistroActividad(registro({ id: 'a', entidad: 'pipeline', recursoId: id })))
      .toBe(`/rfq?rfq=${id}`);
    expect(enlaceRegistroActividad(registro({ id: 'b', entidad: 'cliente', recursoId: id })))
      .toBe(`/clientes?cliente=${id}`);
    expect(enlaceRegistroActividad(registro({ id: 'c', entidad: 'orden', recursoId: id })))
      .toBe(`/ordenes?ordenId=${id}`);
    expect(enlaceRegistroActividad(registro({ id: 'd', entidad: 'otro', recursoId: id }))).toBeNull();
    expect(enlaceRegistroActividad(registro({ id: 'e', entidad: 'cliente', recursoId: 'CLI-0001' }))).toBeNull();
  });
});
