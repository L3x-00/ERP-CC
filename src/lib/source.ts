import { loader } from 'fumadocs-core/source';
import { defineDocs } from 'fumadocs-mdx/macro';
import { docsRoute } from './shared';
import { i18n } from '@/lib/i18n';

export const docs = defineDocs({
  dir: 'content/docs',
});

export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  i18n,
});
