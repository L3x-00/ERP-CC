import { RootProvider } from 'fumadocs-ui/provider/next';
import { i18nProvider } from 'fumadocs-ui/i18n';
import { translations } from '@/lib/layout.shared';

export default async function Layout({ params, children }: LayoutProps<'/[lang]'>) {
  const { lang } = await params;

  return (
    <RootProvider i18n={i18nProvider(translations, lang)} theme={{ enabled: false }}>
      <div className="flex flex-col min-h-screen">{children}</div>
    </RootProvider>
  );
}
