export interface FaceSample {
  id: string;
  stepName: string;
  angle: 'front' | 'left' | 'right' | 'blink';
  descriptor: number[];
  timestamp: string;
  quality: number;
}

export interface FaceProfile {
  id: string;
  name: string;
  role: string;
  createdAt: string;
  samples: FaceSample[];
  averageDescriptor: number[];
  livenessVerified: boolean;
}

export type AuthStatusCode =
  | 'idle'
  | 'initializing'
  | 'positioning'
  | 'no_face'
  | 'multiple_faces'
  | 'analyzing'
  | 'verifying'
  | 'authorized'
  | 'denied'
  | 'cooldown'
  | 'error';

export interface AuthStatusInfo {
  code: AuthStatusCode;
  title: string;
  message: string;
  variant: 'default' | 'info' | 'warning' | 'success' | 'danger';
}

export type RegistrationStepId =
  | 'intro'
  | 'align'
  | 'front'
  | 'turn_left'
  | 'turn_right'
  | 'blink'
  | 'confirm';

export interface RegistrationStepConfig {
  id: RegistrationStepId;
  label: string;
  instruction: string;
  targetAngle?: 'front' | 'left' | 'right' | 'blink';
  checkCriteria?: string;
}

export interface QualityMetrics {
  isCentered: boolean;
  isGoodSize: boolean;
  isGoodLighting: boolean;
  score: number; // 0 to 100
  details: string[];
}

export interface LivenessState {
  blinkCount: number;
  lastBlinkTime: number;
  isBlinking: boolean;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  livenessPassed: boolean;
}

export interface FaceMatchEvaluation {
  isMatch: boolean;
  distance: number;
  similarityScore: number; // 0 - 100%
  threshold: number;
  consecutiveMatches: number;
  requiredMatches: number;
  confidenceGrade: 'EXCELLENT' | 'HIGH' | 'MODERATE' | 'LOW' | 'FAILED';
}

export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  status: 'AUTHORIZED' | 'DENIED' | 'SPOOF_SUSPECTED' | 'MULTIPLE_FACES';
  userName: string;
  similarity: number;
  distance: number;
  livenessScore: number;
  ipMock: string;
  deviceInfo: string;
}

export interface BiometricSettings {
  similarityThreshold: number; // e.g. 0.52 (Euclidean distance)
  consecutiveFramesRequired: number; // e.g. 5
  livenessRequired: boolean;
  cooldownSeconds: number; // e.g. 4
  soundEffects: boolean;
  showMeshOverlay: boolean;
  showHUDTelemetry: boolean;
}
