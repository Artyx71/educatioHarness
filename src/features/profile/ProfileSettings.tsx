import {useEffect,useState} from 'react';
import type {Snapshot} from '../../lib/types';
import {api} from '../../lib/api';
import {activitySummary,normalizeProfileName} from './activity';

export function ProfileSettings({savedName,snapshot,busy,run}:{savedName:string;snapshot:Snapshot;busy:string;run:(label:string,fn:()=>Promise<unknown>)=>void}) {
  const [name,setName]=useState(savedName);
  useEffect(()=>setName(savedName),[savedName]);
  const activity=activitySummary(snapshot);
  return <div className="panel profile-settings">
    <h2>Локальный профиль</h2>
    <p>Имя и история хранятся на этом устройстве и входят в защищённый архив. Это не отдельный аккаунт на сервере.</p>
    <label>Как к вам обращаться<input value={name} maxLength={80} onChange={event=>setName(event.target.value)} placeholder="Ваше имя"/></label>
    <button className="button secondary" disabled={!!busy||!name.trim()||name===savedName} onClick={()=>run('Сохранение профиля',()=>api.save('preferences',{key:'profile_name',value:normalizeProfileName(name)}))}>Сохранить имя</button>
    <div className="profile-stats"><div><strong>{activity.streak}</strong><span>дней подряд</span></div><div><strong>{activity.totalDays}</strong><span>активных дней</span></div><div><strong>{snapshot.sessions.length}</strong><span>занятий</span></div><div><strong>{snapshot.attempts.length}</strong><span>ответов</span></div></div>
  </div>;
}
