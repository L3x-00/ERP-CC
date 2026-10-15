import type { PestanaFicha } from '@/modulos/ordenes/tipos/ficha-orden';

/** Pregunta guía que cada pestaña de la ficha responde (nota del cliente, R19). */
export const PREGUNTAS_PESTANA: Readonly<Record<PestanaFicha, string>> = {
  resumen: '¿Qué es esta Orden?',
  partidas: '¿Qué hay que fabricar?',
  ruta: '¿Cómo se hará?',
  archivos: '¿Con qué archivos?',
  entregas: '¿Qué se entregó?',
  actividad: '¿Qué ha pasado?',
  documento: '¿Qué puedo imprimir?',
  comentarios: '¿Qué se ha conversado?',
};
