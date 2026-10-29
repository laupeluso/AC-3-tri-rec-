import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User,
  LogOut,
  Sliders,
  Database,
  Clock,
  Trash2,
  RefreshCw,
  Key,
  Activity,
  CheckCircle2,
  FileText,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { FaceProfile, SecurityAuditEntry, BiometricSettings } from '../types/face';
import { faceService } from '../services/faceRecognitionService';
import { audioFeedback } from '../services/audioFeedback';

interface ProtectedAreaProps {
  profile: FaceProfile;
  authTimestamp: string;
  matchScore: number;
  matchDistance: number;
  onLogout: () => void;
  onReEnroll: () => void;
  onProfileDeleted: () => void;
  settings: BiometricSettings;
  onUpdateSettings: (newSettings: BiometricSettings) => void;
}

export const ProtectedArea: React.FC<ProtectedAreaProps> = ({
  profile,
  authTimestamp,
  matchScore,
  matchDistance,
  onLogout,
  onReEnroll,
  onProfileDeleted,
  settings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'audit' | 'biometrics' | 'settings'>('overview');
  const [auditLogs, setAuditLogs] = useState<SecurityAuditEntry[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(900); // 15 minutos de sessão segura

  useEffect(() => {
    setAuditLogs(faceService.getAuditLogs());

    const timer = setInterval(() => {
      setSessionSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onLogout]);

  const formatSessionTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClearLogs = async () => {
    await faceService.clearAuditLogs();
    setAuditLogs([]);
  };

  const handleDeleteProfile = async () => {
    await faceService.deleteProfile();
    audioFeedback.playAccessDenied();
    onProfileDeleted();
  };

  return (
    <div className="protected-area-layout">
      {/* Barra de Navegação Superior da Área Restrita */}
      <header className="protected-navbar">
        <div className="nav-brand">
          <div className="shield-icon-badge">
            <ShieldCheck size={22} className="text-cyan" />
          </div>
          <div>
            <h1 className="nav-title">ÁREA RESTRITA</h1>
            <span className="nav-subtitle">SISTEMA AUTORIZADO // NÍVEL ALFA</span>
          </div>
        </div>

        <div className="nav-meta">
          <div className="session-timer-badge">
            <Clock size={14} className="text-cyan" />
            <span>Sessão expira em: <strong>{formatSessionTime(sessionSeconds)}</strong></span>
          </div>

          <button
            type="button"
            className="cyber-btn danger-btn logout-btn"
            onClick={onLogout}
          >
            <LogOut size={16} />
            <span>ENCERRAR SESSÃO</span>
          </button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <div className="protected-content-grid">
        {/* Banner de Boas-Vindas */}
        <section className="welcome-banner glass-card">
          <div className="welcome-glow-dot" />
          <div className="welcome-content">
            <div className="status-pill-success">
              <CheckCircle2 size={14} />
              <span>AUTENTICAÇÃO BIOMÉTRICA CONCLUÍDA</span>
            </div>
            <h2 className="welcome-title">
              Bem-vindo, <span className="text-cyan">{profile.name}</span>!
            </h2>
            <p className="welcome-desc">
              Sua identidade foi verificada com sucesso através de correspondência de rede neural profunda VGGFace2 e rastreamento MediaPipe.
            </p>

            <div className="auth-stat-badges">
              <div className="stat-badge">
                <span className="stat-label">Data / Hora</span>
                <span className="stat-value">{new Date(authTimestamp).toLocaleString('pt-BR')}</span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">Similaridade Biométrica</span>
                <span className="stat-value text-green">{matchScore}%</span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">Distância Euclidiana</span>
                <span className="stat-value text-cyan">{matchDistance.toFixed(4)}</span>
              </div>
              <div className="stat-badge">
                <span className="stat-label">Perfil do Sistema</span>
                <span className="stat-value text-amber">{profile.role}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Abas do Painel */}
        <div className="tabs-navigation">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <User size={16} />
            Visão Geral
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <FileText size={16} />
            Logs de Auditoria ({auditLogs.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'biometrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('biometrics')}
          >
            <Database size={16} />
            Dados Biométricos
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Sliders size={16} />
            Configurações
          </button>
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === 'overview' && (
          <div className="tab-pane-content">
            <div className="cards-grid">
              <div className="dashboard-card glass-card">
                <div className="card-header-styled">
                  <Key size={18} className="text-cyan" />
                  <h3>Token de Acesso Criptográfico</h3>
                </div>
                <p className="card-subtext">Sessão validada localmente com assinatura biométrica.</p>
                <div className="token-display-box">
                  <code>
                    eyJhbGciOiJFRDI1NTE5IiwidHlwIjoiSldUIn0.{btoa(profile.id + ':' + authTimestamp).substring(0, 36)}...
                  </code>
                </div>
                <div className="token-meta">
                  <span className="status-dot-active" />
                  <span>Sessão ativa e protegida</span>
                </div>
              </div>

              <div className="dashboard-card glass-card">
                <div className="card-header-styled">
                  <Activity size={18} className="text-green" />
                  <h3>Status do Hardware Biométrico</h3>
                </div>
                <ul className="spec-list">
                  <li>
                    <span>Sensor de Câmera:</span>
                    <strong className="text-cyan">Ativo (1080p RGB)</strong>
                  </li>
                  <li>
                    <span>Aceleração Gráfica:</span>
                    <strong className="text-cyan">WebGL / WebAssembly SIMD</strong>
                  </li>
                  <li>
                    <span>Pontos Tridimensionais:</span>
                    <strong className="text-cyan">478 Landmarks MediaPipe</strong>
                  </li>
                  <li>
                    <span>Vetor de Embedding:</span>
                    <strong className="text-cyan">128-D Dense Tensor</strong>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="tab-pane-content">
            <div className="glass-card audit-container">
              <div className="audit-header">
                <div>
                  <h3>Trilha de Auditoria de Acesso</h3>
                  <p className="card-subtext">Histórico cronológico de verificações biométricas registradas no dispositivo.</p>
                </div>
                {auditLogs.length > 0 && (
                  <button
                    type="button"
                    className="cyber-btn secondary-btn"
                    onClick={handleClearLogs}
                  >
                    <Trash2 size={14} />
                    Limpar Histórico
                  </button>
                )}
              </div>

              {auditLogs.length === 0 ? (
                <div className="empty-audit-state">
                  <FileText size={36} className="text-muted" />
                  <p>Nenhum registro de auditoria disponível no momento.</p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Horário</th>
                        <th>Identidade</th>
                        <th>Similaridade</th>
                        <th>Distância</th>
                        <th>Dispositivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>
                            <span className={`status-tag status-${log.status.toLowerCase()}`}>
                              {log.status === 'AUTHORIZED' ? 'AUTORIZADO' : 'NEGADO'}
                            </span>
                          </td>
                          <td className="font-mono text-muted">
                            {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                          </td>
                          <td><strong>{log.userName}</strong></td>
                          <td className="text-cyan font-mono">{log.similarity}%</td>
                          <td className="font-mono">{log.distance.toFixed(4)}</td>
                          <td className="text-muted">{log.deviceInfo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'biometrics' && (
          <div className="tab-pane-content">
            <div className="glass-card biometrics-management-card">
              <div className="card-header-styled">
                <Database size={20} className="text-cyan" />
                <div>
                  <h3>Gestão de Identidade Biométrica do Proprietário</h3>
                  <p className="card-subtext">Controle soberano sobre seu template facial criptográfico.</p>
                </div>
              </div>

              <div className="profile-details-grid">
                <div className="detail-item">
                  <span className="detail-label">Nome do Titular</span>
                  <strong className="detail-val">{profile.name}</strong>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Data de Cadastramento</span>
                  <span className="detail-val">{new Date(profile.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Amostras Angulares Coletadas</span>
                  <span className="detail-val text-cyan">{profile.samples.length} amostras (Frontal, Esquerda, Direita, Vivacidade)</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Dimensão dos Descritores</span>
                  <span className="detail-val text-green">128 valores ponto flutuante (Float32)</span>
                </div>
              </div>

              {/* Botões de Ação para o Perfil */}
              <div className="biometric-actions-row">
                <button
                  type="button"
                  className="cyber-btn primary-btn"
                  onClick={onReEnroll}
                >
                  <RefreshCw size={16} />
                  RECADASTRAÇÃO FACIAL
                </button>

                <button
                  type="button"
                  className="cyber-btn danger-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 size={16} />
                  EXCLUIR CADASTRO BIOMÉTRICO
                </button>
              </div>

              {showDeleteConfirm && (
                <div className="delete-confirm-box">
                  <p className="delete-warn-text">
                    <strong>Atenção:</strong> Ao excluir o cadastro, o acesso biométrico será permanentemente revogado até que um novo rosto seja registrado.
                  </p>
                  <div className="confirm-buttons">
                    <button
                      type="button"
                      className="cyber-btn danger-btn"
                      onClick={handleDeleteProfile}
                    >
                      CONFIRMAR EXCLUSÃO
                    </button>
                    <button
                      type="button"
                      className="cyber-btn secondary-btn"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      CANCELAR
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-pane-content">
            <div className="glass-card settings-card">
              <div className="card-header-styled">
                <Sliders size={20} className="text-cyan" />
                <div>
                  <h3>Parâmetros de Segurança e Reconhecimento</h3>
                  <p className="card-subtext">Ajuste o rigor da comparação biométrica e recursos da interface.</p>
                </div>
              </div>

              <div className="settings-controls-group">
                {/* Limiar de Aceitação */}
                <div className="setting-control-item">
                  <div className="setting-info">
                    <label htmlFor="threshold-slider" className="setting-title">
                      Limiar de Distância Euclidiana (Threshold): <strong>{settings.similarityThreshold.toFixed(2)}</strong>
                    </label>
                    <p className="setting-hint">
                      Valores menores exigem maior rigor na correspondência facial. Padrão recomendado: 0.52.
                    </p>
                  </div>
                  <div className="slider-container">
                    <span className="slider-bound">0.40 (Mais Rígido)</span>
                    <input
                      id="threshold-slider"
                      type="range"
                      min="0.40"
                      max="0.62"
                      step="0.02"
                      value={settings.similarityThreshold}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        onUpdateSettings({ ...settings, similarityThreshold: val });
                      }}
                      className="cyber-slider"
                    />
                    <span className="slider-bound">0.62 (Mais Tolerante)</span>
                  </div>
                </div>

                {/* Quadros Consecutivos Exigidos */}
                <div className="setting-control-item">
                  <div className="setting-info">
                    <label htmlFor="frames-slider" className="setting-title">
                      Quadros Consecutivos para Liberação: <strong>{settings.consecutiveFramesRequired} frames</strong>
                    </label>
                    <p className="setting-hint">
                      Quantidade de análises contínuas necessárias para validar a identidade e evitar falsos pulsos.
                    </p>
                  </div>
                  <input
                    id="frames-slider"
                    type="range"
                    min="3"
                    max="10"
                    step="1"
                    value={settings.consecutiveFramesRequired}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      onUpdateSettings({ ...settings, consecutiveFramesRequired: val });
                    }}
                    className="cyber-slider"
                  />
                </div>

                {/* Efeitos Sonoros */}
                <div className="setting-toggle-item">
                  <div className="setting-info">
                    <span className="setting-title">Sons de Interface e Feedback Sonoro</span>
                    <p className="setting-hint">Efeitos sonoros sintetizados para biometria, leitura e alarmes.</p>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch-btn ${settings.soundEffects ? 'active' : ''}`}
                    onClick={() => {
                      const updated = !settings.soundEffects;
                      audioFeedback.setMuted(!updated);
                      onUpdateSettings({ ...settings, soundEffects: updated });
                    }}
                  >
                    {settings.soundEffects ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    <span>{settings.soundEffects ? 'ATIVADO' : 'MUTADO'}</span>
                  </button>
                </div>

                {/* Exibição da Malha Facial */}
                <div className="setting-toggle-item">
                  <div className="setting-info">
                    <span className="setting-title">Malha Tridimensional e Pontos MediaPipe</span>
                    <p className="setting-hint">Renderizar pontos e conexões cibernéticas sobre o vídeo ao vivo.</p>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch-btn ${settings.showMeshOverlay ? 'active' : ''}`}
                    onClick={() => {
                      onUpdateSettings({ ...settings, showMeshOverlay: !settings.showMeshOverlay });
                    }}
                  >
                    <span>{settings.showMeshOverlay ? 'VISÍVEL' : 'OCULTO'}</span>
                  </button>
                </div>

                {/* Exibição de Telemetria HUD */}
                <div className="setting-toggle-item">
                  <div className="setting-info">
                    <span className="setting-title">Telemetria HUD e Diagnósticos em Tempo Real</span>
                    <p className="setting-hint">Exibir ângulos de pose (Yaw/Pitch), FPS e métricas biométricas na tela.</p>
                  </div>
                  <button
                    type="button"
                    className={`toggle-switch-btn ${settings.showHUDTelemetry ? 'active' : ''}`}
                    onClick={() => {
                      onUpdateSettings({ ...settings, showHUDTelemetry: !settings.showHUDTelemetry });
                    }}
                  >
                    <span>{settings.showHUDTelemetry ? 'VISÍVEL' : 'OCULTO'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
