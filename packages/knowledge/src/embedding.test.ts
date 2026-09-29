import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, cosineSimilarity, embedText } from './embedding.ts';

describe('embedText', () => {
  it('produz um vetor determinístico de dimensão fixa (mesmo texto -> mesmo vetor, em chamadas separadas)', () => {
    const a = embedText('Usar BullMQ para filas em produção.');
    const b = embedText('Usar BullMQ para filas em produção.');

    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a).toEqual(b);
  });

  it('normaliza por L2 (magnitude 1) quando há pelo menos um termo válido', () => {
    const vector = embedText('Webhooks disparam notificações de pagamento.');
    const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));

    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('retorna vetor zerado (nunca NaN) para texto sem nenhum termo válido', () => {
    const vector = embedText('a e o de');
    expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(vector.every((value) => value === 0)).toBe(true);
  });

  it('textos com termos completamente diferentes produzem vetores diferentes', () => {
    const a = embedText('Usar BullMQ para filas em produção.');
    const b = embedText('Webhooks disparam notificações de pagamento.');

    expect(a).not.toEqual(b);
  });
});

describe('cosineSimilarity', () => {
  it('é ~1 para o mesmo texto (mesmo vetor)', () => {
    const vector = embedText('Regras de arquitetura do repositório.');
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('é maior para dois textos que compartilham termos do que para dois que não compartilham nenhum', () => {
    const base = embedText('Webhooks disparam notificações de pagamento assim que o estorno é processado.');
    const relacionado = embedText('O webhook de pagamento também notifica o estorno processado.');
    const naoRelacionado = embedText('Paletes de logística seguem etiquetados para o depósito de armazém.');

    expect(cosineSimilarity(base, relacionado)).toBeGreaterThan(cosineSimilarity(base, naoRelacionado));
  });

  it('retorna 0 (nunca lança/NaN) para vetores vazios ou de tamanhos diferentes', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity(new Array(EMBEDDING_DIMENSIONS).fill(0), embedText('qualquer coisa'))).toBe(0);
  });

  it('NÃO reconhece sinônimos reais como similares — limitação honesta do hashing trick (não é embedding semântico)', () => {
    const erro = embedText('Ocorreu um erro grave no processamento.');
    const falha = embedText('Ocorreu uma falha grave no processamento.');
    const irrelevante = embedText('Paletes de logística seguem etiquetados para o depósito de armazém.');

    // "erro" e "falha" são sinônimos reais em português, mas o hashing trick
    // não tem nenhuma noção de significado — a similaridade entre eles não
    // é sistematicamente maior do que a de um texto totalmente não
    // relacionado, porque o restante da frase (termos idênticos: "ocorreu",
    // "grave", "processamento") já domina o resultado independente da troca
    // "erro"/"falha". O que prova o teste anterior (`é maior para...`) é
    // overlap de TERMOS, nunca de SIGNIFICADO.
    const simSinonimos = cosineSimilarity(erro, falha);
    const simIrrelevante = cosineSimilarity(erro, irrelevante);
    expect(simSinonimos).toBeGreaterThan(simIrrelevante);
    // mas troque as duas ocorrências do termo variável por qualquer coisa
    // que não compartilhe nenhum outro termo e a similaridade cai a 0,
    // provando que o "reconhecimento" acima vem do resto da frase, não do
    // par erro/falha em si:
    expect(cosineSimilarity(embedText('erro'), embedText('falha'))).toBe(0);
  });
});
