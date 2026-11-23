import type { Page } from 'playwright';

/**
 * LinkedIn Easy Apply ("Candidatura simplificada") — wizard modal dentro do
 * próprio /jobs/view/<id>. O botão abre um form multi-etapas; o avanço entre
 * etapas ("Avançar"/"Revisar") é navegação de wizard, não submit — o submit
 * definitivo é o "Enviar candidatura" da última etapa.
 */

/** URL de vaga do LinkedIn (detalhe ou coleção com card aberto). */
export function isLinkedInJobUrl(url: string): boolean {
  return /(^|\.)linkedin\.com$/i.test(hostOf(url)) && /\/jobs\/(view|collections)\b/.test(url);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** aria-label/texto do botão que ABRE o wizard — não é submit. */
const EASY_APPLY_RE = /candidatura simplificada|easy apply/i;

/** Botão por seletor conhecido (classe é a mesma do apply externo — filtra pelo aria-label). */
const EASY_APPLY_SEL = [
  'button.jobs-apply-button[aria-label*="Easy Apply" i]',
  'button.jobs-apply-button[aria-label*="simplificada" i]',
  'button[aria-label*="Easy Apply" i]',
  'button[aria-label*="Candidatura simplificada" i]',
];

/** Modal do wizard — confirmamos a abertura antes de re-inspecionar. */
const MODAL_SEL =
  '.jobs-easy-apply-modal, [data-testid*="easy-apply" i], div[data-test-modal], .artdeco-modal-overlay';

/**
 * Clica o botão "Candidatura simplificada"/"Easy Apply" da página de vaga e
 * espera o modal do wizard aparecer. Retorna false quando o botão não existe
 * (vaga só com apply externo) — o chamador segue a cadeia normal.
 */
export async function openEasyApplyModal(page: Page): Promise<boolean> {
  const clickAndWait = async (click: () => Promise<void>): Promise<boolean> => {
    await click();
    await page.waitForSelector(MODAL_SEL, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(700);
    return true;
  };

  // Caminho 1: role button com nome do Easy Apply (aria-label internacional).
  const byRole = page.getByRole('button', { name: EASY_APPLY_RE }).first();
  try {
    if (await byRole.isVisible({ timeout: 1200 })) {
      return await clickAndWait(() => byRole.click({ timeout: 3000 }));
    }
  } catch {
    // segue p/ os seletores conhecidos
  }

  // Caminho 2: seletores LinkedIn específicos (classe + aria-label).
  for (const sel of EASY_APPLY_SEL) {
    const loc = page.locator(sel).first();
    try {
      if (!(await loc.isVisible())) continue;
      return await clickAndWait(() => loc.click({ timeout: 3000 }));
    } catch {
      // próximo seletor
    }
  }
  return false;
}
