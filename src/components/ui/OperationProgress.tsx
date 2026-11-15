import React from 'react';
import { OperationPhase, TaskStatus } from '../../types';
import { OperationProgressBar } from '../operations';

interface OperationProgressProps {
  status: TaskStatus;
  progress: number;
  isIndeterminate?: boolean;
  bytesDownloaded?: number;
  totalBytes?: number;
  downloadSpeed?: string;
  statusMessage?: string;
}

export const OperationProgress: React.FC<OperationProgressProps> = ({
  status,
  progress,
  isIndeterminate,
  bytesDownloaded,
  totalBytes,
  downloadSpeed,
  statusMessage,
}) => {
  return (
    <OperationProgressBar
      phase={status as OperationPhase}
      progress={progress}
      isIndeterminate={isIndeterminate}
      bytesDownloaded={bytesDownloaded}
      totalBytes={totalBytes}
      downloadSpeed={downloadSpeed}
      statusMessage={statusMessage}
    />
  );
};
