// Résout l'alias '@/…' comme Metro, pour exécuter src/lib/api.ts sous Node.
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const SRC = new URL('../../src', import.meta.url).pathname;
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = `${SRC}/${specifier.slice(2)}`;
    for (const ext of ['.ts', '.tsx']) if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, context);
  }
  return next(specifier, context);
}
