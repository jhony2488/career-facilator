/**
 * Renderer de templates de mensagem (e-mail/WhatsApp — docs 11/15):
 * substitui `{{placeholder}}` pelo valor correspondente. Valor ausente
 * renderiza vazio — anti-fabricação: nada é inventado para preencher.
 *
 * Regra de linha: se TODOS os placeholders de uma linha resolvem vazio,
 * a linha inteira é descartada (evita "LinkedIn:" ou "Pretensão salarial:"
 * pendurados no texto). Excesso de linhas em branco colapsa.
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  values: Record<string, string | undefined>,
): string {
  const lines = template.split('\n').filter((line) => {
    const keys = [...line.matchAll(PLACEHOLDER)].map((m) => m[1]);
    if (keys.length === 0) return true;
    return keys.some((key) => (values[key] ?? '') !== '');
  });

  return lines
    .join('\n')
    .replace(PLACEHOLDER, (_m, key: string) => values[key] ?? '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}
