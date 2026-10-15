import React, { useEffect, useRef } from 'react';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { AuthStatusCode, LivenessState } from '../types/face';

interface FaceMeshOverlayProps {
  landmarksResult: FaceLandmarkerResult | null;
  status: AuthStatusCode;
  liveness: LivenessState;
  showMesh: boolean;
  showTelemetry: boolean;
  isScanning: boolean;
  consecutiveMatches: number;
  requiredMatches: number;
  currentDistance?: number;
  threshold?: number;
}

// Conexões simplificadas para malha facial e contornos estéticos
const OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109, 10
];

const LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE_INDICES = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LIPS_INDICES = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];
const NOSE_BRIDGE_INDICES = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];

export const FaceMeshOverlay: React.FC<FaceMeshOverlayProps> = ({
  landmarksResult,
  status,
  liveness,
  showMesh,
  showTelemetry,
  isScanning,
  consecutiveMatches,
  requiredMatches,
  currentDistance,
  threshold = 0.52,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanLinePosRef = useRef<number>(0);
  const scanDirectionRef = useRef<number>(1);
  const lastTimeRef = useRef<number>(performance.now());
  const fpsRef = useRef<number>(60);

  useEffect(() => {
    let animId: number;

    const render = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      if (dt > 0) {
        fpsRef.current = Math.round(1000 / dt);
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      // Sincronizar dimensões do canvas com a resolução real
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Determinar paleta de cores do HUD baseado no estado
      let primaryColor = '#00f2fe'; // Ciano futurista
      let glowColor = 'rgba(0, 242, 254, 0.4)';
      let boxBg = 'rgba(0, 242, 254, 0.04)';

      if (status === 'analyzing' || status === 'verifying') {
        primaryColor = '#ffb703'; // Amarelo de escaneamento
        glowColor = 'rgba(255, 183, 3, 0.5)';
        boxBg = 'rgba(255, 183, 3, 0.06)';
      } else if (status === 'authorized') {
        primaryColor = '#00ff87'; // Verde de acesso concedido
        glowColor = 'rgba(0, 255, 135, 0.6)';
        boxBg = 'rgba(0, 255, 135, 0.08)';
      } else if (status === 'denied' || status === 'multiple_faces') {
        primaryColor = '#ff0055'; // Vermelho de acesso negado
        glowColor = 'rgba(255, 0, 85, 0.6)';
        boxBg = 'rgba(255, 0, 85, 0.08)';
      }

      const hasFace = landmarksResult && landmarksResult.faceLandmarks && landmarksResult.faceLandmarks.length > 0;

      if (hasFace) {
        const landmarks = landmarksResult.faceLandmarks[0];

        // 1. Calcular Bounding Box do rosto
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        for (const pt of landmarks) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }

        // Espelhamento horizontal (a câmera é espelhada)
        // Coordenadas em pixels
        const padX = (maxX - minX) * 0.12;
        const padY = (maxY - minY) * 0.14;

        const leftPx = (1 - (maxX + padX)) * width;
        const rightPx = (1 - (minX - padX)) * width;
        const topPx = Math.max(0, (minY - padY) * height);
        const bottomPx = Math.min(height, (maxY + padY) * height);
        const boxWidth = rightPx - leftPx;
        const boxHeight = bottomPx - topPx;

        // Fundo sutil do enquadramento facial
        ctx.fillStyle = boxBg;
        ctx.fillRect(leftPx, topPx, boxWidth, boxHeight);

        // 2. Desenhar Moldura HUD com cantos angulares cibernéticos
        ctx.strokeStyle = primaryColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 2.5;

        const cornerLen = Math.min(36, boxWidth * 0.22);

        // Canto Superior Esquerdo
        ctx.beginPath();
        ctx.moveTo(leftPx, topPx + cornerLen);
        ctx.lineTo(leftPx, topPx);
        ctx.lineTo(leftPx + cornerLen, topPx);
        ctx.stroke();

        // Canto Superior Direito
        ctx.beginPath();
        ctx.moveTo(rightPx - cornerLen, topPx);
        ctx.lineTo(rightPx, topPx);
        ctx.lineTo(rightPx, topPx + cornerLen);
        ctx.stroke();

        // Canto Inferior Esquerdo
        ctx.beginPath();
        ctx.moveTo(leftPx, bottomPx - cornerLen);
        ctx.lineTo(leftPx, bottomPx);
        ctx.lineTo(leftPx + cornerLen, bottomPx);
        ctx.stroke();

        // Canto Inferior Direito
        ctx.beginPath();
        ctx.moveTo(rightPx - cornerLen, bottomPx);
        ctx.lineTo(rightPx, bottomPx);
        ctx.lineTo(rightPx, bottomPx - cornerLen);
        ctx.stroke();

        // 3. Linha de Escaneamento Laser Animada (Laser Scanline)
        if (isScanning || status === 'analyzing' || status === 'verifying') {
          scanLinePosRef.current += 0.015 * scanDirectionRef.current;
          if (scanLinePosRef.current >= 1) {
            scanLinePosRef.current = 1;
            scanDirectionRef.current = -1;
          } else if (scanLinePosRef.current <= 0) {
            scanLinePosRef.current = 0;
            scanDirectionRef.current = 1;
          }

          const scanY = topPx + boxHeight * scanLinePosRef.current;

          const grad = ctx.createLinearGradient(leftPx, scanY, rightPx, scanY);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(0.2, primaryColor);
          grad.addColorStop(0.5, '#ffffff');
          grad.addColorStop(0.8, primaryColor);
          grad.addColorStop(1, 'rgba(0,0,0,0)');

          ctx.save();
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3;
          ctx.shadowColor = primaryColor;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(leftPx, scanY);
          ctx.lineTo(rightPx, scanY);
          ctx.stroke();

          // Brilho gradiente vertical do feixe
          const beamGrad = ctx.createLinearGradient(0, scanY - 18, 0, scanY);
          beamGrad.addColorStop(0, 'rgba(0, 242, 254, 0)');
          beamGrad.addColorStop(1, glowColor);
          ctx.fillStyle = beamGrad;
          ctx.fillRect(leftPx, scanY - 18, boxWidth, 18);
          ctx.restore();
        }

        // 4. Desenho da Malha Facial (Face Mesh) e Pontos de Referência
        if (showMesh) {
          ctx.shadowBlur = 4;
          ctx.shadowColor = glowColor;
          ctx.lineWidth = 1.2;

          const drawContour = (indices: number[], color: string, closed: boolean = false) => {
            ctx.strokeStyle = color;
            ctx.beginPath();
            let first = true;
            for (const idx of indices) {
              const pt = landmarks[idx];
              if (!pt) continue;
              // Inverter X devido ao espelhamento da webcam
              const px = (1 - pt.x) * width;
              const py = pt.y * height;
              if (first) {
                ctx.moveTo(px, py);
                first = false;
              } else {
                ctx.lineTo(px, py);
              }
            }
            if (closed) ctx.closePath();
            ctx.stroke();
          };

          // Contorno do oval facial
          drawContour(OVAL_INDICES, 'rgba(0, 242, 254, 0.35)', true);
          // Olho Esquerdo e Direito
          drawContour(LEFT_EYE_INDICES, primaryColor, true);
          drawContour(RIGHT_EYE_INDICES, primaryColor, true);
          // Lábios
          drawContour(LIPS_INDICES, 'rgba(0, 242, 254, 0.45)', true);
          // Ponte do Nariz
          drawContour(NOSE_BRIDGE_INDICES, 'rgba(0, 242, 254, 0.4)');

          // Pontos de Referência (Micro-dots discretos)
          ctx.fillStyle = primaryColor;
          const keyIndices = [1, 33, 263, 61, 291, 199, 152, 10, 66, 296, 234, 454];
          for (const idx of keyIndices) {
            const pt = landmarks[idx];
            if (!pt) continue;
            const px = (1 - pt.x) * width;
            const py = pt.y * height;

            ctx.beginPath();
            ctx.arc(px, py, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }

          // Retícula no Nariz Central
          const nosePt = landmarks[1];
          if (nosePt) {
            const nx = (1 - nosePt.x) * width;
            const ny = nosePt.y * height;
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(nx, ny, 7, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // 5. HUD Telemetria no Rosto
        if (showTelemetry) {
          ctx.shadowBlur = 0;
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = primaryColor;

          // Exibir Tag Superior
          const tagText = status === 'authorized' ? 'ALVO VERIFICADO' : status === 'denied' ? 'FALHA DE COMBINAÇÃO' : 'RASTREAMENTO ATIVO';
          ctx.fillText(`[ ${tagText} ]`, leftPx, topPx - 8);

          // Exibir Informações no Rodapé do Rosto
          const livenessTxt = liveness.isBlinking ? 'PISCADA DETECTADA' : `YAW: ${liveness.yawDegrees}° | PITCH: ${liveness.pitchDegrees}°`;
          ctx.fillText(livenessTxt, leftPx, bottomPx + 16);

          if (currentDistance !== undefined) {
            const distTxt = `DISTÂNCIA: ${currentDistance.toFixed(3)} (LIMIAR: ${threshold.toFixed(2)})`;
            ctx.fillText(distTxt, leftPx, bottomPx + 30);
          }
        }
      } else {
        // Se nenhum rosto foi detectado, desenhar guia central pontilhado elegante
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        const rx = width * 0.26;
        const ry = height * 0.34;
        ctx.ellipse(width / 2, height / 2, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // HUD Global - Informações de Canto Superior Direito
      if (showTelemetry) {
        ctx.shadowBlur = 0;
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0, 242, 254, 0.75)';
        ctx.textAlign = 'right';
        ctx.fillText(`FPS: ${fpsRef.current}`, width - 16, 22);
        ctx.fillText(`478 FACIAL LANDMARKS`, width - 16, 36);
        ctx.fillText(`VIVACIDADE: ${liveness.livenessPassed ? 'CONFIRMADA' : 'EM ANÁLISE'}`, width - 16, 50);

        if (requiredMatches > 0) {
          ctx.fillText(`CONSISTÊNCIA: ${consecutiveMatches}/${requiredMatches} FRAMES`, width - 16, 64);
        }
        ctx.textAlign = 'left';
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    landmarksResult,
    status,
    liveness,
    showMesh,
    showTelemetry,
    isScanning,
    consecutiveMatches,
    requiredMatches,
    currentDistance,
    threshold,
  ]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  );
};
