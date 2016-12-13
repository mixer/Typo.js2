export interface ISetupCommand {
    action: 'setup';
    affData: string;
    wordsData: string;
}
export interface ICheckCommand {
    action: 'check';
    word: string;
}
export interface ISuggestCommend {
    action: 'suggest';
    word: string;
    limit: number;
}
export declare type IProcCommand = ISetupCommand | ICheckCommand | ISuggestCommend;
export declare const prefixStr: string;
export declare const entryStr: string;
