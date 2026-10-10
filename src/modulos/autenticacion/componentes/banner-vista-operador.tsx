import { Button } from '@/compartido/componentes/ui/button';
import { cerrarVistaOperadorAccion } from '@/modulos/autenticacion/acciones/cerrar-vista-operador';
import { ZONA_HORARIA_TALLER } from '@/modulos/produccion/servicios/calculo-tiempos-servicio';

type PropsBannerVistaOperador = {
  nombreOperador: string;
  nombreAdministrador: string;
  expiraEn: string;
};

export function BannerVistaOperador({
  nombreOperador,
  nombreAdministrador,
  expiraEn,
}: PropsBannerVistaOperador) {
  return (
    <aside
      data-testid="banner-vista-operador"
      className="sticky top-0 z-20 flex flex-col gap-3 rounded-lg border border-advertencia bg-advertencia-suave p-4 text-advertencia-texto sm:flex-row sm:items-center sm:justify-between"
      aria-label="Vista delegada activa"
    >
      <div>
        <p className="font-semibold">Vista de solo lectura: {nombreOperador}</p>
        <p className="text-sm">
          Administrador: {nombreAdministrador}. Termina a las{' '}
          <time dateTime={expiraEn}>
            {new Intl.DateTimeFormat('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: ZONA_HORARIA_TALLER,
            }).format(new Date(expiraEn))}
          </time>.
        </p>
      </div>
      <form action={cerrarVistaOperadorAccion}>
        <Button type="submit" variante="contorno" tamano="lg">
          Salir de vista operador
        </Button>
      </form>
    </aside>
  );
}
