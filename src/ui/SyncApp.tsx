import {Box, Text, useApp} from 'ink';
import {useState, useEffect, useCallback} from 'react';

import {ProviderStatusRow} from './ProviderStatusRow';
import {
  getCleanErrorMessage,
  getErrorStack,
  handleProviderError,
} from '../core/error-utils';

import type {ProviderSyncState} from './ProviderStatusRow';
import type {ProviderAdapter, UnifiedMessage, UsageEntry} from '../core/types';
import type {DatabaseManager} from '../database/manager';
import type {ReactElement} from 'react';

/**
 * Determines if an error indicates a provider is not installed
 * and returns an appropriate user-friendly message
 */
const getInstallationErrorMessage = (
  providerName: string,
  error: unknown,
): string | null => {
  const userMessage = handleProviderError(
    providerName,
    'sync operation',
    error,
  );

  if (userMessage.includes('failed for')) {
    return null;
  }

  return userMessage;
};

interface SyncAppProps {
  readonly adapters: ProviderAdapter[];
  readonly dbManager: DatabaseManager;
  readonly verbose: boolean;
  readonly recalculateCosts: boolean;
  readonly transformUsageEntriesToMessages: (
    adapter: {name: string},
    usageEntries: UsageEntry[],
  ) => UnifiedMessage[];
}

type SyncPhase = 'syncing' | 'recalculating' | 'complete';

export const SyncApp = ({
  adapters,
  dbManager,
  verbose,
  recalculateCosts,
  transformUsageEntriesToMessages,
}: SyncAppProps): ReactElement => {
  const {exit} = useApp();

  const [providerStates, setProviderStates] = useState<ProviderSyncState[]>(
    adapters.map((adapter) => ({
      name: adapter.name,
      status: 'pending',
      dataType: adapter.dataType,
    })),
  );
  const [phase, setPhase] = useState<SyncPhase>('syncing');
  const [recalculatedCount, setRecalculatedCount] = useState<number | null>(
    null,
  );
  const [hasStarted, setHasStarted] = useState(false);

  const updateProviderState = useCallback(
    (providerName: string, updates: Partial<ProviderSyncState>) => {
      setProviderStates((prev) =>
        prev.map((p) => (p.name === providerName ? {...p, ...updates} : p)),
      );
    },
    [],
  );

  const syncProvider = useCallback(
    async (adapter: ProviderAdapter): Promise<void> => {
      updateProviderState(adapter.name, {status: 'syncing'});

      try {
        let messages: UnifiedMessage[];
        let itemCount: number;

        if (adapter.dataType === 'usage entries') {
          const usageEntries = await adapter.fetchUsageEntries();
          messages = transformUsageEntriesToMessages(adapter, usageEntries);
          itemCount = usageEntries.length;
        } else {
          messages = await adapter.fetchMessages();
          itemCount = messages.length;
        }

        if (messages.length > 0) {
          dbManager.insertMessages(messages);
          const lastMessage = messages[messages.length - 1];
          dbManager.updateSyncState(adapter.name, Date.now(), lastMessage.id);
        }

        updateProviderState(adapter.name, {
          status: 'success',
          messageCount: itemCount,
        });
      } catch (error: unknown) {
        const installationError = getInstallationErrorMessage(
          adapter.name,
          error,
        );
        const displayError = installationError ?? getCleanErrorMessage(error);

        updateProviderState(adapter.name, {
          status: 'error',
          error: displayError,
          errorStack: getErrorStack(error),
        });
      }
    },
    [dbManager, transformUsageEntriesToMessages, updateProviderState],
  );

  useEffect(() => {
    if (hasStarted) return;
    setHasStarted(true);

    const runSync = async (): Promise<void> => {
      await Promise.all(adapters.map((adapter) => syncProvider(adapter)));

      setPhase('recalculating');
      const updated = dbManager.recalculateCosts(recalculateCosts);
      setRecalculatedCount(updated);

      setPhase('complete');
    };

    runSync().catch(() => {
      setPhase('complete');
    });
  }, [adapters, syncProvider, dbManager, recalculateCosts, hasStarted]);

  useEffect(() => {
    if (phase === 'complete') {
      const successCount = providerStates.filter(
        (p) => p.status === 'success',
      ).length;
      const failureCount = providerStates.filter(
        (p) => p.status === 'error',
      ).length;

      dbManager.close();

      const exitCode = successCount > 0 || failureCount === 0 ? 0 : 1;
      exit(new Error(exitCode.toString()));
    }
  }, [phase, providerStates, dbManager, exit]);

  const successCount = providerStates.filter(
    (p) => p.status === 'success',
  ).length;
  const failureCount = providerStates.filter(
    (p) => p.status === 'error',
  ).length;
  const totalMessages = providerStates
    .filter((p) => p.status === 'success')
    .reduce((sum, p) => sum + (p.messageCount ?? 0), 0);

  const hasErrors = failureCount > 0;

  return (
    <Box
      flexDirection="column"
      paddingTop={1}
    >
      <Box marginBottom={1}>
        <Text bold>
          {phase === 'complete' ? 'Sync complete' : 'Syncing providers...'}
        </Text>
      </Box>

      <Box
        flexDirection="column"
        marginLeft={2}
      >
        {providerStates.map((state) => (
          <ProviderStatusRow
            key={state.name}
            state={state}
            verbose={verbose}
          />
        ))}
      </Box>

      {phase === 'recalculating' && (
        <Box
          marginTop={1}
          marginLeft={2}
        >
          <Text color="cyan">Recalculating costs...</Text>
        </Box>
      )}

      {phase === 'complete' && recalculatedCount !== null && (
        <Box
          marginTop={1}
          marginLeft={2}
        >
          <Text color="green">✓</Text>
          <Text>
            {' '}
            {recalculateCosts
              ? `Recalculated costs for ${recalculatedCount} messages`
              : recalculatedCount > 0
                ? `Updated costs for ${recalculatedCount} messages`
                : 'All messages already have costs'}
          </Text>
        </Box>
      )}

      {phase === 'complete' && (
        <Box
          marginTop={1}
          flexDirection="column"
        >
          <Box>
            <Text bold>Summary: </Text>
            <Text color="green">
              {successCount} succeeded ({totalMessages} messages)
            </Text>
            {failureCount > 0 && (
              <>
                <Text>, </Text>
                <Text color="red">{failureCount} failed</Text>
              </>
            )}
          </Box>
          {hasErrors && !verbose && (
            <Box marginTop={1}>
              <Text color="gray">Use --verbose to see error details.</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
