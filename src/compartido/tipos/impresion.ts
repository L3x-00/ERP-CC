/**
 * Contrato de la marca documental que acompaña a los documentos impresos.
 * Vive fuera de los módulos de UI para que el servidor pueda leerlo sin
 * cruzar la frontera de componentes cliente.
 */

/** Datos de marca que acompañan a cualquier documento impreso. */
export interface MarcaDocumento {
  nombre: string;
  razonSocial: string;
  rfc: string;
  direccion: string;
  telefono: string;
  email: string;
  logoUrl: string | null;
  /** Color de acento de la plantilla documental. */
  colorAcento: string;
  textoPiePagina: string;
}

/** Marca neutra cuando la configuración no está disponible. */
export const MARCA_DOCUMENTO_NEUTRA: MarcaDocumento = {
  nombre: 'Orden de servicio',
  razonSocial: '',
  rfc: '',
  direccion: '',
  telefono: '',
  email: '',
  logoUrl: null,
  colorAcento: '#1D4ED8',
  textoPiePagina: '',
};
