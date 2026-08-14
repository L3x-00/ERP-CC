export {
  MONEDA_AGING,
  BUCKETS_AGING,
  convertirPagoAMonedaCuenta,
  convertirAMxn,
  calcularDiasVencidos,
  clasificarBucketAging,
  calcularAgingCliente,
  calcularAgingPorCliente,
} from '@/modulos/cobranza/servicios/aging-servicio';

export type {
  BucketAging,
  ResumenAgingCliente,
  EntradaConversionPago,
} from '@/modulos/cobranza/servicios/aging-servicio';
