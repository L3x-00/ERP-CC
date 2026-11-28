export type PasoTutorialConfiguracion = {
  id: string;
  titulo: string;
  mensaje: string;
  ruta: string;
  destino: string;
  seccion?: 'personas' | 'tarifas' | 'areas' | 'catalogos';
  subseccion?: 'operativos' | 'usuarios';
  enlaces?: { etiqueta: string; ruta: string; destino: string }[];
};

/**
 * Flujo real de configuración, en el mismo orden que el índice del manual.
 * La guía no guarda avance: el estado vive solo en memoria mientras la
 * persona navega dentro de la aplicación.
 */
export const PASOS_TUTORIAL_CONFIGURACION: PasoTutorialConfiguracion[] = [
  {
    id: 'personas',
    titulo: 'Personas y accesos',
    mensaje:
      'Primero crea a las personas y dale a cada una el rol correcto. Solo un administrador puede hacerlo. Los operadores de piso necesitan un PIN de seis dígitos.',
    ruta: '/configuracion?pestana=personas&foco=personas-accesos',
    destino: 'personas-accesos',
    seccion: 'personas',
    subseccion: 'usuarios',
  },
  {
    id: 'grupo-equipo',
    titulo: 'Familia de máquinas',
    mensaje:
      'Crea una familia de máquinas y ponle su precio por hora. Ejemplo: Láser fibra. Aquí se guarda la tarifa que heredarán sus máquinas.',
    ruta: '/configuracion?pestana=tarifas&foco=tarifario-ruteo',
    destino: 'tarifario-ruteo',
    seccion: 'tarifas',
  },
  {
    id: 'areas',
    titulo: 'Áreas de trabajo',
    mensaje:
      'Organiza los espacios reales del taller. Un área principal puede tener subáreas. Marca qué áreas atiende cada operador.',
    ruta: '/configuracion?pestana=areas&foco=areas-trabajo',
    destino: 'areas-trabajo',
    seccion: 'areas',
  },
  {
    id: 'procesos',
    titulo: 'Procesos',
    mensaje:
      'Crea una operación y asígnale la familia de máquinas y el área que acabas de configurar. El prefijo de corrida identifica sus lotes.',
    ruta: '/configuracion?pestana=catalogos-base&foco=procesos',
    destino: 'procesos',
    seccion: 'catalogos',
    subseccion: 'operativos',
  },
  {
    id: 'maquinas',
    titulo: 'Tu primera máquina',
    mensaje:
      'Da de alta la máquina en la familia correcta, revisa que esté en el área que pide el proceso y comprueba su precio por hora.',
    ruta: '/configuracion?pestana=tarifas&foco=equipos-tarifas',
    destino: 'equipos-tarifas',
    seccion: 'tarifas',
  },
  {
    id: 'capacidad',
    titulo: 'Capacidad del taller',
    mensaje:
      'Indica cuántas máquinas hay y cuántas horas trabaja cada una. Así el sistema puede calcular la capacidad disponible.',
    ruta: '/planeacion#capacidad-instalada',
    destino: 'capacidad-instalada',
  },
  {
    id: 'materiales',
    titulo: 'Materiales y costos',
    mensaje:
      'Registra un material, su calibre si aplica y su costo por unidad. El sistema lo usará al capturar los ítems de un RFQ.',
    ruta: '/inventario#materiales-costo',
    destino: 'materiales-costo',
  },
  {
    id: 'comercial',
    titulo: 'Canales y seguimiento',
    mensaje:
      'Define de dónde llegan las solicitudes y qué acciones de seguimiento usarás. Con esto ya puedes capturar tu primer RFQ.',
    ruta: '/configuracion?pestana=catalogos-base&foco=canales-rfq',
    destino: 'canales-rfq',
    seccion: 'catalogos',
    subseccion: 'operativos',
    enlaces: [
      {
        etiqueta: 'Ver próximas acciones',
        ruta: '/configuracion?pestana=catalogos-base&foco=proximas-acciones',
        destino: 'proximas-acciones',
      },
    ],
  },
  {
    id: 'verificacion',
    titulo: 'Comprueba y opera',
    mensaje:
      'Abre un RFQ de prueba y confirma que aparecen los canales, los procesos y los materiales. No lo guardes si solo estás probando.',
    ruta: '/rfq#rfq-cola',
    destino: 'rfq-cola',
  },
];
