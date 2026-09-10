'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { guardarDatosEmpresaAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionEmpresa, ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';

export interface PestanaEmpresaProps {
  datos: ConfiguracionEmpresa;
  onGuardado: (configuracion: ConfiguracionSistema) => void;
}

export function PestanaEmpresa({ datos, onGuardado }: PestanaEmpresaProps) {
  const [formulario, setFormulario] = useState<ConfiguracionEmpresa>(datos);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarDatosEmpresaAccion(formulario);
      if (!respuesta.exito || !respuesta.datos) {
        setMensaje(respuesta.exito ? 'No se recibió la configuración actualizada' : respuesta.error);
        return;
      }
      onGuardado(respuesta.datos);
      setMensaje('Datos de empresa guardados');
    } catch {
      setMensaje('No se pudo guardar la empresa');
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (campo: keyof ConfiguracionEmpresa, valor: string | null): void => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  };

  return (
    <form className="grid gap-4" onSubmit={guardar} aria-label="Datos de empresa">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-nombre">Nombre comercial
          <Input id="configuracion-nombre" value={formulario.nombre} onChange={(e) => cambiar('nombre', e.target.value)} required maxLength={160} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-razon-social">Razón social
          <Input id="configuracion-razon-social" value={formulario.razonSocial} onChange={(e) => cambiar('razonSocial', e.target.value)} required maxLength={200} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-rfc">RFC
          <Input id="configuracion-rfc" value={formulario.rfc} onChange={(e) => cambiar('rfc', e.target.value.toUpperCase())} required maxLength={13} />
        </label>
        <label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-telefono">Teléfono
          <Input id="configuracion-telefono" value={formulario.telefono} onChange={(e) => cambiar('telefono', e.target.value)} maxLength={40} />
        </label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="configuracion-email">Correo administrativo
          <Input id="configuracion-email" type="email" value={formulario.email} onChange={(e) => cambiar('email', e.target.value)} maxLength={200} />
        </label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="configuracion-direccion">Dirección fiscal
          <Textarea id="configuracion-direccion" value={formulario.direccion} onChange={(e) => cambiar('direccion', e.target.value)} required maxLength={300} />
        </label>
        <label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="configuracion-logo-url">URL del logo (opcional)
          <Input id="configuracion-logo-url" type="url" value={formulario.logoUrl ?? ''} onChange={(e) => cambiar('logoUrl', e.target.value || null)} placeholder="https://..." maxLength={2_048} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar empresa'}</Button>
        {mensaje ? <p role="status" className="text-sm text-foreground/70">{mensaje}</p> : null}
      </div>
    </form>
  );
}
