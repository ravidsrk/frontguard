/**
 * Minimal ambient declaration for the optional `@axe-core/playwright`
 * dependency. The real package provides full types; this stub lets the CLI
 * type-check without the optional dep installed. At runtime it's imported
 * dynamically and degrades gracefully when missing.
 */
declare module '@axe-core/playwright' {
  interface AxeResults {
    violations: Array<{
      id: string;
      impact?: string | null;
      description: string;
      help: string;
      helpUrl: string;
      nodes: Array<{ target?: unknown; failureSummary?: string; html?: string }>;
    }>;
    passes?: unknown[];
    incomplete?: unknown[];
  }

   
  export default class AxeBuilder {
    constructor(args: { page: any });
    withRules(rules: string[]): this;
    disableRules(rules: string[]): this;
    analyze(): Promise<AxeResults>;
  }
}
