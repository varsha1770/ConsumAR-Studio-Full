'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdminStats {
  guests: number;
  providers: {
    email: number;
    google: number;
    magicLink: number;
  };
  paid: number;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/admin/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to load stats', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900">Super Admin Dashboard</h1>
          <Link href="/admin/logs" className="text-blue-600 hover:text-blue-800">
            View Logs &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Guest Users Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Total Guest Users</dt>
                <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats?.guests}</dd>
                <p className="mt-2 text-xs text-gray-400">Based on unique IPs</p>
              </div>
            </div>

            {/* Paid Users Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate">Total Paid Users</dt>
                <dd className="mt-1 text-3xl font-semibold text-green-600">{stats?.paid}</dd>
                <p className="mt-2 text-xs text-gray-400">Active subscribers</p>
              </div>
            </div>

            {/* Auth Providers Breakdown */}
            <div className="bg-white overflow-hidden shadow rounded-lg sm:col-span-2 lg:col-span-1 hover:shadow-md transition-shadow">
              <div className="px-4 py-5 sm:p-6">
                <dt className="text-sm font-medium text-gray-500 truncate mb-4">Authentication Providers</dt>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Email/Password</span>
                    <span className="text-lg font-medium text-gray-900">{stats?.providers.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Google OAuth</span>
                    <span className="text-lg font-medium text-gray-900">{stats?.providers.google}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Magic Link (OTP)</span>
                    <span className="text-lg font-medium text-gray-900">{stats?.providers.magicLink}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
