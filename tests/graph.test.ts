import { describe, expect, it } from 'vitest';
import { filterKnowledgeNodes, parsePremises } from '../src/features/knowledge-graph/Graph';
import type { KnowledgeNode } from '../src/lib/types';

describe('knowledge graph edges', () => {
  it('accepts only arrays of node IDs and ignores damaged records', () => {
    expect(parsePremises('["a","b"]')).toEqual(['a','b']);
    expect(parsePremises('not json')).toEqual([]);
    expect(parsePremises('{"id":"a"}')).toEqual([]);
    expect(parsePremises('["a",1]')).toEqual([]);
  });
});

describe('topic graph filter', () => {
  const node=(id:string,name:string):KnowledgeNode=>({id,goal_id:'g',kind:'proposition',name,statement:name,source_session_id:'',source_message_id:'',created_at:''});
  it('shows only tagged nodes for a topic, including shared claims', () => {
    const nodes=[node('a','Память'),node('b','Указатели'),node('c','Общее')];
    const links=[{node_id:'a',topic_id:'memory'},{node_id:'b',topic_id:'pointers'},{node_id:'c',topic_id:'memory'},{node_id:'c',topic_id:'pointers'}];
    expect(filterKnowledgeNodes(nodes,links,'memory','').map(item=>item.id)).toEqual(['a','c']);
    expect(filterKnowledgeNodes(nodes,links,'pointers','общее').map(item=>item.id)).toEqual(['c']);
    expect(filterKnowledgeNodes(nodes,links,'all','').length).toBe(3);
  });
});
