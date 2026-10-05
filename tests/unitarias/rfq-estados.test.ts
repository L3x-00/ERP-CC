import { describe, expect, it } from 'vitest';

import { ESTADOS_RFQ } from '@/modulos/rfq/tipos/indice';
import {
  ETIQUETAS_ACCION_RFQ,
  ETIQUETAS_ESTADO_RFQ,
  estaListo,
  mapearEstadoRfqAEtapa,
  mapearEtapaAEstadoRfq,
  normalizarValidacionRfq,
  permisoDeAccionRfq,
  resumirFaltantes,
  seccionesConFaltantes,
} from '@/modulos/rfq/utilidades/estados';

describe('mapeo etapa ↔ estado_rfq (puente de transición)', () => {
  it('mapea las etapas heredadas al estado RFQ del backfill', () => {
    expect(mapearEtapaAEstadoRfq('prospecto')).toBe('NEW');
    expect(mapearEtapaAEstadoRfq('contactado')).toBe('INCOMPLETE');
    expect(mapearEtapaAEstadoRfq('cotizado')).toBe('CONVERTED');
    expect(mapearEtapaAEstadoRfq('negociacion')).toBe('CONVERTED');
    expect(mapearEtapaAEstadoRfq('ganada')).toBe('CONVERTED');
    expect(mapearEtapaAEstadoRfq('perdida')).toBe('CLOSED');
    expect(mapearEtapaAEstadoRfq('desconocida')).toBe('INCOMPLETE');
  });

  it('mapea cada estado a una etapa válida del pipeline', () => {
    const etapas = new Set([
      'prospecto', 'contactado', 'cotizado', 'negociacion', 'ganada', 'perdida',
    ]);
    for (const estado of ESTADOS_RFQ) {
      expect(etapas.has(mapearEstadoRfqAEtapa(estado))).toBe(true);
    }
    expect(mapearEstadoRfqAEtapa('READY_FOR_PROPOSAL')).toBe('negociacion');
    expect(mapearEstadoRfqAEtapa('CANCELLED')).toBe('perdida');
  });

  it('asigna el permiso correcto por acción', () => {
    expect(permisoDeAccionRfq('marcar_incompleto')).toBe('rfq_editar');
    expect(permisoDeAccionRfq('poner_en_espera_cliente')).toBe('rfq_editar');
    expect(permisoDeAccionRfq('poner_en_espera_tecnica')).toBe('rfq_editar');
    expect(permisoDeAccionRfq('marcar_listo')).toBe('rfq_marcar_listo');
    expect(permisoDeAccionRfq('cerrar')).toBe('rfq_cerrar');
    expect(permisoDeAccionRfq('cancelar')).toBe('rfq_cerrar');
  });

  it('tiene etiqueta para todos los estados y acciones', () => {
    for (const estado of ESTADOS_RFQ) {
      expect(ETIQUETAS_ESTADO_RFQ[estado].length).toBeGreaterThan(0);
    }
    for (const etiqueta of Object.values(ETIQUETAS_ACCION_RFQ)) {
      expect(etiqueta.length).toBeGreaterThan(0);
    }
  });
});

describe('validación LISTO (forma de dominio)', () => {
  const validacionCompleta = {
    listo: true,
    secciones: {
      cliente: [],
      general: [],
      items: [],
      archivos: [],
      seguimiento: [],
    },
  };

  it('normaliza una respuesta completa y la reporta lista', () => {
    const normalizada = normalizarValidacionRfq(validacionCompleta);
    expect(estaListo(normalizada)).toBe(true);
    expect(seccionesConFaltantes(normalizada)).toEqual([]);
  });

  it('tolera respuestas parciales o basura sin lanzar', () => {
    const normalizada = normalizarValidacionRfq({ secciones: { general: ['canal', 7] } });
    expect(normalizada.listo).toBe(false);
    expect(normalizada.secciones.general).toEqual(['canal']);
    expect(normalizada.secciones.items).toEqual([]);
    expect(normalizarValidacionRfq(null).listo).toBe(false);
    expect(normalizarValidacionRfq('texto').listo).toBe(false);
  });

  it('un `listo: true` con faltantes se corrige a false', () => {
    const normalizada = normalizarValidacionRfq({
      listo: true,
      secciones: { archivos: ['archivo técnico (CAD/DIBUJO/ESPECIFICACIONES)'] },
    });
    expect(normalizada.listo).toBe(false);
  });

  it('resume los faltantes con su sección', () => {
    const normalizada = normalizarValidacionRfq({
      listo: false,
      secciones: {
        general: ['canal'],
        seguimiento: ['próxima acción'],
      },
    });
    expect(resumirFaltantes(normalizada)).toEqual([
      'General: canal',
      'Seguimiento: próxima acción',
    ]);
    expect(seccionesConFaltantes(normalizada)).toEqual(['general', 'seguimiento']);
  });
});
