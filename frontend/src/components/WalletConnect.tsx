/**
 * WalletConnect.tsx — Connect / disconnect the Midnight wallet
 *
 * Shows: connect button, network badge (Preview), address, error states
 * (wallet not installed, rejected, network mismatch).
 */
import type { WalletState } from '../hooks/useMidnight';

interface Props {
  walletState: WalletState;
  expectedNetwork: string;
  networkMismatch: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onClearError: () => void;
}

export function WalletConnect({
  walletState,
  expectedNetwork,
  networkMismatch,
  onConnect,
  onDisconnect,
  onClearError,
}: Props) {
  const isConnected = walletState.status === 'connected';
  const isConnecting = walletState.status === 'connecting';

  return (
    <div className="wallet-connect-card">
      {/* Network badge — always visible */}
      <div className="network-badge">
        <span className="network-dot" aria-hidden="true" />
        <span>{expectedNetwork.toUpperCase()} Network</span>
      </div>

      {/* Connected state */}
      {isConnected && (
        <div className="wallet-connected" role="status">
          <div className="wallet-status-row">
            <span className="status-icon" aria-hidden="true">✅</span>
            <span className="wallet-name">
              {(walletState as Extract<WalletState, { status: 'connected' }>).walletName}
            </span>
          </div>
          <p className="wallet-address" title="Your unshielded address">
            <span className="address-label">Address: </span>
            <code className="address-value">
              {truncateAddress(
                (walletState as Extract<WalletState, { status: 'connected' }>).address,
              )}
            </code>
          </p>
          <button
            className="btn btn-secondary"
            onClick={onDisconnect}
            type="button"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Idle / disconnected state */}
      {walletState.status === 'idle' && (
        <div className="wallet-idle">
          <p className="wallet-prompt">Connect your Midnight wallet to get started</p>
          <button
            className="btn btn-primary"
            onClick={onConnect}
            type="button"
          >
            Connect Wallet
          </button>
        </div>
      )}

      {/* Connecting state */}
      {isConnecting && (
        <div className="wallet-connecting" role="status" aria-busy="true">
          <div className="spinner" aria-hidden="true" />
          <p>Connecting to wallet…</p>
        </div>
      )}

      {/* Error state */}
      {walletState.status === 'error' && (
        <div
          className={`wallet-error ${networkMismatch ? 'wallet-error--mismatch' : ''}`}
          role="alert"
          aria-live="assertive"
        >
          <p className="error-message">
            {(walletState as Extract<WalletState, { status: 'error' }>).message}
          </p>
          <div className="error-actions">
            {networkMismatch ? (
              <p className="error-hint">
                Open your Midnight wallet and switch to the <strong>{expectedNetwork}</strong> network.
              </p>
            ) : (
              <a
                href="https://docs.midnight.network/getting-started/installation"
                target="_blank"
                rel="noreferrer noopener"
                className="link"
              >
                Install Midnight wallet →
              </a>
            )}
            <button
              className="btn btn-ghost"
              onClick={onClearError}
              type="button"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function truncateAddress(addr: string): string {
  if (addr.length <= 20) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}
