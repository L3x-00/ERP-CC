import { describe, expect, it } from 'vitest';

import {
  ErrorProduccion,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/sesiones-servicio';

describe('C31/A10 — errores de cierre sin mensajes genéricos', () => {
  it('un error de otra capa muestra su causa y el paso siguiente', () => {
    const mensaje = mensajeErrorSesion(new Error('Indica la hora real de finalización'));
    expect(mensaje).toContain('Indica la hora real de finalización');
    expect(mensaje).toContain('vuelve a intentarlo');
    expect(mensaje).not.toContain('No se pudo registrar la sesión de producción');
  });

  it('un código desconocido muestra el código exacto en vez de un genérico', () => {
    const mensaje = mensajeErrorSesion(new ErrorProduccion('desconocido', 'cierre_consumo_invalido'));
    expect(mensaje).toContain('desconocido');
    expect(mensaje).not.toContain('No se pudo registrar la sesión de producción');
  });

  it('los códigos del flujo de cierre con consumo tienen explicación concreta', () => {
    expect(mensajeErrorSesion(new ErrorProduccion('cierre_consumo_invalido', 'cierre_consumo_invalido')))
      .toContain('Revisa el material');
    expect(mensajeErrorSesion(new ErrorProduccion('proceso_corrida_no_corresponde', 'proceso_corrida_no_corresponde')))
      .toContain('corrida correcta');
    expect(mensajeErrorSesion(new ErrorProduccion('material_no_corresponde_corrida', 'material_no_corresponde_corrida')))
      .toContain('material del ítem');
  });

  it('el error de primera pieza sigue diciendo qué falta', () => {
    expect(mensajeErrorSesion(new ErrorProduccion('primera_pieza_pendiente', 'primera_pieza_pendiente')))
      .toContain('primera pieza');
  });
});
