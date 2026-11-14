'use client';

import type { ComponentProps } from 'react';

import { Input } from '@/compartido/componentes/ui/input';

export interface PropsCampoEntero extends Omit<
  ComponentProps<typeof Input>,
  'type' | 'inputMode' | 'onChange' | 'value'
> {
  valor: string;
  onValorCambiar: (valor: string) => void;
}

/**
 * Campo de captura de enteros sin las flechas del `input type="number"`.
 * En piso la rueda del ratón o los steppers cambiaban la cantidad sin querer;
 * aquí solo se aceptan dígitos escritos por el operador.
 */
export function CampoEntero({ valor, onValorCambiar, ...props }: PropsCampoEntero) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      value={valor}
      onChange={(evento) => onValorCambiar(evento.target.value.replace(/\D/g, ''))}
    />
  );
}
