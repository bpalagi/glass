'use client'

import { useState, useEffect } from 'react'
import { HardDrive } from 'lucide-react'
import { useAuth } from '@/utils/auth'
import { 
  UserProfile,
  getUserProfile,
  updateUserProfile,
  checkApiKeyStatus,
  saveApiKey
} from '@/utils/api'

declare global {
  interface Window {
    ipcRenderer?: any;
  }
}


export default function SettingsPage() {
  const { user: userInfo, isLoading } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')

  const fetchApiKeyStatus = async () => {
      try {
        const apiKeyStatus = await checkApiKeyStatus()
        setHasApiKey(apiKeyStatus.hasApiKey)
      } catch (error) {
        console.error("Failed to fetch API key status:", error);
      }
  }

  useEffect(() => {
    if (!userInfo) return

    const fetchProfileData = async () => {
      try {
        const userProfile = await getUserProfile()
        setProfile(userProfile)
        setDisplayNameInput(userProfile.display_name)
        await fetchApiKeyStatus();
      } catch (error) {
        console.error("Failed to fetch profile data:", error)
      }
    }
    fetchProfileData()

    if (window.ipcRenderer) {
      window.ipcRenderer.on('api-key-updated', () => {
        console.log('Received api-key-updated event from main process.');
        fetchApiKeyStatus();
      });
    }

    return () => {
      if (window.ipcRenderer) {
        window.ipcRenderer.removeAllListeners('api-key-updated');
      }
    }
  }, [userInfo])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!userInfo) {
    return null
  }

  const handleSaveApiKey = async () => {
    setIsSaving(true)
    try {
      await saveApiKey(apiKeyInput)
      setHasApiKey(true)
      setApiKeyInput('')
      if (window.ipcRenderer) {
        window.ipcRenderer.invoke('save-api-key', apiKeyInput);
      }
    } catch (error) {
      console.error("Failed to save API key:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdateDisplayName = async () => {
    if (!profile || displayNameInput === profile.display_name) return;
    setIsSaving(true);
    try {
        await updateUserProfile({ displayName: displayNameInput });
        setProfile(prev => prev ? { ...prev, display_name: displayNameInput } : null);
    } catch (error) {
        console.error("Failed to update display name:", error);
    } finally {
        setIsSaving(false);
    }
  }

  const renderProfileContent = () => (
          <div className="space-y-6">
            <div className="p-4 rounded-lg border bg-gray-50 border-gray-200">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-gray-600" />
                <div>
                  <h3 className="font-semibold text-gray-900">Local Execution Mode</h3>
                  <p className="text-sm text-gray-700">Running as local user</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Display Name</h3>
              <p className="text-sm text-gray-600 mb-4">Enter your full name or a display name you're comfortable using.</p>
              <div className="max-w-sm">
                 <input
                    type="text"
                    id="display-name"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                    maxLength={32}
                  />
                  <p className="text-xs text-gray-500 mt-2">You can use up to 32 characters.</p>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                <button
                    onClick={handleUpdateDisplayName}
                    disabled={isSaving || !displayNameInput || displayNameInput === profile?.display_name}
                    className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
                  >
                    Update
                  </button>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">API Key</h3>
                <p className="text-sm text-gray-600 mb-4">
                  If you want to use your own LLM API key, you can add it here. It will be used for all requests made by the local application.
                </p>
                
                <div className="max-w-sm">
                  <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 mb-1">
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      id="api-key"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                      placeholder="Enter new API key or existing API key"
                    />
                  </div>
                  {hasApiKey ? (
                    <p className="text-xs text-green-600 mt-2">API key is currently set.</p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-2">No API key set. Using free system.</p>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
                   <button
                      onClick={handleSaveApiKey}
                      disabled={isSaving || !apiKeyInput}
                      className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
          </div>
        )

  return (
    <div className="bg-stone-50 min-h-screen">
      <div className="px-8 py-8">
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Settings</p>
          <h1 className="text-3xl font-bold text-gray-900">Personal Settings</h1>
        </div>
        
        {renderProfileContent()}
      </div>
    </div>
  )
} 