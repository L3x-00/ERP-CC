// El tutorial de configuración debe ser corto, lineal y sin jerga técnica.
import { describe, expect, it } from 'vitest';

import { PASOS_TUTORIAL_CONFIGURACION } from '@/modulos/configuracion/componentes/pasos-tutorial-configuracion';

describe('tutorial de configuración', () => {
  it('tiene nueve pasos, empieza por personas y termina con la comprobación', () => {
    expect(PASOS_TUTORIAL_CONFIGURACION).toHaveLength(9);
    expect(PASOS_TUTORIAL_CONFIGURACION[0].id).toBe('personas');
    expect(PASOS_TUTORIAL_CONFIGURACION.at(-1)?.id).toBe('verificacion');
  });

  it('no repite identificadores', () => {
    const ids = PASOS_TUTORIAL_CONFIGURACION.map((paso) => paso.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada paso tiene mensaje, ruta y destino', () => {
    for (const paso of PASOS_TUTORIAL_CONFIGURACION) {
      expect(paso.mensaje.length).toBeGreaterThan(20);
      expect(paso.ruta).toMatch(/^\//);
      expect(paso.destino).toMatch(/^[a-z-]+$/);
    }
  });

  it('los pasos dentro de Configuración declaran la sección que deben abrir', () => {
    for (const paso of PASOS_TUTORIAL_CONFIGURACION) {
      if (paso.ruta.startsWith('/configuracion')) {
        expect(paso.seccion).toBeTruthy();
      }
    }
  });

  it('usa lenguaje sencillo, sin claves técnicas ni jerga', () => {
    const texto = PASOS_TUTORIAL_CONFIGURACION.map((paso) => paso.mensaje).join(' ');
    expect(texto).not.toMatch(/catalogo_editar|service_role|RPC|query|foco|schema/i);
  });

  it('la guía de la máquina menciona área y precio', () => {
    const maquina = PASOS_TUTORIAL_CONFIGURACION.find((paso) => paso.id === 'maquinas');
    expect(maquina?.mensaje).toMatch(/área/i);
    expect(maquina?.mensaje).toMatch(/precio/i);
  });
});
