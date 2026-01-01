"use client";

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { UserCircleIcon, CameraIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
    const { data: session, update } = useSession();
    const router = useRouter();
    
    // Form States
    const [name, setName] = useState(session?.user?.name || '');
    const [imageFile, setImageFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(session?.user?.image || null);
    
    // UI States
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage({ type: '', text: '' });

        try {
            let imageUrl = session?.user?.image;

            // 1. Upload new image if selected
            if (imageFile) {
                const formData = new FormData();
                formData.append('file', imageFile);
                formData.append('folder', 'avatars'); // Use 'avatars' folder

                const uploadRes = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const uploadData = await uploadRes.json();
                
                if (!uploadData.success) throw new Error(uploadData.error || 'Image upload failed');
                imageUrl = uploadData.url;
            }

            // 2. Update Profile
            const res = await fetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, image: imageUrl })
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            // 3. Update Session
            await update({ name, image: imageUrl });
            setMessage({ type: 'success', text: 'Profile updated successfully!' });

        } catch (error) {
            console.error(error);
            setMessage({ type: 'error', text: error.message || 'Failed to update profile' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("Are you absolutely sure? This action cannot be undone.")) return;
        
        setIsLoading(true);
        try {
            const res = await fetch('/api/user/profile', {
                method: 'DELETE'
            });

            if (res.ok) {
                await signOut({ callbackUrl: '/' });
            } else {
                alert("Failed to delete account");
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert("An error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-12 pb-12">
             <div className="border-b border-[#27272a] pb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
                  <p className="text-zinc-400">Manage your account settings and preferences.</p>
                </div>
             </div>

             {/* Profile Section */}
             <section className="space-y-6">
                 <div>
                    <h2 className="text-xl font-bold text-white mb-4">Public Profile</h2>
                    
                    <form onSubmit={handleUpdateProfile} className="space-y-6 bg-[#18181b] p-6 rounded-2xl border border-[#27272a]">
                        <div className="flex items-center gap-6">
                            <div className="relative group">
                                {previewUrl ? (
                                    <img 
                                        src={previewUrl} 
                                        alt="Profile" 
                                        className="w-24 h-24 rounded-full object-cover ring-4 ring-[#27272a]" 
                                    />
                                ) : (
                                    <UserCircleIcon className="w-24 h-24 text-zinc-500" />
                                )}
                                <label className="absolute bottom-0 right-0 bg-emerald-500 text-black p-2 rounded-full cursor-pointer hover:bg-emerald-400 transition-colors shadow-lg">
                                    <CameraIcon className="w-5 h-5" />
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                </label>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm text-zinc-400 mb-1">Profile Photo</p>
                                <p className="text-xs text-zinc-500">Supported formats: JPG, PNG, GIF</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Display Name</label>
                            <input 
                                type="text" 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#09090b] border border-[#27272a] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-300">Email</label>
                            <input 
                                type="text" 
                                value={session?.user?.email || ''}
                                disabled
                                className="w-full bg-[#09090b]/50 border border-[#27272a] rounded-xl px-4 py-3 text-zinc-500 cursor-not-allowed"
                            />
                        </div>

                        {message.text && (
                            <div className={`p-4 rounded-xl text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                                {message.text}
                            </div>
                        )}

                        <div className="pt-2">
                            <button 
                                type="submit" 
                                disabled={isLoading}
                                className="bg-white text-black px-6 py-2.5 rounded-xl font-bold hover:bg-zinc-200 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                 </div>
             </section>

             {/* Danger Zone */}
             <section>
                <h2 className="text-xl font-bold text-red-500 mb-4 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-6 h-6" /> Danger Zone
                </h2>
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
                    <h3 className="font-bold text-white mb-2">Delete Account</h3>
                    <p className="text-zinc-400 text-sm mb-6">
                        Once you delete your account, there is no going back. Please be certain. 
                        This will permanently delete your profile, expense history, and all other associated data.
                    </p>
                    <button 
                        onClick={handleDeleteAccount}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold transition-colors text-sm"
                    >
                        Delete Account Permanently
                    </button>
                </div>
             </section>
        </div>
    );
}
