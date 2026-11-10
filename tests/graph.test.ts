import { describe, expect, it } from 'vitest';
import { parsePremises } from '../src/features/knowledge-graph/Graph';

describe('knowledge graph edges', () => {
  it('accepts only arrays of node IDs and ignores damaged records', () => {
    expect(parsePremises('["a","b"]')).toEqual(['a','b']);
    expect(parsePremises('not json')).toEqual([]);
    expect(parsePremises('{"id":"a"}')).toEqual([]);
    expect(parsePremises('["a",1]')).toEqual([]);
  });
});
