// Minimal ambient typings for Chrome's built-in Prompt API (`LanguageModel`),
// available in extension background service workers and extension pages
// (Chrome 138+). Only the surface we use is declared.

export {};

declare global {
  interface LanguageModelMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  interface LanguageModelExpected {
    type?: 'text' | 'image' | 'audio';
    languages?: string[];
  }

  interface LanguageModelPromptOptions {
    responseConstraint?: unknown;
    omitResponseConstraintInput?: boolean;
    outputLanguage?: string;
  }

  interface LanguageModelSession {
    prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
    destroy(): void;
  }

  interface LanguageModelCreateOptions {
    initialPrompts?: LanguageModelMessage[];
    monitor?: (m: EventTarget) => void;
    temperature?: number;
    topK?: number;
    expectedInputs?: LanguageModelExpected[];
    expectedOutputs?: LanguageModelExpected[];
  }

  interface LanguageModelAvailabilityOptions {
    expectedInputs?: LanguageModelExpected[];
    expectedOutputs?: LanguageModelExpected[];
  }

  // Declared as always-present; guard runtime absence with `typeof` (background
  // wraps calls in try/catch, popup checks `typeof LanguageModel`).
  const LanguageModel: {
    availability(options?: LanguageModelAvailabilityOptions): Promise<string>;
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
    params(): Promise<{
      defaultTopK: number;
      maxTopK: number;
      defaultTemperature: number;
      maxTemperature: number;
    }>;
  };
}
