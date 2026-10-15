import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UserPlus,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Sparkles,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import { CameraView } from './CameraView';
import { faceService } from '../services/faceRecognitionService';
import { audioFeedback } from '../services/audioFeedback';
import type {
  FaceSample,
  FaceProfile,
  AuthStatusCode,
  LivenessState,
  QualityMetrics,
  BiometricSettings,
} from '../types/face';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

interface FaceRegistrationProps {
  onCancel: () => void;
  onRegistrationSuccess: (profile: FaceProfile) => void;
  settings: BiometricSettings;
  existingProfile: FaceProfile | null;
}

type RegStep = 'idle' | 'align' | 'front' | 'turn_left' | 'turn_right' | 'blink' | 'success';

interface StepDescriptor {
  id: RegStep;
  label: string;
  description: string;
  hint: string;
}

const STEPS: StepDescriptor[] = [
  {
    id: 'align',
    label: 'Enquadramento',
    description: 'Centralize seu rosto na moldura e ajuste a iluminação.',
    hint: 'Mantenha uma distância de 40 a 60 cm da câmera.',
  },
  {
    id: 'front',
    label: 'Amostra Frontal',
    description: 'Olhe diretamente para a lente com expressão neutra.',
    hint: 'Segure a posição por 2 segundos...',
  },
  {
    id: 'turn_left',
    label: 'Perfil Esquerdo',
    description: 'Vire ligeiramente a cabeça para a ESQUERDA.',
    hint: 'Gire aproximadamente 15 a 20 graus...',
  },
  {
    id: 'turn_right',
    label: 'Perfil Direito',
    description: 'Agora vire ligeiramente a cabeça para a DIREITA.',
    hint: 'Gire aproximadamente 15 a 20 graus...',
  },
  {
    id: 'blink',
    label: 'Vivacidade Biométrica',
    description: 'Retorne à posição frontal e dê uma piscada com os olhos.',
    hint: 'Validando que você é uma pessoa real e tridimensional...',
  },
];

export const FaceRegistration: React.FC<FaceRegistrationProps> = ({
  onCancel,
  onRegistrationSuccess,
  settings,
  existingProfile,
}) => {
  const [currentStep, setCurrentStep] = useState<RegStep>('idle');
  const [ownerName, setOwnerName] = useState<string>(existingProfile?.name || 'Administrador do Sistema');
  const [showOverwriteWarning, setShowOverwriteWarning] = useState<boolean>(false);
  const [hasConfirmedOverwrite, setHasConfirmedOverwrite] = useState<boolean>(false);

  // Estados biométricos de captura
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
  const [quality, setQuality] = useState<QualityMetrics>({
    isCentered: false,
    isGoodSize: false,
    isGoodLighting: false,
    score: 0,
    details: [],
  });

  const [collectedSamples, setCollectedSamples] = useState<FaceSample[]>([]);
  const collectedSamplesRef = useRef<FaceSample[]>([]);
  const hasBlinkedRef = useRef<boolean>(false);
  const [isProcessingSample, setIsProcessingSample] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Aguardando início do cadastramento...');
  const [authStatus, setAuthStatus] = useState<AuthStatusCode>('idle');

  // Controle de estabilidade de quadro antes de disparar captura
  const stableHoldCountRef = useRef<number>(0);
  const isCapturingRef = useRef<boolean>(false);

  // Inicializar serviços
  useEffect(() => {
    faceService.initialize().catch((err) => {
      console.error('Falha ao inicializar modelos:', err);
      setStatusMessage('Erro ao carregar modelos biométricos.');
    });
  }, []);

  const handleStartEnrollment = () => {
    if (existingProfile && !hasConfirmedOverwrite) {
      setShowOverwriteWarning(true);
      return;
    }
    collectedSamplesRef.current = [];
    hasBlinkedRef.current = false;
    setCollectedSamples([]);
    setCurrentStep('align');
    setAuthStatus('positioning');
    setStatusMessage('Posicione seu rosto dentro da moldura.');
    faceService.resetLiveness();
  };

  const handleConfirmOverwrite = () => {
    setShowOverwriteWarning(false);
    setHasConfirmedOverwrite(true);
    collectedSamplesRef.current = [];
    hasBlinkedRef.current = false;
    setCollectedSamples([]);
    setCurrentStep('align');
    setAuthStatus('positioning');
    setStatusMessage('Posicione seu rosto dentro da moldura.');
    faceService.resetLiveness();
  };

  // Captura do descritor facial a partir do frame de vídeo atual
  const captureCurrentSample = useCallback(async (
    video: HTMLVideoElement,
    stepId: RegStep,
    angle: FaceSample['angle']
  ) => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsProcessingSample(true);
    setAuthStatus('analyzing');

    try {
      const descriptor = await faceService.extractFaceDescriptor(video);
      if (descriptor && descriptor.length === 128) {
        audioFeedback.playStepChime();

        const newSample: FaceSample = {
          id: 'smp_' + Math.random().toString(36).substring(2, 8),
          stepName: stepId,
          angle,
          descriptor: Array.from(descriptor),
          timestamp: new Date().toISOString(),
          quality: quality.score,
        };

        collectedSamplesRef.current.push(newSample);
        const currentList = [...collectedSamplesRef.current];
        setCollectedSamples(currentList);
        console.log(`[FaceID Enrollment] Amostra capturada: ${stepId} (${angle}) - Total: ${currentList.length}/4`);

        // Avançar para a próxima etapa
        if (stepId === 'front') {
          setCurrentStep('turn_left');
          setStatusMessage('Ótimo! Agora vire ligeiramente a cabeça para a esquerda.');
          setAuthStatus('positioning');
        } else if (stepId === 'turn_left') {
          setCurrentStep('turn_right');
          setStatusMessage('Excelente! Agora vire ligeiramente a cabeça para a direita.');
          setAuthStatus('positioning');
        } else if (stepId === 'turn_right') {
          setCurrentStep('blink');
          setStatusMessage('Retorne à posição frontal e dê uma piscada para validar vivacidade.');
          setAuthStatus('positioning');
        } else if (stepId === 'blink') {
          // Todas as amostras capturadas! Finalizar perfil
          console.log('[FaceID Enrollment] Gravando perfil biométrico final com', currentList.length, 'amostras');
          const newProfile = faceService.saveProfile(ownerName, currentList);
          audioFeedback.playSuccessUnlock();
          setCurrentStep('success');
          setAuthStatus('authorized');
          setStatusMessage('Rosto cadastrado com sucesso!');
          onRegistrationSuccess(newProfile);
        }
      } else {
        setStatusMessage('Não foi possível extrair os traços com nitidez. Mantenha-se firme...');
      }
    } catch (e) {
      console.warn('Erro ao capturar amostra:', e);
    } finally {
      stableHoldCountRef.current = 0;
      isCapturingRef.current = false;
      setIsProcessingSample(false);
    }
  }, [ownerName, onRegistrationSuccess, quality.score]);

  // Processamento de cada quadro de vídeo
  const handleVideoFrame = useCallback(
    (video: HTMLVideoElement, timestamp: number) => {
      // 1. Detectar landmarks com MediaPipe
      const result = faceService.detectLandmarksForVideo(video, timestamp);
      setLandmarksResult(result);

      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        setAuthStatus('no_face');
        setStatusMessage('Nenhum rosto detectado. Fique de frente para a câmera.');
        return;
      }

      // 2. Verificar se há mais de um rosto
      if (result.faceLandmarks.length > 1) {
        setAuthStatus('multiple_faces');
        setStatusMessage('Atenção: múltiplos rostos detectados! O cadastro exige apenas uma pessoa.');
        return;
      }

      // 3. Avaliar qualidade de enquadramento
      const q = faceService.assessQuality(video, result);
      setQuality(q);

      // 4. Calcular Vivacidade e Pose da Cabeça
      const liv = faceService.computeLiveness(result);
      setLiveness(liv);

      if (currentStep === 'idle' || currentStep === 'success' || isCapturingRef.current) {
        return;
      }

      // Lógica de avanço guiado por etapas
      if (currentStep === 'align') {
        if (q.isCentered && q.isGoodSize) {
          stableHoldCountRef.current += 1;
          setStatusMessage('Enquadramento ideal! Mantenha a posição...');
          if (stableHoldCountRef.current > 15) {
            stableHoldCountRef.current = 0;
            setCurrentStep('front');
            setStatusMessage('Olhe para a câmera com expressão neutra...');
          }
        } else {
          stableHoldCountRef.current = 0;
          setStatusMessage(q.details[0] || 'Posicione seu rosto dentro da moldura.');
        }
      } else if (currentStep === 'front') {
        // Amostra frontal (Yaw neutro entre -8 e +8 graus)
        if (Math.abs(liv.yawDegrees) <= 8 && q.isCentered) {
          stableHoldCountRef.current += 1;
          if (stableHoldCountRef.current >= 12) {
            captureCurrentSample(video, 'front', 'front');
          }
        } else {
          stableHoldCountRef.current = 0;
        }
      } else if (currentStep === 'turn_left') {
        // Virar ligeiramente para a esquerda (Yaw negativo entre -12 e -35)
        if (liv.yawDegrees <= -12) {
          stableHoldCountRef.current += 1;
          if (stableHoldCountRef.current >= 10) {
            captureCurrentSample(video, 'turn_left', 'left');
          }
        } else {
          stableHoldCountRef.current = 0;
        }
      } else if (currentStep === 'turn_right') {
        // Virar ligeiramente para a direita (Yaw positivo entre +12 e +35)
        if (liv.yawDegrees >= 12) {
          stableHoldCountRef.current += 1;
          if (stableHoldCountRef.current >= 10) {
            captureCurrentSample(video, 'turn_right', 'right');
          }
        } else {
          stableHoldCountRef.current = 0;
        }
      } else if (currentStep === 'blink') {
        // Vivacidade: detectar piscada
        if (liv.isBlinking) {
          hasBlinkedRef.current = true;
          setStatusMessage('Piscada detectada! Abra os olhos e olhe para a câmera...');
        }
        // SOMENTE capturar após piscada comprovada e quando os olhos estiverem ABERTOS de novo
        if (hasBlinkedRef.current && !liv.isBlinking && Math.abs(liv.yawDegrees) <= 10 && q.isCentered) {
          stableHoldCountRef.current += 1;
          if (stableHoldCountRef.current >= 6) {
            captureCurrentSample(video, 'blink', 'front');
          }
        } else if (!hasBlinkedRef.current) {
          setStatusMessage('Dê uma piscada com os olhos para comprovar vivacidade...');
        }
      }
    },
    [currentStep, captureCurrentSample]
  );

  // Cálculo da porcentagem de progresso
  const calculateProgress = () => {
    if (currentStep === 'idle') return 0;
    if (currentStep === 'align') return 15;
    if (currentStep === 'front') return 35;
    if (currentStep === 'turn_left') return 55;
    if (currentStep === 'turn_right') return 75;
    if (currentStep === 'blink') return 90;
    if (currentStep === 'success') return 100;
    return 0;
  };

  return (
    <div className="registration-view-layout">
      {/* Barra Superior */}
      <div className="registration-header-bar">
        <button
          type="button"
          className="cyber-btn secondary-btn back-btn"
          onClick={onCancel}
        >
          <ArrowLeft size={16} />
          VOLTAR
        </button>

        <div className="header-titles">
          <div className="brand-chip">
            <UserPlus size={14} className="text-cyan" />
            <span>MÓDULO DE ENROLAMENTO BIOMÉTRICO</span>
          </div>
          <h1 className="main-title">Cadastrar Meu Rosto</h1>
          <p className="main-subtitle">
            Registro biométrico oficial do proprietário autorizado do sistema
          </p>
        </div>

        <div className="empty-spacer" />
      </div>

      {/* Grid Principal com Câmera e Painel de Etapas */}
      <div className="registration-content-grid">
        {/* Painel Esquerdo: Câmera com Malha Facial */}
        <div className="registration-camera-column">
          <div className="camera-card glass-card">
            <CameraView
              status={authStatus}
              landmarksResult={landmarksResult}
              liveness={liveness}
              showMesh={settings.showMeshOverlay}
              showTelemetry={settings.showHUDTelemetry}
              isScanning={isProcessingSample}
              consecutiveMatches={0}
              requiredMatches={0}
              onVideoFrame={handleVideoFrame}
              active={true}
            />

            {/* Banner Dinâmico de Instrução */}
            <div className={`instruction-banner status-${authStatus}`}>
              <span className="instruction-icon">
                {currentStep === 'success' ? (
                  <CheckCircle2 size={18} className="text-green" />
                ) : authStatus === 'multiple_faces' ? (
                  <AlertCircle size={18} className="text-red" />
                ) : (
                  <Eye size={18} className="text-cyan animate-pulse" />
                )}
              </span>
              <span className="instruction-text">{statusMessage}</span>
            </div>

            {/* Medidor de Qualidade de Captura */}
            <div className="quality-meter-bar">
              <div className="quality-labels">
                <span className="quality-title">Qualidade do Enquadramento:</span>
                <span className="quality-val font-mono">{quality.score}%</span>
              </div>
              <div className="quality-track">
                <div
                  className={`quality-fill ${
                    quality.score >= 70 ? 'bg-green' : quality.score >= 40 ? 'bg-amber' : 'bg-red'
                  }`}
                  style={{ width: `${quality.score}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Painel Direito: Assistente de Etapas e Ações */}
        <div className="registration-wizard-column">
          <div className="wizard-card glass-card">
            {/* Identificação do Titular */}
            <div className="owner-input-group">
              <label htmlFor="owner-name" className="input-label">
                Identificação do Titular / Proprietário:
              </label>
              <input
                id="owner-name"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Ex.: Carlos Silva"
                disabled={currentStep !== 'idle'}
                className="cyber-input"
              />
              <span className="input-helper">
                Este cadastro será configurado como a única chave biométrica autorizada.
              </span>
            </div>

            {/* Barra de Progresso Global */}
            <div className="progress-section">
              <div className="progress-labels">
                <span className="progress-label-title">Progresso do Cadastro:</span>
                <span className="progress-pct font-mono text-cyan">{calculateProgress()}%</span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${calculateProgress()}%` }}
                />
              </div>
            </div>

            {/* Lista Visual de Etapas */}
            <div className="steps-checklist">
              <h3 className="checklist-heading">Etapas de Mapeamento</h3>
              {STEPS.map((step, idx) => {
                const isCompleted =
                  (step.id === 'align' && currentStep !== 'idle' && currentStep !== 'align') ||
                  (step.id === 'front' && collectedSamples.some((s) => s.stepName === 'front')) ||
                  (step.id === 'turn_left' && collectedSamples.some((s) => s.stepName === 'turn_left')) ||
                  (step.id === 'turn_right' && collectedSamples.some((s) => s.stepName === 'turn_right')) ||
                  (step.id === 'blink' && collectedSamples.some((s) => s.stepName === 'blink')) ||
                  currentStep === 'success';

                const isCurrent = currentStep === step.id;

                return (
                  <div
                    key={step.id}
                    className={`step-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`}
                  >
                    <div className="step-indicator">
                      {isCompleted ? (
                        <CheckCircle2 size={16} className="text-green" />
                      ) : (
                        <span className="step-number">{idx + 1}</span>
                      )}
                    </div>
                    <div className="step-info">
                      <div className="step-title-line">
                        <strong className="step-title">{step.label}</strong>
                        {isCurrent && <span className="step-badge-active">EM ANDAMENTO</span>}
                      </div>
                      <p className="step-desc">{isCurrent ? step.hint : step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Ações do Assistente */}
            <div className="wizard-actions-footer">
              {currentStep === 'idle' && (
                <button
                  type="button"
                  className="cyber-btn primary-btn btn-lg pulse-glow"
                  onClick={handleStartEnrollment}
                >
                  <Sparkles size={18} />
                  INICIAR CADASTRO BIOMÉTRICO
                </button>
              )}

              {currentStep !== 'idle' && currentStep !== 'success' && (
                <div className="step-action-buttons">
                  <button
                    type="button"
                    className="cyber-btn secondary-btn"
                    onClick={() => {
                      setCurrentStep('idle');
                      setCollectedSamples([]);
                      setAuthStatus('idle');
                      setStatusMessage('Cadastro cancelado.');
                    }}
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    className="cyber-btn secondary-btn"
                    onClick={handleStartEnrollment}
                  >
                    <RefreshCw size={14} />
                    REINICIAR ETAPAS
                  </button>
                </div>
              )}

              {currentStep === 'success' && (
                <div className="success-action-group">
                  <div className="success-badge-card">
                    <UserCheck size={28} className="text-green" />
                    <div>
                      <h4 className="text-green">Rosto cadastrado com sucesso!</h4>
                      <p className="subtext">
                        {collectedSamples.length} amostras neurais de 128 dimensões registradas com segurança.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="cyber-btn primary-btn btn-lg"
                    onClick={onCancel}
                  >
                    TESTAR AUTENTICAÇÃO AGORA
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Sobrescrita */}
      {showOverwriteWarning && existingProfile && (
        <div className="modal-backdrop">
          <div className="modal-container overwrite-modal">
            <div className="modal-header">
              <div className="header-title-group">
                <AlertCircle size={24} className="text-amber" />
                <h3 className="modal-title">Substituição de Cadastro Existente</h3>
              </div>
            </div>
            <div className="modal-body">
              <p>
                Já existe um rosto registrado no sistema para o usuário{' '}
                <strong className="text-cyan">{existingProfile.name}</strong>, cadastrado em{' '}
                {new Date(existingProfile.createdAt).toLocaleDateString('pt-BR')}.
              </p>
              <p className="mt-2 text-muted">
                Deseja sobrescrever este perfil biométrico pelo novo rosto? O usuário anterior perderá o acesso imediato à Área Restrita.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="cyber-btn primary-btn"
                onClick={handleConfirmOverwrite}
              >
                SIM, SOBRESCREVER
              </button>
              <button
                type="button"
                className="cyber-btn secondary-btn"
                onClick={() => setShowOverwriteWarning(false)}
              >
                CANCELAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
