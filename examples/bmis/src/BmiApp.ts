import xs, {Stream} from 'xstream';
import isolate from '@cycle/isolate';
import {div, h1, hr, button, VNode, DOMSource} from '@cycle/dom';
import {StateSource, Lens} from 'cycle-onionify';
import BmiCounter, {State as BmiState, bmi, randomCounter} from './BmiCounter';

export type State = Array<BmiState & {key: number}>;

export type Reducer = (prev?: State) => State | undefined;

export type Sources = {
  DOM: DOMSource;
  onion: StateSource<State>;
};

export type Sinks = {
  DOM: Stream<VNode>;
  onion: Stream<Reducer>;
};

export type Actions = {
  add$: Stream<any>;
}

const N = 5000

function intent(domSource: DOMSource): Actions {
  return {
    add$: domSource.select('.add').events('click')
  };
}

function model(actions: Actions): Stream<Reducer> {
  const initReducer$ = xs.of(function initReducer(prev?: State): State {
    if (prev) {
      return prev;
    } else {
      const list = [];
      for (let i = 0; i < N; i++) {
        list.push({...randomCounter(), key: i});
      }
      return list;
    }
  });

  const addReducer$ = actions.add$
    .map(content => function addReducer(prevState: State): State {
      return [...prevState, {...randomCounter(), key: Date.now()}];
    });

  return xs.merge(initReducer$, addReducer$);
}

function view(bmiVnodes$: Stream<Array<VNode>>, state$: Stream<State>): Stream<VNode> {
  const avg$ = state$.map(counters => counters.reduce((acc, c) => acc + bmi(c), 0) / counters.length);
  return xs.combine(bmiVnodes$, avg$)
    .map(([bmiVNodes, avg]) =>
      div([
        h1(['BMI sliders (avg: ', avg.toFixed(3), ')']),
        button('.add', 'Add new counter'),
        hr([]),
        div(bmiVNodes)
      ])
    );
}

export default function BmiApp(sources: Sources): Sinks {
  const childSinks = sources.onion
    .asCollection(BmiCounter, sources)
    .pick({
      onion: 'merge',
      DOM: 'combine'
    });
  const actions = intent(sources.DOM);
  const parentReducer$ = model(actions);
  const reducer$ = xs.merge(
    parentReducer$,
    childSinks.onion
  );
  const vdom$ = view(childSinks.DOM, sources.onion.state$);
  return {
    DOM: vdom$,
    onion: reducer$,
  }
}
