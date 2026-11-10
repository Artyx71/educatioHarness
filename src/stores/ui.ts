import { create } from 'zustand';
type Page = 'dashboard'|'learn'|'graph'|'practice'|'history'|'settings';
type UiState = { page:Page; goalId:string|null; sessionId:string|null; topicId:string|null; setPage:(page:Page)=>void; setGoal:(goalId:string|null)=>void; setSession:(sessionId:string|null)=>void; setTopic:(topicId:string|null)=>void };
export const useUi = create<UiState>(set=>({page:'dashboard',goalId:null,sessionId:null,topicId:null,setPage:page=>set({page}),setGoal:goalId=>set({goalId}),setSession:sessionId=>set({sessionId}),setTopic:topicId=>set({topicId})}));
