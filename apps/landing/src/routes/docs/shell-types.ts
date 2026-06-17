/** Shared types for the docs shell (TOC entries + pager links). */

export interface TocEntry {
  id: string;
  label: string;
}

export interface PagerLink {
  label: string;
  to?: string;
}
