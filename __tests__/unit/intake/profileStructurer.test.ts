import { MasterProfileSchema, structureProfile } from '../../../src/intake/profileStructurer';
import { NOT_INFORMED } from '../../helpers/contracts';
import { makeExtractedProfile } from '../../helpers/factories';
import { mockStructurerModel, mockFailingStructurerModel } from '../../helpers/mocks';
import { SAMPLE_CV_TEXT, SAMPLE_CV_TEXT_SPARSE } from '../../helpers/fixtures';

describe('MasterProfileSchema', () => {
  it('aceita um perfil extraído válido', () => {
    expect(MasterProfileSchema.safeParse(makeExtractedProfile()).success).toBe(true);
  });

  it('rejeita estrutura sem os campos mínimos de identificação', () => {
    expect(MasterProfileSchema.safeParse({ coreStack: ['TypeScript'] }).success).toBe(false);
  });
});

describe('structureProfile', () => {
  it('produz perfil estruturado a partir do texto do documento', async () => {
    // feature/13: Extrair currículo depositado na área de entrada
    const model = mockStructurerModel({
      fullName: 'Dev Tester',
      coreStack: ['TypeScript', 'Node.js'],
    });
    const result = await structureProfile({ documentText: SAMPLE_CV_TEXT }, { model });

    expect(result.fullName).toBe('Dev Tester');
    expect(result.coreStack).toContain('TypeScript');
    expect(model.generate).toHaveBeenCalledTimes(1);
  });

  it('envia o texto do documento ao modelo, não metadados externos', async () => {
    const model = mockStructurerModel();
    await structureProfile({ documentText: SAMPLE_CV_TEXT }, { model });

    const prompt = model.generate.mock.calls[0][0];
    expect(prompt).toContain('Dev Tester');
    expect(prompt).toContain('dev@example.com');
  });

  it('nunca infere dados ausentes — campos ficam não informados ou vazios', async () => {
    // feature/13: Nunca inferir dados ausentes no documento
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

  it('usa sentinela para campos de texto ausentes no documento', async () => {
    // feature/13: Nunca inferir dados ausentes no documento
    const model = mockStructurerModel({ portfolio: NOT_INFORMED, certifications: [] });
    const result = await structureProfile({ documentText: SAMPLE_CV_TEXT_SPARSE }, { model });

    expect(result.portfolio).toBe(NOT_INFORMED);
    expect(result.portfolio).not.toContain('http');
  });

  it('propaga falha do modelo sem produzir perfil parcial', async () => {
    const model = mockFailingStructurerModel();
    await expect(structureProfile({ documentText: SAMPLE_CV_TEXT }, { model })).rejects.toThrow();
  });
});
