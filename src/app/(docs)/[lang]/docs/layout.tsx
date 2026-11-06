import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';

type Props = {
  params: Promise<{ lang: string }>;
  children: React.ReactNode;
};

export default async function Layout({ params, children }: Props) {
  const { lang } = await params;

  return (
    <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
      {children}
    </DocsLayout>
  );
}
