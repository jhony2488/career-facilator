import { cleanJobHtml, estimateTokens } from '../../../src/scraper/domCleaner';
import { SAMPLE_JOB_HTML } from '../../helpers/fixtures';

describe('cleanJobHtml — limpeza agressiva de contexto', () => {
  it('extrai apenas o conteúdo principal da descrição da vaga', () => {
    // doc 03 (5.1): converte apenas o container principal em Markdown compacto
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).toContain('Senior Full-Stack Engineer');
    expect(clean.markdown).toContain('TypeScript');
    expect(clean.markdown).toContain('PostgreSQL');
  });

  it('remove scripts, estilos, svg, navegação, ads e rodapé', () => {
    // doc 03 (5.1): remove tags script, style, svg, menus e rodapés
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).not.toContain('window.tracker');
    expect(clean.markdown).not.toContain('analytics.track');
    expect(clean.markdown).not.toContain('showAds');
    expect(clean.markdown).not.toContain('Advertisement');
    expect(clean.markdown).not.toContain('Privacy · Cookies');
  });

  it('produz saída em markdown enxuto, não HTML', () => {
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.markdown).not.toMatch(/<script|<style|<nav|<footer|<svg/i);
  });

  it('reduz drasticamente o volume de tokens da página', () => {
    // doc 03 (5.1): página média de 18k tokens → ~900 tokens
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);
    const rawTokens = estimateTokens(SAMPLE_JOB_HTML);
    const cleanTokens = estimateTokens(clean.markdown);

    expect(cleanTokens).toBeLessThan(rawTokens * 0.3);
  });

  it('extrai título e empresa quando identificáveis', () => {
    const clean = cleanJobHtml(SAMPLE_JOB_HTML);

    expect(clean.title).toMatch(/Senior Full-Stack Engineer/i);
    expect(clean.company).toMatch(/TechCorp/i);
  });
});

describe('estimateTokens', () => {
  it('estima tokens proporcionalmente ao tamanho do texto', () => {
    const short = estimateTokens('hello world');
    const long = estimateTokens('hello world '.repeat(100));

    expect(long).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(0);
  });
});
