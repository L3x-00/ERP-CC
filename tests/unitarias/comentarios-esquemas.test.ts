import { describe, expect, it } from 'vitest';
import {
  esquemaConsultaComentarios,
  esquemaCrearComentario,
  esquemaEliminarComentario,
  esquemaMarcarNotificacionLeida,
} from '@/modulos/comentarios/validaciones/indice';

const UUID = '10000000-0000-4000-8000-000000000001';

describe('esquemas de comentarios', () => {
  it('acepta comentario contextual y aplica menciones vacías por defecto', () => {
    const resultado = esquemaCrearComentario.safeParse({
      entidadTipo: 'orden', entidadId: UUID, contenido: 'Avance listo',
    });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.menciones).toEqual([]);
  });

  it('rechaza entidad, texto, menciones y campos desconocidos inválidos', () => {
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'factura', entidadId: UUID, contenido: 'x' }).success).toBe(false);
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'orden', entidadId: 'no', contenido: 'x' }).success).toBe(false);
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'orden', entidadId: UUID, contenido: ' ' }).success).toBe(false);
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'orden', entidadId: UUID, contenido: 'x', extra: true }).success).toBe(false);
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'orden', entidadId: UUID, contenido: 'x', menciones: ['no'] }).success).toBe(false);
    expect(esquemaCrearComentario.safeParse({ entidadTipo: 'orden', entidadId: UUID, contenido: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('valida consultas y borrado lógico con UUID', () => {
    expect(esquemaConsultaComentarios.safeParse({ entidadTipo: 'cliente', entidadId: UUID }).success).toBe(true);
    expect(esquemaEliminarComentario.safeParse({ comentarioId: UUID }).success).toBe(true);
    expect(esquemaMarcarNotificacionLeida.safeParse({ notificacionId: UUID }).success).toBe(true);
    expect(esquemaEliminarComentario.safeParse({ comentarioId: UUID, extra: 'no' }).success).toBe(false);
  });
});
