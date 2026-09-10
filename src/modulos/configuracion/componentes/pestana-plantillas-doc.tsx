'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { guardarPlantillaDocAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionSistema, PlantillaDocumentoConfig } from '@/modulos/configuracion/tipos/indice';

export function PestanaPlantillasDoc({ configuracion, onGuardado }: { configuracion: ConfiguracionSistema; onGuardado: (configuracion: ConfiguracionSistema) => void }) {
  const [plantilla, setPlantilla] = useState<PlantillaDocumentoConfig>(configuracion.plantillasDoc.T1);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarPlantillaDocAccion({ clave: 'T1', ...plantilla });
      if (!respuesta.exito || !respuesta.datos) setMensaje(respuesta.exito ? 'No se recibió la plantilla actualizada' : respuesta.error);
      else { onGuardado(respuesta.datos); setMensaje('Plantilla T1 guardada'); }
    } catch {
      setMensaje('No se pudo guardar la plantilla');
    } finally {
      setGuardando(false);
    }
  }

  return <form className="grid gap-4" onSubmit={guardar} aria-label="Plantilla T1"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-plantilla-color">Color de acento<Input id="configuracion-plantilla-color" type="color" value={plantilla.colorAcento} onChange={(e) => setPlantilla((v) => ({ ...v, colorAcento: e.target.value }))} /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-plantilla-encabezado">Texto de encabezado<Input id="configuracion-plantilla-encabezado" value={plantilla.textoEncabezado} onChange={(e) => setPlantilla((v) => ({ ...v, textoEncabezado: e.target.value }))} maxLength={200} /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="configuracion-plantilla-terminos">Términos y condiciones<Textarea id="configuracion-plantilla-terminos" value={plantilla.terminosCondiciones} onChange={(e) => setPlantilla((v) => ({ ...v, terminosCondiciones: e.target.value }))} maxLength={5_000} required /></label><label className="grid gap-1 text-sm font-medium sm:col-span-2" htmlFor="configuracion-plantilla-pie">Texto de pie de página<Textarea id="configuracion-plantilla-pie" value={plantilla.textoPiePagina} onChange={(e) => setPlantilla((v) => ({ ...v, textoPiePagina: e.target.value }))} maxLength={500} /></label></div><div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plantilla T1'}</Button>{mensaje ? <p role="status" className="text-sm text-foreground/70">{mensaje}</p> : null}</div></form>;
}
