import type { PipelineStage, Reporter, RunResult } from '../core/types.js';

/** Fan reporter events out while waiting for asynchronous completion work. */
export class CompositeReporter implements Reporter {
  constructor(private readonly reporters: Reporter[]) {}

  onStageStart(stage: PipelineStage, detail?: string): void {
    for (const reporter of this.reporters) reporter.onStageStart(stage, detail);
  }

  onStageProgress(stage: PipelineStage, current: number, total: number, detail?: string): void {
    for (const reporter of this.reporters) {
      reporter.onStageProgress(stage, current, total, detail);
    }
  }

  onStageComplete(stage: PipelineStage, detail?: string): void {
    for (const reporter of this.reporters) reporter.onStageComplete(stage, detail);
  }

  onError(error: Error): void {
    for (const reporter of this.reporters) reporter.onError(error);
  }

  async onComplete(result: RunResult): Promise<void> {
    await Promise.all(this.reporters.map((reporter) => reporter.onComplete(result)));
  }
}
