/**
 * WalletActions.tsx — Main feature component for calling wallet circuits
 *
 * Covers: registerWallet, recordDeposit, authorizeTransfer, addTransactionRecord
 *
 * PRIVACY CONTRACT (enforced in this component):
 *   • Private fields (owner secret, PIN) use type="password" — browser never
 *     autofills them into normal text fields
 *   • They are passed directly to the hook — NEVER stored in component state
 *     beyond the input field's own uncontrolled value
 *   • The privacy badge is shown on every action that uses a private witness
 *   • No secret value is ever rendered into JSX or logged to the console
 */
import React, { useState, useRef, useCallback } from 'react';
import type { ContractCallStatus } from '../hooks/useWalletContract';

interface Props {
  isWalletConnected: boolean;
  callStatus: ContractCallStatus;
  onRegister: (label: string, initialTxRef: string, ownerSecret: string) => Promise<void>;
  onDeposit: (amount: bigint, txHash: string) => Promise<void>;
  onTransfer: (amount: bigint, dest: string, ownerSecret: string, pin: string) => Promise<void>;
  onAddRecord: (txHash: string, direction: string) => Promise<void>;
  onClearStatus: () => void;
}

type ActivePanel = 'register' | 'deposit' | 'transfer' | 'record' | null;

export function WalletActions({
  isWalletConnected,
  callStatus,
  onRegister,
  onDeposit,
  onTransfer,
  onAddRecord,
  onClearStatus,
}: Props) {
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  const isPending = callStatus.status === 'pending';

  function openPanel(p: ActivePanel) {
    onClearStatus();
    setActivePanel(p);
  }

  if (!isWalletConnected) {
    return (
      <div className="actions-locked" role="status">
        <p>Connect your wallet to interact with the contract.</p>
      </div>
    );
  }

  return (
    <section className="actions-card" aria-label="Wallet Actions">
      <h2>Wallet Actions</h2>

      {/* Action selector buttons */}
      <div className="action-tabs" role="tablist">
        <TabButton
          label="📝 Register"
          active={activePanel === 'register'}
          onClick={() => openPanel(activePanel === 'register' ? null : 'register')}
          disabled={isPending}
        />
        <TabButton
          label="⬇️ Deposit"
          active={activePanel === 'deposit'}
          onClick={() => openPanel(activePanel === 'deposit' ? null : 'deposit')}
          disabled={isPending}
        />
        <TabButton
          label="⬆️ Transfer 🔒"
          active={activePanel === 'transfer'}
          onClick={() => openPanel(activePanel === 'transfer' ? null : 'transfer')}
          disabled={isPending}
        />
        <TabButton
          label="📋 Record TX"
          active={activePanel === 'record'}
          onClick={() => openPanel(activePanel === 'record' ? null : 'record')}
          disabled={isPending}
        />
      </div>

      {/* Panels */}
      {activePanel === 'register' && (
        <RegisterPanel onSubmit={onRegister} disabled={isPending} />
      )}
      {activePanel === 'deposit' && (
        <DepositPanel onSubmit={onDeposit} disabled={isPending} />
      )}
      {activePanel === 'transfer' && (
        <TransferPanel onSubmit={onTransfer} disabled={isPending} />
      )}
      {activePanel === 'record' && (
        <RecordPanel onSubmit={onAddRecord} disabled={isPending} />
      )}

      {/* Call status display */}
      <CallStatusDisplay status={callStatus} onDismiss={onClearStatus} />
    </section>
  );
}

// ─── Register Panel ────────────────────────────────────────────────────────────

function RegisterPanel({
  onSubmit,
  disabled,
}: {
  onSubmit: (label: string, initialTxRef: string, ownerSecret: string) => Promise<void>;
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  const [initRef, setInitRef] = useState('genesis');
  // ownerSecret is intentionally NOT in state — only in the ref/input element
  const ownerSecretRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const secret = ownerSecretRef.current?.value ?? '';
      if (!label.trim() || !secret) return;
      // Pass secret directly — never assigned to React state
      await onSubmit(label.trim(), initRef.trim() || 'genesis', secret);
      // Clear the secret field after submission
      if (ownerSecretRef.current) ownerSecretRef.current.value = '';
    },
    [label, initRef, onSubmit],
  );

  return (
    <form className="action-panel" onSubmit={handleSubmit} aria-label="Register Wallet">
      <h3>Register Wallet</h3>
      <PrivacyBadge text="Owner secret: proved without revealing" />

      <label className="field">
        <span>Wallet Label <span className="badge badge--public">public</span></span>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. My Midnight Wallet"
          required
          disabled={disabled}
          aria-label="Wallet label (public, stored on-chain)"
        />
      </label>

      <label className="field">
        <span>Initial TX Reference <span className="badge badge--public">public</span></span>
        <input
          type="text"
          value={initRef}
          onChange={(e) => setInitRef(e.target.value)}
          placeholder="genesis"
          disabled={disabled}
          aria-label="Initial transaction reference"
        />
      </label>

      <label className="field">
        <span>
          Owner Secret <span className="badge badge--private">🔒 private</span>
        </span>
        <input
          ref={ownerSecretRef}
          type="password"
          placeholder="Your private owner secret (never stored)"
          required
          disabled={disabled}
          autoComplete="new-password"
          aria-label="Owner secret — private, never logged or stored"
          aria-describedby="owner-secret-hint"
        />
        <small id="owner-secret-hint" className="field-hint">
          Used only for ZK proof generation — never sent to chain as plaintext.
        </small>
      </label>

      <button className="btn btn-primary" type="submit" disabled={disabled || !label}>
        Register Wallet
      </button>
    </form>
  );
}

// ─── Deposit Panel ─────────────────────────────────────────────────────────────

function DepositPanel({
  onSubmit,
  disabled,
}: {
  onSubmit: (amount: bigint, txHash: string) => Promise<void>;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const n = BigInt(amount.trim() || '0');
      if (n <= 0n || !txHash.trim()) return;
      await onSubmit(n, txHash.trim());
      setAmount('');
      setTxHash('');
    },
    [amount, txHash, onSubmit],
  );

  return (
    <form className="action-panel" onSubmit={handleSubmit} aria-label="Record Deposit">
      <h3>Record Deposit</h3>
      <p className="panel-note">Deposit amount and TX reference are public on-chain.</p>

      <label className="field">
        <span>Amount (tNight) <span className="badge badge--public">public</span></span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 1000000"
          min="1"
          required
          disabled={disabled}
          aria-label="Deposit amount in tNight"
        />
      </label>

      <label className="field">
        <span>TX Hash / Reference <span className="badge badge--public">public</span></span>
        <input
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="e.g. 0xabc123..."
          required
          disabled={disabled}
          aria-label="Transaction hash or reference"
        />
      </label>

      <button className="btn btn-primary" type="submit" disabled={disabled || !amount}>
        Record Deposit
      </button>
    </form>
  );
}

// ─── Transfer Panel ────────────────────────────────────────────────────────────

function TransferPanel({
  onSubmit,
  disabled,
}: {
  onSubmit: (amount: bigint, dest: string, ownerSecret: string, pin: string) => Promise<void>;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState('');
  // Secrets intentionally NOT in React state
  const ownerSecretRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const n = BigInt(amount.trim() || '0');
      const secret = ownerSecretRef.current?.value ?? '';
      const pin = pinRef.current?.value ?? '';
      if (n <= 0n || !dest.trim() || !secret || !pin) return;
      // Secrets passed directly — never assigned to React state
      await onSubmit(n, dest.trim(), secret, pin);
      // Clear secret fields after use
      if (ownerSecretRef.current) ownerSecretRef.current.value = '';
      if (pinRef.current) pinRef.current.value = '';
      setAmount('');
      setDest('');
    },
    [amount, dest, onSubmit],
  );

  return (
    <form className="action-panel" onSubmit={handleSubmit} aria-label="Authorize Transfer">
      <h3>Authorize Transfer</h3>
      <PrivacyBadge text="Owner secret + PIN: proved without revealing" />

      <label className="field">
        <span>Amount (tNight) <span className="badge badge--public">public</span></span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500000"
          min="1"
          required
          disabled={disabled}
          aria-label="Transfer amount in tNight"
        />
      </label>

      <label className="field">
        <span>Destination Label <span className="badge badge--public">public</span></span>
        <input
          type="text"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          placeholder="e.g. recipient-wallet-label"
          required
          disabled={disabled}
          aria-label="Destination label (public, visible on-chain)"
        />
      </label>

      <label className="field">
        <span>
          Owner Secret <span className="badge badge--private">🔒 private</span>
        </span>
        <input
          ref={ownerSecretRef}
          type="password"
          placeholder="Your private owner secret"
          required
          disabled={disabled}
          autoComplete="current-password"
          aria-label="Owner secret — private, never stored"
          aria-describedby="transfer-secret-hint"
        />
        <small id="transfer-secret-hint" className="field-hint">
          Must match the secret used during registration.
        </small>
      </label>

      <label className="field">
        <span>
          Authorization PIN <span className="badge badge--private">🔒 private</span>
        </span>
        <input
          ref={pinRef}
          type="password"
          placeholder="Your authorization PIN"
          required
          disabled={disabled}
          autoComplete="new-password"
          aria-label="Authorization PIN — private, never stored"
          aria-describedby="pin-hint"
        />
        <small id="pin-hint" className="field-hint">
          Must differ from your owner secret.
        </small>
      </label>

      <button className="btn btn-primary" type="submit" disabled={disabled || !amount || !dest}>
        Authorize Transfer
      </button>
    </form>
  );
}

// ─── Record Panel ──────────────────────────────────────────────────────────────

function RecordPanel({
  onSubmit,
  disabled,
}: {
  onSubmit: (txHash: string, direction: string) => Promise<void>;
  disabled: boolean;
}) {
  const [txHash, setTxHash] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!txHash.trim()) return;
      await onSubmit(txHash.trim(), direction);
      setTxHash('');
    },
    [txHash, direction, onSubmit],
  );

  return (
    <form className="action-panel" onSubmit={handleSubmit} aria-label="Add Transaction Record">
      <h3>Add Transaction Record</h3>
      <p className="panel-note">TX hash and direction are public on-chain (audit trail).</p>

      <label className="field">
        <span>TX Hash <span className="badge badge--public">public</span></span>
        <input
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="e.g. 0xdeadbeef..."
          required
          disabled={disabled}
          aria-label="Transaction hash"
        />
      </label>

      <fieldset className="field" disabled={disabled}>
        <legend>Direction <span className="badge badge--public">public</span></legend>
        <label className="radio-label">
          <input
            type="radio"
            name="direction"
            value="in"
            checked={direction === 'in'}
            onChange={() => setDirection('in')}
          />
          Incoming (in)
        </label>
        <label className="radio-label">
          <input
            type="radio"
            name="direction"
            value="out"
            checked={direction === 'out'}
            onChange={() => setDirection('out')}
          />
          Outgoing (out)
        </label>
      </fieldset>

      <button className="btn btn-primary" type="submit" disabled={disabled || !txHash}>
        Add Record
      </button>
    </form>
  );
}

// ─── Call Status Display ───────────────────────────────────────────────────────

function CallStatusDisplay({
  status,
  onDismiss,
}: {
  status: ContractCallStatus;
  onDismiss: () => void;
}) {
  if (status.status === 'idle') return null;

  return (
    <div
      className={`call-status call-status--${status.status}`}
      role={status.status === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {status.status === 'pending' && (
        <>
          <div className="spinner spinner--sm" aria-hidden="true" />
          <p>{status.message}</p>
          <p className="privacy-note">🔒 Generating ZK proof — private inputs never leave your browser.</p>
        </>
      )}
      {status.status === 'success' && (
        <>
          <p>✅ {status.message}</p>
          <p className="tx-id">TX: <code>{status.txId}</code></p>
          <p className="privacy-note">🔒 Proved without revealing your input</p>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss} type="button">
            Dismiss
          </button>
        </>
      )}
      {status.status === 'error' && (
        <>
          <p>❌ {status.message}</p>
          <button className="btn btn-ghost btn-sm" onClick={onDismiss} type="button">
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ─────────────────────────────────────────────────────

function PrivacyBadge({ text }: { text: string }) {
  return (
    <div className="privacy-badge privacy-badge--form" role="note" aria-label="Privacy notice">
      <span aria-hidden="true">🔒</span>
      <span>{text}</span>
    </div>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function TabButton({ label, active, onClick, disabled }: TabButtonProps) {
  return (
    <button
      className={`tab-btn ${active ? 'tab-btn--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      type="button"
      role="tab"
      aria-selected={active}
    >
      {label}
    </button>
  );
}
