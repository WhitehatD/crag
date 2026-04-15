'use strict';

const assert = require('assert');
const { test } = require('node:test');
const { mineAntiPatterns } = require('../src/analyze/project-mining');

test('mineAntiPatterns: skips node rules when node is auxiliary to PHP', () => {
  const analysis = { stack: ['node', 'php', 'laravel'] };
  const patterns = mineAntiPatterns(analysis);
  // Should have PHP patterns
  assert.ok(patterns.some(p => p.includes('eval()')), 'should include PHP eval rule');
  assert.ok(patterns.some(p => p.includes('@')), 'should include PHP @ suppression rule');
  // Should NOT have Node patterns
  assert.ok(!patterns.some(p => p.includes('console.log')), 'should not include node console.log rule');
  assert.ok(!patterns.some(p => p.includes('synchronous filesystem')), 'should not include node sync FS rule');
});

test('mineAntiPatterns: skips node rules when node is auxiliary to Python', () => {
  const analysis = { stack: ['node', 'python'] };
  const patterns = mineAntiPatterns(analysis);
  assert.ok(patterns.some(p => p.includes('bare `Exception`')), 'should include Python exception rule');
  assert.ok(!patterns.some(p => p.includes('console.log')), 'should not include node console.log rule');
});

test('mineAntiPatterns: keeps node rules when node is the only language', () => {
  const analysis = { stack: ['node', 'typescript', 'react'] };
  const patterns = mineAntiPatterns(analysis);
  assert.ok(patterns.some(p => p.includes('console.log')), 'should include node console.log rule');
  assert.ok(patterns.some(p => p.includes('any')), 'should include typescript any rule');
  assert.ok(patterns.some(p => p.includes('class components')), 'should include react rule');
});

test('mineAntiPatterns: keeps node rules when node is primary (no competing language)', () => {
  const analysis = { stack: ['node', 'express'] };
  const patterns = mineAntiPatterns(analysis);
  assert.ok(patterns.some(p => p.includes('console.log')), 'should include node console.log rule');
});

test('mineAntiPatterns: skips node rules when node is auxiliary to Ruby', () => {
  const analysis = { stack: ['node', 'ruby', 'rails'] };
  const patterns = mineAntiPatterns(analysis);
  assert.ok(!patterns.some(p => p.includes('console.log')), 'should not include node console.log rule');
});
