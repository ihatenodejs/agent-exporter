import {Box, Text} from 'ink';
import {useState, useEffect} from 'react';

import type {ReactElement} from 'react';

export type ProviderStatus = 'pending' | 'syncing' | 'success' | 'error';

export interface ProviderSyncState {
  readonly name: string;
  readonly status: ProviderStatus;
  readonly messageCount?: number;
  readonly dataType?: 'messages' | 'usage entries';
  readonly error?: string;
  readonly errorStack?: string;
}

interface ProviderStatusRowProps {
  readonly state: ProviderSyncState;
  readonly verbose: boolean;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const Spinner = (): ReactElement => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color="cyan">{SPINNER_FRAMES[frame]}</Text>;
};

const StatusIcon = ({
  status,
}: {
  readonly status: ProviderStatus;
}): ReactElement => {
  switch (status) {
    case 'pending':
      return <Text color="gray">○</Text>;
    case 'syncing':
      return <Spinner />;
    case 'success':
      return <Text color="green">✓</Text>;
    case 'error':
      return <Text color="red">✗</Text>;
  }
};

const StatusMessage = ({
  state,
}: {
  readonly state: ProviderSyncState;
}): ReactElement => {
  switch (state.status) {
    case 'pending':
      return <Text color="gray">Waiting...</Text>;
    case 'syncing':
      return <Text color="cyan">Syncing...</Text>;
    case 'success': {
      const itemLabel =
        state.dataType === 'usage entries' ? 'usage entry' : 'message';
      const itemLabelPlural =
        state.dataType === 'usage entries' ? 'usage entries' : 'messages';

      if (state.messageCount === 0) {
        return <Text color="gray">No new {itemLabelPlural}</Text>;
      }
      return (
        <Text color="green">
          {state.messageCount}{' '}
          {state.messageCount === 1 ? itemLabel : itemLabelPlural} synced
        </Text>
      );
    }
    case 'error':
      return <Text color="red">Failed: {state.error}</Text>;
  }
};

export const ProviderStatusRow = ({
  state,
  verbose,
}: ProviderStatusRowProps): ReactElement => {
  return (
    <Box flexDirection="column">
      <Box>
        <Box width={3}>
          <StatusIcon status={state.status} />
        </Box>
        <Box width={12}>
          <Text>{state.name}</Text>
        </Box>
        <StatusMessage state={state} />
      </Box>
      {verbose && state.status === 'error' && state.errorStack && (
        <Box
          marginLeft={3}
          flexDirection="column"
        >
          <Text
            color="gray"
            dimColor
          >
            {state.errorStack
              .split('\n')
              .slice(0, 5)
              .map((line) => line.trim())
              .join('\n    ')}
          </Text>
        </Box>
      )}
    </Box>
  );
};
