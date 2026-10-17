/**
 * Suzume - Lightweight Japanese morphological analyzer
 *
 * @example
 * ```typescript
 * import { Suzume } from 'suzume';
 *
 * const suzume = await Suzume.create();
 * const result = suzume.analyze('すもももももももものうち');
 * console.log(result);
 * ```
 */
export declare enum ErrorCode {
    Success = 0,
    InvalidUtf8 = 1,
    DictionaryLoadFailed = 2,
    FileNotFound = 3,
    Parse = 4,
    OutOfMemory = 5,
    InvalidInput = 6,
    Internal = 7
}
export declare class SuzumeError extends Error {
    readonly code: ErrorCode;
    constructor(message: string, code?: ErrorCode);
}
/**
 * Options for creating a Suzume instance
 */
export interface SuzumeOptions {
    /** Create an isolated WASM runtime instead of sharing the cached module, default: false */
    freshWasmModule?: boolean;
    /** Preserve ヴ (don't normalize to ビ etc.), default: true */
    preserveVu?: boolean;
    /** Preserve case (don't lowercase ASCII), default: true */
    preserveCase?: boolean;
    /** Preserve symbols/emoji in output, default: false */
    preserveSymbols?: boolean;
    /** Analysis mode, default: normal */
    mode?: 'normal' | 'search' | 'split';
    /** Retain corrected lemmas; conjugation/POS annotations are always computed. Default: true */
    lemmatize?: boolean;
    /** Merge consecutive noun compounds, default: false */
    mergeCompounds?: boolean;
    /** Skip automatic loading of the bundled user dictionary, default: false */
    skipUserDictionary?: boolean;
    /** Skip automatic loading of the bundled core dictionary, default: false */
    skipCoreDictionary?: boolean;
    /** Ignore native scorer configuration environment variables, default: false */
    skipEnvConfig?: boolean;
    /** Add scorer configuration diagnostics to dictionaryWarnings, default: false */
    reportScorerConfig?: boolean;
    /** Final-priority scorer override JSON, or an object serialized to JSON */
    scorerOptions?: string | Record<string, unknown>;
}
type AnalysisMode = NonNullable<SuzumeOptions['mode']>;
/**
 * Morpheme - A single unit of morphological analysis
 */
export interface Morpheme {
    /** Surface form (as it appears in the text) */
    surface: string;
    /** Part of speech (English) */
    pos: string;
    /** Base/dictionary form */
    baseForm: string;
    /** Part of speech (Japanese) */
    posJa: string;
    /** Conjugation type (Japanese, e.g., "一段", "五段・カ行") - null for non-conjugating words */
    conjType: string | null;
    /** Conjugation form (Japanese, e.g., "連用形", "終止形") - null for non-conjugating words */
    conjForm: string | null;
    /** Stable extended POS code (e.g., "VERB_連用", "AUX_過去") */
    extendedPos: string;
    /** Start Unicode code-point offset in normalized text */
    start: number;
    /** End Unicode code-point offset in normalized text */
    end: number;
    /** Start JavaScript UTF-16 offset, suitable for normalizedText.slice() */
    startUtf16: number;
    /** End JavaScript UTF-16 offset, suitable for normalizedText.slice() */
    endUtf16: number;
    /** True if matched from a user dictionary */
    isUserDict: boolean;
    /** True if the morpheme is a formal noun */
    isFormalNoun: boolean;
    /** True if the morpheme is low information for tag generation */
    isLowInfo: boolean;
    /** True if generated as an unknown word */
    isUnknown: boolean;
    /** True if matched from any dictionary */
    isFromDictionary: boolean;
    /** Candidate score/cost */
    score: number;
}
/** Normalized input together with its morphemes. */
export interface AnalysisResult {
    normalizedText: string;
    morphemes: Morpheme[];
}
/**
 * Tag entry with POS information
 */
export interface Tag {
    /** Tag text (surface or lemma) */
    tag: string;
    /** Part of speech (English) */
    pos: string;
}
/**
 * Options for tag generation
 */
export type TagPosFilterName = 'noun' | 'verb' | 'adjective' | 'adverb' | 'particle' | 'auxiliary';
export interface TagOptions {
    /**
     * POS categories to include. An empty array includes all filterable POS,
     * matching the native `pos_filter = 0` default.
     */
    posFilter?: readonly TagPosFilterName[];
    /**
     * Deprecated alias for `posFilter`. When both are present, `posFilter` wins.
     *
     * @deprecated Use `posFilter` instead.
     */
    pos?: readonly TagPosFilterName[];
    /** Exclude basic/common words with hiragana-only lemma (default: false) */
    excludeBasic?: boolean;
    /** Use lemma instead of surface form (default: true) */
    useLemma?: boolean;
    /** Minimum tag length in characters (default: 2) */
    minLength?: number;
    /** Maximum number of tags, 0 for unlimited (default: 0) */
    maxTags?: number;
    /** Exclude particles (default: true) */
    excludeParticles?: boolean;
    /** Exclude auxiliaries (default: true) */
    excludeAuxiliaries?: boolean;
    /** Exclude formal nouns (default: true) */
    excludeFormalNouns?: boolean;
    /** Exclude low information words (default: true) */
    excludeLowInfo?: boolean;
    /** Remove duplicate tags (default: true) */
    removeDuplicates?: boolean;
}
/**
 * Suzume instance for Japanese morphological analysis.
 *
 * Error contract note: under the WebAssembly build, a memory-allocation failure
 * aborts the module rather than returning NULL, so the C++ allocation-failure
 * path (which maps to a NULL return and a thrown Error on native/Python) is
 * effectively unreachable here.
 */
export declare class Suzume {
    private module;
    private handle;
    private cleanupRef;
    private _analyzeN;
    private _setMode;
    private _mode;
    private _resultFree;
    private _generateTagsN;
    private _generateTagsWithOptionsN;
    private _tagsFree;
    private _loadUserDictCount;
    private _loadBinaryDict;
    private _clearUserDictionaries;
    private _hasCoreDictionary;
    private _version;
    private _lastError;
    private _lastErrorCode;
    private _conjugationTypeLabel;
    private _extendedPosLabel;
    private _conjugationFormLabel;
    private _posLabel;
    private readonly _posLabels;
    private readonly _conjugationTypeLabels;
    private readonly _conjugationFormLabels;
    private readonly _extendedPosLabels;
    private _dictionaryWarningCount;
    private _dictionaryWarning;
    private layouts;
    private unregisterToken;
    private constructor();
    /**
     * Create a new Suzume instance
     *
     * @param options - Optional configuration options
     * @returns Promise resolving to Suzume instance
     */
    static create(options?: SuzumeOptions & {
        wasmPath?: string;
    }): Promise<Suzume>;
    /**
     * Analyze Japanese text into morphemes
     *
     * @param text - UTF-8 encoded Japanese text
     * @returns Array of morphemes
     */
    analyze(text: string): Morpheme[];
    /** Current analysis mode for this instance. */
    get mode(): AnalysisMode;
    /** Change analysis mode without reloading dictionaries. */
    set mode(value: AnalysisMode);
    /**
     * Analyze text and return the exact normalized text used for offsets.
     */
    analyzeWithNormalizedText(text: string): AnalysisResult;
    /**
     * Generate tags from Japanese text
     *
     * @param text - UTF-8 encoded Japanese text
     * @param options - Optional tag generation options
     * @returns Array of tag entries with POS information
     */
    generateTags(text: string, options?: TagOptions): Tag[];
    /**
     * Load user dictionary from string data
     *
     * @param data - Dictionary data in current TSV format (legacy CSV is also accepted)
     * @returns true on success
     */
    loadUserDictionary(data: string): boolean;
    /**
     * Load user dictionary and return the number of installed expanded entries.
     */
    loadUserDictionaryCount(data: string): number;
    /**
     * Load user dictionary from string data, throwing with C API details on failure.
     *
     * @param data - Dictionary data in current TSV format (legacy CSV is also accepted)
     */
    loadUserDictionaryOrThrow(data: string): void;
    /**
     * Load binary dictionary from buffer data (as user dictionary)
     *
     * @param data - Binary dictionary data (.dic format)
     * @returns true on success
     */
    loadBinaryDictionary(data: Uint8Array): boolean;
    /**
     * Load binary dictionary from buffer data, throwing with C API details on failure.
     *
     * @param data - Binary dictionary data (.dic format)
     */
    loadBinaryDictionaryOrThrow(data: Uint8Array): void;
    /**
     * Remove caller-loaded dictionaries while retaining the bundled user dictionary.
     */
    clearUserDictionaries(): void;
    /**
     * Get Suzume version string
     */
    get version(): string;
    /**
     * Last C API error for this thread, or empty string if the last C API call succeeded.
     */
    get lastError(): string;
    /** Stable native error category for the last failed C ABI call. */
    get lastErrorCode(): ErrorCode;
    /** Current WebAssembly linear-memory size in bytes. */
    wasmMemoryBytes(): number;
    /** Dictionary-loading, parsing, and scorer-configuration diagnostics. */
    get dictionaryWarnings(): string[];
    /** Whether the bundled L2 core dictionary is loaded. */
    get hasCoreDictionary(): boolean;
    /**
     * Destroy this analyzer handle. The shared WASM runtime remains cached for
     * other and future Suzume instances.
     */
    destroy(): void;
    private ensureAlive;
    private withUtf8String;
    private consumeTags;
    private conjugationTypeLabel;
    private parseResult;
    private parseTags;
    private posLabel;
    private conjugationFormLabel;
    private extendedPosLabel;
}
export default Suzume;
/** Return the package version without creating an analyzer handle. */
export declare function version(options?: {
    wasmPath?: string;
    freshWasmModule?: boolean;
}): Promise<string>;
