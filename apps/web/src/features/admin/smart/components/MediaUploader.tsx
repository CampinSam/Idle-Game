import { useState, useRef, useCallback, useEffect } from 'react';
import { adminApi, getAdminToken } from '../../adminApi';
import { resolveAssetUrl } from '../../../../utils/iconResolver';

interface MediaAsset {
  assetKey: string;
  name: string;
  url: string;
  contentType: string;
  size: number;
}

interface Props {
  fieldName: string;
  onInsert: (assetKey: string) => void;
  onClose: () => void;
}

function adminAuthHeader(): Record<string, string> {
  const token = getAdminToken();
  if (token) return { Authorization: `Bearer ${token}` };
  if (import.meta.env.DEV) return { 'X-Admin-Key': import.meta.env.VITE_ADMIN_KEY || 'derp-admin-2026' };
  return {};
}

async function uploadMedia(file: File): Promise<{ assetKey: string; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/admin/media/upload', {
    method: 'POST',
    headers: adminAuthHeader(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Upload failed: ${res.status}`);
  }
  return res.json();
}

async function listMedia(): Promise<MediaAsset[]> {
  const res = await fetch('/api/admin/media/list', {
    headers: { ...adminAuthHeader(), 'Content-Type': 'application/json' },
  });
  if (!res.ok) return [];
  return res.json();
}

function formatBytes(b: number) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaUploader({ fieldName, onInsert, onClose }: Props) {
  const [tab, setTab] = useState<'upload' | 'browse'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ assetKey: string; url: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCssField = fieldName === 'cardBackground';

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const data = await listMedia();
      setAssets(data);
    } catch { setAssets([]); }
    finally { setAssetsLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'browse') loadAssets();
  }, [tab, loadAssets]);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setUploadResult(null);
    setUploadError(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const doUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadMedia(selectedFile);
      setUploadResult(result);
      setSelectedAsset({ assetKey: result.assetKey, name: selectedFile.name, url: result.url, contentType: selectedFile.type, size: selectedFile.size });
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleInsert = () => {
    if (!selectedAsset) return;
    const val = isCssField ? `url('${resolveAssetUrl(selectedAsset.assetKey)}')` : selectedAsset.assetKey;
    onInsert(val);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 440, height: '100vh',
        background: '#12122a',
        borderLeft: '1px solid #2a2a4e',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #2a2a3e', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18 }}>🖼</span>
          <div>
            <div style={{ color: '#e0e0ff', fontWeight: 700, fontSize: 15 }}>Media Assets</div>
            <div style={{ color: '#666', fontSize: 11 }}>Field: {fieldName}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #2a2a3e' }}>
          {(['upload', 'browse'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px', background: 'none',
                border: 'none', borderBottom: tab === t ? '2px solid #a78bfa' : '2px solid transparent',
                color: tab === t ? '#a78bfa' : '#888',
                cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tab === 'upload' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#a78bfa' : '#333'}`,
                  borderRadius: 10, padding: 32,
                  textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(167,139,250,0.08)' : '#1a1a2e',
                  transition: 'all 0.15s',
                }}
              >
                {preview ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <img src={preview} alt="" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }} />
                    <span style={{ color: '#888', fontSize: 12 }}>{selectedFile?.name}</span>
                    <span style={{ color: '#555', fontSize: 11 }}>{formatBytes(selectedFile?.size || 0)}</span>
                    <span style={{ color: '#a78bfa', fontSize: 11 }}>Click to choose another file</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#666' }}>
                    <span style={{ fontSize: 32 }}>📂</span>
                    <span style={{ fontSize: 13 }}>Drag & drop or click to select a file</span>
                    <span style={{ fontSize: 11 }}>Images (PNG, JPG, GIF, SVG, WebP)</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                />
              </div>

              {uploadError && (
                <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)' }}>
                  {uploadError}
                </div>
              )}

              {uploadResult && (
                <div style={{ color: '#4ade80', fontSize: 12, padding: '8px 12px', background: 'rgba(74,222,128,0.1)', borderRadius: 6, border: '1px solid rgba(74,222,128,0.3)' }}>
                  ✓ Uploaded: <code style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{uploadResult.assetKey}</code>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedFile || uploading}
                onClick={doUpload}
                style={{
                  padding: '10px', background: selectedFile ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : '#333',
                  border: 'none', borderRadius: 8, color: '#fff',
                  cursor: selectedFile ? 'pointer' : 'not-allowed',
                  fontSize: 14, fontWeight: 600,
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            </>
          )}

          {tab === 'browse' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ color: '#888', fontSize: 12 }}>{assets.length} asset{assets.length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={loadAssets} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                  ↻ Refresh
                </button>
              </div>
              {assetsLoading && (
                <div style={{ textAlign: 'center', color: '#666', fontSize: 13, padding: 32 }}>Loading...</div>
              )}
              {!assetsLoading && assets.length === 0 && (
                <div style={{ textAlign: 'center', color: '#666', fontSize: 13, padding: 32 }}>
                  No assets uploaded yet. Switch to the Upload tab to add some.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {assets.map(asset => (
                  <div
                    key={asset.assetKey}
                    onClick={() => setSelectedAsset(asset)}
                    style={{
                      borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                      border: selectedAsset?.assetKey === asset.assetKey ? '2px solid #a78bfa' : '2px solid #2a2a3e',
                      background: '#1a1a2e',
                      transition: 'border-color 0.1s',
                    }}
                  >
                    <div style={{ height: 80, background: '#0f0f2e', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img
                        src={resolveAssetUrl(asset.assetKey) ?? ''}
                        alt={asset.name}
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <div style={{ padding: '4px 6px' }}>
                      <div style={{ color: '#ccc', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.name}>
                        {asset.name}
                      </div>
                      <div style={{ color: '#555', fontSize: 10 }}>{formatBytes(Number(asset.size))}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid #2a2a3e', display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '10px', background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, color: '#888', cursor: 'pointer', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selectedAsset}
            onClick={handleInsert}
            style={{
              flex: 2, padding: '10px',
              background: selectedAsset ? 'linear-gradient(135deg, #7c3aed, #a78bfa)' : '#333',
              border: 'none', borderRadius: 8, color: '#fff',
              cursor: selectedAsset ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {selectedAsset
              ? `Insert: ${selectedAsset.name}`
              : 'Select an asset to insert'}
          </button>
        </div>
      </div>
    </div>
  );
}
