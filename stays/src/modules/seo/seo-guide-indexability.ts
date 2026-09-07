import type { SeoGuide } from './entities/seo-guide.entity';

/** Shared by page metadata and discovery. Publication alone is not an indexing decision. */
export function isGuideIndexable(guide: SeoGuide): boolean {
  return guide.content_status === 'published' && guide.indexable &&
    guide.seo_score >= 75 && Boolean(guide.body_html?.trim());
}
