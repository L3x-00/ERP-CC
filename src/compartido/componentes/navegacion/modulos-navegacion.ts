import type { Permiso } from '@/modulos/autenticacion/tipos/indice';

/** Grupo visual del menú lateral. */
export type GrupoNavegacion = 'General' | 'Comercial' | 'Operación' | 'Finanzas' | 'Sistema';

export type ModuloNavegacion = {
  href: string;
  etiqueta: string;
  grupo: GrupoNavegacion;
  icono: string;
  /** Basta con uno de estos permisos (admin ve todo). Lista vacía = siempre visible. */
  permisos: readonly Permiso[];
};

/** Menú principal del panel administrativo, agrupado por dominio. */
export const MODULOS_NAVEGACION: readonly ModuloNavegacion[] = [
  { href: '/dashboard', etiqueta: 'Dashboard', grupo: 'General', icono: 'panel', permisos: [] },
  {
    href: '/pipeline',
    etiqueta: 'Pipeline',
    grupo: 'Comercial',
    icono: 'embudo',
    permisos: ['ver_clientes', 'ver_pipeline_equipo'],
  },
  {
    href: '/clientes',
    etiqueta: 'Clientes',
    grupo: 'Comercial',
    icono: 'personas',
    permisos: ['ver_clientes'],
  },
  {
    href: '/inventario',
    etiqueta: 'Inventario',
    grupo: 'Operación',
    icono: 'caja',
    permisos: ['gestionar_inventario', 'ver_finanzas'],
  },
  {
    href: '/ordenes',
    etiqueta: 'Órdenes',
    grupo: 'Operación',
    icono: 'documento',
    permisos: ['aprobar_ordenes', 'gestionar_produccion'],
  },
  {
    href: '/planeacion',
    etiqueta: 'Planeación',
    grupo: 'Operación',
    icono: 'calendario',
    permisos: ['ver_planeacion', 'gestionar_planeacion', 'gestionar_produccion'],
  },
  {
    href: '/produccion',
    etiqueta: 'Producción',
    grupo: 'Operación',
    icono: 'fabrica',
    permisos: ['gestionar_produccion', 'aprobar_ordenes', 'cancelar_ordenes_en_proceso'],
  },
  {
    href: '/cobranza',
    etiqueta: 'Cobranza',
    grupo: 'Finanzas',
    icono: 'moneda',
    permisos: ['registrar_pagos', 'aplicar_saldos', 'ver_finanzas'],
  },
  {
    href: '/gastos',
    etiqueta: 'Gastos',
    grupo: 'Finanzas',
    icono: 'recibo',
    permisos: ['registrar_gastos', 'ver_finanzas'],
  },
  {
    href: '/configuracion',
    etiqueta: 'Configuración',
    grupo: 'Sistema',
    icono: 'engrane',
    permisos: ['configuracion'],
  },
] as const;

export const ORDEN_GRUPOS: readonly GrupoNavegacion[] = [
  'General',
  'Comercial',
  'Operación',
  'Finanzas',
  'Sistema',
];
