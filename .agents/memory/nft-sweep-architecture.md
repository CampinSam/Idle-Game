---
name: NFT sweep architecture
description: Entity-centric NFT ownership sweep design — why the per-user sweep was replaced and how the new system works.
---

# NFT Sweep Architecture

## The rule
The nightly NFT ownership sweep iterates NftAsset rows (per-entity), not User rows (per-user). Login reconciliation is DB-only (no chain RPC). `syncUserCollections` is reserved for full chain syncs (first wallet link, new account onboarding).

**Why:** The per-user sweep hit a production incident where Blockfrost returned empty-200 for `getOwnedAssets` calls. Because `allWalletsSucceeded` stayed `true` on an empty result, reconciliation ran and unclaimed all entities for affected users. Empty-200 and "genuinely zero NFTs" are indistinguishable with the per-wallet query pattern.

## How it works

### Entity-centric sweep (NftModule timer, every 24h)
- `entityCentricOwnershipSweep()` in `NftCollectionService` iterates all `NftAsset` rows with `chain='CARDANO'` in batches of 50
- Per asset: calls `NftOwnershipService.getAssetOwner(chain, policyId, tokenName)` — routes to `CardanoOwnershipProvider.getAssetHolders` which throws on any HTTP error
- On throw: logs a warn and skips the asset (ownership unchanged)
- On success: updates `NftAsset.ownerAddress` + `lastSyncedAt`, resolves userId via LinkedWallet, updates Entity/LocationInstance.ownerUserId if changed, pushes playerDelta to affected users
- EVM assets throw "not yet supported" → silently skipped

### Login reconciliation (DB-only)
- `claimFromCachedOwnership(userId)` — queries NftAsset rows where `ownerAddress` IN user's linked wallet addresses
- No chain RPC; relies on `ownerAddress` populated by the entity sweep
- Claims/transfers existing Entity/LocationInstance rows, pushes delta
- Called from `auth.service.ts` login (email + SIWE) instead of the old `lazySyncOnLogin`

### Full chain sync (wallet linking)
- `syncUserCollections(userId)` still exists for first-time wallet link and new account onboarding
- Uses `getOwnedInCollectionStrict` (throws on failure) instead of the swallow-errors `getOwnedInCollection`
- `isDefinitive` flag (renamed from `allWalletsSucceeded`) guards unclaim reconciliation — false = skip unclaim for that collection

## Key gotcha
`NftOwnershipService.getOwnedInCollection` and `CardanoOwnershipProvider.getOwnedAssets` still exist (swallow errors, return `[]`) for backward compat. The strict variants (`getOwnedInCollectionStrict`, `getOwnedAssetsStrict`) throw on failure and are what `syncUserCollections` and `entityCentricOwnershipSweep` use.

**How to apply:** Any new code path that might trigger unclaim reconciliation on an empty result MUST use the strict variant. Login paths MUST use `claimFromCachedOwnership` (DB-only), not `syncUserCollections`.
