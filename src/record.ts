import { Map } from 'immutable';

export class Record<T extends {}>
{
    constructor(private map : Map<string, any> = Map<string, any>()) { }

    public set<K extends keyof T>(key : K, value : T[K]) : Record<T>
    {
        return new Record<T>(this.map.set(key, value));
    }

    public get<K extends keyof T>(key : K) : T[K]
    {
        return this.map.get(key);
    }
}


