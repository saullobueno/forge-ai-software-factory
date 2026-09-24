import { hasPromptInjectionRisk } from './prompt-injection.ts';
import type { KnowledgeChunkInput, PreparedKnowledgeChunk } from './types.ts';

const DEFAULT_MAX_TOKENS = 240;
const DEFAULT_OVERLAP_TOKENS = 32;

export function estimateTokenCount(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, Math.ceil(words.length * 1.25));
}

export function chunkKnowledge(input: KnowledgeChunkInput): PreparedKnowledgeChunk[] {
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = input.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  if (maxTokens <= 0) throw new Error('maxTokens precisa ser maior que zero.');
  if (overlapTokens < 0 || overlapTokens >= maxTokens) {
    throw new Error('overlapTokens precisa ser maior ou igual a zero e menor que maxTokens.');
  }

  const paragraphs = input.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [input.content.trim()]) {
    const paragraphTokens = estimateTokenCount(paragraph);
    if (current.length > 0 && currentTokens + paragraphTokens > maxTokens) {
      chunks.push(current.join('\n\n'));
      current = overlapFrom(current, overlapTokens);
      currentTokens = estimateTokenCount(current.join('\n\n'));
    }

    if (paragraphTokens > maxTokens) {
      const split = splitLongParagraph(paragraph, maxTokens);
      for (const part of split) {
        if (current.length > 0) chunks.push(current.join('\n\n'));
        current = [part];
        currentTokens = estimateTokenCount(part);
      }
      continue;
    }

    current.push(paragraph);
    currentTokens += paragraphTokens;
  }

  if (current.length > 0) chunks.push(current.join('\n\n'));

  return chunks.map((content, chunkIndex) => ({
    knowledgeSourceId: input.sourceId,
    content,
    chunkIndex,
    tokenCount: estimateTokenCount(content),
    hasPromptInjectionRisk: hasPromptInjectionRisk(content),
  }));
}

function splitLongParagraph(paragraph: string, maxTokens: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  const parts: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences.length > 0 ? sentences : [paragraph]) {
    const candidate = [...current, sentence].join(' ');
    if (current.length > 0 && estimateTokenCount(candidate) > maxTokens) {
      parts.push(current.join(' '));
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }

  if (current.length > 0) parts.push(current.join(' '));
  return parts;
}

function overlapFrom(paragraphs: readonly string[], overlapTokens: number): string[] {
  if (overlapTokens === 0) return [];
  const selected: string[] = [];
  let tokens = 0;

  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    if (paragraph === undefined) continue;
    const nextTokens = estimateTokenCount(paragraph);
    if (tokens + nextTokens > overlapTokens && selected.length > 0) break;
    selected.unshift(paragraph);
    tokens += nextTokens;
  }

  return selected;
}
