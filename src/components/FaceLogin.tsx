import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  Scan,
  UserPlus,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { CameraView } from './CameraView';
import { ModelTransparencyModal } from './ModelTransparencyModal';
import { AccessDeniedModal } from './AccessDeniedModal';
import { faceService } from '../services/faceRecognitionService';
import { audioFeedback } from '../services/audioFeedback';
import type {
  FaceProfile,
  AuthStatusCode,
  LivenessState,
  FaceMatchEvaluation,
  BiometricSettings,
} from '../types/face';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

interface FaceLoginProps {
  profile: FaceProfile | null;
  settings: BiometricSettings;
  onNavigateToEnrollment: () => void;
  onAuthorizedAccess: (data: { profile: FaceProfile; score: number; distance: number; timestamp: string }) => void;
  onResetProfile?: () => void;
}

export const FaceLogin: React.FC<FaceLoginProps> = ({
  profile,
  settings,
  onNavigateToEnrollment,
  onAuthorizedAccess,
  onResetProfile,
}) => {
  // Garantir recuperação do perfil diretamente do localStorage
  const [activeProfile, setActiveProfile] = useState<FaceProfile | null>(() => {
    return profile || faceService.getStoredProfile();
  });

  const [authStatus, setAuthStatus] = useState<AuthStatusCode>('initializing');
  const [statusMessage, setStatusMessage] = useState<string>('Inicializando câmera e modelos de IA...');
  const [isAutoVerify, setIsAutoVerify] = useState<boolean>(true);
  const [isManualScanning, setIsManualScanning] = useState<boolean>(false);
  const [showTransparencyModal, setShowTransparencyModal] = useState<boolean>(false);
  const [showDeniedModal, setShowDeniedModal] = useState<boolean>(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const [isCooldownActive, setIsCooldownActive] = useState<boolean>(false);

  // Estados biométricos em tempo real
  const [landmarksResult, setLandmarksResult] = useState<FaceLandmarkerResult | null>(null);
  const [liveness, setLiveness] = useState<LivenessState>({
    blinkCount: 0,
    lastBlinkTime: 0,
    isBlinking: false,
    yawDegrees: 0,
    pitchDegrees: 0,
    rollDegrees: 0,
    livenessPassed: false,
  });

  const [matchEvaluation, setMatchEvaluation] = useState<FaceMatchEvaluation | null>(null);
  const [consecutiveCount, setConsecutiveCount] = useState<number>(0);

  // Estado para transição de sucesso
  const [authorizedData, setAuthorizedData] = useState<{
    profile: FaceProfile;
    score: number;
    distance: number;
    timestamp: string;
  } | null>(null);

  // Throttling de inferência pesada de embeddings faciais
  const lastEmbeddingTimeRef = useRef<number>(0);
  const isInferringRef = useRef<boolean>(false);
  const failedMismatchFramesRef = useRef<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authCompletedRef = useRef<boolean>(false);

  // Sincronizar activeProfile com props ou storage
  useEffect(() => {
    const p = profile || faceService.getStoredProfile();
    setActiveProfile(p);
    console.log('[FaceID Login] Status do perfil cadastrado:', p ? {
      nome: p.name,
      amostras: p.samples?.length,
      amostrasDetalhes: p.samples?.map((s) => ({ etapa: s.stepName, angulo: s.angle, len: s.descriptor?.length })),
      dataCadastro: p.createdAt
    } : 'Nenhum perfil cadastrado.');
  }, [profile]);

  // Inicialização de modelos
  useEffect(() => {
    let isMounted = true;
    setStatusMessage('Inicializando câmera...');

    faceService
      .initialize()
      .then(() => {
        if (!isMounted) return;
        const stored = profile || faceService.getStoredProfile();
        if (!stored) {
          setAuthStatus('idle');
          setStatusMessage('Cadastre seu rosto antes de autenticar.');
        } else {
          setAuthStatus('positioning');
          setStatusMessage('Posicione seu rosto dentro da moldura.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Erro na inicialização dos modelos:', err);
        setAuthStatus('error');
        setStatusMessage('Não foi possível inicializar os sensores ou modelos de IA.');
      });

    return () => {
      isMounted = false;
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [profile]);

  // Tratar falha de verificação com cooldown
  const triggerAccessDenied = useCallback((distance: number, score: number) => {
    if (isCooldownActive || authCompletedRef.current) return;

    audioFeedback.playAccessDenied();
    setAuthStatus('denied');
    setStatusMessage('Rosto não reconhecido. Acesso negado.');
    setIsCooldownActive(true);
    setShowDeniedModal(true);

    faceService.addAuditLog({
      status: 'DENIED',
      userName: 'Desconhecido / Não Autorizado',
      similarity: score,
      distance,
      livenessScore: liveness.livenessPassed ? 85 : 30,
      ipMock: '127.0.0.1 (Local Client)',
      deviceInfo: navigator.userAgent.substring(0, 32),
    });

    faceService.resetConsecutiveMatches();
    setConsecutiveCount(0);
    failedMismatchFramesRef.current = 0;

    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      setIsCooldownActive(false);
    }, settings.cooldownSeconds * 1000);
  }, [isCooldownActive, liveness.livenessPassed, settings.cooldownSeconds]);

  // Tratar autorização com sucesso
  const triggerAuthorizedAccess = useCallback((evalResult: FaceMatchEvaluation, matchedProfile: FaceProfile) => {
    if (authCompletedRef.current) return;
    authCompletedRef.current = true;

    audioFeedback.playSuccessUnlock();
    setAuthStatus('authorized');
    setStatusMessage('Identidade confirmada. Acesso autorizado.');

    const now = new Date().toISOString();
    const data = {
      profile: matchedProfile,
      score: evalResult.similarityScore,
      distance: evalResult.distance,
      timestamp: now,
    };

    setAuthorizedData(data);

    faceService.addAuditLog({
      status: 'AUTHORIZED',
      userName: matchedProfile.name,
      similarity: evalResult.similarityScore,
      distance: evalResult.distance,
      livenessScore: 98,
      ipMock: '127.0.0.1 (Local Client)',
      deviceInfo: navigator.userAgent.substring(0, 32),
    });
  }, []);

  // Processamento contínuo de quadros
  const handleVideoFrame = useCallback(
    async (video: HTMLVideoElement, timestamp: number) => {
      if (authCompletedRef.current || isCooldownActive) return;

      // 1. Detectar landmarks com MediaPipe
      const result = faceService.detectLandmarksForVideo(video, timestamp);
      setLandmarksResult(result);

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        setAuthStatus('no_face');
        setStatusMessage('Nenhum rosto detectado.');
        setMatchEvaluation(null);
        setConsecutiveCount(0);
        failedMismatchFramesRef.current = 0;
        return;
      }

      // 2. Proibir mais de uma pessoa simultânea na autenticação
      if (result.faceLandmarks.length > 1) {
        setAuthStatus('multiple_faces');
        setStatusMessage('Alerta de segurança: múltiplos rostos detectados!');
        setMatchEvaluation(null);
        setConsecutiveCount(0);
        failedMismatchFramesRef.current = 0;
        return;
      }

      // 3. Avaliar posicionamento e qualidade
      const quality = faceService.assessQuality(video, result);
      const liv = faceService.computeLiveness(result);
      setLiveness(liv);

      if (!quality.isCentered || !quality.isGoodSize) {
        setAuthStatus('positioning');
        setStatusMessage(quality.details[0] || 'Posicione seu rosto dentro da moldura.');
        return;
      }

      // 4. Verificar se existe cadastro do titular ANTES de tentar comparar
      const currentProfile = activeProfile || profile || faceService.getStoredProfile();
      if (!currentProfile || !currentProfile.samples || currentProfile.samples.length === 0) {
        setAuthStatus('idle');
        setStatusMessage('Cadastre seu rosto antes de autenticar.');
        setMatchEvaluation(null);
        setConsecutiveCount(0);
        return;
      }

      // 5. Executar extração e comparação de embeddings com limitação de taxa (a cada 240ms)
      const now = performance.now();
      const shouldRunCheck = (isAutoVerify || isManualScanning) && now - lastEmbeddingTimeRef.current > 240;

      if (!shouldRunCheck || isInferringRef.current) return;

      isInferringRef.current = true;
      lastEmbeddingTimeRef.current = now;

      try {
        const descriptor = await faceService.extractFaceDescriptor(video);

        if (descriptor && descriptor.length === 128) {
          // Comparação com o perfil do proprietário
          const evalResult = faceService.evaluateFaceMatch(descriptor, currentProfile, settings);
          setMatchEvaluation(evalResult);
          setConsecutiveCount(evalResult.consecutiveMatches);

          if (evalResult.isMatch) {
            // SUCESSO: Concluiu os quadros consecutivos requeridos (ex: 5/5)
            failedMismatchFramesRef.current = 0;
            setAuthStatus('authorized');
            setStatusMessage('Identidade confirmada. Acesso autorizado.');
            triggerAuthorizedAccess(evalResult, currentProfile);
          } else if (evalResult.distance <= settings.similarityThreshold) {
            // Quadro individual aceito, avançando na consistência
            failedMismatchFramesRef.current = 0;
            setAuthStatus('verifying');
            setStatusMessage(`Verificando identidade... (${evalResult.consecutiveMatches}/${settings.consecutiveFramesRequired} quadros)`);
            audioFeedback.playScanBlip();
          } else {
            // Quadro com distância acima do limiar (não correspondente)
            failedMismatchFramesRef.current += 1;
            setAuthStatus('analyzing');

            if (failedMismatchFramesRef.current >= 8) {
              // Rosto persistentemente diferente: bloquear com tela de negação
              triggerAccessDenied(evalResult.distance, evalResult.similarityScore);
            } else {
              setStatusMessage(`Rosto em análise (Distância: ${evalResult.distance.toFixed(3)} / Limiar: ${settings.similarityThreshold.toFixed(2)})`);
            }
          }
        } else {
          setStatusMessage('Posicione seu rosto dentro da moldura para leitura.');
        }
      } catch (err) {
        console.warn('Erro na inferência facial:', err);
      } finally {
        isInferringRef.current = false;
        if (isManualScanning) {
          setIsManualScanning(false);
        }
      }
    },
    [
      isAutoVerify,
      isManualScanning,
      isCooldownActive,
      activeProfile,
      profile,
      settings,
      triggerAuthorizedAccess,
      triggerAccessDenied,
    ]
  );

  const handleManualVerify = () => {
    if (isCooldownActive || authCompletedRef.current) return;
    setIsManualScanning(true);
  };

  const handleRetryAfterDenied = () => {
    setShowDeniedModal(false);
    setIsCooldownActive(false);
    failedMismatchFramesRef.current = 0;
    setAuthStatus('positioning');
    setStatusMessage('Posicione seu rosto dentro da moldura.');
    faceService.resetConsecutiveMatches();
    setConsecutiveCount(0);
  };

  const handleClearBiometrics = () => {
    faceService.deleteProfile();
    setActiveProfile(null);
    setShowClearConfirmModal(false);
    setMatchEvaluation(null);
    setConsecutiveCount(0);
    setAuthStatus('idle');
    setStatusMessage('Cadastre seu rosto antes de autenticar.');
    audioFeedback.playAccessDenied();
    onResetProfile?.();
  };

  const currentProfile = activeProfile || profile || faceService.getStoredProfile();

  return (
    <div className="face-login-layout">
      {/* Barra de Navegação Superior */}
      <header className="login-top-bar">
        <div className="brand-group">
          <div className="brand-logo-glow">
            <Scan className="text-cyan" size={24} />
          </div>
          <div>
            <h1 className="brand-title">FaceID Access</h1>
            <p className="brand-subtitle">Autenticação facial segura</p>
          </div>
        </div>

        <div className="top-actions">
          {currentProfile && (
            <div className="enrolled-badge-chip">
              <UserCheck size={14} className="text-green" />
              <span>Titular: <strong>{currentProfile.name}</strong></span>
              <button
                type="button"
                className="chip-delete-btn"
                onClick={() => setShowClearConfirmModal(true)}
                title="Apagar dados biométricos cadastrados"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}

          <button
            type="button"
            className="cyber-btn secondary-btn"
            onClick={() => setShowTransparencyModal(true)}
            title="Ver detalhes da arquitetura neural e segurança"
          >
            <HelpCircle size={16} />
            <span className="hide-on-mobile">Como Funciona</span>
          </button>

          <button
            type="button"
            className="cyber-btn primary-btn"
            onClick={onNavigateToEnrollment}
          >
            <UserPlus size={16} />
            <span>{currentProfile ? 'Recadastrar Rosto' : 'Cadastrar Meu Rosto'}</span>
          </button>
        </div>
      </header>

      {/* Seção Central: Câmera e Moldura */}
      <main className="login-main-portal">
        <div className="portal-camera-container">
          {/* Alerta quando NÃO há cadastro de usuário */}
          {!currentProfile && (
            <div className="no-profile-callout glass-card">
              <div className="callout-icon-wrap">
                <AlertTriangle size={24} className="text-amber" />
              </div>
              <div className="callout-body">
                <h3 className="callout-title">Nenhum Rosto Cadastrado</h3>
                <p className="callout-desc">
                  O sistema está bloqueado para proteger a área restrita. Cadastre seu rosto como proprietário autorizado para habilitar o acesso biométrico.
                </p>
              </div>
              <button
                type="button"
                className="cyber-btn primary-btn"
                onClick={onNavigateToEnrollment}
              >
                <UserPlus size={16} />
                CADASTRAR MEU ROSTO
              </button>
            </div>
          )}

          {/* Card Glassmorphism com o Feed da Câmera */}
          <div className="camera-glass-wrapper">
            <CameraView
              status={authStatus}
              landmarksResult={landmarksResult}
              liveness={liveness}
              showMesh={settings.showMeshOverlay}
              showTelemetry={settings.showHUDTelemetry}
              isScanning={isManualScanning || authStatus === 'analyzing' || authStatus === 'verifying'}
              consecutiveMatches={consecutiveCount}
              requiredMatches={settings.consecutiveFramesRequired}
              currentDistance={matchEvaluation?.distance}
              threshold={settings.similarityThreshold}
              onVideoFrame={handleVideoFrame}
              active={!authorizedData}
            />

            {/* Banner Dinâmico de Instrução */}
            <div className={`status-instruction-pill status-${authStatus}`}>
              <div className="pill-dot" />
              <span className="pill-text">{statusMessage}</span>
            </div>

            {/* Medidor de Verificação Contínua (Consecutive Match Meter) */}
            {currentProfile && (
              <div className="verification-meter-box">
                <div className="meter-labels">
                  <span className="meter-title">Confirmação de Identidade:</span>
                  <span className="meter-count font-mono">
                    {consecutiveCount} / {settings.consecutiveFramesRequired} quadros
                    {matchEvaluation && (
                      <span className="meter-dist-subtext">
                        {' '} | Distância: {matchEvaluation.distance.toFixed(3)} (Limiar: {settings.similarityThreshold.toFixed(2)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="meter-dots-row">
                  {Array.from({ length: settings.consecutiveFramesRequired }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`meter-dot ${idx < consecutiveCount ? 'filled' : ''}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Barra de Ações Rápidas Inferiores */}
          <div className="portal-action-controls">
            <button
              type="button"
              className="cyber-btn primary-btn btn-hero pulse-glow"
              onClick={handleManualVerify}
              disabled={isCooldownActive || !!authorizedData || !currentProfile}
            >
              <Scan size={18} />
              VERIFICAR IDENTIDADE
            </button>

            <div className="auto-toggle-container">
              <label className="toggle-label" htmlFor="auto-verify-toggle">
                <input
                  id="auto-verify-toggle"
                  type="checkbox"
                  checked={isAutoVerify}
                  onChange={(e) => setIsAutoVerify(e.target.checked)}
                  className="cyber-checkbox"
                  disabled={!currentProfile}
                />
                <span>Análise Automática Contínua</span>
              </label>
            </div>
          </div>
        </div>
      </main>

      {/* Modal de Confirmação de Exclusão / Redefinição do Cadastro */}
      {showClearConfirmModal && currentProfile && (
        <div className="modal-backdrop">
          <div className="modal-container clear-confirm-modal">
            <div className="modal-header">
              <div className="header-title-group">
                <Trash2 size={22} className="text-red" />
                <h3 className="modal-title">Apagar Cadastro Biométrico</h3>
              </div>
            </div>
            <div className="modal-body">
              <p>
                Deseja apagar os descritores faciais de <strong>{currentProfile.name}</strong> salvos neste dispositivo?
              </p>
              <p className="mt-2 text-muted">
                Isso removerá os vetores de 128 dimensões do armazenamento local, permitindo um novo cadastramento limpo a partir do zero.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="cyber-btn danger-btn"
                onClick={handleClearBiometrics}
              >
                SIM, APAGAR CADASTRO
              </button>
              <button
                type="button"
                className="cyber-btn secondary-btn"
                onClick={() => setShowClearConfirmModal(false)}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Transição de Acesso Autorizado */}
      {authorizedData && (
        <div className="modal-backdrop">
          <div className="modal-container authorized-success-modal">
            <div className="auth-success-icon-wrap">
              <div className="success-pulse-ring" />
              <CheckCircle2 size={64} className="text-green" />
            </div>

            <div className="success-badge">IDENTIDADE CONFIRMADA</div>
            <h2 className="success-title">Acesso Autorizado</h2>

            <div className="user-profile-summary">
              <div className="user-avatar-badge">
                <ShieldCheck size={28} className="text-cyan" />
              </div>
              <div>
                <h3 className="user-name">{authorizedData.profile.name}</h3>
                <span className="user-role">{authorizedData.profile.role}</span>
              </div>
            </div>

            <div className="success-metrics-grid">
              <div className="metric-box">
                <span className="m-label">Data e Hora</span>
                <span className="m-val">{new Date(authorizedData.timestamp).toLocaleTimeString('pt-BR')}</span>
              </div>
              <div className="metric-box">
                <span className="m-label">Similaridade</span>
                <span className="m-val text-green font-mono">{authorizedData.score}%</span>
              </div>
              <div className="metric-box">
                <span className="m-label">Distância Euclidiana</span>
                <span className="m-val text-cyan font-mono">{authorizedData.distance.toFixed(4)}</span>
              </div>
            </div>

            <button
              type="button"
              className="cyber-btn primary-btn btn-lg w-full mt-4"
              onClick={() => onAuthorizedAccess(authorizedData)}
            >
              <span>ENTRAR NO SISTEMA</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Acesso Negado */}
      <AccessDeniedModal
        isOpen={showDeniedModal}
        cooldownSeconds={settings.cooldownSeconds}
        onRetry={handleRetryAfterDenied}
        onEnrollRedirect={() => {
          setShowDeniedModal(false);
          onNavigateToEnrollment();
        }}
        hasProfile={!!currentProfile}
      />

      {/* Modal de Transparência do Modelo e Segurança */}
      <ModelTransparencyModal
        isOpen={showTransparencyModal}
        onClose={() => setShowTransparencyModal(false)}
      />
    </div>
  );
};
