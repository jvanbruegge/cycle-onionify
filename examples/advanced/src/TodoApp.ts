import xs, {Stream} from 'xstream';
import isolate from '@cycle/isolate';
import {div, span, input, button, ul, VNode, DOMSource} from '@cycle/dom';
import {StateSource} from 'cycle-onionify';
import Item, {Sources as ItemSources, State as ItemState} from './Item';

export interface State {
  list: Array<ItemState>;
}

export type Reducer = (prev?: State) => State | undefined;

export type Sources = {
  DOM: DOMSource;
  onion: StateSource<State>;
}

export type Sinks = {
  DOM: Stream<VNode>;
  onion: Stream<Reducer>;
}

export type Actions = {
  add$: Stream<string>,
}

function intent(domSource: DOMSource): Actions {
  return {
    add$: domSource.select('.input').events('input')
      .map(inputEv => domSource.select('.add').events('click').mapTo(inputEv))
      .flatten()
      .map(inputEv => (inputEv.target as HTMLInputElement).value),
  };
}

function model(actions: Actions): Stream<Reducer> {
  const initReducer$ = xs.of(function initReducer(prev?: State): State {
    return {
      list: [],
    };
  });

  const addReducer$ = actions.add$
    .map(content => function addReducer(prevState: State): State {
      return {
        list: prevState.list.concat({content, key: Date.now()}),
      };
    });

  return xs.merge(initReducer$, addReducer$);
}

function view(listVNodes$: Stream<Array<VNode>>): Stream<VNode> {
  return listVNodes$.map(ul).map(ulVNode =>
    div([
      span('New task:'),
      input('.input', {attrs: {type: 'text'}}),
      button('.add', 'Add'),
      ulVNode
    ])
  );
}

export default function TodoApp(sources: Sources): Sinks {
  const listSinks = sources.onion
    .select('list')
    .asCollection(Item, sources)
    .pick({
      onion: 'merge',
      DOM: 'combine'
    });
  const action$ = intent(sources.DOM);
  const parentReducer$ = model(action$);
  const listReducer$ = listSinks.onion as any as Stream<Reducer>;
  const reducer$ = xs.merge(parentReducer$, listReducer$);
  const vdom$ = view(listSinks.DOM);

  return {
    DOM: vdom$,
    onion: reducer$,
  }
}
