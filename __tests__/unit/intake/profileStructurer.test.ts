import { MasterProfileSchema, structureProfile } from '../../../src/intake/profileStructurer';
import { NOT_INFORMED } from '../../helpers/contracts';
import { makeExtractedProfile } from '../../helpers/factories';
import { mockStructurerModel, mockFailingStructurerModel } from '../../helpers/mocks';
import { SAMPLE_CV_TEXT, SAMPLE_CV_TEXT_SPARSE } from '../../helpers/fixtures';

describe('MasterProfileSchema', () => {
  it('accepts a valid extracted profile', () => {
    expect(MasterProfileSchema.safeParse(makeExtractedProfile()).success).toBe(true);
  });

  it('rejects a structure missing the minimum identification fields', () => {
    expect(MasterProfileSchema.safeParse({ coreStack: ['TypeScript'] }).success).toBe(false);
  });
});

describe('structureProfile', () => {
  it('produces a structured profile from the document text', async () => {
    // feature/13: Extract the resume dropped in the inbox area
    const model = mockStructurerModel({
      fullName: 'Dev Tester',
      coreStack: ['TypeScript', 'Node.js'],
    });
    const result = await structureProfile({ documentText: SAMPLE_CV_TEXT }, { model });

    expect(result.fullName).toBe('Dev Tester');
    expect(result.coreStack).toContain('TypeScript');
    // seções em caps no fixture → chamadas focadas por seção (≥1)
    expect(model.generate).toHaveBeenCalled();
  });

  it('sends the document text to the model, not external metadata', async () => {
    const model = mockStructurerModel();
    await structureProfile({ documentText: SAMPLE_CV_TEXT }, { model });

    const prompt = model.generate.mock.calls[0][0];
    expect(prompt).toContain('Dev Tester');
    expect(prompt).toContain('dev@example.com');
  });

  it('never infers missing data — fields stay uninformed or empty', async () => {
    // feature/13: Never infer data missing from the document
    const model = mockStructurerModel({
      fullName: 'Dev Tester',
      languages: [],
      salaryExpectationBRL: null,
      salaryExpectationUSD: null,
    });
    const result = await structureProfile({ documentText: SAMPLE_CV_TEXT_SPARSE }, { model });

    expect(result.languages).toEqual([]);
    expect(result.salaryExpectationBRL).toBeNull();
    expect(result.salaryExpectationUSD).toBeNull();
  });

  it('uses the sentinel for text fields missing from the document', async () => {
    // feature/13: Never infer data missing from the document
    const model = mockStructurerModel({ portfolio: NOT_INFORMED, certifications: [] });
    const result = await structureProfile({ documentText: SAMPLE_CV_TEXT_SPARSE }, { model });

    expect(result.portfolio).toBe(NOT_INFORMED);
    expect(result.portfolio).not.toContain('http');
  });

  it('propagates model failure without producing a partial profile', async () => {
    const model = mockFailingStructurerModel();
    await expect(structureProfile({ documentText: SAMPLE_CV_TEXT }, { model })).rejects.toThrow();
  });
});
