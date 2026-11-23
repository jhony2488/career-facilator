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

/** Botões de avanço de wizard (multi-etapas — feature/06 + Easy Apply "Revisar"). */
const NEXT_RE =
  /next|continue|pr[óo]ximo|avan[çc]ar|continuar|save and continue|salvar e continuar|revisar|review/i;
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

/** Log de depuração do fill (`AUTOFILL_DEBUG_FILL`) — mostra fonte do valor. */
function debugLog(enabled: boolean, msg: string): void {
  if (enabled) console.log(msg);
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
      const options = await el
        .locator('option')
        .allInnerTexts()
        .catch(() => []);
      // Tenta casar por label, depois por value, depois por texto exato
      // das opções (case-insensitive).
      const matches = [
        () => el.selectOption({ label: value }, { timeout: 3000 }),
        () => el.selectOption(value, { timeout: 3000 }),
        () => {
          const lower = value.toLowerCase();
          const opt = options.find(
            (o) => o.toLowerCase().trim() === lower || o.toLowerCase().includes(lower),
          );
          if (!opt) throw new Error('no matching option');
          return el.selectOption({ label: opt.trim() }, { timeout: 3000 });
        },
      ];
      for (const attempt of matches) {
        try {
          await attempt();
          return true;
        } catch {
          // próxima estratégia
        }
      }
      return false;
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
    // Última tentativa: force — cobre elementos cobertos por overlay ou
    // inputs file escondidos.
    try {
      if (field.kind === 'select') {
        await locator.first().selectOption(value, { force: true, timeout: 3000 });
      } else if (
        ['checkbox', 'radio'].includes(
          ((await locator.first().getAttribute('type')) || '').toLowerCase(),
        )
      ) {
        await locator
          .first()
          .setChecked(!/^(no|não|nao|false|0)$/i.test(value), { force: true, timeout: 3000 });
      } else {
        await locator.first().fill(value, { force: true, timeout: 3000 });
      }
      return true;
    } catch {
      return false;
    }
  }
}

/** Normaliza chaves de resposta IA ↔ label ("Salário (EUR/ano)?" ≈ "Expected salary"). */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normKey(s)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  return intersection.size / (a.size + b.size - intersection.size);
}

/** Input file: resume-ish anexa o CV; cover letter/foto/avatar ficam de fora. */
const RESUME_RE = /\bresume\b|\bcv\b|curr[ií]culo/i;
const UPLOAD_RE = /attach|upload|anexo/i;
const COVER_RE = /cover.?letter|carta/i;
const PHOTO_FIELD_RE = /photo|foto|avatar|picture|image|headshot/i;
const AUTO_FILL_RE = /auto\s*fill|autofill|parse\s*(your|my|the)?\s*resume|import\s*resume/i;

export function fileFieldText(f: PageFieldState): string {
  return `${f.label} ${f.name ?? ''}`.toLowerCase();
}

export function resumeScore(f: PageFieldState): number {
  const text = fileFieldText(f);
  // Campos "autofill from resume" são do ATS (Ashby) p/ parsear e preencher
  // o resto do form — não são o anexo da candidatura em si.
  if (AUTO_FILL_RE.test(text)) return -2;
  if (RESUME_RE.test(text) && !COVER_RE.test(text)) return 3;
  if (UPLOAD_RE.test(text) && !COVER_RE.test(text)) return 2;
  if (COVER_RE.test(text)) return -1;
  return 0;
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
    const roleBtn = scope.getByRole('button', { name: SUBMIT_RE }).first();
    const roleLink = scope.getByRole('link', { name: SUBMIT_RE }).first();
    // Button sem type explícito é "submit" por padrão em HTML; cobre "Apply"
    // e "Submit" que são <button> puros dentro do form.
    const untypedBtn = scope.locator('button:not([type])').filter({ hasText: SUBMIT_RE }).first();
    const candidates = [native, roleBtn, roleLink, untypedBtn];
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

/** Diagnóstico: lista botões candidatos a submit sem clicar (inspect). */
export async function findSubmitCandidates(
  dom: Page,
): Promise<Array<{ text: string; ariaLabel?: string }>> {
  const candidates: Array<{ text: string; ariaLabel?: string }> = [];
  for (const scope of dom.frames()) {
    const locators = [
      scope.locator('button[type="submit"], input[type="submit"]'),
      scope.getByRole('button', { name: SUBMIT_RE }),
      scope.getByRole('link', { name: SUBMIT_RE }),
      scope.locator('button:not([type])').filter({ hasText: SUBMIT_RE }),
    ];
    for (const loc of locators) {
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 3); i++) {
        const btn = loc.nth(i);
        try {
          if (!(await btn.isVisible())) continue;
          const text = ((await btn.innerText()) || (await btn.getAttribute('value')) || '').trim();
          if (!text) continue;
          if (AMBIGUOUS_RE.test(text) && !SUBMIT_RE.test(text)) continue;
          const ariaLabel = (await btn.getAttribute('aria-label')) ?? undefined;
          if (!candidates.some((c) => c.text === text && c.ariaLabel === ariaLabel)) {
            candidates.push({ text, ariaLabel });
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return candidates.slice(0, 10);
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

  const {
    matched = [],
    aiAnswers = {},
    fieldDefaults = {},
    fuzzyThreshold = 0.9,
    resumePath,
    submitMode,
    humanPace = true,
  } = opts;
  const debug = opts.debug === true;
  // Casa por SELETOR (identidade do campo) — labels duplicadas num form
  // ("Phone" no seu bloco e no do recrutador) não recebem o mesmo valor.
  const matchedBySelector = new Map(
    matched.filter((m) => m.field.selector).map((m) => [m.field.selector as string, m.value]),
  );
  const matchedByLabel = new Map(matched.map((m) => [m.field.label, m.value]));
  const matchedByName = new Map(
    matched.filter((m) => m.field.name).map((m) => [m.field.name as string, m.value]),
  );
  const normAnswers = new Map(Object.entries(aiAnswers).map(([k, v]) => [normKey(k), v]));
  const detValue = (f: PageFieldState): string | undefined =>
    (f.selector && matchedBySelector.get(f.selector)) ??
    (f.name && matchedByName.get(f.name)) ??
    matchedByLabel.get(f.label);
  const aiValue = (f: PageFieldState): string | undefined => {
    if (aiAnswers[f.label] !== undefined) return aiAnswers[f.label];
    return normAnswers.get(normKey(f.label));
  };
  const fuzzyValue = (
    label: string,
    answers: Record<string, string>,
    threshold: number,
  ): string | undefined => {
    if (!answers || Object.keys(answers).length === 0 || threshold <= 0) return undefined;
    if (answers[label] !== undefined) return answers[label];
    const target = tokenSet(label);
    let best: { key: string; score: number } | null = null;
    for (const [key, value] of Object.entries(answers)) {
      const score = jaccard(target, tokenSet(key));
      if (score >= threshold && (!best || score > best.score)) best = { key, score };
    }
    if (best && debug)
      debugLog(
        debug,
        `    fuzzy match "${label}" → "${best.key}" (score ${best.score.toFixed(2)})`,
      );
    return best ? answers[best.key] : undefined;
  };
  const resolveValue = (f: PageFieldState): { value?: string; source: string } => {
    const det = detValue(f);
    if (det !== undefined) return { value: det, source: 'PROFILE' };
    const ai = aiValue(f) ?? fuzzyValue(f.label, aiAnswers, fuzzyThreshold);
    if (ai !== undefined) return { value: ai, source: 'AI' };
    const def = fuzzyValue(f.label, fieldDefaults, 0.8);
    if (def !== undefined) return { value: def, source: 'DEFAULT' };
    return { source: 'NONE' };
  };
  let fieldsFilled = 0;
  let resumeAttached = false;
  const aiAnswersUsed = new Set<string>();
  let lastStepSig = live.fields.map((f) => `${f.kind}:${f.label}`).join('|');

  // Dwell antes de interagir — ler a página em vez de atacar o 1º campo.
  if (humanPace) await dom.waitForTimeout(randInt(400, 1200));

  for (let step = 0; step < MAX_STEPS; step++) {
    for (const field of live.fields) {
      if (field.kind === 'file' || !field.selector) continue;
      const resolved = resolveValue(field);
      if (resolved.value === undefined) {
        if (debug && field.required) debugLog(debug, `  skip required "${field.label}" — no value`);
        continue;
      }
      const success = await fillDomField(dom, field, resolved.value, humanPace);
      if (success) {
        fieldsFilled++;
        if (resolved.source === 'AI') aiAnswersUsed.add(field.label);
        debugLog(
          debug,
          `  fill "${field.label}" ← ${resolved.value.slice(0, 60)} [${resolved.source}]`,
        );
      } else if (debug) {
        debugLog(
          debug,
          `  FAIL fill "${field.label}" ← ${resolved.value.slice(0, 60)} [${resolved.source}]`,
        );
      }
    }

    // Anexa o CV no input file CERTO: resume-ish primeiro, cover letter e
    // foto/avatar ficam de fora — tenta cada candidato até setInputFiles dar.
    if (!resumeAttached && resumePath) {
      const fileFields = live.fields
        .filter((f) => f.kind === 'file' && f.selector && resumeScore(f) >= 0)
        .sort((a, b) => resumeScore(b) - resumeScore(a));
      for (const fileField of fileFields) {
        const text = fileFieldText(fileField);
        if (PHOTO_FIELD_RE.test(text) || COVER_RE.test(text)) continue;
        const scope = scopeFor(dom, fileField.frameIdx);
        const locator = scope.locator(fileField.selector!);
        try {
          // Input file escondido atrás de label — setInputFiles funciona mesmo oculto.
          await locator.setInputFiles(resumePath, { timeout: 3000 });
          resumeAttached = true;
          debugLog(debug, `  attach ${fileField.label} ← ${resumePath}`);
          break;
        } catch {
          // Tenta clicar na zona/label para revelar o input, depois setInputFiles.
          try {
            const visible = fileField.label
              ? scope.getByText(fileField.label).first()
              : scope.locator(fileField.selector!); // fallback: clica no próprio input (mesmo escondido)
            await visible.click({ force: true, timeout: 2000 });
            await locator.setInputFiles(resumePath, { timeout: 3000 });
            resumeAttached = true;
            debugLog(debug, `  attach (after click) ${fileField.label} ← ${resumePath}`);
            break;
          } catch {
            // próximo input file
          }
        }
      }
    }

    // Sem input[type=file]: dropzone/drag-area detectada na inspeção vira o alvo.
    if (!resumeAttached && resumePath && live.dropzones?.length) {
      // Antes de dropar, clica na zona para garantir que o handler esteja ativo.
      for (const zone of live.dropzones) {
        try {
          await scopeFor(dom, zone.frameIdx)
            .locator(zone.selector)
            .first()
            .click({ force: true, timeout: 2000 });
        } catch {
          // ignore
        }
      }
      resumeAttached = await dropResumeViaDropzone(dom, live.dropzones, resumePath);
      if (resumeAttached) debugLog(debug, `  attach via dropzone ← ${resumePath}`);
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

    // "Etapa N de M" nem sempre aparece no texto (Easy Apply mostra barra de
    // progresso) — tenta o avanço de qualquer jeito; sem botão, encerra.
    if (live.totalSteps > 1 && live.currentStep >= live.totalSteps) break;
    if (!(await clickNext(dom, humanPace))) break;
    const refreshed = await inspectDom(dom).catch(() => null);
    if (!refreshed) break;
    // Botão "avançar" que não troca a etapa (loop infinito no mesmo wizard)
    // → compara a assinatura dos campos e para se nada mudou.
    const sig = refreshed.fields.map((f) => `${f.kind}:${f.label}`).join('|');
    if (sig === lastStepSig) break;
    lastStepSig = sig;
    Object.assign(live, refreshed);
  }

  if (submitMode === 'AUTO_SUBMIT') {
    if (await clickSubmit(dom, humanPace)) {
      debugLog(debug, '  submit clicked');
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
