import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { FaceMeshOverlay } from './FaceMeshOverlay';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { AuthStatusCode, LivenessState } from '../types/face';

interface CameraViewProps {
  status: AuthStatusCode;
  landmarksResult: FaceLandmarkerResult | null;
  liveness: LivenessState;
  showMesh: boolean;
  showTelemetry: boolean;
  isScanning: boolean;
  consecutiveMatches: number;
  requiredMatches: number;
  currentDistance?: number;
  threshold?: number;
  onVideoFrame?: (video: HTMLVideoElement, timestamp: number) => void;
  onCameraError?: (error: string) => void;
  active: boolean;
}

export const CameraView: React.FC<CameraViewProps> = ({
  status,
  landmarksResult,
  liveness,
  showMesh,
  showTelemetry,
  isScanning,
  consecutiveMatches,
  requiredMatches,
  currentDistance,
  threshold,
  onVideoFrame,
  onCameraError,
  active,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStreamReady, setIsStreamReady] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // Encerrar faixas de vídeo de forma limpa
  const stopStream = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreamReady(false);
  };

  // Inicializar câmera
  const startCamera = async (deviceId?: string) => {
    stopStream();
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'API getUserMedia não suportada neste navegador.';
      setErrorMessage(err);
      onCameraError?.(err);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsStreamReady(true);
          }).catch(() => {});
        };
      }

      // Enumerar câmeras disponíveis
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoDevs);
      if (!selectedDeviceId && videoDevs.length > 0) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }
    } catch (err: unknown) {
      console.error('Erro ao acessar a câmera:', err);
      let msg = 'Não foi possível acessar a câmera.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          msg = 'Permissão de acesso à câmera foi recusada. Conceda permissão no navegador para continuar.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          msg = 'Nenhum dispositivo de câmera foi encontrado no sistema.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          msg = 'A câmera já está sendo utilizada por outro aplicativo ou processo.';
        }
      }
      setErrorMessage(msg);
      onCameraError?.(msg);
    }
  };

  useEffect(() => {
    if (active) {
      startCamera(selectedDeviceId || undefined);
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [active, selectedDeviceId]);

  // Loop de processamento de quadros para MediaPipe e FaceAPI
  useEffect(() => {
    let running = true;

    const processLoop = () => {
      if (!running) return;

      if (videoRef.current && isStreamReady && videoRef.current.readyState >= 2) {
        const now = performance.now();
        onVideoFrame?.(videoRef.current, now);
      }

      animFrameRef.current = requestAnimationFrame(processLoop);
    };

    if (isStreamReady && active) {
      animFrameRef.current = requestAnimationFrame(processLoop);
    }

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isStreamReady, active, onVideoFrame]);

  // Trocar de câmera
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    startCamera(id);
  };

  return (
    <div className="camera-viewport-container">
      {/* Moldura Cibernética Externa */}
      <div className={`camera-frame-box status-${status}`}>
        {/* Elemento de Vídeo */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="camera-video-feed"
        />

        {/* Canvas com Overlay de Malha Facial e HUD */}
        {isStreamReady && (
          <FaceMeshOverlay
            landmarksResult={landmarksResult}
            status={status}
            liveness={liveness}
            showMesh={showMesh}
            showTelemetry={showTelemetry}
            isScanning={isScanning}
            consecutiveMatches={consecutiveMatches}
            requiredMatches={requiredMatches}
            currentDistance={currentDistance}
            threshold={threshold}
          />
        )}

        {/* Telas de Estado (Erro / Permissão / Carregamento) */}
        {!isStreamReady && !errorMessage && (
          <div className="camera-overlay-state">
            <div className="cyber-spinner" />
            <p className="state-text">INICIALIZANDO FEED DE VÍDEO SEGURO...</p>
            <span className="state-subtext">Aguardando autorização dos sensores do dispositivo</span>
          </div>
        )}

        {errorMessage && (
          <div className="camera-overlay-state error-state">
            <AlertCircle size={44} className="state-icon text-red" />
            <p className="state-text text-red">FALHA NO SENSOR DE CAPTURA</p>
            <p className="state-description">{errorMessage}</p>
            <button
              type="button"
              className="cyber-btn primary-btn"
              onClick={() => startCamera(selectedDeviceId || undefined)}
            >
              <RefreshCw size={16} />
              TENTAR NOVAMENTE
            </button>
          </div>
        )}

        {/* Cantos Decorativos de Mira HUD */}
        <div className="viewport-hud-bracket top-left" />
        <div className="viewport-hud-bracket top-right" />
        <div className="viewport-hud-bracket bottom-left" />
        <div className="viewport-hud-bracket bottom-right" />

        {/* Indicador de Status da Câmera no Canto Superior Esquerdo */}
        <div className="camera-live-badge">
          <span className={`live-dot ${isStreamReady ? 'pulse-green' : 'pulse-amber'}`} />
          <span className="live-label">
            {isStreamReady ? 'FEED AO VIVO [1080P CRIPTOGRAFADO]' : 'AGUARDANDO CÂMERA'}
          </span>
        </div>
      </div>

      {/* Seletor de Câmera e Controles Rápidos */}
      {availableDevices.length > 1 && (
        <div className="camera-selector-bar">
          <Camera size={14} className="text-cyan" />
          <label htmlFor="cam-select" className="selector-label">Dispositivo:</label>
          <select
            id="cam-select"
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            className="camera-dropdown"
          >
            {availableDevices.map((dev, idx) => (
              <option key={dev.deviceId || idx} value={dev.deviceId}>
                {dev.label || `Câmera ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
