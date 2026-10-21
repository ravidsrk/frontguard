import type { PipelineStage, Reporter, RunResult } from '../core/types.js';

/** Fan reporter events out while waiting for asynchronous completion work. */
export class CompositeReporter implements Reporter {
  constructor(private readonly reporters: Reporter[]) {}

  onStageStart(stage: PipelineStage, detail?: string): void {
    for (const rp of this.reporters) rp.onStageStart(stage, detail);
  }

  onStageProgress(stage: PipelineStage, current: number, total: number, detail?: string): void {
    for (const rp of this.reporters) {
      rp.onStageProgress(stage, current, total, detail);
    }
  }

  onStageComplete(stage: PipelineStage, detail?: string): void {
    for (const rp of this.reporters) rp.onStageComplete(stage, detail);
  }

  onError(error: Error): void {
    for (const rp of this.reporters) rp.onError(error);
  }

  async onComplete(result: RunResult): Promise<void> {
    await Promise.all(this.reporters.map((rp) => rp.onComplete(result)));
  }
}
