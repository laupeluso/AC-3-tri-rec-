import React from 'react';
import { ShieldCheck, Cpu, AlertTriangle, Eye, Lock, X } from 'lucide-react';

interface ModelTransparencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelTransparencyModal: React.FC<ModelTransparencyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-container transparency-modal">
        {/* Cabeçalho */}
        <div className="modal-header">
          <div className="header-title-group">
            <Cpu className="text-cyan" size={24} />
            <div>
              <h3 className="modal-title">Arquitetura Biométrica e Limitações do Modelo</h3>
              <p className="modal-subtitle">Documentação técnica e transparência de segurança</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="modal-body custom-scroll">
          {/* Seção 1: Modelos e Extração */}
          <div className="info-card">
            <div className="card-heading">
              <ShieldCheck className="text-cyan" size={18} />
              <h4>1. Extração de Características e Embeddings Faciais</h4>
            </div>
            <p>
              O sistema não utiliza apenas pontos visuais geométricos ou detecção superficial para autenticação. São integradas duas redes neurais distintas:
            </p>
            <ul className="info-list">
              <li>
                <strong>Google MediaPipe FaceLandmarker:</strong> Mapeia 478 pontos tridimensionais (x, y, z) em tempo real a 60 FPS, além de blendshapes faciais para rastreamento de alta fidelidade e pose de cabeça (Yaw, Pitch, Roll).
              </li>
              <li>
                <strong>ResNet-34 Face Recognition Net (VGGFace2):</strong> Rede neural convolucional profunda que processa o corte facial alinhado e gera um <em>embedding</em> biométrico denso de 128 dimensões com normalização L2.
              </li>
            </ul>
          </div>

          {/* Seção 2: Critério de Decisão */}
          <div className="info-card">
            <div className="card-heading">
              <Lock className="text-cyan" size={18} />
              <h4>2. Métrica de Similaridade e Critério de Aceitação</h4>
            </div>
            <p>
              A comparação entre o rosto em tempo real e o perfil cadastrado é computada via <strong>Distância Euclidiana</strong>:
            </p>
            <div className="code-formula">
              <code>d(u, v) = √( ∑ (uᵢ - vᵢ)² )</code>
            </div>
            <ul className="info-list">
              <li>
                <strong>Limiar de Decisão (Threshold):</strong> Configurado por padrão em <code>0.52</code>. Vetores biométricos com distância inferior a esse valor são classificados como compatíveis.
              </li>
              <li>
                <strong>Validação Multi-Frame:</strong> Para evitar falsos positivos momentâneos provocados por ruído ou iluminação transitória, o sistema exige <strong>5 quadros consecutivos</strong> de correspondência positiva estável antes de conceder a autorização.
              </li>
              <li>
                <strong>Cadastro Multi-Amostra:</strong> O cadastro captura amostras frontais, com desvios angulares e piscadas, calculando o centroide e a melhor distância para maior robustez.
              </li>
            </ul>
          </div>

          {/* Seção 3: Vivacidade e Anti-Spoofing */}
          <div className="info-card">
            <div className="card-heading">
              <Eye className="text-cyan" size={18} />
              <h4>3. Detecção de Vivacidade (Anti-Spoofing)</h4>
            </div>
            <p>
              Para mitigar tentativas de fraude por fotos impressas ou vídeos gravados:
            </p>
            <ul className="info-list">
              <li>
                <strong>Análise de Blendshapes Oculares:</strong> Detecta contrações palpebrais (índices <code>eyeBlinkLeft</code> e <code>eyeBlinkRight</code>).
              </li>
              <li>
                <strong>Variação Angular Dinâmica:</strong> O processo de cadastro e verificação exige pequenas variações de ângulo horizontal (Yaw) para comprovar a presença de um volume tridimensional vivo.
              </li>
            </ul>
          </div>

          {/* Seção 4: Limitações Documentadas */}
          <div className="info-card warning-card">
            <div className="card-heading text-amber">
              <AlertTriangle size={18} />
              <h4>4. Limitações Documentadas do Sistema</h4>
            </div>
            <ul className="info-list">
              <li>
                <strong>Ausência de Sensor de Profundidade de Hardware:</strong> Câmeras web comuns utilizam espectro visível (RGB) sem emissão infravermelha ou laser estruturado (ex.: Apple TrueDepth/LiDAR). Ataques de apresentação sofisticados (como máscaras 3D de látex ou telas de altíssima definição) podem apresentar desafios adicionais.
              </li>
              <li>
                <strong>Iluminação Extrema:</strong> Ambientes com sombras muito duras ou superexposição severa podem distorcer o mapa de convoluções e elevar a distância euclidiana temporariamente.
              </li>
              <li>
                <strong>Gêmeos Idênticos:</strong> Redes de embeddings treinadas em VGGFace2 podem apresentar margens reduzidas de discriminação entre irmãos gêmeos univitelinos.
              </li>
              <li>
                <strong>Privacidade Absoluta:</strong> Todos os modelos executam 100% no navegador via WebAssembly e WebGL. Nenhuma imagem facial ou vetor biométrico é transmitido para servidores externos.
              </li>
            </ul>
          </div>
        </div>

        {/* Rodapé */}
        <div className="modal-footer">
          <button type="button" className="cyber-btn primary-btn" onClick={onClose}>
            ENTENDIDO
          </button>
        </div>
      </div>
    </div>
  );
};
