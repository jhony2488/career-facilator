import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Frame, JSHandle, Locator, Page } from 'playwright';
import type {
  ExecuteFillOptions,
  ExecuteFillResult,
  PageFieldState,
  PageStateLike,
} from './formExecutor';
import { inspectDom } from '../scraper/pageInspector';
import { humanPathTo, randInt, typeDelayFor } from '../utils/humanSim';

const MAX_STEPS = 8;

/**
 * Clique com abordagem humana: mouse move em polilinha com jitter até o botão
 * + pausa curta antes do click — menos "teleporte instantâneo" p/ bot-detection.
 * humanPace=false cai no click direto.
 */
async function humanClick(
  dom: Page,
  locator: Locator,
  humanPace: boolean,
  timeout: number,
): Promise<void> {
  if (humanPace) {
    try {
      const box = await locator.boundingBox();
      if (box) {
        const start = { x: randInt(50, 600), y: randInt(50, 400) };
        const end = {
          x: box.x + box.width * (0.3 + Math.random() * 0.4),
          y: box.y + box.height * (0.3 + Math.random() * 0.4),
        };
        for (const p of humanPathTo(start, end)) {
          await dom.mouse.move(p.x, p.y, { steps: randInt(4, 8) });
        }
        await dom.waitForTimeout(randInt(80, 260));
      }
    } catch {
      // sem box/posição — segue p/ o click normal
    }
  }
  await locator.click({ timeout });
}

/** Botões de avanço de wizard (multi-etapas — feature/06). */
const NEXT_RE =
  /next|continue|pr[óo]ximo|avan[çc]ar|continuar|save and continue|salvar e continuar/i;
/** Botões de envio definitivo — nunca clicados em modo PAUSE_BEFORE_SUBMIT. */
const SUBMIT_RE =
  /apply|submit|send( application)?|enviar( candidatura)?|candidatar(-se)?|finalizar/i;
/** "Apply" no próprio botão de abertura do form — evita tratar nav como submit. */
const AMBIGUOUS_RE = /apply( now)?( for this (job|position))?/i;

/** Escopo do campo: frame principal ou o iframe onde o seletor vive. */
function scopeFor(dom: Page, frameIdx?: number): Page | Frame {
  if (!frameIdx) return dom;
  return dom.frames()[frameIdx] ?? dom;
}

async function fillDomField(
  dom: Page,
  field: PageFieldState,
  value: string,
  humanPace: boolean,
): Promise<boolean> {
  const scope = scopeFor(dom, field.frameIdx);
  const locator = field.selector
    ? scope.locator(field.selector)
    : scope.getByLabel(field.label, { exact: false });
  const el = locator.first();
  try {
    if (field.kind === 'select') {
      try {
        await el.selectOption({ label: value }, { timeout: 3000 });
      } catch {
        await el.selectOption(value, { timeout: 3000 });
      }
      return true;
    }
    const type = ((await el.getAttribute('type')) || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (value && !/^(no|não|nao|false|0)$/i.test(value)) await el.check({ timeout: 3000 });
      else await el.uncheck({ timeout: 3000 });
      return true;
    }
    // fill() dispara input+change — o que SPAs (React/Vue) esperam pra validar.
    // humanPace: digitação caractere a caractere com delay — menos bot-like.
    if (humanPace) {
      try {
        await el.fill('', { timeout: 3000 });
        await el.pressSequentially(value, {
          delay: typeDelayFor(value.length),
          timeout: 15000,
        });
        return true;
      } catch {
        // teclado falhou (campo especial) — cai no fill instantâneo
      }
    }
    await el.fill(value, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/** Clica "Next/Continue" de wizard; retorna false quando não achou botão. */
async function clickNext(dom: Page, humanPace: boolean): Promise<boolean> {
  // O botão pode viver no iframe do form — tenta todos os frames, main primeiro.
  for (const scope of dom.frames()) {
    const btn = scope.getByRole('button', { name: NEXT_RE }).first();
    try {
      await humanClick(dom, btn, humanPace, 3000);
      await dom.waitForTimeout(humanPace ? randInt(600, 1400) : 700);
      return true;
    } catch {
      // próximo frame
    }
  }
  return false;
}

/** Botão de submit definitivo — ignora o 'Apply' que ABRE o form. */
async function clickSubmit(dom: Page, humanPace: boolean): Promise<boolean> {
  for (const scope of dom.frames()) {
    const native = scope.locator('button[type="submit"], input[type="submit"]').first();
    const candidates = [native, scope.getByRole('button', { name: SUBMIT_RE }).first()];
    for (const btn of candidates) {
      try {
        const text = ((await btn.innerText()) || (await btn.getAttribute('value')) || '').trim();
        if (AMBIGUOUS_RE.test(text) && !SUBMIT_RE.test(text)) continue;
        await humanClick(dom, btn, humanPace, 4000);
        return true;
      } catch {
        // próximo candidato
      }
    }
  }
  return false;
}

/**
 * Upload sem input[type=file]: constrói File in-page a partir dos bytes do
 * PDF e despacha dragenter/dragover/drop com DataTransfer na zona detectada
 * (fallback p/ widgets de arrastar — Workday e afins).
 */
async function dropResumeViaDropzone(
  dom: Page,
  zones: Array<{ selector: string; frameIdx?: number }>,
  resumePath: string,
): Promise<boolean> {
  const b64 = readFileSync(resumePath).toString('base64');
  const name = basename(resumePath);
  for (const zone of zones) {
    const scope = scopeFor(dom, zone.frameIdx);
    try {
      const dt = await scope.evaluateHandle(() => new DataTransfer());
      await (dt as JSHandle<DataTransfer>).evaluate(
        (handle, [payload, fileName]) => {
          const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
          handle.items.add(new File([bytes], fileName, { type: 'application/pdf' }));
        },
        [b64, name] as const,
      );
      const target = scope.locator(zone.selector).first();
      for (const type of ['dragenter', 'dragover', 'drop']) {
        await target.dispatchEvent(type, { dataTransfer: dt }, { timeout: 3000 });
      }
      return true;
    } catch {
      // próxima zona
    }
  }
  return false;
}

/**
 * Executor real de formulário web (feature/06): preenche via DOM — determinístico
 * primeiro, respostas IA nos unmatched — anexa PDF, navega multi-etapas e envia
 * ou pausa conforme submitMode. CAPTCHA/OTP/erro de validação → NEEDS_HUMAN_INPUT
 * com progresso preservado (a página não é fechada aqui — quem chama fecha).
 */
export async function executeLiveFill(
  live: PageStateLike,
  opts: ExecuteFillOptions,
): Promise<ExecuteFillResult> {
  const dom = live.dom as Page | undefined;
  if (!dom) throw new Error('executeLiveFill: live.dom ausente (use executeFill para mocks)');

  const { matched = [], aiAnswers = {}, resumePath, submitMode, humanPace = true } = opts;
  const matchedByLabel = new Map(matched.map((m) => [m.field.label, m.value]));
  let fieldsFilled = 0;
  let resumeAttached = false;
  const aiAnswersUsed = new Set<string>();

  // Dwell antes de interagir — ler a página em vez de atacar o 1º campo.
  if (humanPace) await dom.waitForTimeout(randInt(400, 1200));

  for (let step = 0; step < MAX_STEPS; step++) {
    for (const field of live.fields) {
      if (field.kind === 'file' || !field.selector) continue;
      const det = matchedByLabel.get(field.label);
      const value = det ?? aiAnswers[field.label];
      if (value === undefined) continue;
      if (await fillDomField(dom, field, value, humanPace)) {
        fieldsFilled++;
        if (det === undefined) aiAnswersUsed.add(field.label);
      }
    }

    const fileField = live.fields.find((f) => f.kind === 'file' && f.selector);
    if (fileField && resumePath && !resumeAttached) {
      try {
        await scopeFor(dom, fileField.frameIdx)
          .locator(fileField.selector!)
          .setInputFiles(resumePath, { timeout: 3000 });
        resumeAttached = true;
      } catch {
        // upload invisível/iframe — segue; erro de validação (se houver) escalona abaixo
      }
    }

    // Sem input[type=file]: dropzone/drag-area detectada na inspeção vira o alvo.
    if (!resumeAttached && resumePath && live.dropzones?.length) {
      resumeAttached = await dropResumeViaDropzone(dom, live.dropzones, resumePath);
    }

    if (live.hasCaptcha || live.requiresEmailOtp || live.validationErrors.length > 0) {
      return {
        fieldsFilled,
        resumeAttached,
        submitted: false,
        aiAnswersUsed: [...aiAnswersUsed],
        status: 'NEEDS_HUMAN_INPUT',
        unmatchedHandled: true,
        escalated: true,
      };
    }

    if (live.currentStep >= live.totalSteps) break;
    if (!(await clickNext(dom, humanPace))) break; // sem botão de avanço — tenta o que tem
    const refreshed = await inspectDom(dom).catch(() => null);
    if (!refreshed) break;
    Object.assign(live, refreshed);
  }

  if (submitMode === 'AUTO_SUBMIT') {
    if (await clickSubmit(dom, humanPace)) {
      live.submitted = true;
      return {
        fieldsFilled,
        resumeAttached,
        submitted: true,
        aiAnswersUsed: [...aiAnswersUsed],
        status: 'APPLIED',
      };
    }
    return {
      fieldsFilled,
      resumeAttached,
      submitted: false,
      aiAnswersUsed: [...aiAnswersUsed],
      status: 'NEEDS_HUMAN_INPUT',
      unmatchedHandled: true,
      escalated: true,
    };
  }

  return {
    fieldsFilled,
    resumeAttached,
    submitted: false,
    aiAnswersUsed: [...aiAnswersUsed],
    status: 'READY_TO_REVIEW',
    unmatchedHandled: true,
  };
}

/** Submit disparado após aprovação humana num READY_TO_REVIEW — mesma página viva. */
export async function submitLivePage(live: PageStateLike, humanPace = true): Promise<boolean> {
  const dom = live.dom as Page | undefined;
  if (!dom) return false;
  return clickSubmit(dom, humanPace);
}

/** Fecha a página real se existir — no-op em mocks. */
export async function closeLivePage(live: { dom?: unknown }): Promise<void> {
  const dom = live.dom as { close?: () => Promise<void> } | undefined;
  await dom?.close?.().catch(() => {});
}
