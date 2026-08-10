/**
 * useMidnight.ts — DApp Connector API hook
 *
 * Discovers window.midnight wallets, connects to the Preview network,
 * validates network match, reads the unshielded address, and handles
 * disconnect / error states.
 *
 * PRIVACY: this hook never reads, stores, or logs private keys, seeds,
 * or any secret material. It only interacts with the public-facing
 * DApp Connector API exposed by the browser wallet extension.
 */
import { useState, useEffect, useCallback } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type WalletState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string; walletName: string }
  | { status: 'error'; message: string };

export type NetworkId = 'preview' | 'preprod' | 'undeployed';

// The DApp Connector API shape exposed by Midnight wallet extensions
interface MidnightWalletApi {
  apiVersion?: string;
  name?: string;
  enable: () => Promise<EnabledWalletApi>;
  isEnabled: () => Promise<boolean>;
}

interface EnabledWalletApi {
  state: () => Promise<WalletStateData>;
  // additional methods available; we only use what we need
}

interface WalletStateData {
  networkId?: string;
  unshielded?: {
    coinPublicKey?: string;
    address?: string;
  };
  address?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EXPECTED_NETWORK: NetworkId =
  (import.meta.env.VITE_NETWORK as NetworkId) || 'preview';

/**
 * Discover all Midnight wallet providers installed in the browser.
 * Uses Object.values(window.midnight) — never hardcodes wallet names.
 */
function discoverWallets(): Array<{ name: string; api: MidnightWalletApi }> {
  const w = window as unknown as { midnight?: Record<string, MidnightWalletApi> };
  if (!w.midnight || typeof w.midnight !== 'object') return [];
  return Object.entries(w.midnight)
    .filter(([, v]) => v && typeof v.enable === 'function')
    .map(([name, api]) => ({ name, api }));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMidnight() {
  const [walletState, setWalletState] = useState<WalletState>({ status: 'idle' });
  const [enabledApi, setEnabledApi] = useState<EnabledWalletApi | null>(null);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  // Clear transient error after 8 seconds
  useEffect(() => {
    if (walletState.status === 'error') {
      const t = setTimeout(() => setWalletState({ status: 'idle' }), 8000);
      return () => clearTimeout(t);
    }
  }, [walletState]);

  const connect = useCallback(async () => {
    setWalletState({ status: 'connecting' });
    setNetworkMismatch(false);

    // Wait a tick for wallet extensions to inject window.midnight
    await new Promise((r) => setTimeout(r, 100));

    const wallets = discoverWallets();
    if (wallets.length === 0) {
      setWalletState({
        status: 'error',
        message:
          'No Midnight wallet found. Please install the Midnight Lace wallet extension.',
      });
      return;
    }

    // Use the first discovered wallet
    const { name, api } = wallets[0];

    try {
      const enabled = await api.enable();
      setEnabledApi(enabled);

      const state = await enabled.state();

      // Validate network
      const connectedNetwork = state.networkId ?? '';
      if (connectedNetwork && connectedNetwork !== EXPECTED_NETWORK) {
        setNetworkMismatch(true);
        setWalletState({
          status: 'error',
          message: `Network mismatch: wallet is on "${connectedNetwork}", but this dApp requires "${EXPECTED_NETWORK}". Please switch your wallet to the ${EXPECTED_NETWORK} network.`,
        });
        return;
      }

      // Extract unshielded address
      const address =
        state.unshielded?.address ??
        state.address ??
        state.unshielded?.coinPublicKey ??
        'Address unavailable';

      setWalletState({ status: 'connected', address, walletName: name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('user reject') || msg.toLowerCase().includes('declined')) {
        setWalletState({ status: 'error', message: 'Connection rejected by user.' });
      } else {
        setWalletState({ status: 'error', message: `Failed to connect: ${msg}` });
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setEnabledApi(null);
    setNetworkMismatch(false);
    setWalletState({ status: 'idle' });
  }, []);

  const clearError = useCallback(() => {
    if (walletState.status === 'error') {
      setWalletState({ status: 'idle' });
    }
  }, [walletState]);

  return {
    walletState,
    enabledApi,
    networkMismatch,
    expectedNetwork: EXPECTED_NETWORK,
    connect,
    disconnect,
    clearError,
  };
}
