import type { Snapshot } from '../../lib/types';

const dayKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export function activitySummary(snapshot:Snapshot,today=new Date()) {
  const timestamps=[
    ...snapshot.sessions.map(item=>item.created_at),
    ...snapshot.messages.filter(item=>item.role==='user').map(item=>item.created_at),
    ...snapshot.attempts.map(item=>item.created_at),
  ];
  const days=new Set(timestamps.map(value=>new Date(value)).filter(date=>!Number.isNaN(date.getTime())).map(dayKey));
  const current=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  if(!days.has(dayKey(current))) current.setDate(current.getDate()-1);
  let streak=0;
  while(days.has(dayKey(current))) {streak++;current.setDate(current.getDate()-1)}
  return {days,streak,totalDays:days.size};
}

export function normalizeProfileName(raw:string) {
  const name=raw.trim().replace(/\s+/g,' ');
  if(!name||Array.from(name).length>40||/[\p{Cc}\p{Cf}]/u.test(name)) throw new Error('Укажите имя длиной от 1 до 40 символов без управляющих знаков');
  return name;
}
