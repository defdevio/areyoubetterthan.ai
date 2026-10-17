const EXT_LANG: Record<string, string> = {
  py: "python",
  pyi: "python",
  pyx: "python",
  pxd: "python",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  cfg: "ini",
  ini: "ini",
  sh: "shell",
  bash: "shell",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  xml: "xml",
  sql: "sql",
  bat: "bat",
  ps1: "powershell",
};

export function languageFor(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "plaintext";
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
  return EXT_LANG[ext] ?? "plaintext";
}

export function looksLikeTestFile(path: string) {
  return /(^|\/)(tests?|testing)\//.test(path) || /(^|\/)test_[^/]+\.py$/.test(path) || /_tests?\.py$/.test(path);
}
