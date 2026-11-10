import { useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Edge, type Node } from '@xyflow/react';
import dagre from 'dagre';
import type { KnowledgeEdge, KnowledgeNode, Session } from '../../lib/types';

export function Graph({nodes,edges,sessions,provenance,onSave,onDelete}:{nodes:KnowledgeNode[];edges:KnowledgeEdge[];sessions:Session[];provenance:{node_id:string;session_id:string;message_id:string}[];onSave:(node:KnowledgeNode)=>void;onDelete:(id:string)=>void}) {
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [draft,setDraft] = useState({name:'',statement:''});
  const [filter,setFilter] = useState('');
  const selected=nodes.find(n=>n.id===selectedId);
  const relations=selectedId?edges.flatMap(chain=>{const premises:string[]=JSON.parse(chain.premises);return premises.includes(selectedId)||chain.conclusion_id===selectedId?[{chain,premises}]:[]}):[];
  const graph = useMemo(()=>{
    const visible = nodes.filter(n=>`${n.name} ${n.statement}`.toLowerCase().includes(filter.toLowerCase()));
    const ids = new Set(visible.map(n=>n.id));
    const layout = new dagre.graphlib.Graph(); layout.setGraph({rankdir:'LR',nodesep:36,ranksep:130}); layout.setDefaultEdgeLabel(()=>({}));
    visible.forEach(n=>layout.setNode(n.id,{width:210,height:70}));
    const flowEdges:Edge[]=[];
    const related=new Set<string>([selectedId??'']);
    if(selectedId) for(const chain of edges) { const premises:string[]=JSON.parse(chain.premises);if(premises.includes(selectedId)||chain.conclusion_id===selectedId) { related.add(chain.conclusion_id);premises.forEach(id=>related.add(id)); } }
    for(const chain of edges) { const premises:string[] = JSON.parse(chain.premises); const active=selectedId&&(premises.includes(selectedId)||chain.conclusion_id===selectedId); for(const premise of premises) if(ids.has(premise)&&ids.has(chain.conclusion_id)) { layout.setEdge(premise,chain.conclusion_id); flowEdges.push({id:`${chain.id}-${premise}`,source:premise,target:chain.conclusion_id,label:premises.length>1?'общая посылка':undefined,animated:false,style:selectedId?{stroke:active?'#b5c7b7':'#444',strokeWidth:active?2:1}:undefined}); } }
    dagre.layout(layout);
    const flowNodes:Node[] = visible.map(n=>({id:n.id,position:{x:layout.node(n.id).x-105,y:layout.node(n.id).y-35},data:{label:<><small>{n.kind==='concept'?'ПОНЯТИЕ':'УТВЕРЖДЕНИЕ'}</small><strong>{n.name}</strong></>},className:`${n.kind==='concept'?'graph-concept':'graph-proposition'} ${selectedId?(related.has(n.id)?'graph-related':'graph-dimmed'):''}`}));
    return {flowNodes,flowEdges};
  },[nodes,edges,filter,selectedId]);
  return <div className="graph-page"><div className="section-head"><div><h1>Граф знаний</h1><p>Понятия, утверждения и связи из занятий. Наличие в графе не доказывает усвоение.</p></div><input placeholder="Поиск по графу" value={filter} onChange={e=>setFilter(e.target.value)}/></div><div className="graph-frame"><ReactFlow nodes={graph.flowNodes} edges={graph.flowEdges} onNodeClick={(_,n)=>{const value=nodes.find(v=>v.id===n.id);setSelectedId(value?.id??null);setDraft({name:value?.name??'',statement:value?.statement??''})}} fitView><Background color="#262626" gap={24}/><Controls/><MiniMap/></ReactFlow>{selected&&<aside className="graph-detail"><button className="icon-button" onClick={()=>setSelectedId(null)}>×</button><small>{selected.kind==='concept'?'Понятие':'Утверждение'}</small><input aria-label="Название" value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/><textarea aria-label="Утверждение" value={draft.statement} onChange={e=>setDraft(v=>({...v,statement:e.target.value}))}/><button className="button secondary" disabled={!draft.name.trim()||!draft.statement.trim()} onClick={()=>onSave({...selected,...draft})}>Сохранить</button><button className="button ghost" onClick={()=>{onDelete(selected.id);setSelectedId(null)}}>Удалить</button><p className="muted">Связи</p>{relations.length?relations.map(({chain,premises})=><div className="graph-relation" key={chain.id}><small>{chain.conclusion_id===selected.id?'ВЫВОД ИЗ':'ВЕДЁТ К'}</small><p>{(chain.conclusion_id===selected.id?premises:[chain.conclusion_id]).map(id=>nodes.find(n=>n.id===id)?.name??'Утверждение').join(' + ')}</p></div>):<div className="muted">Связей пока нет</div>}<p className="muted">Источники</p>{provenance.filter(p=>p.node_id===selected.id).map((p,i)=><div className="muted" key={i}>{sessions.find(s=>s.id===p.session_id)?.title??'Раннее занятие'} · {p.message_id.slice(0,8)}</div>)}{selected.source_session_id&&!provenance.some(p=>p.node_id===selected.id)&&<div className="muted">{sessions.find(s=>s.id===selected.source_session_id)?.title??'Учебное занятие'} · учебный план</div>}</aside>}</div></div>;
}
