import { z } from 'zod';

export const esquemaIniciarVistaOperador = z.object({
  operadorId: z.uuid('Selecciona un operador válido'),
  motivo: z.string().trim().min(1, 'Indica el motivo de la vista').max(500, 'El motivo es demasiado largo'),
});

export type IniciarVistaOperadorInput = z.infer<typeof esquemaIniciarVistaOperador>;
