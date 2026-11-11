import { useEffect, useRef, useState } from 'react';
import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import type { Session } from '../lib/types';

export function SessionActions({session,busy,onRename,onDelete,onDeleteGoal}:{
  session:Session;
  busy:boolean;
  onRename:(session:Session,title:string)=>void;
  onDelete:(session:Session)=>void;
  onDeleteGoal:(goalId:string)=>void;
}) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const [above,setAbove]=useState(false);
  const [title,setTitle]=useState(session.title);
  const root=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!open) return;
    const closeOutside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){setOpen(false);setEditing(false)}};
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);setEditing(false)}};
    document.addEventListener('pointerdown',closeOutside);
    document.addEventListener('keydown',closeOnEscape);
    return ()=>{document.removeEventListener('pointerdown',closeOutside);document.removeEventListener('keydown',closeOnEscape)};
  },[open]);

  const rename=()=>{
    const value=title.trim();
    if(!value||value===session.title){setOpen(false);setEditing(false);return}
    onRename(session,value);
    setOpen(false);setEditing(false);
  };

  return <div className="session-actions" ref={root}>
    <button type="button" className="session-more" title="Действия с занятием" aria-label={`Действия с занятием «${session.title}»`} aria-expanded={open} onClick={()=>{setAbove((root.current?.getBoundingClientRect().bottom??0)>window.innerHeight-220);setOpen(value=>!value);setEditing(false);setTitle(session.title)}}><Ellipsis size={17}/></button>
    {open&&<div className={`session-menu ${above?'above':''}`} aria-label={`Действия с занятием «${session.title}»`}>
      {editing?<form onSubmit={event=>{event.preventDefault();rename()}}><label htmlFor={`session-title-${session.id}`}>Название занятия</label><input id={`session-title-${session.id}`} autoFocus maxLength={80} value={title} onChange={event=>setTitle(event.target.value)}/><div className="session-menu-footer"><button type="button" onClick={()=>setEditing(false)}>Отмена</button><button type="submit" disabled={busy||!title.trim()}>Сохранить</button></div></form>:<>
        <button type="button" disabled={busy} onClick={()=>{setEditing(true);setTitle(session.title)}}><Pencil size={14}/> Переименовать</button>
        <button type="button" className="danger" disabled={busy} onClick={()=>{setOpen(false);onDelete(session)}}><Trash2 size={14}/> Удалить только занятие</button>
        <button type="button" className="danger" disabled={busy} onClick={()=>{setOpen(false);onDeleteGoal(session.goal_id)}}><Trash2 size={14}/> Удалить цель и все данные</button>
      </>}
    </div>}
  </div>;
}
