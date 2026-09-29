import { createHash } from 'node:crypto';

/**
 * Dimensão fixa do vetor determinístico produzido por `embedText`. Escolhida
 * em 256 (não 128, não 1024): grande o suficiente para manter a taxa de
 * colisão de hash baixa para os textos reais deste projeto (chunks de até
 * ~240 tokens estimados, ver `DEFAULT_MAX_TOKENS` em `chunking.ts`, e queries
 * curtas de busca), pequena o suficiente para ficar barata de armazenar como
 * `jsonb` em `knowledge_chunks.embedding` e de comparar em memória sobre os
 * poucos candidatos deste projeto (fixture pequeno, poucas dezenas de
 * chunks — ver PROGRESS.md) sem precisar de um índice vetorial dedicado
 * (`pgvector` não é usado aqui, de propósito).
 */
export const EMBEDDING_DIMENSIONS = 256;

/**
 * Mesma regra de tokenização usada pela recuperação lexical (`retrieval.ts`
 * importa esta função para nunca duplicar a lógica de split de termos):
 * minúsculas, remove acentuação, corta em qualquer caractere que não seja
 * `[a-z0-9_/-]`, descarta termos com menos de 3 caracteres (ruído — artigos,
 * preposições curtas).
 */
export function splitTerms(content: string): string[] {
  return content
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9_/-]+/)
    .filter((term) => term.length >= 3);
}

/**
 * Embedding determinístico local via "hashing trick" (feature hashing —
 * técnica real e conhecida, a mesma ideia por trás de
 * `HashingVectorizer`/Vowpal Wabbit): cada termo do texto é hasheado
 * (SHA-256, `node:crypto`, sem rede) para escolher um índice no vetor + um
 * sinal (+1/-1, reduz o efeito de colisões destrutivas entre termos
 * diferentes que caem no mesmo índice); as contribuições de todos os termos
 * são acumuladas e o vetor final é normalizado por L2.
 *
 * **Isto NÃO é um embedding semântico de verdade.** Não existe nenhuma
 * noção de significado: dois termos com o mesmo sentido mas grafias
 * diferentes (sinônimos reais, ex. "erro"/"falha", ou traduções) caem em
 * índices completamente diferentes e não são reconhecidos como
 * relacionados. O que esta função captura é similaridade LEXICAL
 * vetorizada — textos que compartilham muitos termos (ou repetem os mesmos
 * termos com mais frequência, de forma mais concentrada) ficam com cosseno
 * alto entre si — de forma determinística (o mesmo texto sempre produz o
 * mesmo vetor, em qualquer processo/máquina, sem chamada de rede e sem
 * custo). Documentado assim para nunca ser confundido com um embedding
 * semântico real.
 *
 * Deliberadamente pronto para ser substituído por um provider real de
 * embeddings (via API de um provider já existente — Gemini/Groq/Anthropic —
 * ou outro), plugável por env var análoga a `AI_PROVIDER`, sem mudar a
 * assinatura desta função nem o formato armazenado (`number[]` de tamanho
 * fixo) — nenhuma chamada de rede real é feita nesta implementação.
 */
export function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);

  for (const term of splitTerms(text)) {
    const digest = createHash('sha256').update(term).digest();
    const index = digest.readUInt32BE(0) % EMBEDDING_DIMENSIONS;
    const sign = (digest[4]! & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }

  return l2Normalize(vector);
}

function l2Normalize(vector: readonly number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (magnitude === 0) return vector.slice();
  return vector.map((value) => value / magnitude);
}

/**
 * Similaridade de cosseno entre dois vetores do mesmo tamanho. Recalcula as
 * magnitudes em vez de assumir que ambos já vieram normalizados por
 * `embedText` — `retrieveKnowledge()` pode receber embeddings de chunks
 * legados/externos, então esta função fica correta de forma independente de
 * quem produziu o vetor. Vetores de tamanhos diferentes ou nulos (magnitude
 * zero, ex. texto sem nenhum termo válido) resultam em `0` — nunca `NaN`,
 * nunca lança.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
