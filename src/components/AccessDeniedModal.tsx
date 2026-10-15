import React, { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, Lock, AlertOctagon } from 'lucide-react';

interface AccessDeniedModalProps {
  isOpen: boolean;
  cooldownSeconds: number;
  onRetry: () => void;
  onEnrollRedirect?: () => void;
  hasProfile: boolean;
}

export const AccessDeniedModal: React.FC<AccessDeniedModalProps> = ({
  isOpen,
  cooldownSeconds,
  onRetry,
  onEnrollRedirect,
  hasProfile,
}) => {
  const [timeLeft, setTimeLeft] = useState(cooldownSeconds);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(cooldownSeconds);
      return;
    }

    setTimeLeft(cooldownSeconds);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, cooldownSeconds]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-container access-denied-modal">
        <div className="denied-icon-container">
          <div className="denied-pulse-ring" />
          <ShieldAlert size={56} className="text-red denied-main-icon" />
        </div>

        <h2 className="denied-title">ACESSO NEGADO</h2>
        <div className="security-tag-danger">PROTOCOLO DE SEGURANÇA ATIVADO</div>

        <p className="denied-message">
          {hasProfile
            ? 'O rosto apresentado não corresponde ao usuário autorizado cadastrado no sistema.'
            : 'Nenhum usuário autorizado cadastrado. É necessário registrar o rosto do proprietário antes de solicitar acesso.'}
        </p>

        <div className="denied-security-note">
          <Lock size={14} className="text-muted" />
          <span>Por questões de privacidade, dados biométricos de referência não são exibidos.</span>
        </div>

        {timeLeft > 0 ? (
          <div className="cooldown-box">
            <AlertOctagon size={18} className="text-amber animate-spin-slow" />
            <span>Intervalo de segurança: Aguarde <strong>{timeLeft}s</strong> para nova tentativa...</span>
          </div>
        ) : (
          <div className="denied-action-group">
            <button
              type="button"
              className="cyber-btn primary-btn retry-btn"
              onClick={onRetry}
            >
              <RefreshCw size={16} />
              TENTAR NOVAMENTE
            </button>

            {!hasProfile && onEnrollRedirect && (
              <button
                type="button"
                className="cyber-btn secondary-btn"
                onClick={onEnrollRedirect}
              >
                CADASTRAR PROPRIETÁRIO
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
