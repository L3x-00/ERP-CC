export const BUCKET_ARCHIVOS_SESION = 'archivos-sesion-produccion';
export const LIMITE_ARCHIVO_SESION = 20 * 1024 * 1024;
export type ClaseArchivoProduccion = 'sesion' | 'salida_final';

export const MIME_POR_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp',
  dxf: 'application/octet-stream', dwg: 'application/octet-stream',
  step: 'application/octet-stream', stp: 'application/octet-stream',
  igs: 'application/octet-stream', iges: 'application/octet-stream',
  eps: 'application/octet-stream', ai: 'application/octet-stream',
};

export interface ArchivoSesionResumen {
  id: string;
  sesionId: string;
  clase: ClaseArchivoProduccion;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEn: string;
}
