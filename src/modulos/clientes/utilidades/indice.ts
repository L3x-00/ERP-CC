import type {
  EstadoCliente,
  TierCliente,
  TipoDocumentoCliente,
} from '@/modulos/clientes/tipos/indice';

/** Etiqueta legible del tier. */
export const ETIQUETA_TIER: Record<TierCliente, string> = {
  bronce: 'Bronce',
  plata: 'Plata',
  oro: 'Oro',
  platino: 'Platino',
};

/** Clases Tailwind del badge de cada tier (fondo/texto, claro y oscuro). */
export const CLASE_TIER: Record<TierCliente, string> = {
  bronce: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  plata: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  oro: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  platino: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
};

/** Etiqueta legible del estado. */
export const ETIQUETA_ESTADO: Record<EstadoCliente, string> = {
  prospecto: 'Prospecto',
  activo: 'Activo',
  inactivo: 'Inactivo',
};

/** Clases Tailwind del badge de cada estado. */
export const CLASE_ESTADO: Record<EstadoCliente, string> = {
  prospecto: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  activo: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  inactivo: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

/** Etiqueta legible del tipo de documento. */
export const ETIQUETA_TIPO_DOCUMENTO: Record<TipoDocumentoCliente, string> = {
  csf: 'Constancia de Situación Fiscal',
  contrato: 'Contrato',
  identificacion: 'Identificación',
  comprobante_domicilio: 'Comprobante de domicilio',
  otro: 'Otro',
};
