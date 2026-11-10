import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from '@xyflow/react';
import dagre from 'dagre';
import { Markdown } from '../../components/Markdown';
import type { KnowledgeEdge, KnowledgeNode, Message, Session, Topic } from '../../lib/types';

export function parsePremises(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];
  } catch { return []; }
}

export function filterKnowledgeNodes(nodes: KnowledgeNode[], topicLinks: {node_id:string;topic_id:string}[], topicId: string, search: string): KnowledgeNode[] {
  const linked=topicId==='all'?null:new Set(topicLinks.filter(link=>link.topic_id===topicId).map(link=>link.node_id));
  const query=search.toLocaleLowerCase('ru');
  return nodes.filter(node=>(!linked||linked.has(node.id))&&`${node.name} ${node.statement}`.toLocaleLowerCase('ru').includes(query));
}

type Props = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  topics: Topic[];
  topicLinks: {node_id:string;topic_id:string}[];
  sessions: Session[];
  messages: Message[];
  provenance: { node_id:string; session_id:string; message_id:string }[];
  onSave: (node:KnowledgeNode) => void;
  onDelete: (id:string) => void;
  onOpenSession: (id:string) => void;
};

export function Graph({nodes,edges,topics,topicLinks,sessions,messages,provenance,onSave,onDelete,onOpenSession}: Props) {
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [draft,setDraft] = useState({name:'',statement:''});
  const [filter,setFilter] = useState('');
  const [topicFilter,setTopicFilter] = useState('all');
  const selected=nodes.find(node=>node.id===selectedId);
  const relations=selectedId?edges.flatMap(chain=>{
    const premises=parsePremises(chain.premises);
    return premises.includes(selectedId)||chain.conclusion_id===selectedId?[{chain,premises}]:[];
  }):[];
  const sources=selected ? provenance.filter(item=>item.node_id===selected.id).map(item=>({sessionId:item.session_id,messageId:item.message_id})) : [];
  if(selected?.source_message_id && !sources.some(item=>item.messageId===selected.source_message_id)) {
    sources.unshift({sessionId:selected.source_session_id,messageId:selected.source_message_id});
  }
  const graph = useMemo(()=>{
    const visible = filterKnowledgeNodes(nodes,topicLinks,topicFilter,filter);
    const ids = new Set(visible.map(node=>node.id));
    const layout = new dagre.graphlib.Graph();
    layout.setGraph({rankdir:'TB',nodesep:28,ranksep:55});
    layout.setDefaultEdgeLabel(()=>({}));
    visible.forEach(node=>layout.setNode(node.id,{width:210,height:70}));
    const flowEdges:Edge[]=[];
    const related=new Set<string>([selectedId??'']);
    if(selectedId) for(const chain of edges) {
      const premises=parsePremises(chain.premises);
      if(premises.includes(selectedId)||chain.conclusion_id===selectedId) {
        related.add(chain.conclusion_id);premises.forEach(id=>related.add(id));
      }
    }
    for(const chain of edges) {
      const premises=parsePremises(chain.premises);
      const active=selectedId&&(premises.includes(selectedId)||chain.conclusion_id===selectedId);
      for(const premise of premises) if(ids.has(premise)&&ids.has(chain.conclusion_id)) {
        layout.setEdge(premise,chain.conclusion_id);
        flowEdges.push({id:`${chain.id}-${premise}`,source:premise,target:chain.conclusion_id,label:premises.length>1?'общая посылка':undefined,animated:false,style:selectedId?{stroke:active?'#b5c7b7':'#444',strokeWidth:active?2:1}:undefined});
      }
    }
    dagre.layout(layout);
    const flowNodes:Node[] = visible.map(node=>({id:node.id,position:{x:layout.node(node.id).x-105,y:layout.node(node.id).y-35},data:{label:<><small>{node.kind==='concept'?'ПОНЯТИЕ':'УТВЕРЖДЕНИЕ'}</small><strong>{node.name}</strong></>},className:`${node.kind==='concept'?'graph-concept':'graph-proposition'} ${selectedId?(related.has(node.id)?'graph-related':'graph-dimmed'):''}`}));
    return {flowNodes,flowEdges};
  },[nodes,edges,topicLinks,topicFilter,filter,selectedId]);

  return <div className="graph-page">
    <div className="section-head"><div><h1>Граф знаний</h1><p>Понятия, утверждения и связи из занятий. Наличие в графе не доказывает усвоение.</p></div><div className="graph-filters"><select aria-label="Фильтр по теме" value={topicFilter} onChange={event=>{setTopicFilter(event.target.value);setSelectedId(null)}}><option value="all">Все темы</option>{topics.map(topic=><option key={topic.id} value={topic.id}>{topic.title}</option>)}</select><input placeholder="Поиск по графу" aria-label="Поиск по графу" value={filter} onChange={event=>setFilter(event.target.value)}/></div></div>
    <div className="graph-frame">
      <ReactFlow nodes={graph.flowNodes} edges={graph.flowEdges} onNodeClick={(_,node)=>{const value=nodes.find(item=>item.id===node.id);setSelectedId(value?.id??null);setDraft({name:value?.name??'',statement:value?.statement??''})}} fitView><Background color="#262626" gap={24}/><Controls/>{graph.flowNodes.length>20&&<MiniMap bgColor="#1b1b1b" maskColor="#0008" nodeColor={node=>node.className?.includes('graph-concept')?'#777':'#a9bfac'}/>}</ReactFlow>
      {selected&&<aside className="graph-detail">
        <button className="icon-button" onClick={()=>setSelectedId(null)} aria-label="Закрыть детали">×</button>
        <small>{selected.kind==='concept'?'Понятие':'Утверждение'}</small>
        <input aria-label="Название" value={draft.name} onChange={event=>setDraft(value=>({...value,name:event.target.value}))}/>
        <textarea aria-label="Утверждение" value={draft.statement} onChange={event=>setDraft(value=>({...value,statement:event.target.value}))}/>
        <button className="button secondary" disabled={!draft.name.trim()||!draft.statement.trim()} onClick={()=>onSave({...selected,...draft})}>Сохранить</button>
        <button className="button ghost" onClick={()=>{onDelete(selected.id);setSelectedId(null)}}>Удалить</button>
        <p className="muted">Связи</p>
        {relations.length?relations.map(({chain,premises})=><div className="graph-relation" key={chain.id}><small>{chain.conclusion_id===selected.id?'ВЫВОД ИЗ':'ВЕДЁТ К'}</small><p>{(chain.conclusion_id===selected.id?premises:[chain.conclusion_id]).map(id=>nodes.find(node=>node.id===id)?.name??'Утверждение').join(' + ')}</p></div>):<div className="muted">Связей пока нет</div>}
        <p className="muted">Источники</p>
        {sources.length?sources.map((source,index)=>{
          const origin=messages.find(item=>item.id===source.messageId);
          const session=sessions.find(item=>item.id===source.sessionId);
          return <details className="graph-source" key={`${source.messageId}-${index}`}><summary>{session?.title??'Раннее занятие'} · {origin?.created_at.slice(0,10)??'дата неизвестна'}</summary>{origin?<Markdown>{origin.content}</Markdown>:<p className="muted">Исходное сообщение недоступно.</p>}{session&&<button className="text-button" onClick={()=>onOpenSession(session.id)}>Открыть занятие →</button>}</details>;
        }):selected.source_session_id?<button className="text-button" onClick={()=>onOpenSession(selected.source_session_id)}>Учебный план · открыть занятие →</button>:<p className="muted">Источник не указан.</p>}
      </aside>}
    </div>
  </div>;
}
