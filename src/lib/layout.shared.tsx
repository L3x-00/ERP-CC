import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { uiTranslations } from 'fumadocs-ui/i18n';
import { i18n } from '@/lib/i18n';

export const translations = i18n
  .translations()
  .extend(uiTranslations())
  .add({
    es: {
      displayName: 'Español',
      'Search(search trigger)': 'Buscar',
      'Search(search dialog)': 'Buscar',
      'Open Search(search trigger)(aria-label)': 'Abrir búsqueda',
      'Close Search(search dialog)(aria-label)': 'Cerrar búsqueda',
      'No results found(search dialog)': 'Sin resultados',
      'Search failed(search dialog)': 'No se pudo completar la búsqueda',
      'On this page(table of contents)': 'En esta página',
      'No Headings(table of contents)': 'Sin secciones',
      'Table of Contents(inline table of contents)': 'Contenido',
      'Previous Page(pagination)': 'Anterior',
      'Next Page(pagination)': 'Siguiente',
      'Last updated on(page footer)': 'Actualizado el',
      'Toggle Theme(theme switcher)(aria-label)': 'Cambiar tema',
      'Light(theme switcher)(aria-label)': 'Claro',
      'Dark(theme switcher)(aria-label)': 'Oscuro',
      'System(theme switcher)(aria-label)': 'Sistema',
      'Theme(site menu)': 'Tema',
      'Open Sidebar(sidebar)(aria-label)': 'Abrir menú',
      'Close Sidebar(sidebar)(aria-label)': 'Cerrar menú',
      'Collapse Sidebar(sidebar)(aria-label)': 'Contraer menú',
      'Show Sidebar(sidebar)': 'Mostrar menú',
      'Hide Sidebar(sidebar)': 'Ocultar menú',
      'Page Not Found(404 not found page)': 'Página no encontrada',
      'Back to Home(404 not found page)': 'Volver al inicio',
      'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.(404 not found page)':
        'La página que buscas no existe o cambió de nombre.',
      'Choose a language(language switcher)': 'Elegir idioma',
      'Language(language switcher)': 'Idioma',
      'Copy Markdown(page actions)': 'Copiar Markdown',
      'View as Markdown(page actions)': 'Ver como Markdown',
    },
  });

export function baseOptions(
  locale: string = i18n.defaultLanguage,
): BaseLayoutProps {
  return {
    nav: {
      title: 'ORCA MFG ERP | Manual de Configuración',
      url: `/${locale}/docs`,
    },
  };
}