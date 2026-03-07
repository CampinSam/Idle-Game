import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../../store';
import { useWalletConnect } from '../../hooks/useWalletConnect';
import { api } from '../../services/api';
import './Profile.css';

type Tab = 'account' | 'wallets';

const CHAIN_LABELS: Record<string, string> = {
  ETH: 'Ethereum',
  BASE: 'Base',
  MATIC: 'Polygon',
  CARDANO: 'Cardano',
};

const CHAIN_COLORS: Record<string, string> = {
  ETH: '#627EEA',
  BASE: '#0052FF',
  MATIC: '#8247E5',
  CARDANO: '#0033AD',
};

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>('account');
  const player = useAppSelector((s) => s.auth.player);
  const token = useAppSelector((s) => s.auth.token);

  const [wallets, setWallets] = useState<any[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletOpError, setWalletOpError] = useState<string | null>(null);

  const {
    connecting,
    error: connectError,
    detectedCardanoWallets,
    hasEvm,
    linkEvm,
    linkCardano,
    clearError: clearConnectError,
  } = useWalletConnect();

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const list = await api.getLinkedWallets();
      setWallets(list);
    } catch (err: any) {
      setWalletOpError(err?.message || 'Failed to load wallets');
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'wallets') loadWallets();
  }, [tab, loadWallets]);

  const handleRemove = async (id: string) => {
    setWalletOpError(null);
    try {
      await api.removeLinkedWallet(id);
      await loadWallets();
    } catch (err: any) {
      setWalletOpError(err?.message || 'Failed to remove wallet');
    }
  };

  const handleSetPrimary = async (id: string) => {
    setWalletOpError(null);
    try {
      await api.setWalletPrimary(id);
      await loadWallets();
    } catch (err: any) {
      setWalletOpError(err?.message || 'Failed to update wallet');
    }
  };

  const handleLinkEvm = async () => {
    clearConnectError();
    setWalletOpError(null);
    if (!token) return;
    const ok = await linkEvm(token);
    if (ok) await loadWallets();
  };

  const handleLinkCardano = async (walletKey: string) => {
    clearConnectError();
    setWalletOpError(null);
    if (!token) return;
    const ok = await linkCardano(walletKey, token);
    if (ok) await loadWallets();
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1 className="profile-title">Profile</h1>
      </div>

      <div className="profile-tabs">
        <button
          className={`profile-tab ${tab === 'account' ? 'active' : ''}`}
          onClick={() => setTab('account')}
        >
          Account
        </button>
        <button
          className={`profile-tab ${tab === 'wallets' ? 'active' : ''}`}
          onClick={() => setTab('wallets')}
        >
          Wallets
        </button>
      </div>

      {tab === 'account' && (
        <div className="profile-card">
          <div className="profile-field">
            <span className="profile-field-label">Username</span>
            <span className="profile-field-value">{player?.username || '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Email</span>
            <span className="profile-field-value">{player?.email || '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Keeper Level</span>
            <span className="profile-field-value profile-highlight">{player?.keeperLevel ?? '—'}</span>
          </div>
          <div className="profile-field">
            <span className="profile-field-label">Member Since</span>
            <span className="profile-field-value">
              {player?.createdAt ? new Date(player.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
            </span>
          </div>
        </div>
      )}

      {tab === 'wallets' && (
        <div className="profile-wallets">
          {(walletOpError || connectError) && (
            <div className="profile-error">{walletOpError || connectError}</div>
          )}

          {walletsLoading ? (
            <div className="profile-loading">Loading wallets...</div>
          ) : (
            <>
              {wallets.length === 0 ? (
                <div className="profile-empty">No wallets linked to this account.</div>
              ) : (
                <div className="wallet-list">
                  {wallets.map((w) => (
                    <div key={w.id} className="wallet-item">
                      <div className="wallet-item-left">
                        <span
                          className="wallet-chain-badge"
                          style={{ background: CHAIN_COLORS[w.chain] || '#555' }}
                        >
                          {CHAIN_LABELS[w.chain] || w.chain}
                        </span>
                        <span className="wallet-address" title={w.address}>
                          {truncateAddress(w.address)}
                        </span>
                        {w.isPrimary && <span className="wallet-primary-badge">Primary</span>}
                      </div>
                      <div className="wallet-item-actions">
                        {!w.isPrimary && (
                          <button
                            className="wallet-action-btn wallet-action-primary"
                            onClick={() => handleSetPrimary(w.id)}
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          className="wallet-action-btn wallet-action-remove"
                          onClick={() => handleRemove(w.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(hasEvm || detectedCardanoWallets.length > 0) && (
                <div className="wallet-add-section">
                  <h3 className="wallet-add-title">Add a wallet</h3>
                  <div className="wallet-btn-group">
                    {hasEvm && (
                      <button
                        className="wallet-btn wallet-btn-evm"
                        onClick={handleLinkEvm}
                        disabled={connecting}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1" y="4" width="22" height="16" rx="2"/>
                          <line x1="1" y1="10" x2="23" y2="10"/>
                        </svg>
                        {connecting ? 'Connecting...' : 'Add EVM Wallet'}
                      </button>
                    )}
                    {detectedCardanoWallets.map((cw) => (
                      <button
                        key={cw.key}
                        className="wallet-btn wallet-btn-cardano"
                        onClick={() => handleLinkCardano(cw.key)}
                        disabled={connecting}
                      >
                        {cw.icon ? (
                          <img src={cw.icon} alt={cw.name} width="16" height="16" style={{ borderRadius: 3 }} />
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                          </svg>
                        )}
                        {connecting ? 'Connecting...' : `Add ${cw.name}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
