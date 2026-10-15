import { useState, useEffect } from 'react';
import { FaceLogin } from './components/FaceLogin';
import { FaceRegistration } from './components/FaceRegistration';
import { ProtectedArea } from './components/ProtectedArea';
import { faceService, DEFAULT_SETTINGS } from './services/faceRecognitionService';
import { audioFeedback } from './services/audioFeedback';
import type { FaceProfile, BiometricSettings } from './types/face';
import './App.css';

type AppScreen = 'login' | 'register' | 'restricted';

interface AuthenticatedSession {
  profile: FaceProfile;
  score: number;
  distance: number;
  timestamp: string;
}

export function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('login');
  const [profile, setProfile] = useState<FaceProfile | null>(null);
  const [settings, setSettings] = useState<BiometricSettings>(DEFAULT_SETTINGS);
  const [session, setSession] = useState<AuthenticatedSession | null>(null);

  // Carregar dados salvos na inicialização
  useEffect(() => {
    const savedProfile = faceService.getStoredProfile();
    const savedSettings = faceService.getSettings();
    setProfile(savedProfile);
    setSettings(savedSettings);
    audioFeedback.setMuted(!savedSettings.soundEffects);
  }, []);

  const handleUpdateSettings = (newSettings: BiometricSettings) => {
    setSettings(newSettings);
    faceService.saveSettings(newSettings);
    audioFeedback.setMuted(!newSettings.soundEffects);
  };

  const handleAuthorizedAccess = (data: AuthenticatedSession) => {
    setSession(data);
    setCurrentScreen('restricted');
  };

  const handleLogout = () => {
    setSession(null);
    setCurrentScreen('login');
  };

  const handleRegistrationSuccess = (newProfile: FaceProfile) => {
    setProfile(newProfile);
    setCurrentScreen('login');
  };

  const handleProfileDeleted = () => {
    setProfile(null);
    setSession(null);
    setCurrentScreen('login');
  };

  return (
    <div className="app-root-shell">
      {currentScreen === 'login' && (
        <FaceLogin
          profile={profile}
          settings={settings}
          onNavigateToEnrollment={() => setCurrentScreen('register')}
          onAuthorizedAccess={handleAuthorizedAccess}
          onResetProfile={() => setProfile(null)}
        />
      )}

      {currentScreen === 'register' && (
        <FaceRegistration
          onCancel={() => setCurrentScreen('login')}
          onRegistrationSuccess={handleRegistrationSuccess}
          settings={settings}
          existingProfile={profile}
        />
      )}

      {currentScreen === 'restricted' && session && (
        <ProtectedArea
          profile={session.profile}
          authTimestamp={session.timestamp}
          matchScore={session.score}
          matchDistance={session.distance}
          onLogout={handleLogout}
          onReEnroll={() => {
            setSession(null);
            setCurrentScreen('register');
          }}
          onProfileDeleted={handleProfileDeleted}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      )}
    </div>
  );
}

export default App;
