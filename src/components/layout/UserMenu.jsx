"use client";

import { Fragment, useState, useEffect } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { useSession, signOut } from 'next-auth/react';
import { UserCircleIcon, ChevronDownIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

export default function UserMenu() {
    const { data: session } = useSession();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return (
         <div className="w-8 h-8 rounded-full bg-[#27272a] animate-pulse"></div>
    );

    return (
        <Menu as="div" className="relative inline-block text-left">
            <Menu.Button className="flex items-center gap-3 bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] rounded-full pl-2 pr-4 py-1.5 transition-all outline-none">
                {session?.user?.image ? (
                    <img 
                        src={session.user.image} 
                        alt="Profile" 
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-[#27272a]" 
                    />
                ) : (
                    <UserCircleIcon className="w-8 h-8 text-zinc-400" />
                )}
                <ChevronDownIcon className="w-4 h-4 text-zinc-500 group-hover:text-white" />
            </Menu.Button>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right divide-y divide-zinc-800 rounded-xl bg-[#18181b] border border-[#27272a] shadow-xl focus:outline-none z-50">
                    <div className="px-4 py-3">
                        <p className="text-sm text-white font-bold truncate">{session?.user?.name || 'User'}</p>
                        <p className="text-xs text-zinc-500 truncate">{session?.user?.email}</p>
                    </div>
                    <div className="p-1">
                        <Menu.Item>
                            {({ active }) => (
                                <Link
                                    href="/settings"
                                    className={`${
                                        active ? 'bg-[#27272a] text-white' : 'text-zinc-300'
                                    } group flex w-full items-center rounded-lg px-2 py-2 text-sm`}
                                >
                                    <Cog6ToothIcon className="mr-2 h-4 w-4" />
                                    Settings
                                </Link>
                            )}
                        </Menu.Item>
                    </div>
                    <div className="p-1">
                        <Menu.Item>
                            {({ active }) => (
                                <button
                                    onClick={() => signOut({ callbackUrl: '/' })}
                                    className={`${
                                        active ? 'bg-red-500/10 text-red-500' : 'text-zinc-300'
                                    } group flex w-full items-center rounded-lg px-2 py-2 text-sm`}
                                >
                                    <ArrowRightOnRectangleIcon className="mr-2 h-4 w-4" />
                                    Sign Out
                                </button>
                            )}
                        </Menu.Item>
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    );
}
