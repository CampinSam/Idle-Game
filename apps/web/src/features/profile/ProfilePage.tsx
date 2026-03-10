import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../../store';
import { useWalletConnect } from '../../hooks/useWalletConnect';
import { api } from '../../services/api';
import './Profile.css';

type Tab = 'account' | 'wallets' | 'nft';

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

function truncateId(id: string): string {
  if (!id || id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function getInitials(username?: string | null, email?: string | null): string {
  const name = username || email || '?';
  return name.slice(0, 2).toUpperCase();
}

export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>('account');
  const player = useAppSelector((s) => s.auth.player);
  const token = useAppSelector((s) => s.auth.token);

  const [wallets, setWallets] = useState<any[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletOpError, setWalletOpError] = useState<string | null>(null);

  const [nftEntities, setNftEntities] = useState<any[]>([]);
  const [nftLoading, setNftLoading] = useState(false);
  const [nftSyncing, setNftSyncing] = useState(false);
  const [nftError, setNftError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ claimed: number; alreadyClaimed: number } | null>(null);

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

  const loadNftEntities = useCallback(async () => {
    setNftLoading(true);
    setNftError(null);
    try {
      const list = await api.getNftEntities();
      setNftEntities(list);
    } catch (err: any) {
      setNftError(err?.message || 'Failed to load NFT entities');
    } finally {
      setNftLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'wallets') loadWallets();
    if (tab === 'nft') loadNftEntities();
  }, [tab, loadWallets, loadNftEntities]);

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

  const handleSyncNfts = async () => {
    setNftSyncing(true);
    setNftError(null);
    setSyncResult(null);
    try {
      const result = await api.syncNftCollections();
      setSyncResult({ claimed: result.claimed, alreadyClaimed: result.alreadyClaimed });
      if (result.claimed > 0) await loadNftEntities();
    } catch (err: any) {
      setNftError(err?.message || 'Sync failed');
    } finally {
      setNftSyncing(false);
    }
  };

  const memberSince = player?.createdAt
    ? new Date(player.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="profile-page page-transition-wrapper">
      <div className="profile-wrapper-card">

        <div className="profile-banner">
          <div className="profile-avatar">
            {getInitials(player?.username, player?.email)}
          </div>
          <div className="profile-banner-info">
            <div className="profile-username">{player?.username || player?.email || 'Keeper'}</div>
            <div className="profile-banner-meta">
              {player?.keeperLevel != null && (
                <span className="profile-keeper-badge">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                  Lv {player.keeperLevel}
                </span>
              )}
              {memberSince && (
                <span className="profile-since">Since {memberSince}</span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-tab-strip">
          <button className={`profile-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>
            Account
          </button>
          <button className={`profile-tab ${tab === 'wallets' ? 'active' : ''}`} onClick={() => setTab('wallets')}>
            Wallets
          </button>
          <button className={`profile-tab ${tab === 'nft' ? 'active' : ''}`} onClick={() => setTab('nft')}>
            NFT Entities
          </button>
        </div>

        <div className="profile-tab-content">

          {tab === 'account' && (
            <>
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
                <span className="profile-field-value">{memberSince || '—'}</span>
              </div>
            </>
          )}

          {tab === 'wallets' && (
            <>
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
                            <span className="wallet-chain-badge" style={{ background: CHAIN_COLORS[w.chain] || '#555' }}>
                              {CHAIN_LABELS[w.chain] || w.chain}
                            </span>
                            <span className="wallet-address" title={w.address}>
                              {truncateAddress(w.address)}
                            </span>
                            {w.isPrimary && <span className="wallet-primary-badge">Primary</span>}
                          </div>
                          <div className="wallet-item-actions">
                            {!w.isPrimary && (
                              <button className="wallet-action-btn wallet-action-primary" onClick={() => handleSetPrimary(w.id)}>
                                Set Primary
                              </button>
                            )}
                            <button className="wallet-action-btn wallet-action-remove" onClick={() => handleRemove(w.id)}>
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
                          <button className="wallet-btn wallet-btn-evm" onClick={handleLinkEvm} disabled={connecting}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="4" width="22" height="16" rx="2"/>
                              <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                            {connecting ? 'Connecting...' : 'Add EVM Wallet'}
                          </button>
                        )}
                        {detectedCardanoWallets.map((cw) => (
                          <button key={cw.key} className="wallet-btn wallet-btn-cardano" onClick={() => handleLinkCardano(cw.key)} disabled={connecting}>
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
            </>
          )}

          {tab === 'nft' && (
            <>
              <div className="nft-sync-bar">
                <span className="nft-sync-label">Scan linked wallets for NFT entities</span>
                <button className="nft-sync-btn" onClick={handleSyncNfts} disabled={nftSyncing || nftLoading}>
                  {nftSyncing ? 'Syncing...' : 'Sync NFTs'}
                </button>
              </div>

              {syncResult && (
                <div className={`nft-sync-result ${syncResult.claimed > 0 ? 'nft-sync-result-new' : 'nft-sync-result-ok'}`}>
                  {syncResult.claimed > 0
                    ? `${syncResult.claimed} new ${syncResult.claimed === 1 ? 'entity' : 'entities'} discovered!`
                    : 'All up to date — no new NFTs found.'}
                  {syncResult.alreadyClaimed > 0 && ` (${syncResult.alreadyClaimed} already claimed)`}
                </div>
              )}

              {nftError && <div className="profile-error">{nftError}</div>}

              {nftLoading ? (
                <div className="profile-loading">Loading NFT entities...</div>
              ) : nftEntities.length === 0 ? (
                <div className="profile-empty">
                  <div className="nft-empty-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                      <path d="M2 17l10 5 10-5"/>
                      <path d="M2 12l10 5 10-5"/>
                    </svg>
                  </div>
                  <p>No NFT entities yet.</p>
                  <p className="nft-empty-hint">Link wallets and sync to discover entities from registered NFT collections.</p>
                </div>
              ) : (
                <div className="nft-entity-list">
                  {nftEntities.map((e) => (
                    <div key={e.id} className="nft-entity-item">
                      <div className="nft-entity-header">
                        <span className="wallet-chain-badge" style={{ background: CHAIN_COLORS[e.chain] || '#555' }}>
                          {CHAIN_LABELS[e.chain] || e.chain || '?'}
                        </span>
                        {e.collectionName && (
                          <span className="nft-collection-name">{e.collectionName}</span>
                        )}
                      </div>
                      <div className="nft-entity-body">
                        <div className="nft-entity-name">{(e.display as any)?.name || 'Unnamed Entity'}</div>
                        <div className="nft-entity-meta">
                          <span className="nft-entity-level">Lv {(e.progression as any)?.level ?? 1}</span>
                          <span className="nft-token-id" title={e.assetId}>#{truncateId(e.assetId || '')}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
