import { describe, expect, it } from 'vitest';
import {
  escaparTextoComentario,
  extraerMencionesYSanitizar,
} from '@/modulos/comentarios/servicios/indice';

const ANA = '10000000-0000-4000-8000-000000000001';
const LUIS = '10000000-0000-4000-8000-000000000002';
const USUARIOS = [{ id: ANA, nombre: 'Ana' }, { id: LUIS, nombre: 'Luis Torres' }];

describe('parser de menciones y sanitización', () => {
  it('resuelve varias menciones conocidas sin duplicarlas', () => {
    const resultado = extraerMencionesYSanitizar('Revisar con @Ana y @Luis Torres; @Ana.', USUARIOS);
    expect(resultado.mencionesJson).toEqual([ANA, LUIS]);
    expect(resultado.textoLimpio).toContain('@Ana');
  });

  it('escapa etiquetas y atributos HTML antes de devolver el texto', () => {
    const resultado = extraerMencionesYSanitizar('<script>alert("x")</script>', USUARIOS);
    expect(resultado.textoLimpio).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(resultado.textoLimpio).not.toMatch(/<script/i);
    expect(escaparTextoComentario("a & b")).toBe('a &amp; b');
  });

  it('ignora menciones inexistentes o nombres que son prefijo de otro', () => {
    const resultado = extraerMencionesYSanitizar('@Desconocido @Anabel @Ana', USUARIOS);
    expect(resultado.mencionesJson).toEqual([ANA]);
  });
});
