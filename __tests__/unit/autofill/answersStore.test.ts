import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAnswers, readAnswers, removeAnswers } from '../../../src/autofill/answersStore';
import { existsSync } from 'node:fs';

const dir = mkdtempSync(join(tmpdir(), 'answers-'));
const resume = join(dir, 'resume.pdf');

describe('answersStore — tailor answers sidecar for retry', () => {
  it('round-trips answers next to the resume (absolute path passes through)', () => {
    writeAnswers(resume, { 'Expected salary': 'EUR 80k', Visa: 'none' });
    expect(existsSync(`${resume}.answers.json`)).toBe(true);
    expect(readAnswers(resume)).toEqual({ 'Expected salary': 'EUR 80k', Visa: 'none' });
  });

  it('returns {} for a missing sidecar (legacy jobs)', () => {
    expect(readAnswers(join(dir, 'never-written.pdf'))).toEqual({});
  });

  it('returns {} for a corrupt sidecar instead of throwing', () => {
    writeFileSync(`${resume}.answers.json`, '{broken json', 'utf8');
    expect(readAnswers(resume)).toEqual({});
  });

  it('returns {} for a null/empty resumePath', () => {
    expect(readAnswers(null)).toEqual({});
    expect(readAnswers(undefined)).toEqual({});
  });

  it('removeAnswers deletes the sidecar file', () => {
    writeAnswers(resume, { a: '1' });
    removeAnswers(resume);
    expect(existsSync(`${resume}.answers.json`)).toBe(false);
  });
});
