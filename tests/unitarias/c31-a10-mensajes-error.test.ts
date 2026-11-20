import { describe, expect, it } from 'vitest';

import {
  ErrorProduccion,
  mensajeErrorSesion,
} from '@/modulos/produccion/servicios/sesiones-servicio';
import { describirErrorProduccion } from '@/modulos/produccion/utilidades/mensajes-error-produccion';

describe('C31/A11 — errores de cierre sin mensajes técnicos ni genéricos', () => {
  it('un error de otra capa dice la causa en lenguaje de piso', () => {
    const mensaje = mensajeErrorSesion(new Error('Indica la hora real de finalización'));
    expect(mensaje).toContain('Indica la hora real de finalización');
    expect(mensaje).not.toContain('No se pudo registrar la sesión de producción');
  });

  it('un código no previsto se convierte en una frase entendible, sin mostrar el código', () => {
    const mensaje = mensajeErrorSesion(new ErrorProduccion('desconocido', 'material_no_corresponde_partida'));
    expect(mensaje).toContain('material elegido no corresponde');
    expect(mensaje).not.toContain('desconocido');
    expect(mensaje).not.toContain('código');
  });

  it('el cierre con consumo explica el problema y lleva al campo correcto', () => {
    const guia = describirErrorProduccion('material_no_corresponde_partida');
    expect(guia.mensaje).toContain('material elegido no corresponde');
    expect(guia.campo).toBe('material-cierre');
    expect(guia.accion).toBe('Cambiar material');
  });

  it('la primera pieza y las horas extra siguen diciendo qué hacer', () => {
    expect(mensajeErrorSesion(new ErrorProduccion('primera_pieza_pendiente', 'primera_pieza_pendiente')))
      .toContain('primera pieza');
    expect(mensajeErrorSesion(new ErrorProduccion('horas_extra_sin_autorizacion', 'horas_extra_sin_autorizacion')))
      .toContain('jornada');
  });

  it('cualquier código conocido produce un mensaje sin guiones bajos', () => {
    for (const codigo of ['cierre_consumo_invalido', 'costo_material_no_configurado', 'sesion_no_activa', 'orden_no_en_proceso']) {
      const mensaje = mensajeErrorSesion(new ErrorProduccion(codigo as never, codigo));
      expect(mensaje).not.toContain('_');
      expect(mensaje.length).toBeGreaterThan(20);
    }
  });
});
