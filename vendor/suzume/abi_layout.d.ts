export declare const C_LAYOUTS: {
    readonly result: {
        readonly size: 16;
        readonly morphemes: 0;
        readonly count: 4;
        readonly normalizedText: 8;
        readonly normalizedTextSize: 12;
    };
    readonly morpheme: {
        readonly size: 36;
        readonly surface: 0;
        readonly baseForm: 4;
        readonly start: 8;
        readonly end: 12;
        readonly score: 16;
        readonly pos: 20;
        readonly extendedPos: 21;
        readonly conjugationType: 22;
        readonly conjugationForm: 23;
        readonly flags: 24;
        readonly surfaceSize: 28;
        readonly baseFormSize: 32;
    };
    readonly tags: {
        readonly size: 12;
        readonly tags: 0;
        readonly pos: 4;
        readonly count: 8;
    };
    readonly tagOptions: {
        readonly size: 20;
        readonly posFilter: 0;
        readonly excludeBasic: 1;
        readonly useLemma: 2;
        readonly minLength: 4;
        readonly maxTags: 8;
        readonly excludeParticles: 12;
        readonly excludeAuxiliaries: 13;
        readonly excludeFormalNouns: 14;
        readonly excludeLowInfo: 15;
        readonly removeDuplicates: 16;
    };
    readonly extendedOptions: {
        readonly size: 20;
        readonly preserveVu: 0;
        readonly preserveCase: 1;
        readonly preserveSymbols: 2;
        readonly mode: 3;
        readonly lemmatize: 4;
        readonly mergeCompounds: 5;
        readonly skipUserDictionary: 6;
        readonly skipCoreDictionary: 7;
        readonly reportScorerConfig: 8;
        readonly skipEnvConfig: 9;
        readonly scorerOptionsJson: 12;
        readonly dataDirectory: 16;
    };
};
