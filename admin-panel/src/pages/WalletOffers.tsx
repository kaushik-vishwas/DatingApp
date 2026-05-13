import { useCallback, useEffect, useState } from 'react';
import { Check, Edit2, Eye, Image as ImageIcon, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { createWalletOffer, deleteWalletOffer, fetchWalletOffers, updateWalletOffer, type WalletOffer } from '../api/client';
import { uploadToCloudinary } from '../../src/libs/cloudinary';
export function WalletOffersPage() {
  const [offers, setOffers] = useState<WalletOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<WalletOffer | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    bonusPercent: '',
    popular: false,
    active: true,
    offerBannerDataUrl: '',
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWalletOffers();
      setOffers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load offers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingOffer(null);
    setPreviewImage(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    // Validate file size (max 2MB for wallet banners)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image too large. Max 2MB');
      return;
    }
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed');
      return;
    }
  
    setBusyId('upload');
    setError(null);
    
    try {
      // Show uploading indicator (optional)
      setPreviewImage('uploading...');
      
      // Upload to Cloudinary
      const result = await uploadToCloudinary(file);
      
      // Store the Cloudinary URL (not Base64)
      setFormData({ ...formData, offerBannerDataUrl: result.secure_url });
      setPreviewImage(result.secure_url);
    } catch (err: any) {
      setError('Failed to upload image: ' + err.message);
      setPreviewImage(null);
    } finally {
      setBusyId(null);
    }
  };
  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(formData.amount);
    const bonusPercent = parseInt(formData.bonusPercent);

    if (isNaN(amount) || amount <= 0) {
      setError('Amount must be a valid positive number');
      return;
    }
    if (isNaN(bonusPercent) || bonusPercent < 0) {
      setError('Bonus percent must be a valid number');
      return;
    }

    setBusyId('form');
    try {
      if (editingOffer) {
        await updateWalletOffer(editingOffer.id, {
          amount,
          bonusPercent,
          popular: formData.popular,
          active: formData.active,
          offerBannerDataUrl: formData.offerBannerDataUrl || null,
        });
      } else {
        await createWalletOffer({
          amount,
          bonusPercent,
          popular: formData.popular,
          active: formData.active,
          offerBannerDataUrl: formData.offerBannerDataUrl || null,
        });
      }
      await load();
      closeModal();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this wallet offer? This may affect ongoing promotions.')) return;
    setBusyId(id);
    try {
      await deleteWalletOffer(id);
      await load();
    } catch (err: any) {
      setError(err.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const openEditModal = (offer: WalletOffer) => {
    setEditingOffer(offer);
    setFormData({
      amount: String(offer.amount),
      bonusPercent: String(offer.bonusPercent),
      popular: offer.popular,
      active: offer.active,
      offerBannerDataUrl: offer.offerBannerDataUrl || '',
    });
    setPreviewImage(offer.offerBannerDataUrl || null);
    setModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingOffer(null);
    setFormData({
      amount: '',
      bonusPercent: '',
      popular: false,
      active: true,
      offerBannerDataUrl: '',
    });
    setPreviewImage(null);
    setModalOpen(true);
  };

  const toggleStatus = async (offer: WalletOffer) => {
    setBusyId(offer.id);
    try {
      await updateWalletOffer(offer.id, { ...offer, active: !offer.active });
      await load();
    } catch (err: any) {
      setError(err.message || 'Status update failed');
    } finally {
      setBusyId(null);
    }
  };

  const activeOffers = offers.filter(o => o.active);
  const inactiveOffers = offers.filter(o => !o.active);

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Wallet Offers</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Manage recharge packages shown to callers. Active offers appear in the app wallet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7b2cff] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#6a24e0]"
          >
            <Plus className="h-4 w-4" />
            Add Offer
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
          <button onClick={() => setError(null)} className="ml-4 text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Stats Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Total Offers</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{offers.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{activeOffers.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Inactive</p>
          <p className="mt-2 text-3xl font-bold text-neutral-500">{inactiveOffers.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Popular Offers</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{offers.filter(o => o.popular).length}</p>
        </div>
      </div>

      {/* Active Offers Table */}
      {activeOffers.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-900">Active Offers</h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <OfferTable
              offers={activeOffers}
              busyId={busyId}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onToggleStatus={toggleStatus}
            />
          </div>
        </div>
      )}

      {/* Inactive Offers Table */}
      {inactiveOffers.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-neutral-500">Inactive Offers</h2>
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <OfferTable
              offers={inactiveOffers}
              busyId={busyId}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onToggleStatus={toggleStatus}
            />
          </div>
        </div>
      )}

      {!loading && offers.length === 0 && (
        <div className="mt-12 text-center">
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-12">
            <p className="text-neutral-500">No wallet offers yet</p>
            <button
              onClick={openCreateModal}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#7b2cff] px-4 py-2 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Create your first offer
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
              <h2 className="text-xl font-bold text-neutral-900">
                {editingOffer ? 'Edit Wallet Offer' : 'Create Wallet Offer'}
              </h2>
              <button onClick={closeModal} className="rounded-lg p-1 hover:bg-neutral-100">
                <X className="h-5 w-5 text-neutral-500" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6">
              <div className="space-y-5">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-neutral-700">Amount (₹)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-neutral-900 focus:border-[#7b2cff] focus:outline-none focus:ring-1 focus:ring-[#7b2cff]"
                    placeholder="e.g., 500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-semibold text-neutral-700">Bonus (%)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.bonusPercent}
                    onChange={(e) => setFormData({ ...formData, bonusPercent: e.target.value })}
                    className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-neutral-900 focus:border-[#7b2cff] focus:outline-none focus:ring-1 focus:ring-[#7b2cff]"
                    placeholder="e.g., 25"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-neutral-700">Popular Offer</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, popular: !formData.popular })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.popular ? 'bg-amber-500' : 'bg-neutral-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.popular ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-neutral-700">Active</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, active: !formData.active })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.active ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.active ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div>
  <label className="mb-1 block text-sm font-semibold text-neutral-700">Offer Banner Image</label>
  <div className="mt-1 flex items-center gap-3">
    <label className="cursor-pointer rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
      Choose Image
      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={busyId === 'upload'} />
    </label>
    {previewImage && previewImage !== 'uploading...' && (
      <button
        type="button"
        onClick={() => {
          setFormData({ ...formData, offerBannerDataUrl: '' });
          setPreviewImage(null);
        }}
        className="text-sm text-red-600 hover:text-red-700"
      >
        Remove
      </button>
    )}
    {busyId === 'upload' && (
      <span className="text-sm text-neutral-500">Uploading...</span>
    )}
  </div>
  {previewImage === 'uploading...' && (
    <div className="mt-3 flex items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#7b2cff] border-t-transparent"></div>
    </div>
  )}
  {previewImage && previewImage !== 'uploading...' && (
    <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200">
      <img src={previewImage} alt="Preview" className="max-h-32 w-full object-cover" />
    </div>
  )}
  <p className="mt-1 text-xs text-neutral-500">
    Optional. Max 2MB. Banner will appear as popup on Wallet screen after login.
  </p>
</div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="submit"
                  disabled={busyId === 'form'}
                  className="flex-1 rounded-xl bg-[#7b2cff] py-2.5 font-semibold text-white hover:bg-[#6a24e0] disabled:opacity-50"
                >
                  {busyId === 'form' ? 'Saving...' : editingOffer ? 'Update Offer' : 'Create Offer'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl border border-neutral-200 bg-white px-6 py-2.5 font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function OfferTable({
  offers,
  busyId,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  offers: WalletOffer[];
  busyId: string | null;
  onEdit: (offer: WalletOffer) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (offer: WalletOffer) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 bg-neutral-50/80">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Amount</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Bonus</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Credit</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Popular</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Banner</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Actions</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const credit = offer.amount * (1 + offer.bonusPercent / 100);
            return (
              <tr key={offer.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-semibold text-neutral-900">₹{offer.amount.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-emerald-600 font-semibold">+{offer.bonusPercent}%</td>
                <td className="px-4 py-3 text-neutral-600">₹{Math.round(credit).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3">
                  {offer.popular ? <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Popular</span> : '—'}
                </td>
                <td className="px-4 py-3">
                  {offer.offerBannerDataUrl ? (
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4 text-neutral-500" />
                      <span className="text-xs text-neutral-500">Has banner</span>
                    </div>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleStatus(offer)}
                    disabled={busyId === offer.id}
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                      offer.active
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {offer.active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(offer)}
                      disabled={busyId === offer.id}
                      className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(offer.id)}
                      disabled={busyId === offer.id}
                      className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}