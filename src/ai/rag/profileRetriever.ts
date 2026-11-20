import type { MasterProfileLike } from '../../core/types';

/** MasterProfileLike + campos do perfil completo (opcionais para perfis mínimos). */
export interface RagProfileLike extends MasterProfileLike {
  summary?: string;
  languages?: string[];
  experiences?: Array<{ role: string; company: string; period: string; highlights: string[] }>;
  openSourceProjects?: Array<{ name: string; repo: string; summary: string; metrics: string[] }>;
  education?: Array<{ course: string; institution: string; period: string }>;
  certifications?: string[];
}

/**
 * RAG híbrido sobre o perfil-mestre (otimização para modelos 3B): em vez de
 * enviar o perfil inteiro em JSON (~2-4k tok), o prompt recebe apenas os
 * trechos relevantes à vaga + o esqueleto sempre-incluso.
 *
 * Base: léxico determinístico (0 deps). Opcional: embeddings Ollama via
 * AI_EMBEDDINGS_ENABLED — fusão por Reciprocal Rank Fusion.
 */

export interface ProfileChunk {
  id: string;
  section: string;
  text: string;
  tokens: Set<string>;
}

export interface RetrievalQuery {
  /** matchedKeywords da triagem (alto peso). */
  keywords: string[];
  /** texto da vaga — complementa a query léxica e vira o embedding query. */
  jobText?: string;
}

export interface RetrievalOptions {
  topK?: number;
  /** seções nunca omitidas — esqueleto mínimo do perfil. */
  alwaysInclude?: string[];
}

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_TOP_K = 4;
export const ALWAYS_INCLUDE = ['personal', 'coreStack', 'standardAnswers'];

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'do', 'da', 'em', 'um', 'uma', 'para', 'com', 'the', 'and',
  'or', 'of', 'to', 'in', 'for', 'with', 'on', 'at', 'is', 'are', 'we', 'you',
]);

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#._-]+/i)) {
    const t = raw.replace(/^[.,_-]+|[.,_-]+$/g, '');
    if (t.length >= 2 && !STOPWORDS.has(t)) tokens.add(t);
  }
  return tokens;
}

/** Divide o perfil-mestre em chunks rotulados recuperáveis. */
export function chunkProfile(profile: RagProfileLike): ProfileChunk[] {
  const chunks: ProfileChunk[] = [];
  const push = (id: string, section: string, text: string) =>
    chunks.push({ id, section, text, tokens: tokenize(text) });

  push(
    'personal',
    'personal',
    `${profile.fullName} — ${profile.email} · ${profile.linkedin} · ${profile.github} · ${profile.portfolio}`,
  );
  if (profile.summary) push('summary', 'summary', profile.summary);
  push('coreStack', 'coreStack', `Stacks: ${profile.coreStack.join(', ')}`);
  const answers = Object.entries(profile.standardAnswers);
  if (answers.length) {
    push(
      'standardAnswers',
      'standardAnswers',
      `Respostas padrão: ${answers.map(([k, v]) => `${k}=${v}`).join('; ')}`,
    );
  }
  if (profile.languages?.length) {
    push(
      'languages',
      'languages',
      `Idiomas: ${profile.languages.join(', ')} · Sênioridade: ${profile.seniorityYears} anos`,
    );
  }

  (profile.experiences ?? []).forEach((e, i) =>
    push(
      `experience:${i}`,
      'experiences',
      `${e.role} — ${e.company} (${e.period}): ${e.highlights.join('; ')}`,
    ),
  );
  profile.projects.forEach((p, i) =>
    push(`project:${i}`, 'projects', `${p.name}: ${p.summary} (${p.metrics.join('; ')})`),
  );
  (profile.openSourceProjects ?? []).forEach((p, i) =>
    push(
      `oss:${i}`,
      'openSourceProjects',
      `${p.name} [${p.repo}]: ${p.summary} (${p.metrics.join('; ')})`,
    ),
  );
  (profile.education ?? []).forEach((e, i) =>
    push(`education:${i}`, 'education', `${e.course} — ${e.institution} (${e.period})`),
  );

  return chunks;
}

function lexicalScore(chunk: ProfileChunk, queryTokens: Set<string>): number {
  let hits = 0;
  for (const t of chunk.tokens) {
    for (const q of queryTokens) {
      if (t === q || (t.length >= 4 && q.includes(t)) || (q.length >= 4 && t.includes(q))) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

/** Retrieval léxico — ranking por overlap de termos (default, custo zero). */
export function retrieveRelevant(
  chunks: ProfileChunk[],
  query: RetrievalQuery,
  opts: RetrievalOptions = {},
): ProfileChunk[] {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const always = new Set(opts.alwaysInclude ?? ALWAYS_INCLUDE);

  const queryTokens = tokenize([...query.keywords, query.jobText ?? ''].join(' '));
  const required = chunks.filter((c) => always.has(c.section) || always.has(c.id));
  const optional = chunks.filter((c) => !required.includes(c));

  const ranked = optional
    .map((chunk) => ({ chunk, score: lexicalScore(chunk, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  const picks = ranked.filter((r) => r.score > 0).slice(0, topK);
  const selected = picks.map((r) => r.chunk);
  return [...required, ...selected];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Retrieval semântico — cosine similarity via embeddings do provider (ex.: Ollama /api/embed). */
export async function retrieveByEmbedding(
  chunks: ProfileChunk[],
  queryText: string,
  embedder: Embedder,
  opts: RetrievalOptions = {},
): Promise<ProfileChunk[]> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const always = new Set(opts.alwaysInclude ?? ALWAYS_INCLUDE);
  const required = chunks.filter((c) => always.has(c.section) || always.has(c.id));
  const optional = chunks.filter((c) => !required.includes(c));

  const vectors = await embedder.embed([queryText, ...optional.map((c) => c.text)]);
  const queryVec = vectors[0];
  const ranked = optional
    .map((chunk, i) => ({ chunk, score: cosine(queryVec, vectors[i + 1] ?? []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return [...required, ...ranked.map((r) => r.chunk)];
}

/**
 * Fusão híbrida: Reciprocal Rank Fusion entre ranking léxico e de embeddings.
 * Se o embedder falhar (modelo ausente), cai para o léxico silenciosamente.
 */
export async function retrieveHybrid(
  chunks: ProfileChunk[],
  query: RetrievalQuery,
  embedder: Embedder | undefined,
  opts: RetrievalOptions = {},
): Promise<ProfileChunk[]> {
  const topK = opts.topK ?? DEFAULT_TOP_K;
  const always = new Set(opts.alwaysInclude ?? ALWAYS_INCLUDE);
  const lexical = retrieveRelevant(chunks, query, opts);
  if (!embedder) return lexical;

  let embedded: ProfileChunk[];
  try {
    embedded = await retrieveByEmbedding(chunks, query.jobText ?? query.keywords.join(' '), embedder, {
      ...opts,
      topK: chunks.length,
    });
  } catch {
    return lexical;
  }

  // RRF precisa de ranking completo, não só dos top-K do léxico
  const lexicalFull = retrieveRelevant(chunks, query, { ...opts, topK: chunks.length });
  const rrf = new Map<ProfileChunk, number>();
  const K = 60;
  lexicalFull.forEach((c, i) => rrf.set(c, (rrf.get(c) ?? 0) + 1 / (K + i + 1)));
  embedded.forEach((c, i) => rrf.set(c, (rrf.get(c) ?? 0) + 1 / (K + i + 1)));

  const required = chunks.filter((c) => always.has(c.section) || always.has(c.id));
  const fused = chunks
    .filter((c) => !required.includes(c))
    .sort((a, b) => (rrf.get(b) ?? 0) - (rrf.get(a) ?? 0))
    .slice(0, topK);

  return [...required, ...fused];
}

/** Serializa os chunks selecionados como contexto compacto para o prompt. */
export function buildProfileContext(chunks: ProfileChunk[]): string {
  return chunks.map((c) => `### ${c.section}\n${c.text}`).join('\n\n');
}
