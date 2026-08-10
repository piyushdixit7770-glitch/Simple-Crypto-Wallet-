/**
 * WalletDashboard.tsx — Displays on-chain wallet state
 *
 * Reads public ledger data from the Midnight indexer.
 * Private data (ownerSecret, pin) never appears here.
 */
import { useEffect } from 'react';
import type { WalletContractState } from '../hooks/useWalletContract';

interface Props {
  contractState: WalletContractState | null;
  contractAddress: string;
  isLoading: boolean;
  onRefresh: () => void;
}

export function WalletDashboard({ contractState, contractAddress, isLoading, onRefresh }: Props) {
  useEffect(() => {
    if (contractAddress) onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress]);

  if (!contractAddress) {
    return (
      <div className="dashboard-empty" role="status">
        <h2>Wallet Dashboard</h2>
        <p className="muted">
          No contract deployed yet. Run{' '}
          <code>npm run deploy -- --network preview</code> and set{' '}
          <code>VITE_CONTRACT_ADDRESS</code> in <code>frontend/.env.local</code>.
        </p>
      </div>
    );
  }

  return (
    <section className="dashboard-card" aria-label="Wallet Dashboard">
      <div className="dashboard-header">
        <h2>Wallet Dashboard</h2>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onRefresh}
          disabled={isLoading}
          type="button"
          aria-label="Refresh wallet state"
        >
          {isLoading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Public on-chain state — all data here is intentionally visible */}
      {contractState ? (
        <div className="state-grid" aria-live="polite">
          <StateRow
            label="Registered"
            value={contractState.isRegistered ? '✅ Yes' : '❌ No'}
          />
          <StateRow
            label="Wallet Label"
            value={contractState.walletLabel || '(not set)'}
            highlight
          />
          <StateRow
            label="Total Deposited"
            value={`${contractState.totalDeposited.toLocaleString()} tNight`}
          />
          <StateRow
            label="Transfer Count"
            value={contractState.transferCount.toString()}
          />
          <StateRow
            label="Last TX Hash"
            value={contractState.lastTxHash || '(none)'}
            mono
          />
          <StateRow
            label="Contract Address"
            value={contractAddress}
            mono
            small
          />
        </div>
      ) : (
        <p className="muted" role="status">
          {isLoading ? 'Loading wallet state from indexer…' : 'No on-chain state found. Register your wallet first.'}
        </p>
      )}

      <div className="privacy-badge" role="note">
        <span>🔒</span>
        <span>
          <strong>Privacy:</strong> Owner secret and PIN are proved with zero-knowledge — they
          never appear here, in the indexer, or on-chain.
        </span>
      </div>
    </section>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

interface StateRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
  small?: boolean;
}

function StateRow({ label, value, highlight, mono, small }: StateRowProps) {
  return (
    <div className={`state-row ${highlight ? 'state-row--highlight' : ''}`}>
      <span className="state-label">{label}</span>
      <span className={`state-value ${mono ? 'mono' : ''} ${small ? 'text-sm' : ''}`}>
        {value}
      </span>
    </div>
  );
}
