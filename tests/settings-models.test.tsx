import {describe,expect,it} from 'vitest';
import React from 'react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {renderToStaticMarkup} from 'react-dom/server';
import {Settings} from '../src/app/App';
import type {Snapshot} from '../src/lib/types';

const snapshot={learning_goals:[],sessions:[],messages:[],diagnostic_answers:[],curricula:[],topics:[],exercises:[],attempts:[],knowledge_nodes:[],knowledge_edges:[],knowledge_topic_links:[],knowledge_provenance:[],workflow_executions:[],agent_executions:[],preferences:[]} as Snapshot;

describe('settings model picker',()=>{
  it('offers verified Sol, Terra and Luna for ChatGPT via Codex',()=>{
    const client=new QueryClient();
    const html=renderToStaticMarkup(<QueryClientProvider client={client}><Settings snapshot={snapshot} provider="codex" model="default" busy="" run={()=>{}} saveConfig={async()=>{}} refreshAuth={async()=>{}} savedDirectories="[]" savedOverrides="{}" savedServerUrl="" savedServerEtag=""/></QueryClientProvider>);
    expect(html).toContain('Выбор модели');
    for(const name of ['Авто','Sol','Terra','Luna']) expect(html).toContain(`<strong>${name}</strong>`);
  });
  it('offers direct server import separately from downloading a backup file',()=>{
    const client=new QueryClient();
    client.setQueryData(['sync-status','https://study.example.org'],{has_archive:true,etag:'"current"'});
    const html=renderToStaticMarkup(<QueryClientProvider client={client}><Settings snapshot={snapshot} provider="codex" model="default" busy="" run={()=>{}} saveConfig={async()=>{}} refreshAuth={async()=>{}} savedDirectories="[]" savedOverrides="{}" savedServerUrl="https://study.example.org" savedServerEtag=""/></QueryClientProvider>);
    expect(html).toContain('Скачать .ehb');
    expect(html).toContain('Скачать и развернуть данные');
    expect(html).toContain('Сначала скачайте и разверните её с паролем');
  });
});
