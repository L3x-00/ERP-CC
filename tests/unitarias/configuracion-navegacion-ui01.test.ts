// UI-01: la navegación de Configuración pasa a seis secciones, pero los enlaces
// históricos (`?pestana=`) deben seguir abriendo el contenido correcto.
import { describe, expect, it } from 'vitest';

import {
  leerVistaConfiguracion,
  pestanaDesdeVista,
  SECCIONES_CONFIGURACION,
  subseccionInicial,
} from '@/modulos/configuracion/componentes/pestanas-configuracion';

describe('navegación de Configuración (UI-01)', () => {
  it('expone exactamente seis secciones principales', () => {
    expect(SECCIONES_CONFIGURACION.map((seccion) => seccion.id)).toEqual([
      'folios',
      'tarifas',
      'catalogos',
      'areas',
      'personas',
      'documentos',
    ]);
  });

  it('mantiene los enlaces externos de Tarifas y Áreas', () => {
    expect(leerVistaConfiguracion('tarifas')).toEqual({ seccion: 'tarifas' });
    expect(leerVistaConfiguracion('areas')).toEqual({ seccion: 'areas' });
  });

  it('abre Catálogos en la subsección que pide el enlace', () => {
    expect(leerVistaConfiguracion('catalogos')).toEqual({
      seccion: 'catalogos',
      subseccion: 'comerciales',
    });
    expect(leerVistaConfiguracion('catalogos-base')).toEqual({
      seccion: 'catalogos',
      subseccion: 'operativos',
    });
  });

  it('agrupa usuarios, permisos y operadores bajo Personas y accesos', () => {
    expect(leerVistaConfiguracion('usuarios')).toEqual({
      seccion: 'personas',
      subseccion: 'usuarios',
    });
    expect(leerVistaConfiguracion('permisos')).toEqual({
      seccion: 'personas',
      subseccion: 'permisos',
    });
    expect(leerVistaConfiguracion('operadores')).toEqual({
      seccion: 'personas',
      subseccion: 'operadores',
    });
  });

  it('conserva los accesos provisionales de Empresa y Cuentas', () => {
    expect(leerVistaConfiguracion('empresa')).toEqual({ seccion: 'empresa' });
    expect(leerVistaConfiguracion('cuentas')).toEqual({ seccion: 'cuentas' });
  });

  it('mapea Plantillas al apartado de Documentos', () => {
    expect(leerVistaConfiguracion('plantillas')).toEqual({ seccion: 'documentos' });
    expect(leerVistaConfiguracion('documentos')).toEqual({ seccion: 'documentos' });
  });

  it('cae en Folios ante un valor desconocido o ausente', () => {
    expect(leerVistaConfiguracion(undefined)).toEqual({ seccion: 'folios' });
    expect(leerVistaConfiguracion('no-existe')).toEqual({ seccion: 'folios' });
    expect(leerVistaConfiguracion(['areas', 'tarifas'])).toEqual({ seccion: 'areas' });
  });

  it('genera una URL estable con los identificadores históricos', () => {
    expect(pestanaDesdeVista({ seccion: 'catalogos', subseccion: 'operativos' })).toBe('catalogos-base');
    expect(pestanaDesdeVista({ seccion: 'catalogos', subseccion: 'comerciales' })).toBe('catalogos');
    expect(pestanaDesdeVista({ seccion: 'personas', subseccion: 'permisos' })).toBe('permisos');
    expect(pestanaDesdeVista({ seccion: 'personas', subseccion: 'operadores' })).toBe('operadores');
    expect(pestanaDesdeVista({ seccion: 'documentos' })).toBe('plantillas');
    expect(pestanaDesdeVista({ seccion: 'empresa' })).toBe('empresa');
  });

  it('abre la primera subsección al entrar a una sección agrupada', () => {
    expect(subseccionInicial('catalogos')).toBe('comerciales');
    expect(subseccionInicial('personas')).toBe('usuarios');
    expect(subseccionInicial('folios')).toBeUndefined();
  });
});
