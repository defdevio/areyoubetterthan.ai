export const BUNDLE_VERSION = 1;

/** Contents of `<instance_id>.json.gz` hosted on GitHub Pages. */
export interface SourceBundle {
  v: number;
  instance_id: string;
  repo: string;
  base_commit: string;
  /** path -> UTF-8 file contents at base_commit */
  files: Record<string, string>;
  /** path -> reason the contents were left out (binary, too large, translation, ...) */
  omitted: Record<string, string>;
}
