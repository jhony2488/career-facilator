import { renderTemplate } from '../../../src/utils/textTemplate';

describe('renderTemplate — shared message template engine (docs 11/15)', () => {
  it('replaces {{placeholder}} with the provided value', () => {
    expect(
      renderTemplate('Hi {{name}}, applied for {{jobTitle}}.', {
        name: 'Ana',
        jobTitle: 'Dev',
      }),
    ).toBe('Hi Ana, applied for Dev.');
  });

  it('drops a line whose only placeholders are empty — nothing is invented', () => {
    // Anti-fabrication: a placeholder with no value never produces invented text;
    // a line left meaningless by empty placeholders is removed entirely
    expect(renderTemplate('Value: {{missing}}!', { name: 'x' })).toBe('');
    expect(renderTemplate('Keep {{ok}} and {{missing}}', { ok: 'yes' })).toBe('Keep yes and');
  });

  it('drops a line whose placeholders all resolve empty', () => {
    const out = renderTemplate('LinkedIn: {{linkedin}}\nGitHub: {{github}}\n{{fullName}}', {
      github: 'https://github.com/x',
      fullName: 'Ana',
    });
    expect(out).toBe('GitHub: https://github.com/x\nAna');
  });

  it('collapses consecutive blank lines left by dropped placeholders', () => {
    const out = renderTemplate('a\n{{x}}\nb', {});
    expect(out).toBe('a\nb');
  });
});
