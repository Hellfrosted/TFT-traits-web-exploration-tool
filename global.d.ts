declare type LooseRecord = Record<string, any>;

interface ObjectConstructor {
    entries(value: any): [string, any][];
    values(value: any): any[];
}
