import { Component, type ReactNode } from 'react';

type Props={children:ReactNode};
type State={error:string|null};

export class ErrorBoundary extends Component<Props,State> {
  state:State={error:null};

  static getDerivedStateFromError(error:unknown):State {
    return {error:error instanceof Error?error.message:String(error)};
  }

  render() {
    if(this.state.error) return <main className="fatal"><h1>Не удалось открыть экран</h1><p>{this.state.error}</p><button className="button secondary" onClick={()=>window.location.reload()}>Перезагрузить окно</button></main>;
    return this.props.children;
  }
}
