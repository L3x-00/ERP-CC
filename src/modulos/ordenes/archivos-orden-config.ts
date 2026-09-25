export const BUCKET_ARCHIVOS_ORDEN = 'archivos-orden-historica';
export const LIMITE_ARCHIVO_ORDEN = 20 * 1024 * 1024;

/** MIME admitido por extensión para los documentos del trabajo heredado. */
export const MIME_POR_EXTENSION_ORDEN: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  dxf: 'application/octet-stream',
  dwg: 'application/octet-stream',
  step: 'application/octet-stream',
  stp: 'application/octet-stream',
  igs: 'application/octet-stream',
  iges: 'application/octet-stream',
  eps: 'application/octet-stream',
  ai: 'application/octet-stream',
};

export interface ArchivoOrdenResumen {
  id: string;
  ordenId: string;
  nombre: string;
  mime: string;
  tamano: number;
  creadoEn: string;
}
