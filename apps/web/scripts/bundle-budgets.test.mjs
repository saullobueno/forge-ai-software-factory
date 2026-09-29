import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetForRoute, DEFAULT_BUDGET_BYTES, evaluateBundleBudgets, ROUTE_BUDGETS_BYTES } from './bundle-budgets.mjs';

test('rota dentro do budget não é reportada como violação', () => {
  const budget = ROUTE_BUDGETS_BYTES['/projects'];
  const [result] = evaluateBundleBudgets([{ route: '/projects', firstLoadUncompressedJsBytes: budget - 1 }]);

  assert.equal(result.withinBudget, true);
  assert.equal(result.exceededByBytes, 0);
});

test('rota exatamente no budget não é violação (comparação inclusiva)', () => {
  const budget = ROUTE_BUDGETS_BYTES['/projects'];
  const [result] = evaluateBundleBudgets([{ route: '/projects', firstLoadUncompressedJsBytes: budget }]);

  assert.equal(result.withinBudget, true);
});

test('rota acima do budget é reportada com o excesso correto em bytes', () => {
  const budget = ROUTE_BUDGETS_BYTES['/projects'];
  const [result] = evaluateBundleBudgets([{ route: '/projects', firstLoadUncompressedJsBytes: budget + 2048 }]);

  assert.equal(result.withinBudget, false);
  assert.equal(result.exceededByBytes, 2048);
});

test('rota desconhecida usa o budget default em vez de ficar sem verificação', () => {
  assert.equal(budgetForRoute('/uma-rota-nova-qualquer'), DEFAULT_BUDGET_BYTES);

  const [result] = evaluateBundleBudgets([
    { route: '/uma-rota-nova-qualquer', firstLoadUncompressedJsBytes: DEFAULT_BUDGET_BYTES + 1 },
  ]);
  assert.equal(result.withinBudget, false);
});

test('resultado preserva a rota e os bytes reais para o relatório de CI', () => {
  const [result] = evaluateBundleBudgets([{ route: '/login', firstLoadUncompressedJsBytes: 12345 }]);

  assert.equal(result.route, '/login');
  assert.equal(result.actualBytes, 12345);
});
