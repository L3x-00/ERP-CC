/** C13.3: material que aporta el cliente (no se costea ni toca inventario propio). */

export interface MaterialClienteItem {
  id: string;
  codigoItem: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  unidadBase: string;
  cantidad: number;
}

export interface MaterialClientePartida {
  partidaId: string;
  codigoPieza: string;
  materialId: string;
  materialCodigo: string;
  materialNombre: string;
  unidadBase: string;
  declarado: number;
  consumido: number;
  saldo: number;
}

export interface ConsumoMaterialClienteRegistrado {
  id: string;
  ordenId: string;
  partidaId: string;
  materialId: string;
  cantidadUsada: number;
  cantidadScrap: number;
  declarado: number;
  consumido: number;
  saldo: number;
}
