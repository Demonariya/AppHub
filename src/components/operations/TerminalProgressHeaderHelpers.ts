import { OperationPhase } from '../../types';
export {
  OperationStatus,
  formatDurationMs,
  formatExitCode,
  formatByteRatio,
  formatPhaseLabel,
} from './OperationStatus';

export function isTerminalPhaseLabel(phase?: OperationPhase | string): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'cancelled';
}
